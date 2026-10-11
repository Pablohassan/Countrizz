import { describe, expect, it } from 'vitest';
import { INTRO } from '../../../../src/intro/temps';
import { argumentsBlender, DISQUE_MIN_RENDU, imageA, lireDemande, perime, peripherique, refusDisque, TEMOINS } from '../../lib/lanceur';

const temoins = TEMOINS.map((x) => imageA(x.t));

describe('lanceur de Blender (fabrique de l’intro vidéo, spec §2.4)', () => {
  it('numérote les images comme rendre.py : image n ↔ t = (n − 1) / 120 s', () => {
    expect(imageA(0)).toBe(1);
    expect(imageA(3.68)).toBe(443);
    expect(imageA(19.8)).toBe(2377);
  });

  it('témoins : des instants de l’intro dans l’ordre, jusqu’à la dernière image', () => {
    expect(temoins).toEqual([...temoins].sort((a, b) => a - b));
    expect(new Set(temoins).size).toBe(temoins.length);
    expect(temoins[0]).toBeGreaterThan(imageA(INTRO.CHUTE));
    expect(temoins.at(-1)).toBe(imageA(INTRO.FIN));
  });

  it('lit la demande : mode, cadrages (les deux par défaut), images (les témoins par défaut), options', () => {
    expect(lireDemande(['apercu'])).toEqual({ mode: 'apercu', cadrages: ['portrait', 'paysage'], images: [], neuf: false });
    expect(lireDemande(['temoins', '--cadrage', 'paysage'])).toEqual({ mode: 'temoins', cadrages: ['paysage'], images: temoins, neuf: false });
    expect(lireDemande(['apercu', '--cadrage', 'portrait', '--images', '443,985', '--echelle', '25', '--echantillons', '8', '--neuf']))
      .toEqual({ mode: 'apercu', cadrages: ['portrait'], images: [443, 985], echelle: 25, echantillons: 8, neuf: true });
    expect(() => lireDemande(['film'])).toThrow(/mode/);
    expect(() => lireDemande(['rendu', '--cadrage', 'carre'])).toThrow(/cadrage/);
    expect(() => lireDemande(['apercu', '--images', '12,x'])).toThrow(/images/);
  });

  it('arguments de Blender : usine, code de sortie si Python lève, journal de Cycles, puis ceux de rendre.py', () => {
    expect(argumentsBlender({ mode: 'apercu', cadrages: ['portrait'], images: [443, 985], echelle: 25, neuf: false }, 'portrait', '/w/rendre.py', '/w/.cache')).toEqual([
      '-b', '--factory-startup', '--python-exit-code', '1', '--debug-cycles', '-P', '/w/rendre.py', '--',
      '--mode', 'apercu', '--cadrage', 'portrait', '--cache', '/w/.cache', '--images', '443,985', '--echelle', '25',
    ]);
    expect(argumentsBlender({ mode: 'rendu', cadrages: ['paysage'], images: [], echantillons: 96, neuf: true }, 'paysage', 'r.py', 'c').slice(8))
      .toEqual(['--mode', 'rendu', '--cadrage', 'paysage', '--cache', 'c', '--echantillons', '96', '--neuf']);
  });

  it('sprite : une seule passe, sans cadrage ni clés', () => {
    const d = lireDemande(['sprite']);
    expect(d).toEqual({ mode: 'sprite', cadrages: [], images: [], neuf: false });
    expect(argumentsBlender(d, null, 'r.py', 'c').slice(8)).toEqual(['--mode', 'sprite', '--cache', 'c']);
  });

  it('refuse un rendu complet sous 15 Go libres, jamais un aperçu ni des témoins', () => {
    expect(refusDisque(DISQUE_MIN_RENDU - 1, 'rendu')).toMatch(/15 Go/);
    expect(refusDisque(DISQUE_MIN_RENDU, 'rendu')).toBeNull();
    expect(refusDisque(1e9, 'apercu')).toBeNull();
    expect(refusDisque(1e9, 'temoins')).toBeNull();
  });

  it('fraîcheur : une cible absente, ou plus vieille qu’une de ses sources, est périmée', () => {
    expect(perime(null, 'keys-portrait.json', [{ chemin: 'timeline.ts', mtimeMs: 1 }])).toMatch(/absent/);
    expect(perime(5, 'keys-portrait.json', [{ chemin: 'temps.ts', mtimeMs: 4 }, { chemin: 'timeline.ts', mtimeMs: 6 }])).toMatch(/timeline\.ts/);
    expect(perime(5, 'keys-portrait.json', [{ chemin: 'timeline.ts', mtimeMs: 5 }])).toBeNull();
  });

  it('reconnaît la ligne de Cycles qui dit sur quel périphérique il calcule', () => {
    expect(peripherique('                            | Path tracing on: Apple M4 Pro (GPU - 16 cores) (Metal) (display) [METAL_Apple M4 Pro (GPU - 16 cores)]')).toBe('metal');
    expect(peripherique('  | Path tracing on: Apple M4 Pro (CPU)')).toBe('autre');
    expect(peripherique('[rendre] f_0443.png 270×585 1.67 s')).toBeNull();
  });
});
