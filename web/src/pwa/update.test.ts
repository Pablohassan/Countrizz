import { describe, expect, it } from 'vitest';
import { UPDATE_FLAG, consumeUpdateFlag, createUpdater, type UpdaterEnv } from './update';

/** Un navigateur de test : contrôleur du service worker, page cachée ou non, rechargements et vérifications comptés. */
function env(controlled: boolean) {
  const st = { hidden: false, reloads: 0, checks: 0, marks: 0, change: () => {}, visibility: () => {} };
  const e: UpdaterEnv = {
    hasController: () => controlled,
    hidden: () => st.hidden,
    onControllerChange: (fn) => { st.change = fn; },
    onVisibilityChange: (fn) => { st.visibility = fn; },
    checkForUpdate: () => { st.checks++; },
    mark: () => { st.marks++; },
    reload: () => { st.reloads++; },
  };
  return { e, st };
}

describe('rechargement à la nouvelle version', () => {
  it('nouvelle version à l’accueil : la page se recharge, marquée pour sauter l’intro', () => {
    const { e, st } = env(true);
    const u = createUpdater(e);
    u.setAtHome(true);
    st.change();
    expect(st.reloads).toBe(1);
    expect(st.marks).toBe(1);
  });
  it('pendant une partie : rien, puis le rechargement au retour à l’accueil', () => {
    const { e, st } = env(true);
    const u = createUpdater(e);
    u.setAtHome(false);
    st.change();
    expect(st.reloads).toBe(0);
    u.setAtHome(true);
    expect(st.reloads).toBe(1);
  });
  it('appli en arrière-plan : rechargée tout de suite, même en pleine partie', () => {
    const { e, st } = env(true);
    createUpdater(e).setAtHome(false);
    st.change();
    expect(st.reloads).toBe(0);
    st.hidden = true;
    st.visibility();
    expect(st.reloads).toBe(1);
  });
  it('première visite : le service worker qui prend la main n’est pas une nouvelle version', () => {
    const { e, st } = env(false);
    createUpdater(e).setAtHome(true);
    st.change();
    expect(st.reloads).toBe(0);
  });
  it('première visite, puis une vraie nouvelle version pendant la même visite : rechargée', () => {
    const { e, st } = env(false);
    createUpdater(e).setAtHome(true);
    st.change();
    st.change();
    expect(st.reloads).toBe(1);
  });
  it('un seul rechargement, quoi qu’il arrive ensuite', () => {
    const { e, st } = env(true);
    const u = createUpdater(e);
    u.setAtHome(true);
    st.change();
    st.change();
    u.setAtHome(false);
    u.setAtHome(true);
    st.hidden = true;
    st.visibility();
    expect(st.reloads).toBe(1);
  });
  it('sans nouvelle version, l’accueil et l’arrière-plan ne rechargent rien', () => {
    const { e, st } = env(true);
    const u = createUpdater(e);
    u.setAtHome(true);
    st.hidden = true;
    st.visibility();
    expect(st.reloads).toBe(0);
  });
  it('au retour sur l’appli (page de nouveau visible), on cherche une nouvelle version', () => {
    const { e, st } = env(true);
    createUpdater(e);
    st.hidden = true;
    st.visibility();
    expect(st.checks).toBe(0);
    st.hidden = false;
    st.visibility();
    expect(st.checks).toBe(1);
  });
});

describe('marque de la mise à jour', () => {
  const store = (v: string | null) => {
    const m = new Map<string, string>(v === null ? [] : [[UPDATE_FLAG, v]]);
    return { m, s: { getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => { m.delete(k); } } };
  };
  it('présente : lue une fois, puis effacée (le rechargement suivant rejoue l’intro)', () => {
    const { m, s } = store('1');
    expect(consumeUpdateFlag(s)).toBe(true);
    expect(m.has(UPDATE_FLAG)).toBe(false);
    expect(consumeUpdateFlag(s)).toBe(false);
  });
  it('absente, ou stockage indisponible : l’intro se joue', () => {
    expect(consumeUpdateFlag(store(null).s)).toBe(false);
    expect(consumeUpdateFlag(null)).toBe(false);
    expect(consumeUpdateFlag({ getItem: () => { throw new Error('bloqué'); }, removeItem: () => {} })).toBe(false);
  });
});
