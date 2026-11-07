import { describe, expect, it } from 'vitest';
import { encodeWind, parseWindCsv } from '../../lib/wind';

describe('vent de surface (NOAA NCEI Blended Seawinds) codé sur 8 bits', () => {
  it('lecture du CSV d’ERDDAP : vitesse √(u² + v²), NaN hors de la mer, rangée par latitude croissante puis longitude', () => {
    const csv = [
      'time,zlev,latitude,longitude,u_wind,v_wind', 'UTC,meters,degrees_north,degrees_east,m s-1,m s-1',
      't,10.0,-10.0,0.0,3.0,4.0', 't,10.0,-10.0,180.0,NaN,NaN', 't,10.0,10.0,0.0,0.0,-6.0', 't,10.0,10.0,180.0,1.0,0.0',
    ].join('\n');
    const g = parseWindCsv(csv);
    expect([g.width, g.height, g.lat0, g.dLat, g.lon0, g.dLon]).toEqual([2, 2, -10, 20, 0, 180]);
    expect([...g.speed]).toEqual([5, Number.NaN, 6, 1]);
  });

  // source 4 × 2 (longitudes 0, 90, 180, 270 ; latitudes −45 puis 45) → sortie 4 × 2
  const src = { width: 4, height: 2, lat0: -45, dLat: 90, lon0: 0, dLon: 90, speed: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]) };
  it('ligne 0 au nord, centres de colonnes à −135, −45, 45, 135 (même cadre que la texture de jour), interpolation bilinéaire', () => {
    const out = encodeWind(src, 4, 2, 30);
    const v = (ms: number) => Math.round((ms / 30) * 255);
    // nord (lat 45) : −135 = 225 entre 180 et 270, −45 = 315 entre 270 et 0 (raccord du méridien 0), 45, 135
    expect([...out.subarray(0, 4)]).toEqual([v(7.5), v(6.5), v(5.5), v(6.5)]);
    expect([...out.subarray(4, 8)]).toEqual([v(3.5), v(2.5), v(1.5), v(2.5)]);
  });
  it('les trous (terre, glace) prennent la moyenne de leurs voisins de mer : pas de vent nul le long des côtes', () => {
    const holed = { width: 4, height: 1, lat0: 0, dLat: 1, lon0: 0, dLon: 90, speed: new Float32Array([10, Number.NaN, Number.NaN, 20]) };
    const out = encodeWind(holed, 4, 1, 30);
    for (const x of out) expect(x).toBeGreaterThan(Math.round((10 / 30) * 255) - 1);
  });
  it('écrêté à la vitesse maximale', () => {
    expect([...encodeWind({ width: 1, height: 1, lat0: 0, dLat: 1, lon0: 0, dLon: 360, speed: new Float32Array([45]) }, 1, 1, 30)]).toEqual([255]);
  });
});
