import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { BLOOM_RESOLUTION, postOptions, precompilation } from './postprocessing';
import { SKY_RESOLUTION } from './physicalSky';

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

describe('post-traitement (spec §4.1, amendée le 06/11)', () => {
  it('sans TRAA ; MSAA 4× du pass sans l’atmosphère physique (avec elle, le SMAA)', () => {
    expect(postOptions().msaa).toBe(4);
    expect(Object.keys(postOptions())).not.toContain('traa');
  });
  it('fluidité sur téléphone (06/11) : bloom et atmosphère calculés au quart de la résolution par axe', () => {
    expect([BLOOM_RESOLUTION, SKY_RESOLUTION]).toEqual([0.25, 0.25]);
    expect([postOptions().bloom.scale, postOptions().skyScale]).toEqual([0.25, 0.25]);
  });
  it('SMAA seulement sous une densité d’écran de 2 : au-delà, rien de visible (écart moyen 0,10 à 0,17 sur 255) pour 12 % du GPU (06/11)', () => {
    expect([postOptions(1).smaa, postOptions(1.5).smaa]).toEqual([true, true]);
    expect([postOptions(2).smaa, postOptions(2.625).smaa]).toEqual([false, false]);
    expect(postOptions().smaa).toBe(true);
  });
  it('sortie en tone mapping Neutral, bloom à 0,3 (planche du 10/10 : le jaune pays bouge à peine, AgX le délavait)', () => {
    expect(postOptions().toneMapping).toBe(THREE.NeutralToneMapping);
    expect(postOptions().bloom.strength).toBe(0.3);
  });
});
