import { createHash } from 'node:crypto';

export function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

export async function fetchBytes(url: string, attempts = 3): Promise<Uint8Array> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'countrizz-geodata/0.1 (https://countrizz.fr)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
      if (i < attempts) await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw lastError;
}
