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
  /** Spec zoom §2 (15/10) : part d'écran visée à l'arrivée ; absent, l'arrivée suit le cadrage B ci-dessus. */
  arrival?: ArrivalParams;
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

/** Spec zoom §2 : le pays occupe entre `share.min` et `share.max` du petit côté ; zoom par rapport au cadrage B selon la superficie. */
export interface ArrivalParams {
  share: { min: number; max: number };
  /** Facteur appliqué à la part B : `large` pour la plus grande superficie, `small` pour la plus petite, linéaire en log. */
  sizeFactor: { large: number; small: number };
  /** Superficies extrêmes des 197 pays (km²), recomptées par arrival.test.ts sur countries.json. */
  areaRange: { maxKm2: number; minKm2: number };
}

/** Ce que le cadrage à l'arrivée lit d'un pays. */
export interface ArrivalTarget { areaKm2: number; cap: { radiusDeg: number } }

/**
 * Part du petit côté qu'occupe la calotte de rayon `capRadiusDeg` vue d'aplomb à `altitude` : son bord est vu sous
 * β = atan2(sin r, 1 + altitude − cos r), la part vaut tan β / tan α (α : demi-champ limitant).
 */
export function capShare(capRadiusDeg: number, altitude: number, v: Viewport): number {
  const r = capRadiusDeg * RAD;
  return Math.tan(Math.atan2(Math.sin(r), 1 + altitude - Math.cos(r))) / Math.tan(limitingHalfAngle(v));
}

/** f = large + (small − large) · (ln A_max − ln A) / (ln A_max − ln A_min), A borné à la plage. */
export function sizeFactor(areaKm2: number, a: ArrivalParams): number {
  const { maxKm2, minKm2 } = a.areaRange;
  const area = Math.min(maxKm2, Math.max(minKm2, areaKm2));
  const t = (Math.log(maxKm2) - Math.log(area)) / (Math.log(maxKm2) - Math.log(minKm2));
  return a.sizeFactor.large + (a.sizeFactor.small - a.sizeFactor.large) * t;
}

/** Part visée : part B × f, bornée à [share.min ; share.max] ; sans `arrival`, la part B. */
export function arrivalShare(t: ArrivalTarget, v: Viewport, p: FramingParams): number {
  const b = capShare(t.cap.radiusDeg, frameAltitude(t.cap.radiusDeg, v, p), v);
  if (!p.arrival) return b;
  const { share } = p.arrival;
  return Math.min(share.max, Math.max(share.min, b * sizeFactor(t.areaKm2, p.arrival)));
}

/**
 * Altitude qui rend la part visée : tan β = part × tan α, d'où 1 + altitude = cos r + sin r / tan β. Bornée en bas par
 * `floor` seulement : la vue d'ensemble ne la borne plus (Russie et Indonésie au-dessus sur téléphone, spec zoom §2).
 */
export function arrivalAltitude(t: ArrivalTarget, v: Viewport, p: FramingParams): number {
  if (!p.arrival) return frameAltitude(t.cap.radiusDeg, v, p);
  const r = t.cap.radiusDeg * RAD;
  const tanB = arrivalShare(t, v, p) * Math.tan(limitingHalfAngle(v));
  return Math.max(p.floor, Math.cos(r) + Math.sin(r) / tanB - 1);
}

/** Zoom par rapport au cadrage B (part visée / part B) : la durée du vol en dépend (spec zoom §3). */
export function arrivalZoom(t: ArrivalTarget, v: Viewport, p: FramingParams): number {
  if (!p.arrival) return 1;
  return arrivalShare(t, v, p) / capShare(t.cap.radiusDeg, frameAltitude(t.cap.radiusDeg, v, p), v);
}

/**
 * Demi-angle au sol (rad, au centre de la Terre) vu sur le petit côté à `altitude` : le rayon du bord du champ touche la
 * sphère en asin(d · sin α) − α (d = 1 + altitude) ; s'il la manque, l'horizon, acos(1 / d).
 */
export function visibleHalfAngle(altitude: number, v: Viewport): number {
  const d = 1 + altitude, alpha = limitingHalfAngle(v), s = d * Math.sin(alpha);
  return s >= 1 ? Math.acos(1 / d) : Math.asin(s) - alpha;
}

/**
 * Un point à `offsetDeg` du centre visé (distance angulaire au centre de la Terre) est-il dans le cadre quand la caméra
 * arrive au-dessus de ce centre, à l'altitude de `arrivalAltitude` ? Caméra à d = 1 + altitude rayons du centre, regard
 * vers le centre : le point est vu sous l'angle β = atan2(sin t, d − cos t) ; il faut β ≤ α (demi-champ limitant) et le
 * point en deçà de l'horizon (cos t > 1 / d).
 */
export function inArrivalView(offsetDeg: number, target: ArrivalTarget, v: Viewport, p: FramingParams): boolean {
  const d = 1 + arrivalAltitude(target, v, p);
  const t = offsetDeg * RAD;
  if (Math.cos(t) <= 1 / d) return false;
  return Math.atan2(Math.sin(t), d - Math.cos(t)) <= limitingHalfAngle(v);
}
