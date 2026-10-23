import { expect, test } from '@playwright/test';

/**
 * Coût d'une image (analyse du manque de fluidité sur téléphone, 23/10) : ce que la page envoie au GPU à chaque image de
 * l'accueil, compté en interceptant WebGPU. Les lignes épaisses transparentes de three (`Line2NodeMaterial`) émulaient leur
 * mélange en relisant une copie de l'écran pleine résolution, mipmaps comprises, à chaque image : 11 passes de mipmaps et
 * une scène coupée en deux (frontières, contours de l'avion).
 */
test.use({ viewport: { width: 390, height: 844 } });

test('accueil : aucune génération de mipmaps par image (pas de copie de l’écran)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    // types WebGPU absents des e2e : accès par globalThis
    const g = globalThis as unknown as Record<string, { prototype: Record<string, (...a: unknown[]) => unknown> } | undefined>;
    const Encoder = g.GPUCommandEncoder, Texture = g.GPUTexture;
    if (!Encoder || !Texture) return;
    const c = ((window as unknown as { __gpu: { passes: number; mipPasses: number } }).__gpu = { passes: 0, mipPasses: 0 });
    const cv = Texture.prototype.createView!;
    Texture.prototype.createView = function (this: unknown, d?: unknown) {
      const v = cv.call(this, d) as Record<string, unknown>;
      v.__mip = (d as { baseMipLevel?: number } | undefined)?.baseMipLevel ?? 0;
      return v;
    };
    const bp = Encoder.prototype.beginRenderPass!;
    Encoder.prototype.beginRenderPass = function (this: unknown, d: unknown) {
      c.passes++;
      const atts = [...((d as { colorAttachments: Iterable<{ view?: { __mip?: number } } | null> }).colorAttachments)];
      if (atts.some((a) => (a?.view?.__mip ?? 0) > 0)) c.mipPasses++;
      return bp.call(this, d);
    };
  });
  // accueil direct en WebGPU (openHome force WebGL 2) : intro abandonnée
  await page.route('**/video/videos.json', (r) => r.abort());
  await page.goto('/');
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  await page.waitForFunction(() => !!window.__globe, null, { timeout: 120_000 });
  test.skip(await page.evaluate(() => !(window as unknown as { __gpu?: unknown }).__gpu || window.__globe?.backend !== 'webgpu'), 'WebGPU seulement');
  await page.waitForFunction(() => (window.__globe?.frames ?? 0) > 30, null, { timeout: 120_000 });
  const r = await page.evaluate(async () => {
    const c = (window as unknown as { __gpu: { passes: number; mipPasses: number } }).__gpu;
    const f0 = window.__globe!.frames, p0 = c.passes, m0 = c.mipPasses;
    // SwiftShader : quelques images par seconde ; on en attend quatre
    while (window.__globe!.frames - f0 < 4) await new Promise((res) => setTimeout(res, 200));
    const n = window.__globe!.frames - f0;
    return { images: n, passes: (c.passes - p0) / n, mipPasses: (c.mipPasses - m0) / n };
  });
  console.log('par image', JSON.stringify(r));
  expect(r.images).toBeGreaterThanOrEqual(4);
  expect(r.mipPasses).toBe(0);
});
