import { describe, expect, it } from 'vitest';
import { readKtx2Header } from '../../lib/ktx2';

/** KTX2 minimal : identifiant, en-tête, index, puis une table clé/valeur (format KTX 2.0, §3 et §3.11). */
function fakeKtx2(kv: Record<string, string>, o: { width: number; height: number; levels: number; supercompression: number }): Uint8Array {
  const entries = Object.entries(kv).map(([k, v]) => {
    const body = new TextEncoder().encode(`${k}\0${v}\0`);
    const padded = new Uint8Array(4 + body.length + ((4 - ((4 + body.length) % 4)) % 4));
    new DataView(padded.buffer).setUint32(0, body.length, true);
    padded.set(body, 4);
    return padded;
  });
  const kvdLength = entries.reduce((s, e) => s + e.length, 0);
  const kvdOffset = 80;
  const buf = new Uint8Array(kvdOffset + kvdLength);
  buf.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(buf.buffer);
  dv.setUint32(20, o.width, true);
  dv.setUint32(24, o.height, true);
  dv.setUint32(40, o.levels, true);
  dv.setUint32(44, o.supercompression, true);
  dv.setUint32(56, kvdOffset, true);
  dv.setUint32(60, kvdLength, true);
  let p = kvdOffset;
  for (const e of entries) { buf.set(e, p); p += e.length; }
  return buf;
}

describe('en-tête KTX2', () => {
  it('lit dimensions, niveaux, supercompression et orientation', () => {
    const h = readKtx2Header(fakeKtx2({ KTXorientation: 'ru', KTXwriter: 'toktx v4.4.2' }, { width: 4096, height: 2048, levels: 13, supercompression: 1 }));
    expect(h).toEqual({ width: 4096, height: 2048, levels: 13, supercompression: 1, kv: { KTXorientation: 'ru', KTXwriter: 'toktx v4.4.2' } });
  });
  it('refuse un fichier qui n’est pas un KTX2', () => {
    expect(() => readKtx2Header(new Uint8Array(80))).toThrow(/KTX2/);
  });
});
