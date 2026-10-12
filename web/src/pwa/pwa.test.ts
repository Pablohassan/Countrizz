import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { heavyUrls, outdatedCaches, warm } from './cache';
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
    expect(heavyUrls('haute')).toEqual(expect.arrayContaining(['/intro/affiche-portrait.webp', '/intro/affiche-paysage.webp', '/intro/ancres.json']));
    expect(heavyUrls('haute').filter((u) => u.startsWith('/video/') || u.endsWith('.jpg'))).toEqual([]);
  });
  it('un fichier en échec n’arrête pas les autres', async () => {
    const r = await warm(['/a', '/b', '/c'], async (u) => { if (u === '/b') throw new Error('réseau'); return { ok: u !== '/c' }; });
    expect(r).toEqual({ ok: 1, failed: ['/b', '/c'] });
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
  it('ce sont bien les motifs de vite.config.ts (aucun motif écrit en dur à côté)', () => {
    const conf = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(conf.match(/urlPattern: [^,]+/g)).toEqual(['urlPattern: MOTIF_LOURD', 'urlPattern: MOTIF_PAYS', 'urlPattern: MOTIF_DONNEES']);
  });
});
