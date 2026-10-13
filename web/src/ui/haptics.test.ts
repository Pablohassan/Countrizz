import { describe, expect, it } from 'vitest';
import { createHaptics, PATTERNS, vibrationsOn, type HapticEngine } from './haptics';

function engine(kind: 'android' | 'ios' | 'desktop') {
  const calls: (number[] | 'tick')[] = [];
  const timers: { ms: number; fn: () => void }[] = [];
  const e: HapticEngine = {
    vibrate: kind === 'android' ? (p) => { calls.push(p); } : null,
    tick: kind === 'ios' ? () => { calls.push('tick'); } : null,
    later: (fn, ms) => { timers.push({ ms, fn }); },
  };
  return { e, calls, timers };
}

describe('haptique (spec 2A §7, prototype haptique.js)', () => {
  it('les motifs du prototype, en ms', () => {
    expect(PATTERNS).toEqual({
      press: [9], release: [4], correct: [14, 60, 22], wrong: [70, 25, 8, 2, 8, 2, 8, 2, 8, 25, 140],
      countdown: [18], go: [45], record: [20, 40, 20, 40, 20, 40, 90],
    });
  });

  it('Android : navigator.vibrate reçoit le motif de l’événement', () => {
    const { e, calls } = engine('android');
    const h = createHaptics(e);
    expect(h.play('wrong')).toBe('vibrate');
    expect(h.play('press')).toBe('vibrate');
    expect(calls).toEqual([PATTERNS.wrong, PATTERNS.press]);
  });

  it('iPhone : un tic tout de suite, des tics de rappel à 90 ms d’écart (bonne 1, mauvaise et record 2)', () => {
    const { e, calls, timers } = engine('ios');
    const h = createHaptics(e);
    expect(h.play('wrong')).toBe('tick');
    expect(calls).toEqual(['tick']);
    expect(timers.map((t) => t.ms)).toEqual([90, 180]);
    timers.forEach((t) => t.fn());
    expect(calls).toEqual(['tick', 'tick', 'tick']);
    h.play('correct');
    expect(timers.map((t) => t.ms)).toEqual([90, 180, 90]);
    h.play('press');
    expect(timers).toHaveLength(3);
  });

  it('ordinateur : rien, sans erreur ; réglage coupé : rien ; un moteur qui lève : rien', () => {
    expect(createHaptics(engine('desktop').e).play('go')).toBe('none');
    const { e, calls } = engine('android');
    const h = createHaptics(e, false);
    expect(h.play('record')).toBe('off');
    h.setEnabled(true);
    expect(h.play('record')).toBe('vibrate');
    expect(calls).toHaveLength(1);
    const boom = createHaptics({ vibrate: () => { throw new Error('refusé'); }, tick: null, later: () => {} });
    expect(boom.play('go')).toBe('none');
  });

  it('réglage « Vibrations » : oui par défaut, non seulement si « 0 » est mémorisé', () => {
    expect(vibrationsOn(null)).toBe(true);
    expect(vibrationsOn('1')).toBe(true);
    expect(vibrationsOn('0')).toBe(false);
  });
});
