import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '../game/types';
import { PREF_KEYS, readPref, writePref, type KeyValueStorage } from '../game/prefs';
import { detectLang, messages, type Messages } from '../i18n';
import type { GlobeHandle } from '../globe/GlobeView';
import { LoadErrorCard } from '../globe/LoadErrorCard';
import { Intro } from '../intro/Intro';
import { Home } from '../ui/Home';
import type { EntreeTitre } from '../ui/LogoTitle';
import type { QualityTier } from '../globe/renderer';
import { INTRO_URLS, heavyUrls, persist, purgeOutdated, warm } from '../pwa/cache';
import { useInstall } from '../pwa/install';

const storage = ((): KeyValueStorage | null => { try { return localStorage; } catch { return null; } })();
/** Rotation légère du globe à l'accueil (degrés de longitude par seconde), après le fondu. */
export const HOME_SPIN_DEG_PER_S = 1.5;

/**
 * Le globe (three, R3F : l'essentiel du code de la page) arrive à part, par import() (D15 du plan de l'intro vidéo) :
 * l'intro démarre sans l'attendre, le globe se monte caché sous elle dès que son code est là.
 */
const GlobeView = lazy(() => import('../globe/GlobeView').then((m) => ({ default: m.GlobeView })));

/**
 * Code du globe introuvable (réseau coupé, version du site remplacée pendant la visite…) : comme un globe en échec,
 * `onError` (le fondu part), puis la carte « Réessayer », qui recharge la page — Chromium ne refait pas un import()
 * raté (constaté au plan : le second appel échoue sans nouvelle requête).
 */
class CodeDuGlobe extends Component<{ children: ReactNode; texts: Messages['errors']; onError(): void }, { detail: string | null }> {
  state: { detail: string | null } = { detail: null };
  static getDerivedStateFromError(e: unknown) { return { detail: String(e) }; }
  componentDidCatch() { this.props.onError(); }
  render() {
    if (this.state.detail === null) return this.props.children;
    return <LoadErrorCard texts={this.props.texts} detail={this.state.detail} onRetry={() => location.reload()} />;
  }
}

/**
 * Page d'accueil de countrizz.fr (spec intro §0, spec intro vidéo §4) : le globe, posé dès le départ sur la vue d'accueil,
 * se charge sous la vidéo de l'intro (son code arrive à part, D15) ; l'accueil se monte à `INTRO.ACCUEIL` (son titre
 * attend le fondu), le fondu part à `INTRO.FONDU` quand le globe est prêt, puis le globe tourne doucement.
 */
export function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang(readPref(storage, PREF_KEYS.lang), navigator.languages ?? [navigator.language]));
  const [name, setName] = useState(() => readPref(storage, PREF_KEYS.name) ?? '');
  const [globeReady, setGlobeReady] = useState(false);
  const [phase, setPhase] = useState<'intro' | 'fondu' | 'accueil'>('intro');
  const [homeShown, setHomeShown] = useState(false);
  const [logoAngle, setLogoAngle] = useState<number | null>(null);
  // le titre vient de la vidéo (il apparaît en fondu) ; intro abandonnée (accueil direct) : ses lettres surgissent
  const [entree, setEntree] = useState<EntreeTitre>('fondu');
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
  // à l'accueil, le globe tourne doucement ; accueil direct : son code peut arriver après, on attend qu'il soit prêt
  useEffect(() => { if (phase === 'accueil' && globeReady) globe.current?.setIdleSpin(HOME_SPIN_DEG_PER_S); }, [phase, globeReady]);

  return (
    <>
      <CodeDuGlobe texts={m.errors} onError={() => setGlobeReady(true)}>
        <Suspense fallback={null}>
          <GlobeView ref={globe} startAtHome active={phase !== 'intro'} warmUp={homeShown}
            onReady={(info) => { setGlobeReady(true); setTier(info.tier); }}
            // globe en échec : le fondu part quand même, et l'écran d'erreur (« Réessayer ») apparaît sous l'accueil
            onError={() => setGlobeReady(true)} texts={m.errors} />
        </Suspense>
      </CodeDuGlobe>
      {phase !== 'accueil' && (
        <Intro lang={lang} m={m} globeReady={globeReady} onHome={() => setHomeShown(true)}
          onFade={(angle) => { setLogoAngle(angle); setPhase((p) => (p === 'intro' ? 'fondu' : p)); }}
          onDone={(angle) => { if (angle === null) setEntree('pop'); setPhase('accueil'); }} />
      )}
      {homeShown && (
        <Home lang={lang} m={m} name={name} logo={{ angle: logoAngle, visible: phase !== 'intro', entree }}
          onLang={(l) => { setLang(l); writePref(storage, PREF_KEYS.lang, l); }}
          onName={(n) => { setName(n); writePref(storage, PREF_KEYS.name, n); }} />
      )}
    </>
  );
}
