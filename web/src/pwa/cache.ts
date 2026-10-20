import type { QualityTier } from '../globe/renderer';

/**
 * Caches du service worker (spec 2A §8, décisions du 10/10) : les fichiers lourds (textures, transcodeur, intro, police)
 * et les pays déjà vus (patchs, drapeaux) restent sur l'appareil, dans des caches au nom stable ; seuls les fichiers
 * changés en sortent (purgeStale, spec océan §3). Les caches d'un ancien nom sont supprimés ici.
 */
export const CACHE_PREFIX = 'countrizz-';

/** Les caches à garder ; les autres `countrizz-*` datent d'une version précédente (dont les anciens noms à empreinte). */
export function outdatedCaches(names: readonly string[], current: readonly string[]): string[] {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && !current.includes(n));
}

/**
 * Les fichiers de l'intro que le service worker garde (affiches, ancres des questions) : à la première visite, elle les charge
 * avant qu'il ne contrôle la page. Ni les vidéos ni leur manifeste : ils ne passent jamais par lui (hors ligne : accueil direct).
 */
export const INTRO_URLS = ['/intro/affiche-portrait.webp', '/intro/affiche-paysage.webp', '/intro/ancres.json'] as const;

/**
 * Clé du préchargement : les empreintes des fichiers préchargés. Un fichier changé change la clé, et le préchargement
 * repasse (seul ce fichier se retélécharge : les autres viennent du cache).
 */
export function preloadKey(urls: readonly string[], empreintes: Empreintes): string {
  return urls.map((u) => empreintes[u] ?? '-').join('.');
}

/** Ce qu'un téléphone télécharge d'avance à l'installation, selon son niveau de rendu. */
export function heavyUrls(tier: QualityTier): string[] {
  const size = tier === 'haute' ? '8k' : '4k';
  return [
    `/textures/day-${size}.ktx2`, `/textures/night-${size}.ktx2`, '/textures/surface-4k.ktx2', '/textures/clouds-4k.ktx2',
    '/textures/waves-512.ktx2', '/textures/relief-512.png',
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

/**
 * Cache fichier par fichier (spec océan §3, 20/10). Avant, chaque cache portait l'empreinte de TOUT son dossier : une
 * seule texture changée renommait le cache et faisait tout retélécharger. Désormais les caches gardent un nom stable ;
 * le build pose l'empreinte de chaque fichier (`__COUNTRIZZ_EMPREINTES__`, adresse → empreinte), et l'appli retire du
 * cache, au démarrage, les seuls fichiers dont l'empreinte a changé (ou qui n'existent plus). La table telle qu'elle était
 * au dernier passage est rangée dans le cache lui-même (entrée `EMPREINTES_KEY`) : sans elle, rien ne prouve qu'une copie
 * est à jour, tout est retiré (une fois, à la migration).
 */
export const EMPREINTES_KEY = '/__countrizz-empreintes__.json';
export type Empreintes = Readonly<Record<string, string>>;

/** Adresses (chemins) à retirer d'un cache : absentes de la table courante, ou d'une autre empreinte qu'au dernier passage. */
export function staleEntries(cached: readonly string[], previous: Empreintes | null, current: Empreintes): string[] {
  return cached.filter((u) => u !== EMPREINTES_KEY && (!(u in current) || previous?.[u] !== current[u]));
}

/** Retire des caches nommés les fichiers périmés, puis range la table courante ; sans Cache API, rien à faire. */
export async function purgeStale(cacheNames: readonly string[], current: Empreintes): Promise<string[]> {
  if (typeof caches === 'undefined') return [];
  const removed: string[] = [];
  for (const name of cacheNames) {
    if (!(await caches.has(name))) continue;
    const cache = await caches.open(name);
    const keys = await cache.keys();
    const saved = await cache.match(EMPREINTES_KEY);
    let previous: Empreintes | null = null;
    try { previous = saved ? ((await saved.json()) as Empreintes) : null; } catch { previous = null; }
    const paths = keys.map((r) => new URL(r.url).pathname);
    const stale = new Set(staleEntries(paths, previous, current));
    await Promise.all(keys.filter((r) => stale.has(new URL(r.url).pathname)).map((r) => cache.delete(r)));
    await cache.put(EMPREINTES_KEY, new Response(JSON.stringify(current), { headers: { 'content-type': 'application/json' } }));
    removed.push(...stale);
  }
  return removed;
}

/**
 * Ménage des caches au démarrage (anciens noms, fichiers périmés), lancé une fois : le globe l'attend avant de charger ses
 * textures, sinon une ancienne copie servirait encore cette visite. Ne rejette jamais.
 */
let ready: Promise<void> | null = null;
export function cachesReady(names: readonly string[] = __COUNTRIZZ_CACHES__, empreintes: Empreintes = __COUNTRIZZ_EMPREINTES__): Promise<void> {
  ready ??= (async () => {
    try { await purgeOutdated(names); await purgeStale(names, empreintes); } catch { /* stockage indisponible : le réseau suffit */ }
  })();
  return ready;
}
