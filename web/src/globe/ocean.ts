import { cos, float, fwidth, length, max, mix, pow, sin, smoothstep, texture, time, vec2 } from 'three/tsl';
import type * as THREE from 'three/webgpu';
import type Node from 'three/src/nodes/core/Node.js';

/**
 * Reflet du soleil sur la mer (spec océan §1.2) : loi de Cox et Munk, reprise d'une implémentation three.js de 2026
 * (globe « Moon », PR #22 fusionnée le 08/10/2026) — pente quadratique moyenne des vagues mss = 0,003 + 0,00512 · U (vent
 * U en m/s), rugosité GGX = mss^¼ ; coefficient de Fresnel de l'eau de mer F0 = 0,02006 (indice 1,33).
 */
export const COX_MUNK = { base: 0.003, perMs: 0.00512 } as const;
export const SEAWATER_IOR = 1.33;

export function coxMunkRoughness(windMs: number): number {
  return (COX_MUNK.base + COX_MUNK.perMs * windMs) ** 0.25;
}

/**
 * Vent de surface par latitude (m/s) : calmes équatoriaux, alizés, accalmie subtropicale, vents d'ouest plus forts au
 * sud (quarantièmes rugissants) ; profil réglé à l'œil sur la planche (page de sonde), dans l'ordre de grandeur de ces
 * régimes — ce n'est pas une mesure.
 */
export const WIND_BANDS: readonly [latDeg: number, ms: number][] = [
  [-90, 6], [-55, 11], [-45, 11], [-30, 6], [-15, 7.5], [-3, 4], [3, 4], [15, 7.5], [30, 5.5], [50, 9], [90, 6],
];

export function windSpeed(latDeg: number): number {
  const b = WIND_BANDS;
  const l = Math.max(-90, Math.min(90, latDeg));
  for (let i = 1; i < b.length; i++) {
    if (l <= b[i]![0]) { const [a0, v0] = b[i - 1]!, [a1, v1] = b[i]!; const t = (l - a0) / (a1 - a0); return v0 + (v1 - v0) * t * t * (3 - 2 * t); }
  }
  return b[b.length - 1]![1];
}

/** Nœud : vent (m/s) à la latitude `latDeg`, mêmes paliers que `windSpeed` ; une ondulation lente en longitude le varie. */
export function windNode(latDeg: Node<'float'>, lngRad: Node<'float'>): Node<'float'> {
  const b = WIND_BANDS;
  let v: Node<'float'> = float(b[0]![1]);
  // paliers successifs : chaque lissage est saturé hors de son intervalle (latitudes croissantes)
  for (let i = 1; i < b.length; i++) v = mix(v, float(b[i]![1]), smoothstep(float(b[i - 1]![0]), float(b[i]![0]), latDeg));
  return v.mul(sin(lngRad.mul(3)).mul(cos(latDeg.mul(Math.PI / 45))).mul(0.15).add(1));
}

/**
 * Vagues (spec océan §1.3) : texture de pentes répétable (scripts/textures, `waves-512.ktx2`), répétée `TILES` fois sur
 * un tour (une tuile ≈ 9,8 km à l'équateur) ; deux couches glissent en sens différents. Elles n'apparaissent qu'en
 * approchant : entre `MAGNIFY.from` et `MAGNIFY.to` pixels écran par tuile.
 */
export const WAVES = { tiles: 4096, magnify: { from: 48, to: 160 }, strength: 0.2, speed: [0.004, 0.0027] } as const;

/** Pentes des vagues (est, nord) au point `st` et part visible (0 de loin → 1 de près). */
export function waveSlopes(tex: THREE.Texture, st: Node<'vec2'>, pixelRad: Node<'float'>): { slope: Node<'vec2'>; shown: Node<'float'> } {
  const tileRad = (2 * Math.PI) / WAVES.tiles;
  const shown = smoothstep(float(WAVES.magnify.from), float(WAVES.magnify.to), float(tileRad).div(max(pixelRad, 1e-9)));
  const base = st.mul(vec2(WAVES.tiles, WAVES.tiles / 2));
  const a = texture(tex, base.add(vec2(time.mul(WAVES.speed[0]), time.mul(WAVES.speed[0] * 0.3)))).rg.mul(2).sub(1);
  // seconde couche tournée de 37° et à 0,71 fois l'échelle : ni ses bords ni ses motifs ne tombent sur ceux de la première
  // (tournée de 90°, le damier des tuiles se voyait au soleil, 20/10)
  const c = Math.cos((37 * Math.PI) / 180) * 0.71, s = Math.sin((37 * Math.PI) / 180) * 0.71;
  const rotated = vec2(base.x.mul(c).sub(base.y.mul(s)), base.x.mul(s).add(base.y.mul(c)));
  const b = texture(tex, rotated.add(vec2(time.mul(-WAVES.speed[1]), time.mul(WAVES.speed[1])))).rg.mul(2).sub(1);
  const bEast = b.x.mul(c).add(b.y.mul(s)), bNorth = b.y.mul(c).sub(b.x.mul(s));
  // rafales : la même texture, 11 fois plus grande, module la force des vagues par plaques
  const gust = texture(tex, base.mul(0.091).add(vec2(time.mul(0.0004), 0))).r.mul(1.4).sub(0.2).clamp(0.15, 1);
  const slope = a.add(vec2(bEast, bNorth)).mul(WAVES.strength).mul(gust).mul(shown);
  return { slope, shown };
}

/** Empreinte d'un pixel sur la sphère unité (rad), mesurée sur la position. */
export const pixelFootprint = (p: Node<'vec3'>): Node<'float'> => length(fwidth(p));

/** Rugosité de la mer : Cox et Munk au vent `wind`, moins la part de pente que dessinent les vagues visibles. */
export function seaRoughness(wind: Node<'float'>, wavesShown: Node<'float'>): Node<'float'> {
  const mss = wind.mul(COX_MUNK.perMs).add(COX_MUNK.base);
  return pow(mss, float(0.25)).mul(mix(float(1), float(0.6), wavesShown));
}

