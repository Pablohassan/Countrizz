import { describe, expect, it } from 'vitest';
import { INTRO, IPS_MAITRE } from '../../../../src/intro/temps';
import { idVariante } from '../../../../src/intro/videos';
import {
  argsFfmpeg, controlerFond, controlerSonde, imagesAttendues, manifeste, nomFichier, plafond, pointsDeFond, REGLAGES,
  SORTIES, verdictDebit, type Sonde, type Sortie,
} from '../../lib/encodage';
import { IMAGES_MAITRE } from '../../lib/temoins';

const sortie = (id: string): Sortie => SORTIES.find((s) => idVariante(s) === id)!;

describe('les 10 vidéos', () => {
  it('portrait plein 60/120, portrait léger 60, paysage 60/120, chacune en AV1 et HEVC, chacune réglée', () => {
    expect(SORTIES.map(idVariante)).toEqual([
      'portrait-plein-120-av1', 'portrait-plein-120-hevc', 'portrait-plein-60-av1', 'portrait-plein-60-hevc',
      'portrait-leger-60-av1', 'portrait-leger-60-hevc', 'paysage-plein-120-av1', 'paysage-plein-120-hevc',
      'paysage-plein-60-av1', 'paysage-plein-60-hevc',
    ]);
    expect(Object.keys(REGLAGES).sort()).toEqual(SORTIES.map(idVariante).sort());
    expect(SORTIES.map(nomFichier)).toContain('intro-portrait-leger-60.hevc.mp4');
    expect(nomFichier(sortie('portrait-plein-120-av1'))).toBe('intro-portrait-120.av1.mp4');
    expect(sortie('portrait-leger-60-av1')).toMatchObject({ width: 720, height: 1560 });
    expect(sortie('paysage-plein-60-hevc')).toMatchObject({ width: 1920, height: 1080 });
  });

  it('images : la dernière image maîtresse est l’instant FIN ; à 60 i/s une sur deux (mesuré : 241 → 120)', () => {
    expect((IMAGES_MAITRE - 1) / IPS_MAITRE).toBeCloseTo(INTRO.FIN, 9);
    expect(imagesAttendues(120, 241)).toBe(241);
    expect(imagesAttendues(60, 241)).toBe(120);
    expect(imagesAttendues(60, 360)).toBe(180);
  });
});

describe('arguments ffmpeg', () => {
  const entree = { dossier: '/f/portrait', width: 1080, height: 2340 };

  it('AV1 120 : nuit exacte en gbrp, bt709 étiqueté, 10 bits, plafond mbr, faststart', () => {
    expect(argsFfmpeg(sortie('portrait-plein-120-av1'), entree, '/o/a.mp4')).toEqual([
      '-hide_banner', '-y', '-framerate', '120', '-start_number', '1', '-i', '/f/portrait/f_%04d.png',
      '-f', 'lavfi', '-i', 'color=c=0x16173a:s=1080x2340:r=120,format=gbrp',
      '-filter_complex', '[1][0]overlay=format=gbrp:shortest=1,scale=w=1080:h=2340:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p10le,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
      '-c:v', 'libsvtav1', '-preset', '5', '-crf', '28', '-g', '240', '-svtav1-params', 'mbr=4000',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', '-an', '/o/a.mp4',
    ]);
  });

  it('HEVC 60 léger : fps=60 dans le graphe, réduction à 720 × 1560, Main 8 bits, étiquette hvc1, VBV', () => {
    const a = argsFfmpeg(sortie('portrait-leger-60-hevc'), entree, '/o/b.mp4');
    expect(a[a.indexOf('-filter_complex') + 1]).toBe('[1][0]overlay=format=gbrp:shortest=1,fps=60,scale=w=720:h=1560:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv');
    expect(a.slice(a.indexOf('-c:v'), a.indexOf('-colorspace'))).toEqual([
      '-c:v', 'libx265', '-preset', 'slow', '-crf', '20', '-g', '120', '-tag:v', 'hvc1',
      '-x265-params', 'log-level=error:vbv-maxrate=4000:vbv-bufsize=8000',
    ]);
    expect(a).not.toContain('select');
  });

  it('la source de nuit a la taille des images d’entrée (aperçu plus petit : mis à l’échelle par scale)', () => {
    const a = argsFfmpeg(sortie('paysage-plein-60-av1'), { dossier: '/f/paysage', width: 960, height: 540 }, '/o/c.mp4');
    expect(a).toContain('color=c=0x16173a:s=960x540:r=120,format=gbrp');
    expect(a[a.indexOf('-filter_complex') + 1]).toContain(',fps=60,scale=w=1920:h=1080:');
  });
});

describe('contrôles', () => {
  const conforme: Sonde = {
    codec_name: 'av1', codec_tag_string: 'av01', width: 1080, height: 2340, pix_fmt: 'yuv420p10le',
    r_frame_rate: '120/1', nb_frames: '2377', color_range: 'tv', color_space: 'bt709', color_primaries: 'bt709',
    color_transfer: 'bt709', bit_rate: '991000',
  };

  it('ffprobe : conforme → aucun écart ; étiquettes de couleur perdues ou image manquante → nommées', () => {
    const s = sortie('portrait-plein-120-av1');
    expect(controlerSonde(s, conforme, 2377)).toEqual([]);
    const { color_primaries: _p, color_transfer: _t, ...sans } = conforme;
    expect(controlerSonde(s, { ...sans, nb_frames: '2376' }, 2377)).toEqual([
      'images : 2376 au lieu de 2377', 'primaires : (absentes) au lieu de bt709', 'transfert : (absent) au lieu de bt709',
    ]);
    expect(controlerSonde(sortie('portrait-plein-120-hevc'), conforme, 2377)).toEqual([
      'codec : av1 au lieu de hevc', 'étiquette : av01 au lieu de hvc1', 'format : yuv420p10le au lieu de yuv420p',
    ]);
  });

  it('points de fond : seulement là où tout le carré autour est transparent', () => {
    const w = 200, h = 100, alpha = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 100; x < w; x++) alpha[y * w + x] = 255;   // moitié droite opaque
    const p = pointsDeFond(alpha, w, h, 30, 10);
    expect(p).toEqual([[10, 10], [40, 10], [70, 10], [10, 40], [40, 40], [70, 40], [10, 70], [40, 70], [70, 70]]);
  });

  it('fond décodé : ± 3 de (22, 23, 58)', () => {
    const rgb = Uint8Array.from([22, 23, 58, 19, 26, 61, 22, 23, 54]);
    expect(controlerFond(rgb, 3, [[0, 0], [1, 0]])).toEqual([]);
    expect(controlerFond(rgb, 3, [[2, 0]])).toEqual(['(2, 0) : 22,23,54']);
  });

  it('verdict de débit : plafond au-delà de 90 %, marge sous 50 %', () => {
    expect(verdictDebit(3700, { crf: 30, maxKbps: 4000 })).toBe('plafond');
    expect(verdictDebit(1999, { crf: 30, maxKbps: 4000 })).toBe('marge');
    expect(verdictDebit(2500, { crf: 30, maxKbps: 4000 })).toBe('ok');
  });
});

describe('plafonds du budget', () => {
  it('taille mesurée arrondie au Mo supérieur, + 10 %', () => {
    expect(plafond(2_546_202)).toBe(3_300_000);
    expect(plafond(3_000_000)).toBe(3_300_000);
    expect(plafond(3_000_001)).toBe(4_400_000);
  });
});

describe('manifeste', () => {
  it('au format du contrat : chemins /video/, type lu dans le fichier, octets réels', () => {
    const m = manifeste([
      { s: sortie('portrait-plein-120-av1'), octets: 250758, codecs: 'av01.0.13M.10' },
      { s: sortie('paysage-plein-60-hevc'), octets: 53518, codecs: 'hvc1.1.6.L123.90' },
    ]);
    expect(m).toEqual({
      version: 1, duree: INTRO.FIN,
      affiches: { portrait: '/intro/affiche-portrait.webp', paysage: '/intro/affiche-paysage.webp' },
      variantes: [
        { cadrage: 'portrait', taille: 'plein', ips: 120, codec: 'av1', src: '/video/intro-portrait-120.av1.mp4',
          type: 'video/mp4; codecs="av01.0.13M.10"', width: 1080, height: 2340, octets: 250758 },
        { cadrage: 'paysage', taille: 'plein', ips: 60, codec: 'hevc', src: '/video/intro-paysage-60.hevc.mp4',
          type: 'video/mp4; codecs="hvc1.1.6.L123.90"', width: 1920, height: 1080, octets: 53518 },
      ],
    });
  });
});
