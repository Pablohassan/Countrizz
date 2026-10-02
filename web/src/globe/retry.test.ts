import { describe, expect, it } from 'vitest';
import { withRetry } from './retry';

describe('nouvelles tentatives espacées', () => {
  it('réussit dès qu’une tentative passe', async () => {
    let calls = 0;
    const v = await withRetry(async () => { calls++; if (calls < 3) throw new Error('503'); return 'ok'; }, { attempts: 3, delayMs: 1 });
    expect(v).toBe('ok');
    expect(calls).toBe(3);
  });
  it('rend la dernière erreur après la dernière tentative', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error(`échec ${calls}`); }, { attempts: 3, delayMs: 1 })).rejects.toThrow('échec 3');
    expect(calls).toBe(3);
  });
});
