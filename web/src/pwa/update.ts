/**
 * Nouvelle version du site (demande de l'utilisateur du 19/10) : le service worker (`skipWaiting`, `clientsClaim`) prend
 * la main pendant la visite, mais la page affichée reste l'ancienne jusqu'à la visite suivante. On recharge la page à un
 * moment sans gêne : appli en arrière-plan, ou joueur à l'accueil — jamais pendant une partie ni pendant l'intro. Après ce
 * rechargement, l'accueil s'ouvre sans l'intro (marque de session).
 */
export const UPDATE_FLAG = 'countrizz:maj';

/** Ce que l'updater demande au navigateur (testé avec des doublures). */
export interface UpdaterEnv {
  /** Un service worker contrôle déjà la page au chargement. */
  hasController(): boolean;
  hidden(): boolean;
  onControllerChange(fn: () => void): void;
  onVisibilityChange(fn: () => void): void;
  /** Demande au navigateur de relire le service worker (une nouvelle version le remplace). */
  checkForUpdate(): void;
  /** Pose la marque « accueil sans l'intro » pour la page rechargée. */
  mark(): void;
  reload(): void;
}

export function createUpdater(env: UpdaterEnv) {
  // première visite : le premier service worker prend la main (`clientsClaim`) ; ce n'est pas une nouvelle version
  let controlled = env.hasController();
  let pending = false, done = false, atHome = false;
  const tryReload = () => {
    if (!pending || done || !(env.hidden() || atHome)) return;
    done = true;
    env.mark();
    env.reload();
  };
  env.onControllerChange(() => {
    if (controlled) pending = true;
    controlled = true;
    tryReload();
  });
  env.onVisibilityChange(() => {
    if (!env.hidden()) env.checkForUpdate();
    tryReload();
  });
  return {
    /** Le joueur est à l'accueil (intro finie, aucune partie, aucun calque ouvert). */
    setAtHome(v: boolean) { atHome = v; tryReload(); },
  };
}

type FlagStorage = Pick<Storage, 'getItem' | 'removeItem'>;

/** La page vient d'être rechargée pour une nouvelle version : lu une seule fois (un rechargement ordinaire rejoue l'intro). */
export function consumeUpdateFlag(s: FlagStorage | null): boolean {
  try {
    if (s?.getItem(UPDATE_FLAG) !== '1') return false;
    s.removeItem(UPDATE_FLAG);
    return true;
  } catch { return false; }
}

/** L'updater du navigateur ; rien sans service worker (serveur de dev, navigateur sans). */
export function browserUpdater(): ReturnType<typeof createUpdater> | null {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!sw) return null;
  return createUpdater({
    hasController: () => !!sw.controller,
    hidden: () => document.visibilityState === 'hidden',
    onControllerChange: (fn) => sw.addEventListener('controllerchange', fn),
    onVisibilityChange: (fn) => document.addEventListener('visibilitychange', fn),
    checkForUpdate: () => { void sw.getRegistration().then((r) => r?.update()).catch(() => {}); },
    mark: () => { try { sessionStorage.setItem(UPDATE_FLAG, '1'); } catch { /* sans stockage : l'intro se jouera */ } },
    reload: () => location.reload(),
  });
}
