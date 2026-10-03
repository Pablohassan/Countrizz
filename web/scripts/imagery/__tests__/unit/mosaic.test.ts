import { describe, expect, it } from 'vitest';
import { snapGrid } from '../../lib/grid';
import { assemble, sampleBilinear } from '../../lib/mosaic';
import { getMapUrl, isImage } from '../../lib/wms';

describe('requête GetMap (WMS 1.1.1, EPSG:4326)', () => {
  it('écrit la boîte en lon/lat, la taille et le format JPEG', () => {
    const url = getMapUrl({ base: 'https://tiles.maps.eox.at/wms', layer: 's2cloudless-2025' },
      { bbox: [-180, -90, 0, 90], width: 4096, height: 4096, x: 0, y: 0 });
    expect(url).toBe('https://tiles.maps.eox.at/wms?service=WMS&version=1.1.1&request=GetMap&layers=s2cloudless-2025&styles=&srs=EPSG:4326'
      + '&bbox=-180,-90,0,90&width=4096&height=4096&format=image/jpeg');
  });
  it('n’écrit jamais de notation exponentielle ni de bruit flottant', () => {
    const url = getMapUrl({ base: 'b', layer: 'l' }, { bbox: [0.1 + 0.2, 1e-7, 6.6000000000000005, 50.2], width: 1, height: 1, x: 0, y: 0 });
    expect(url).toContain('&bbox=0.3,0.0000001,6.6,50.2&');
  });
  it('accepte un JPEG, ou un PNG (servi dès qu’un bord est transparent, ex. à 180°), refuse une erreur XML servie en 200', () => {
    expect(isImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(isImage(new TextEncoder().encode('<?xml version="1.0"?><ServiceExceptionReport>'))).toBe(false);
  });
});

describe('mosaïque plate carrée', () => {
  // grille de 4 × 2 pixels de 45° : ouest −180, nord 90
  const g = snapGrid({ west: -180, south: -90, east: 0, north: 90 }, 45);
  const tile = (rgb: number[]) => new Uint8Array(Array.from({ length: 2 * 2 }, () => rgb).flat());

  it('place chaque requête à sa colonne et à sa ligne', () => {
    const m = assemble(g, [
      { request: { bbox: [-90, -90, 0, 90], width: 2, height: 2, x: 2, y: 0 }, rgb: tile([0, 0, 255]) },
      { request: { bbox: [-180, -90, -90, 90], width: 2, height: 2, x: 0, y: 0 }, rgb: tile([255, 0, 0]) },
    ]);
    expect([g.width, g.height]).toEqual([4, 4]);
    expect([...m.rgb.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect([...m.rgb.subarray(3 * 3, 3 * 4)]).toEqual([0, 0, 255]);
  });

  it('échantillonne en bilinéaire aux centres de pixels, et déroule la longitude', () => {
    const grid = snapGrid({ west: 170, south: 0, east: 190, north: 10 }, 10); // 2 × 1 pixels : [170, 180] puis [180, 190]
    const m = { grid, rgb: new Uint8Array([0, 0, 0, 200, 100, 50]) };
    expect(sampleBilinear(m, 175, 5)).toEqual([0, 0, 0]);
    expect(sampleBilinear(m, -175, 5)).toEqual([200, 100, 50]); // −175° = 185° dans la grille déroulée
    expect(sampleBilinear(m, 180, 5)).toEqual([100, 50, 25]);
  });

  it('refuse une requête dont l’image n’a pas la taille demandée', () => {
    expect(() => assemble(g, [{ request: { bbox: [-180, -90, -90, 90], width: 2, height: 2, x: 0, y: 0 }, rgb: new Uint8Array(3) }])).toThrow(/taille/);
  });
});
