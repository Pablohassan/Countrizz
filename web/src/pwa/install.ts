import { useSyncExternalStore } from 'react';

/**
 * Installation de l'appli (spec 2A §8, décisions du 10/10) : sur téléphone, on propose d'installer. Android et Chrome :
 * l'invite native (`beforeinstallprompt`, gardée pour le clic) ; iPhone et iPad : l'astuce « Partager → Sur l'écran
 * d'accueil » (Safari n'a pas d'invite). Rien si l'appli est déjà ouverte installée.
 */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export interface InstallState { canPrompt: boolean; ios: boolean; standalone: boolean }

/** iPhone, iPod, iPad (y compris l'iPad qui se dit « Macintosh » mais a un écran tactile). */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** Faut-il montrer « Installer l'appli » ? Téléphones seulement, jamais une fois installée, ni après « Plus tard ». */
export function shouldOffer(s: InstallState & { coarsePointer: boolean; dismissed: boolean }): boolean {
  return s.coarsePointer && !s.standalone && !s.dismissed && (s.canPrompt || s.ios);
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };
let snapshot: InstallState = { canPrompt: false, ios: false, standalone: false };

const standaloneNow = () => {
  try { return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; }
  catch { return false; }
};
function refresh(): void {
  const next = { canPrompt: deferred !== null, ios: isIos(navigator.userAgent, navigator.maxTouchPoints ?? 0), standalone: installed || standaloneNow() };
  if (next.canPrompt !== snapshot.canPrompt || next.ios !== snapshot.ios || next.standalone !== snapshot.standalone) snapshot = next;
  notify();
}

/** À appeler une fois, au plus tôt (l'événement peut partir avant le premier rendu). `onInstalled` : appli installée. */
export function initInstall(onInstalled?: () => void): void {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; refresh(); });
  addEventListener('appinstalled', () => { deferred = null; installed = true; refresh(); onInstalled?.(); });
  refresh();
}

/** Ouvre l'invite native ; `unavailable` si le navigateur n'en a pas donné. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  refresh();
  return outcome;
}

export function useInstall(): InstallState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot, () => snapshot);
}
