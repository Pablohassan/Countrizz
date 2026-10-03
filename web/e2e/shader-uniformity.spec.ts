import { expect, test } from '@playwright/test';
import { derivativesInDivergentFlow } from '../src/globe/shaderUniformity';
import type { BackendName } from './sdf-check';

// Une dérivée (fwidth, dFdx…) ou une lecture de texture à niveau de détail implicite dans une branche qui dépend du pixel
// rend une valeur indéfinie sur les blocs de 2×2 pixels coupés par la condition. Le 03/10, la couche pays compilée en
// `if ( dansLeCadre )` traçait ainsi le liseré le long du bord du cadre du patch (Japon, Irlande au bord du cadre de la
// France), sur GPU réel comme sous SwiftShader. Scène complète du jeu : pays, patch image, nuages, frontières, balise.
for (const backend of ['webgl2', 'webgpu'] as BackendName[]) {
  test(`${backend} : aucune dérivée en flot de contrôle divergent dans les shaders du globe`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`/probe.html?mode=game&cca3=JPN&state=correct&t=1&img&clouds=1&borders&beacon=137,38&w=360&h=640${backend === 'webgl2' ? '&webgl' : ''}`);
    await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__probe!.backend)).toBe(backend);
    const shaders = await page.evaluate(() => window.__probe!.fragmentShaders());
    // le contrôle porte bien sur le shader de la couche pays (sinon il passerait à vide)
    expect(shaders.some((s) => /\bfwidth\s*\(/.test(s.code))).toBe(true);
    const found = shaders.flatMap((s) => derivativesInDivergentFlow(s.code).map((f) => `${s.name} l.${f.line} : ${f.text}`));
    expect(found).toEqual([]);
  });
}
