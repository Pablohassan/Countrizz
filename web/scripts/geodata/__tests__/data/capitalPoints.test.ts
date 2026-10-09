import { geoDistance } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { FOV_Y_DEG, FRAMING } from '../../../../src/camera/config';
import { inArrivalView } from '../../../../src/camera/framing';
import { CAPITAL_MAX_OFFSHORE_KM } from '../../config';
import { byCca3, loadCountries, sample, texelKm } from './helpers';

const all = loadCountries();
const DEG = 180 / Math.PI;
const viewports = [
  { name: 'téléphone en portrait', width: 390, height: 844, fovYDeg: FOV_Y_DEG },
  { name: 'bureau', width: 960, height: 600, fovYDeg: FOV_Y_DEG },
];

describe('position des capitales (spec 2A §6)', () => {
  it('chaque pays a une position de capitale valide', () => {
    for (const c of all) {
      const [lng, lat] = c.capitalLngLat;
      expect(Math.abs(lng), c.cca3).toBeLessThanOrEqual(180);
      expect(Math.abs(lat), c.cca3).toBeLessThanOrEqual(90);
    }
  });

  it('capitale dans le pays ou à moins de 25 km de sa côte, selon son patch', () => {
    for (const c of all) {
      const s = sample(c, c.capitalLngLat);
      if (s.r > 128) continue;
      const reach = c.patch.rangeTexels * texelKm(c);
      // r = 1 : distance saturée, le patch ne mesure pas au-delà de `reach` ; le build l'a contrôlée sur le contour.
      if (s.r <= 1) { expect(reach, `${c.cca3} : patch saturé`).toBeLessThan(CAPITAL_MAX_OFFSHORE_KM); continue; }
      expect(((128 - s.r) / 127) * reach, `${c.cca3} : capitale en mer`).toBeLessThan(CAPITAL_MAX_OFFSHORE_KM);
    }
  });

  it('capitale dans le cadre de la caméra à l\'arrivée, en portrait comme sur bureau (antiméridien compris)', () => {
    for (const c of all) {
      const offsetDeg = geoDistance(c.capitalLngLat, c.cap.center) * DEG;
      for (const v of viewports) expect(inArrivalView(offsetDeg, c.cap.radiusDeg, v, FRAMING), `${c.cca3}, ${v.name}`).toBe(true);
    }
  });

  it('Kiribati : calotte ancrée sur les îles Gilbert, autour de Tarawa', () => {
    const k = byCca3(all, 'KIR');
    expect(geoDistance(k.capitalLngLat, k.cap.center) * DEG).toBeLessThan(10);
    expect(k.cap.center[0]).toBeGreaterThan(160);
  });

  it('points imposés aux coordonnées sourcées (overrides.capitalPoints)', () => {
    expect(byCca3(all, 'GNQ').capitalLngLat).toEqual([10.8236, 1.5925]);
    expect(byCca3(all, 'NRU').capitalLngLat).toEqual([166.925, -0.54556]);
    expect(byCca3(all, 'PLW').capitalLngLat).toEqual([134.62417, 7.50056]);
    expect(byCca3(all, 'PSE').capitalLngLat).toEqual([35.23417, 31.77667]);
  });

  it('Niamey : la capitale nationale, pas l\'homonyme à 7° E', () => {
    expect(byCca3(all, 'NER').capitalLngLat[0]).toBeLessThan(3);
  });
});
