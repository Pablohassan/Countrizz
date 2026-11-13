import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';

/**
 * Pas de quadrillage dans le voile (07/11) : en 1.23, l'atmosphère calculée au seizième des pixels étirait le décalage de
 * ses 24 pas en losanges réguliers sur la mer et dans le voile (vu sur le Pixel 9 et sur le Mac ; les références visuelles,
 * à 20 pixels près, ne le voyaient pas). Mesure : écart quadratique moyen de l'image à une marche fine de 256 pas, qui ne
 * garde que le bruit de la marche. Format du Pixel 9 à la densité 2,5, frontières affichées. Relevés du 07/11 (GPU du Mac),
 * vol puis pays : 24 pas 1,65 et 2,16 ; 48 pas, losanges encore devinés, 0,82 et 1,06 ; 64 pas 0,63 et 0,80. Puis 13/11 :
 * l'utilisateur voyait encore le damier sur PC (et la référence visuelle « question » le portait) ; marche sans décalage,
 * 64 pas : 0,190 et 0,235 (SwiftShader). Seuils resserrés : le décalage d'avant (0,63 et 0,80) n'y passerait plus.
 */
// trois chargements de la sonde à 1030 × 2288, dont une marche de 256 pas : ≈ 50 s seul, 66 s en tête de la suite
// complète (08/11 : démarrage à froid du serveur de dev), au-delà des 60 s par défaut
test.slow();
const SIZE = { width: 1030, height: 2288 };
const SCENES = {
  vol: { query: 'mode=game&tier=haute&at=10,40&alt=1.6&post&borders&ecran=2.625', max: 0.4 },
  pays: { query: 'mode=game&tier=haute&cca3=FRA&img&post&borders&ecran=2.625', max: 0.45 },
} as const;

for (const [scene, { query, max }] of Object.entries(SCENES)) {
  test(`webgpu ${scene} : le voile n'a pas de quadrillage (écart à 256 pas ≤ ${max})`, async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto(`/probe.html?w=${SIZE.width}&h=${SIZE.height}`);
    await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
    test.skip(await page.evaluate(() => window.__probe!.backend) !== 'webgpu', 'WebGPU indisponible');
    const jeu = (await shoot(page, 'webgpu', query, SIZE)).png.data;
    const fin = (await shoot(page, 'webgpu', `${query}&pas=256`, SIZE)).png.data;
    let sum = 0, n = 0;
    for (let i = 0; i < jeu.length; i += 4) for (let c = 0; c < 3; c++) { const d = jeu[i + c]! - fin[i + c]!; sum += d * d; n++; }
    const rms = Math.sqrt(sum / n);
    console.log(scene, 'écart quadratique moyen à 256 pas', rms.toFixed(3));
    expect(rms).toBeLessThanOrEqual(max);
  });
}
