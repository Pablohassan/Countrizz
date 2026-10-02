import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { LngLat } from '../src/data/types';
import type { BackendName } from './sdf-check';

export type Rgb = [number, number, number];

/** Ouvre la sonde, attend le rendu, renvoie la capture et l'échantillonneur de pixels par coordonnées géographiques. */
export async function shoot(page: Page, backend: BackendName, query: string, size = { width: 960, height: 600 }) {
  await page.setViewportSize(size);
  await page.goto(`/probe.html?${query}&w=${size.width}&h=${size.height}${backend === 'webgl2' ? '&webgl' : ''}`);
  await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 30_000 });
  const got = await page.evaluate(() => window.__probe!.backend);
  if (got !== backend) throw new Error(`backend ${got} obtenu au lieu de ${backend}`);
  const png = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, ...size } }));
  const px = ([x, y]: [number, number]): Rgb => {
    const i = (Math.floor(y) * png.width + Math.floor(x)) * 4;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  };
  const at = async (points: LngLat[]): Promise<Rgb[]> => {
    const screen = await page.evaluate((p) => window.__probe!.project(p), points);
    return screen.map((s, k) => { if (!s) throw new Error(`${points[k]} derrière l'horizon`); return px(s); });
  };
  return { png, px, at };
}
