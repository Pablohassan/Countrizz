/** « Partager le jeu » (spec 2A §8, D14) : le partage du téléphone, sinon la copie du lien, sinon le lien affiché. */
export const SHARE_URL = 'https://countrizz.fr';

export type ShareOutcome = 'shared' | 'copied' | 'link' | 'cancelled';
export interface ShareEnv { share?(d: ShareData): Promise<void>; copy?(text: string): Promise<void> }

export async function shareGame(env: ShareEnv, title: string, text: string): Promise<ShareOutcome> {
  if (env.share) {
    try { await env.share({ title, text, url: SHARE_URL }); return 'shared'; } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  if (env.copy) { try { await env.copy(SHARE_URL); return 'copied'; } catch { /* le lien sera affiché */ } }
  return 'link';
}

export function browserShareEnv(): ShareEnv {
  return {
    share: typeof navigator.share === 'function' ? (d) => navigator.share(d) : undefined,
    copy: typeof navigator.clipboard?.writeText === 'function' ? (t) => navigator.clipboard.writeText(t) : undefined,
  };
}
