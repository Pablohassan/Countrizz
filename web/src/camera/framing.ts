export interface Viewport { width: number; height: number; fovYDeg: number }

/**
 * k : facteur de contexte (multiplie la distance au centre) ; margin : m ; altitudes en rayons terrestres ;
 * minContextDeg : θ_min, contexte minimal — un pays plus petit est cadré comme une calotte de θ_min (0 par défaut :
 * formule du spec inchangée ; réglage proposé le 02/10, tranché avec l'utilisateur à la calibration).
 */
export interface FramingParams {
  k: number;
  margin: number;
  floor: number;
  overview: { landscape: number; portrait: number };
  minContextDeg?: number;
}

const RAD = Math.PI / 180;

/** Demi-champ limitant α : vertical en paysage, horizontal en portrait. */
export function limitingHalfAngle(v: Viewport): number {
  const halfV = (v.fovYDeg * RAD) / 2;
  const halfH = Math.atan(Math.tan(halfV) * (v.width / v.height));
  return Math.min(halfV, halfH);
}

/** Vue d'ensemble : altitude de l'ancien jeu, 1,4 (bureau, paysage) / 2,2 (mobile, portrait). */
export const overviewAltitude = (v: Viewport, p: FramingParams): number =>
  v.width >= v.height ? p.overview.landscape : p.overview.portrait;

/** Spec §5 : altitude = k · (cos θ + sin θ / tan(α / m)) − 1, bornée à [floor ; overview], avec θ ≥ θ_min. */
export function frameAltitude(capRadiusDeg: number, v: Viewport, p: FramingParams): number {
  const theta = Math.max(capRadiusDeg, p.minContextDeg ?? 0) * RAD;
  const alpha = limitingHalfAngle(v);
  const altitude = p.k * (Math.cos(theta) + Math.sin(theta) / Math.tan(alpha / p.margin)) - 1;
  return Math.min(overviewAltitude(v, p), Math.max(p.floor, altitude));
}

/**
 * Un point à `offsetDeg` du centre visé (distance angulaire au centre de la Terre) est-il dans le cadre quand la caméra
 * arrive au-dessus de ce centre, à l'altitude de `frameAltitude` ? Caméra à d = 1 + altitude rayons du centre, regard
 * vers le centre : le point est vu sous l'angle β = atan2(sin t, d − cos t) ; il faut β ≤ α (demi-champ limitant) et le
 * point en deçà de l'horizon (cos t > 1 / d).
 */
export function inArrivalView(offsetDeg: number, capRadiusDeg: number, v: Viewport, p: FramingParams): boolean {
  const d = 1 + frameAltitude(capRadiusDeg, v, p);
  const t = offsetDeg * RAD;
  if (Math.cos(t) <= 1 / d) return false;
  return Math.atan2(Math.sin(t), d - Math.cos(t)) <= limitingHalfAngle(v);
}
