/**
 * Proportions des 197 drapeaux, précalculées (D3 : « proportions lues dans width/height du SVG, précalculées au build ») :
 * `npm run flags:ratios` écrit `src/data/flagRatios.json` (cca3 → largeur / hauteur, 4 décimales). L'essai
 * `src/data/flagRatio.test.ts` refait le calcul et casse si un drapeau change sans que le fichier suive.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { svgRatio } from '../../src/data/flagRatio';
import type { CountryRecord } from '../../src/data/types';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const table: Record<string, number> = {};
for (const c of [...countries].sort((a, b) => a.cca3.localeCompare(b.cca3))) {
  table[c.cca3] = Math.round(svgRatio(readFileSync(`public/data/${c.flag}`, 'utf8')) * 10_000) / 10_000;
}
writeFileSync('src/data/flagRatios.json', `${JSON.stringify(table, null, 1)}\n`);
console.log(`flagRatios.json : ${Object.keys(table).length} drapeaux`);
