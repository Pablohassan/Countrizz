import type * as THREE from 'three/webgpu';
import { CameraDirector } from '../camera/director';
import { FLIGHT, FOV_Y_DEG, FRAMING } from '../camera/config';
import type { FramingParams, Viewport } from '../camera/framing';
import type { CountryRecord } from '../data/types';
import { needsBeacon } from './beacon';
import type { Globe } from './globe';
import { createPatchCache } from './patchCache';
import { disposePatchTexture, loadPatchTexture } from './patchTexture';
import type { RevealTimeline } from './reveal';

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

  constructor(private readonly baseUrl = '/', reducedMotion = false) {
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
    this.apply();
    return this.director.flyTo(rec).then(() => {
      if (this.target === rec) { this.arrived = true; this.apply(); }
    });
  }

  prefetch(rec: CountryRecord): void {
    this.next = rec;
    this.cache.get(rec.patch.sdf).catch(() => {});
  }

  showQuestion(nowMs: number): void { this.timeline = { questionAtMs: nowMs }; }

  answer(kind: 'correct' | 'wrong', nowMs: number): void {
    if (this.timeline) this.timeline = { ...this.timeline, answer: { kind, atMs: nowMs } };
  }

  clear(): void {
    this.target = null;
    this.timeline = null;
    this.apply();
  }

  private apply(): void {
    const g = this.globe, rec = this.target;
    if (!g) return;
    g.setPatch(rec && this.patch ? rec.patch : null, this.patch);
    const beacon = rec !== null && (this.patchFailed || (this.arrived && !this.patch) || needsBeacon(rec, this.viewport, this.framing));
    g.setBeacon(beacon ? rec.beacon : null);
  }
}
