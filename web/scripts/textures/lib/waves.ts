/**
 * Pentes de vagues répétables (spec océan §1.3) : somme de houles sinusoïdales à nombres d'onde ENTIERS sur le carré
 * `size × size` (la texture se raccorde bord à bord), amplitudes d'un spectre de mer du vent (∝ k⁻² environ, coupé aux
 * plus grandes vagues), directions étalées autour du vent (axe x). Tirage déterministe (graine).
 */
export interface Wave { kx: number; ky: number; amp: number; phase: number }

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function waveSet(count: number, seed = 7): Wave[] {
  const r = rng(seed), waves: Wave[] = [];
  while (waves.length < count) {
    const k = 2 + Math.floor(r() * 30);                // longueurs d'onde : de size/2 à size/31
    const theta = (r() - 0.5) * Math.PI * 0.9;         // ± 81° autour du vent
    const kx = Math.round(k * Math.cos(theta)), ky = Math.round(k * Math.sin(theta));
    if (kx === 0 && ky === 0) continue;
    const kk = Math.hypot(kx, ky);
    waves.push({ kx, ky, amp: (1 / (kk * kk)) * (0.5 + r()), phase: r() * Math.PI * 2 });
  }
  return waves;
}

/** Pente (dh/dx, dh/dy) au point (x, y) du carré de côté `size` ; périodique de période `size`. */
export function slopeAt(waves: Wave[], x: number, y: number, size: number): [number, number] {
  let sx = 0, sy = 0;
  for (const w of waves) {
    const kx = (2 * Math.PI * w.kx) / size, ky = (2 * Math.PI * w.ky) / size;
    const c = Math.cos(kx * x + ky * y + w.phase) * w.amp * size / (2 * Math.PI);
    sx -= kx * c;
    sy -= ky * c;
  }
  return [sx, sy];
}

/** Texture RG (2 canaux, 128 = pente nulle) : pentes normalisées sur le maximum rencontré. */
export function waveTexture(size: number, waves: Wave[]): { rg: Uint8Array; maxSlope: number } {
  const s = new Float32Array(size * size * 2);
  let max = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [a, b] = slopeAt(waves, x, y, size);
    s[(y * size + x) * 2] = a; s[(y * size + x) * 2 + 1] = b;
    max = Math.max(max, Math.abs(a), Math.abs(b));
  }
  const rg = new Uint8Array(size * size * 2);
  for (let i = 0; i < s.length; i++) rg[i] = Math.round(127.5 + (s[i]! / max) * 127.5);
  return { rg, maxSlope: max };
}
