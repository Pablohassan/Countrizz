import { describe, expect, it } from 'vitest';
import { BULLES, INTRO } from '../../../../src/intro/temps';
import { imageA, TEMOINS } from '../../lib/lanceur';
import { dernierPassage, estimation, tempsParImage } from '../../lib/mesure';
import type { Ancres } from '../../export-keys';
import { ancreTemoin, IMAGES_MAITRE, instantDe, legende } from '../../lib/temoins';

describe('images témoins', () => {
  it('chute, impact, toupie, logo, rezoom, chaque bulle, drapeau, titre : dans l’intro, dans l’ordre, distinctes', () => {
    expect(TEMOINS.map((x) => x.nom)).toEqual([
      'chute, départ', 'chute, avant l’impact', 'impact', 'toupie', 'logo', 'rezoom',
      'bulle Capitale', 'bulle Pays', 'bulle Drapeau', 'drapeau', 'titre', 'titre de fin',
    ]);
    const images = TEMOINS.map((x) => imageA(x.t)), T_SOL = INTRO.CHUTE + INTRO.D_CHUTE;
    expect(images).toEqual([...new Set(images)].sort((a, b) => a - b));
    expect(images[0]).toBeGreaterThan(imageA(INTRO.CHUTE));
    expect(images[1]).toBeLessThan(imageA(T_SOL));
    expect(images[2]).toBeGreaterThan(imageA(T_SOL));
    expect(images.at(-1)).toBe(IMAGES_MAITRE);
    const t = (nom: string) => TEMOINS.find((x) => x.nom === nom)!.t;
    expect([t('bulle Capitale'), t('bulle Pays'), t('bulle Drapeau')])
      .toEqual([BULLES.capitale.apparait, BULLES.pays.apparait, BULLES.drapeau.apparait]);
  });

  it('numérotation : f_0001 à t = 0, la dernière image à FIN', () => {
    expect(instantDe(1)).toBe(0);
    expect(instantDe(imageA(3.55))).toBeCloseTo(3.55, 9);
    expect(instantDe(IMAGES_MAITRE)).toBeCloseTo(INTRO.FIN, 9);
  });

  it('légende : instant à la française, nom, numéro', () => {
    expect(legende(IMAGES_MAITRE)).toBe(`${INTRO.FIN.toFixed(2).replace('.', ',')} s · titre de fin · image ${IMAGES_MAITRE}`);
    expect(legende(2)).toBe('0,01 s · image 2');
  });

  it('ancre d’une bulle : échantillon le plus proche, null hors de la fenêtre', () => {
    const a: Ancres = {
      version: 1, fps: 60, t0: 10.8,
      cadrages: {
        portrait: { width: 1080, height: 2340, capitale: [[500, 900], [502, 901], [504, 902]], pays: [], drapeau: [] },
        paysage: { width: 1920, height: 1080, capitale: [], pays: [], drapeau: [] },
      },
    };
    expect(ancreTemoin(a, 'portrait', 'capitale', 10.8 + 1 / 60)).toEqual([502, 901]);
    expect(ancreTemoin(a, 'portrait', 'capitale', 10.8 + 1.4 / 60)).toEqual([502, 901]);
    expect(ancreTemoin(a, 'portrait', 'capitale', 10.7)).toBeNull();
    expect(ancreTemoin(a, 'portrait', 'pays', 11)).toBeNull();
  });
});

// Journal du lanceur au format relevé sur ce Mac (Blender 5.0.1) : deux passages, des lignes d'autre nature entre les
// images ; une heure au-delà de 59:59 s'écrit `h:mm:ss.mmm`.
const JOURNAL = [
  '',
  '=== 2026-10-11T17:40:00.000Z /Applications/Blender.app/Contents/MacOS/Blender -b … --mode temoins --cadrage portrait',
  "00:09.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0181.png'",
  "00:30.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0429.png'",
  '',
  '=== 2026-10-11T17:53:22.485Z /Applications/Blender.app/Contents/MacOS/Blender -b … --mode temoins --cadrage portrait --neuf',
  '[rendre] périphérique : Apple M4 Pro (GPU - 16 cores)',
  "02:14.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0181.png'",
  '[rendre] f_0181.png 1080×2340 9.10 s',
  '02:20.100  render           | Fra: 429 | Mem: 3352M | Finished',
  "02:26.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0429.png'",
  "02:40.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0439.png'",
  "1:00:00.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0481.png'",
].join('\n');

describe('mesure du temps de rendu', () => {
  it('dernier passage du journal ; écarts entre images successives, la première écartée', () => {
    const p = dernierPassage(JOURNAL);
    expect(p.startsWith('=== 2026-10-11T17:53:22.485Z')).toBe(true);
    const t = tempsParImage(p);
    expect(Object.keys(t)).toEqual(['portrait']);
    expect(t.portrait).toEqual({ moyenne: (12 + 14 + 3440) / 3, mediane: 14, ecarts: 3 });
    expect(dernierPassage("00:01.000  render | Saved: '/a/b.png'")).toBe("00:01.000  render | Saved: '/a/b.png'");
  });

  it('rendu final : heures = images × somme des s/image ; au-delà de la cible, échantillons proportionnels au multiple de 16', () => {
    expect(estimation([10, 4], 2377, 128)).toEqual({ heures: (2377 * 14) / 3600, echantillons: 128 });
    // 2377 × 20 s = 13,2 h > 10 h → 128 × 10 / 13,2 = 96,9 → 96
    expect(estimation([14, 6], 2377, 128)).toEqual({ heures: (2377 * 20) / 3600, echantillons: 96 });
    expect(estimation([200, 100], 2377, 64).echantillons).toBe(16);
  });
});
