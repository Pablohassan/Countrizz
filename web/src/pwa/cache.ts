import type { QualityTier } from '../globe/renderer';

/**
 * Caches du service worker (spec 2A §8, décisions du 10/10) : les fichiers lourds (textures, transcodeur, intro, police)
 * et les pays déjà vus (patchs, drapeaux) restent sur l'appareil ; leurs noms de cache portent une empreinte de leur
 * contenu, calculée au build (vite.config.ts) : un nouveau contenu = un nouveau cache, l'ancien est supprimé ici.
 */
export const CACHE_PREFIX = 'countrizz-';

/** Les caches à garder ; les autres `countrizz-*` datent d'une version précédente. */
export function outdatedCaches(names: readonly string[], current: readonly string[]): string[] {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && !current.includes(n));
}

/**
 * Les fichiers de l'intro que le service worker garde (affiches, ancres des questions) : à la première visite, elle les charge
 * avant qu'il ne contrôle la page. Ni les vidéos ni leur manifeste : ils ne passent jamais par lui (hors ligne : accueil direct).
 */
export const INTRO_URLS = ['/intro/affiche-portrait.webp', '/intro/affiche-paysage.webp', '/intro/ancres.json'] as const;

/** Ce qu'un téléphone télécharge d'avance à l'installation, selon son niveau de rendu. */
export function heavyUrls(tier: QualityTier): string[] {
  const size = tier === 'haute' ? '8k' : '4k';
  return [
    `/textures/day-${size}.ktx2`, `/textures/night-${size}.ktx2`, '/textures/surface-4k.ktx2', '/textures/clouds-4k.ktx2',
    '/basis/basis_transcoder.js', '/basis/basis_transcoder.wasm',
    ...INTRO_URLS,
    '/data/borders.json', '/data/countries.json', '/data/imagery.json',
  ];
}

/** Télécharge les adresses une à une (le service worker les range dans son cache) ; un échec n'arrête pas les autres. */
export async function warm(urls: readonly string[], get: (u: string) => Promise<{ ok: boolean }> = (u) => fetch(u)): Promise<{ ok: number; failed: string[] }> {
  let ok = 0;
  const failed: string[] = [];
  for (const u of urls) {
    try { if ((await get(u)).ok) ok++; else failed.push(u); } catch { failed.push(u); }
  }
  return { ok, failed };
}

/** Supprime les caches d'une version précédente (sans service worker ni Cache API : rien à faire). */
export async function purgeOutdated(current: readonly string[]): Promise<string[]> {
  if (typeof caches === 'undefined') return [];
  const old = outdatedCaches(await caches.keys(), current);
  await Promise.all(old.map((n) => caches.delete(n)));
  return old;
}

/** Demande que le navigateur ne vide pas notre stockage sous la pression (iOS le fait volontiers). */
export async function persist(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
