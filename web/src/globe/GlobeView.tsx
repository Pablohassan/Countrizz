import { Component, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { FOV_Y_DEG } from '../camera/config';
import type { FramingParams } from '../camera/framing';
import type { CountryRecord, LngLat } from '../data/types';
import { toVec } from '../geo/vec';
import { GlobeController } from './controller';
import { Globe } from './globe';
import { CLOUD_DRIFT_TURNS_PER_S } from './clouds';
import { ImageryCredit } from './credits';
import { createImageSource, loadImageryIndex } from './imagePatch';
import { createPostProcessing, postOptions } from './postprocessing';
import { createRenderer, qualityTier, type Backend, type QualityTier } from './renderer';
import { lookAt } from './reveal';
import { withRetry } from './retry';
import { disposeGlobeTextures, loadGlobeTextures, type GlobeTextures } from './textures';

extend(THREE as unknown as Parameters<typeof extend>[0]);

export interface GlobeHandle {
  flyTo(rec: CountryRecord): Promise<void>;
  prefetch(rec: CountryRecord): void;
  showQuestion(): void;
  answer(kind: 'correct' | 'wrong'): void;
  clear(): void;
  overview(): Promise<void>;
  setIdleSpin(degPerSec: number): void;
}

/** Crochets de test (dev seulement) : backend, recréations du renderer, projection écran, perte simulée du GPU. */
export interface GlobeDebug {
  backend: Backend;
  generation: number;
  frames: number;
  /** Opacité des nuages à la dernière frame. */
  cloudOpacity: number;
  project(p: LngLat): [number, number] | null;
  simulateDeviceLost(): void;
}
declare global { interface Window { __globe?: GlobeDebug } }

interface Props {
  ref?: Ref<GlobeHandle>;
  framing?: FramingParams;
  onReady?(info: { backend: Backend; tier: QualityTier }): void;
}

class Unsupported extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p className="globe-unsupported">Ton navigateur ne peut pas afficher le globe : il faut WebGPU ou WebGL 2.</p>
      : this.props.children;
  }
}

/** Globe plein cadre : R3F habille `Globe` ; l'état (caméra, pays, patchs) vit dans `GlobeController`. */
export function GlobeView({ ref, framing, onReady }: Props) {
  const [controller] = useState(() => new GlobeController('/', matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [generation, setGeneration] = useState(0);
  // Mouvement réduit (spec §5 : fondu + coupe) : chaque coupe relance un voile noir qui s'efface en 250 ms.
  const [cuts, setCuts] = useState(0);
  // Textures globales ou frontières introuvables après les nouvelles tentatives : message et « Réessayer ».
  const [loadError, setLoadError] = useState<string | null>(null);
  const forceWebGL = new URLSearchParams(location.search).has('webgl');

  useEffect(() => { if (framing) controller.setFraming(framing); }, [controller, framing]);
  useImperativeHandle(ref, () => ({
    flyTo: (rec) => controller.flyTo(rec),
    prefetch: (rec) => controller.prefetch(rec),
    showQuestion: () => controller.showQuestion(performance.now()),
    answer: (kind) => controller.answer(kind, performance.now()),
    clear: () => controller.clear(),
    overview: () => controller.director.flyToOverview(),
    setIdleSpin: (d) => controller.director.setIdleSpin(d),
  }), [controller]);

  return (
    <Unsupported>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Canvas
          key={`gl-${generation}`}
          flat
          dpr={[1, 2]}
          camera={{ fov: FOV_Y_DEG, near: 0.001, far: 100 }}
          gl={async (props) => {
            const info = await createRenderer(props.canvas as HTMLCanvasElement, { forceWebGL });
            const tier = qualityTier({ backend: info.backend, coarsePointer: matchMedia('(pointer: coarse)').matches, maxTexture2D: info.maxTexture2D });
            // Perte du GPU : on recrée le renderer (nouveau Canvas) ; le contrôleur garde la partie.
            info.renderer.onDeviceLost = () => setGeneration((g) => g + 1);
            Object.assign(info.renderer, { userData: { backend: info.backend, tier } });
            return info.renderer;
          }}
        >
          <GlobeScene controller={controller} generation={generation} onReady={onReady} onError={(e) => setLoadError(String(e))} onCut={() => setCuts((c) => c + 1)} />
        </Canvas>
        {loadError && (
          <div role="alert" title={loadError} style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', gap: 12, color: '#f7dc6f', background: '#16173a', textAlign: 'center', fontFamily: 'sans-serif' }}>
            <p>Le globe n’a pas pu se charger (réseau ?).</p>
            <button onClick={() => { setLoadError(null); setGeneration((g) => g + 1); }}>Réessayer</button>
          </div>
        )}
        <ImageryCredit />
        <style>{'@keyframes countrizz-cut { from { opacity: 1 } to { opacity: 0 } }'}</style>
        <div
          key={`cut-${cuts}`}
          style={{ position: 'absolute', inset: 0, background: '#000', pointerEvents: 'none', opacity: 0, animation: cuts > 0 ? 'countrizz-cut 250ms ease-out' : 'none' }}
        />
      </div>
    </Unsupported>
  );
}

function GlobeScene({ controller, generation, onReady, onError, onCut }: { controller: GlobeController; generation: number; onReady?: Props['onReady']; onError(e: unknown): void; onCut(): void }) {
  const renderer = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer & { userData: { backend: Backend; tier: QualityTier } };
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene) as unknown as THREE.Scene;
  const size = useThree((s) => s.size);
  const [globe, setGlobe] = useState<Globe | null>(null);
  const [post, setPost] = useState<ReturnType<typeof createPostProcessing> | null>(null);
  // onReady passe par une ref : un parent qui le donne en flèche inline ne doit pas reconstruire le globe à chaque rendu.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let alive = true;
    let built: { globe: Globe; textures: GlobeTextures } | null = null;
    const { backend, tier } = renderer.userData;
    const loadBorders = async () => {
      const r = await fetch('/data/borders.json');
      if (!r.ok) throw new Error(`borders.json : HTTP ${r.status}`);
      return (await r.json()) as LngLat[][];
    };
    void withRetry(() => Promise.all([loadGlobeTextures(renderer, tier), loadBorders()]), { attempts: 3, delayMs: 800 }).then(([textures, borders]) => {
      if (!alive) { disposeGlobeTextures(textures); return; }
      const g = new Globe('game', { textures, borders });
      built = { globe: g, textures };
      controller.attach(g);
      setGlobe(g);
      onReadyRef.current?.({ backend, tier });
    }, (e: unknown) => { if (alive) onErrorRef.current(e); });
    return () => {
      alive = false;
      controller.attach(null);
      if (built) { built.globe.dispose(); disposeGlobeTextures(built.textures); }
    };
  }, [renderer, controller]);

  // Post-traitement (spec §4.1) : un par renderer ; recréé avec lui après une perte du GPU.
  useEffect(() => {
    const p = createPostProcessing(renderer, scene, camera, postOptions(renderer.userData.tier));
    setPost(p);
    return () => { setPost(null); p.dispose(); };
  }, [renderer, scene, camera]);

  // Patchs image (Sentinel-2) : facultatifs — sans index ni fichier, la texture globale suffit.
  useEffect(() => {
    let alive = true;
    const source = createImageSource(renderer, renderer.userData.tier);
    void loadImageryIndex().then((index) => { if (alive) controller.setImagery(index, source); });
    return () => {
      alive = false;
      controller.setImagery(null, null);
      source.dispose();
    };
  }, [renderer, controller]);

  useEffect(() => { controller.setViewport({ width: size.width, height: size.height, fovYDeg: FOV_Y_DEG }); }, [controller, size.width, size.height]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug: GlobeDebug = {
      backend: renderer.userData.backend,
      generation,
      frames: 0,
      cloudOpacity: 1,
      project(p) {
        const v = new THREE.Vector3(...toVec(p));
        if (v.dot(camera.position) <= 1) return null;
        v.project(camera);
        return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
      },
      simulateDeviceLost: () => renderer.onDeviceLost({ api: 'WebGPU', message: 'test', reason: null, originalEvent: null }),
    };
    window.__globe = debug;
  }, [renderer, camera, size.width, size.height, generation]);

  useFrame(() => {
    if (!globe) return;
    const now = performance.now();
    const pose = controller.director.update(now);
    globe.setLook(lookAt(controller.timeline, now));
    globe.setTime(now / 1000);
    globe.applyPose(pose, camera);
    const clouds = controller.cloudOpacityAt(now);
    // Mouvement réduit : les nuages ne dérivent pas.
    globe.setClouds(clouds, controller.reducedMotion ? 0 : (now / 1000) * CLOUD_DRIFT_TURNS_PER_S);
    if (pose.cut) onCut();
    if (post) post.render();
    else renderer.render(scene, camera);
    if (window.__globe) { window.__globe.frames++; window.__globe.cloudOpacity = clouds; }
  }, 1); // priorité 1 : R3F ne rend plus lui-même, la boucle passe par le post-traitement

  return globe ? <primitive object={globe.root} /> : null;
}
