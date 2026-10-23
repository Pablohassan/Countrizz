import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LOGO_LETTRES } from '../intro/temps';
import { LogoTitle } from './LogoTitle';

const html = renderToStaticMarkup(createElement(LogoTitle, { angle: null, visible: true, entree: 'pop' }));
/** les lettres du titre (span.logo-l), dans l'ordre : texte, data-l, présence de la boule */
const lettres = [...html.matchAll(/<span class="logo-l([^"]*)"([^>]*)>(.*?)<\/span>/g)].map(([, classes, attributs, contenu]) => ({
  classes: classes.trim(),
  dataL: /data-l="([^"]*)"/.exec(attributs)?.[1],
  cachee: attributs.includes('aria-hidden="true"'),
  texte: contenu.replace(/<[^>]*>/g, ''),
  boule: contenu.includes('class="logo-point"'),
}));

describe('LogoTitle : le « i » à boule (lettres B de la vidéo, point du « i » en sphère)', () => {
  it('le titre se lit toujours « Countrizz » pour les lecteurs d’écran ; les lettres restent cachées', () => {
    expect(html).toMatch(/^<h1 class="accueil-titre logo-titre logo-titre--pop logo-titre--visible" aria-label="Countrizz"/);
    expect(lettres).toHaveLength(LOGO_LETTRES.length);
    expect(lettres.every((l) => l.cachee)).toBe(true);
    expect(html).toContain('<span class="logo-o" aria-hidden="true">o<i');
  });

  it('le « i » s’écrit « ı » (U+0131, même avance, sans point) avec sa boule ; les autres lettres sont inchangées', () => {
    expect(lettres.map((l) => l.texte)).toEqual(['C', 'u', 'n', 't', 'r', '\u0131', 'z', 'z']);
    expect(lettres.map((l) => l.boule)).toEqual([false, false, false, false, false, true, false, false]);
    expect(lettres[5]!.classes).toBe('logo-i');
    expect(html.match(/class="logo-point"/g)).toHaveLength(1);
    expect(html).not.toMatch(/>i</);
  });

  it('la boule est l’ancre de largeur nulle posée AVANT le glyphe : en début de ligne, sa place ne dépend pas de letter-spacing', () => {
    expect(html).toContain('style="--i:5"><i class="logo-point"></i>\u0131</span>');
  });

  it('chaque lettre porte son glyphe dans data-l (calque de la face en dégradé, ::after)', () => {
    expect(lettres.map((l) => l.dataL)).toEqual(lettres.map((l) => l.texte));
  });

  it('les lettres gardent leur rang d’apparition (--i) ; en fondu, même arbre', () => {
    expect([...html.matchAll(/--i:(\d+)/g)].map((m) => +m[1]!)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const fondu = renderToStaticMarkup(createElement(LogoTitle, { angle: 1, visible: false, entree: 'fondu' }));
    expect(fondu.replace(/<i [^>]*class="logo-terre"[^>]*><\/i>/, '')).toBe(html.replace(/<i [^>]*class="logo-terre"[^>]*><\/i>/, '')
      .replace('logo-titre--pop logo-titre--visible', 'logo-titre--fondu'));
  });
});

describe('home.css : la petite Terre du « o » tourne à 24 images/s, hors du fil principal (23/10)', () => {
  const css = readFileSync(new URL('./home.css', import.meta.url), 'utf8');
  const bande = /^\.logo-terre::before\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
  it('96 vues par tour de 4 s : une bande de 96 × 0,66 em, 96 pas', () => {
    expect(bande).toMatch(/width: 63\.36em/);
    expect(bande).toMatch(/\/ 63\.36em \.66em/);
    expect(bande).toMatch(/steps\(96\)/);
    expect(bande).toMatch(/animation-delay: var\(--delai, 0s\)/);
  });
  it('la bande glisse par translation (le compositeur l’anime même quand le globe occupe le fil principal), pas par background-position', () => {
    expect(css).toMatch(/@keyframes logo-tourne \{ to \{ transform: translateX\(-63\.36em\); \} \}/);
    expect(css).not.toMatch(/logo-tourne[^}]*background-position/);
  });
});

describe('home.css : la boule du « i » est celle de la vidéo (scene.py), pour que le fondu de fin ne saute pas', () => {
  const css = readFileSync(new URL('./home.css', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../../scripts/intro/blender/scene.py', import.meta.url), 'utf8');
  const regle = (selecteur: string) => new RegExp(`^${selecteur.replace(/[.:]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';
  const em = (texte: string, propriete: string) => Number(new RegExp(`(?:^|[;\\s])${propriete}:\\s*([\\d.]+)em`).exec(texte)?.[1]);
  const disque = regle('.logo-point::before'), ancre = regle('.logo-point');
  const d = em(disque, 'width');
  // le point du « i » de Chango (unités / 1000 em, mesuré avec fontTools) : x 81…365, bas à 535 au-dessus de la ligne de base
  const POINT = { milieuX: (81 + 365) / 2000, bas: 535 / 1000 };

  it('même diamètre que POINT_I_DIAMETRE (em) ; ronde', () => {
    const video = Number(/^POINT_I_DIAMETRE = ([\d.]+)$/m.exec(scene)?.[1]);
    expect(video).toBeGreaterThan(0);
    expect(d).toBe(video);
    expect(em(disque, 'height')).toBe(d);
    expect(disque).toMatch(/border-radius: 50%/);
  });

  it('même pose : centre x sur le milieu du point d’origine, bas sur son bas (elle grandit vers le haut)', () => {
    expect(em(disque, 'left') + d / 2).toBeCloseTo(POINT.milieuX, 9);
    expect(disque).toMatch(/bottom: 0;/);
    expect(em(ancre, 'vertical-align')).toBe(POINT.bas);
  });

  it('dégradé et liseré à l’échelle du diamètre : les longueurs relevées sur la boule de 0,23 em, × d / 0,23', () => {
    const fond = /background: ([^;]*);/.exec(disque)?.[1] ?? '';
    const longueurs = [...fond.matchAll(/([\d.]+)em/g)].map((m) => Number(m[1]) / d);
    const releve = [0.02, 0.045, 0.007, 0.014, 0.023, 0.046, 0.069, 0.092, 0.115, 0.138, 0.161].map((x) => x / 0.23);   // liseré (2), corps (9)
    expect(longueurs).toHaveLength(releve.length);
    longueurs.forEach((x, k) => expect(x, `longueur ${k}`).toBeCloseTo(releve[k]!, 9));
    expect(fond).toMatch(/at 94% 37%[^]*circle at 36\.4% 28\.9%/);   // liseré et reflet placés en % de la boule
  });
});
