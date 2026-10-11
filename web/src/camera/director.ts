import { frameAltitude, limitingHalfAngle, overviewAltitude, type FramingParams, type Viewport } from './framing';
import { planFlight, type Flight, type FlightParams, type Pose } from './flight';
import { homePose } from './home';
import { northUp, rotate, toVec, type LngLat } from '../geo/vec';

export interface FrameTarget { cap: { center: LngLat; radiusDeg: number } }

export interface DirectorOptions {
  viewport: Viewport;
  framing: FramingParams;
  flight: Omit<FlightParams, 'alphaRad' | 'reducedMotion'>;
  reducedMotion: boolean;
  /** Point survolé au démarrage, en vue d'ensemble. */
  start: LngLat;
  /** Démarrer sur la vue d'accueil « lever de Terre » (home.ts) plutôt qu'en vue d'ensemble au-dessus de `start`. */
  startAtHome?: boolean;
}

/**
 * Pose de la frame courante ; `cut` signale une coupe (mouvement réduit) que la couche de rendu peut fondre ; `pitch` :
 * tangage de la caméra (rad), non nul seulement autour de la vue d'accueil ; `axisY` : hauteur de l'axe optique à l'écran,
 * NDC — zone libre, camera/safeArea.ts.
 */
export interface FramePose extends Pose { cut: boolean; pitch: number; axisY: number }

/** Vol lancé : sa durée (le 3-2-1 s'y règle) et son issue — `true` à l'arrivée, `false` s'il a été remplacé avant. */
export interface FlightTicket { durationMs: number; arrived: Promise<boolean> }

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
  /** Tout le canvas : la vue d'accueil s'y règle (maquette H3), sans zone libre ni axe décalé. */
  private full: Viewport;
  private framing: FramingParams;
  private readonly opts: DirectorOptions;
  private flight: { plan: Flight; startMs: number; settle: (arrived: boolean) => void; pitch: [number, number]; axis: [number, number] } | null = null;
  private pitch = 0;
  /** Hauteur de l'axe optique : courante, et celle que demande la zone libre. */
  private axisY = 0;
  private axisTarget = 0;
  /** À la vue d'accueil (ou en route vers elle) : un changement de viewport ne la recadre pas comme un pays. */
  private atHome = false;
  private now = 0;
  private reducedMotion: boolean;
  /** Rotation demandée ; effective seulement hors mouvement réduit. */
  private spinDegPerSec = 0;
  /** Calotte visée par le dernier vol ; `null` = vue d'ensemble. */
  private target: FrameTarget | null = null;
  private reframePending = false;

  constructor(opts: DirectorOptions) {
    this.opts = opts;
    this.reducedMotion = opts.reducedMotion;
    this.viewport = opts.viewport;
    this.full = opts.viewport;
    this.framing = opts.framing;
    if (opts.startAtHome) {
      const h = homePose(opts.viewport);
      this.pose = { dir: h.dir, altitude: h.altitude, up: h.up };
      this.pitch = h.pitch;
      this.atHome = true;
    } else {
      const dir = toVec(opts.start);
      this.pose = { dir, altitude: overviewAltitude(opts.viewport, opts.framing), up: northUp(dir) };
    }
  }

  /**
   * Spec §5 : α est recalculé au redimensionnement. Le vol en cours finit tel qu'il a été planifié (aucun saut) ;
   * ensuite, ou tout de suite au repos, un vol court recadre la cible courante (ou la vue d'ensemble).
   */
  setViewport(v: Viewport, axisY = 0, full: Viewport = v): void {
    const same = (a: Viewport, b: Viewport) => a.width === b.width && a.height === b.height && a.fovYDeg === b.fovYDeg;
    if (same(v, this.viewport) && same(full, this.full) && axisY === this.axisTarget) return;
    this.viewport = v;
    this.full = full;
    this.axisTarget = axisY;
    if (this.flight) this.reframePending = true;
    else this.reframe();
  }

  /** Change le cadrage des vols suivants (page de calibration). */
  setFraming(p: FramingParams): void { this.framing = p; }

  /** Rotation lente au repos (degrés de longitude par seconde, vers l'ouest) ; 0 l'arrête ; suspendue en mouvement réduit (spec 2A §5.7). */
  setIdleSpin(degPerSec: number): void { this.spinDegPerSec = degPerSec; }

  /** Spec 2A §5.7, relu à chaud : le vol en cours finit tel quel ; les suivants coupent ; la rotation demandée attend. */
  setReducedMotion(on: boolean): void { this.reducedMotion = on; }

  /** Vole vers la calotte du pays ; `arrived` : true à l'arrivée, false si un autre vol le remplace. */
  flyTo(target: FrameTarget): FlightTicket {
    this.target = target;
    this.atHome = false;
    const dir = toVec(target.cap.center);
    return this.flyToPose({ dir, altitude: frameAltitude(target.cap.radiusDeg, this.viewport, this.framing), up: northUp(dir) });
  }

  /** Remonte à la vue d'ensemble au-dessus du point courant (même ticket que `flyTo`). */
  flyToOverview(): FlightTicket {
    this.target = null;
    this.atHome = false;
    return this.flyToPose({ ...this.pose, altitude: overviewAltitude(this.viewport, this.framing), up: northUp(this.pose.dir) });
  }

  /** Rejoint la vue d'accueil « lever de Terre », tangage compris (même ticket que `flyTo`). */
  flyToHome(): FlightTicket {
    this.target = null;
    this.atHome = true;
    // la zone libre ne vaut que pour les pays : l'accueil garde tout l'écran et l'axe au centre (revue finale 2A-4)
    const h = homePose(this.full);
    return this.flyToPose({ dir: h.dir, altitude: h.altitude, up: h.up }, h.pitch, 0);
  }

  private flyToPose(to: Pose, toPitch = 0, toAxis = this.axisTarget): FlightTicket {
    this.flight?.settle(false);
    this.spinDegPerSec = 0;
    this.reframePending = false;
    const plan = planFlight(this.pose, to, {
      ...this.opts.flight,
      alphaRad: limitingHalfAngle(this.viewport),
      reducedMotion: this.reducedMotion,
    });
    let settle!: (arrived: boolean) => void;
    const arrived = new Promise<boolean>((r) => { settle = r; });
    this.flight = { plan, startMs: this.now, settle, pitch: [this.pitch, toPitch], axis: [this.axisY, toAxis] };
    return { durationMs: plan.durationMs, arrived };
  }

  /** Vol court vers l'altitude que demande le viewport courant, même direction ; aucune promesse à résoudre. */
  private reframe(): void {
    if (this.atHome) {
      // l'altitude de l'accueil ne dépend pas du viewport ; le tangage suit le champ vertical
      this.pitch = homePose(this.full).pitch;
      this.axisY = 0;
      return;
    }
    const altitude = this.target
      ? frameAltitude(this.target.cap.radiusDeg, this.viewport, this.framing)
      : overviewAltitude(this.viewport, this.framing);
    if (Math.abs(altitude - this.pose.altitude) < 1e-9 && this.axisY === this.axisTarget) return;
    const plan = planFlight(this.pose, { ...this.pose, altitude }, {
      ...this.opts.flight,
      ...REFRAME_MS,
      alphaRad: limitingHalfAngle(this.viewport),
      reducedMotion: this.reducedMotion,
    });
    this.flight = { plan, startMs: this.now, settle: () => {}, pitch: [this.pitch, this.pitch], axis: [this.axisY, this.axisTarget] };
  }

  update(nowMs: number): FramePose {
    // plafonné : au retour d'un onglet caché (plus aucune image), la rotation ne rattrape pas toute l'absence
    const dt = Math.min(100, Math.max(0, nowMs - this.now));
    this.now = nowMs;
    let cut = false;
    if (this.flight) {
      const { plan, startMs, settle, pitch, axis } = this.flight;
      const t = plan.durationMs === 0 ? 1 : (nowMs - startMs) / plan.durationMs;
      this.pose = plan.at(t);
      const s = Math.min(1, Math.max(0, t));
      const e = s * s * (3 - 2 * s);
      this.pitch = pitch[0] + (pitch[1] - pitch[0]) * e;
      this.axisY = axis[0] + (axis[1] - axis[0]) * e;
      if (t >= 1) {
        cut = plan.durationMs === 0;
        this.flight = null;
        settle(true);
        if (this.reframePending) {
          this.reframePending = false;
          this.reframe();
        }
      }
    } else if (this.spinDegPerSec !== 0 && !this.reducedMotion) {
      const dir = rotate(this.pose.dir, AXIS_Y, (-this.spinDegPerSec * Math.PI / 180) * (dt / 1000));
      this.pose = { ...this.pose, dir, up: northUp(dir) };
    }
    return { ...this.pose, cut, pitch: this.pitch, axisY: this.axisY };
  }
}
