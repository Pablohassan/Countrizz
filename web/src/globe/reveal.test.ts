import { describe, expect, it } from 'vitest';
import { lookAt, WAVE_MS } from './reveal';

describe('révélation du pays au fil du temps', () => {
  it('rien sans question', () => {
    expect(lookAt(null, 1000)).toEqual({ visible: false, reveal: 0, state: 'question', stateTime: 0 });
  });
  it('la vague part du centre et s’achève en 600 ms (sortie cubique)', () => {
    const t = { questionAtMs: 1000 };
    expect(WAVE_MS).toBe(600);
    expect(lookAt(t, 1000).reveal).toBe(0);
    expect(lookAt(t, 1300).reveal).toBeCloseTo(0.875, 9); // 1 − (1 − 0,5)³
    expect(lookAt(t, 1600).reveal).toBe(1);
    expect(lookAt(t, 9000).reveal).toBe(1);
    expect(lookAt(t, 1300).state).toBe('question');
  });
  it('la réponse change l’état et remet son horloge à zéro', () => {
    const t = { questionAtMs: 1000, answer: { kind: 'wrong' as const, atMs: 4000 } };
    expect(lookAt(t, 3999).state).toBe('question');
    const l = lookAt(t, 4500);
    expect(l).toEqual({ visible: true, reveal: 1, state: 'wrong', stateTime: 0.5 });
  });
});
