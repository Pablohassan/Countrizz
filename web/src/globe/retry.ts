/** Rejoue `fn` jusqu'à `attempts` fois, en attendant `delayMs × n` entre la n-ième et la suivante ; rend la dernière erreur. */
export async function withRetry<T>(fn: () => Promise<T>, o: { attempts: number; delayMs: number }): Promise<T> {
  let last: unknown;
  for (let n = 1; n <= o.attempts; n++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (n < o.attempts) await new Promise((r) => setTimeout(r, o.delayMs * n));
    }
  }
  throw last;
}
