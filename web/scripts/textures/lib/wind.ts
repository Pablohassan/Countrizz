/**
 * Vent de surface (spec océan §1.2 bis, 07/11) : NOAA NCEI Blended Seawinds v2, grille de 0,25°, un relevé de six heures lu
 * par ERDDAP en CSV. La mer y prend sa rugosité (Cox et Munk) : fronts, cyclones, calmes sous le vent des îles marbrent le
 * reflet du soleil.
 */
export interface WindGrid {
  width: number; height: number;
  /** Première latitude (degrés, la plus au sud) et pas ; première longitude et pas. */
  lat0: number; dLat: number; lon0: number; dLon: number;
  /** Vitesse (m/s), rangée par latitude croissante puis longitude ; NaN hors de la mer (terre, glace). */
  speed: Float32Array;
}

/** CSV d'ERDDAP (`time,zlev,latitude,longitude,u_wind,v_wind`, deux lignes d'en-tête), latitude puis longitude croissantes. */
export function parseWindCsv(csv: string): WindGrid {
  const rows = csv.trim().split('\n').slice(2);
  const lats: number[] = [], lons: number[] = [];
  const speed = new Float32Array(rows.length);
  rows.forEach((row, i) => {
    const c = row.split(',');
    const lat = Number(c[2]), lon = Number(c[3]), u = Number(c[4]), v = Number(c[5]);
    if (lats.length === 0 || lats[lats.length - 1] !== lat) lats.push(lat);
    if (lats.length === 1) lons.push(lon);
    speed[i] = Math.hypot(u, v);   // NaN si l'une manque
  });
  const width = lons.length, height = lats.length;
  if (width * height !== rows.length) throw new Error(`vent : ${rows.length} lignes pour ${height} latitudes × ${width} longitudes`);
  return { width, height, lat0: lats[0]!, dLat: height > 1 ? lats[1]! - lats[0]! : 1, lon0: lons[0]!, dLon: width > 1 ? lons[1]! - lons[0]! : 360, speed };
}

/** Comble les trous par la moyenne des voisins connus, de proche en proche (la longitude fait le tour). */
function fillHoles(g: WindGrid): Float32Array {
  const { width: w, height: h } = g;
  let cur = Float32Array.from(g.speed);
  for (;;) {
    const next = Float32Array.from(cur);
    let holes = 0, filled = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!Number.isNaN(cur[y * w + x]!)) continue;
      holes++;
      let s = 0, n = 0;
      for (const [nx, ny] of [[(x + 1) % w, y], [(x + w - 1) % w, y], [x, y - 1], [x, y + 1]] as const) {
        if (ny < 0 || ny >= h) continue;
        const v = cur[ny * w + nx]!;
        if (!Number.isNaN(v)) { s += v; n++; }
      }
      if (n) { next[y * w + x] = s / n; filled++; }
    }
    cur = next;
    if (holes === 0) return cur;
    if (filled === 0) { cur.forEach((v, i) => { if (Number.isNaN(v)) cur[i] = 0; }); return cur; }
  }
}

/**
 * Image `outW × outH` (ligne 0 au nord, colonne 0 à la longitude −180, centres de pixels : même cadre que la texture de
 * jour), vitesse 0 → `maxMs` sur 0 → 255, écrêtée ; interpolation bilinéaire, la longitude fait le tour.
 */
export function encodeWind(g: WindGrid, outW: number, outH: number, maxMs: number): Uint8Array {
  const full = fillHoles(g);
  const out = new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const lat = 90 - ((y + 0.5) * 180) / outH;
    const fy = Math.min(g.height - 1, Math.max(0, (lat - g.lat0) / g.dLat));
    const y0 = Math.floor(fy), y1 = Math.min(g.height - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < outW; x++) {
      const lon = -180 + ((x + 0.5) * 360) / outW;
      const fx = ((((lon - g.lon0) / g.dLon) % g.width) + g.width) % g.width;
      const x0 = Math.floor(fx), x1 = (x0 + 1) % g.width, tx = fx - x0;
      const at = (xx: number, yy: number) => full[yy * g.width + xx]!;
      const v = (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
      out[y * outW + x] = Math.round(Math.min(1, v / maxMs) * 255);
    }
  }
  return out;
}
