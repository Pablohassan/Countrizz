/**
 * Masque terre (1) / mer (0) équirectangulaire `width × height`, ligne 0 au nord, colonne 0 à −180°.
 * Chaque polygone (anneaux en [lng, lat], trous compris) est rempli en pair-impair aux centres de pixels ;
 * les polygones se combinent par OU (deux pays qui se recouvrent restent de la terre).
 */
export function rasterizeLandMask(polygons: number[][][][], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const xs: number[] = [];
  for (const poly of polygons) {
    let minLat = 90, maxLat = -90;
    for (const ring of poly) for (const p of ring) { minLat = Math.min(minLat, p[1]!); maxLat = Math.max(maxLat, p[1]!); }
    const rowFrom = Math.max(0, Math.floor(((90 - maxLat) / 180) * height));
    const rowTo = Math.min(height - 1, Math.ceil(((90 - minLat) / 180) * height));
    for (let y = rowFrom; y <= rowTo; y++) {
      const lat = 90 - ((y + 0.5) / height) * 180;
      xs.length = 0;
      for (const ring of poly) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [lngA, latA] = ring[i]!, [lngB, latB] = ring[j]!;
          if (latA! > lat !== latB! > lat) xs.push(lngA! + ((lat - latA!) * (lngB! - lngA!)) / (latB! - latA!));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(((xs[k]! + 180) / 360) * width - 0.5));
        const to = Math.min(width - 1, Math.floor(((xs[k + 1]! + 180) / 360) * width - 0.5));
        for (let x = from; x <= to; x++) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}
