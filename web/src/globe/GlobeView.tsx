import { Component, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { FOV_Y_DEG } from '../camera/config';
import type { FlightTicket } from '../camera/director';
import type { FramingParams } from '../camera/framing';
import type { SafeArea } from '../camera/safeArea';
import { sunDirection } from '../camera/sun';
import type { CountryRecord, LngLat } from '../data/types';
import { toLngLat, toVec } from '../geo/vec';
import type { Messages } from '../i18n';
import { fr } from '../i18n/fr';
import { GlobeController } from './controller';
import { Globe } from './globe';
import { CLOUD_DRIFT_TURNS_PER_S } from './clouds';
import { createAccessoryHost, type Accessory } from './accessories';
import { ImageryCredit, type CreditPlacement } from './credits';
import { LoadErrorCard } from './LoadErrorCard';
import { MeasureOverlay } from './MeasureOverlay';
import { OffsetCamera } from './offsetCamera';
import type { ScreenPoint } from './project';
import { createDprGovernor, dprOptions } from './dynamicResolution';
import { effectiveTier, isUncompressed, maxDegradation, nextDegradation, type Degradation, type MeasureState } from './fallback';
import { createImageSource, loadImageryIndex } from './imagePatch';
import { createProgress } from './loading';
import { cachesReady } from '../pwa/cache';
import { createPostProcessing, postOptions } from './postprocessing';
import { createRenderer, qualityTier, type Backend, type QualityTier } from './renderer';
import { lookAt } from './reveal';
import { withRetry } from './retry';
import { disposeGlobeTextures, loadDayNight, loadGlobeTextures, loadReliefGrid, type GlobeTextures } from './textures';

extend(THREE as unknown as Parameters<typeof extend>[0]);

export interface GlobeHandle {
  /** Vole vers le pays : `durationMs` (le 3-2-1 s'y règle) ; `arrived` à true à l'arrivée, false si remplacé. */
  flyTo(rec: CountryRecord): FlightTicket;
  prefetch(rec: CountryRecord): void;
  showQuestion(): void;
  answer(kind: 'correct' | 'wrong'): void;
  clear(): void;
  overview(): FlightTicket;
  /** Vue d'accueil « lever de Terre » (camera/home.ts). */
  home(): FlightTicket;
  setIdleSpin(degPerSec: number): void;
  /** Bandes occupées par l'interface (px CSS) : le pays se cadre et se centre dans la zone libre (D1) ; `null` : tout l'écran. */
  setSafeArea(a: SafeArea | null): void;
  /** Position écran d'un point du sol à la dernière image (px CSS) ; `null` avant la première image ou derrière la caméra. */
  project(p: LngLat): ScreenPoint | null;
  /** Appelé à chaque image, pose posée, avant le rendu : les calques DOM s'y recalent. Rend la désinscription. */
  onFrame(cb: () => void): () => void;
  /** Après une erreur (chargement, recréation) : nouvel essai complet. */
  retry(): void;
  /** Objet de scène (avion de l'accueil, 2A-6), recréé avec le renderer. Rend le retrait. */
  mount(a: Accessory): () => void;
}

/** Crochets de test (dev, ou drapeau des e2e) : backend, recréations du renderer, projection écran, perte simulée du GPU. */
export interface GlobeDebug {
  backend: Backend;
  generation: number;
  frames: number;
  /**
   * Rendus tombés dans une trame de three déjà rendue : la passe de scène n'est rendue qu'une fois par trame (`PassNode`,
   * `NodeFrame.frameId`), un second rendu montre une image périmée (skill threejs-r186-webgpu-tsl, règle 3). Doit rester à 0.
   */
  staleFrames: number;
  /** Opacité des nuages à la dernière frame. */
  cloudOpacity: number;
  /** Densité de pixels du renderer. */
  dpr(): number;
  /** Remplace le temps de frame vu par la résolution dynamique (contrôles headless). */
  frameMsOverride?: number;
  project(p: LngLat): [number, number] | null;
  /** Point visé (sous l'axe de la caméra) à la dernière image. */
  view(): LngLat | null;
  simulateDeviceLost(): void;
  /** La prochaine création du renderer échoue (contrôle de la recréation en échec après une perte du GPU). */
  failNextRenderer?: boolean;
  /** Niveau effectif, repli en cours de partie (spec zoom §5 bis) et TRAA actif. */
  quality(): { tier: QualityTier; degradation: Degradation; traa: boolean };
  /** Plus grande texture 2D du GPU (le niveau haute en dépend). */
  maxTexture2D: number;
  /** La balise est-elle dessinée ? */
  beacon(): boolean;
  /** Paire de niveaux de photos posée à la dernière image (spec zoom §4.3) ; `null` : aucune photo. */
  imageSlots(): { coarse: number | null; fine: number | null; fineOpacity: number } | null;
}
declare global { interface Window { __globe?: GlobeDebug } }

/**
 * Hors dev, les crochets ne s'installent que si le navigateur porte le drapeau des e2e (posé par Playwright via
 * `storageState`, e2e sur la version déployée, 09/10/2026) : un visiteur ne les a jamais.
 */
export const E2E_FLAG = 'countrizz:e2e';
const e2eHooks = (): boolean => { try { return localStorage.getItem(E2E_FLAG) === '1'; } catch { return false; } };

interface Props {
  ref?: Ref<GlobeHandle>;
  framing?: FramingParams;
  onReady?(info: { backend: Backend; tier: QualityTier }): void;
  /** Démarrer sur la vue d'accueil (pose immédiate, sans vol). */
  startAtHome?: boolean;
  /**
   * `false` : aucune image (l'intro joue par-dessus et garde le GPU) ; le globe se charge quand même et une seule image
   * est rendue une fois prêt, pour compiler ses shaders avant le fondu. Par défaut `true`.
   */
  active?: boolean;
  /** Inactif : compiler maintenant (une image) ; l'appelant le demande peu avant le fondu, pas pendant l'intro. */
  warmUp?: boolean;
  /** Progression du chargement des fichiers du globe, 0 à 1 (écran de chargement, D15) ; repart de 0 à chaque essai. */
  onLoading?(progress: number): void;
  /** Le GPU a été perdu : le renderer se recrée (`onReady` suivra, ou `onError` « lost »). */
  onLost?(): void;
  /** Le globe ne viendra pas (sans nouvel essai, `retry`) : l'appelant ne l'attend plus et peut montrer ses écrans (D16). */
  onError?(e: GlobeError): void;
  /** Textes de l'interface d'erreur intégrée (catalogue `errors`) ; défaut : français. */
  texts?: Messages['errors'];
  /** `false` : pas d'interface d'erreur intégrée, l'appelant affiche la sienne sur `onError`. Par défaut `true`. */
  errorUi?: boolean;
  /** Place du crédit de l'imagerie (D2). */
  credit?: CreditPlacement;
}

/** `unsupported` : ni WebGPU ni WebGL 2 ; `load` : textures ou frontières introuvables ; `lost` : recréation après une perte du GPU en échec. */
export type GlobeErrorReason = 'unsupported' | 'load' | 'lost';
export interface GlobeError { reason: GlobeErrorReason; detail: string }

/**
 * Frontière d'erreur du renderer : à la première création, navigateur incompatible ; après une perte du GPU (`lost()`),
 * la recréation a échoué — carte « Réessayer », pas « navigateur incompatible » (revue finale 2A-4).
 */
class Unsupported extends Component<{ children: ReactNode; ui: boolean; texts: Messages['errors']; lost(): boolean; onRetry(): void; onFailed(detail: string): void }, { failed: boolean; detail: string }> {
  state = { failed: false, detail: '' };
  static getDerivedStateFromError(e: unknown) { return { failed: true, detail: String(e) }; }
  componentDidCatch(e: unknown) { this.props.onFailed(String(e)); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (!this.props.ui) return null;
    const t = this.props.texts;
    if (this.props.lost()) return <LoadErrorCard texts={t} detail={this.state.detail} onRetry={this.props.onRetry} />;
    return <div className="globe-unsupported" role="alert"><p>{t.unsupportedTitle}</p><p>{t.unsupportedHint}</p></div>;
  }
}

/** Globe plein cadre : R3F habille `Globe` ; l'état (caméra, pays, patchs) vit dans `GlobeController`. */
export function GlobeView({ ref, framing, onReady, startAtHome = false, active = true, warmUp = false, onLoading, onLost, onError, texts = fr.errors, errorUi = true, credit }: Props) {
  const [controller] = useState(() => new GlobeController('/', matchMedia('(prefers-reduced-motion: reduce)').matches, undefined, startAtHome));
  const [generation, setGeneration] = useState(0);
  // Caméra décentrée (zone libre, D1) : une par GlobeView, réutilisée par les Canvas recréés après une perte du GPU.
  const [camera] = useState(() => new OffsetCamera(FOV_Y_DEG, 1, 0.001, 100));
  // Mouvement réduit relu à chaud (spec 2A §5.7) : le réglage du système peut changer pendant la visite.
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => controller.setReducedMotion(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [controller]);
  // Mouvement réduit (spec §5 : fondu + coupe) : chaque coupe relance un voile noir qui s'efface en 250 ms.
  const [cuts, setCuts] = useState(0);
  // Textures globales ou frontières introuvables après les nouvelles tentatives : message et « Réessayer ».
  const [loadError, setLoadError] = useState<string | null>(null);
  // Densité de pixels : celle de la résolution dynamique, en prop du Canvas — R3F réapplique sa prop `dpr` à chaque
  // re-rendu, et une valeur posée par setDpr à côté était écrasée (03/10, revue finale). Renderer recréé : on repart de [1, 2].
  const [dpr, setDprProp] = useState<number | [number, number]>([1, 2]);
  const regenerate = () => { setDprProp([1, 2]); setGeneration((g) => g + 1); };
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  // Signaux par ref : un parent qui les donne en flèches inline ne doit pas recréer le renderer.
  const signals = useRef({ onError, onLoading, onLost });
  signals.current = { onError, onLoading, onLost };
  // Perte du GPU en cours de traitement : une erreur du renderer d'ici au prochain `onReady` vient de sa recréation.
  const recreating = useRef(false);
  const fail = (e: GlobeError) => signals.current.onError?.(e);
  const retry = () => { setLoadError(null); regenerate(); };
  // Repli de qualité en cours de partie (spec zoom §5 bis) : tenu ici, il survit à la recréation du renderer (perte du
  // GPU) et ne remonte jamais pendant la visite.
  const [degradation, setDegradation] = useState<Degradation>('aucune');
  const events = useRef<MeasureState['events']>([]);
  const measure = useRef<MeasureState | null>(null);
  const onDegrade = useCallback((d: Degradation, reason: 'lenteur' | 'format') => {
    setDegradation((cur) => {
      const next = maxDegradation(cur, d);
      if (next !== cur) events.current = [...events.current, { step: next, atS: performance.now() / 1000, reason }];
      return next;
    });
  }, []);
  const readMeasure = useCallback(() => measure.current, []);

  useEffect(() => { if (framing) controller.setFraming(framing); }, [controller, framing]);
  useImperativeHandle(ref, () => ({
    flyTo: (rec) => controller.flyTo(rec),
    prefetch: (rec) => controller.prefetch(rec),
    showQuestion: () => controller.showQuestion(performance.now()),
    answer: (kind) => controller.answer(kind, performance.now()),
    clear: () => controller.clear(),
    overview: () => controller.director.flyToOverview(),
    home: () => controller.director.flyToHome(),
    setIdleSpin: (d) => controller.director.setIdleSpin(d),
    setSafeArea: (a) => controller.setSafeArea(a),
    project: (p) => controller.project(p),
    onFrame: (cb) => controller.onFrame(cb),
    retry,
    mount: (a) => controller.mount(a),
  }), [controller]); // eslint-disable-line react-hooks/exhaustive-deps -- retry ne touche que des setters stables

  return (
    <Unsupported key={generation} ui={errorUi} texts={texts} lost={() => recreating.current} onRetry={retry}
      onFailed={(detail) => fail({ reason: recreating.current ? 'lost' : 'unsupported', detail })}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Canvas
          key={`gl-${generation}`}
          flat
          dpr={dpr}
          camera={camera}
          gl={async (props) => {
            if (window.__globe?.failNextRenderer) { window.__globe.failNextRenderer = false; throw new Error('test : création du renderer en échec'); }
            const info = await createRenderer(props.canvas as HTMLCanvasElement, { forceWebGL });
            const tier = qualityTier({ backend: info.backend, maxTexture2D: info.maxTexture2D });
            // Perte du GPU : on recrée le renderer (nouveau Canvas) ; le contrôleur garde la partie.
            info.renderer.onDeviceLost = () => { recreating.current = true; signals.current.onLost?.(); regenerate(); };
            Object.assign(info.renderer, { userData: { backend: info.backend, tier, maxTexture2D: info.maxTexture2D } });
            return info.renderer;
          }}
        >
          <GlobeScene controller={controller} generation={generation} active={active} warmUp={warmUp} onReady={(info) => { recreating.current = false; onReady?.(info); }}
            onLoading={(p) => signals.current.onLoading?.(p)}
            onError={(e) => { setLoadError(String(e)); fail({ reason: 'load', detail: String(e) }); }} onCut={() => setCuts((c) => c + 1)} onDpr={setDprProp}
            degradation={degradation} onDegrade={onDegrade} events={events} measure={measure} />
        </Canvas>
        {loadError && errorUi && <LoadErrorCard texts={texts} detail={loadError} onRetry={retry} />}
        <ImageryCredit placement={credit} />
        {new URLSearchParams(location.search).has('mesure') && <MeasureOverlay read={readMeasure} />}
        <style>{'@keyframes countrizz-cut { from { opacity: 1 } to { opacity: 0 } }'}</style>
        <div
          key={`cut-${cuts}`}
          style={{ position: 'absolute', inset: 0, background: '#000', pointerEvents: 'none', opacity: 0, animation: cuts > 0 ? 'countrizz-cut 250ms ease-out' : 'none' }}
        />
      </div>
    </Unsupported>
  );
}

interface SceneProps {
  controller: GlobeController; generation: number; active: boolean; warmUp: boolean; onReady?: Props['onReady'];
  onLoading(p: number): void; onError(e: unknown): void; onCut(): void; onDpr(dpr: number): void;
  /** Repli en cours (tenu par GlobeView) ; `onDegrade` le fait avancer, `events` l'historise, `measure` nourrit l'encart. */
  degradation: Degradation; onDegrade(d: Degradation, reason: 'lenteur' | 'format'): void;
  events: { current: MeasureState['events'] }; measure: { current: MeasureState | null };
}

function GlobeScene({ controller, generation, active, warmUp, onReady, onLoading, onError, onCut, onDpr, degradation, onDegrade, events, measure }: SceneProps) {
  const renderer = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer & { userData: { backend: Backend; tier: QualityTier; maxTexture2D: number } };
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene) as unknown as THREE.Scene;
  const size = useThree((s) => s.size);
  const [globe, setGlobe] = useState<Globe | null>(null);
  // les crochets de test lisent le globe par une ref : recréer window.__globe quand il devient prêt effacerait ce qu'un
  // test y a posé (failNextRenderer, frameMsOverride)
  const globeRef = useRef<Globe | null>(null);
  globeRef.current = globe;
  const [post, setPost] = useState<ReturnType<typeof createPostProcessing> | null>(null);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const advance = useThree((s) => s.advance);
  // Niveau effectif : celui du renderer, moins le repli en cours (spec zoom §5 bis).
  const tier = effectiveTier(renderer.userData.tier, degradation);
  const traa = degradation === 'aucune' && renderer.userData.tier === 'haute';
  const degradationRef = useRef(degradation);
  degradationRef.current = degradation;
  const qualityRef = useRef({ tier, degradation, traa });
  qualityRef.current = { tier, degradation, traa };
  // Résolution dynamique pour les deux niveaux (spec zoom §5) : au plancher et encore lente, elle déclenche le repli.
  const governor = useMemo(() => createDprGovernor(dprOptions(window.devicePixelRatio)), [renderer]);
  // Textures chargées et leur niveau : le repli 8K → 4K remplace jour et nuit sans reconstruire le globe.
  const builtRef = useRef<{ globe: Globe; textures: GlobeTextures; tier: QualityTier } | null>(null);

  // Onglet caché ou globe inactif (l'intro joue par-dessus) : plus aucune frame (spec §6.6) ; la boucle reprend ensuite.
  useEffect(() => {
    const onVisibility = () => setFrameloop(document.visibilityState === 'hidden' || !active ? 'never' : 'always');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setFrameloop, active]);
  // Inactif, prêt, et l'appelant le demande (peu avant le fondu, pas pendant la toupie de l'intro : la compilation bloque
  // le fil principal) : une image, pour que shaders et textures soient sur le GPU avant le fondu.
  useEffect(() => {
    if (!active && warmUp && globe && post) advance(performance.now());
  }, [active, warmUp, globe, post, advance]);
  // onReady passe par une ref : un parent qui le donne en flèche inline ne doit pas reconstruire le globe à chaque rendu.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onLoadingRef = useRef(onLoading);
  onLoadingRef.current = onLoading;
  const lastFrame = useRef(-1);

  useEffect(() => {
    let alive = true;
    // après une recréation qui suit un repli, directement en 4K
    const { backend } = renderer.userData;
    const loadTier = tier;
    const loadBorders = async () => {
      const r = await fetch('/data/borders.json');
      if (!r.ok) throw new Error(`borders.json : HTTP ${r.status}`);
      return (await r.json()) as LngLat[][];
    };
    // chaque essai repart de 0 : 5 textures et les frontières (soulevées par la grille du relief, facultative)
    const attempt = () => {
      const progress = createProgress(6, (p) => onLoadingRef.current(p));
      return Promise.all([
        loadGlobeTextures(renderer, loadTier, '/', (i, f) => progress.update(i, f)),
        loadBorders().finally(() => progress.update(5, 1)),
        loadReliefGrid('/'),
      ]);
    };
    // ménage des caches d'abord : une texture changée ne doit pas venir de l'ancienne copie (spec océan §3)
    void cachesReady().then(() => withRetry(attempt, { attempts: 3, delayMs: 800 })).then(([textures, borders, relief]) => {
      if (!alive) { disposeGlobeTextures(textures); return; }
      const g = new Globe('game', { textures, borders, relief });
      builtRef.current = { globe: g, textures, tier: loadTier };
      controller.attach(g);
      setGlobe(g);
      onReadyRef.current?.({ backend, tier: loadTier });
      // le transcodeur est retombé sur du RGBA : la 8K coûterait quatre fois la mémoire prévue (spec zoom §5 bis)
      if (loadTier === 'haute' && isUncompressed(textures.day)) onDegrade('standard', 'format');
    }, (e: unknown) => { if (alive) onErrorRef.current(e); });
    return () => {
      alive = false;
      controller.attach(null);
      const b = builtRef.current;
      builtRef.current = null;
      if (b) { b.globe.dispose(); disposeGlobeTextures(b.textures); }
    };
  }, [renderer, controller]); // eslint-disable-line react-hooks/exhaustive-deps -- le niveau ne compte qu'au chargement : un repli remplace jour et nuit plus bas

  // Repli 8K → 4K en cours de partie (spec zoom §5 bis) : jour et nuit seuls, sans recréer le renderer ni le globe ; en
  // échec, la 8K reste et la partie continue.
  useEffect(() => {
    const b = builtRef.current;
    if (tier !== 'standard' || !globe || !b || b.globe !== globe || b.tier !== 'haute') return;
    let alive = true;
    loadDayNight(renderer, 'standard').then(([day, night]) => {
      const cur = builtRef.current;
      if (!alive || !cur || cur.globe !== globe) { day.dispose(); night.dispose(); return; }
      const [oldDay, oldNight] = [cur.textures.day, cur.textures.night];
      globe.setDayNight(day, night);
      oldDay.dispose();
      oldNight.dispose();
      builtRef.current = { ...cur, textures: { ...cur.textures, day, night }, tier: 'standard' };
    }, (e: unknown) => console.warn('repli 4K : jour et nuit non chargés, la 8K reste', e));
    return () => { alive = false; };
  }, [tier, globe, renderer]);

  // Accessoires (avion de l'accueil) : un hôte par scène, donc par renderer ; recréés après une perte du GPU.
  const host = useMemo(() => createAccessoryHost(scene), [scene]);
  useEffect(() => {
    if (!globe) return;
    const sync = () => host.sync(controller.accessories());
    sync();
    const off = controller.onAccessories(sync);
    return () => { off(); host.dispose(); };
  }, [globe, host, controller]);

  // Post-traitement (spec §4.1) : un par renderer ; recréé avec lui après une perte du GPU, et au repli (TRAA coupé dès
  // le premier, spec zoom §5 bis).
  useEffect(() => {
    const p = createPostProcessing(renderer, scene, camera, postOptions(degradation === 'aucune' ? renderer.userData.tier : 'standard'));
    setPost(p);
    return () => { setPost(null); p.dispose(); };
  }, [renderer, scene, camera, degradation]);

  // Photos emboîtées (Sentinel-2) : facultatives — sans index ni fichier, la texture globale suffit. Au repli en
  // standard, les 2048 sont retirées puis remplacées par les 1024.
  useEffect(() => {
    let alive = true;
    const source = createImageSource(renderer, tier);
    void loadImageryIndex().then((index) => { if (alive) controller.setImagery(index, source); });
    return () => {
      alive = false;
      controller.setImagery(null, null);
      source.dispose();
    };
  }, [renderer, controller, tier]);

  useEffect(() => { controller.setViewport({ width: size.width, height: size.height, fovYDeg: FOV_Y_DEG }); }, [controller, size.width, size.height]);

  useEffect(() => {
    if (!import.meta.env.DEV && !e2eHooks()) return;
    const debug: GlobeDebug = {
      backend: renderer.userData.backend,
      generation,
      frames: 0,
      staleFrames: 0,
      cloudOpacity: 1,
      dpr: () => renderer.getPixelRatio(),
      project(p) {
        const v = new THREE.Vector3(...toVec(p));
        if (v.dot(camera.position) <= 1) return null;
        v.project(camera);
        return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
      },
      view: () => (controller.pose ? toLngLat(controller.pose.dir) : null),
      simulateDeviceLost: () => renderer.onDeviceLost({ api: 'WebGPU', message: 'test', reason: null, originalEvent: null }),
      quality: () => qualityRef.current,
      maxTexture2D: renderer.userData.maxTexture2D,
      beacon: () => globeRef.current?.beaconShown ?? false,
      imageSlots: () => controller.imageSlots,
    };
    window.__globe = debug;
  }, [renderer, camera, size.width, size.height, generation]); // eslint-disable-line react-hooks/exhaustive-deps -- controller est stable, le globe passe par sa ref

  useFrame((_, delta) => {
    const before = governor.dpr;
    const dpr = governor.update(window.__globe?.frameMsOverride ?? delta * 1000, performance.now());
    if (dpr !== before) onDpr(dpr);
    if (renderer.userData.tier === 'haute') {
      const next = nextDegradation(degradationRef.current, governor.slowWindowsAtFloor);
      if (next !== degradationRef.current) { degradationRef.current = next; onDegrade(next, 'lenteur'); }
    }
    const q = qualityRef.current;
    measure.current = {
      backend: renderer.userData.backend, tier: renderer.userData.tier, degradation: q.degradation, maxTexture2D: renderer.userData.maxTexture2D,
      format: builtRef.current?.textures.day.format ?? null, dpr: renderer.getPixelRatio(), medianMs: governor.lastMedianMs, traa: q.traa, events: events.current,
    };
    if (!globe) return;
    const now = performance.now();
    const pose = controller.director.update(now);
    globe.setLook(lookAt(controller.timeline, now));
    globe.setTime(now / 1000);
    globe.applyPose(pose, camera);
    host.update({ nowMs: now, pose, sun: sunDirection(pose) });
    controller.notePose(pose);
    const clouds = controller.cloudOpacityAt(now);
    // Mouvement réduit : les nuages ne dérivent pas.
    globe.setClouds(clouds, controller.reducedMotion ? 0 : (now / 1000) * CLOUD_DRIFT_TURNS_PER_S);
    if (pose.cut) onCut();
    if (window.__globe && renderer.info.frame === lastFrame.current) window.__globe.staleFrames++;
    lastFrame.current = renderer.info.frame;
    if (post) post.render();
    else renderer.render(scene, camera);
    if (window.__globe) { window.__globe.frames++; window.__globe.cloudOpacity = clouds; }
  }, 1); // priorité 1 : R3F ne rend plus lui-même, la boucle passe par le post-traitement

  return globe ? <primitive object={globe.root} /> : null;
}
