import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../game/types';
import { PREF_KEYS, readPref, writePref, type KeyValueStorage } from '../game/prefs';
import { detectLang, messages } from '../i18n';
import { GlobeView, type GlobeHandle } from '../globe/GlobeView';
import { Intro } from '../intro/Intro';
import { Home } from '../ui/Home';
import type { QualityTier } from '../globe/renderer';
import { INTRO_URLS, heavyUrls, persist, purgeOutdated, warm } from '../pwa/cache';
import { useInstall } from '../pwa/install';

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
  const [logoAngle, setLogoAngle] = useState<number | null>(null);
  const globe = useRef<GlobeHandle>(null);
  const [tier, setTier] = useState<QualityTier | null>(null);
  const install = useInstall();
  const m = messages[lang];

  // caches d'une version précédente du site : supprimés (leurs noms portent l'empreinte de leur contenu)
  useEffect(() => { void purgeOutdated(__COUNTRIZZ_CACHES__); }, []);
  // Dès que le service worker contrôle la page : les fichiers de l'intro passent une fois par lui (à la première visite,
  // elle les a chargés avant lui ; ils viennent du cache HTTP, sans nouveau téléchargement). Le globe, lui, charge après.
  // Appli installée (ou qui vient de l'être) : tout ce qu'il faut pour jouer, au niveau du téléphone, et stockage
  // demandé persistant. Une fois par jeu de caches.
  const [installedNow, setInstalledNow] = useState(false);
  const [controlled, setControlled] = useState(() => typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller);
  useEffect(() => {
    const on = () => setInstalledNow(true);
    const ctl = () => setControlled(true);
    addEventListener('countrizz:installee', on);
    navigator.serviceWorker?.addEventListener('controllerchange', ctl);
    return () => { removeEventListener('countrizz:installee', on); navigator.serviceWorker?.removeEventListener('controllerchange', ctl); };
  }, []);
  const installed = install.standalone || installedNow;
  useEffect(() => {
    if (!tier || !controlled) return;
    const key = __COUNTRIZZ_CACHES__.join(',') + (installed ? '+persistant' : '');
    if (readPref(storage, PREF_KEYS.preloaded) === key) return;
    void (async () => {
      if (installed) await persist();
      const r = await warm(installed ? heavyUrls(tier) : INTRO_URLS);
      if (r.failed.length === 0) writePref(storage, PREF_KEYS.preloaded, key);
    })();
  }, [tier, controlled, installed]);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { if (phase === 'accueil') globe.current?.setIdleSpin(HOME_SPIN_DEG_PER_S); }, [phase]);

  return (
    <>
      <GlobeView ref={globe} startAtHome active={phase !== 'intro'} warmUp={homeShown}
        onReady={(info) => { setGlobeReady(true); setTier(info.tier); }}
        // globe en échec : le fondu part quand même, et l'écran d'erreur (« Réessayer ») apparaît sous l'accueil
        onError={() => setGlobeReady(true)} texts={m.errors} />
      {phase !== 'accueil' && (
        <Intro m={m} globeReady={globeReady} onHome={() => setHomeShown(true)} onFade={() => setPhase((p) => (p === 'intro' ? 'fondu' : p))} onDone={(angle) => { setLogoAngle(angle); setPhase('accueil'); }} />
      )}
      {homeShown && (
        <Home lang={lang} m={m} name={name} logo={{ angle: logoAngle, visible: phase === 'accueil' }}
          onLang={(l) => { setLang(l); writePref(storage, PREF_KEYS.lang, l); }}
          onName={(n) => { setName(n); writePref(storage, PREF_KEYS.name, n); }} />
      )}
    </>
  );
}
