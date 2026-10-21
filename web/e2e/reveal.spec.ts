import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} révélation de la France : pénombre des voisins, bonne et mauvaise réponse`, async ({ page }) => {
    // mise en avant du 21/10 : plus de remplissage jaune ; les voisins passent dans la pénombre, le pays garde sa photo et se
    // teinte de vert ou de rouge à la réponse
    const paris: [number, number] = [2.35, 48.85], madrid: [number, number] = [-3.7, 40.4];
    const [hidden, hiddenOut] = await (await shoot(page, backend, 'mode=game&cca3=FRA&reveal=0')).at([paris, madrid]);
    const [question, questionOut] = await (await shoot(page, backend, 'mode=game&cca3=FRA&reveal=1')).at([paris, madrid]);
    const [correct] = await (await shoot(page, backend, 'mode=game&cca3=FRA&state=correct&t=2')).at([paris]);
    const [wrong] = await (await shoot(page, backend, 'mode=game&cca3=FRA&state=wrong&t=0.125')).at([paris]);
    console.log(backend, JSON.stringify({ hidden, hiddenOut, question, questionOut, correct, wrong }));
    const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    expect(sum(questionOut!)).toBeLessThan(sum(hiddenOut!) * 0.85);
    expect(sum(question!)).toBeGreaterThan(sum(questionOut!));
    expect(correct![1] - correct![0]!).toBeGreaterThan(question![1]! - question![0]! + 10);
    expect(wrong![0] - wrong![1]!).toBeGreaterThan(question![0]! - question![1]! + 10);
  });
}
