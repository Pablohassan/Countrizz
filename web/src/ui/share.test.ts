import { describe, expect, it } from 'vitest';
import { SHARE_URL, shareGame } from './share';

const abort = () => Promise.reject(new DOMException('annulé', 'AbortError'));
const fail = () => Promise.reject(new Error('refusé'));

describe('« Partager le jeu » (spec 2A §8)', () => {
  it('partage natif du téléphone avec le lien countrizz.fr', async () => {
    const seen: ShareData[] = [];
    expect(await shareGame({ share: async (d) => { seen.push(d); } }, 'Countrizz', 'Envoie Countrizz')).toBe('shared');
    expect(seen).toEqual([{ title: 'Countrizz', text: 'Envoie Countrizz', url: SHARE_URL }]);
    expect(SHARE_URL).toBe('https://countrizz.fr');
  });

  it('partage fermé par le joueur : rien d’autre', async () => {
    let copied = false;
    expect(await shareGame({ share: abort, copy: async () => { copied = true; } }, 't', 'x')).toBe('cancelled');
    expect(copied).toBe(false);
  });

  it('sans partage natif (ou s’il échoue) : copie du lien ; si la copie échoue : le lien affiché', async () => {
    const copies: string[] = [];
    expect(await shareGame({ copy: async (t) => { copies.push(t); } }, 't', 'x')).toBe('copied');
    expect(await shareGame({ share: fail, copy: async (t) => { copies.push(t); } }, 't', 'x')).toBe('copied');
    expect(copies).toEqual([SHARE_URL, SHARE_URL]);
    expect(await shareGame({ copy: fail }, 't', 'x')).toBe('link');
    expect(await shareGame({}, 't', 'x')).toBe('link');
  });
});
