import { Component, useEffect, useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { FOV_Y_DEG } from '../camera/config';
import type { FramingParams } from '../camera/framing';
import type { CountryRecord, LngLat } from '../data/types';
import { toVec } from '../geo/vec';
import { GlobeController } from './controller';
import { Globe } from './globe';
import { createRenderer, qualityTier, type Backend, type QualityTier } from './renderer';
import { lookAt } from './reveal';
import { loadGlobeTextures } from './textures';

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
  const [fade, setFade] = useState(false);
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
          key={generation}
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
          <GlobeScene controller={controller} generation={generation} onReady={onReady} onCut={() => setFade(true)} />
        </Canvas>
        <div
          onTransitionEnd={() => setFade(false)}
          style={{ position: 'absolute', inset: 0, background: '#000', pointerEvents: 'none', opacity: fade ? 1 : 0, transition: fade ? 'none' : 'opacity 250ms' }}
        />
      </div>
    </Unsupported>
  );
}

function GlobeScene({ controller, generation, onReady, onCut }: { controller: GlobeController; generation: number; onReady?: Props['onReady']; onCut(): void }) {
  const renderer = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer & { userData: { backend: Backend; tier: QualityTier } };
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const [globe, setGlobe] = useState<Globe | null>(null);

  useEffect(() => {
    let alive = true;
    const { backend, tier } = renderer.userData;
    void Promise.all([loadGlobeTextures(renderer, tier), fetch('/data/borders.json').then((r) => r.json() as Promise<LngLat[][]>)]).then(([textures, borders]) => {
      if (!alive) return;
      const g = new Globe('game', { textures, borders });
      controller.attach(g);
      setGlobe(g);
      onReady?.({ backend, tier });
    });
    return () => { alive = false; controller.attach(null); };
  }, [renderer, controller, onReady]);

  useEffect(() => { controller.setViewport({ width: size.width, height: size.height, fovYDeg: FOV_Y_DEG }); }, [controller, size.width, size.height]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug: GlobeDebug = {
      backend: renderer.userData.backend,
      generation,
      frames: 0,
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
    if (pose.cut) onCut();
    if (window.__globe) window.__globe.frames++;
  });

  return globe ? <primitive object={globe.root} /> : null;
}
