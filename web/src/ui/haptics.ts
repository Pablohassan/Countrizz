import { isIos } from '../pwa/install';

/**
 * Retours haptiques (spec 2A §7 ; prototype `docs/superpowers/brainstorm/2026-10-03-phase2a-interface/ecrans/haptique.js`,
 * essayé par l'utilisateur le 05/10). Les motifs ne vivent qu'ici : le réglage fin au doigt, après la 2A sur countrizz.fr,
 * ne touche que ce tableau (spec §13.1).
 */
export type HapticEvent = 'press' | 'release' | 'correct' | 'wrong' | 'countdown' | 'go' | 'record';

/** Motifs (ms : vibration, pause, vibration…) ; la mauvaise réponse : choc, grondement haché, long retour de force. */
export const PATTERNS: Readonly<Record<HapticEvent, readonly number[]>> = {
  press: [9], release: [4], correct: [14, 60, 22], wrong: [70, 25, 8, 2, 8, 2, 8, 2, 8, 25, 140],
  countdown: [18], go: [45], record: [20, 40, 20, 40, 20, 40, 90],
};

/** Ce que sait l'appareil : vibrer (Android), « tic » du système (iPhone, iOS 18+), ou rien (ordinateur). */
export interface HapticEngine {
  vibrate: ((pattern: number[]) => void) | null;
  tick: (() => void) | null;
  later(fn: () => void, ms: number): void;
}

export type HapticOutcome = 'off' | 'vibrate' | 'tick' | 'none';

/** iPhone : une seule intensité ; des tics de rappel gardent le rythme (le premier dans le geste, les suivants peuvent être ignorés). */
const EXTRA_TICKS: Partial<Record<HapticEvent, number>> = { correct: 1, wrong: 2, record: 2 };

export function createHaptics(engine: HapticEngine, enabled = true) {
  let on = enabled;
  return {
    get enabled() { return on; },
    setEnabled(v: boolean) { on = v; },
    play(e: HapticEvent): HapticOutcome {
      if (!on) return 'off';
      try {
        if (engine.vibrate) { engine.vibrate([...PATTERNS[e]]); return 'vibrate'; }
        if (engine.tick) {
          engine.tick();
          for (let i = 1; i <= (EXTRA_TICKS[e] ?? 0); i++) engine.later(engine.tick, 90 * i);
          return 'tick';
        }
      } catch { /* jamais d'erreur : l'effet visuel reste */ }
      return 'none';
    },
  };
}
export type Haptics = ReturnType<typeof createHaptics>;

/** « Vibrations » (À propos) : oui par défaut ; `'0'` mémorisé = non. */
export const vibrationsOn = (stored: string | null): boolean => stored !== '0';

/** Le moteur du navigateur : `navigator.vibrate`, sinon l'interrupteur caché d'iOS 18 (basculé pendant le geste). */
export function browserEngine(): HapticEngine {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const vibrate = nav && typeof nav.vibrate === 'function' ? (p: number[]) => { nav.vibrate(p); } : null;
  let toggle: HTMLLabelElement | null = null;
  const tick = !vibrate && nav && isIos(nav.userAgent, nav.maxTouchPoints ?? 0) ? () => {
    if (!toggle) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.append(input);
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9px;top:-9px';
      document.body.append(label);
      toggle = label;
    }
    toggle.click();
  } : null;
  return { vibrate, tick, later: (fn, ms) => { setTimeout(fn, ms); } };
}
