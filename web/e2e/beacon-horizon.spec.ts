import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';

// Une balise derrière l'horizon ne doit pas se dessiner à travers la Terre (repère sur le mauvais continent).
test('balise derrière l’horizon : aucun pixel ne change', async ({ page }) => {
  const query = 'mode=game&at=2.35,30&alt=1.4';
  const without = await shoot(page, 'webgl2', query);
  const withBeacon = await shoot(page, 'webgl2', `${query}&beacon=179.2,-8.5`);
  let changed = 0;
  for (let i = 0; i < without.png.data.length; i += 4) {
    if (without.png.data[i] !== withBeacon.png.data[i] || without.png.data[i + 1] !== withBeacon.png.data[i + 1] || without.png.data[i + 2] !== withBeacon.png.data[i + 2]) changed++;
  }
  console.log('pixels modifiés par la balise cachée', changed);
  expect(changed).toBe(0);
});
