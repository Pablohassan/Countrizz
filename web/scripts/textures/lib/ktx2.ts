export interface Ktx2Header {
  width: number;
  height: number;
  levels: number;
  /** 0 aucune, 1 BasisLZ (ETC1S), 2 Zstandard (UASTC + --zcmp). */
  supercompression: number;
  kv: Record<string, string>;
}

const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

/** Lit l'en-tête et la table clé/valeur d'un fichier KTX 2.0 (dont `KTXorientation`, posé par toktx). */
export function readKtx2Header(bytes: Uint8Array): Ktx2Header {
  if (bytes.length < 80 || !IDENTIFIER.every((v, i) => bytes[i] === v)) throw new Error('pas un fichier KTX2');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number) => dv.getUint32(o, true);
  const kv: Record<string, string> = {};
  const kvdOffset = u32(56), kvdLength = u32(60);
  for (let o = kvdOffset; o < kvdOffset + kvdLength;) {
    const len = u32(o);
    const entry = bytes.subarray(o + 4, o + 4 + len);
    const zero = entry.indexOf(0);
    kv[new TextDecoder().decode(entry.subarray(0, zero))] = new TextDecoder().decode(entry.subarray(zero + 1)).replace(/\0+$/, '');
    o += 4 + len;
    o += (4 - (o % 4)) % 4;
  }
  return { width: u32(20), height: u32(24), levels: u32(40), supercompression: u32(44), kv };
}
