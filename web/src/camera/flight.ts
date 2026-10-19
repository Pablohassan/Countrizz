import { interpolateZoom } from 'd3-interpolate';
import { angleBetween, cross, dot, length, normalize, rotate, scale, add, type Vec3 } from '../geo/vec';

/** Pose de caméra : direction du point visé, altitude (rayons terrestres), haut de l'image (tangent en `dir`). */
export interface Pose { dir: Vec3; altitude: number; up: Vec3 }

export interface FlightParams {
  /** Demi-champ limitant (rad) : convertit l'altitude en largeur vue, w = 2 · h · tan α. */
  alphaRad: number;
  /** Compromis zoom / translation de van Wijk & Nuij (d3 : √2). */
  rho: number;
  /** Facteur appliqué à la durée naturelle de d3 avant bornage. */
  timeScale: number;
  minMs: number;
  maxMs: number;
  reducedMotion?: boolean;
  /** Zoom du vol (part d'écran visée / part B, spec zoom §3) ; absent : facteur 1. */
  zoom?: number;
  /** Zooms de référence : facteur 1 à `from`, 3 à `to`. */
  zoomRef?: { from: number; to: number };
  /** Plafond de la durée, facteur de zoom compris (ms). */
  capMs?: number;
}

export interface Flight { durationMs: number; at(t: number): Pose }

// @types/d3-interpolate 3.0.4 place `rho` sur l'interpolateur rendu ; à l'exécution, c'est la fabrique qui le porte
// (d3-interpolate 3.0.1, src/zoom.js : `zoom.rho = function(_) { … return zoomRho(…) }`).
const zoomWithRho = (rho: number) => (interpolateZoom as unknown as { rho(r: number): typeof interpolateZoom }).rho(rho);

// smootherstep (vitesse et accélération nulles aux bornes) : la cubique ajoutait sa pente ×3 au milieu au profil de van
// Wijk, qui y concentre déjà le trajet ; pointe de 844 °/s² mesurée le 10/10 (vérificateur de parcours), 284 ainsi.
const smootherstep = (t: number) => t * t * t * (t * (6 * t - 15) + 10);

/** Angle signé de `a` vers `b` autour de l'axe unitaire `axis` (a, b ⟂ axis). */
const signedAngle = (a: Vec3, b: Vec3, axis: Vec3) => Math.atan2(dot(axis, cross(a, b)), dot(a, b));

/** Spec zoom §3 : d(z) = max(1, 1 + 2 · log2(z / from) / log2(to / from)) — 1 à ×1,1, 3 à ×3 (« zoom 300 % = 3 fois le temps »). */
export function zoomDurationFactor(z: number, ref: { from: number; to: number }): number {
  return Math.max(1, 1 + (2 * Math.log2(z / ref.from)) / Math.log2(ref.to / ref.from));
}

/**
 * Vol en grand cercle avec le profil d'altitude de van Wijk & Nuij (d3.interpolateZoom), temps en smootherstep.
 * Le haut de l'image est transporté parallèlement le long du grand cercle (aucun retournement au passage
 * d'un pôle), puis tourné progressivement pour arriver « nord en haut » sur la cible.
 */
export function planFlight(from: Pose, to: Pose, p: FlightParams): Flight {
  if (p.reducedMotion) return { durationMs: 0, at: () => to };

  const d = angleBetween(from.dir, to.dir);
  const tanA = Math.tan(p.alphaRad);
  const zoom = zoomWithRho(p.rho)([0, 0, 2 * from.altitude * tanA], [d, 0, 2 * to.altitude * tanA]);
  const natural = Math.min(p.maxMs, Math.max(p.minMs, zoom.duration * p.timeScale));
  const factor = p.zoom !== undefined && p.zoomRef ? zoomDurationFactor(p.zoom, p.zoomRef) : 1;
  const durationMs = Math.min(p.capMs ?? Infinity, natural * factor);

  // Axe du grand cercle ; sur place (d ≈ 0), un axe quelconque ⟂ dir convient : la direction ne bouge pas.
  const rawAxis = cross(from.dir, to.dir);
  const axis = length(rawAxis) > 1e-12 ? normalize(rawAxis) : normalize(cross(from.dir, from.up));
  const t0 = cross(axis, from.dir); // tangente au départ, sens du mouvement
  const a = dot(from.up, t0), b = dot(from.up, axis);
  const dirAt = (u: number): Vec3 => add(scale(from.dir, Math.cos(u)), scale(t0, Math.sin(u)));
  const transportedUp = (u: number): Vec3 => {
    const tangent = add(scale(t0, Math.cos(u)), scale(from.dir, -Math.sin(u)));
    return add(scale(tangent, a), scale(axis, b));
  };
  const roll = signedAngle(transportedUp(d), to.up, to.dir);

  return {
    durationMs,
    at(t: number): Pose {
      if (t >= 1) return to;
      const s = smootherstep(Math.max(0, t));
      const [u, , w] = zoom(s) as [number, number, number];
      const dir = dirAt(u);
      return { dir, altitude: w / (2 * tanA), up: rotate(transportedUp(u), dir, roll * s) };
    },
  };
}
