import { describe, expect, it } from 'vitest';
import { homePose } from '../camera/home';
import { northUp, toVec } from '../geo/vec';
import { inScreen } from './bubbles';
import { markGeometry, STEM_TILT } from './marks';

const viewport = { width: 390, height: 844, fovYDeg: 50 };

describe('repères projetés de l’accueil (G5, spec 2A §3)', () => {
  it('au centre de la vue, vu d’aplomb : de face (f ≈ 1), droit (n ≈ 0)', () => {
    const dir = toVec([10, 20]);
    const m = markGeometry({ dir, altitude: 1.6, up: northUp(dir), pitch: 0, axisY: 0 }, viewport, [10, 20])!;
    expect(m.visible).toBe(true);
    expect(m.x).toBeCloseTo(195, 6);
    expect(m.y).toBeCloseTo(422, 6);
    expect(m.f).toBeGreaterThan(0.999);
    expect(Math.abs(m.n)).toBeLessThan(1e-6);
  });

  it('vue d’accueil : Rabat penché vers la gauche, Athènes vers la droite, la tige suit à 60 %', () => {
    const pose = { ...homePose(viewport), axisY: 0 };
    const rabat = markGeometry(pose, viewport, [-6.84, 34.02])!, athens = markGeometry(pose, viewport, [23.73, 37.98])!;
    expect(rabat.visible && athens.visible).toBe(true);
    expect(rabat.n).toBeLessThan(0);
    expect(athens.n).toBeGreaterThan(0);
    expect(rabat.t).toBeCloseTo(rabat.n * STEM_TILT, 12);
    // vus de biais près du limbe (la maquette : 0,8 à 0,85)
    expect(rabat.f).toBeGreaterThan(0.5);
    expect(rabat.f).toBeLessThan(0.95);
  });

  it('une bulle reste dans l’écran, à 4 px des bords', () => {
    expect(inScreen(300, 500, 120, 20, viewport)).toEqual([266, 500]);
    expect(inScreen(-30, 2, 120, 20, viewport)).toEqual([4, 4]);
    expect(inScreen(100, 830, 120, 20, viewport)).toEqual([100, 820]);
    expect(inScreen(100, 300, 120, 20, viewport)).toEqual([100, 300]);
  });

  it('derrière la Terre : caché', () => {
    const pose = { ...homePose(viewport), axisY: 0 };
    const m = markGeometry(pose, viewport, [-170, -20]);
    expect(m === null || !m.visible).toBe(true);
  });
});
