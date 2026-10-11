import { describe, expect, it } from 'vitest';
import { FLOUS, INTRO_EUROPE, sigmaPx } from '../../lib/peinture';

describe('flous de la peinture, en degrés', () => {
  it('rendent les pixels de build-intro.ts à la définition où ils étaient réglés', () => {
    expect(sigmaPx(FLOUS.cote, 8192 / 360)).toBeCloseTo(0.6, 12);   // masque, monde.jpg peint à 8192 px
    expect(FLOUS.reliefFin * 24).toBeCloseTo(1.2, 12);                // relief-fin.jpg à 24 px/°
    expect(sigmaPx(FLOUS.altitude, 1024 / 360)).toBeCloseTo(0.7, 12); // relief.jpg, canal R
    expect(sigmaPx(FLOUS.terre, 1024 / 360)).toBeCloseTo(1.6, 12);    // relief.jpg, canal G
  });

  it('grandissent avec la définition (même aspect à 60 px/° et à 8192 px)', () => {
    expect(sigmaPx(FLOUS.cote, 60)).toBeCloseTo(1.5820, 4);
    expect(FLOUS.reliefFin * 60).toBeCloseTo(3, 12);
    expect(sigmaPx(FLOUS.altitude, 8192 / 360)).toBeCloseTo(5.6, 12);
    expect(sigmaPx(FLOUS.terre, 8192 / 360)).toBeCloseTo(12.8, 12);
  });

  it('jamais sous 0,3 px (le minimum de sharp)', () => {
    expect(sigmaPx(FLOUS.cote, 1)).toBe(0.3);
  });

  it('boîte de l’Europe : 4200 × 3120 px à 60 px/°', () => {
    expect([(INTRO_EUROPE.lng1 - INTRO_EUROPE.lng0) * 60, (INTRO_EUROPE.lat1 - INTRO_EUROPE.lat0) * 60]).toEqual([4200, 3120]);
  });
});
