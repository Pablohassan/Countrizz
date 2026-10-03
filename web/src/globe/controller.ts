import type * as THREE from 'three/webgpu';
import { CameraDirector } from '../camera/director';
import { FLIGHT, FOV_Y_DEG, FRAMING } from '../camera/config';
import type { FramingParams, Viewport } from '../camera/framing';
import { imagePatchUrl, type ImageryIndex } from '../data/imagery';
import type { CountryRecord } from '../data/types';
import { needsBeacon } from './beacon';
import type { Globe } from './globe';
import { createPatchCache } from './patchCache';
import { disposePatchTexture, loadPatchTexture } from './patchTexture';
import { cloudOpacity, type CloudFade } from './clouds';
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
  private viewport: Viewport;
  private framing: FramingParams;
  private readonly cache = createPatchCache((sdf: string) => loadPatchTexture(`${this.baseUrl}data/${sdf}`), disposePatchTexture);
  private imagery: ImageryIndex | null = null;
  private imageSource: ImageSource | null = null;
  private image: THREE.Texture | null = null;
  private readonly images = createPatchCache((url: string) => this.imageSource!.load(url), (t: THREE.Texture) => t.dispose());

  private cloudFade: CloudFade = { from: 1, to: 1, atMs: 0 };

  constructor(private readonly baseUrl = '/', readonly reducedMotion = false, private readonly clock: () => number = () => performance.now()) {
    this.viewport = { width: 960, height: 600, fovYDeg: FOV_Y_DEG };
    this.framing = FRAMING;
    this.director = new CameraDirector({ viewport: this.viewport, framing: FRAMING, flight: FLIGHT, reducedMotion, start: [2.35, 30] });
  }

  attach(globe: Globe | null): void {
    this.globe = globe;
    this.apply();
  }

  setViewport(v: Viewport): void {
    this.viewport = v;
    this.director.setViewport(v);
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

  /** Vole vers le pays ; résolue à l'arrivée, que le patch soit chargé, en retard ou en échec (la manche n'attend pas). */
  flyTo(rec: CountryRecord): Promise<void> {
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
    return this.director.flyTo(rec).then(() => {
      if (this.target === rec) { this.arrived = true; this.fadeClouds(0); this.apply(); }
    });
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
