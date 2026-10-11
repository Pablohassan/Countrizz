import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import sharp, { type Sharp } from 'sharp';
import { TEXTURE_SOURCES } from '../../textures/config';
import { NE_COUNTRIES, TEX_CACHE_DIR } from '../../textures/paths';
import { HAUTEUR_MAX, hauteurDe } from './terre';

/**
 * Peintures « pâte » de la Terre de l'intro (extraites de l'ancien `build-intro.ts`, spec intro §6), depuis les sources
 * en cache (`npm run geodata:fetch`, `npm run textures:fetch`) : couleurs du monde et de l'Europe, relief fin, hauteur
 * du relief, frontière de la France. Les flous et liserés sont donnés en DEGRÉS : la peinture garde son aspect à toute
 * définition, et les deux peintures se raccordent sans couture.
 */
sharp.cache(false);
const GEBCO = path.join(TEX_CACHE_DIR, TEXTURE_SOURCES.elevation.file);
const BMNG = path.join(TEX_CACHE_DIR, TEXTURE_SOURCES.day.file);
const SRC = 21600 / 360;   // les deux sources : 60 px par degré

export interface Box { lng0: number; lng1: number; lat0: number; lat1: number }
export const MONDE: Box = { lng0: -180, lng1: 180, lat0: -90, lat1: 90 };
/** Boîte de la peinture fine de l'Europe (degrés), là où la caméra s'approche. */
export const INTRO_EUROPE = { lng0: -25, lng1: 45, lat0: 20, lat1: 72 } as const;

/**
 * Les trois flous qui étaient en pixels dans `build-intro.ts`, convertis en degrés à la définition où ils avaient été
 * réglés (aspect validé le 10/10) ; les autres y étaient déjà en degrés.
 */
export const FLOUS = {
  /** Masque terre/mer, anticrénelage des côtes : 0,6 px de la peinture du monde à 8192 px (22,76 px/°). */
  cote: 0.6 / (8192 / 360),
  /** Relief fin, hauteur avant d'en ôter ce que porte le maillage : 1,2 px de `relief-fin.jpg` à 24 px/°. */
  reliefFin: 1.2 / 24,
  /** Hauteur du relief, altitude : 0,7 px de `relief.jpg` à 1024 px (2,84 px/°). */
  altitude: 0.7 / (1024 / 360),
  /** Hauteur du relief, terre adoucie : 1,6 px de `relief.jpg` à 1024 px. */
  terre: 1.6 / (1024 / 360),
} as const;
/** Écart type d'un flou de `deg` degrés à `pxDeg` px/° (sharp refuse moins de 0,3). */
export const sigmaPx = (deg: number, pxDeg: number) => Math.max(0.3, deg * pxDeg);

/** Les pays de Natural Earth (13 Mo, lus une fois par la fabrique). */
export type Pays = FeatureCollection<Polygon | MultiPolygon>;
export const lirePays = (fichier = NE_COUNTRIES): Pays => JSON.parse(readFileSync(fichier, 'utf8')) as Pays;

function svgTerre(pays: Pays, b: Box, w: number, h: number): Buffer {
  const polys = pays.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const X = (lng: number) => ((lng - b.lng0) / (b.lng1 - b.lng0) * w).toFixed(1), Y = (lat: number) => ((b.lat1 - lat) / (b.lat1 - b.lat0) * h).toFixed(1);
  const pxDeg = w / (b.lng1 - b.lng0);
  // un chemin par polygone (nonzero) et un fin trait : les pays voisins se touchent sans couture
  const d = polys.map((p) => '<path d="' + p.map((r) => 'M' + r.map(([a, c]) => X(a!) + ',' + Y(c!)).join('L') + 'Z').join('') + '" fill-rule="evenodd"/>').join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/><g fill="white" stroke="white" stroke-width="${(pxDeg * 0.0045).toFixed(3)}" stroke-linejoin="round">${d}</g></svg>`);
}
const gris = (img: Sharp) => img.greyscale().raw().toBuffer();
/** Une source 21600 × 10800 découpée sur la boîte et mise à la taille voulue. */
function source(fichier: string, b: Box, w: number, h: number): Sharp {
  const img = sharp(fichier, { limitInputPixels: false });
  if (b === MONDE) return img.resize(w, h, { kernel: 'lanczos3' });
  return img.extract({ left: Math.round((b.lng0 + 180) * SRC), top: Math.round((90 - b.lat1) * SRC), width: Math.round((b.lng1 - b.lng0) * SRC), height: Math.round((b.lat1 - b.lat0) * SRC) })
    .resize(w, h, { kernel: 'lanczos3' });
}

function bruit(seed: number) {
  const h = (x: number, y: number) => { let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * xf, c = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * xf; return (a + (c - a) * yf) * 2 - 1; };
}
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (s: string): [number, number, number] => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
/** Biomes : couleur Blue Marble typique → couleur pâte (mélange doux des plus proches). */
const BIOMES: [[number, number, number], [number, number, number]][] = [
  [[38, 62, 30], hex('#2f9a4a')],    // forêt dense
  [[78, 92, 52], hex('#68c44c')],    // prairie
  [[120, 118, 72], hex('#b6cf52')],  // savane
  [[196, 170, 120], hex('#f3cf78')], // désert clair
  [[176, 120, 72], hex('#ec9d52')],  // désert rouge
  [[112, 108, 96], hex('#a7b48a')],  // toundra, steppe
  [[236, 238, 244], hex('#fff8ec')], // glace
];
const MONT = hex('#a8764c'), NEIGE = hex('#fff8ec'), PLAGE = hex('#f6e0a0');
const PROFOND = hex('#2b6fd9'), LAGON = hex('#5cc3f3');
const n1 = bruit(3), n2 = bruit(11);

/** La peinture « pâte » de la boîte `b`, W × H, RGB 8 bits. */
export async function peindre(pays: Pays, b: Box, W: number, H: number): Promise<Sharp> {
  const pxDeg = W / (b.lng1 - b.lng0), f = (deg: number) => sigmaPx(deg, pxDeg);
  const [masque, masqueFlou, eauProche, elev, bm] = await Promise.all([
    gris(sharp(svgTerre(pays, b, W, H), { limitInputPixels: false }).blur(f(FLOUS.cote))),
    gris(sharp(svgTerre(pays, b, W, H), { limitInputPixels: false }).blur(f(0.1))),
    gris(sharp(svgTerre(pays, b, W / 4, H / 4), { limitInputPixels: false }).blur(f(0.7) / 4).resize(W, H, { kernel: 'cubic' })),
    gris(source(GEBCO, b, W, H).blur(f(0.07))),
    source(BMNG, b, W, H).blur(f(0.11)).removeAlpha().raw().toBuffer(),
  ]);
  const rgb = Buffer.alloc(W * H * 3), sig2 = 2 * 34 * 34;
  for (let y = 0; y < H; y++) {
    const lat = b.lat1 - (y + 0.5) / H * (b.lat1 - b.lat0);
    for (let x = 0; x < W; x++) {
      const i = y * W + x, lng = b.lng0 + (x + 0.5) / pxDeg;
      const m = masque[i]! / 255, e = Math.sqrt(elev[i]! / 255);   // racine : les reliefs moyens sont caricaturés
      const v = 0.035 * n1(lng / 4, lat / 4) + 0.02 * n2(lng / 0.97, lat / 0.97);   // teinte « faite à la main »
      const pr = ss(0.02, 0.5, eauProche[i]! / 255);
      let r = PROFOND[0] + (LAGON[0] - PROFOND[0]) * pr, g = PROFOND[1] + (LAGON[1] - PROFOND[1]) * pr, bl = PROFOND[2] + (LAGON[2] - PROFOND[2]) * pr;
      const mf = masqueFlou[i]! / 255;
      const ec = ss(0.03, 0.2, mf) * (1 - ss(0.2, 0.45, mf)) * 0.6 * (1 - m);   // liseré d'écume au ras des côtes
      r += (226 - r) * ec; g += (246 - g) * ec; bl += (255 - bl) * ec;
      if (m > 0.001) {
        const c0 = bm[i * 3]!, c1 = bm[i * 3 + 1]!, c2 = bm[i * 3 + 2]!;
        let sw = 0, tr = 0, tg = 0, tb = 0;
        for (const [ref, pal] of BIOMES) { const d = (c0 - ref[0]) ** 2 + (c1 - ref[1]) ** 2 + (c2 - ref[2]) ** 2; const w = Math.exp(-d / sig2) + 1e-6; sw += w; tr += w * pal[0]; tg += w * pal[1]; tb += w * pal[2]; }
        let lr = tr / sw, lg = tg / sw, lb = tb / sw;
        const mo = ss(0.36, 0.56, e), nei = Math.max(ss(0.6, 0.74, e), ss(66, 72, Math.abs(lat)));
        lr += (MONT[0] - lr) * mo; lg += (MONT[1] - lg) * mo; lb += (MONT[2] - lb) * mo;
        lr += (NEIGE[0] - lr) * nei; lg += (NEIGE[1] - lg) * nei; lb += (NEIGE[2] - lb) * nei;
        const pl = (1 - ss(0.62, 0.9, mf)) * (1 - nei);   // liseré de plage
        lr += (PLAGE[0] - lr) * pl; lg += (PLAGE[1] - lg) * pl; lb += (PLAGE[2] - lb) * pl;
        r += (lr - r) * m; g += (lg - g) * m; bl += (lb - bl) * m;
      }
      const k = 1 + v;
      rgb[i * 3] = Math.min(255, r * k); rgb[i * 3 + 1] = Math.min(255, g * k); rgb[i * 3 + 2] = Math.min(255, bl * k);
    }
  }
  return sharp(rgb, { raw: { width: W, height: H, channels: 3 }, limitInputPixels: false });
}

/** Flou gaussien approché en flottants (trois passes de boîte) : pas de marches d'arrondi qui dessinent des rayures. */
function flouF(src: Float32Array, W: number, H: number, rayon: number): Float32Array {
  const r = Math.max(1, Math.round(rayon));
  const a = Float32Array.from(src), c = new Float32Array(W * H);
  for (let p = 0; p < 3; p++) {
    for (let y = 0; y < H; y++) {
      let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))]!;
      for (let x = 0; x < W; x++) { c[y * W + x] = s / (2 * r + 1); s += a[y * W + Math.min(W - 1, x + r + 1)]! - a[y * W + Math.max(0, x - r)]!; }
    }
    for (let x = 0; x < W; x++) {
      let s = 0; for (let y = -r; y <= r; y++) s += c[Math.min(H - 1, Math.max(0, y)) * W + x]!;
      for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += c[Math.min(H - 1, y + r + 1) * W + x]! - c[Math.max(0, y - r) * W + x]!; }
    }
  }
  return a;
}

/**
 * Relief fin : h = 0,09 · √e^2,4 (comme le maillage) moins ce que le maillage porte déjà (flou de 0,35°), en gris
 * 16 bits : v / 65535 = ½ + ½ · tanh(détail / S), S = 99ᵉ centile de |détail| (rayons terrestres) ; ½ = rien à ajouter.
 */
export async function reliefFin(b: Box, W: number, H: number): Promise<{ img: Sharp; S: number }> {
  const pxDeg = W / (b.lng1 - b.lng0);
  const brutH = await gris(source(GEBCO, b, W, H));
  const h = new Float32Array(W * H); for (let i = 0; i < W * H; i++) h[i] = 0.09 * Math.pow(Math.sqrt(brutH[i]! / 255), 2.4);
  const hl = flouF(h, W, H, FLOUS.reliefFin * pxDeg), floue = flouF(h, W, H, (0.35 * pxDeg) / 1.7);
  const det = new Float32Array(W * H); for (let i = 0; i < W * H; i++) det[i] = hl[i]! - floue[i]!;
  const tri = Float32Array.from(det.filter((_, i) => i % 7 === 0).map(Math.abs)).sort();
  const S = tri[Math.floor(tri.length * 0.99)] || 1;
  const px = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) px[i] = Math.round(32767.5 + 32767.5 * Math.tanh(det[i]! / S));
  return { img: sharp(px, { raw: { width: W, height: H, channels: 1 } }).toColourspace('grey16'), S };
}

/**
 * Hauteur du relief en pâte sur le monde, W × H, en gris 16 bits : v / 65535 · HAUTEUR_MAX = `hauteurDe(terre, altitude)`
 * (rayons terrestres), la terre adoucie et l'altitude floutées comme `relief.jpg` l'était pour le maillage de scene.ts.
 */
export async function hauteur(pays: Pays, W: number, H: number): Promise<Uint16Array> {
  const pxDeg = W / 360;
  const [terre, alt] = await Promise.all([
    gris(sharp(svgTerre(pays, MONDE, W, H), { limitInputPixels: false }).blur(sigmaPx(FLOUS.terre, pxDeg))),
    gris(source(GEBCO, MONDE, W, H).blur(sigmaPx(FLOUS.altitude, pxDeg))),
  ]);
  const out = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.round((hauteurDe(terre[i]! / 255, alt[i]! / 255) / HAUTEUR_MAX) * 65535);
  return out;
}

/** Frontière de la France métropolitaine : le plus grand anneau dans sa boîte, simplifié (Douglas-Peucker 0,008°). */
export function france(pays: Pays): [number, number][] {
  const fra = pays.features.find((f) => f.properties?.ADM0_A3 === 'FRA')!;
  const anneaux = (fra.geometry.type === 'Polygon' ? [fra.geometry.coordinates] : fra.geometry.coordinates).map((p) => p[0]!);
  const aire = (r: number[][]) => Math.abs(r.reduce((s, [a, b], i) => { const [c, e] = r[(i + 1) % r.length]!; return s + a! * e! - c! * b!; }, 0) / 2);
  const ring = anneaux.filter((r) => r.every(([a, b]) => a! > -6 && a! < 10 && b! > 41 && b! < 52)).sort((a, b) => aire(b) - aire(a))[0]!;
  const dp = (pts: number[][], eps: number): number[][] => {
    if (pts.length < 3) return pts;
    const a = pts[0]!, b = pts.at(-1)!;
    let dm = 0, im = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const d = Math.abs((b[1]! - a[1]!) * p[0]! - (b[0]! - a[0]!) * p[1]! + b[0]! * a[1]! - b[1]! * a[0]!) / (Math.hypot(b[1]! - a[1]!, b[0]! - a[0]!) || 1e-9);
      if (d > dm) { dm = d; im = i; }
    }
    return dm > eps ? [...dp(pts.slice(0, im + 1), eps).slice(0, -1), ...dp(pts.slice(im), eps)] : [a, b];
  };
  // un anneau fermé a ses deux bouts confondus : on le simplifie en deux moitiés
  const mi = Math.floor(ring.length / 2);
  return [...dp(ring.slice(0, mi + 1), 0.008).slice(0, -1), ...dp(ring.slice(mi), 0.008)].map(([a, b]) => [+a!.toFixed(3), +b!.toFixed(3)]);
}
