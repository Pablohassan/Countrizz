/** Boîte géographique (degrés) ; `west` et `east` peuvent sortir de [−180, 180] (longitudes déroulées autour d'un centre). */
export interface GeoBox { west: number; south: number; east: number; north: number }

/**
 * Grille plate carrée calée sur la grille mondiale : le pas vaut 90 / n degrés, de sorte que ±90° et ±180° tombent
 * sur des bords de pixels (les requêtes coupées à l'antiméridien se recollent sans demi-pixel).
 */
export interface Grid extends GeoBox { step: number; width: number; height: number }

export function snapGrid(box: GeoBox, maxStepDeg: number): Grid {
  const step = 90 / Math.ceil(90 / maxStepDeg);
  const i0 = Math.floor(box.west / step + 1e-9), i1 = Math.ceil(box.east / step - 1e-9);
  const j0 = Math.max(-90 / step, Math.floor(box.south / step + 1e-9)), j1 = Math.min(90 / step, Math.ceil(box.north / step - 1e-9));
  return { west: i0 * step, east: i1 * step, south: j0 * step, north: j1 * step, step, width: i1 - i0, height: j1 - j0 };
}

/** Une requête GetMap : boîte en longitudes de [−180, 180], taille, et place (x, y) dans la mosaïque. */
export interface WmsRequest { bbox: [number, number, number, number]; width: number; height: number; x: number; y: number }

/** Découpe la grille en requêtes de `maxPx` au plus (colonnes et lignes égales au plus près), coupées à l'antiméridien. */
export function planRequests(g: Grid, maxPx = 4096): WmsRequest[] {
  const i0 = Math.round(g.west / g.step), j1 = Math.round(g.north / g.step), half = Math.round(180 / g.step);
  const split = (n: number) => {
    const parts = Math.ceil(n / maxPx);
    return Array.from({ length: parts + 1 }, (_, k) => Math.round((k * n) / parts));
  };
  const xs = new Set(split(g.width));
  // antiméridien : colonne globale i telle que i · pas = 180 + 360 k
  for (let x = 1; x < g.width; x++) if ((((i0 + x - half) % (2 * half)) + 2 * half) % (2 * half) === 0) xs.add(x);
  const cols = [...xs].sort((a, b) => a - b), rows = split(g.height);
  const out: WmsRequest[] = [];
  for (let r = 0; r + 1 < rows.length; r++) {
    const ya = rows[r]!, yb = rows[r + 1]!;
    const north = (j1 - ya) * g.step, south = (j1 - yb) * g.step;
    for (let c = 0; c + 1 < cols.length; c++) {
      const xa = cols[c]!, xb = cols[c + 1]!;
      const west = (i0 + xa) * g.step, east = (i0 + xb) * g.step;
      const shift = 360 * Math.floor((west + 180) / 360);
      out.push({ bbox: [west - shift, south, east - shift, north], width: xb - xa, height: yb - ya, x: xa, y: ya });
    }
  }
  return out;
}
