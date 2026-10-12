import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SUIVI_DEPART, angleTerre, choisirCadrage, choisirVariantes, couverture, idVariante, medianeIntervalle, mesurerIntervalle, suivreLecture, versEcran,
  type Capacites, type Manifeste, type Releve, type Suivi, type Variante,
} from './lecteur';
import { TITRES } from './cadrages';
import { CADRAGES, INTRO, type Cadrage } from './temps';
import { logoAngleAt } from './timeline';

// ---------- manifeste de test : les 10 vidéos de D2 ----------
const V = (cadrage: Cadrage, taille: Variante['taille'], ips: Variante['ips'], codec: Variante['codec']): Variante => {
  const { width, height } = taille === 'leger' ? { width: 720, height: 1560 } : CADRAGES[cadrage];
  return {
    cadrage, taille, ips, codec, width, height, octets: 6_000_000,
    src: `/video/intro-${cadrage}${taille === 'leger' ? '-leger' : ''}-${ips}.${codec}.mp4`,
    type: `video/mp4; codecs="${codec === 'av1' ? 'av01.0.12M.10' : 'hvc1.1.6.L150.90'}"`,
  };
};
const MANIFESTE: Manifeste = {
  version: 1, duree: 19.8, affiches: { portrait: '/intro/affiche-portrait.webp', paysage: '/intro/affiche-paysage.webp' },
  variantes: [
    V('portrait', 'plein', 60, 'av1'), V('portrait', 'plein', 120, 'av1'), V('portrait', 'plein', 60, 'hevc'), V('portrait', 'plein', 120, 'hevc'),
    V('portrait', 'leger', 60, 'av1'), V('portrait', 'leger', 60, 'hevc'),
    V('paysage', 'plein', 60, 'av1'), V('paysage', 'plein', 120, 'av1'), V('paysage', 'plein', 60, 'hevc'), V('paysage', 'plein', 120, 'hevc'),
  ],
};
type Apt = [supported: boolean, smooth: boolean, powerEfficient: boolean];
const OUI: Apt = [true, true, true], FLUIDE: Apt = [true, true, false], LISIBLE: Apt = [true, false, false];
/** MediaCapabilities simulé : réponse par variante (identifiant), « non » par défaut ; garde les configurations reçues. */
function capacites(table: Record<string, Apt>, canPlay: (type: string) => string = () => ''): Capacites & { recues: MediaDecodingConfiguration[] } {
  const recues: MediaDecodingConfiguration[] = [];
  return {
    recues,
    canPlayType: canPlay,
    async decodingInfo(c) {
      recues.push(c);
      const v = MANIFESTE.variantes.find((x) => x.type === c.video!.contentType && x.width === c.video!.width && x.height === c.video!.height && x.ips === c.video!.framerate)!;
      const [supported, smooth, powerEfficient] = table[idVariante(v)] ?? [false, false, false];
      return { supported, smooth, powerEfficient };
    },
  };
}
const ids = (vs: Variante[]) => vs.map(idVariante);
const tous = (a: Apt) => Object.fromEntries(MANIFESTE.variantes.map((v) => [idVariante(v), a]));

describe('cadrage et cadence', () => {
  it('fenêtre plus haute que large : portrait ; sinon paysage', () => {
    expect(choisirCadrage(390, 844)).toBe('portrait');
    expect(choisirCadrage(768, 1024)).toBe('portrait');
    expect(choisirCadrage(390, 664)).toBe('portrait');
    expect(choisirCadrage(2560, 1080)).toBe('paysage');
    expect(choisirCadrage(1280, 800)).toBe('paysage');
    expect(choisirCadrage(900, 900)).toBe('paysage');
  });

  it('médiane des intervalles (une image lente ne compte pas) ; sans échantillon : 60 Hz', () => {
    expect(medianeIntervalle([8.3, 8.4, 50, 8.3, 8.2])).toBe(8.3);
    expect(medianeIntervalle([16.6, 16.8, 16.7, 33.4])).toBeCloseTo(16.75, 6);
    expect(medianeIntervalle([])).toBe(16.7);
  });
});

describe('mesure de l’intervalle entre images (rAF et horloge injectés)', () => {
  afterEach(() => { vi.useRealTimers(); });
  /** Un écran simulé : chaque `tourner` fait passer une image après `dt` ms. */
  function ecran() {
    let ms = 1000, file: FrameRequestCallback[] = [], appels = 0;
    const raf = (cb: FrameRequestCallback) => { appels++; file.push(cb); return appels; };
    const tourner = (dt: number) => { ms += dt; const cbs = file; file = []; for (const cb of cbs) cb(ms); };
    return { raf, horloge: () => ms, tourner, appels: () => appels };
  }

  it('écran à 120 Hz : ≈ 8,3 ms, en ≈ 0,15 s', async () => {
    const e = ecran();
    let fin: number | null = null;
    void mesurerIntervalle(e.raf, 150, e.horloge).then((ms) => { fin = ms; });
    for (let i = 0; i < 40 && fin === null; i++) { e.tourner(8.33); await Promise.resolve(); }
    expect(fin).toBeCloseTo(8.33, 6);
    expect(e.appels()).toBe(19);
  });

  it('écran à 60 Hz, une image lente (chargement) : ≈ 16,7 ms', async () => {
    const e = ecran();
    const p = mesurerIntervalle(e.raf, 150, e.horloge);
    e.tourner(16.67);
    e.tourner(50);
    for (let i = 0; i < 12; i++) e.tourner(16.67);
    expect(await p).toBeCloseTo(16.67, 6);
  });

  it('onglet caché (rAF suspendu) : 16,7 au délai maximal, pas avant', async () => {
    vi.useFakeTimers();
    const e = ecran();
    let fin: number | null = null;
    const p = mesurerIntervalle(e.raf, 150, e.horloge, 500);
    void p.then((ms) => { fin = ms; });
    await vi.advanceTimersByTimeAsync(499);
    expect(fin).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe(16.7);
  });
});

describe('choix des variantes (ordre d’essai ; [] → accueil direct)', () => {
  it('AV1 économe d’abord, puis HEVC ; 60 i/s sur un écran à 60 Hz', async () => {
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, capacites(tous(OUI))))).toEqual(['portrait-plein-60-av1', 'portrait-plein-60-hevc']);
  });

  it('120 i/s seulement si l’écran dépasse 100 Hz (≤ 10 ms) ET si le décodage à 120 est économe', async () => {
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 8.3, capacites(tous(OUI))))).toEqual(['portrait-plein-120-av1', 'portrait-plein-120-hevc']);
    expect(ids(await choisirVariantes(MANIFESTE, 'paysage', 10, capacites(tous(OUI))))).toEqual(['paysage-plein-120-av1', 'paysage-plein-120-hevc']);
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 10.5, capacites(tous(OUI))))).toEqual(['portrait-plein-60-av1', 'portrait-plein-60-hevc']);
    // Chromium de Playwright : AV1 fluide mais pas économe, HEVC illisible
    const pw = capacites({ 'portrait-plein-60-av1': FLUIDE, 'portrait-plein-120-av1': FLUIDE });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 8.3, pw))).toEqual(['portrait-plein-60-av1']);
  });

  it('un HEVC économe passe devant un AV1 seulement fluide ; Safari sans AV1 matériel : HEVC seul', async () => {
    const mac = capacites({ 'portrait-plein-60-av1': FLUIDE, 'portrait-plein-60-hevc': OUI });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, mac))).toEqual(['portrait-plein-60-hevc', 'portrait-plein-60-av1']);
    const safari = capacites({ 'portrait-plein-60-hevc': OUI, 'portrait-plein-120-hevc': OUI, 'portrait-leger-60-hevc': OUI });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, safari))).toEqual(['portrait-plein-60-hevc']);
  });

  it('variante légère quand la pleine n’est ni fluide ni économe (ou illisible) ; jamais à 120 i/s', async () => {
    const android = capacites({ 'portrait-plein-60-av1': LISIBLE, 'portrait-plein-120-av1': OUI, 'portrait-leger-60-av1': FLUIDE });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 8.3, android))).toEqual(['portrait-leger-60-av1']);
    const niveau5 = capacites({ 'portrait-leger-60-av1': OUI, 'portrait-leger-60-hevc': LISIBLE });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, niveau5))).toEqual(['portrait-leger-60-av1', 'portrait-leger-60-hevc']);
    // la légère illisible : la pleine, seulement lisible, reste à essayer
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, capacites({ 'portrait-plein-60-av1': LISIBLE })))).toEqual(['portrait-plein-60-av1']);
  });

  it('paysage : pas de variante légère, la pleine même peu fluide', async () => {
    expect(ids(await choisirVariantes(MANIFESTE, 'paysage', 16.7, capacites({ 'paysage-plein-60-av1': LISIBLE })))).toEqual(['paysage-plein-60-av1']);
  });

  it('rien de lisible : aucune variante (accueil direct)', async () => {
    expect(await choisirVariantes(MANIFESTE, 'portrait', 8.3, capacites({}))).toEqual([]);
  });

  it('sans MediaCapabilities, ou s’il lève : canPlayType (lisible, sans rien sur la fluidité : la légère en portrait)', async () => {
    const lit = (t: string) => (t.includes('av01') ? 'probably' : '');
    const sans: Capacites = { canPlayType: lit };
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 8.3, sans))).toEqual(['portrait-leger-60-av1']);
    expect(ids(await choisirVariantes(MANIFESTE, 'paysage', 8.3, sans))).toEqual(['paysage-plein-60-av1']);
    const leve: Capacites = { canPlayType: lit, decodingInfo: () => Promise.reject(new TypeError('type inconnu')) };
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, leve))).toEqual(['portrait-leger-60-av1']);
  });

  it('decodingInfo reçoit la variante : type du fichier, taille, cadence, débit moyen', async () => {
    const c = capacites(tous(OUI));
    await choisirVariantes(MANIFESTE, 'portrait', 16.7, c);
    expect(c.recues[0]).toEqual({ type: 'file', video: { contentType: 'video/mp4; codecs="av01.0.12M.10"', width: 1080, height: 2340, framerate: 60, bitrate: 2_424_242 } });
  });
});

// ---------- écrans de proportions éloignées des références (Review Focus 1 et 4) ----------
const ECRANS = { telephone: { width: 390, height: 844 }, ipad: { width: 768, height: 1024 }, bureau219: { width: 2560, height: 1080 }, court: { width: 390, height: 664 }, bureau: { width: 1280, height: 800 } };

describe('de la vidéo à l’écran (object-fit: cover)', () => {
  it('la vidéo couvre l’écran sans bande vide ; portrait calé en haut, paysage centré ; centrée en largeur', () => {
    for (const ecran of Object.values(ECRANS)) {
      const cadrage = choisirCadrage(ecran.width, ecran.height), video = CADRAGES[cadrage];
      const [x0, y0] = versEcran([0, 0], video, ecran, cadrage), [x1, y1] = versEcran([video.width, video.height], video, ecran, cadrage);
      expect(x0).toBeLessThanOrEqual(0);
      expect(y0).toBeLessThanOrEqual(0);
      expect(x1).toBeGreaterThanOrEqual(ecran.width - 1e-9);
      expect(y1).toBeGreaterThanOrEqual(ecran.height - 1e-9);
      expect(x0 + x1).toBeCloseTo(ecran.width, 9);
      if (cadrage === 'portrait') expect(y0).toBe(0);
      else expect(y0 + y1).toBeCloseTo(ecran.height, 9);
    }
  });

  it('valeurs : le « o » du titre mesuré (cadrages.ts, portrait 390 × 844) ; 21:9 et 16:10 rognés', () => {
    const { x, y } = TITRES.portrait.titre.o;   // px vidéo, mesurés sur l’écran de référence 390 × 844 (× 1080 / 390)
    const o = versEcran([x, y], CADRAGES.portrait, ECRANS.telephone, 'portrait');
    expect(o[0]).toBeCloseTo(83.72, 2);
    expect(o[1]).toBeCloseTo(144.44, 2);
    expect(versEcran([960, 540], CADRAGES.paysage, ECRANS.bureau219, 'paysage')).toEqual([1280, 540]);
    expect(versEcran([0, 0], CADRAGES.paysage, ECRANS.bureau219, 'paysage')).toEqual([0, -180]);
    const b = versEcran([0, 0], CADRAGES.paysage, ECRANS.bureau, 'paysage');
    expect(b[0]).toBeCloseTo(-71.11, 2);
    expect(b[1]).toBeCloseTo(0, 9);
    expect(versEcran([1080, 2340], CADRAGES.portrait, ECRANS.ipad, 'portrait').map((v) => Math.round(v * 100) / 100)).toEqual([768, 1664]);
  });

  it('couverture : un seul transform du repère de la vidéo à l’écran (translate puis scale), celui de versEcran', () => {
    for (const ecran of [...Object.values(ECRANS), { width: 844, height: 390 }]) for (const cadrage of ['portrait', 'paysage'] as const) {
      const video = CADRAGES[cadrage], c = couverture(video, ecran, cadrage);
      expect(c.echelle).toBe(Math.max(ecran.width / video.width, ecran.height / video.height));
      for (const p of [[0, 0], [video.width, video.height], [123.4, 567.8]] as [number, number][])
        expect(versEcran(p, video, ecran, cadrage)).toEqual([c.x + p[0] * c.echelle, c.y + p[1] * c.echelle]);
    }
    expect(couverture(CADRAGES.paysage, ECRANS.bureau219, 'paysage')).toEqual({ echelle: 2560 / 1920, x: 0, y: -180 });
    expect(couverture(CADRAGES.portrait, ECRANS.ipad, 'portrait')).toEqual({ echelle: 768 / 1080, x: 0, y: 0 });
  });

  it('rotation pendant l’intro : la même vidéo (même cadrage) couvre encore l’écran tourné', () => {
    const tourne = { width: 844, height: 390 };
    const [x0, y0] = versEcran([0, 0], CADRAGES.portrait, tourne, 'portrait');
    const [x1, y1] = versEcran([1080, 2340], CADRAGES.portrait, tourne, 'portrait');
    expect([x0, y0]).toEqual([0, 0]);
    expect(x1).toBeCloseTo(844, 9);
    expect(y1).toBeGreaterThan(390);
  });
});

describe('relais de la petite Terre du titre', () => {
  const ecart = (a: number, b: number) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  it('de FONDU à FIN, l’angle de la Terre en pâte est celui de la chronologie (même vitesse que la petite Terre)', () => {
    for (let t = INTRO.FONDU; t <= INTRO.FIN + 1e-9; t += 0.1) expect(ecart(angleTerre(t), logoAngleAt(t)), `t = ${t.toFixed(1)}`).toBeLessThan(1e-9);
  });
  it('au-delà de FIN (vidéo sur sa dernière image) : l’angle de la dernière image', () => {
    expect(angleTerre(INTRO.FIN + 3)).toBeCloseTo(angleTerre(INTRO.FIN), 12);
  });
});

describe('abandons (8 s sans image, 8 s sans progrès ; onglet caché : rien ne compte)', () => {
  /** Relevés à 60 Hz pendant `ms` ; `temps` : currentTime à chaque relevé. */
  function jouer(s: Suivi, de: number, ms: number, r: Omit<Releve, 'ms'>, avance = 0): { s: Suivi; echec: ReturnType<typeof suivreLecture>['echec']; quand: number } {
    let echec: ReturnType<typeof suivreLecture>['echec'] = null, t = r.temps, quand = -1;
    for (let k = 16; k <= ms; k += 16) {
      t += avance;
      ({ suivi: s, echec } = suivreLecture(s, { ...r, temps: t, ms: de + k }));
      if (echec) { quand = de + k; break; }
    }
    return { s, echec, quand };
  }
  const attend = { visible: true, temps: 0, image: false, attendue: true };

  it('aucune image : « pas-d-image » à 8 s, pas avant', () => {
    const r = jouer(SUIVI_DEPART, 0, 9000, attend);
    expect(r.echec).toBe('pas-d-image');
    expect(r.quand).toBe(8016);
  });

  it('onglet caché pendant l’attente : l’absence ne compte pas ; au retour, le compte reprend où il était', () => {
    let { s } = jouer(SUIVI_DEPART, 0, 3000, attend);
    ({ suivi: s } = suivreLecture(s, { ...attend, ms: 3010, visible: false }));
    // 60 s plus tard, l'onglet revient (aucun relevé entre-temps : rAF suspendu)
    let r = jouer(s, 63_000, 4000, attend);
    expect(r.echec).toBeNull();
    r = jouer(r.s, 67_000, 2000, attend);
    expect(r.echec).toBe('pas-d-image');
    expect(r.quand).toBe(68_040);
  });

  it('au retour de l’onglet, la vidéo reprend : plus d’abandon', () => {
    let { s } = jouer(SUIVI_DEPART, 0, 2000, { ...attend, image: true, temps: 5 }, 1 / 60);
    ({ suivi: s } = suivreLecture(s, { ...attend, image: true, temps: 5.6, ms: 2010, visible: false }));
    const r = jouer(s, 90_000, 20_000, { ...attend, image: true, temps: 5.6 }, 1 / 60);
    expect(r.echec).toBeNull();
  });

  it('un relevé manqué (page gelée 30 s sans événement) ne compte que pour un pas', () => {
    let { s } = jouer(SUIVI_DEPART, 0, 1000, attend);
    let echec: ReturnType<typeof suivreLecture>['echec'];
    ({ suivi: s, echec } = suivreLecture(s, { ...attend, ms: 31_000 }));
    expect(echec).toBeNull();
    expect(s.attenteMs).toBeCloseTo(1226, 9);
  });

  it('réseau qui cale en cours de lecture : « bloquee » au bout de 8 s sans progrès ; un progrès remet le compte à zéro', () => {
    let { s } = jouer(SUIVI_DEPART, 0, 3000, { ...attend, image: true, temps: 0 }, 1 / 60);
    let r = jouer(s, 3000, 7000, { ...attend, image: true, temps: 3 });   // calé : currentTime ne bouge plus
    expect(r.echec).toBeNull();
    r = jouer(r.s, 10_000, 500, { ...attend, image: true, temps: 3 }, 1 / 60);   // il repart un instant
    r = jouer(r.s, 10_500, 9000, { ...attend, image: true, temps: 3.6 });
    expect(r.echec).toBe('bloquee');
    expect(r.quand).toBe(18_516);
  });

  it('lecture qui n’a pas à avancer (figée par ?introT, dernière image en attendant le globe) : jamais d’abandon', () => {
    expect(jouer(SUIVI_DEPART, 0, 20_000, { ...attend, image: true, temps: 19.8, attendue: false }).echec).toBeNull();
  });
});
