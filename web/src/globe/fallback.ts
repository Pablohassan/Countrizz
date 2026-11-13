import * as THREE from 'three/webgpu';
import type { Backend, QualityTier } from './renderer';

/** Spec zoom §5 bis : ce qui a été retiré à la qualité haute en cours de visite (le palier « sans TRAA » est parti avec le TRAA, 06/11). */
export type Degradation = 'aucune' | 'standard';

/** Fenêtres consécutives de la résolution dynamique au plancher et encore lentes avant le repli. */
export const FALLBACK_WINDOWS = { standard: 6 } as const;

const RANK: Record<Degradation, number> = { aucune: 0, standard: 1 };

/** Le repli ne fait que descendre : il tient jusqu'à la fin de la visite, jamais annulé en cours de partie. */
export function nextDegradation(current: Degradation, slowWindowsAtFloor: number): Degradation {
  const wanted: Degradation = slowWindowsAtFloor >= FALLBACK_WINDOWS.standard ? 'standard' : 'aucune';
  return RANK[wanted] > RANK[current] ? wanted : current;
}

/** Le plus avancé des deux replis (deux demandes rapprochées, ou un repli antérieur à une recréation du renderer). */
export const maxDegradation = (a: Degradation, b: Degradation): Degradation => (RANK[b] > RANK[a] ? b : a);

export const effectiveTier = (tier: QualityTier, d: Degradation): QualityTier => (tier === 'haute' && d !== 'standard' ? 'haute' : 'standard');

/** Le transcodeur est retombé sur du RGBA (4 octets par texel au lieu de 1) : la qualité haute coûterait quatre fois la mémoire prévue. */
export const isUncompressed = (t: THREE.Texture): boolean => t.format === THREE.RGBAFormat;

const FORMATS: [number, string][] = [
  [THREE.RGBA_ASTC_4x4_Format, 'ASTC 4×4'], [THREE.RGBA_BPTC_Format, 'BC7'], [THREE.RGB_ETC2_Format, 'ETC2 RGB'],
  [THREE.RGBA_ETC2_EAC_Format, 'ETC2 RGBA'], [THREE.RGB_ETC1_Format, 'ETC1'], [THREE.RGBA_S3TC_DXT5_Format, 'BC3'],
  [THREE.RGBA_S3TC_DXT1_Format, 'BC1'], [THREE.RGB_S3TC_DXT1_Format, 'BC1'], [THREE.RGB_PVRTC_4BPPV1_Format, 'PVRTC'],
  [THREE.RGBA_PVRTC_4BPPV1_Format, 'PVRTC'], [THREE.RGBAFormat, 'RGBA (non compressé)'],
];
export const formatName = (format: number): string => FORMATS.find(([f]) => f === format)?.[1] ?? `format ${format}`;

export interface MeasureState {
  backend: Backend; tier: QualityTier; degradation: Degradation; maxTexture2D: number; format: number | null;
  dpr: number; medianMs: number | null; events: { step: Degradation; atS: number; reason: 'lenteur' | 'format' }[];
  /** `?mesure` : intervalle (ms) et calcul (ms) de chaque image depuis la dernière lecture ; l'encart les vide (frameReport.ts). */
  log?: { intervals: number[]; js: number[] };
  /** Erreurs du GPU non captées (`renderer.onError`) : leur nombre et la première (13/11 : globe invisible sur un iPhone 12). */
  gpuErrors?: { n: number; first: string };
}

const STEP: Record<Degradation, string> = { aucune: 'aucun', standard: 'standard' };
const num = (x: number, digits: number) => x.toFixed(digits).replace('.', ',');

/** L'encart `?mesure` (spec zoom §5 bis), une ligne par mesure. */
export function measureLines(m: MeasureState): string[] {
  return [
    `Moteur : ${m.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'}`,
    `Qualité : ${effectiveTier(m.tier, m.degradation)}${m.degradation === 'standard' && m.tier === 'haute' ? ' (repli)' : ''}`,
    `Textures max : ${m.maxTexture2D}`,
    `Format : ${m.format === null ? '—' : formatName(m.format)}`,
    `Densité : ${num(m.dpr, 2)}`,
    `Image : ${m.medianMs === null ? '—' : `${num(m.medianMs, 1)} ms (médiane)`}`,
    `Replis : ${m.events.length ? m.events.map((e) => `${STEP[e.step]} à ${Math.round(e.atS)} s (${e.reason})`).join(' ; ') : 'aucun'}`,
    ...(m.gpuErrors?.n ? [`Erreurs GPU : ${m.gpuErrors.n} (${m.gpuErrors.first})`] : []),
  ];
}
