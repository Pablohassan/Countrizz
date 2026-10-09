import type { Rng } from './rng';
import type { DrawCountry, Lang, Mode, Question } from './types';

/** Seuils de la difficulté progressive (spec 2A §2, refonte §6.1) : série de bonnes réponses en cours. */
export const DIFFICULTY = { regionAfter: 3, nearAfter: 6 } as const;

/** Drapeaux presque identiques : jamais proposés ensemble en mode Drapeau. */
export const FLAG_LOOKALIKES: readonly (readonly [string, string])[] = [['IDN', 'MCO'], ['ROU', 'TCD']];

export type Level = 'world' | 'region' | 'near';

export const levelFor = (streak: number): Level =>
  streak >= DIFFICULTY.nearAfter ? 'near' : streak >= DIFFICULTY.regionAfter ? 'region' : 'world';

/** Ce que le joueur voit d'une réponse : sert à garantir quatre réponses distinctes à l'écran. */
export function labelOf(c: DrawCountry, mode: Mode, lang: Lang): string {
  return mode === 'flag' ? c.flag : mode === 'country' ? c.name[lang] : c.capital[lang];
}

const twins = (a: string, b: string) => FLAG_LOOKALIKES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

function poolAt(target: DrawCountry, all: DrawCountry[], level: Level): DrawCountry[] {
  if (level === 'world') return all;
  if (level === 'region') return all.filter((c) => c.region === target.region);
  return all.filter((c) => c.subregion === target.subregion || target.neighbors.includes(c.cca3));
}

function shuffled<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Prochaine manche : un pays jamais demandé, au hasard ; trois mauvaises réponses prises au niveau de difficulté de la
 * série en cours, élargi d'un cran (voisins → région → monde) tant qu'il en manque ; quatre libellés distincts dans la
 * langue jouée ; en mode Drapeau, jamais deux drapeaux jumeaux. `null` : plus aucun pays à demander.
 */
export function drawQuestion(all: DrawCountry[], asked: ReadonlySet<string>, streak: number, mode: Mode, lang: Lang, rng: Rng): Question | null {
  const fresh = all.filter((c) => !asked.has(c.cca3));
  if (fresh.length === 0) return null;
  const target = fresh[Math.floor(rng.next() * fresh.length)]!;
  const levels: Level[] = ['near', 'region', 'world'];
  const chosen: DrawCountry[] = [];
  const labels = new Set([labelOf(target, mode, lang)]);
  for (const level of levels.slice(levels.indexOf(levelFor(streak)))) {
    for (const c of shuffled(poolAt(target, all, level), rng)) {
      if (chosen.length === 3) break;
      if (c.cca3 === target.cca3 || chosen.includes(c)) continue;
      const label = labelOf(c, mode, lang);
      if (labels.has(label)) continue;
      if (mode === 'flag' && [target, ...chosen].some((o) => twins(o.cca3, c.cca3))) continue;
      chosen.push(c);
      labels.add(label);
    }
    if (chosen.length === 3) break;
  }
  if (chosen.length < 3) throw new Error(`tirage : moins de quatre réponses distinctes possibles pour ${target.cca3}`);
  const answer = Math.floor(rng.next() * 4);
  const options = chosen.map((c) => c.cca3);
  options.splice(answer, 0, target.cca3);
  return { cca3: target.cca3, options, answer };
}
