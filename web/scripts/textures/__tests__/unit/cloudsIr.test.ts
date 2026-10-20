import { describe, expect, it } from 'vitest';
import { cloudCover, cloudTop, modeAKelvin, polarWeight, toEquirect } from '../../lib/cloudsIr';

describe('nuages d’après l’infrarouge GMGSI (spec nuages §1)', () => {
  it('comptes mode A → kelvins (NOAA OSPO) : 660 − 2T au-dessus de 242 K, 418 − T en dessous', () => {
    expect(modeAKelvin(0)).toBe(330);
    expect(modeAKelvin(176)).toBe(242);
    expect(modeAKelvin(177)).toBe(241);
    expect(modeAKelvin(255)).toBe(163);
  });
  it('couverture sur terre : nulle au sol clair, pleine 40 K plus froid, croissante entre les deux', () => {
    expect(cloudCover(290, 290, false)).toBe(0);
    expect(cloudCover(291, 290 + 2, false)).toBe(0);
    expect(cloudCover(250, 290, false)).toBe(1);
    let prev = 0;
    for (let d = 0; d <= 40; d += 1) { const c = cloudCover(290 - d, 290, false); expect(c).toBeGreaterThanOrEqual(prev); prev = c; }
  });
  it('couverture en mer : la mer change peu de température, un nuage bas (7,5 K) y est déjà bien visible', () => {
    expect(cloudCover(290, 290, true)).toBe(0);
    expect(cloudCover(290 - 15, 290, true)).toBe(1);
    expect(cloudCover(290 - 7.5, 290, true)).toBeGreaterThan(0.4);
    expect(cloudCover(290 - 7.5, 290, false)).toBeLessThan(0.15);
  });
  it('sommet très froid hors glaces : nuage même si le sol de référence était couvert ; pas sur les glaces', () => {
    // 240 K sous un sol de référence à 258 K (ciel resté couvert) : la règle absolue (265 → 225 K, × 0,9) l'emporte
    const t = 25 / 40, abs = 0.9 * t * t * (3 - 2 * t);
    expect(cloudCover(240, 258, false)).toBeCloseTo(abs, 6);
    expect(cloudCover(240, 250, false)).toBeLessThan(0.2);
  });
  it('hauteur du sommet : ΔT / 6,5 K·km⁻¹, bornée à 16 km, rendue en fraction de 16 km', () => {
    expect(cloudTop(0)).toBe(0);
    expect(cloudTop(6.5 * 8)).toBeCloseTo(0.5, 9);
    expect(cloudTop(500)).toBe(1);
    expect(cloudTop(-3)).toBe(0);
  });
  it('fondu polaire : GMGSI seule sous 66°, Blue Marble seule au-delà de 72°', () => {
    expect(polarWeight(0)).toBe(0);
    expect(polarWeight(-65)).toBe(0);
    expect(polarWeight(72)).toBe(1);
    expect(polarWeight(-80)).toBe(1);
    expect(polarWeight(69)).toBeCloseTo(0.5, 9);
  });
  it('Mercator → équirectangulaire : lignes choisies par la latitude, colonnes raccordées à l’antiméridien, NaN hors couverture', () => {
    // 4 colonnes de −180° à 180°, 3 lignes aux latitudes 60, 0, −60 (Mercator : pas inégaux)
    const src = new Float32Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
    const out = toEquirect(src, 4, 3, new Float32Array([60, 0, -60]), 4, 4);
    // lignes de sortie aux latitudes 67,5 (hors), 22,5, −22,5, −67,5 (hors)
    expect(Number.isNaN(out[0])).toBe(true);
    expect(Number.isNaN(out[12])).toBe(true);
    // 22,5° : 3/8 du chemin de 60 à 0 ; colonne 0 de sortie = centre du premier quart = colonne source 0,5
    expect(out[4]).toBeCloseTo((10 + 20) / 2 * (1 - 0.625) + (50 + 60) / 2 * 0.625, 4);
    // dernière colonne : entre la colonne 3 et la colonne 0 (antiméridien) → milieu de 40 et 10 côté nord
    expect(out[7]).toBeCloseTo((40 + 10) / 2 * (1 - 0.625) + (80 + 50) / 2 * 0.625, 4);
  });
});
