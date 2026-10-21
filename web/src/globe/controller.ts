import type * as THREE from 'three/webgpu';
import { CameraDirector, type FlightTicket, type FramePose } from '../camera/director';
import { FLIGHT, FOV_Y_DEG, FRAMING } from '../camera/config';
import type { FramingParams, Viewport } from '../camera/framing';
import { safeViewport, type SafeArea } from '../camera/safeArea';
import { imagePatchUrl, type ImagePatchMeta, type ImageryIndex } from '../data/imagery';
import type { CountryRecord, LngLat } from '../data/types';
import { angleBetween, toVec } from '../geo/vec';
import { needsBeacon } from './beacon';
import type { Globe, ImageSlot } from './globe';
import { availableSlots, pickLevels } from './imageLevels';
import { visibleHalfAngle } from '../camera/framing';
import { createPatchCache } from './patchCache';
import { disposePatchTexture, loadPatchTexture } from './patchTexture';
import { cloudOpacity, type CloudFade } from './clouds';
import { screenPoint, type ScreenPoint } from './project';
import type { Accessory } from './accessories';
import type { RevealTimeline } from './reveal';

/** Fondu d'apparition de la première photo du pays, arrivée en cours de route. */
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
  /** Photos du pays visé par niveau (du plus large au plus fin) ; `null` : pas (encore) chargée, ou en échec. */
  private levelTex: (THREE.Texture | null)[] = [];
  /**
   * Pays quitté par le vol en cours et ses photos : gardées tant qu'elles sont plus fines là où regarde la caméra (19/10 :
   * retirées au décollage, le recul depuis un petit pays sortait flou) ; libérées à l'arrivée.
   */
  private departing: { rec: CountryRecord; tex: (THREE.Texture | null)[] } | null = null;
  private shownSlots: { coarse: number | null; fine: number | null; fineOpacity: number } | null = null;
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
    this.applyImages();
    for (const f of this.frameListeners) {
      try { f(); } catch (e) { console.error(e); }   // un calque cassé n'arrête pas le globe
    }
  }

  get pose(): FramePose | null { return this.lastPose; }

  /** Pose et vue entière de la dernière image (repères de l'accueil, plan 2A-6) ; `null` avant la première. */
  get view(): { pose: FramePose; viewport: Viewport } | null { return this.lastPose ? { pose: this.lastPose, viewport: this.fullViewport } : null; }

  /** Paire de niveaux posée à la dernière image (contrôles e2e) ; `null` : aucune photo. */
  get imageSlots(): { coarse: number | null; fine: number | null; fineOpacity: number } | null { return this.shownSlots; }

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
   * Index des photos emboîtées et leur chargeur (null : pas de photo, la texture globale suffit). Rappelé à chaque
   * recréation du renderer : les textures déjà chargées restent valables.
   */
  setImagery(index: ImageryIndex | null, source: ImageSource | null): void {
    const resized = source?.size !== this.imageSource?.size;
    this.imagery = index;
    this.imageSource = source;
    // autre taille (repli de qualité) : les couches sont déliées tout de suite ; `keep` ne libère qu'au tour suivant
    if (resized) { this.levelTex = []; this.departing = null; this.applyImages(); }
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
    const left = this.target;
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
    this.departing = left && left !== rec && this.levelTex.some((t) => t !== null) ? { rec: left, tex: this.levelTex } : null;
    this.levelTex = [];
    this.requestImage();
    this.fadeClouds(1);
    this.apply();
    const t = this.director.flyTo(rec);
    return {
      durationMs: t.durationMs,
      arrived: t.arrived.then((ok) => {
        if (!ok || this.target !== rec) return false;
        this.arrived = true;
        this.departing = null;
        this.keepImages();
        this.fadeClouds(0);
        this.apply();
        return true;
      }),
    };
  }

  prefetch(rec: CountryRecord): void {
    this.next = rec;
    this.cache.get(rec.patch.sdf).catch(() => {});
    for (const url of this.imageUrls(rec)) this.images.get(url).catch(() => {});
  }

  private imageMeta(rec: CountryRecord | null): ImagePatchMeta | null {
    return (rec && this.imageSource && this.imagery?.countries[rec.cca3]) || null;
  }

  /** Les niveaux du pays, du plus large au plus fin, à la taille du niveau de qualité. */
  private imageUrls(rec: CountryRecord): string[] {
    const meta = this.imageMeta(rec);
    return meta ? meta.levels.map((_, i) => imagePatchUrl(this.baseUrl, rec.cca3, i, this.imageSource!.size)) : [];
  }

  /** Photos du pays visé, tous niveaux, du plus large au plus fin ; un échec laisse le niveau plus large (spec zoom §4.4). */
  private requestImage(): void {
    const rec = this.target;
    if (!rec) return;
    const urls = this.imageUrls(rec);
    this.keepImages();
    this.levelTex = urls.map(() => null);
    urls.forEach((url, i) => this.images.get(url).then((t) => {
      if (this.target === rec && this.imageUrls(rec)[i] === url) { this.levelTex[i] = t; this.applyImages(); }
    }, () => {}));
  }

  /** Le cache ne garde que les photos du pays visé, du suivant et du pays quitté (le reste est libéré au tour suivant). */
  private keepImages(): void {
    const rec = this.target;
    if (!rec) return;
    const nextUrls = this.next && this.next !== rec ? this.imageUrls(this.next) : [];
    const leftUrls = this.departing ? this.imageUrls(this.departing.rec) : [];
    this.images.keep([...this.imageUrls(rec), ...nextUrls, ...leftUrls]);
  }

  /** La paire de niveaux posée pour l'altitude de la dernière image (spec zoom §4.3), d'après ce qui est chargé. */
  private applyImages(): void {
    const g = this.globe;
    if (!g) return;
    // le pays visé et le pays quitté : parmi ceux dont une photo couvre toute la vue, le plus fin ; si aucun ne la couvre,
    // celui qui en couvre le plus (la plus large) ; à égalité, le visé
    let best: { meta: ImagePatchMeta; tex: (THREE.Texture | null)[]; slots: ReturnType<typeof availableSlots>; covers: boolean; extent: number } | null = null;
    const sets = [{ rec: this.target, tex: this.levelTex }, ...(this.departing ? [this.departing] : [])];
    for (const set of sets) {
      const meta = this.imageMeta(set.rec);
      if (!meta || !this.imagery || !set.tex.some((t) => t !== null)) continue;
      const extents = meta.levels.map((l) => l.extentRad);
      const offset = this.lastPose ? angleBetween(this.lastPose.dir, toVec(meta.center)) : 0;
      if (offset > extents[0]!) continue;   // la vue est hors de sa plus large photo
      const pick = this.lastPose
        ? pickLevels(this.lastPose.altitude, this.viewport, extents, this.imagery, offset)
        : { coarse: 0, fine: null, fineOpacity: 0 };
      const slots = availableSlots(pick, set.tex.map((t) => t !== null));
      if (slots.coarse === null) continue;
      const extent = slots.fine !== null && slots.fineOpacity >= 1 ? extents[slots.fine]! : extents[slots.coarse]!;
      const need = this.lastPose ? this.imagery.viewFactor * visibleHalfAngle(this.lastPose.altitude, this.viewport) + offset : 0;
      const covers = extents[slots.coarse]! >= need;
      const better = !best || (covers && !best.covers) || (covers === best.covers && (covers ? extent < best.extent : extent > best.extent));
      if (better) best = { meta, tex: set.tex, slots, covers, extent };
    }
    if (!best) { this.shownSlots = null; g.setImageLevels(null, null, IMAGE_FADE_S); return; }
    const { meta, tex, slots: s } = best;
    const slot = (i: number | null, opacity: number): ImageSlot | null =>
      i === null ? null : { meta: { center: meta.center, extentRad: meta.levels[i]!.extentRad }, tex: tex[i]!, opacity };
    this.shownSlots = s;
    g.setImageLevels(slot(s.coarse, 1), slot(s.fine, s.fineOpacity), IMAGE_FADE_S);
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
    this.departing = null;
    this.fadeClouds(1);
    this.target = null;
    this.timeline = null;
    this.apply();
  }

  private apply(): void {
    const g = this.globe, rec = this.target;
    if (!g) return;
    g.setPatch(rec && this.patch ? rec.patch : null, this.patch);
    this.applyImages();
    const beacon = rec !== null && (this.patchFailed || (this.arrived && !this.patch) || needsBeacon(rec, this.viewport, this.framing));
    g.setBeacon(beacon ? rec.beacon : null);
  }
}
