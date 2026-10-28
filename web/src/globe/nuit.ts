/**
 * Le ciel du globe prend la nuit de la vidéo et de l'interface (`--nuit`, theme.css ; NUIT de l'encodage de l'intro) :
 * au fondu, le noir du globe remplaçait le bleu nuit de la vidéo, tout le fond changeait sous l'accueil (mise en scène du
 * 24/10, choix de l'utilisateur). sRGB 8 bits.
 */
export const NUIT: readonly [number, number, number] = [0x16, 0x17, 0x3a];

type Rgb = [number, number, number];
const lineaire = (v8: number) => { const v = v8 / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

/** Tone mapping Neutral, celui de la sortie du post-traitement (three `neutralToneMapping`, Khronos PBR Neutral ; exposition 1). */
export function neutral(c: Rgb): Rgb {
  const x = Math.min(...c), offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const d = c.map((v) => v - offset) as Rgb, peak = Math.max(...d), start = 0.8 - 0.04;
  if (peak < start) return d;
  const k = 1 - start, newPeak = 1 - (k * k) / (peak + k - start), g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return d.map((v) => v * (newPeak / peak) * (1 - g) + newPeak * g) as Rgb;
}

/**
 * Le fond de la scène (linéaire) qui sort en NUIT à l'écran. Pour un pixel de ciel loin du limbe, la chaîne de l'image est :
 * fond × balance des blancs (atmosphère physique, `skyCalibration` ; 1 sans elle), puis Neutral, puis sRGB. Sous 0,08, Neutral
 * retire à chaque canal x − 6,25 x² (x : le plus petit canal) : le plus petit canal de sortie vaut 6,25 x², d'où x, puis le
 * décalage commun. Calculé, pas réglé à l'œil.
 */
export function fondNuit(whiteBalance: readonly [number, number, number] = [1, 1, 1]): Rgb {
  const o = NUIT.map(lineaire), omin = Math.min(...o);
  const x = Math.sqrt(omin / 6.25), offset = x - omin;
  return o.map((v, i) => (v + offset) / whiteBalance[i]!) as Rgb;
}
