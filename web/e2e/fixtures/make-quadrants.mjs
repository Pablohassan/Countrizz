// Génère e2e/fixtures/quadrants.ktx2 (versionné) : 64 × 64, NO rouge, NE vert, SO bleu, SE jaune, alpha 0 (terre).
// Même encodage que les patchs image (ETC1S sRGB, mipmaps, sans --lower_left_maps_to_s0t0). Exige toktx 4.x.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import sharp from 'sharp';

const N = 64, rgba = Buffer.alloc(N * N * 4);
const colors = { nw: [230, 30, 30], ne: [30, 200, 40], sw: [30, 60, 230], se: [230, 210, 30] };
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const c = colors[`${y < N / 2 ? 'n' : 's'}${x < N / 2 ? 'w' : 'e'}`];
  rgba.set([...c, 0], (y * N + x) * 4);
}
const png = 'e2e/fixtures/quadrants.png';
await sharp(rgba, { raw: { width: N, height: N, channels: 4 } }).png().toFile(png);
const r = spawnSync('toktx', ['--t2', '--encode', 'etc1s', '--qlevel', '255', '--genmipmap', '--assign_oetf', 'srgb', 'e2e/fixtures/quadrants.ktx2', png], { stdio: 'inherit' });
rmSync(png);
process.exit(r.status ?? 1);
