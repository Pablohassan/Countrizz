// Prototype v4 : la même peinture « pâte à modeler » à deux résolutions.
//  - pate-8192.jpg / pate-4096.jpg : le monde entier (22,8 px par degré)
//  - detail-europe.jpg : l'Europe et le Maghreb à 48 px par degré, là où la caméra s'approche
//  - pente-europe.png : les pentes fines du relief (ce que le maillage ne porte pas), en gradient est/nord
//  - relief-2048.png : le déplacement du maillage ; france.json : la frontière
// Les flous sont donnés en DEGRÉS : les deux peintures se raccordent sans couture visible.
// Usage : node fabrique-v4.cjs <dossier web> <dossier de sortie>
const fs = require('fs'), path = require('path');
const web = process.argv[2], out = process.argv[3];
const sharp = require(path.join(web, 'node_modules/sharp')); sharp.cache(false);
const GEBCO = path.join(web, 'scripts/textures/.cache/gebco08-elev-21600.tif');
const BMNG = path.join(web, 'scripts/textures/.cache/bmng-200407-21600.png');
const SRC = 21600 / 360;   // les deux sources : 60 px par degré
const MONDE = { lng0: -180, lng1: 180, lat0: -90, lat1: 90 };
const EUROPE = { lng0: -25, lng1: 45, lat0: 20, lat1: 72 };
const ne = JSON.parse(fs.readFileSync(path.join(web, 'scripts/geodata/.cache/ne_10m_admin_0_countries.geojson'), 'utf8'));
const polys = ne.features.flatMap((f) => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);

function svgTerre(b, w, h) {
  const X = (lng) => ((lng - b.lng0) / (b.lng1 - b.lng0) * w).toFixed(1), Y = (lat) => ((b.lat1 - lat) / (b.lat1 - b.lat0) * h).toFixed(1);
  const pxDeg = w / (b.lng1 - b.lng0);
  // un chemin par polygone, en nonzero, plus un fin trait : les pays voisins se touchent sans couture
  const d = polys.map((p) => '<path d="' + p.map((r) => 'M' + r.map(([a, c]) => X(a) + ',' + Y(c)).join('L') + 'Z').join('') + '" fill-rule="evenodd"/>').join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/><g fill="white" stroke="white" stroke-width="${(pxDeg * 0.0045).toFixed(3)}" stroke-linejoin="round">${d}</g></svg>`);
}
const gris = (img) => img.greyscale().raw().toBuffer();
// une source 21600 × 10800 découpée sur la boîte et mise à la taille voulue
function source(fichier, b, w, h) {
  const img = sharp(fichier, { limitInputPixels: false });
  if (b === MONDE) return img.resize(w, h, { kernel: 'lanczos3' });
  return img.extract({ left: Math.round((b.lng0 + 180) * SRC), top: Math.round((90 - b.lat1) * SRC), width: Math.round((b.lng1 - b.lng0) * SRC), height: Math.round((b.lat1 - b.lat0) * SRC) })
    .resize(w, h, { kernel: 'lanczos3' });
}

function bruit(seed) {
  const h = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * xf, c = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * xf; return (a + (c - a) * yf) * 2 - 1; };
}
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const BIOMES = [
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

async function peindre(b, W, H) {
  const pxDeg = W / (b.lng1 - b.lng0), f = (deg) => Math.max(0.3, deg * pxDeg);
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
      const m = masque[i] / 255, e = Math.sqrt(elev[i] / 255);   // racine : les reliefs moyens sont caricaturés
      const v = 0.035 * n1(lng / 4, lat / 4) + 0.02 * n2(lng / 0.97, lat / 0.97);   // teinte « faite à la main »
      const pr = ss(0.02, 0.5, eauProche[i] / 255);
      let r = PROFOND[0] + (LAGON[0] - PROFOND[0]) * pr, g = PROFOND[1] + (LAGON[1] - PROFOND[1]) * pr, bl = PROFOND[2] + (LAGON[2] - PROFOND[2]) * pr;
      const mf = masqueFlou[i] / 255;
      const ec = ss(0.03, 0.2, mf) * (1 - ss(0.2, 0.45, mf)) * 0.6 * (1 - m);   // liseré d'écume au ras des côtes
      r += (226 - r) * ec; g += (246 - g) * ec; bl += (255 - bl) * ec;
      if (m > 0.001) {
        const c0 = bm[i * 3], c1 = bm[i * 3 + 1], c2 = bm[i * 3 + 2];
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

// pentes fines : h = 0,09 · racine(e)^2,4 (comme le maillage), moins ce que le maillage porte déjà (flou de 0,35°)
async function pentes(b, W, H) {
  const pxDeg = W / (b.lng1 - b.lng0);
  const brutH = await gris(source(GEBCO, b, W, H));
  const h = new Float32Array(W * H); for (let i = 0; i < W * H; i++) h[i] = 0.09 * Math.pow(Math.sqrt(brutH[i] / 255), 2.4);
  // flous en flottants (trois passes de boîte ≈ gaussienne) : pas de marches d'arrondi qui dessinent des rayures
  const flouF = (src, r) => { let a = Float32Array.from(src), c = new Float32Array(W * H); r = Math.max(1, Math.round(r));
    for (let p = 0; p < 3; p++) {
      for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) { c[y * W + x] = s / (2 * r + 1); s += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; } }
      for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += c[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += c[Math.min(H - 1, y + r + 1) * W + x] - c[Math.max(0, y - r) * W + x]; } } }
    return a; };
  const hl = flouF(h, 1.2), floue = flouF(h, 0.35 * pxDeg / 1.7);
  const det = new Float32Array(W * H); for (let i = 0; i < W * H; i++) det[i] = hl[i] - floue[i];
  const RAD = Math.PI / 180, gE = new Float32Array(W * H), gN = new Float32Array(W * H);
  let max = 0;
  for (let y = 1; y < H - 1; y++) {
    const lat = b.lat1 - (y + 0.5) / H * (b.lat1 - b.lat0), cl = Math.max(0.2, Math.cos(lat * RAD));
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      gE[i] = (det[i + 1] - det[i - 1]) / (2 / pxDeg * RAD * cl);   // dh / distance vers l'est (rayon terrestre = 1)
      gN[i] = (det[i - W] - det[i + W]) / (2 / pxDeg * RAD);         // dh / distance vers le nord
      max = Math.max(max, Math.abs(gE[i]), Math.abs(gN[i]));
    }
  }
  const tri = Float32Array.from(gE.filter((_, i) => i % 7 === 0).map(Math.abs)).sort(); const S = tri[Math.floor(tri.length * 0.95)] || 1;
  const px = Buffer.alloc(W * H * 3);
  let sature = 0;
  for (let i = 0; i < W * H; i++) {
    const a = Math.tanh(gE[i] / S), c = Math.tanh(gN[i] / S); if (Math.abs(a) > 1 || Math.abs(c) > 1) sature++;
    px[i * 3] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, a))); px[i * 3 + 1] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, c))); px[i * 3 + 2] = 128;
  }
  console.log('pentes : max', max.toFixed(3), '· saturés', sature, 'sur', W * H, '· échelle', S);
  return sharp(px, { raw: { width: W, height: H, channels: 3 } });
}

(async () => {
  console.time('monde');
  const monde = await peindre(MONDE, 8192, 4096);
  await monde.clone().jpeg({ quality: 94, mozjpeg: true }).toFile(path.join(out, 'pate-8192.jpg'));
  await monde.clone().resize(4096, 2048, { kernel: 'lanczos3' }).jpeg({ quality: 94, mozjpeg: true }).toFile(path.join(out, 'pate-4096.jpg'));
  console.timeEnd('monde');
  console.time('europe');
  const EW = (EUROPE.lng1 - EUROPE.lng0) * 48, EH = (EUROPE.lat1 - EUROPE.lat0) * 48;
  const europe = await peindre(EUROPE, EW, EH);
  await europe.clone().jpeg({ quality: 94, mozjpeg: true }).toFile(path.join(out, 'detail-europe.jpg'));
  await europe.clone().extract({ left: Math.round((-6 - EUROPE.lng0) * 48), top: Math.round((52 - 52) * 48 + (EUROPE.lat1 - 52) * 48), width: 16 * 48, height: 11 * 48 }).toFile(path.join(out, 'crop-france-detail.png'));
  const pe = await pentes(EUROPE, (EUROPE.lng1 - EUROPE.lng0) * 24, (EUROPE.lat1 - EUROPE.lat0) * 24);
  await pe.png({ compressionLevel: 9 }).toFile(path.join(out, 'pente-europe.png'));
  console.timeEnd('europe');
  console.log('europe', EW, 'x', EH, JSON.stringify(EUROPE));

  // déplacement du maillage : R = relief, G = terre adoucie (le socle forme un biseau)
  const DW = 2048, DH = 1024;
  const [dm, de] = await Promise.all([gris(sharp(svgTerre(MONDE, DW, DH)).blur(3.2)), gris(source(GEBCO, MONDE, DW, DH).blur(1.4))]);
  const d3 = Buffer.alloc(DW * DH * 3);
  for (let i = 0; i < DW * DH; i++) { d3[i * 3] = de[i]; d3[i * 3 + 1] = dm[i]; }
  await sharp(d3, { raw: { width: DW, height: DH, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(out, 'relief-2048.png'));

  for (const f of ['pate-8192.jpg', 'pate-4096.jpg', 'detail-europe.jpg', 'pente-europe.png', 'relief-2048.png', 'france.json']) console.log(f, fs.statSync(path.join(out, f)).size, 'octets');
})();
