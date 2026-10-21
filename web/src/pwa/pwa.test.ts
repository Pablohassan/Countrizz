import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMPREINTES_KEY, heavyUrls, OFFLINE_URLS, outdatedCaches, preloadKey, staleEntries, warm } from './cache';
import { isIos, shouldOffer } from './install';
import { MOTIF_DONNEES, MOTIF_LOURD, MOTIF_PAYS } from './motifs';

const base = { canPrompt: false, ios: false, standalone: false, coarsePointer: true, dismissed: false };

describe('proposer l’installation', () => {
  it('sur un téléphone Android dont le navigateur a donné l’invite', () => {
    expect(shouldOffer({ ...base, canPrompt: true })).toBe(true);
  });
  it('sur iPhone, même sans invite (astuce « Partager »)', () => {
    expect(shouldOffer({ ...base, ios: true })).toBe(true);
  });
  it('jamais sur un ordinateur, une fois installée, ni après « Plus tard »', () => {
    expect(shouldOffer({ ...base, canPrompt: true, coarsePointer: false })).toBe(false);
    expect(shouldOffer({ ...base, canPrompt: true, standalone: true })).toBe(false);
    expect(shouldOffer({ ...base, ios: true, dismissed: true })).toBe(false);
  });
  it('ni sur un téléphone qui ne sait pas installer', () => {
    expect(shouldOffer(base)).toBe(false);
  });
  it('reconnaît iPhone, iPad, et l’iPad qui se dit Macintosh', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5)).toBe(false);
  });
});

describe('caches de l’appareil', () => {
  it('garde les caches courants, supprime les anciens countrizz-*, ignore les autres', () => {
    expect(outdatedCaches(['countrizz-lourd-a1', 'countrizz-lourd-b2', 'workbox-precache-v2', 'countrizz-pays-c3'], ['countrizz-lourd-b2', 'countrizz-pays-c3']))
      .toEqual(['countrizz-lourd-a1']);
  });
  it('télécharge d’avance les textures du niveau du téléphone, et l’intro (affiches, ancres ; jamais les vidéos)', () => {
    expect(heavyUrls('standard')).toContain('/textures/day-4k.ktx2');
    expect(heavyUrls('standard')).not.toContain('/textures/day-8k.ktx2');
    expect(heavyUrls('haute')).toContain('/textures/day-8k.ktx2');
    expect(heavyUrls('standard')).toEqual(expect.arrayContaining(['/textures/waves-512.ktx2', '/textures/relief-512.png']));
    expect(heavyUrls('haute')).toEqual(expect.arrayContaining(['/intro/affiche-portrait.webp', '/intro/affiche-paysage.webp', '/intro/ancres.json']));
    expect(heavyUrls('haute').filter((u) => u.startsWith('/video/') || u.endsWith('.jpg'))).toEqual([]);
  });
  it('appli installée : tous les drapeaux d’avance (mode Drapeau hors ligne, plan 2A-6), pas les contours ni les photos', () => {
    const e = { '/data/flags/fra.svg': 'a', '/data/flags/esp.svg': 'b', '/data/patches/sdf/fra.png': 'c', '/data/patches/img/fra-0-1024.ktx2': 'd', '/textures/day-4k.ktx2': 'e' };
    const urls = heavyUrls('standard', e);
    expect(urls).toEqual(expect.arrayContaining(['/data/flags/fra.svg', '/data/flags/esp.svg']));
    expect(urls.filter((u) => u.startsWith('/data/patches/'))).toEqual([]);
    expect(new Set(urls).size).toBe(urls.length);
  });
  it('tout visiteur : les index de données repassent par le service worker (partie hors ligne, plan 2A-6)', () => {
    // countries.json est demandé avant que le service worker ne contrôle la première visite : sans ce passage, « Jouer » reste
    // inactif hors ligne (e2e du 21/10)
    expect(OFFLINE_URLS).toEqual(expect.arrayContaining(['/data/countries.json', '/data/imagery.json', '/intro/ancres.json']));
    expect((OFFLINE_URLS as readonly string[]).filter((u) => u.startsWith('/video/') || u === '/data/borders.json')).toEqual([]);
  });
  it('un fichier en échec n’arrête pas les autres', async () => {
    const r = await warm(['/a', '/b', '/c'], async (u) => { if (u === '/b') throw new Error('réseau'); return { ok: u !== '/c' }; });
    expect(r).toEqual({ ok: 1, failed: ['/b', '/c'] });
  });
});

describe('cache fichier par fichier (spec océan §3)', () => {
  const cur = { '/textures/day-4k.ktx2': 'b', '/textures/night-4k.ktx2': 'n', '/intro/ancres.json': 'a' };
  it('une texture changée sort du cache, les autres restent', () => {
    expect(staleEntries(['/textures/day-4k.ktx2', '/textures/night-4k.ktx2', '/intro/ancres.json', EMPREINTES_KEY], { ...cur, '/textures/day-4k.ktx2': 'a' }, cur))
      .toEqual(['/textures/day-4k.ktx2']);
  });
  it('un fichier qui n’existe plus sort ; la table elle-même reste', () => {
    expect(staleEntries(['/textures/vieux.ktx2', EMPREINTES_KEY], { '/textures/vieux.ktx2': 'v' }, cur)).toEqual(['/textures/vieux.ktx2']);
  });
  it('sans table d’avant (migration, stockage vidé) : rien ne prouve qu’une copie est à jour, tout sort', () => {
    expect(staleEntries(['/textures/day-4k.ktx2', '/intro/ancres.json'], null, cur)).toEqual(['/textures/day-4k.ktx2', '/intro/ancres.json']);
  });
  it('les index de données, hors de la table, ne sortent jamais (leur cache est renommé quand ils changent)', () => {
    // avant le 21/10, ils sortaient à chaque démarrage : hors ligne, le globe ne trouvait plus borders.json (« Oups ! »)
    const cached = ['/data/borders.json', '/data/countries.json', '/data/imagery.json', '/textures/vieux.ktx2', '/data/flags/fra.svg', EMPREINTES_KEY];
    expect(staleEntries(cached, { '/textures/vieux.ktx2': 'v' }, cur)).toEqual(['/textures/vieux.ktx2', '/data/flags/fra.svg']);
    expect(staleEntries(['/data/borders.json'], null, cur)).toEqual([]);
  });
  it('la clé du préchargement change avec l’empreinte d’un seul fichier', () => {
    const urls = ['/textures/day-4k.ktx2', '/textures/night-4k.ktx2'];
    expect(preloadKey(urls, cur)).not.toBe(preloadKey(urls, { ...cur, '/textures/night-4k.ktx2': 'm' }));
    expect(preloadKey(urls, cur)).toBe(preloadKey(urls, { ...cur, '/intro/ancres.json': 'z' }));
  });
  it('les caches lourds et des pays gardent un nom stable (vite.config.ts)', () => {
    const conf = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(conf).toContain("lourd: 'countrizz-lourd',");
    expect(conf).toContain("pays: 'countrizz-pays',");
  });
});

describe('service worker : ce qu’il garde (vite.config.ts, runtimeCaching)', () => {
  const motifs = [MOTIF_LOURD, MOTIF_PAYS, MOTIF_DONNEES];
  it('les vidéos de l’intro et leur manifeste passent au réseau : plages d’octets, que CacheFirst « 200 seulement » casserait (D1)', () => {
    for (const u of ['/video/intro-portrait-60.av1.mp4', '/video/intro-portrait-leger-60.hevc.mp4', '/video/videos.json', 'https://countrizz.fr/video/intro-paysage-120.av1.mp4'])
      for (const m of motifs) expect(m.test(u), `${u} ~ ${m}`).toBe(false);
  });
  it('les affiches, les ancres et la petite Terre de l’intro restent gardées', () => {
    for (const u of ['/intro/affiche-portrait.webp', '/intro/ancres.json', 'https://countrizz.fr/intro/logo-terre.webp']) expect(MOTIF_LOURD.test(u), u).toBe(true);
  });
  it('les niveaux de photos d’un pays vu restent gardés ; le cache des pays tient un tour complet (700 entrées)', () => {
    for (const u of ['/data/patches/img/vat-4-2048.ktx2', '/data/patches/img/fra-0-1024.ktx2', 'https://countrizz.fr/data/patches/img/mco-3-2048.ktx2']) expect(MOTIF_PAYS.test(u), u).toBe(true);
    const conf = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    const pays = conf.slice(conf.indexOf('urlPattern: MOTIF_PAYS'), conf.indexOf('urlPattern: MOTIF_DONNEES'));
    expect(pays).toContain('maxEntries: 700');
  });
  it('ce sont bien les motifs de vite.config.ts (aucun motif écrit en dur à côté)', () => {
    const conf = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(conf.match(/urlPattern: [^,]+/g)).toEqual(['urlPattern: MOTIF_LOURD', 'urlPattern: MOTIF_PAYS', 'urlPattern: MOTIF_DONNEES']);
  });
});
