import { describe, expect, it } from 'vitest';
import { BULLES, BULLES_RANGE } from '../../../../src/intro/temps';
import { REFERENCES } from '../../../../src/intro/cadrages';
import { bullesApercu, bulleSvg, grapheApercu } from '../../lib/apercu';

describe('aperçu avec bulles', () => {
  it('six bulles : chaque question de son apparition à son retournement, puis sa réponse jusqu’au rangement', () => {
    expect(bullesApercu()).toEqual([
      { bulle: 'capitale', texte: 'Capitale ?', de: BULLES.capitale.apparait, a: BULLES.capitale.retourne },
      { bulle: 'capitale', texte: 'Paris', de: BULLES.capitale.retourne, a: BULLES_RANGE },
      { bulle: 'pays', texte: 'Pays ?', de: BULLES.pays.apparait, a: BULLES.pays.retourne },
      { bulle: 'pays', texte: 'France', de: BULLES.pays.retourne, a: BULLES_RANGE },
      { bulle: 'drapeau', texte: 'Drapeau ?', de: BULLES.drapeau.apparait, a: BULLES.drapeau.retourne },
      { bulle: 'drapeau', texte: null, de: BULLES.drapeau.retourne, a: BULLES_RANGE },
    ]);
  });

  it('bulle : la pointe de la queue est en bas à gauche, à l’échelle du cadrage', () => {
    expect(bulleSvg('Paris', 1).pointe).toEqual([8, 58]);
    const p = bulleSvg('Paris', REFERENCES.portrait.echelle);
    expect(p.pointe[0]).toBeCloseTo(8 * 1080 / 390, 9);
    expect(p.svg).toContain('>Paris</text>');
    expect(bulleSvg(null, 1).svg).toContain('fill="#2b55c9"');
  });

  it('graphe : nuit, 60 i/s, cadrage plein, une superposition par bulle dans sa fenêtre, bt709 étiqueté', () => {
    expect(grapheApercu('paysage', [{ x: 10.4, y: -3.6, de: 11.1, a: 14 }, { x: 0, y: 0, de: 14, a: 16.2 }])).toBe(
      '[1][0]overlay=format=gbrp:shortest=1,fps=60,scale=w=1920:h=1080:flags=lanczos[v0];'
      + "[v0][2]overlay=format=gbrp:x=10:y=-4:enable='gte(t,11.1)*lt(t,14)'[v1];"
      + "[v1][3]overlay=format=gbrp:x=0:y=0:enable='gte(t,14)*lt(t,16.2)'[v2];"
      + '[v2]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    );
  });
});
