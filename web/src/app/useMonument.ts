import { useEffect, type RefObject } from 'react';
import type { GameState } from '../game/machine';
import type { GlobeHandle } from '../globe/GlobeView';

/**
 * Pilote des monuments (08/11), derrière `?monuments` : à la révélation, la maquette en papier du pays demandé se déplie
 * sur le globe (globe/monuments/), puis se replie au départ du vol suivant. Son code arrive avec celui du globe (déjà
 * chargé en partie). Mouvement réduit : dépliée d'emblée.
 */
export function useMonument(globe: RefObject<GlobeHandle | null>, state: GameState, on: boolean): void {
  const cca3 = state.screen === 'reveal' ? state.question?.cca3 : undefined;
  useEffect(() => {
    if (!on || !cca3) return;
    let alive = true, fermer: (() => number) | null = null, off: (() => void) | null = null;
    void import('../globe/GlobeView').then(({ createMonument }) => {
      if (!alive || !globe.current) return;
      const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const m = createMonument(cca3, reduit ? { still: (70 * Math.PI) / 180 } : {});
      if (!m) return;
      off = globe.current.mount(m);
      fermer = m.fermer;
    }, (e: unknown) => console.warn('maquette du monument non chargée', e));
    return () => {
      alive = false;
      if (!off) return;
      const o = off;
      setTimeout(o, fermer?.() ?? 0);
    };
  }, [on, cca3, state.flight]); // eslint-disable-line react-hooks/exhaustive-deps -- globe est une ref stable
}
