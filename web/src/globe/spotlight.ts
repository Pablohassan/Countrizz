import { clamp, float, max, min, sin, smoothstep } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';

/**
 * Mise en avant du pays (spec 2026-10-21 mise en avant) : courbes de la mise en scène à l'arrivée et exposition par pays,
 * en deux versions — nombres (tests) et nœuds TSL (shader de la couche pays) — tirées des mêmes constantes.
 *
 * Temps en secondes depuis la question : les voisins s'assombrissent (`dim`), le liseré se dessine (`draw`), la pièce se
 * soulève avec un rebond (`lift`, le « back-out » des boutons, ≈ 1,12 au plus), un reflet traverse le pays (`sweep`) ;
 * ensuite le liseré respire (`breath`, période en secondes).
 */
export const ARRIVAL = {
  dim: { from: 0, to: 0.4 },
  draw: { from: 0.15, to: 0.75 },
  lift: { from: 0.35, to: 0.8, overshoot: 1.9 },
  sweep: { from: 0.55, to: 1.05 },
  breathPeriod: 2.4,
} as const;

/** Exposition par pays : luminance linéaire des terres de sa photo ramenée vers `target`, gain de 1 à `maxGain`. */
export const EXPOSURE = { target: 0.06, maxGain: 2 } as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const backOut = (x: number, s: number) => (x <= 0 ? 0 : 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2);

export function arrivalCurves(t: number): { dim: number; draw: number; lift: number; sweep: number } {
  const { dim, draw, lift, sweep } = ARRIVAL;
  return {
    dim: smooth(dim.from, dim.to, t),
    draw: smooth(draw.from, draw.to, t),
    lift: backOut(clamp01((t - lift.from) / (lift.to - lift.from)), lift.overshoot),
    sweep: clamp01((t - sweep.from) / (sweep.to - sweep.from)),
  };
}

export const breath = (t: number): number => 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / ARRIVAL.breathPeriod);

export const exposureGain = (landLuminance: number): number =>
  Math.min(EXPOSURE.maxGain, Math.max(1, EXPOSURE.target / Math.max(landLuminance, 1e-6)));

// — versions TSL —
const clampN = (x: Node<'float'>) => clamp(x, 0, 1);
const ramp = (a: number, b: number, t: Node<'float'>) => clampN(t.sub(a).div(b - a));

export function arrivalNodes(t: Node<'float'>) {
  const { dim, draw, lift, sweep } = ARRIVAL;
  const x = ramp(lift.from, lift.to, t), y = x.sub(1), s = lift.overshoot;
  return {
    dim: smoothstep(float(dim.from), float(dim.to), t),
    draw: smoothstep(float(draw.from), float(draw.to), t),
    lift: max(y.mul(y).mul(y).mul(s + 1).add(y.mul(y).mul(s)).add(1), 0).mul(x.greaterThan(0).select(float(1), float(0))),
    sweep: ramp(sweep.from, sweep.to, t),
  };
}

export const breathNode = (t: Node<'float'>): Node<'float'> => sin(t.mul((2 * Math.PI) / ARRIVAL.breathPeriod)).mul(0.5).add(0.5);

export const exposureGainNode = (landLuminance: Node<'float'>): Node<'float'> =>
  min(float(EXPOSURE.maxGain), max(float(1), float(EXPOSURE.target).div(max(landLuminance, 1e-6))));
