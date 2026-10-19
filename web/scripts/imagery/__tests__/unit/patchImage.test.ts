import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRAMING } from '../../../../src/camera/config';
import { arrivalAltitude, visibleHalfAngle } from '../../../../src/camera/framing';
import type { CountryRecord } from '../../../../src/data/types';
import { IMAGE_PATCH } from '../../config';
import { makeProjector } from '../../../geodata/lib/patch';
import { snapGrid } from '../../lib/grid';
import { downsamplePatch, frameBox, imageLevels, rasterizeLandGrid, renderPatch } from '../../lib/patchImage';

const RAD = Math.PI / 180;

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;

describe('chaîne de niveaux d’un pays (spec zoom §4.1)', () => {
  it('rapport 4 entre niveaux, du plus large au plus fin, rien au-delà de 30°', () => {
    for (const c of countries) {
      const e = imageLevels(c, FRAMING, IMAGE_PATCH);
      expect(e.length, c.cca3).toBeGreaterThanOrEqual(1);
      for (let i = 1; i < e.length; i++) expect(e[i - 1]! / e[i]!, c.cca3).toBeCloseTo(4, 9);
      expect(e[0]!, c.cca3).toBeLessThanOrEqual(30 * RAD + 1e-12);
      // minimale : un niveau de plus (× 4) dépasserait 30°
      expect(e[0]! * 4, c.cca3).toBeGreaterThan(30 * RAD);
    }
  });
  it('le plus fin = 2,2 × la vue d’arrivée, la plus petite des deux références, plafonnée à 30°', () => {
    for (const c of countries) {
      const want = Math.min(30 * RAD, ...IMAGE_PATCH.viewports.map((v) => 2.2 * visibleHalfAngle(arrivalAltitude(c, v, FRAMING), v)));
      expect(imageLevels(c, FRAMING, IMAGE_PATCH).at(-1)!, c.cca3).toBeCloseTo(want, 12);
    }
  });
  it('la Russie a un niveau (30°), le Vatican plusieurs, plus fins que 15 m par texel en 2048', () => {
    expect(imageLevels(by('RUS'), FRAMING, IMAGE_PATCH)).toEqual([30 * RAD]);
    const v = imageLevels(by('VAT'), FRAMING, IMAGE_PATCH);
    expect(v.length).toBeGreaterThan(1);
    expect((2 * v.at(-1)! * 6_371_000) / 2048).toBeLessThan(15);
    const total = countries.reduce((s, c) => s + imageLevels(c, FRAMING, IMAGE_PATCH).length, 0);
    console.log(`chaîne : ${total} niveaux pour ${countries.length} pays`);
  });
});

describe('boîte géographique d’un cadre azimutal', () => {
  it('contient le cadre, longitudes déroulées autour du centre', () => {
    const b = frameBox({ center: [2, 46], extentRad: 20 * RAD, size: 64 });
    expect(b.south).toBeLessThan(26.1);
    expect(b.north).toBeGreaterThan(65.9);
    expect(b.west).toBeLessThan(2 - 20);
    expect(b.east).toBeGreaterThan(2 + 20);
  });
  it('franchit l’antiméridien sans se retourner (Fidji)', () => {
    const b = frameBox({ center: [178, -17], extentRad: 20 * RAD, size: 64 });
    expect(b.east).toBeGreaterThan(180);
    expect(b.west).toBeLessThan(178);
    expect(b.east - b.west).toBeLessThan(90);
  });
  it('un pôle dans le cadre : toutes les longitudes jusqu’au pôle', () => {
    const b = frameBox({ center: [15, 70], extentRad: 30 * RAD, size: 64 });
    expect(b.north).toBe(90);
    expect(b.east - b.west).toBe(360);
  });
});

describe('masque terre sur une grille déroulée', () => {
  const square = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  it('les polygones coupés à ±180° se rejoignent dans une grille qui franchit l’antiméridien', () => {
    const g = snapGrid({ west: 175, south: -20, east: 185, north: -10 }, 1);
    const land = rasterizeLandGrid([[square(170, -20, 180, -10)], [square(-180, -20, -178, -10)]], g);
    const at = (lon: number, lat: number) => land[Math.floor(g.north - lat) * g.width + Math.floor(lon - g.west)];
    expect(at(176.5, -15.5)).toBe(1);
    expect(at(181.5, -15.5)).toBe(1); // −178,5°
    expect(at(183.5, -15.5)).toBe(0);
  });
});

describe('réduction du patch au petit niveau (2048 → 1024)', () => {
  it('la couleur de la terre (alpha 0) est conservée : l’alpha est un masque, pas une transparence', async () => {
    // 8 × 8 : terre (alpha 0) à gauche en brun, mer (alpha 255) à droite en bleu
    const n = 8, rgba = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) rgba.set(x < n / 2 ? [120, 98, 60, 0] : [20, 40, 90, 255], (y * n + x) * 4);
    const out = await downsamplePatch(rgba, n, n / 2);
    expect(out.length).toBe((n / 2) * (n / 2) * 4);
    const px = (x: number, y: number) => [...out.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
    for (const c of px(0, 1).slice(0, 3).map((v, i) => v - [120, 98, 60][i]!)) expect(Math.abs(c)).toBeLessThanOrEqual(3);
    expect(px(0, 1)[3]).toBeLessThanOrEqual(3);
    for (const c of px(3, 1).slice(0, 3).map((v, i) => v - [20, 40, 90][i]!)) expect(Math.abs(c)).toBeLessThanOrEqual(3);
    expect(px(3, 1)[3]).toBeGreaterThanOrEqual(252);
  });
});

describe('reprojection dans le cadre du contrat (PatchMeta)', () => {
  it('ligne 0 au nord, colonne 0 à l’ouest ; alpha = mer', () => {
    const frame = { center: [10, 45] as [number, number], extentRad: 10 * RAD, size: 32 };
    // couleur = (longitude + 20, latitude) × 4, dans [0, 255] ; terre à l'est du méridien 10°
    const rgba = renderPatch(frame, (lon, lat) => [Math.round((lon + 20) * 4), Math.round(lat * 4), 0], (lon) => (lon > 10 ? 1 : 0));
    const px = (x: number, y: number) => [...rgba.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)];
    const proj = makeProjector(frame);
    const [lonN, latN] = proj.toLngLat(16.5, 0.5);
    expect(px(16, 0).slice(0, 2)).toEqual([Math.round((lonN + 20) * 4), Math.round(latN * 4)]);
    expect(px(16, 0)[1]!).toBeGreaterThan(px(16, 31)[1]!); // nord en haut
    expect(px(0, 16)[0]!).toBeLessThan(px(31, 16)[0]!); // ouest à gauche
    expect(px(2, 16)[3]).toBe(255); // ouest : mer
    expect(px(29, 16)[3]).toBe(0); // est : terre
  });
});
