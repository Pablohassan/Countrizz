import type { Piece } from './papier';

/**
 * Maquettes du pilote (08/11) : dix pays, demandés par l'utilisateur (France, États-Unis, Chine, Égypte, Inde, Brésil…) et
 * complétés par des formes différentes (montagne, arène, tour d'horloge, coupoles). Unités libres : `construire` les ramène
 * à un encombrement 1. Face avant vers +z ; couleurs de papier (sRGB).
 */
const CREME = 0xfff8e7, OR = 0xd9a82e, SOMBRE = 0x3b3340;

/** Quatre positions (±a, ±b) autour du centre. */
const coins = (a: number, b = a): [number, number][] => [[-a, -b], [a, -b], [-a, b], [a, b]];

const eiffel = (): Piece[] => {
  const fer = 0x9a6040, plateau = 0x6a3f2a;
  return [
    // pieds courbes, qui se rejoignent sous la première plateforme
    ...coins(0.55).map(([x, z]): Piece => ({ tour: [[0.13, 0, x, z], [0.1, 0.3, x * 0.72, z * 0.72], [0.085, 0.62, x * 0.5, z * 0.5]], cotes: 4, tourne: 45, couleur: fer })),
    { boite: [0, 0.66, 0], taille: [0.82, 0.09, 0.82], couleur: plateau },
    { tour: [[0.4, 0.7], [0.3, 1.0], [0.24, 1.3]], cotes: 4, tourne: 45, couleur: fer },
    { boite: [0, 1.34, 0], taille: [0.6, 0.08, 0.6], couleur: plateau },
    { tour: [[0.22, 1.38], [0.07, 2.75]], cotes: 4, tourne: 45, couleur: fer },
    { boite: [0, 2.8, 0], taille: [0.14, 0.1, 0.14], couleur: plateau },
    { tour: [[0.035, 2.85], [0, 3.15]], cotes: 4, tourne: 45, couleur: plateau },
  ];
};

const liberte = (): Piece[] => {
  const cuivre = 0x6fb59b, pierre = 0xd8c9a3;
  return [
    { tour: [[0.78, 0], [0.78, 0.14]], cotes: 4, tourne: 45, couleur: 0xc9b48a },
    { tour: [[0.44, 0.14], [0.38, 0.26], [0.31, 0.26], [0.29, 1.0], [0.35, 1.04], [0.35, 1.1]], cotes: 4, tourne: 45, couleur: pierre },
    { tour: [[0.25, 1.1], [0.21, 1.6], [0.15, 1.85], [0.07, 1.95]], cotes: 7, couleur: cuivre },
    { tour: [[0.06, 1.93], [0.085, 2.01], [0.07, 2.09], [0, 2.13]], cotes: 6, couleur: cuivre },
    ...[-2, -1, 0, 1, 2].map((i): Piece => ({ tour: [[0.022, 2.07, 0.04 * Math.sin(i * 0.6), 0.03], [0, 2.21, 0.15 * Math.sin(i * 0.6), 0.05]], cotes: 3, couleur: cuivre })),
    // bras droit levé (à gauche vu de face), torche et flamme ; tablette au bras gauche
    { tour: [[0.05, 1.72, -0.12, 0], [0.035, 2.36, -0.21, 0]], cotes: 5, couleur: cuivre },
    { tour: [[0.035, 2.34, -0.21, 0], [0.065, 2.42, -0.21, 0]], cotes: 6, couleur: 0xc79a3a },
    { tour: [[0.055, 2.42, -0.21, 0], [0, 2.58, -0.21, 0]], cotes: 5, couleur: 0xf5b833 },
    { boite: [0.16, 1.55, 0.09], taille: [0.09, 0.24, 0.05], couleur: cuivre, tourne: -15 },
  ];
};

const muraille = (): Piece[] => {
  const pierre = 0xcdb98f, tuile = 0x9a4a32;
  // ligne de crête : x, z, hauteur du chemin de ronde
  const crete: [number, number, number][] = [[-1.3, 0.25, 0.12], [-0.65, -0.1, 0.3], [0, 0.18, 0.5], [0.65, -0.15, 0.36], [1.3, 0.12, 0.6]];
  const out: Piece[] = [];
  crete.slice(1).forEach(([x1, z1, y1], i) => {
    const [x0, z0, y0] = crete[i]!, y = (y0 + y1) / 2, dx = x1 - x0, dz = z1 - z0, a = (Math.atan2(dz, dx) * 180) / Math.PI;
    const len = Math.hypot(dx, dz);
    out.push({ boite: [(x0 + x1) / 2, y / 2, (z0 + z1) / 2], taille: [len, y, 0.12], couleur: pierre, tourne: a });
    for (let k = 1; k < 5; k++) {
      const f = k / 5;
      out.push({ boite: [x0 + dx * f, y + 0.035, z0 + dz * f], taille: [0.07, 0.07, 0.13], couleur: pierre, tourne: a });
    }
  });
  for (const [x, z, y] of crete) {
    out.push({ boite: [x, (y + 0.22) / 2, z], taille: [0.24, y + 0.22, 0.24], couleur: 0xb9a274 });
    out.push({ tour: [[0.2, y + 0.22, x, z], [0, y + 0.4, x, z]], cotes: 4, tourne: 45, couleur: tuile });
  }
  return out;
};

const pyramides = (): Piece[] => [
  { tour: [[1, 0], [0, 0.9]], cotes: 4, tourne: 45, couleur: 0xe6c27a },
  { tour: [[0.62, 0, -1.15, -0.75], [0, 0.56, -1.15, -0.75]], cotes: 4, tourne: 45, couleur: 0xd9b066 },
  { tour: [[0.3, 0, 0.95, -0.9], [0, 0.27, 0.95, -0.9]], cotes: 4, tourne: 45, couleur: 0xd9b066 },
];

const taj = (): Piece[] => {
  const marbre = 0xf6f1e6, socle = 0xe6d8bd;
  return [
    { boite: [0, 0.08, 0], taille: [2.2, 0.16, 2.2], couleur: socle },
    { tour: [[0.62, 0.16], [0.62, 0.76]], cotes: 8, tourne: 22.5, couleur: marbre },
    { boite: [0, 0.43, 0.56], taille: [0.34, 0.46, 0.04], couleur: 0xd9ccb4 },
    { tour: [[0.3, 0.76], [0.3, 0.9]], cotes: 12, couleur: marbre },
    { tour: [[0.32, 0.9], [0.42, 1.05], [0.4, 1.2], [0.28, 1.35], [0.12, 1.47], [0, 1.55]], cotes: 12, couleur: marbre },
    { tour: [[0.025, 1.53], [0.02, 1.68], [0, 1.74]], cotes: 4, couleur: OR },
    ...coins(0.42).map(([x, z]): Piece => ({ tour: [[0.08, 0.76, x, z], [0.1, 0.86, x, z], [0, 1.0, x, z]], cotes: 8, couleur: marbre })),
    ...coins(0.95).map(([x, z]): Piece => ({ tour: [[0.08, 0.16, x, z], [0.06, 1.1, x, z], [0.09, 1.12, x, z], [0.09, 1.18, x, z], [0, 1.3, x, z]], cotes: 8, couleur: marbre })),
  ];
};

const painDeSucre = (): Piece[] => {
  const roche = 0xa49c8c, foret = 0x5f9a4f;
  return [
    { tour: [[0.58, 0], [0.6, 0.25, 0.04, 0], [0.5, 0.6, 0.1, 0], [0.36, 0.9, 0.15, 0], [0.15, 1.05, 0.18, 0], [0, 1.08, 0.18, 0]], cotes: 7, ech: [0.8, 1], couleur: roche },
    { tour: [[0.74, 0], [0.62, 0.2], [0, 0.24]], cotes: 7, ech: [0.85, 1], couleur: foret },
    { tour: [[0.5, 0, -1.05, 0.3], [0.44, 0.24, -1.05, 0.3], [0.25, 0.42, -1.0, 0.3], [0, 0.46, -1.0, 0.3]], cotes: 7, couleur: foret },
    // le téléphérique, du morro da Urca au sommet : il fait le Pain de Sucre
    { tour: [[0.012, 0.45, -0.98, 0.3], [0.012, 1.07, 0.12, 0]], cotes: 3, couleur: SOMBRE },
    { boite: [-0.42, 0.72, 0.16], taille: [0.1, 0.08, 0.07], couleur: 0xd6493f },
  ];
};

// pentes concaves, plus raides vers le sommet : vu de trois quarts d'en haut, un cône bas se lisait comme un abat-jour
const fuji = (): Piece[] => [
  { tour: [[1, 0], [0.62, 0.2], [0.36, 0.44], [0.2, 0.64], [0.13, 0.76], [0.11, 0.79]], cotes: 9, couleur: 0x5a6e9c },
  { tour: [[0.355, 0.45], [0.215, 0.64], [0.145, 0.76], [0.125, 0.81]], cotes: 9, couleur: 0xf7f7f2 },
];

const colisee = (): Piece[] => {
  const n = 24, ech: [number, number] = [1, 0.82];
  const etage = (base: number, h: number, couleur: number, ruine = false): Piece => ({
    // la ruine du côté avant gauche : l'attique manque sur quelques segments
    anneau: { R: 1, r: 0.62, base, hauts: Array.from({ length: n }, (_, i) => (ruine && i >= 5 && i <= 10 ? base + 0.06 : h)) }, couleur, ech,
  });
  return [
    { tour: [[0.62, 0], [0.62, 0.04]], cotes: n, ech, couleur: 0xc2a070 },
    etage(0, 0.18, 0xdcb98a), etage(0.18, 0.36, 0xc9a374), etage(0.36, 0.54, 0xdcb98a), etage(0.54, 0.72, 0xc9a374, true),
  ];
};

const bigBen = (): Piece[] => {
  const pierre = 0xd2b27a, cadran = 0xf8f2dc;
  const cadrans = ([[0, 0.225, 0], [0.225, 0, 90], [0, -0.225, 0], [-0.225, 0, 90]] as const).map(([x, z, a]): Piece => ({ boite: [x, 1.95, z], taille: [0.3, 0.3, 0.02], couleur: cadran, tourne: a }));
  return [
    { boite: [0, 0.15, 0], taille: [0.46, 0.3, 0.46], couleur: pierre },
    { boite: [0, 0.95, 0], taille: [0.36, 1.3, 0.36], couleur: pierre },
    { boite: [0, 1.95, 0], taille: [0.44, 0.34, 0.44], couleur: pierre },
    ...cadrans,
    { boite: [0, 1.99, 0.238], taille: [0.022, 0.1, 0.006], couleur: SOMBRE },
    { boite: [0.03, 1.95, 0.238], taille: [0.07, 0.022, 0.006], couleur: SOMBRE },
    { boite: [0, 2.23, 0], taille: [0.38, 0.22, 0.38], couleur: pierre },
    { tour: [[0.29, 2.34], [0.14, 2.6], [0.05, 2.8], [0, 2.95]], cotes: 4, tourne: 45, couleur: 0x3e4c63 },
    ...coins(0.17).map(([x, z]): Piece => ({ tour: [[0.03, 2.34, x, z], [0, 2.52, x, z]], cotes: 4, tourne: 45, couleur: OR })),
  ];
};

const saintBasile = (): Piece[] => {
  const brique = 0xb8443a;
  const coupole = (x: number, z: number, h: number, couleur: number): Piece[] => [
    { tour: [[0.14, 0.24, x, z], [0.14, h, x, z]], cotes: 8, couleur: brique },
    { tour: [[0.12, h, x, z], [0.19, h + 0.09, x, z], [0.17, h + 0.2, x, z], [0.08, h + 0.28, x, z], [0, h + 0.37, x, z]], cotes: 8, couleur },
  ];
  return [
    { boite: [0, 0.12, 0], taille: [1.6, 0.24, 1.2], couleur: brique },
    { tour: [[0.25, 0.24], [0.25, 0.92], [0.19, 0.96]], cotes: 8, couleur: brique },
    { tour: [[0.2, 0.96], [0.05, 1.55]], cotes: 8, couleur: CREME },
    { tour: [[0.05, 1.55], [0.07, 1.6], [0, 1.72]], cotes: 8, couleur: OR },
    ...coupole(-0.5, 0.33, 0.62, 0xe9c33f), ...coupole(0.5, 0.33, 0.62, 0x3a6fb5),
    ...coupole(-0.48, -0.32, 0.8, 0x2f8f5b), ...coupole(0.48, -0.32, 0.8, 0xd6493f),
  ];
};

/** Maquette de chaque pays du pilote (cca3) : l'élément retenu de `lieux.json`. */
export const MAQUETTES: Record<string, () => Piece[]> = {
  FRA: eiffel, USA: liberte, CHN: muraille, EGY: pyramides, IND: taj, BRA: painDeSucre, JPN: fuji, ITA: colisee, GBR: bigBen, RUS: saintBasile,
};
