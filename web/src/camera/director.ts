import { frameAltitude, limitingHalfAngle, overviewAltitude, type FramingParams, type Viewport } from './framing';
import { planFlight, type Flight, type FlightParams, type Pose } from './flight';
import { northUp, rotate, toVec, type LngLat } from '../geo/vec';

export interface FrameTarget { cap: { center: LngLat; radiusDeg: number } }

export interface DirectorOptions {
  viewport: Viewport;
  framing: FramingParams;
  flight: Omit<FlightParams, 'alphaRad' | 'reducedMotion'>;
  reducedMotion: boolean;
  /** Point survolé au démarrage, en vue d'ensemble. */
  start: LngLat;
}

/** Pose de la frame courante ; `cut` signale une coupe (mouvement réduit) que la couche de rendu peut fondre. */
export interface FramePose extends Pose { cut: boolean }

const AXIS_Y = [0, 1, 0] as const;
/** Recadrage après un changement de viewport : vol court, sur place. */
const REFRAME_MS = { minMs: 300, maxMs: 600 } as const;

/**
 * Pilote de caméra, sans three ni React : la boucle de rendu appelle `update(now)` à chaque frame et place la
 * caméra en `dir · (1 + altitude)`, regard vers l'origine, `up` en haut. Le jeu attend `flyTo`.
 */
export class CameraDirector {
  private pose: Pose;
  private viewport: Viewport;
  private framing: FramingParams;
  private readonly opts: DirectorOptions;
  private flight: { plan: Flight; startMs: number; resolve: () => void } | null = null;
  private now = 0;
  private spinDegPerSec = 0;
  /** Calotte visée par le dernier vol ; `null` = vue d'ensemble. */
  private target: FrameTarget | null = null;
  private reframePending = false;

  constructor(opts: DirectorOptions) {
    this.opts = opts;
    this.viewport = opts.viewport;
    this.framing = opts.framing;
    const dir = toVec(opts.start);
    this.pose = { dir, altitude: overviewAltitude(opts.viewport, opts.framing), up: northUp(dir) };
  }

  /**
   * Spec §5 : α est recalculé au redimensionnement. Le vol en cours finit tel qu'il a été planifié (aucun saut) ;
   * ensuite, ou tout de suite au repos, un vol court recadre la cible courante (ou la vue d'ensemble).
   */
  setViewport(v: Viewport): void {
    if (v.width === this.viewport.width && v.height === this.viewport.height && v.fovYDeg === this.viewport.fovYDeg) return;
    this.viewport = v;
    if (this.flight) this.reframePending = true;
    else this.reframe();
  }

  /** Change le cadrage des vols suivants (page de calibration). */
  setFraming(p: FramingParams): void { this.framing = p; }

  /** Rotation lente au repos (degrés de longitude par seconde, vers l'ouest) ; 0 l'arrête. */
  setIdleSpin(degPerSec: number): void { this.spinDegPerSec = degPerSec; }

  /** Vole vers la calotte du pays ; la promesse se résout à l'arrivée (ou quand un autre vol la remplace). */
  flyTo(target: FrameTarget): Promise<void> {
    this.target = target;
    const dir = toVec(target.cap.center);
    return this.flyToPose({ dir, altitude: frameAltitude(target.cap.radiusDeg, this.viewport, this.framing), up: northUp(dir) });
  }

  /** Remonte à la vue d'ensemble au-dessus du point courant. */
  flyToOverview(): Promise<void> {
    this.target = null;
    return this.flyToPose({ ...this.pose, altitude: overviewAltitude(this.viewport, this.framing), up: northUp(this.pose.dir) });
  }

  private flyToPose(to: Pose): Promise<void> {
    this.flight?.resolve();
    this.spinDegPerSec = 0;
    this.reframePending = false;
    const plan = planFlight(this.pose, to, {
      ...this.opts.flight,
      alphaRad: limitingHalfAngle(this.viewport),
      reducedMotion: this.opts.reducedMotion,
    });
    return new Promise((resolve) => {
      this.flight = { plan, startMs: this.now, resolve };
    });
  }

  /** Vol court vers l'altitude que demande le viewport courant, même direction ; aucune promesse à résoudre. */
  private reframe(): void {
    const altitude = this.target
      ? frameAltitude(this.target.cap.radiusDeg, this.viewport, this.framing)
      : overviewAltitude(this.viewport, this.framing);
    if (Math.abs(altitude - this.pose.altitude) < 1e-9) return;
    const plan = planFlight(this.pose, { ...this.pose, altitude }, {
      ...this.opts.flight,
      ...REFRAME_MS,
      alphaRad: limitingHalfAngle(this.viewport),
      reducedMotion: this.opts.reducedMotion,
    });
    this.flight = { plan, startMs: this.now, resolve: () => {} };
  }

  update(nowMs: number): FramePose {
    const dt = Math.max(0, nowMs - this.now);
    this.now = nowMs;
    let cut = false;
    if (this.flight) {
      const { plan, startMs, resolve } = this.flight;
      const t = plan.durationMs === 0 ? 1 : (nowMs - startMs) / plan.durationMs;
      this.pose = plan.at(t);
      if (t >= 1) {
        cut = plan.durationMs === 0;
        this.flight = null;
        resolve();
        if (this.reframePending) {
          this.reframePending = false;
          this.reframe();
        }
      }
    } else if (this.spinDegPerSec !== 0) {
      const dir = rotate(this.pose.dir, AXIS_Y, (-this.spinDegPerSec * Math.PI / 180) * (dt / 1000));
      this.pose = { ...this.pose, dir, up: northUp(dir) };
    }
    return { ...this.pose, cut };
  }
}
