import type * as THREE from 'three/webgpu';
import { CameraDirector, type FlightTicket, type FramePose } from '../camera/director';
import { FLIGHT, FOV_Y_DEG, FRAMING } from '../camera/config';
import type { FramingParams, Viewport } from '../camera/framing';
import { safeViewport, type SafeArea } from '../camera/safeArea';
import { imagePatchUrl, type ImageryIndex } from '../data/imagery';
import type { CountryRecord, LngLat } from '../data/types';
import { needsBeacon } from './beacon';
import type { Globe } from './globe';
import { createPatchCache } from './patchCache';
import { disposePatchTexture, loadPatchTexture } from './patchTexture';
import { cloudOpacity, type CloudFade } from './clouds';
import { screenPoint, type ScreenPoint } from './project';
import type { Accessory } from './accessories';
import type { RevealTimeline } from './reveal';

/** Fondu d'apparition d'un patch image arrivé en cours de route. */
export const IMAGE_FADE_S = 0.4;

/** Chargeur des patchs image, fourni par la scène quand le renderer est prêt (KTX2 → format du GPU) ; taille selon le niveau. */
export interface ImageSource { size: number; load(url: string): Promise<THREE.Texture> }

/**
 * État du globe qui survit à la recréation du renderer (perte du GPU) : caméra, pays visé, patchs, révélation.
 * Le `Globe` three, lui, est recréé avec le renderer et s'y rattache par `attach`.
 */
export class GlobeController {
  readonly director: CameraDirector;
  timeline: RevealTimeline | null = null;
  private globe: Globe | null = null;
  private target: CountryRecord | null = null;
  private patch: THREE.Texture | null = null;
  private patchFailed = false;
  /** Arrivé sur la cible : sans patch à ce moment-là, la balise montre le pays (patch lent). */
  private arrived = false;
  private next: CountryRecord | null = null;
  /** Viewport de cadrage : la zone libre (`layout`) ; `fullViewport` : tout le canvas. */
  private viewport: Viewport;
  private fullViewport: Viewport;
  private safeArea: SafeArea | null = null;
  private framing: FramingParams;
  private readonly cache = createPatchCache((sdf: string) => loadPatchTexture(`${this.baseUrl}data/${sdf}`), disposePatchTexture);
  private imagery: ImageryIndex | null = null;
  private imageSource: ImageSource | null = null;
  private image: THREE.Texture | null = null;
  private readonly images = createPatchCache((url: string) => this.imageSource!.load(url), (t: THREE.Texture) => t.dispose());

  private cloudFade: CloudFade = { from: 1, to: 1, atMs: 0 };
  private reduced: boolean;
  private lastPose: FramePose | null = null;
  private readonly frameListeners = new Set<() => void>();
  private readonly mounted = new Set<Accessory>();
  private readonly accessoryListeners = new Set<() => void>();

  constructor(private readonly baseUrl = '/', reducedMotion = false, private readonly clock: () => number = () => performance.now(), startAtHome = false) {
    this.viewport = { width: 960, height: 600, fovYDeg: FOV_Y_DEG };
    this.fullViewport = this.viewport;
    this.framing = FRAMING;
    this.reduced = reducedMotion;
    this.director = new CameraDirector({ viewport: this.viewport, framing: FRAMING, flight: FLIGHT, reducedMotion, start: [2.35, 30], startAtHome });
  }

  /** Pose dessinée à l'image courante (boucle de rendu, avant le rendu), puis les abonnés de `onFrame`. */
  notePose(p: FramePose): void {
    this.lastPose = p;
    for (const f of this.frameListeners) {
      try { f(); } catch (e) { console.error(e); }   // un calque cassé n'arrête pas le globe
    }
  }

  get pose(): FramePose | null { return this.lastPose; }

  /** Appelé à chaque image, pose posée : les calques DOM s'y recalent. Rend la désinscription. */
  onFrame(cb: () => void): () => void {
    this.frameListeners.add(cb);
    return () => { this.frameListeners.delete(cb); };
  }

  /** Position écran d'un point du sol à la dernière image (viewport complet) ; `null` avant la première image. */
  project(p: LngLat): ScreenPoint | null {
    return this.lastPose ? screenPoint(this.lastPose, this.fullViewport, p) : null;
  }

  /** Objet de scène (survit à la perte du GPU : la scène le recrée). Rend le retrait. */
  mount(a: Accessory): () => void {
    this.mounted.add(a);
    this.emitAccessories();
    return () => { if (this.mounted.delete(a)) this.emitAccessories(); };
  }

  accessories(): Accessory[] { return [...this.mounted]; }

  onAccessories(cb: () => void): () => void {
    this.accessoryListeners.add(cb);
    return () => { this.accessoryListeners.delete(cb); };
  }

  private emitAccessories(): void { for (const f of this.accessoryListeners) f(); }

  get reducedMotion(): boolean { return this.reduced; }

  /** Réglage du système changé pendant la visite (spec 2A §5.7) : caméra et dérive des nuages le suivent. */
  setReducedMotion(on: boolean): void {
    this.reduced = on;
    this.director.setReducedMotion(on);
  }

  attach(globe: Globe | null): void {
    this.globe = globe;
    this.apply();
  }

  setViewport(v: Viewport): void {
    this.fullViewport = v;
    this.layout();
  }

  /** Bandes occupées par l'interface (D1) : le pays se cadre et se centre dans la zone libre ; `null` : tout l'écran. */
  setSafeArea(a: SafeArea | null): void {
    this.safeArea = a;
    this.layout();
  }

  /** Viewport de cadrage (zone libre) pour le directeur et la balise ; l'axe optique suit le milieu de la zone. */
  private layout(): void {
    const { zone, axisY } = safeViewport(this.fullViewport, this.safeArea);
    this.viewport = zone;
    this.director.setViewport(zone, axisY, this.fullViewport);
    this.apply();
  }

  /**
   * Index des patchs image et leur chargeur (null : pas de patch image, la texture globale suffit). Rappelé à chaque
   * recréation du renderer : les textures déjà chargées restent valables.
   */
  setImagery(index: ImageryIndex | null, source: ImageSource | null): void {
    this.imagery = index;
    this.imageSource = source;
    this.requestImage();
    this.apply();
  }

  setFraming(p: FramingParams): void {
    this.framing = p;
    this.director.setFraming(p);
    this.apply();
  }

  /**
   * Vole vers le pays. `arrived` : true à l'arrivée (patch chargé, en retard ou en échec : la manche n'attend pas), false
   * si un autre vol l'a remplacé ou si `clear()` est passé entre-temps.
   */
  flyTo(rec: CountryRecord): FlightTicket {
    this.target = rec;
    this.timeline = null;
    this.patch = null;
    this.patchFailed = false;
    this.arrived = false;
    this.cache.keep([rec.patch.sdf, ...(this.next ? [this.next.patch.sdf] : [])]);
    this.cache.get(rec.patch.sdf).then(
      (t) => { if (this.target === rec) { this.patch = t; this.apply(); } },
      () => { if (this.target === rec) { this.patchFailed = true; this.apply(); } },
    );
    this.image = null;
    this.requestImage();
    this.fadeClouds(1);
    this.apply();
    const t = this.director.flyTo(rec);
    return {
      durationMs: t.durationMs,
      arrived: t.arrived.then((ok) => {
        if (!ok || this.target !== rec) return false;
        this.arrived = true;
        this.fadeClouds(0);
        this.apply();
        return true;
      }),
    };
  }

  prefetch(rec: CountryRecord): void {
    this.next = rec;
    this.cache.get(rec.patch.sdf).catch(() => {});
    const url = this.imageUrl(rec);
    if (url) this.images.get(url).catch(() => {});
  }

  private imageUrl(rec: CountryRecord): string | null {
    return this.imagery?.countries[rec.cca3] && this.imageSource ? imagePatchUrl(this.baseUrl, rec.cca3, this.imageSource.size) : null;
  }

  /** Patch image du pays visé : un échec laisse la texture globale (spec §8 : la manche n'attend jamais un patch). */
  private requestImage(): void {
    const rec = this.target;
    if (!rec) return;
    const url = this.imageUrl(rec);
    if (!url) return;
    const nextUrl = this.next && this.next !== rec ? this.imageUrl(this.next) : null;
    this.images.keep(nextUrl ? [url, nextUrl] : [url]);
    this.images.get(url).then((t) => { if (this.target === rec) { this.image = t; this.apply(); } }, () => {});
  }

  showQuestion(nowMs: number): void { this.timeline = { questionAtMs: nowMs }; }

  answer(kind: 'correct' | 'wrong', nowMs: number): void {
    if (this.timeline) this.timeline = { ...this.timeline, answer: { kind, atMs: nowMs } };
  }

  /** Opacité des nuages pour la frame (horloge de la boucle de rendu). */
  cloudOpacityAt(nowMs: number): number { return cloudOpacity(this.cloudFade, nowMs); }

  private fadeClouds(to: number): void {
    const now = this.clock();
    this.cloudFade = { from: cloudOpacity(this.cloudFade, now), to, atMs: now };
  }

  clear(): void {
    this.fadeClouds(1);
    this.target = null;
    this.timeline = null;
    this.apply();
  }

  private apply(): void {
    const g = this.globe, rec = this.target;
    if (!g) return;
    g.setPatch(rec && this.patch ? rec.patch : null, this.patch);
    const imageMeta = rec && this.image ? this.imagery?.countries[rec.cca3] ?? null : null;
    g.setImagePatch(imageMeta, imageMeta ? this.image : null, IMAGE_FADE_S);
    const beacon = rec !== null && (this.patchFailed || (this.arrived && !this.patch) || needsBeacon(rec, this.viewport, this.framing));
    g.setBeacon(beacon ? rec.beacon : null);
  }
}
