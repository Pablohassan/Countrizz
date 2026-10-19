import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { FRAMING } from './config';
import { arrivalAltitude, arrivalShare, arrivalZoom, capShare, frameAltitude, limitingHalfAngle, sizeFactor, visibleHalfAngle } from './framing';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;
const phone = { width: 390, height: 844, fovYDeg: 50 };
const desk = { width: 1440, height: 900, fovYDeg: 50 };
const a = FRAMING.arrival!;

describe('cadrage à l’arrivée (spec zoom §2)', () => {
  it('les superficies extrêmes de FRAMING sont celles de countries.json', () => {
    const areas = countries.map((c) => c.areaKm2);
    expect(a.areaRange).toEqual({ maxKm2: Math.max(...areas), minKm2: Math.min(...areas) });
  });

  it('facteur de taille : 1,1 pour la Russie, 3 pour le Vatican, décroissant avec la superficie', () => {
    expect(sizeFactor(by('RUS').areaKm2, a)).toBeCloseTo(1.1, 12);
    expect(sizeFactor(by('VAT').areaKm2, a)).toBeCloseTo(3, 12);
    expect(sizeFactor(by('FRA').areaKm2, a)).toBeCloseTo(1.46, 2);
    expect(sizeFactor(1e3, a)).toBeGreaterThan(sizeFactor(1e4, a));
  });

  it('table du spec sur téléphone 390 × 844 (part B → part visée)', () => {
    const rows: [string, number, number][] = [['RUS', 1.13, 0.8], ['USA', 0.742, 0.8], ['FRA', 0.329, 0.48], ['BEL', 0.144, 0.258], ['LUX', 0.042, 0.1], ['VAT', 0.001, 0.1]];
    for (const [cca3, b, target] of rows) {
      const r = by(cca3);
      expect(capShare(r.cap.radiusDeg, frameAltitude(r.cap.radiusDeg, phone, FRAMING), phone), `${cca3} part B`).toBeCloseTo(b, 2);
      expect(arrivalShare(r, phone, FRAMING), `${cca3} part visée`).toBeCloseTo(target, 2);
    }
    expect(arrivalZoom(by('VAT'), phone, FRAMING)).toBeGreaterThan(100);
  });

  for (const [name, v] of [['téléphone', phone], ['bureau', desk]] as const) {
    it(`${name} : les 197 pays entre 10 % et 80 %, et l’altitude rend exactement la part visée`, () => {
      for (const c of countries) {
        const s = arrivalShare(c, v, FRAMING);
        expect(s, c.cca3).toBeGreaterThanOrEqual(0.1);
        expect(s, c.cca3).toBeLessThanOrEqual(0.8);
        const alt = arrivalAltitude(c, v, FRAMING);
        expect(alt, `${c.cca3} au plancher`).toBeGreaterThan(FRAMING.floor);
        expect(capShare(c.cap.radiusDeg, alt, v), c.cca3).toBeCloseTo(s, 6);
      }
    });
  }

  it('la vue d’ensemble ne borne plus l’arrivée : Russie (3,18) et Indonésie (2,27) au-dessus de 2,2 sur téléphone', () => {
    expect(arrivalAltitude(by('RUS'), phone, FRAMING)).toBeCloseTo(3.18, 2);
    expect(arrivalAltitude(by('IDN'), phone, FRAMING)).toBeCloseTo(2.27, 2);
  });

  it('sans `arrival`, le cadrage B est inchangé', () => {
    const b = { ...FRAMING, arrival: undefined };
    const r = by('FRA');
    expect(arrivalAltitude(r, phone, b)).toBe(frameAltitude(r.cap.radiusDeg, phone, b));
    expect(arrivalZoom(r, phone, b)).toBe(1);
  });
});

describe('demi-angle au sol vu sur le petit côté', () => {
  it('basse altitude : altitude × tan α ; loin : borné par l’horizon', () => {
    const alpha = limitingHalfAngle(phone);
    expect(visibleHalfAngle(1e-4, phone) / (1e-4 * Math.tan(alpha))).toBeCloseTo(1, 3);
    expect(visibleHalfAngle(50, phone)).toBeCloseTo(Math.acos(1 / 51), 12);
  });
  it('à l’arrivée, le bord du champ sur le petit côté est exactement à ce demi-angle (197 pays)', () => {
    for (const c of countries) {
      const alt = arrivalAltitude(c, phone, FRAMING);
      const g = visibleHalfAngle(alt, phone) * (180 / Math.PI);
      if (g >= (Math.acos(1 / (1 + alt)) * 180) / Math.PI - 1e-9) continue;
      expect(capShare(g, alt, phone), c.cca3).toBeCloseTo(1, 9);
    }
  });
});
