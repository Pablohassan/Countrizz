/**
 * Lecture minimale d'un MP4 (ISO BMFF, ISO/IEC 14496-12) : l'ordre des boîtes de tête (`moov` avant `mdat` pour une
 * lecture qui démarre avant la fin du téléchargement) et la chaîne de codec RFC 6381 lue dans la configuration du
 * décodeur : `av1C` (AV1 Codec ISO Media File Format Binding, « Codecs Parameter String ») ou `hvcC` (ISO/IEC 14496-15,
 * annexe E). Le lecteur s'en sert pour `canPlayType` et `decodingInfo` : rien n'est écrit à la main.
 */
export interface Boite { type: string; debut: number; fin: number; corps: number }

/** Boîtes contiguës de `b` entre `debut` et `fin` (taille sur 32 bits ; 1 → 64 bits qui suivent ; 0 → jusqu'à `fin`). */
export function boites(b: Uint8Array, debut = 0, fin = b.length): Boite[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Boite[] = [];
  for (let o = debut; o + 8 <= fin;) {
    const type = String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!);
    let taille = dv.getUint32(o);
    let corps = o + 8;
    if (taille === 1) { taille = Number(dv.getBigUint64(o + 8)); corps = o + 16; }
    else if (taille === 0) taille = fin - o;
    if (taille < corps - o || o + taille > fin) throw new Error(`MP4 : boîte « ${type} » tronquée à l'octet ${o}`);
    out.push({ type, debut: o, fin: o + taille, corps });
    o += taille;
  }
  return out;
}

/** Types des boîtes de tête dans l'ordre du fichier (`+faststart` : `ftyp, moov, free, mdat`). */
export function ordreDeTete(b: Uint8Array): string[] {
  return boites(b).map((x) => x.type);
}

function sous(b: Uint8Array, parent: Boite, type: string): Boite | undefined {
  return boites(b, parent.corps, parent.fin).find((x) => x.type === type);
}

/** `av01.P.LLT.DD` : profil, niveau (2 chiffres), rang M/H, profondeur (08, 10, 12). */
export function chaineAv1(av1C: Uint8Array): string {
  if (av1C.length < 4 || av1C[0] !== 0x81) throw new Error('av1C : marqueur ou version inattendus');
  const profil = av1C[1]! >> 5, niveau = av1C[1]! & 31;
  const rang = av1C[2]! >> 7, haute = (av1C[2]! >> 6) & 1, douze = (av1C[2]! >> 5) & 1;
  const bits = profil === 2 && haute ? (douze ? 12 : 10) : haute ? 10 : 8;
  return `av01.${profil}.${String(niveau).padStart(2, '0')}${rang ? 'H' : 'M'}.${String(bits).padStart(2, '0')}`;
}

/**
 * `hvc1.[A|B|C]profil.compat.Lniveau.contraintes` : compatibilités en bits inversés et en hexadécimal, rang L/H et
 * niveau en décimal, octets de contraintes en hexadécimal, les nuls de fin omis.
 */
export function chaineHevc(hvcC: Uint8Array, entree = 'hvc1'): string {
  if (hvcC.length < 23 || hvcC[0] !== 1) throw new Error('hvcC : version inattendue');
  const espace = hvcC[1]! >> 6, rang = (hvcC[1]! >> 5) & 1, profil = hvcC[1]! & 31;
  const compat = new DataView(hvcC.buffer, hvcC.byteOffset + 2, 4).getUint32(0);
  let inverse = 0;
  for (let k = 0; k < 32; k++) if (compat & (1 << k)) inverse |= 1 << (31 - k);
  const contraintes = Array.from(hvcC.subarray(6, 12));
  while (contraintes.length > 0 && contraintes[contraintes.length - 1] === 0) contraintes.pop();
  const hex = (n: number) => n.toString(16).toUpperCase();
  return [`${entree}`, `${['', 'A', 'B', 'C'][espace]}${profil}`, hex(inverse >>> 0), `${rang ? 'H' : 'L'}${hvcC[12]}`, ...contraintes.map(hex)].join('.');
}

/** Chaîne de codec de la première piste vidéo AV1 ou HEVC (moov → trak → mdia → minf → stbl → stsd). */
export function chaineCodec(b: Uint8Array): string {
  const moov = boites(b).find((x) => x.type === 'moov');
  if (!moov) throw new Error('MP4 sans boîte moov');
  for (const trak of boites(b, moov.corps, moov.fin).filter((x) => x.type === 'trak')) {
    let n: Boite | undefined = trak;
    for (const t of ['mdia', 'minf', 'stbl', 'stsd']) n = n && sous(b, n, t);
    if (!n) continue;
    // stsd : version et drapeaux (4 octets), nombre d'entrées (4), puis les entrées ; une entrée visuelle a 78 octets
    // de champs fixes avant ses boîtes filles (ISO/IEC 14496-12 §12.1.3).
    for (const e of boites(b, n.corps + 8, n.fin)) {
      const enfants = boites(b, e.corps + 78, e.fin);
      const conf = enfants.find((x) => x.type === 'av1C' || x.type === 'hvcC');
      if (!conf) continue;
      const octets = b.subarray(conf.corps, conf.fin);
      return conf.type === 'av1C' ? chaineAv1(octets) : chaineHevc(octets, e.type);
    }
  }
  throw new Error('MP4 sans configuration av1C ni hvcC');
}
