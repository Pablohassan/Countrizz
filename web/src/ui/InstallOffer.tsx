import { useState } from 'react';
import { PREF_KEYS, readPref, writePref, type KeyValueStorage } from '../game/prefs';
import type { Messages } from '../i18n';
import { promptInstall, shouldOffer, useInstall } from '../pwa/install';

const storage = ((): KeyValueStorage | null => { try { return localStorage; } catch { return null; } })();
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };

/**
 * « Installer l'appli », en bas de l'accueil juste au-dessus des crédits (20/10), sur téléphone (décision du 10/10) : l'invite native sur
 * Android, l'astuce « Partager → Sur l'écran d'accueil » sur iPhone et iPad. « Plus tard » la range pour de bon.
 */
export function InstallOffer({ m }: { m: Messages }) {
  const s = useInstall();
  const [dismissed, setDismissed] = useState(() => readPref(storage, PREF_KEYS.installLater) === '1');
  const [tip, setTip] = useState(false);
  if (!shouldOffer({ ...s, coarsePointer: coarse(), dismissed })) return null;
  const later = () => { setDismissed(true); writePref(storage, PREF_KEYS.installLater, '1'); };
  return (
    <div className="installer" role="region" aria-label={m.about.install}>
      <svg className="installer-icone" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="1.5" width="14" height="21" rx="3" fill="#16173a" /><rect x="7" y="4" width="10" height="14" rx="1" fill="#f7dc6f" /><path d="M12 6.5v7m-3-3 3 3 3-3" stroke="#16173a" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <p className="installer-texte">{tip && s.ios ? m.about.iosTip : m.about.installText}</p>
      <button type="button" className="installer-bouton" onClick={() => { if (s.canPrompt) void promptInstall(); else setTip((t) => !t); }}>
        <span>{m.about.install}</span>
      </button>
      <button type="button" className="installer-plus-tard" onClick={later}>{m.home.later}</button>
    </div>
  );
}
