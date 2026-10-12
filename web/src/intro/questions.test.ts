import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { versEcran } from './lecteur';
import {
  MARGE_QUESTION, ORDRE_QUESTIONS, POSES, QUESTIONS, RETOUR, ancreQuestion, etatLettre, etendue, partieVisible, poserMot, signes,
  texteQuestion, type Ancres, type Gabarit, type Mot,
} from './questions';
import { BULLES_RANGE, CADRAGES, type Cadrage } from './temps';
import { POINT_RP, frameAt } from './timeline';

/** Les ancres livrées (Task 3) : point, milieu de la frontière, haut du mât, px de la vidéo. */
const ANCRES = JSON.parse(readFileSync(new URL('../../public/intro/ancres.json', import.meta.url), 'utf8')) as Ancres;
/**
 * Chasse des signes de Chango (em), mesurée dans Chromium sur la police du site (`chango-latin.woff2`, le 12/10) ; U+202F,
 * l'espace fine, y fait 0,2 em. Le gabarit de test range les lettres comme la page les mesure (Intro.tsx) : une boîte de
 * leur chasse sur la hauteur de ligne (1 em).
 */
const CHASSE: Record<string, number> = {
  C: 0.82, a: 0.8, p: 0.81, i: 0.44, t: 0.66, l: 0.44, e: 0.74, '?': 0.68, P: 0.89, y: 0.77, s: 0.65, D: 0.9, r: 0.66, u: 0.86,
  o: 0.83, n: 0.86, F: 0.81, g: 0.83, '\u202F': 0.2,
};
function gabarit(texte: string, taille: number): Gabarit {
  let x = 0;
  const lettres: Gabarit['lettres'] = [];
  for (const s of signes(texte)) {
    if (!(s.c in CHASSE)) throw new Error(`chasse de « ${s.c} » inconnue`);
    const w = CHASSE[s.c] * taille;
    if (!s.blanc) lettres.push({ x: x + w / 2, y: taille / 2, w, h: taille });
    x += w;
  }
  return { largeur: x, hauteur: taille, lettres };
}

const LANGUES = ['fr', 'en'] as const;
/** Les écrans du Review Focus (1), le téléphone de référence et un bureau 16:10 ; l'écran tourné du Review Focus (4). */
const ECRANS = { telephone: { width: 390, height: 844 }, ipad: { width: 768, height: 1024 }, bureau219: { width: 2560, height: 1080 }, court: { width: 390, height: 664 }, bureau: { width: 1280, height: 800 } };
const TOURNE = { width: 844, height: 390 };
const cadrageDe = (e: { width: number; height: number }): Cadrage => (e.height > e.width ? 'portrait' : 'paysage');
/** Les trois mots d'une langue, mesurés (gabarit) puis posés pour un écran. */
const poser = (lang: 'fr' | 'en', cadrage: Cadrage, ecran: { width: number; height: number }, marge?: number) => ORDRE_QUESTIONS.map((q) => {
  const g = gabarit(texteQuestion(lang, q), POSES[cadrage].taille);
  return { g, mot: poserMot(q, cadrage, g, ecran, marge) };
});
/** Instant où la lettre `i` se pose (fin de son vol). */
const posee = (mot: Mot, i: number) => { const q = QUESTIONS[mot.question]; return q.naissance + i * q.ecart + q.vol; };

/**
 * Plus grand débordement de l'écran (px CSS, ≤ 0 : tout dedans) des lettres de ces mots, de leur pose au retour, au pas
 * d'une image à 60 i/s : chaque lettre est le cercle de sa boîte (elle peut tourner), à son échelle, ramené à l'écran.
 */
function debordement(poses: { g: Gabarit; mot: Mot }[], ecran: { width: number; height: number }, cadrage: Cadrage) {
  const video = CADRAGES[cadrage], s = Math.max(ecran.width / video.width, ecran.height / video.height);
  let pire = -Infinity, ou = '';
  for (const { g, mot } of poses) for (let t = posee(mot, 0); t < RETOUR; t += 1 / 60) mot.lettres.forEach((_, i) => {
    if (t < posee(mot, i)) return;
    const e = etatLettre(t, mot, i, ANCRES)!, [x, y] = versEcran([e.x, e.y], video, ecran, cadrage);
    const r = (Math.hypot(g.lettres[i].w, g.lettres[i].h) / 2) * e.echelle * s;
    const d = Math.max(r - x, x + r - ecran.width, r - y, y + r - ecran.height);
    if (d > pire) { pire = d; ou = `${mot.question}, lettre ${i}, à ${t.toFixed(2)} s`; }
  });
  return { pire, ou };
}

describe('textes des questions', () => {
  it('textes des catalogues à la typographie de chaque langue : espace fine insécable (U+202F) avant « ? » en français, « ? » collé en anglais', () => {
    expect(ORDRE_QUESTIONS.map((q) => texteQuestion('fr', q))).toEqual(['Capitale\u202F?', 'Pays\u202F?', 'Drapeau\u202F?']);
    expect(ORDRE_QUESTIONS.map((q) => texteQuestion('en', q))).toEqual(['Capital?', 'Country?', 'Flag?']);
    expect(signes('Pays\u202F?')).toEqual([
      { c: 'P', blanc: false }, { c: 'a', blanc: false }, { c: 'y', blanc: false }, { c: 's', blanc: false }, { c: '\u202F', blanc: true }, { c: '?', blanc: false },
    ]);
    // les lettres qui volent : les blancs n'en sont pas
    const lettres = (lang: 'fr' | 'en') => ORDRE_QUESTIONS.map((q) => signes(texteQuestion(lang, q)).filter((s) => !s.blanc).length);
    expect(lettres('fr')).toEqual([9, 5, 8]);
    expect(lettres('en')).toEqual([8, 8, 5]);
  });
});

describe('ancres des questions', () => {
  const n = Math.round((BULLES_RANGE - 10.8) * 60) + 1;
  const piste = Array.from({ length: n }, (_, i) => [i * 10, 1000 + i] as [number, number]);
  const A: Ancres = { version: 1, fps: 60, t0: 10.8, cadrages: {
    portrait: { width: 1080, height: 2340, capitale: piste, pays: piste, drapeau: piste },
    paysage: { width: 1920, height: 1080, capitale: [[5, 6]], pays: [], drapeau: [] },
  } };

  it('interpolation linéaire entre deux échantillons', () => {
    expect(ancreQuestion(A, 'portrait', 'capitale', 10.8)).toEqual([0, 1000]);
    const p = ancreQuestion(A, 'portrait', 'pays', 10.8 + 1.5 / 60);
    expect(p[0]).toBeCloseTo(15, 9);
    expect(p[1]).toBeCloseTo(1001.5, 9);
  });

  it('hors de la fenêtre : tenue à la première et à la dernière valeur (les lettres rentrent là où était l’objet)', () => {
    expect(ancreQuestion(A, 'portrait', 'capitale', 10.2)).toEqual([0, 1000]);
    const fin = ancreQuestion(A, 'portrait', 'drapeau', BULLES_RANGE);
    expect(fin[0]).toBeCloseTo((n - 1) * 10, 9);
    expect(fin[1]).toBeCloseTo(1000 + n - 1, 9);
    expect(ancreQuestion(A, 'portrait', 'drapeau', BULLES_RANGE + 0.3)).toEqual(ancreQuestion(A, 'portrait', 'drapeau', BULLES_RANGE + 0.02));
    expect(ancreQuestion(A, 'portrait', 'drapeau', BULLES_RANGE + 0.3)[0]).toBeCloseTo((n - 1) * 10, 9);
    expect(ancreQuestion(A, 'paysage', 'capitale', 12)).toEqual([5, 6]);
    expect(() => ancreQuestion(A, 'paysage', 'pays', 12)).toThrow('aucune ancre « pays » en paysage');
  });

  it('les ancres livrées couvrent la vie des questions : de la première naissance au retour (60 par seconde, jusqu’à BULLES_RANGE)', () => {
    expect(ANCRES.version).toBe(1);
    expect(ANCRES.fps).toBe(60);
    for (const c of ['portrait', 'paysage'] as const) for (const q of ORDRE_QUESTIONS) {
      const pts = ANCRES.cadrages[c][q], fin = ANCRES.t0 + (pts.length - 1) / ANCRES.fps;
      expect(ANCRES.t0).toBeLessThanOrEqual(QUESTIONS.capitale.naissance);
      expect(fin).toBeCloseTo(BULLES_RANGE, 9);
      expect(fin).toBeGreaterThan(RETOUR);
      expect(pts.flat().every(Number.isFinite)).toBe(true);
    }
  });
});

describe('naissance, vol et retour (horloge de la vidéo)', () => {
  it('ordre et instants de naissance : Capitale, Pays, Drapeau, lettre après lettre ; rien avant', () => {
    expect(ORDRE_QUESTIONS.map((q) => QUESTIONS[q].naissance)).toEqual([11.22, 11.6, 13.15]);
    for (const lang of LANGUES) for (const { mot } of poser(lang, 'portrait', ECRANS.telephone)) {
      const q = QUESTIONS[mot.question];
      mot.lettres.forEach((_, i) => {
        const t0 = q.naissance + i * q.ecart;
        expect(etatLettre(t0 - 0.3, mot, i, ANCRES), `${mot.question} ${i} avant`).toBeNull();
        expect(etatLettre(t0, mot, i, ANCRES), `${mot.question} ${i} à sa naissance`).toBeNull();
        expect(etatLettre(t0 + 0.01, mot, i, ANCRES), `${mot.question} ${i} juste après`).not.toBeNull();
      });
    }
    // avant la naissance de « Capitale ? », aucune lettre de la vidéo
    const tous = LANGUES.flatMap((l) => poser(l, 'paysage', ECRANS.bureau)).map((p) => p.mot);
    let vues = 0;
    for (let t = 0; t <= QUESTIONS.capitale.naissance; t += 1 / 120) for (const mot of tous) mot.lettres.forEach((_, i) => { if (etatLettre(t, mot, i, ANCRES)) vues++; });
    expect(vues).toBe(0);
  });

  it('chaque mot naît de son objet : le point vient de toucher Paris, la frontière se déroule, le drapeau sort du point (frameAt)', () => {
    const f = (t: number) => frameAt(t, 'portrait');
    const { capitale, pays, drapeau } = QUESTIONS;
    // le point tombe encore 0,02 s avant « Capitale ? » ; à sa naissance, il est posé sur Paris (plus de hauteur de chute)
    expect(f(capitale.naissance - 0.02).point.y).toBeGreaterThan(POINT_RP * 1.25 * 0.8 + 0.01);
    expect(f(capitale.naissance).point.y).toBeLessThanOrEqual(POINT_RP * 1.25 * 0.8 + 1e-9);
    // la frontière a commencé de se dérouler à la naissance de « Pays ? », pas 0,11 s avant ; pas finie quand la
    // dernière lettre de « Country? » (8 lettres) s'envole
    expect(f(pays.naissance - 0.11).border).toBe(0);
    expect(f(pays.naissance).border).toBeGreaterThan(0);
    expect(f(pays.naissance + 7 * pays.ecart).border).toBeLessThan(1);
    // le drapeau sort du point : visible à la naissance de « Drapeau ? », pas 0,16 s avant
    expect(f(drapeau.naissance - 0.16).flag.visible).toBe(false);
    expect(f(drapeau.naissance).flag.visible).toBe(true);
  });

  it('chaque lettre part de l’ancre courante de son objet et se pose à sa place (le drapeau monte : l’ancre suit)', () => {
    for (const lang of LANGUES) for (const cadrage of ['portrait', 'paysage'] as const) {
      for (const { mot } of poser(lang, cadrage, cadrage === 'portrait' ? ECRANS.telephone : ECRANS.bureau)) {
        const q = QUESTIONS[mot.question], [cx, cy] = mot.centre, a = (mot.inclinaison * Math.PI) / 180;
        mot.lettres.forEach(([nx, ny], i) => {
          const t0 = q.naissance + i * q.ecart;
          const d = etatLettre(t0 + 2e-4, mot, i, ANCRES)!, o = ancreQuestion(ANCRES, cadrage, mot.question, t0 + 2e-4);
          expect(Math.hypot(d.x - o[0], d.y - o[1]), `${mot.question} ${i} part de l’objet`).toBeLessThan(1);
          const p = etatLettre(t0 + q.vol, mot, i, ANCRES)!;
          expect(p.x).toBeCloseTo(cx + (nx - cx) * Math.cos(a) - (ny - cy) * Math.sin(a), 6);
          expect(p.y).toBeCloseTo(cy + (nx - cx) * Math.sin(a) + (ny - cy) * Math.cos(a), 6);
          expect([p.rot, p.echelle, p.opacite]).toEqual([expect.closeTo(mot.inclinaison, 9), 1, 1]);
        });
      }
    }
    // le haut du mât monte pendant que « Drapeau ? » s'envole : la dernière lettre ne part pas d'où partait la première
    const { naissance, ecart } = QUESTIONS.drapeau, n = signes(texteQuestion('fr', 'drapeau')).filter((s) => !s.blanc).length;
    const [a0, a1] = [naissance, naissance + (n - 1) * ecart].map((t) => ancreQuestion(ANCRES, 'portrait', 'drapeau', t));
    expect(Math.hypot(a1[0] - a0[0], a1[1] - a0[1])).toBeGreaterThan(10);
  });

  it('au rangement, retour dans l’objet : la dernière lettre d’abord dès RETOUR (15,6 s), toutes rentrées vers 16,2 s, avant le second dézoom (16,4 s)', () => {
    for (const lang of LANGUES) for (const cadrage of ['portrait', 'paysage'] as const) {
      for (const { mot } of poser(lang, cadrage, cadrage === 'portrait' ? ECRANS.telephone : ECRANS.bureau)) {
        const n = mot.lettres.length, fins: number[] = [];
        mot.lettres.forEach((_, i) => {
          expect(etatLettre(RETOUR, mot, i, ANCRES)!.echelle, `${mot.question} ${i} encore posée`).toBe(1);
          let t = RETOUR;
          while (etatLettre(t, mot, i, ANCRES) !== null) t += 0.001;
          fins.push(t);
          // juste avant de disparaître, elle est dans son objet, minuscule
          const e = etatLettre(t - 0.001, mot, i, ANCRES)!, b = ancreQuestion(ANCRES, cadrage, mot.question, t - 0.001);
          const r = etatLettre(RETOUR, mot, i, ANCRES)!, depart = Math.hypot(r.x - b[0], r.y - b[1]);
          expect(Math.hypot(e.x - b[0], e.y - b[1]), `${mot.question} ${i} dans son objet`).toBeLessThan(0.01 * depart);
          expect(e.echelle).toBeLessThan(0.02);
        });
        expect(etatLettre(RETOUR + 0.02, mot, n - 1, ANCRES)!.echelle, 'la dernière lettre part la première').not.toBe(1);
        expect(etatLettre(RETOUR + 0.02, mot, 0, ANCRES)!.echelle).toBe(1);
        for (let i = 1; i < n; i++) expect(fins[i]).toBeLessThan(fins[i - 1]);
        expect(Math.max(...fins)).toBeGreaterThanOrEqual(BULLES_RANGE);   // la première lettre rentre la dernière : vers 16,2 s
        expect(Math.max(...fins)).toBeLessThan(16.4);
        mot.lettres.forEach((_, i) => expect(etatLettre(16.4, mot, i, ANCRES)).toBeNull());
      }
    }
  });

  it('fonction pure du temps de la vidéo : le même instant donne la même image, quel que soit l’ordre des appels (?introT, réseau qui cale)', () => {
    const mots = poser('fr', 'portrait', ECRANS.telephone).map((p) => p.mot);
    const image = (t: number) => mots.map((mot) => mot.lettres.map((_, i) => etatLettre(t, mot, i, ANCRES)));
    const vues = [13.6, 11.5, 15.9, 13.6, 12.0, 16.1, 13.6].map(image);
    expect(vues[3]).toEqual(vues[0]);
    expect(vues[6]).toEqual(vues[0]);
    expect(vues[0].flat().filter((e) => e !== null)).toHaveLength(22);   // à 13,6 s : 9 + 5 + 8 lettres à l'image
  });
});

describe('places de repos dans la partie visible (Review Focus 1 et 4)', () => {
  it('partie visible : ce que l’écran montre de la vidéo, à la marge près', () => {
    for (const ecran of [...Object.values(ECRANS), TOURNE]) for (const cadrage of ['portrait', 'paysage'] as const) {
      const v = partieVisible(cadrage, ecran, MARGE_QUESTION), video = CADRAGES[cadrage];
      const [a, b] = [versEcran([v.x0, v.y0], video, ecran, cadrage), versEcran([v.x1, v.y1], video, ecran, cadrage)];
      for (const [x, y] of [[a[0], MARGE_QUESTION], [a[1], MARGE_QUESTION], [b[0], ecran.width - MARGE_QUESTION], [b[1], ecran.height - MARGE_QUESTION]]) expect(x).toBeCloseTo(y, 9);
    }
    // iPad portrait : toute la largeur, les 1440 premiers px ; bureau 21:9 : toute la largeur, de 135 à 945 px
    const ipad = partieVisible('portrait', ECRANS.ipad), large = partieVisible('paysage', ECRANS.bureau219);
    expect([ipad.x0, ipad.y0, ipad.x1, ipad.y1].map((x) => Math.round(x * 1e6) / 1e6)).toEqual([0, 0, 1080, 1440]);
    expect([large.x0, large.y0, large.x1, large.y1].map((x) => Math.round(x * 1e6) / 1e6)).toEqual([0, 135, 1920, 945]);
  });

  it('l’étendue d’un mot contient chacune de ses lettres, de la pose au retour (inclinaison qui oscille, onde, saut du « ? »)', () => {
    for (const lang of LANGUES) for (const cadrage of ['portrait', 'paysage'] as const) {
      for (const { g, mot } of poser(lang, cadrage, cadrage === 'portrait' ? ECRANS.telephone : ECRANS.bureau)) {
        const e = etendue(g, mot.inclinaison, mot.taille), [cx, cy] = mot.centre;
        let pire = -Infinity;
        for (let t = posee(mot, 0); t < RETOUR; t += 1 / 240) mot.lettres.forEach((_, i) => {
          if (t < posee(mot, i)) return;
          const l = etatLettre(t, mot, i, ANCRES)!, r = Math.hypot(g.lettres[i].w, g.lettres[i].h) / 2;
          pire = Math.max(pire, cx + e.gauche - (l.x - r), l.x + r - (cx + e.droite), cy + e.haut - (l.y - r), l.y + r - (cy + e.bas));
        });
        expect(pire, `${lang} ${cadrage} ${mot.question}`).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it('mot dont la place de repos sort de la partie visible : ramené dedans (iPad portrait : « Pays ? » remonte ; 900 × 900 : « Capitale ? » rentre à gauche) ; gardé s’il y tient ; centré s’il est plus grand qu’elle', () => {
    // bureau 16:10 : les trois places de la maquette tiennent
    for (const lang of LANGUES) for (const { mot } of poser(lang, 'paysage', ECRANS.bureau)) {
      const [x, y] = POSES.paysage[mot.question];
      expect(mot.centre).toEqual([x, y]);
    }
    // iPad portrait : la vidéo n'y montre que ses 1440 premiers px ; « Pays ? » (y = 1470) remonte contre la marge
    const ipad = poser('fr', 'portrait', ECRANS.ipad)[1], vi = partieVisible('portrait', ECRANS.ipad, MARGE_QUESTION);
    const ei = etendue(ipad.g, ipad.mot.inclinaison, ipad.mot.taille);
    expect(ipad.mot.centre[0]).toBe(POSES.portrait.pays[0]);
    expect(ipad.mot.centre[1]).toBeLessThan(POSES.portrait.pays[1] - 50);
    expect(ipad.mot.centre[1] + ei.bas).toBeCloseTo(vi.y1, 9);
    // écran carré : le paysage n'y montre que 1080 px de large, de 420 à 1500 ; « Capitale ? » (x = 1300) rentre à gauche
    const carre = { width: 900, height: 900 }, cap = poser('fr', 'paysage', carre)[0], vc = partieVisible('paysage', carre, MARGE_QUESTION);
    const ec = etendue(cap.g, cap.mot.inclinaison, cap.mot.taille);
    expect(cap.mot.centre[0]).toBeLessThan(POSES.paysage.capitale[0]);
    expect(cap.mot.centre[0] + ec.droite).toBeCloseTo(vc.x1, 9);
    expect(cap.mot.centre[1]).toBe(POSES.paysage.capitale[1]);
    // marge démesurée : la partie visible est plus étroite que le mot, il est centré dessus
    const etroit = poser('fr', 'paysage', ECRANS.bureau, 500)[0], ve = partieVisible('paysage', ECRANS.bureau, 500);
    const ee = etendue(etroit.g, etroit.mot.inclinaison, etroit.mot.taille);
    expect(ve.x1 - ve.x0).toBeLessThan(ee.droite - ee.gauche);
    expect(etroit.mot.centre[0] + (ee.gauche + ee.droite) / 2).toBeCloseTo((ve.x0 + ve.x1) / 2, 9);
  });

  it('les ancres livrées (public/intro/ancres.json), sur chaque écran du Review Focus : chaque mot entier dans l’écran, de sa pose à son retour', () => {
    for (const [nom, ecran] of Object.entries(ECRANS)) for (const lang of LANGUES) {
      const cadrage = cadrageDe(ecran), d = debordement(poser(lang, cadrage, ecran), ecran, cadrage);
      expect(d.pire, `${nom} (${lang}) : ${d.ou}`).toBeLessThanOrEqual(-MARGE_QUESTION + 0.01);
    }
  });

  it('rotation pendant l’intro (portrait gardé sur l’écran tourné 844 × 390) : chaque mot ramené dans le haut visible, entier', () => {
    for (const lang of LANGUES) {
      const poses = poser(lang, 'portrait', TOURNE), v = partieVisible('portrait', TOURNE, MARGE_QUESTION);
      for (const { mot } of poses) {
        expect(mot.centre[1], mot.question).toBeLessThan(POSES.portrait[mot.question][1]);
        expect(mot.centre[1]).toBeLessThan(v.y1);
      }
      const d = debordement(poses, TOURNE, 'portrait');
      expect(d.pire, `${lang} : ${d.ou}`).toBeLessThanOrEqual(-MARGE_QUESTION + 0.01);
    }
  });
});
