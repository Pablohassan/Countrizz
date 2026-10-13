import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EOX } from '../../scripts/imagery/config';
import { eoxAttribution, ImageryCredit } from './credits';

describe('crédit de l’imagerie', () => {
  it('l’interface affiche l’attribution du pipeline, mot pour mot (spec §9)', () => {
    expect(eoxAttribution()).toBe(EOX.attribution);
  });

  it('le crédit peut passer au-dessus des calques de l’interface (z-index), sans rien perdre de son texte', () => {
    const html = renderToStaticMarkup(ImageryCredit({ placement: { zIndex: 20 } }));   // sans hook : appelé tel quel
    expect(html).toContain('z-index:20');
    expect(html).toContain('https://cloudless.eox.at');
  });
});
