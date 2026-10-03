import { describe, expect, it } from 'vitest';
import { makeProjector } from '../../../geodata/lib/patch';
import { snapGrid } from '../../lib/grid';
import { frameBox, imageExtentRad, rasterizeLandGrid, renderPatch } from '../../lib/patchImage';

const RAD = Math.PI / 180;
const B = { margin: 3, minContextDeg: 3 };

describe('emprise du patch image : la vue d’arrivée, plafonnée', () => {
  it('petit pays : contexte minimal × marge × facteur de vue (3 × 3 × 2,2 = 19,8°)', () => {
    expect(imageExtentRad(0.38, B, { viewFactor: 2.2, maxExtentDeg: 30 })).toBeCloseTo(19.8 * RAD, 12);
  });
  it('pays moyen : son rayon × marge × facteur (France, θ = 4,866° → 32,1°, plafonné à 30°)', () => {
    expect(imageExtentRad(4.866456, B, { viewFactor: 2.2, maxExtentDeg: 40 })).toBeCloseTo(4.866456 * 3 * 2.2 * RAD, 12);
    expect(imageExtentRad(4.866456, B, { viewFactor: 2.2, maxExtentDeg: 30 })).toBeCloseTo(30 * RAD, 12);
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
