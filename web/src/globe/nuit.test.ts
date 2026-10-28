import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atmosphereParameters } from './atmosphere';
import { fondNuit, neutral, NUIT } from './nuit';

/** Linéaire → sRGB 8 bits (la sortie du post-traitement). */
const srgb8 = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));

describe('ciel du globe : la nuit de la vidéo (mise en scène du 24/10)', () => {
  it('NUIT est la nuit de l’interface et de la vidéo (--nuit, theme.css)', () => {
    const css = readFileSync(new URL('../ui/theme.css', import.meta.url), 'utf8');
    const hex = /--nuit:\s*#([0-9a-f]{6})/i.exec(css)![1]!;
    expect(NUIT).toEqual([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  });

  it('le fond, passé par la chaîne de l’image (× balance des blancs, Neutral, sRGB), sort en NUIT — avec et sans l’atmosphère physique', async () => {
    const { skyCalibration } = await import('./physicalSky');
    for (const wb of [[1, 1, 1], skyCalibration(atmosphereParameters()).whiteBalance] as [number, number, number][]) {
      const fond = fondNuit(wb);
      const sortie = neutral(fond.map((v, i) => v * wb[i]!) as [number, number, number]).map(srgb8);
      expect(sortie, `balance ${wb.join(', ')}`).toEqual([...NUIT]);
    }
  });

  it('Neutral : identité moins le décalage sous 0,08, compression au-dessus de 0,76 (three, Khronos PBR Neutral)', () => {
    const [r, g, b] = neutral([0.05, 0.1, 0.2]);
    const off = 0.05 - 6.25 * 0.05 ** 2;
    expect([r, g, b].map((v) => +v.toFixed(9))).toEqual([0.05 - off, 0.1 - off, 0.2 - off].map((v) => +v.toFixed(9)));
    expect(Math.max(...neutral([5, 5, 5]))).toBeLessThan(1);
  });
});
