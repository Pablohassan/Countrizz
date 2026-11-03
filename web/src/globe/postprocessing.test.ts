import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { postOptions, precompilation } from './postprocessing';

/** Une précompilation qu'on termine à la main : `fin[i]()` achève le i-ième appel. */
function compilations() {
  const fin: (() => void)[] = [];
  let enCours = 0, auPlus = 0;
  const compile = () => new Promise<void>((ok) => {
    enCours++; auPlus = Math.max(auPlus, enCours);
    fin.push(() => { enCours--; ok(); });
  });
  return { compile, fin, auPlus: () => auPlus };
}
const tour = () => new Promise((r) => setTimeout(r, 0));

// 03/11 : la précompilation de three pose la cible de la passe sur le renderer, attend, puis remet ce qu'elle avait trouvé.
// Deux à la fois, la seconde remettait la cible de la première : le renderer y restait, et chaque image était refusée.
describe('précompilation de la scène : une à la fois, aucun rendu pendant', () => {
  it('lancées pendant qu’une autre tourne, elles attendent leur tour', async () => {
    const c = compilations(), p = precompilation(c.compile);
    void p.lancer(); void p.lancer();
    await tour();
    expect(c.fin).toHaveLength(1);
    c.fin[0]!();
    await tour();
    expect(c.fin).toHaveLength(2);
    c.fin[1]!();
    await tour();
    expect(c.auPlus()).toBe(1);
  });

  it('plusieurs demandes pendant une compilation n’en font qu’une de plus (la dernière voit tout ce qui a été monté)', async () => {
    const c = compilations(), p = precompilation(c.compile);
    void p.lancer(); void p.lancer(); void p.lancer(); void p.lancer();
    await tour();
    c.fin[0]!();
    await tour();
    c.fin[1]!();
    await tour();
    expect(c.fin).toHaveLength(2);
  });

  it('`enCours` dit quand le rendu doit attendre ; une compilation en échec ne bloque pas la suite', async () => {
    let n = 0;
    const p = precompilation(() => (++n === 1 ? Promise.reject(new Error('GPU')) : Promise.resolve()));
    expect(p.enCours()).toBe(false);
    const a = p.lancer();
    expect(p.enCours()).toBe(true);
    await expect(a).rejects.toThrow('GPU');
    expect(p.enCours()).toBe(false);
    await p.lancer();
    expect([n, p.enCours()]).toEqual([2, false]);
  });
});

describe('post-traitement par niveau (spec §4.1)', () => {
  it('haute : bloom + TRAA, sans MSAA (TRAA l’exige)', () => {
    const o = postOptions('haute');
    expect([o.traa, o.msaa]).toEqual([true, 0]);
    expect(o.bloom.strength).toBeGreaterThan(0);
  });
  it('standard : effets allégés — bloom, MSAA 4× du pass, pas de TRAA', () => {
    const o = postOptions('standard');
    expect([o.traa, o.msaa]).toEqual([false, 4]);
    expect(o.bloom).toEqual(postOptions('haute').bloom);
  });
  it('sortie en tone mapping Neutral, bloom à 0,3 (planche du 10/10 : le jaune pays bouge à peine, AgX le délavait)', () => {
    for (const tier of ['haute', 'standard'] as const) {
      expect(postOptions(tier).toneMapping).toBe(THREE.NeutralToneMapping);
      expect(postOptions(tier).bloom.strength).toBe(0.3);
    }
  });
});
