import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Empreinte du contenu de dossiers (noms et octets) : elle nomme les caches du service worker. Un contenu changé = un
 * nouveau cache ; l'appli supprime l'ancien (src/pwa/cache.ts). Rien ne se re-télécharge tant que rien n'a changé.
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
export const CACHES = {
  /** Textures du globe, transcodeur, intro, police, icônes. */
  lourd: `countrizz-lourd-${empreinte(`${P}/textures`, `${P}/basis`, `${P}/intro`, `${P}/fonts`, `${P}/icons`)}`,
  /** Pays déjà vus : patchs (indexés par imagery.json et countries.json, qui portent leurs empreintes) et drapeaux. */
  pays: `countrizz-pays-${empreinte(`${P}/data/imagery.json`, `${P}/data/countries.json`, `${P}/data/flags`, `${P}/data/patches/sdf`)}`,
  /**
   * Index de données : servis du cache, revalidés en arrière-plan ; nommés par leur empreinte, comme les autres : après un
   * déploiement, un ancien countries.json ne doit jamais servir un code neuf (revue du 10/10).
   */
  donnees: `countrizz-donnees-${empreinte(`${P}/data/countries.json`, `${P}/data/imagery.json`, `${P}/data/borders.json`, `${P}/data/credits.json`)}`,
} as const;

// Les pages de sonde et de calibration sont publiées avec le site : les e2e tournent sur la version déployée
// (décision du 09/10/2026). Elles ne sont liées depuis aucune page du jeu.
export default defineConfig({
  define: { __COUNTRIZZ_CACHES__: JSON.stringify(Object.values(CACHES)) },
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
        // différents ; sinon, hors ligne, l'intro ne trouvait pas ses textures — constaté le 10/10)
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
        runtimeCaching: [
          {
            urlPattern: /\/(textures|basis|intro|fonts|icons)\/[^/]+$/,
            handler: 'CacheFirst',
            options: { cacheName: CACHES.lourd, expiration: { maxEntries: 40, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] }, matchOptions: { ignoreVary: true } },
          },
          {
            urlPattern: /\/data\/(patches|flags)\//,
            handler: 'CacheFirst',
            options: { cacheName: CACHES.pays, expiration: { maxEntries: 400, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] }, matchOptions: { ignoreVary: true } },
          },
          {
            urlPattern: /\/data\/[a-z]+\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: CACHES.donnees, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  build: { rolldownOptions: { input: { main: 'index.html', demo: 'demo.html', probe: 'probe.html', calibrate: 'calibrate.html' } } },
});
