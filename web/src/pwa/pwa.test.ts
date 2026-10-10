import { describe, expect, it } from 'vitest';
import { heavyUrls, outdatedCaches, warm } from './cache';
import { isIos, shouldOffer } from './install';

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
  it('télécharge d’avance les textures du niveau du téléphone, et l’intro', () => {
    expect(heavyUrls('standard')).toContain('/textures/day-4k.ktx2');
    expect(heavyUrls('standard')).not.toContain('/textures/day-8k.ktx2');
    expect(heavyUrls('haute')).toContain('/textures/day-8k.ktx2');
    expect(heavyUrls('haute')).toContain('/intro/monde.jpg');
  });
  it('un fichier en échec n’arrête pas les autres', async () => {
    const r = await warm(['/a', '/b', '/c'], async (u) => { if (u === '/b') throw new Error('réseau'); return { ok: u !== '/c' }; });
    expect(r).toEqual({ ok: 1, failed: ['/b', '/c'] });
  });
});
