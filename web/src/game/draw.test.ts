import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { DIFFICULTY, drawQuestion, FLAG_LOOKALIKES, labelOf, levelFor } from './draw';
import { createRng } from './rng';
import { MODES, type DrawCountry, type Lang, type Mode, type Question } from './types';

const all = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = new Map(all.map((c) => [c.cca3, c]));
const near = (t: DrawCountry, c: DrawCountry) => c.subregion === t.subregion || t.neighbors.includes(c.cca3);

/** Une partie simulée : bonnes et mauvaises réponses tirées par une graine à part. */
function play(seed: number, rounds: number): { mode: Mode; lang: Lang; qs: { q: Question; streak: number }[] } {
  const meta = createRng(seed ^ 0x9e3779b9);
  const mode = MODES[Math.floor(meta.next() * 3)]!;
  const lang: Lang = meta.next() < 0.5 ? 'fr' : 'en';
  const rng = createRng(seed);
  const asked = new Set<string>();
  const qs: { q: Question; streak: number }[] = [];
  let streak = 0;
  for (let i = 0; i < rounds; i++) {
    const q = drawQuestion(all, asked, streak, mode, lang, rng)!;
    qs.push({ q, streak });
    asked.add(q.cca3);
    streak = meta.next() < 0.75 ? streak + 1 : 0;
  }
  return { mode, lang, qs };
}

describe('niveau de difficulté', () => {
  it('monde, puis région après 3 bonnes d\'affilée, puis voisins après 6', () => {
    expect([0, 2, 3, 5, 6, 20].map(levelFor)).toEqual(['world', 'world', 'region', 'region', 'near', 'near']);
    expect(DIFFICULTY).toEqual({ regionAfter: 3, nearAfter: 6 });
  });
});

describe('drawQuestion', () => {
  it('libellé : drapeau, nom ou capitale dans la langue jouée', () => {
    const fra = by.get('FRA')!;
    expect(labelOf(fra, 'flag', 'fr')).toBe('flags/fra.svg');
    expect(labelOf(by.get('COD')!, 'country', 'fr')).toBe('RD Congo');
    expect(labelOf(by.get('UKR')!, 'capital', 'en')).toBe('Kyiv');
  });

  it('10 000 graines : aucun pays deux fois, quatre réponses distinctes à l\'écran, bonne réponse en place, difficulté tenue', () => {
    for (let seed = 1; seed <= 10_000; seed++) {
      const { mode, lang, qs } = play(seed, 25);
      const seen = new Set<string>();
      for (const { q, streak } of qs) {
        expect(seen.has(q.cca3), `graine ${seed} : ${q.cca3} deux fois`).toBe(false);
        seen.add(q.cca3);
        expect(q.options).toHaveLength(4);
        expect(q.options[q.answer]).toBe(q.cca3);
        const labels = q.options.map((k) => labelOf(by.get(k)!, mode, lang));
        expect(new Set(labels).size, `graine ${seed} : ${labels.join(' | ')}`).toBe(4);
        const target = by.get(q.cca3)!;
        const level = levelFor(streak);
        const others = q.options.filter((k) => k !== q.cca3).map((k) => by.get(k)!);
        // Assez de candidats au niveau voulu (5 = marge pour les drapeaux jumeaux) : tous les distracteurs y sont.
        if (level === 'near' && all.filter((c) => c !== target && near(target, c)).length >= 5) {
          for (const o of others) expect(near(target, o), `graine ${seed} : ${o.cca3} n'est pas proche de ${q.cca3}`).toBe(true);
        }
        if (level === 'region' && all.filter((c) => c !== target && c.region === target.region).length >= 5) {
          for (const o of others) expect(o.region, `graine ${seed}`).toBe(target.region);
        }
      }
    }
  }, 60_000);

  it('même graine, même partie', () => {
    expect(play(77, 30)).toEqual(play(77, 30));
  });

  it('mode Drapeau : jamais deux drapeaux jumeaux ensemble', () => {
    for (let seed = 1; seed <= 2_000; seed++) {
      const rng = createRng(seed);
      for (const target of ['IDN', 'MCO', 'ROU', 'TCD']) {
        const asked = new Set(all.map((c) => c.cca3).filter((k) => k !== target));
        const q = drawQuestion(all, asked, 0, 'flag', 'fr', rng)!; // niveau « monde » : les jumeaux pourraient s'y croiser
        for (const [a, b] of FLAG_LOOKALIKES) expect(q.options.includes(a) && q.options.includes(b), `${a}/${b}`).toBe(false);
      }
    }
  });

  it('plus aucun pays à demander : null', () => {
    expect(drawQuestion(all, new Set(all.map((c) => c.cca3)), 0, 'country', 'fr', createRng(1))).toBeNull();
  });

  it('pays isolé (voisins et sous-région trop petits) : on élargit au lieu d\'échouer', () => {
    const asked = new Set(all.map((c) => c.cca3).filter((k) => k !== 'AUS'));
    const q = drawQuestion(all, asked, 10, 'country', 'fr', createRng(5))!;
    expect(q.cca3).toBe('AUS');
    expect(new Set(q.options).size).toBe(4);
  });
});
