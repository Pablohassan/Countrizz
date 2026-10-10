import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../game/types';
import { PREF_KEYS, readPref, writePref, type KeyValueStorage } from '../game/prefs';
import { detectLang, messages } from '../i18n';
import { GlobeView, type GlobeHandle } from '../globe/GlobeView';
import { Intro } from '../intro/Intro';
import { Home } from '../ui/Home';

const storage = ((): KeyValueStorage | null => { try { return localStorage; } catch { return null; } })();
/** Rotation légère du globe à l'accueil (degrés de longitude par seconde), après le fondu. */
export const HOME_SPIN_DEG_PER_S = 1.5;

/**
 * Page d'accueil de countrizz.fr (spec intro §0) : le globe, posé dès le départ sur la vue d'accueil, se charge sous
 * l'intro en pâte ; l'accueil se monte à 16,8 s, le fondu part à 19,6 s (globe prêt), puis le globe tourne doucement.
 */
export function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang(readPref(storage, PREF_KEYS.lang), navigator.languages ?? [navigator.language]));
  const [name, setName] = useState(() => readPref(storage, PREF_KEYS.name) ?? '');
  const [globeReady, setGlobeReady] = useState(false);
  const [phase, setPhase] = useState<'intro' | 'fondu' | 'accueil'>('intro');
  const [homeShown, setHomeShown] = useState(false);
  const globe = useRef<GlobeHandle>(null);
  const m = messages[lang];

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { if (phase === 'accueil') globe.current?.setIdleSpin(HOME_SPIN_DEG_PER_S); }, [phase]);

  return (
    <>
      <GlobeView ref={globe} startAtHome active={phase !== 'intro'} onReady={() => setGlobeReady(true)} />
      {phase !== 'accueil' && (
        <Intro m={m} globeReady={globeReady} onHome={() => setHomeShown(true)} onFade={() => setPhase((p) => (p === 'intro' ? 'fondu' : p))} onDone={() => setPhase('accueil')} />
      )}
      {homeShown && (
        <Home lang={lang} m={m} name={name}
          onLang={(l) => { setLang(l); writePref(storage, PREF_KEYS.lang, l); }}
          onName={(n) => { setName(n); writePref(storage, PREF_KEYS.name, n); }} />
      )}
    </>
  );
}
