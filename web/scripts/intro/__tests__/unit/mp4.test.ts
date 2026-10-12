import { describe, expect, it } from 'vitest';
import { boites, chaineAv1, chaineCodec, chaineHevc, ordreDeTete } from '../../lib/mp4';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((x) => parseInt(x, 16)));
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** Boîte ISO BMFF : taille sur 32 bits, type, contenu. */
function boite(type: string, ...contenus: Uint8Array[]): Uint8Array {
  const n = 8 + contenus.reduce((s, c) => s + c.length, 0);
  const b = new Uint8Array(n);
  new DataView(b.buffer).setUint32(0, n);
  b.set(ascii(type), 4);
  let o = 8;
  for (const c of contenus) { b.set(c, o); o += c.length; }
  return b;
}

/** MP4 minimal : ftyp, moov (une piste dont l'entrée `entree` porte la configuration `conf`), free, mdat. */
function mp4(entree: string, conf: Uint8Array, faststart = true): Uint8Array {
  const stsd = boite('stsd', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]), boite(entree, new Uint8Array(78), conf));
  const moov = boite('moov', boite('mvhd', new Uint8Array(100)), boite('trak', boite('tkhd', new Uint8Array(84)),
    boite('mdia', boite('mdhd', new Uint8Array(24)), boite('minf', boite('vmhd', new Uint8Array(12)), boite('stbl', stsd)))));
  const morceaux = faststart
    ? [boite('ftyp', ascii('isom')), moov, boite('free'), boite('mdat', new Uint8Array(16))]
    : [boite('ftyp', ascii('isom')), boite('free'), boite('mdat', new Uint8Array(16)), moov];
  const out = new Uint8Array(morceaux.reduce((s, m) => s + m.length, 0));
  let o = 0;
  for (const m of morceaux) { out.set(m, o); o += m.length; }
  return out;
}

// Octets lus dans des fichiers encodés par la fabrique (portrait 1080 × 2340, 120 i/s) :
// av1C de libsvtav1 10 bits (en-tête de 4 octets puis l'OBU de séquence) ; en-tête hvcC de libx265 Main (22 octets),
// suivi ici de 0 tableau de paramètres (le vrai fichier en porte 4 : VPS, SPS, PPS, SEI).
const AV1C_PORTRAIT_120 = hex('810d4c000a0f0000006aae1bc91805f0a020202080');
const HVCC_PORTRAIT_120 = hex('01016000000090000000000099f000fcfdf8f800000f00');

describe('chaîne de codec RFC 6381', () => {
  it('AV1 : profil, niveau, rang, profondeur lus dans av1C', () => {
    expect(chaineAv1(AV1C_PORTRAIT_120)).toBe('av01.0.13M.10');
    expect(chaineAv1(hex('810d0c00'))).toBe('av01.0.13M.08');
    expect(chaineAv1(hex('8108cc00'))).toBe('av01.0.08H.10');
    expect(chaineAv1(hex('8148cc00'))).toBe('av01.2.08H.10');
    expect(chaineAv1(hex('8148ec00'))).toBe('av01.2.08H.12');
  });
  it('HEVC : compatibilités inversées, niveau, contraintes sans les nuls de fin', () => {
    expect(chaineHevc(HVCC_PORTRAIT_120)).toBe('hvc1.1.6.L153.90');
    // Main 10 (profil 2, compatibilité du profil 2 seule), rang haut, niveau 5.0, contraintes B0
    expect(chaineHevc(hex('012220000000b0000000000096f000fcfdfafa00000f00'))).toBe('hvc1.2.4.H150.B0');
    expect(chaineHevc(HVCC_PORTRAIT_120, 'hev1')).toBe('hev1.1.6.L153.90');
  });
  it('refuse une configuration inattendue', () => {
    expect(() => chaineAv1(hex('010d4c00'))).toThrow(/av1C/);
    expect(() => chaineHevc(hex('0201'))).toThrow(/hvcC/);
  });
  it('trouve la configuration dans moov → trak → mdia → minf → stbl → stsd', () => {
    expect(chaineCodec(mp4('av01', boite('av1C', AV1C_PORTRAIT_120)))).toBe('av01.0.13M.10');
    expect(chaineCodec(mp4('hvc1', boite('hvcC', HVCC_PORTRAIT_120)))).toBe('hvc1.1.6.L153.90');
    expect(() => chaineCodec(mp4('avc1', boite('avcC', new Uint8Array(8))))).toThrow(/ni hvcC/);
  });
});

describe('boîtes de tête', () => {
  it('faststart : moov avant mdat ; sinon après', () => {
    expect(ordreDeTete(mp4('av01', boite('av1C', AV1C_PORTRAIT_120)))).toEqual(['ftyp', 'moov', 'free', 'mdat']);
    expect(ordreDeTete(mp4('av01', boite('av1C', AV1C_PORTRAIT_120), false))).toEqual(['ftyp', 'free', 'mdat', 'moov']);
  });
  it('taille 64 bits (1) et taille 0 (jusqu’à la fin)', () => {
    const grande = new Uint8Array(20);
    new DataView(grande.buffer).setUint32(0, 1);
    grande.set(ascii('mdat'), 4);
    new DataView(grande.buffer).setBigUint64(8, 20n);
    const fin = new Uint8Array(12);
    fin.set(ascii('free'), 4);
    const b = new Uint8Array(32);
    b.set(grande, 0);
    b.set(fin, 20);
    expect(boites(b)).toEqual([{ type: 'mdat', debut: 0, fin: 20, corps: 16 }, { type: 'free', debut: 20, fin: 32, corps: 28 }]);
  });
  it('refuse une boîte qui dépasse le fichier', () => {
    const b = boite('mdat', new Uint8Array(8));
    expect(() => boites(b.subarray(0, 12))).toThrow(/tronquée/);
  });
});
