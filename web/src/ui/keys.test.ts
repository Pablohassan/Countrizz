import { describe, expect, it } from 'vitest';
import { answerIndexFromKey } from './keys';

describe('touches 1 à 4 (L1)', () => {
  it('rangée du haut (AZERTY compris : le code de la touche fait foi) et pavé numérique', () => {
    expect(answerIndexFromKey({ key: '1', code: 'Digit1' })).toBe(0);
    expect(answerIndexFromKey({ key: '&', code: 'Digit1' })).toBe(0);   // AZERTY sans majuscule
    expect(answerIndexFromKey({ key: '"', code: 'Digit3' })).toBe(2);
    expect(answerIndexFromKey({ key: '4', code: 'Numpad4' })).toBe(3);
    expect(answerIndexFromKey({ key: '2' })).toBe(1);                    // sans code (navigateur ancien)
  });

  it('rien pour les autres touches ni avec un modificateur', () => {
    expect(answerIndexFromKey({ key: '5', code: 'Digit5' })).toBeNull();
    expect(answerIndexFromKey({ key: 'a', code: 'KeyA' })).toBeNull();
    expect(answerIndexFromKey({ key: '1', code: 'Digit1', ctrlKey: true })).toBeNull();
    expect(answerIndexFromKey({ key: '1', code: 'Digit1', metaKey: true })).toBeNull();
    expect(answerIndexFromKey({ key: '1', code: 'Digit1', altKey: true })).toBeNull();
  });
});
