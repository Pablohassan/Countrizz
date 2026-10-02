import { describe, expect, it } from 'vitest';
import { sha256 } from '../../lib/http';

describe('sha256', () => {
  it('rend le vecteur de référence de « abc »', () => {
    expect(sha256(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
