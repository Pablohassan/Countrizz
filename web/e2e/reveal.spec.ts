import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} révélation de la France : vague, bonne et mauvaise réponse`, async ({ page }) => {
    const paris: [number, number] = [2.35, 48.85];
    const [hidden] = await (await shoot(page, backend, 'mode=game&cca3=FRA&reveal=0')).at([paris]);
    const [question] = await (await shoot(page, backend, 'mode=game&cca3=FRA&reveal=1')).at([paris]);
    const [correct] = await (await shoot(page, backend, 'mode=game&cca3=FRA&state=correct&t=2')).at([paris]);
    const [wrong] = await (await shoot(page, backend, 'mode=game&cca3=FRA&state=wrong&t=0.125')).at([paris]);
    console.log(backend, JSON.stringify({ hidden, question, correct, wrong }));
    const yellow = (c: number[]) => c[0]! > 180 && c[1]! > 170 && c[2]! < 90;
    expect(yellow(hidden!)).toBe(false);
    expect(yellow(question!)).toBe(true);
    expect(correct![1]).toBeGreaterThan(correct![0]! + 20);
    expect(wrong![0]).toBeGreaterThan(wrong![1]! + 40);
  });
}
