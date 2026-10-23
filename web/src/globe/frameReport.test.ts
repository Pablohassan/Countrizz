import { describe, expect, it } from 'vitest';
import { frameWindow, reportQuery, windowLine } from './frameReport';

describe('mesure sur téléphone (?mesure) : fenêtre d’images et rapport', () => {
  // 10 images : 8 à la cadence, une de 30 ms, une de 70 ms ; calcul de 2 à 11 ms
  const intervals = [16.7, 16.6, 16.7, 16.8, 30, 16.7, 16.7, 70, 16.6, 16.7];
  const js = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  it('médiane, p90, max, à-coups (> 25 et > 50 ms), calcul médian et max', () => {
    expect(frameWindow(intervals, js)).toEqual({ n: 10, med: 16.7, p90: 70, max: 70, over25: 2, over50: 1, jsMed: 7, jsMax: 11 });
  });

  it('fenêtre vide : rien', () => {
    expect(frameWindow([], [])).toBeNull();
  });

  it('rapport : une requête courte, tout ce qu’il faut pour savoir qui freine (GPU ou calcul)', () => {
    const w = frameWindow(intervals, js)!;
    const q = new URLSearchParams(reportQuery(w, {
      backend: 'webgpu', tier: 'haute', degradation: 'aucune', maxTexture2D: 8192, format: null, dpr: 2.25, medianMs: 16.7, traa: true, events: [],
    }, { t: 12.4, longTasks: 1, longMs: 54, gpu: 'arm/valhall', vue: 'accueil', w: 412, h: 915, ecran: 2.625 }));
    expect(Object.fromEntries(q)).toEqual({
      v: '1', t: '12', vue: 'accueil', n: '10', med: '16.7', p90: '70.0', max: '70', a25: '2', a50: '1', js: '7.0', jsmax: '11',
      lt: '1', ltms: '54', dpr: '2.25', tier: 'haute', deg: 'aucune', traa: '1', be: 'webgpu', tex: '8192', gpu: 'arm/valhall',
      w: '412', h: '915', ecran: '2.625',
    });
  });

  it('encart : une ligne lisible', () => {
    expect(windowLine(frameWindow(intervals, js)!)).toBe('Images : 16,7 ms (p90 70,0 ; max 70) ; à-coups 2 ; calcul 7,0 ms');
  });
});
