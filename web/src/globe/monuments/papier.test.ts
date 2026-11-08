import { describe, expect, it } from 'vitest';
import { construire, LARGEUR, triangles, type Piece } from './papier';

type T = ReturnType<typeof triangles>[number];
/** Volume orienté (théorème de la divergence) : juste seulement si toutes les faces regardent dehors. */
const volume = (ts: T[]) => ts.reduce((s, [a, b, c]) => s + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);
/** Chaque arête orientée a sa jumelle inverse : surface fermée, orientée d'un seul tenant. */
function fermee(ts: T[]): boolean {
  const k = (p: readonly number[]) => p.map((x) => x.toFixed(6)).join(',');
  const n = new Map<string, number>();
  for (const t of ts) for (let i = 0; i < 3; i++) {
    const e = `${k(t[i]!)}>${k(t[(i + 1) % 3]!)}`;
    n.set(e, (n.get(e) ?? 0) + 1);
  }
  return [...n].every(([e, c]) => { const [a, b] = e.split('>'); return n.get(`${b}>${a}`) === c; });
}

describe('pièces d\'une maquette en papier', () => {
  it('tour à 4 côtés de rayon 1 et de hauteur 1 : un prisme carré fermé de volume 2', () => {
    const ts = triangles({ tour: [[1, 0], [1, 1]], cotes: 4, couleur: 0 });
    expect(ts).toHaveLength(8 + 2 + 2);
    expect(fermee(ts)).toBe(true);
    expect(volume(ts)).toBeCloseTo(2, 6);
  });

  it('pointe (rayon 0 au sommet) : pyramide sans triangle plat, volume base × h / 3', () => {
    const ts = triangles({ tour: [[1, 0], [0, 3]], cotes: 4, couleur: 0 });
    expect(ts).toHaveLength(4 + 2);
    expect(fermee(ts)).toBe(true);
    expect(volume(ts)).toBeCloseTo(2, 6);
  });

  it('marche (même hauteur, rayon qui change) et centre décalé : toujours fermée et dehors', () => {
    const ts = triangles({ tour: [[1, 0, 0.5, 0], [1, 1, 0.5, 0], [0.5, 1, 0.5, 0], [0.5, 2, 0.5, 0]], cotes: 4, couleur: 0 });
    expect(fermee(ts)).toBe(true);
    expect(volume(ts)).toBeCloseTo(2 + 0.5, 6);
  });

  it('boîte 1 × 2 × 3 tournée : 12 triangles, fermée, volume 6', () => {
    const ts = triangles({ boite: [0.3, 1, -0.2], taille: [1, 2, 3], couleur: 0, tourne: 30 });
    expect(ts).toHaveLength(12);
    expect(fermee(ts)).toBe(true);
    expect(volume(ts)).toBeCloseTo(6, 6);
  });

  it('anneau à hauteurs inégales (Colisée en ruine) : volume des segments, faces dehors', () => {
    const n = 16, R = 2, r = 1, hauts = Array.from({ length: n }, (_, i) => (i < 4 ? 0.6 : 1));
    const ts = triangles({ anneau: { R, r, hauts }, couleur: 0 });
    const secteur = (Math.sin((2 * Math.PI) / n) / 2) * (R * R - r * r);
    expect(volume(ts)).toBeCloseTo(secteur * hauts.reduce((s, h) => s + h, 0), 6);
  });
});

describe('maquette assemblée', () => {
  const pieces: Piece[] = [
    { boite: [0, 0.5, 0], taille: [2, 1, 2], couleur: 0x112233 },
    { tour: [[0.5, 1], [0, 3]], cotes: 6, couleur: 0x445566 },
  ];

  it('ramenée à une hauteur 1, posée sur y = 0', () => {
    const m = construire(pieces);
    const ys = Array.from(m.positions).filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(1, 6);
  });

  it('large et basse (Muraille, Colisée) : ramenée par sa largeur, LARGEUR × largeur = 1', () => {
    const m = construire([{ boite: [0, 0.25, 0], taille: [4, 0.5, 1], couleur: 0 }]);
    const xs = Array.from(m.positions).filter((_, i) => i % 3 === 0);
    expect(LARGEUR * (Math.max(...xs) - Math.min(...xs))).toBeCloseTo(1, 6);
  });

  it('une couleur par triangle, celle de sa pièce', () => {
    const m = construire(pieces);
    expect(m.couleurs).toHaveLength(m.positions.length / 9);
    expect(m.couleurs[0]).toBe(0x112233);
    expect(m.couleurs.at(-1)).toBe(0x445566);
  });
});
