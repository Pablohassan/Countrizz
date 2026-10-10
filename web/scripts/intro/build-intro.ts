/**
 * Textures de l'intro en pâte à modeler (spec `2026-10-10-countrizz-intro-pate-accueil-design.md` §6), depuis les
 * sources déjà en cache (`npm run geodata:fetch`, `npm run textures:fetch`) :
 *  - `monde.jpg` : la peinture « pâte » du monde, 4096 × 2048 (22,8 px/° divisé par 2) ;
 *  - `europe.jpg` : l'Europe et le Maghreb à 48 px/° (là où la caméra s'approche) ;
 *  - `relief-fin.jpg` : la hauteur fine de ce relief (ce que le maillage ne porte pas, compressée en tanh), 24 px/° ;
 *  - `relief.jpg` : le déplacement du maillage (R = altitude, G = terre adoucie), 1024 × 512 ;
 *  - `france.json` : la frontière de la France métropolitaine (Douglas-Peucker 0,008°).
 * Les flous et liserés sont donnés en DEGRÉS : les deux peintures se raccordent sans couture.
 * Usage : `npm run intro`.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import sharp, { type Sharp } from 'sharp';
import { TEXTURE_SOURCES } from '../textures/config';
import { NE_COUNTRIES, TEX_CACHE_DIR } from '../textures/paths';
import { INTRO_EUROPE } from '../../src/intro/boxes';

sharp.cache(false);
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/intro');
const GEBCO = path.join(TEX_CACHE_DIR, TEXTURE_SOURCES.elevation.file);
const BMNG = path.join(TEX_CACHE_DIR, TEXTURE_SOURCES.day.file);
const SRC = 21600 / 360;   // les deux sources : 60 px par degré

interface Box { lng0: number; lng1: number; lat0: number; lat1: number }
const MONDE: Box = { lng0: -180, lng1: 180, lat0: -90, lat1: 90 };
const EUROPE: Box = INTRO_EUROPE;

const ne = JSON.parse(readFileSync(NE_COUNTRIES, 'utf8')) as FeatureCollection<Polygon | MultiPolygon>;
const polys = ne.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));

function svgTerre(b: Box, w: number, h: number): Buffer {
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

async function peindre(b: Box, W: number, H: number): Promise<Sharp> {
  const pxDeg = W / (b.lng1 - b.lng0), f = (deg: number) => Math.max(0.3, deg * pxDeg);
  const [masque, masqueFlou, eauProche, elev, bm] = await Promise.all([
    gris(sharp(svgTerre(b, W, H), { limitInputPixels: false }).blur(0.6)),
    gris(sharp(svgTerre(b, W, H), { limitInputPixels: false }).blur(f(0.1))),
    gris(sharp(svgTerre(b, W / 4, H / 4), { limitInputPixels: false }).blur(f(0.7) / 4).resize(W, H, { kernel: 'cubic' })),
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

/** Relief fin : h = 0,09 · √e^2,4 (comme le maillage) moins ce que le maillage porte déjà (flou de 0,35°). */
async function reliefFin(b: Box, W: number, H: number): Promise<Sharp> {
  const pxDeg = W / (b.lng1 - b.lng0);
  const brutH = await gris(source(GEBCO, b, W, H));
  const h = new Float32Array(W * H); for (let i = 0; i < W * H; i++) h[i] = 0.09 * Math.pow(Math.sqrt(brutH[i]! / 255), 2.4);
  const hl = flouF(h, W, H, 1.2), floue = flouF(h, W, H, (0.35 * pxDeg) / 1.7);
  const det = new Float32Array(W * H); for (let i = 0; i < W * H; i++) det[i] = hl[i]! - floue[i]!;
  // hauteur fine, compressée (tanh) sur le 99ᵉ centile ; 128 = rien à ajouter au maillage
  const tri = Float32Array.from(det.filter((_, i) => i % 7 === 0).map(Math.abs)).sort();
  const S = tri[Math.floor(tri.length * 0.99)] || 1;
  const px = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) px[i] = Math.round(127.5 + 127.5 * Math.tanh(det[i]! / S));
  console.log(`relief fin : échelle de codage ${S.toFixed(5)} (rayons terrestres)`);
  return sharp(px, { raw: { width: W, height: H, channels: 1 } });
}

/** Frontière de la France métropolitaine : le plus grand anneau dans sa boîte, simplifié (Douglas-Peucker 0,008°). */
function france(): [number, number][] {
  const fra = ne.features.find((f) => f.properties?.ADM0_A3 === 'FRA')!;
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

mkdirSync(OUT, { recursive: true });
// Peintures : aplats doux, la couleur sous-échantillonnée (4:2:0) ne se voit pas ; pentes et relief : deux canaux de données (4:4:4).
const jpeg = { quality: 90, mozjpeg: true } as const, donnees = { quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' } as const;
const monde = await peindre(MONDE, 8192, 4096);
await monde.resize(4096, 2048, { kernel: 'lanczos3' }).jpeg(jpeg).toFile(path.join(OUT, 'monde.jpg'));
const EW = (EUROPE.lng1 - EUROPE.lng0) * 48, EH = (EUROPE.lat1 - EUROPE.lat0) * 48;
await (await peindre(EUROPE, EW, EH)).jpeg(jpeg).toFile(path.join(OUT, 'europe.jpg'));
await (await reliefFin(EUROPE, (EUROPE.lng1 - EUROPE.lng0) * 24, (EUROPE.lat1 - EUROPE.lat0) * 24)).jpeg(donnees).toFile(path.join(OUT, 'relief-fin.jpg'));
const DW = 1024, DH = 512;
const [dm, de] = await Promise.all([gris(sharp(svgTerre(MONDE, DW, DH)).blur(1.6)), gris(source(GEBCO, MONDE, DW, DH).blur(0.7))]);
const d3 = Buffer.alloc(DW * DH * 3);
for (let i = 0; i < DW * DH; i++) { d3[i * 3] = de[i]!; d3[i * 3 + 1] = dm[i]!; }
await sharp(d3, { raw: { width: DW, height: DH, channels: 3 } }).jpeg({ ...donnees, quality: 95 }).toFile(path.join(OUT, 'relief.jpg'));
writeFileSync(path.join(OUT, 'france.json'), JSON.stringify(france()));
let total = 0;
for (const f of ['monde.jpg', 'europe.jpg', 'relief-fin.jpg', 'relief.jpg', 'france.json']) { const s = statSync(path.join(OUT, f)).size; total += s; console.log(`${f} ${s} octets`); }
console.log(`total ${total} octets`);
