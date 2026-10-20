import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { MOTIF_DONNEES, MOTIF_LOURD, MOTIF_PAYS } from './src/pwa/motifs.ts';

/**
 * Empreinte du contenu de fichiers ou de dossiers (noms et octets) : elle nomme le cache des données (un contenu changé =
 * un nouveau cache, l'appli supprime l'ancien) et marque chaque fichier lourd (empreintesFichiers).
 */
function empreinte(...chemins: string[]): string {
  const h = createHash('sha256');
  for (const c of chemins) {
    if (!existsSync(c)) continue;
    const fichiers = statSync(c).isDirectory() ? readdirSync(c).sort().map((f) => `${c}/${f}`) : [c];
    for (const f of fichiers) if (statSync(f).isFile()) h.update(f).update(readFileSync(f));
  }
  return h.digest('hex').slice(0, 10);
}
const P = 'public';
/**
 * Empreinte de chaque fichier gardé en cache (chemin → empreinte), spec océan §3 : l'appli ne retire du cache que les
 * fichiers changés (src/pwa/cache.ts, purgeStale). Les photos de pays, hors dépôt, prennent celle d'imagery.json.
 */
function empreintesFichiers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dir of ['textures', 'basis', 'intro', 'fonts', 'icons', 'data/flags', 'data/patches/sdf']) {
    const d = `${P}/${dir}`;
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).sort()) if (statSync(`${d}/${f}`).isFile()) out[`/${dir}/${f}`] = empreinte(`${d}/${f}`);
  }
  const index = `${P}/data/imagery.json`;
  if (existsSync(index)) {
    const { countries } = JSON.parse(readFileSync(index, 'utf8')) as { countries: Record<string, { levels: { files: Record<string, { sha256: string }> }[] }> };
    for (const [cca3, c] of Object.entries(countries)) c.levels.forEach((l, i) => {
      for (const [size, file] of Object.entries(l.files)) out[`/data/patches/img/${cca3.toLowerCase()}-${i}-${size}.ktx2`] = file.sha256.slice(0, 10);
    });
  }
  return out;
}
export const CACHES = {
  /** Textures du globe, transcodeur, intro (affiches, ancres, petite Terre ; pas les vidéos, hors de public/intro), police, icônes. Nom stable. */
  lourd: 'countrizz-lourd',
  /** Pays déjà vus : photos, patchs SDF et drapeaux. Nom stable : seuls les fichiers changés se retéléchargent. */
  pays: 'countrizz-pays',
  /**
   * Index de données : servis du cache, revalidés en arrière-plan ; nommés par leur empreinte, comme les autres : après un
   * déploiement, un ancien countries.json ne doit jamais servir un code neuf (revue du 10/10).
   */
  donnees: `countrizz-donnees-${empreinte(`${P}/data/countries.json`, `${P}/data/imagery.json`, `${P}/data/borders.json`, `${P}/data/credits.json`)}`,
} as const;

// Les pages de sonde et de calibration sont publiées avec le site : les e2e tournent sur la version déployée
// (décision du 09/10/2026). Elles ne sont liées depuis aucune page du jeu.
export default defineConfig({
  define: { __COUNTRIZZ_CACHES__: JSON.stringify(Object.values(CACHES)), __COUNTRIZZ_EMPREINTES__: JSON.stringify(empreintesFichiers()) },
  plugins: [
    react(),
    // PWA (spec 2A §8, décisions du 10/10) : installable, jouable hors ligne après une visite, fichiers lourds gardés.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['fonts/*.woff2', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'],
      manifest: {
        name: 'Countrizz',
        short_name: 'Countrizz',
        description: 'Le jeu des pays, des drapeaux et des capitales, sur une Terre en 3D.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#16173a',
        background_color: '#16173a',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // l'application elle-même (pages, code, police, icônes) : précache ; les fichiers lourds : à l'usage (ci-dessous)
        // ignoreVary (caches ci-dessous) : une image demandée par <img> doit retrouver celle qu'a rangée un fetch() (en-têtes
        // différents ; sinon, hors ligne, l'intro ne trouve pas ses affiches — constaté le 10/10 sur ses textures d'alors)
        globPatterns: ['index.html', 'demo.html', 'registerSW.js', 'assets/**/*.{js,css}', 'fonts/*.woff2', 'icons/*.png'],
        // pages de test (sonde, calibration) : publiées pour les e2e, aucun visiteur n'a à télécharger leur code
        globIgnores: ['**/node_modules/**', 'probe.html', 'calibrate.html', 'assets/probe-*', 'assets/calibrate-*'],
        maximumFileSizeToCacheInBytes: 3_000_000,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: null,
        // nos paramètres (`?webgl`, `?demo=FRA`…) ne sont lus que dans la page : « /?webgl » est « / » pour le précache
        ignoreURLParametersMatching: [/.*/],
        // motifs dans src/pwa/motifs.ts (testés) : les vidéos de l'intro (/video/) n'en sont pas, elles passent au réseau
        runtimeCaching: [
          {
            urlPattern: MOTIF_LOURD,
            handler: 'CacheFirst',
            options: { cacheName: CACHES.lourd, expiration: { maxEntries: 40, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] }, matchOptions: { ignoreVary: true } },
          },
          {
            // un tour complet dans une taille : 219 niveaux de photos + 197 SDF + 197 drapeaux (spec zoom §6)
            urlPattern: MOTIF_PAYS,
            handler: 'CacheFirst',
            options: { cacheName: CACHES.pays, expiration: { maxEntries: 700, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] }, matchOptions: { ignoreVary: true } },
          },
          {
            urlPattern: MOTIF_DONNEES,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: CACHES.donnees, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  build: { rolldownOptions: { input: { main: 'index.html', demo: 'demo.html', probe: 'probe.html', calibrate: 'calibrate.html' } } },
});
