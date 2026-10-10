import { useState } from 'react';
import { PREF_KEYS, readPref, writePref, type KeyValueStorage } from '../game/prefs';
import type { Messages } from '../i18n';
import { promptInstall, shouldOffer, useInstall } from '../pwa/install';

const storage = ((): KeyValueStorage | null => { try { return localStorage; } catch { return null; } })();
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };

/**
 * « Installer l'appli », sous les commandes de l'accueil, sur téléphone (décision du 10/10) : l'invite native sur
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
      <button type="button" className="installer-bouton" onClick={() => { if (s.canPrompt) void promptInstall(); else setTip((t) => !t); }}>
        <span>{m.about.install}</span>
      </button>
      <p className="installer-texte">{tip && s.ios ? m.about.iosTip : m.about.installText}</p>
      <button type="button" className="installer-plus-tard" onClick={later}>{m.home.later}</button>
    </div>
  );
}
