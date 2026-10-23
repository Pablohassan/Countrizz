import { describe, expect, it } from 'vitest';
import { AtmosphereParameters } from '@takram/three-atmosphere/webgpu';
import { ATMOSPHERE, atmosphereParameters } from './atmosphere';

const EARTH_M = 6_371_000;

describe('atmosphère à l’échelle du globe (spec atmosphère §1)', () => {
  const ref = new AtmosphereParameters();
  const p = atmosphereParameters();
  const k = ATMOSPHERE.thickness;

  it('unité du monde = rayon terrestre : bas de l’atmosphère sur la sphère unité, sommet exagéré', () => {
    expect(p.worldToUnit).toBeCloseTo(EARTH_M / 1000, 9);
    expect(p.bottomRadius).toBe(1);
    expect(p.topRadius).toBeCloseTo(1 + ((ref.topRadius - ref.bottomRadius) * k) / EARTH_M, 12);
  });

  it('épaisseur optique verticale inchangée (Rayleigh, Mie, ozone) : mêmes couleurs, couche plus épaisse', () => {
    // Rayleigh et Mie : β × hauteur d'échelle (exp(−h/H) intégrée de 0 à ∞) ; ozone : β × ∫ du profil en tente
    const tau = (q: AtmosphereParameters, unitM: number) => ({
      rayleigh: (q.rayleighScattering.z / unitM) * (-1 / q.rayleighDensity.layers[1].expScale) * unitM,
      mie: (q.mieExtinction.x / unitM) * (-1 / q.mieDensity.layers[1].expScale) * unitM,
      ozone: (q.absorptionExtinction.y / unitM) * q.absorptionDensity.layers[0].width * unitM,
    });
    const a = tau(ref, 1), b = tau(p, EARTH_M);
    expect(b.rayleigh).toBeCloseTo(a.rayleigh, 9);
    expect(b.mie).toBeCloseTo(a.mie, 9);
    expect(b.ozone).toBeCloseTo(a.ozone, 9);
  });

  it('le relief soulevé (Everest × 10) reste dans l’atmosphère', () => {
    expect(p.topRadius - 1).toBeGreaterThan((10 * 8850) / EARTH_M * 2);
  });
});

describe('branchement de la bibliothèque (spec atmosphère §2)', () => {
  it('calibration : même luminance que l’ancien soleil (3), soleil ramené au blanc', async () => {
    const { skyCalibration } = await import('./physicalSky');
    const ref = new AtmosphereParameters();
    const { exposure, whiteBalance } = skyCalibration(ref);
    const sun = (['x', 'y', 'z'] as const).map((k, i) => ref.solarIrradiance[k] * ref.sunRadianceToLuminance[k] * ref.luminanceScale * whiteBalance[i]!);
    expect(sun[0]).toBeCloseTo(sun[1]!, 12);
    expect(sun[2]).toBeCloseTo(sun[1]!, 12);
    const raw = (['x', 'y', 'z'] as const).map((k) => ref.solarIrradiance[k] * ref.sunRadianceToLuminance[k] * ref.luminanceScale);
    expect(exposure * (0.2126 * raw[0]! + 0.7152 * raw[1]! + 0.0722 * raw[2]!)).toBeCloseTo(3, 12);
  });
  it('marche du rayon : 24 pas, au centre du disque comme au limbe (la bibliothèque en fait x + (y − x)·d / 100, d en km, sans plafond)', async () => {
    const { SKY_STEPS } = await import('./physicalSky');
    const p = atmosphereParameters();
    const pas = (dKm: number) => Math.floor(SKY_STEPS[0] + ((SKY_STEPS[1] - SKY_STEPS[0]) * dKm) / 100);
    // vu de l'espace : de son sommet jusqu'au sol, à la verticale (≈ 600 km, atmosphère exagérée) et au ras du limbe (≈ 2 830 km)
    const vertical = (p.topRadius - 1) * p.worldToUnit, rasant = Math.sqrt(p.topRadius ** 2 - 1) * p.worldToUnit;
    expect([pas(vertical), pas(rasant)]).toEqual([24, 24]);
  });
  it('décalage de la marche du rayon : format de la bibliothèque, mêmes valeurs à chaque image, bien réparti', async () => {
    const { jitterVolume } = await import('./physicalSky');
    const v = jitterVolume();
    expect(v.length).toBe(128 * 128 * 64);
    const slice = 128 * 128;
    expect(v.subarray(0, slice)).toEqual(v.subarray(63 * slice, 64 * slice));
    const hist = new Array<number>(8).fill(0);
    for (let i = 0; i < slice; i++) hist[v[i]! >> 5]! += 1;
    for (const h of hist) expect(Math.abs(h / slice - 1 / 8)).toBeLessThan(0.02);
  });
});
