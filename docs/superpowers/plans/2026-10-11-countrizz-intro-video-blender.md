# Countrizz — intro en vidéo précalculée (Blender) · plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer l'intro three.js calculée dans le navigateur par une vidéo précalculée, rendue par Blender (Cycles) à 120 i/s en deux cadrages, avec une chute de la Terre douce puis accélérée, des questions en HTML (« Capitale ? », « Pays ? », « Drapeau ? ») qui naissent de leur objet, et un fondu vers l'accueil. Le jeu et son globe restent en WebGPU, avec WebGL 2 en repli.

**Architecture:**
- **Source unique.** `timeline.ts` reste la seule source de la chorégraphie. Un export Node la transforme en clés par image (`keys-<cadrage>.json`) et en ancres des questions (`ancres.json`).
- **Rendu.** Une scène Blender construite par script Python rejoue ces clés et rend des PNG RGBA à 120 i/s : images témoins, aperçu, rendu final et petite Terre du titre.
- **Encodage.** ffmpeg en tire 10 vidéos : AV1 et HEVC, 60 et 120 i/s, portrait plein et léger, paysage. Il produit aussi un manifeste et les affiches.
- **Site.** `lecteur.ts` (pur, testé) choisit le cadrage, la cadence et la variante, et pose le repère de la vidéo sur l'écran ; `questions.ts` (pur, testé) anime les questions en fonction du temps de la vidéo. `Intro.tsx` lit la vidéo, pose les questions et passe le relais à l'accueil. L'intro ne charge plus aucun moteur 3D.

**Tech Stack:**
- **Site :** React 19, Vite 8.3.2, TypeScript, Vitest (`--project unit`), Playwright 1.63 (Chromium), tsx 4.23.15, sharp 0.35.5 (déjà présent). three 0.186.1 ne sert plus qu'au globe et à l'export des clés.
- **Fabrique, sur le Mac :** Blender 5.0.1 (Cycles sur Metal, OIDN), ffmpeg 8.0.1 (libsvtav1, libx265).
- Aucun nouveau paquet npm.

**Spec:** `docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md`. Il amende `2026-10-10-countrizz-intro-pate-accueil-design.md`, qui reste valable pour l'accueil, `homeView` et la démo.

## Décisions prises en écrivant le plan (à valider par l'utilisateur)

Ce sont des écarts au spec ou des choix qu'il laissait ouverts. La Task 1, Step 0, les reporte dans le spec (§12) une fois validés ; si l'utilisateur en écarte une, on retire la ligne correspondante de ce step.

- **D1. Dossier des vidéos : `web/public/video/`, et non `public/intro/`.**
  - Ce dossier échappe au motif du service worker (`vite.config.ts:77`). Ce motif, en CacheFirst avec statut 200 et sans plages, casserait Safari.
  - Il échappe aussi à l'empreinte `CACHES.lourd` (`vite.config.ts:23`), qui hache chaque octet de `public/intro`.
  - nginx sert `video` avec les noms fixes, et l'image Docker le met dans un calque à part.
  - Hors ligne, il n'y a pas de vidéo : accueil direct.
- **D2. Variante portrait légère : 720 × 1560 à 60 i/s** (AV1 et HEVC). Elle sert quand le décodage de la 1080 × 2340 n'est ni fluide ni économe : cette taille exige le niveau 5 même à 60 i/s. On a donc 10 vidéos.
- **D3. 120 i/s seulement si l'écran et le décodeur suivent :** intervalle d'image mesuré ≤ 10 ms et décodage à 120 économe (`powerEfficient`). Safari plafonne la page à environ 60 Hz par défaut : il recevra la variante à 60 i/s.
- **D4. Abandonnée le 12/10.** Elle prenait l'image `/data/flags/fra.svg` pour le drapeau des bulles, plutôt que l'émoji 🇫🇷, qui n'est pas rendu sous Windows. Les questions n'ont plus de réponse au verso : le drapeau de la vidéo suffit (spec §5).
- **D5. Titre de fin :**
  - La vidéo montre le titre en pâte. Ses lettres surgissent au rythme de celles de l'accueil HTML.
  - Le titre HTML de l'accueil, monté à `ACCUEIL`, reste invisible jusqu'au fondu, puis entre en fondu (prop `entree: 'pop' | 'fondu'`).
  - La petite Terre animée reprend à l'angle de la vidéo.
  - Corrige au passage un bogue : changer `animation-delay` ne relance pas l'animation CSS. L'élément est désormais remonté par `key`.
- **D6. Deux corrections du spec :**
  - Blender 5.0.1 lit directement la police du site, `chango-latin.woff2` (le spec §2.3 disait le contraire).
  - Le Chromium de Playwright lit l'AV1. Les e2e forcent une variante AV1 et ne dépendent pas de HEVC (§9).
- **D7. Images rendues en PNG RGBA 8 bits.** En 16 bits, le seul portrait prendrait environ 15 Go. Le fond est transparent et la nuit est composée à l'encodage, exacte à ±1. L'AV1 est encodé en 10 bits.
- **D8. Portrait calé en haut** (`object-position: 50% 0`), paysage centré. Les questions suivent la même règle de rognage : leur calque, dans le repère de la vidéo, est posé sur l'écran par un seul transform (`couverture`, Task 9).
- **D9. Échantillons de rendu réglés sur les images témoins.**
  - La Task 6 mesure le temps par image et propose le nombre d'échantillons.
  - Si le rendu final des deux cadrages dépasse environ 10 h, l'utilisateur choisit : moins d'échantillons, ou deux nuits.
  - Relevé au plan sur les témoins : 4,1 s par image en portrait, 2,7 s en paysage, soit un rendu final d'environ 4,5 h à 128 échantillons et environ 5,9 Go de PNG.
- **D10. Pas de profondeur de champ.**
  - Le spec §2.4 demande une profondeur de champ légère. Mais les lettres des titres sont à 2 unités de la caméra et la Terre à 4,27 unités au moins : une mise au point sur la Terre les floute.
  - Pour l'ajouter, il faut une piste de mise au point et reculer `PROFONDEUR.lettres` (Task 3). L'utilisateur en juge sur la planche (Task 6).
- **D11. Ordre d'essai des variantes : la plus économe, puis la plus fluide, puis la plus lisible ; AV1 avant HEVC à égalité.**
  - Le spec §4 disait « AV1 si possible, sinon HEVC ».
  - Exemple : sur un Mac sans décodeur AV1 matériel, un HEVC décodé par le matériel passe devant un AV1 décodé en logiciel.
- **D12. Fin à 19,8 s.** C'est le « ≈ 20 s » du spec §3.5. Le test borne la durée entre 19 et 25 s.
- **D13. `<video muted playsinline>` sans attribut `autoplay`.** Le `src` est posé en JS, puis on appelle `play()` : un refus (mode économie d'énergie d'iOS) se voit et mène à l'accueil direct.
- **D14. Chiffres du budget et de l'encodage :**
  - Démarrage « < 1 s sur une bonne connexion » (spec §7) mesuré en temps de première image : médiane de 3 mesures, à 40 ms par requête et 10 Mbit/s.
  - Affiche ≤ 100 000 octets.
  - Débit des vidéos plafonné à 4000 kb/s, soit la moitié d'une 4G faible à 8 Mb/s. Qualité de départ : CRF 30 en AV1, 22 en HEVC.
  - Plafond par fichier fixé après le rendu final (Task 8), dans `web/e2e-budget/plafonds-video.json`.
- **D15. `GlobeView` chargé par import différé (`React.lazy`)** pour tenir le démarrage sous 1 s.
  - Le globe reste monté caché dès que son code arrive.
  - Si ce code ne se charge pas, une barrière d'erreur affiche la carte « Réessayer » du globe, sortie dans `LoadErrorCard.tsx` ; ce bouton recharge la page, car Chromium ne retente pas un `import()` échoué.
  - Mesuré au plan sous nginx (médiane de 3) : 970 → 590 ms sur une bonne connexion, 1533 → environ 1165 ms en Fast 4G.

## Questions ouvertes (à trancher aux points d'arrêt, sur images)

- **Planche (Task 6) :**
  - Le rendu en vue `Standard` est plus saturé que la version three.js validée (ACES, exposition 1,08).
  - Le titre de fin en paysage est petit : le « o » fait r 17,8 px vidéo, fidèle à l'accueil HTML sur bureau.
  - La phase « en flottant » de la chute se passe hors du cadre : la Terre n'est à l'image qu'environ 1,1 s avant l'impact.
- **Aperçu (Task 7) :**
  - Tranché le 12/10 : les bulles sont refusées, les questions nées de leur objet les remplacent (maquette validée : « ok go », spec §5). « Capitale ? » naît quand le point se pose sur Paris (11,22 s), et non plus à 11,1 s pendant qu'il tombe.
  - Les lettres de « Pays ? » jaillissent du milieu de la frontière, dans les Pyrénées (0,53° E, 42,68° N), et y rentrent.
  - Plus de décalages estimés (`DECALAGE_BULLE`) : les places de repos sont celles de la maquette validée (`POSES`, Task 9), ramenées dans l'écran quand le rognage les coupe.
  - L'ombre de texte du titre HTML n'est pas reproduite sur les lettres de la vidéo, ce qui se voit pendant le fondu D5.
  - Il y a un écart de ligne de base de 0,75 px CSS au plus entre les deux titres pendant ce fondu (accepté).
- **Passation (Task 12) :** plafonds pour le démarrage en Fast 4G (environ 1,16 s mesuré après D15) et pour l'accueil « haute ». D14 n'en fixe pas : ils sont mesurés, non bornés.

## Points d'arrêt de l'utilisateur

1. **Task 6 :** planche des images témoins (matière, lumière, cadrage, échantillons), et décision D9 si le rendu dépasse environ 10 h.
2. **Task 7 :** aperçu complet encodé, bulles esquissées (rythme, seconde de plus ou non). Passé le 12/10 : rythme validé, pas de seconde de plus ; les bulles refusées, la maquette des questions qui les remplacent validée (« ok go »).
3. **Task 8 :** accord avant le rendu final (une nuit ou deux), puis revue des 10 vidéos.
4. **Task 12 :** GO sur la commande exacte de construction de l'image `1.7`, puis GO pour `kubectl apply` et le rollout.

## Global Constraints

- **Git :** branche `newcountri`. Jamais de fusion dans `Master`, rien de poussé sans accord, déploiement avec le GO de l'utilisateur (spec §10).
- **Pile du site** inchangée : « React 19, three 0.186.1 pour le globe, Vite, Vitest, Playwright ; aucun nouveau paquet npm sans accord » (spec §10).
- **WebGPU :** « Le jeu et son globe restent en WebGPU (WebGL 2 en repli) ; l'intro n'utilise plus aucun moteur 3D » (spec §1).
- **Outils de la fabrique :**
  - Blender 5.0.1, lancé par `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P …` ;
  - ffmpeg avec `libsvtav1` et `libx265`.
- **Cadences :** rendu maître à 120 i/s, encodages à 60 et à 120 i/s. Le 120 n'est servi qu'aux écrans qui le suivent (spec §1, D3).
- **Couleurs :** nuit `#16173a` posée à l'encodage ; le fond décodé est vérifié à ±3 (spec §2.4, §8).
- **Animation Blender :**
  - Clés toutes en interpolation LINÉAIRE : le flou de mouvement échantillonne entre les images.
  - Géométrie de la Terre fixe (`render.use_persistent_data`).
  - Les images déjà rendues ne sont reprises que si les réglages, les clés et la scène n'ont pas changé ; sinon, relancer avec `--neuf`.
- **Fichiers versionnés :** les vidéos, affiches, ancres et le manifeste. Les PNG et les clés restent dans `web/scripts/intro/.cache/`, ignoré par git (spec §2.5).
- **Validation :** dans l'ordre, planche, aperçu, puis rendu final (spec §3).
- **Écritures hors du dépôt** (Docker Hub, cluster) : GO de l'utilisateur sur la commande exacte.
- **Budget (spec §7) :**
  - démarrage < 1 s sur une bonne connexion ;
  - reste du premier chargement ≤ 12 Mo en « standard », vidéo non comptée.
- **Disque :** `intro:rendu` refuse de partir sous 15 Go libres (25 Gi libres le 11/10).
- **Hooks du poste :** pas de `grep`, `sed` ni `awk` filtrants. Lire en entier, ou filtrer avec `node -e`.
- **Rédaction :**
  - Code et commentaires en français, au ton du code voisin.
  - Commits « domaine : quoi — spec intro vidéo §x », terminés par les lignes d'attribution de la session.

## Review Focus

Les cinq cas que le spec implique sans les nommer, du plus probable au moins probable. Chacun est épinglé par des tests dans la tâche qui porte le code ; le relecteur final les vérifie un par un.

1. **Écran loin des deux références** (iPad portrait 768 × 1024, bureau 21:9 2560 × 1080, téléphone court 390 × 664) : la vidéo couvre l'écran sans bande vide, et chaque question reste entière dans l'écran : sa place de repos, près de son objet, est ramenée dans la partie visible quand le rognage la coupe (à 8 px CSS des bords, son mouvement compris).
   - Task 9, `web/src/intro/lecteur.test.ts` : « la vidéo couvre l’écran sans bande vide ; portrait calé en haut, paysage centré ; centrée en largeur », « couverture : un seul transform du repère de la vidéo à l’écran (translate puis scale), celui de versEcran ».
   - Task 9, `web/src/intro/questions.test.ts` : « partie visible : ce que l’écran montre de la vidéo, à la marge près », « l’étendue d’un mot contient chacune de ses lettres, de la pose au retour (inclinaison qui oscille, onde, saut du « ? ») », « mot dont la place de repos sort de la partie visible : ramené dedans (iPad portrait : « Pays ? » remonte ; 900 × 900 : « Capitale ? » rentre à gauche) ; gardé s’il y tient ; centré s’il est plus grand qu’elle », « les ancres livrées (public/intro/ancres.json), sur chaque écran du Review Focus : chaque mot entier dans l’écran, de sa pose à son retour ».
   - Task 11, `web/e2e/intro.spec.ts` : « <écran> <l>×<h> : la vidéo couvre l’écran, chaque question reste entière dedans », une fois par écran.
2. **Seconde visite, service worker actif** : la vidéo se lit, servie par le réseau avec ses plages d'octets, et n'est jamais rangée dans un cache (sinon Safari casse : D1).
   - Task 10, `web/src/pwa/pwa.test.ts` : « les vidéos de l’intro et leur manifeste passent au réseau : plages d’octets, que CacheFirst « 200 seulement » casserait (D1) », « ce sont bien les motifs de vite.config.ts (aucun motif écrit en dur à côté) ».
   - Task 11, `web/e2e/pwa.spec.ts` : « seconde visite, service worker actif : la vidéo se lit, servie par le réseau, jamais rangée dans ses caches ».
3. **Onglet caché pendant l'intro** : rien n'est compté comme abandon pendant l'absence ; au retour, la lecture reprend d'elle-même (relancée par `Intro.tsx`), ou l'intro mène à l'accueil.
   - Task 9, `lecteur.test.ts` : « onglet caché pendant l’attente : l’absence ne compte pas ; au retour, le compte reprend où il était », « au retour de l’onglet, la vidéo reprend : plus d’abandon », « un relevé manqué (page gelée 30 s sans événement) ne compte que pour un pas ».
   - Task 11, `intro.spec.ts` : « onglet caché pendant la lecture : aucun abandon pendant l’absence ni à cause d’elle ; au retour, la lecture reprend » (le test cache l'onglet sans relancer la vidéo : la reprise doit venir d'`Intro.tsx`), « onglet caché avant la première image : l’absence ne compte pas dans les 8 s ».
4. **Rotation ou redimensionnement pendant l'intro** : la vidéo n'est pas rechargée (le cadrage choisi au départ reste), elle couvre encore l'écran, et le calque des questions est reposé (transform de `couverture`, mots ramenés par `poserMot`).
   - Task 9, `lecteur.test.ts` : « rotation pendant l’intro : la même vidéo (même cadrage) couvre encore l’écran tourné ».
   - Task 9, `questions.test.ts` : « rotation pendant l’intro (portrait gardé sur l’écran tourné 844 × 390) : chaque mot ramené dans le haut visible, entier ».
   - Task 11, `intro.spec.ts` : « rotation et redimensionnement pendant l’intro : la vidéo n’est pas rechargée, les questions sont reposées et restent entières dans l’écran ».
5. **Réseau qui cale** : les questions, fonction pure du temps de la vidéo, attendent avec elle ; après 8 s sans progrès, ou si aucune image n'arrive en 8 s, accueil direct.
   - Task 9, `lecteur.test.ts` : « aucune image : « pas-d-image » à 8 s, pas avant », « réseau qui cale en cours de lecture : « bloquee » au bout de 8 s sans progrès ; un progrès remet le compte à zéro », « lecture qui n’a pas à avancer (figée par ?introT, dernière image en attendant le globe) : jamais d’abandon ».
   - Task 9, `questions.test.ts` : « fonction pure du temps de la vidéo : le même instant donne la même image, quel que soit l’ordre des appels (?introT, réseau qui cale) ».
   - Task 11, `intro.spec.ts` : « le réseau cale en pleine lecture : les questions attendent avec la vidéo, puis accueil après 8 s sans progrès », « requête vidéo jamais servie : l’affiche du bon cadrage, puis l’accueil direct au bout de 8 s ».

---

## Structure des fichiers

| Fichier | Rôle | Task |
|---|---|---|
| `web/src/intro/temps.ts` (nouveau) | constantes partagées site et fabrique, sans three : cadrages, `INTRO`, `BULLES` (instants de la fabrique : fenêtre d'`ancres.json`, témoins, aperçu), `LOGO_*`, abandons | 1 |
| `web/src/intro/cadrages.ts` (nouveau) | écrans de référence et géométrie mesurée des deux titres, en px vidéo | 1 |
| `web/scripts/intro/mesurer-titres.ts` (nouveau) | mesure des titres dans Chromium (vraie police, règles CSS du site) | 1 |
| `web/src/intro/timeline.ts` (réécrit) | chorégraphie v2 : `frameAt(t, cadrage)`, chute en v³, écrasement continu, lettres, étoiles | 1 |
| `web/src/intro/timeline-v1.ts` (provisoire) | copie gelée de l'ancienne chronologie pour l'intro three.js, jusqu'à la Task 10 | 1 → 10 |
| `web/scripts/intro/lib/terre.ts`, `lib/peinture.ts` (nouveaux) | géométrie de la Terre (hauteur, frontière, repères) et peintures extraites de `build-intro.ts` | 2 |
| `web/scripts/intro/sources.ts` (nouveau) | sources de Blender dans `.cache/sources/` (peintures, hauteur et relief en 16 bits, frontière, repères) | 2 |
| `web/scripts/intro/lib/axes.ts`, `export-keys.ts` (nouveaux) | clés par image pour Blender, et `web/public/intro/ancres.json` pour le lecteur ; à la Task 9, `export-keys.ts` ré-exporte le type `Ancres` des questions (`questions.ts`) | 3, 9 |
| `web/scripts/intro/blender/{commun,scene,anim,rendre}.py` (nouveaux) | scène construite par script, cuisson des clés, rendu par mode (`temoins`, `apercu`, `rendu`, `sprite`) | 4, 5 |
| `web/scripts/intro/blender/essais.py` (nouveau) | essais Python lancés dans Blender | 4, 5 |
| `web/scripts/intro/lib/lanceur.ts`, `blender.ts` (nouveaux) | lanceur de Blender : disque, fraîcheur des clés, modes, témoins | 4, 5, 6 |
| `web/scripts/intro/lib/{temoins,mesure}.ts`, `planche.ts`, `avancement.ts` (nouveaux) | planche contact des témoins, mesure du temps par image, avancement du rendu | 6 |
| `web/src/intro/videos.ts` (nouveau) | types du manifeste (`Manifeste`, `Variante`, `idVariante`), partagés par la fabrique et le lecteur | 7 |
| `web/scripts/intro/lib/{mp4,encodage,apercu}.ts`, `encode.ts` (nouveaux) | encodage ffmpeg, chaînes de codec lues dans le fichier, affiches, sprite, manifeste, aperçu avec bulles | 7 |
| `web/public/video/*.mp4`, `videos.json`, `web/public/intro/affiche-*.webp`, `logo-terre.webp`, `web/e2e-budget/plafonds-video.json` (générés) | les 10 vidéos, le manifeste, les affiches, la petite Terre et les plafonds par fichier | 8 |
| `web/src/intro/lecteur.ts` (nouveau) | décisions pures du lecteur : cadrage, cadence, variante, rognage `cover` (`couverture`, `versEcran`), relais de la petite Terre, abandons | 9 |
| `web/src/intro/questions.ts` (nouveau) | questions en fonctions pures du temps de la vidéo : textes et typographie, instants nés des objets, ancres interpolées (type `Ancres`), places de repos ramenées dans la partie visible, état de chaque lettre | 9 |
| `web/src/intro/Intro.tsx`, `intro.css` (réécrits) | lecteur vidéo, calque des questions, « Passer › », relais vers l'accueil (la Task 1 n'y change que les imports) | 1, 10 |
| `web/src/i18n/types.ts`, `fr.ts`, `en.ts` (modifiés) | textes de l'intro : étiquette de la vidéo (les questions prennent `modes.*` ; leur typographie est dans `questions.ts`) | 10 |
| `web/src/ui/LogoTitle.tsx`, `Home.tsx`, `home.css`, `web/src/app/App.tsx` (modifiés) | entrée du titre en fondu (D5), relais de la petite Terre, globe chargé en différé (D15) | 10 |
| `web/src/globe/LoadErrorCard.tsx` (nouveau), `GlobeView.tsx` (modifié) | carte « Réessayer » sortie du code du globe, pour l'afficher sans lui (D15) | 10 |
| `web/src/pwa/motifs.ts` (nouveau), `cache.ts`, `vite.config.ts`, `web/tsconfig.json` (modifiés) | motifs du service worker testés : `/video/` jamais intercepté (D1) ; `allowImportingTsExtensions` pour importer `motifs.ts` avec son extension | 10 |
| `deploy/web/nginx.conf`, `Dockerfile`, `deploy/scripts/stage-image.mjs` (modifiés) | `video` servi avec les noms fixes, calque d'image à part | 10 |
| `web/e2e/intro.spec.ts`, `pwa.spec.ts`, `deployed.ts`, `web/e2e-budget/first-load.spec.ts` (réécrits) | bout en bout de l'intro vidéo, service worker, budget de démarrage et plafonds | 11 |
| `web/vitest.config.ts`, `web/package.json`, `.gitignore` (modifiés) | essais de la fabrique, scripts `intro:*`, cache `web/scripts/intro/.cache/` ignoré | 2 à 7 |
| spec, `docs/HANDOFF.md`, `deploy/k8s/countrizz.yaml` (modifiés) | décisions reportées au spec (Tasks 1, 6, 7), passation et étiquette `1.7` (Task 12) | 1, 6, 7, 12 |
| supprimés | `scene.ts`, `boxes.ts`, `timeline-v1.ts`, `build-intro.ts`, `build-logo-sprite.mjs`, les 5 textures de `public/intro/` | 2, 10 |

---

### Task 1 : Chronologie v2 (temps.ts, cadrages.ts + mesurer-titres.ts, timeline.ts, tests)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md` (Step 0 : décisions du plan D1-D15)
- Create: `web/src/intro/temps.ts`
- Create: `web/src/intro/cadrages.ts`
- Create: `web/scripts/intro/mesurer-titres.ts`
- Create: `web/src/intro/timeline-v1.ts` (copie gelée de l'actuel `timeline.ts` : l'intro three.js reste en service jusqu'au lecteur ; la Task 10 la supprime avec `scene.ts`)
- Modify: `web/src/intro/timeline.ts` (réécrit)
- Modify: `web/src/intro/Intro.tsx:4,13-15`, `web/src/intro/scene.ts:7`, `web/src/ui/LogoTitle.tsx:2` (imports seulement)
- Test: `web/src/intro/timeline.test.ts` (réécrit)

**Interfaces:**
- Consumes : `toVec` (`web/src/geo/vec.ts`, dans les tests) ; `three/webgpu` ; `chromium` de `@playwright/test` ; lus par `mesurer-titres.ts` : `web/src/ui/home.css`, `web/src/ui/theme.css`, le `<style>` de `web/index.html`, `web/public/fonts/chango-latin.woff2` et `chango-latin-ext.woff2`.
- Produces :
  - `temps.ts` (sans three) : `type Cadrage = 'portrait' | 'paysage'` ; `CADRAGES: Record<Cadrage, { width: number; height: number }>` ; `IPS_MAITRE = 120` ; `INTRO = { CHUTE: 1.2, D_CHUTE: 2.4, ACCUEIL: 17.0, FONDU: 18.2, FIN: 19.8 } as const` ; `BULLES` (`apparait`, `retourne` par bulle) ; `BULLES_RANGE = 16.2` ; `type Bulle = keyof typeof BULLES` ; `LOGO_LETTRES` ; `LOGO_TOUR_S = 4` ; `LOGO_ANGLE_FIN = 2.436418150808498` ; `INTRO_GIVE_UP_MS = 8000`.
  - `cadrages.ts` (sans three) : `REFERENCES: Record<Cadrage, { width: number; height: number; echelle: number }>` (écrans de référence en px CSS ; `echelle` = px vidéo par px CSS : 1080/390 en portrait, 1 en paysage) ; `interface Titre { o: { x: number; y: number; r: number }; police: number; lettres: { x: number; y: number }[] }` ; `TITRES: Record<Cadrage, { logo: Titre; titre: Titre }>` (px vidéo). Centre d'une lettre = milieu de sa boîte en ligne (avance × hauteur de ligne), au repos.
  - `timeline.ts` : `PARIS`, `POINT_RP`, `MAT_HM`, `REPERE_ECHELLE`, `rebond(x, k = 1.9)`, `logoAngleAt(t: number): number`, `frameAt(t: number, cadrage: Cadrage): IntroFrame`, `interface IntroCamera { position: [number, number, number]; quaternion: [number, number, number, number]; fov: number }`, `interface LettreAnim { dx: number; dy: number; echelle: number; rot: number; alpha: number }` (transformée `translate(dx, dy) scale(echelle) rotate(rot)` autour du centre mesuré, px vidéo ; `rot` en rad, sens horaire à l'image comme `rotate` en CSS), `interface IntroFrame { camera; squash: { sx; sy }; clouds: { scale; spin }; point; border; bead; flag; logo: LettreAnim[]; titre: LettreAnim[]; etoiles: { x; y; r; alpha; echelle }[] }` (étoile : centre et rayon en px vidéo). Retirés : `INTRO`, `LOGO_LETTRES`, `LOGO_TOUR_S` (→ `temps.ts`), `Viewport`, `Target`, `Targets`, `defaultTargets`, `spriteFrame`, `IPS`, et les champs `blur`, `opacity`, `backdrop`, `label` de l'image.
  - `timeline-v1.ts` (provisoire, pour `scene.ts` et `Intro.tsx` seulement) : l'API actuelle, inchangée.

- [ ] **Step 0 : amender le spec avec les décisions du plan.** Les décisions D1 à D15 de l’en-tête du plan, validées par l’utilisateur à la relecture du plan, corrigent le spec là où il est faux (police WOFF2, HEVC dans Chromium) ou dépassé (dossier des vidéos, `autoplay`, ordre des codecs, budget en octets, profondeur de champ, import du globe). Créer `/tmp/amender-spec.mjs` (hors du dépôt) avec ce contenu :

```js
import { readFileSync, writeFileSync } from 'node:fs';
const f = 'docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md';
let s = readFileSync(f, 'utf8');
const R = [
  ['(`intro-ancres.json`, fenêtre des bulles seulement)', '(`web/public/intro/ancres.json`, fenêtre des bulles seulement)'],
  ['(police Chango, OFL — le TTF, Blender ne lit pas le WOFF2 du site)', '(police Chango, OFL — le fichier du site `web/public/fonts/chango-latin.woff2`, que Blender 5.0.1 lit tel quel : D6)'],
  ['vrai flou de mouvement, profondeur de champ légère, débruitage', 'vrai flou de mouvement, débruitage, sans profondeur de champ (D10)'],
  ['Sorties dans `web/public/intro/`,', 'Vidéos et manifeste dans `web/public/video/` (hors du service worker : D1), affiches dans `web/public/intro/`,'],
  ['- **Codec** : AV1 si `canPlayType`/`MediaCapabilities` le permet, sinon HEVC ; `<video muted playsinline autoplay>`.',
   '- **Codec** : la variante la plus économe, puis la plus fluide, AV1 avant HEVC à égalité (D11) ; `<video muted playsinline>`\n  lancée par `play()`, sans attribut `autoplay` (D13).'],
  ['- **Globe** : monté caché dès le début, chargé pendant la vidéo (inchangé) ;', '- **Globe** : monté caché dès que son code est arrivé (import différé : D15), chargé pendant la vidéo ;'],
  ['(`intro-ancres.json`), convertie', '(`ancres.json`), convertie'],
  ['- **Démarrage** : affiche + début de la vidéo → première image en < 1 s sur une bonne connexion ; plafond en octets fixé\n  au plan après mesure des vidéos témoins.',
   '- **Démarrage** : affiche + début de la vidéo → première image en < 1 s sur une bonne connexion, mesurée en temps de\n  première image (médiane de 3, 40 ms par requête, 10 Mbit/s) ; affiche ≤ 100 000 octets (D14).'],
  ['durée totale dans 20-25 s', 'durée totale ≈ 20 s (test : entre 19 et 25 s, D12)'],
  ['AV1 puis HEVC,', 'la plus économe puis la plus fluide, AV1 avant HEVC à égalité (D11),'],
  ['- **HEVC** non lu par Chromium sans matériel ; l\'AV1 y est lu partout (décodeur logiciel) — les e2e (Chromium) lisent\n  l\'AV1.',
   '- **HEVC** : sa lecture par Chromium sans décodeur matériel n\'est pas garantie ; l\'AV1 y est lu (décodeur logiciel) — les\n  e2e (Chromium) forcent une variante AV1 et ne dépendent pas de HEVC (D6).'],
];
for (const [a, b] of R) {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error(`introuvable ou ambigu (${n}) : ${a.slice(0, 60)}`); process.exit(1); }
  s = s.replace(a, () => b);
}
s += `
## 12. Décisions du plan (validées à la relecture du plan \`docs/superpowers/plans/2026-10-11-countrizz-intro-video-blender.md\`)

| | Décision |
|---|---|
| D1 | Vidéos et manifeste dans \`web/public/video/\`, hors du service worker et de l'empreinte \`CACHES.lourd\` ; calque d'image à part ; hors ligne : accueil direct |
| D2 | Variante portrait légère 720 × 1560 à 60 i/s (AV1 et HEVC), servie quand la 1080 n'est ni fluide ni économe : 10 vidéos |
| D3 | 120 i/s seulement si l'intervalle mesuré est ≤ 10 ms et que le décodage à 120 est économe ; Safari (≈ 60 Hz par défaut) reçoit 60 |
| D4 | Drapeau des bulles : l'image \`/data/flags/fra.svg\` (l'émoji n'est pas rendu sous Windows) |
| D5 | Titre de fin en pâte dans la vidéo ; le titre HTML de l'accueil reste invisible jusqu'au fondu puis entre en fondu ; la petite Terre repart de l'angle de la vidéo |
| D6 | Blender lit la police WOFF2 du site ; les e2e (Chromium) lisent l'AV1 et ne dépendent pas de HEVC |
| D7 | Images rendues en PNG RGBA 8 bits ; AV1 en 10 bits |
| D8 | Vidéo portrait calée en haut (\`object-position: 50% 0\`), paysage centrée ; ancres converties par la même règle |
| D9 | Échantillons réglés sur la mesure des images témoins ; au-delà de ≈ 10 h de rendu, l'utilisateur choisit (moins d'échantillons ou deux nuits) |
| D10 | Pas de profondeur de champ (les lettres sont à 2 unités de la caméra, la Terre à ≥ 4,27) |
| D11 | Ordre d'essai des variantes : économe, puis fluide, puis lisible ; AV1 avant HEVC à égalité |
| D12 | Fin à 19,8 s (≈ 20 s) |
| D13 | \`<video muted playsinline>\` sans \`autoplay\`, \`src\` posé en JS puis \`play()\` |
| D14 | Démarrage ≤ 1000 ms (médiane de 3, 40 ms par requête, 10 Mbit/s) et affiche ≤ 100 000 o ; débit plafonné à 4000 kb/s, CRF de départ 30 (AV1) / 22 (HEVC) |
| D15 | \`GlobeView\` chargé par import différé pour tenir le démarrage |
`;
writeFileSync(f, s);
console.log('spec amendé : 11 remplacements, §12 ajouté');
```

Run : `cd "$(git rev-parse --show-toplevel)" && node /tmp/amender-spec.mjs && git diff --stat`
Expected : `spec amendé : 11 remplacements, §12 ajouté`, puis `1 file changed, 34 insertions(+), 13 deletions(-)`. Un second lancement s’arrête (code 1) sur `introuvable ou ambigu (0)` : le script ne s’applique qu’une fois. Si l’utilisateur a écarté une décision à la relecture, retirer son remplacement et sa ligne du §12 avant de lancer.

```bash
git add docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md
git commit -m "spec : décisions du plan de l’intro vidéo (D1-D15) — §2, §4, §7, §8, §9, §12"
```

- [ ] **Step 1 : constantes partagées.** Créer `web/src/intro/temps.ts` :

```ts
/**
 * Constantes de l'intro partagées par le site (lecteur vidéo, accueil) et la fabrique de la vidéo (spec
 * `2026-10-11-countrizz-intro-video-blender-design.md`). Sans three : le lecteur et le titre de l'accueil ne chargent
 * pas la chronologie. Instants en secondes depuis le début de la vidéo.
 */

/** Les deux cadrages de la vidéo (px de la vidéo) : fenêtre plus haute que large → portrait, sinon paysage. */
export type Cadrage = 'portrait' | 'paysage';
export const CADRAGES: Record<Cadrage, { width: number; height: number }> = { portrait: { width: 1080, height: 2340 }, paysage: { width: 1920, height: 1080 } };

/** Cadence du rendu maître : une clé, une image Blender par 1/120 s. */
export const IPS_MAITRE = 120;

export const INTRO = {
  /** Début de la chute de la Terre. */
  CHUTE: 1.2,
  /** Durée de la chute : presque en flottant, puis de plus en plus vite (spec vidéo §3.1) ; la suite est décalée de +0,8 s. */
  D_CHUTE: 2.4,
  /** L'accueil se monte (commandes ; son titre reste invisible jusqu'au fondu) ; la Terre part vers le « o » du titre. */
  ACCUEIL: 17.0,
  /** Le vrai globe reprend son rendu, la vidéo s'efface : il faut le globe. */
  FONDU: 18.2,
  /** Fin de la vidéo : la petite Terre animée du titre prend le relais. */
  FIN: 19.8,
} as const;

/** Bulles : apparition (s), retournement sur la réponse (s) ; toutes se rangent à BULLES_RANGE. */
export const BULLES = { capitale: { apparait: 11.1, retourne: 14.0 }, pays: { apparait: 11.8, retourne: 14.3 }, drapeau: { apparait: 13.3, retourne: 14.6 } } as const;
/** Le drapeau, la frontière et les bulles se rangent (0,7 s), avant le second dézoom. */
export const BULLES_RANGE = 16.2;
export type Bulle = keyof typeof BULLES;

/** Le nom autour du « o » (la Terre) : « C », puis « untrizz ». */
export const LOGO_LETTRES = ['C', 'u', 'n', 't', 'r', 'i', 'z', 'z'] as const;
/** La petite Terre du titre de l'accueil fait un tour en 4 s (24 images, stop motion à 6 i/s). */
export const LOGO_TOUR_S = 4;
/** Angle de la Terre à FIN (rad, [0, 2π[) : la petite Terre du titre part de cette image ; = logoAngleAt(INTRO.FIN) (test). */
export const LOGO_ANGLE_FIN = 2.436418150808498;

/** Sans image au bout de 8 s, ou 8 s sans progrès en cours de lecture : intro abandonnée, accueil direct (spec vidéo §4). */
export const INTRO_GIVE_UP_MS = 8000;
```

`LOGO_ANGLE_FIN` est la valeur de `logoAngleAt(INTRO.FIN)` sur la chronologie du Step 10, relevée au plan par `cd web && npx tsx -e "import { logoAngleAt } from './src/intro/timeline'; import { INTRO } from './src/intro/temps'; console.log(logoAngleAt(INTRO.FIN));"` (sortie : `2.436418150808498`, l'angle d'aujourd'hui à 19,0 s — `2.4364181508084943` — à 3,6e-15 près : tout est décalé de 0,8 s). Le test du Step 8 la vérifie à 1e-12 ; si le Step 11 la refuse, relancer cette commande après le Step 10 et recopier sa sortie.

- [ ] **Step 2 : écrans de référence.** Créer `web/src/intro/cadrages.ts` (les mesures, `TITRES`, viennent au Step 5) :

```ts
import type { Cadrage } from './temps';

/**
 * Géométrie des deux titres « C🌍untrizz » de la vidéo, par cadrage, en px de la vidéo (spec vidéo §3.4) : le logo du
 * milieu (premier dézoom) et le titre de fin (second dézoom, à la place du titre de l'accueil). Mesurée une fois pour
 * toutes par `scripts/intro/mesurer-titres.ts` (Chromium, vraie police, règles CSS du site) et recopiée ici.
 */

/**
 * Écrans de référence (px CSS) où les titres sont mesurés : un téléphone 390 × 844 pour le portrait, un écran 1920 × 1080
 * pour le paysage (la densité n'y change rien : mesures identiques à 1 et 3 px par px CSS). `echelle` : px de la vidéo
 * par px CSS — la vidéo couvre l'écran (`cover`), portrait calé en haut.
 */
export const REFERENCES: Record<Cadrage, { width: number; height: number; echelle: number }> = {
  portrait: { width: 390, height: 844, echelle: 1080 / 390 },
  paysage: { width: 1920, height: 1080, echelle: 1 },
};

/**
 * Un titre mesuré : le « o » (centre et rayon de la petite Terre, `.logo-terre`), la taille de la police, et le centre de
 * chacune des 8 autres lettres (ordre LOGO_LETTRES) : milieu de sa boîte (avance × hauteur de ligne), au repos.
 */
export interface Titre { o: { x: number; y: number; r: number }; police: number; lettres: { x: number; y: number }[] }
```

- [ ] **Step 3 : script de mesure.** Créer `web/scripts/intro/mesurer-titres.ts` (le titre de l'accueil est mesuré sur `home.css` lu tel quel ; le logo du milieu sur les règles d'`intro.css` recopiées, puisque la Task 10 les retire du site) :

```ts
// Géométrie des deux titres « C🌍untrizz » de la vidéo (src/intro/cadrages.ts), en px de la vidéo : Chromium (Playwright)
// mesure une page qui reprend les règles CSS du site avec la vraie police Chango. Le titre de l'accueil vient de
// src/ui/home.css lu tel quel ; le logo du milieu, des règles d'intro.css du 10/10 recopiées ci-dessous (le lecteur
// vidéo les retire du site, la vidéo les garde). Animations coupées : les lettres sont mesurées au repos.
// Usage (dans web/) : `npx tsx scripts/intro/mesurer-titres.ts` → JSON sur la sortie standard, à recopier dans TITRES.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFERENCES, type Titre } from '../../src/intro/cadrages';
import { CADRAGES, LOGO_LETTRES, type Cadrage } from '../../src/intro/temps';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGINE = 'http://titres.countrizz';

/** Logo du milieu : intro.css du 10/10, l. 2 et 7-11 (copie exacte). */
const LOGO_CSS = `
.intro { position: absolute; inset: 0; overflow: hidden; font-family: var(--cartoon); pointer-events: none; }
.intro-logo { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; white-space: nowrap; color: var(--jaune);
  font-size: min(13.5vw, 7vh);   /* « C🌍untrizz » tient dans un téléphone de 390 px */ letter-spacing: 1px; text-shadow: var(--ombre-titre); pointer-events: none; }
.intro-logo-l { display: inline-block; opacity: 0; }
.intro-logo-o { position: relative; display: inline-block; color: transparent; text-shadow: none; }
.intro-logo-terre { position: absolute; left: 50%; top: 58%; width: 0.66em; height: 0.66em; transform: translate(-50%, -50%); }
`;
// le style de base de la page (index.html : marges, hauteur de #root), tel quel
const BASE_CSS = /<style>([\s\S]*?)<\/style>/.exec(readFileSync(path.join(web, 'index.html'), 'utf8'))![1]!;
const lettres = (classe: string) => LOGO_LETTRES.slice(1).map((l) => `<span class="${classe}">${l}</span>`).join('');
// même arbre que le site : #root > .intro > .intro-logo (Intro.tsx) et #root > .accueil > h1 (Home.tsx, LogoTitle.tsx)
const PAGE = `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<link rel="stylesheet" href="/ui/theme.css"><link rel="stylesheet" href="/ui/home.css">
<style>${BASE_CSS}${LOGO_CSS}*, *::before, *::after { animation: none !important; transition: none !important; }</style></head>
<body><div id="root">
<div class="intro"><div class="intro-logo"><span class="intro-logo-l">${LOGO_LETTRES[0]}</span><span class="intro-logo-o">o<i class="intro-logo-terre"></i></span>${lettres('intro-logo-l')}</div></div>
<div class="accueil"><h1 class="accueil-titre logo-titre"><span class="logo-l">${LOGO_LETTRES[0]}</span><span class="logo-o">o<i class="logo-terre"></i></span>${lettres('logo-l')}</h1></div>
</div></body></html>`;
const FICHIERS: Record<string, { fichier: string; type: string }> = {
  '/ui/theme.css': { fichier: 'src/ui/theme.css', type: 'text/css' },
  '/ui/home.css': { fichier: 'src/ui/home.css', type: 'text/css' },
  '/fonts/chango-latin.woff2': { fichier: 'public/fonts/chango-latin.woff2', type: 'font/woff2' },
  '/fonts/chango-latin-ext.woff2': { fichier: 'public/fonts/chango-latin-ext.woff2', type: 'font/woff2' },
};

// mesure dans la page : du texte, pas une fonction (tsx y glisserait `__name`, inconnu de la page : ReferenceError)
const MESURE = `(() => {
  const boite = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
  const titre = (racine, lettre, terre) => {
    const el = document.querySelector(racine), o = boite(el.querySelector(terre));
    return { o: { x: o.x, y: o.y, r: o.w / 2 }, police: parseFloat(getComputedStyle(el).fontSize),
      lettres: [...el.querySelectorAll(lettre)].map((l) => { const b = boite(l); return { x: b.x, y: b.y }; }) };
  };
  return { logo: titre('.intro-logo', '.intro-logo-l', '.intro-logo-terre'), titre: titre('.accueil-titre', '.logo-l', '.logo-terre') };
})()`;

const arrondi = (v: number) => Math.round(v * 100) / 100;
/** px CSS de l'écran de référence → px de la vidéo : la vidéo le couvre en largeur, calée en haut (ou 1:1). */
function versVideo(t: Titre, e: number): Titre {
  const pt = (p: { x: number; y: number }) => ({ x: arrondi(p.x * e), y: arrondi(p.y * e) });
  return { o: { ...pt(t.o), r: arrondi(t.o.r * e) }, police: arrondi(t.police * e), lettres: t.lettres.map(pt) };
}

const navigateur = await chromium.launch();
const sortie = {} as Record<Cadrage, { logo: Titre; titre: Titre }>;
try {
  for (const cadrage of ['portrait', 'paysage'] as const) {
    const ref = REFERENCES[cadrage], video = CADRAGES[cadrage];
    // garde : l'écran de référence a exactement la largeur de la vidéo et tient dans sa hauteur (pas de décalage)
    if (Math.abs(ref.width * ref.echelle - video.width) > 1e-9 || ref.height * ref.echelle > video.height + 1e-9) {
      throw new Error(`REFERENCES.${cadrage} ne couvre pas la vidéo ${video.width}×${video.height}`);
    }
    const page = await navigateur.newPage({ viewport: { width: ref.width, height: ref.height } });
    await page.route(`${ORIGINE}/**`, (route) => {
      const chemin = new URL(route.request().url()).pathname, f = FICHIERS[chemin];
      if (chemin === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
      if (f) return route.fulfill({ contentType: f.type, body: readFileSync(path.join(web, f.fichier)) });
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`${ORIGINE}/`);
    const police = await page.evaluate("document.fonts.load('54px Chango', 'Countrizz').then((f) => f.map((x) => x.family + ':' + x.status))") as string[];
    if (police.length === 0 || police.some((p) => !p.endsWith(':loaded'))) throw new Error(`police Chango non chargée : ${JSON.stringify(police)}`);
    const m = await page.evaluate(MESURE) as { logo: Titre; titre: Titre };
    if (m.logo.lettres.length !== 8 || m.titre.lettres.length !== 8) throw new Error('8 lettres attendues par titre');
    sortie[cadrage] = { logo: versVideo(m.logo, ref.echelle), titre: versVideo(m.titre, ref.echelle) };
    console.error(`${cadrage} : écran ${ref.width}×${ref.height} → vidéo ${video.width}×${video.height}, police ${police.join(', ')}`);
    await page.close();
  }
} finally {
  await navigateur.close();
}
console.log(JSON.stringify(sortie, null, 2));
```

- [ ] **Step 4 : mesurer.** Run : `cd web && npx tsx scripts/intro/mesurer-titres.ts`. Expected : sur la sortie d'erreur

```text
portrait : écran 390×844 → vidéo 1080×2340, police Chango:loaded
paysage : écran 1920×1080 → vidéo 1920×1080, police Chango:loaded
```

puis, sur la sortie standard, un JSON `{ "portrait": { "logo": …, "titre": … }, "paysage": { … } }` dont les nombres sont exactement ceux du Step 5 (relevés au plan avec Playwright 1.63.0 / Chromium 153.0.8010.12 ; deux lancements donnent les mêmes octets ; 1 ou 3 px par px CSS donnent les mêmes nombres). Repère : le « o » du titre de l'accueil est à 144,44 px CSS du haut (sortie paysage, 1 px CSS = 1 px vidéo) ; en portrait, `titre.o.y` = 399,98 ≈ 144,44 × 1080/390 (vidéo calée en haut, D8). Si un nombre diffère, c'est la sortie du script qu'on recopie au Step 5, pas le plan. Sans la police (fichier introuvable), le script s'arrête en erreur (code 1) au lieu de mesurer une police de repli.

- [ ] **Step 5 : recopier la mesure.** Ajouter à la fin de `web/src/intro/cadrages.ts` (une ligne vide avant) :

```ts
export const TITRES: Record<Cadrage, { logo: Titre; titre: Titre }> = {
  portrait: {
    logo: { o: { x: 239.37, y: 1182.55, r: 48.09 }, police: 145.8,
      lettres: [{ x: 116.44, y: 1168.62 }, { x: 364.78, y: 1168.62 }, { x: 492.38, y: 1168.62 }, { x: 605.77, y: 1168.62 }, { x: 704.64, y: 1168.62 }, { x: 787.61, y: 1168.62 }, { x: 872.18, y: 1168.62 }, { x: 973.95, y: 1168.62 }] },
    titre: { o: { x: 231.84, y: 399.98, r: 49.33 }, police: 149.54,
      lettres: [{ x: 105.86, y: 386.85 }, { x: 360.41, y: 386.85 }, { x: 491.21, y: 386.85 }, { x: 607.44, y: 386.85 }, { x: 708.77, y: 386.85 }, { x: 793.82, y: 386.85 }, { x: 880.51, y: 386.85 }, { x: 984.83, y: 386.85 }] },
  },
  paysage: {
    logo: { o: { x: 805.42, y: 547.27, r: 24.95 }, police: 75.6,
      lettres: [{ x: 742.13, y: 540 }, { x: 870.02, y: 540 }, { x: 935.73, y: 540 }, { x: 994.09, y: 540 }, { x: 1044.91, y: 540 }, { x: 1087.5, y: 540 }, { x: 1130.92, y: 540 }, { x: 1183.27, y: 540 }] },
    titre: { o: { x: 848.72, y: 144.44, r: 17.81 }, police: 54,
      lettres: [{ x: 803.23, y: 139.7 }, { x: 895.15, y: 139.7 }, { x: 942.38, y: 139.7 }, { x: 984.35, y: 139.7 }, { x: 1020.95, y: 139.7 }, { x: 1051.66, y: 139.7 }, { x: 1082.96, y: 139.7 }, { x: 1120.63, y: 139.7 }] },
  },
};
```

- [ ] **Step 6 : geler la chronologie three.js.** L'intro en service (`Intro.tsx`, `scene.ts`) lit l'API actuelle (viewport quelconque, cibles mesurées dans la page, `spriteFrame`, `IPS`, `blur`, `label`…) que la v2 retire ; elle reste en service jusqu'au lecteur vidéo (Task 10). On la branche sur une copie gelée, sans changer son comportement. Run : `cp web/src/intro/timeline.ts web/src/intro/timeline-v1.ts`. Puis, dans `web/src/intro/timeline-v1.ts`, remplacer :

```ts
import * as THREE from 'three/webgpu';

/**
 * Chronologie de l'intro en pâte à modeler, en fonctions pures du temps. Déroulé validé par l'utilisateur le 10/10 :
```

par :

```ts
import * as THREE from 'three/webgpu';
import { LOGO_LETTRES, LOGO_TOUR_S } from './temps';

export { LOGO_LETTRES, LOGO_TOUR_S };

/**
 * GELÉE : chronologie de l'intro three.js, gardée telle quelle pour `scene.ts` et `Intro.tsx` jusqu'au lecteur vidéo,
 * qui les supprime avec elle (plan de l'intro vidéo, Task 10). La chronologie vivante est `timeline.ts`.
 *
 * Chronologie de l'intro en pâte à modeler, en fonctions pures du temps. Déroulé validé par l'utilisateur le 10/10 :
```

et remplacer :

```ts
export const POINT_RP = 0.0062, MAT_HM = 0.135, REPERE_ECHELLE = 1.6;
/** Le nom autour du « o » (la Terre) : « C », puis « untrizz ». */
export const LOGO_LETTRES = ['C', 'u', 'n', 't', 'r', 'i', 'z', 'z'] as const;
/** La petite Terre du titre de l'accueil fait un tour en 4 s (24 images, stop motion à 6 i/s). */
export const LOGO_TOUR_S = 4;
```

par :

```ts
export const POINT_RP = 0.0062, MAT_HM = 0.135, REPERE_ECHELLE = 1.6;
```

Dans `web/src/intro/scene.ts` (l. 7), remplacer :

```ts
import { MAT_HM, PARIS, POINT_RP, REPERE_ECHELLE, type IntroFrame, type Viewport } from './timeline';
```

par :

```ts
import { MAT_HM, PARIS, POINT_RP, REPERE_ECHELLE, type IntroFrame, type Viewport } from './timeline-v1';
```

Dans `web/src/intro/Intro.tsx` (l. 4-5), remplacer :

```ts
import { INTRO, LOGO_LETTRES, defaultTargets, frameAt, logoAngleAt, rebond, spriteFrame, type Target, type Targets, type Viewport } from './timeline';
import { LogoTitle } from '../ui/LogoTitle';
```

par :

```ts
import { INTRO, LOGO_LETTRES, defaultTargets, frameAt, logoAngleAt, rebond, spriteFrame, type Target, type Targets, type Viewport } from './timeline-v1';
import { INTRO_GIVE_UP_MS } from './temps';
import { LogoTitle } from '../ui/LogoTitle';
```

et supprimer ces deux lignes avec la ligne vide qui les suit (l. 13-15 ; la constante vit désormais dans `temps.ts`) :

```ts
/** Sans ses textures au bout de 8 s, l'intro est abandonnée : accueil direct sur le globe (spec intro §4). */
export const INTRO_GIVE_UP_MS = 8000;
```

Dans `web/src/ui/LogoTitle.tsx` (l. 2), remplacer :

```ts
import { LOGO_LETTRES, LOGO_TOUR_S } from '../intro/timeline';
```

par :

```ts
import { LOGO_LETTRES, LOGO_TOUR_S } from '../intro/temps';
```

- [ ] **Step 7 : rien n'a bougé.** Run : `cd web && npm run check`. Expected : PASS — tsc sans erreur, `Test Files  60 passed (60)`, `Tests  332 passed (332)` (l'ancien `timeline.test.ts` passe encore sur l'ancien `timeline.ts`).

- [ ] **Step 8 : tests de la chronologie v2.** Remplacer tout `web/src/intro/timeline.test.ts` par :

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { REFERENCES, TITRES } from './cadrages';
import { BULLES, BULLES_RANGE, CADRAGES, INTRO, LOGO_ANGLE_FIN, LOGO_LETTRES, type Bulle, type Cadrage } from './temps';
import { frameAt, logoAngleAt, type IntroFrame } from './timeline';
import { toVec } from '../geo/vec';

const CADRES: Cadrage[] = ['portrait', 'paysage'];
const T_SOL = INTRO.CHUTE + INTRO.D_CHUTE;
type Ecran = { width: number; height: number };

const cam = (c: IntroFrame['camera'], vp: Ecran) => {
  const k = new THREE.PerspectiveCamera(c.fov, vp.width / vp.height, 0.01, 100);
  k.position.fromArray(c.position);
  k.quaternion.fromArray(c.quaternion);
  k.updateMatrixWorld(true);
  return k;
};
const project = (k: THREE.PerspectiveCamera, vp: Ecran, p: readonly number[]) => {
  const v = new THREE.Vector3(p[0], p[1], p[2]).project(k);
  return [(v.x * 0.5 + 0.5) * vp.width, (-v.y * 0.5 + 0.5) * vp.height] as const;
};
/** Centre et rayon apparents de la Terre (sphère unité) à l'image, en px de la vidéo. */
function disque(f: IntroFrame, cadrage: Cadrage) {
  const vp = CADRAGES[cadrage], k = cam(f.camera, vp);
  const [x, y] = project(k, vp, [0, 0, 0]);
  const d = Math.hypot(...f.camera.position);
  const r = Math.tan(Math.asin(1 / d)) / Math.tan((f.camera.fov * Math.PI) / 360) * (vp.height / 2);
  return { x, y, r };
}
/** Ordonnée à l'image du point le plus bas d'une sphère de rayon `rayon` centrée sur la Terre (tangente exacte ; Terre sur l'axe vertical de l'image). */
function bas(f: IntroFrame, cadrage: Cadrage, rayon: number): number {
  const vp = CADRAGES[cadrage], k = cam(f.camera, vp);
  const c = new THREE.Vector3(0, 0, 0).applyMatrix4(k.matrixWorldInverse);
  const a = Math.atan2(c.y, -c.z) - Math.asin(Math.min(1, rayon / c.length()));
  return vp.height / 2 - (Math.tan(a) / Math.tan((f.camera.fov * Math.PI) / 360)) * (vp.height / 2);
}

describe('chronologie de l’intro vidéo (double dézoom du 10/10, chute de 2,4 s)', () => {
  it('au milieu (logo), la Terre est le « o » de C🌍untrizz mesuré pour chaque cadrage', () => {
    for (const c of CADRES) {
      const o = TITRES[c].logo.o, d = disque(frameAt(7.8, c), c);
      expect(Math.abs(d.x - o.x)).toBeLessThan(1);
      expect(Math.abs(d.y - o.y)).toBeLessThan(1);
      expect(Math.abs(d.r - o.r) / o.r).toBeLessThan(0.03);
    }
  });

  it('à la fin, la Terre est dans le « o » du titre de fin, pour chaque cadrage', () => {
    for (const c of CADRES) {
      const o = TITRES[c].titre.o, d = disque(frameAt(INTRO.FIN, c), c);
      expect(Math.abs(d.x - o.x)).toBeLessThan(1);
      expect(Math.abs(d.y - o.y)).toBeLessThan(1);
      expect(Math.abs(d.r - o.r) / o.r).toBeLessThan(0.03);
    }
  });

  it('les lettres du logo surgissent au premier dézoom (en px de la vidéo), s’envolent au rezoom', () => {
    for (const c of CADRES) {
      expect(frameAt(5.8, c).logo.every((l) => l.alpha === 0)).toBe(true);
      expect(frameAt(6.4, c).logo[0]!.dx).toBeCloseTo(-80 * REFERENCES[c].echelle, 9);   // le « C » part de 80 px CSS à gauche
      for (const l of frameAt(8.3, c).logo) {
        expect([l.alpha, l.echelle]).toEqual([1, 1]);
        expect(Math.abs(l.dx) + Math.abs(l.dy) + Math.abs(l.rot)).toBeLessThan(1e-9);
      }
      expect(frameAt(9.5, c).logo.every((l) => l.alpha === 0)).toBe(true);
    }
    expect(LOGO_LETTRES).toEqual(['C', 'u', 'n', 't', 'r', 'i', 'z', 'z']);
  });

  it('le titre de fin surgit comme celui de l’accueil (home.css .logo-l, valeurs relevées dans Chromium)', () => {
    const t0 = INTRO.ACCUEIL + 0.5;
    expect(frameAt(t0, 'paysage').titre.every((l) => l.alpha === 0 && l.echelle === 0)).toBe(true);
    // paysage : 1 px CSS = 1 px de la vidéo, police de 54 px ; lettre 0 à 0,06 s et 0,33 s, lettre 3 (0,27 s plus tard)
    const a = frameAt(t0 + 0.06, 'paysage').titre[0]!, b = frameAt(t0 + 0.33, 'paysage').titre[0]!;
    expect([a.echelle, a.dy, a.alpha]).toEqual([expect.closeTo(0.2977, 3), expect.closeTo(11.377, 2), expect.closeTo(0.773, 3)]);
    expect([b.echelle, b.dy, b.alpha]).toEqual([expect.closeTo(1.1473, 3), expect.closeTo(-2.386, 2), 1]);
    expect(frameAt(t0 + 0.27 + 0.06, 'paysage').titre[3]!.echelle).toBeCloseTo(0.2977, 3);
    for (const c of CADRES) {
      expect(frameAt(t0, c).titre[0]!.dy).toBeCloseTo(0.3 * TITRES[c].titre.police, 9);   // 0,3 em de la police mesurée
      for (const l of frameAt(t0 + 0.09 * 7 + 0.45 + 0.01, c).titre) expect([l.alpha, l.echelle, l.dy]).toEqual([1, 1, 0]);
    }
  });

  it('la chute part plus lentement qu’avant, puis accélère de plus en plus fort jusqu’à l’impact (position en v³)', () => {
    for (const c of CADRES) {
      const hy = CADRAGES[c].height / 844;
      // courbe du 10/10 : centre de −560 à 470 px de la scène 390 × 844, en v² sur 1,6 s
      const avant = (t: number) => -560 * hy + 1030 * hy * Math.min(1, Math.max(0, (t - 1.2) / 1.6)) ** 2;
      const y = (t: number) => disque(frameAt(t, c), c).y;
      for (let n = 1; n <= 48; n++) {
        expect(y(INTRO.CHUTE + n / 120) - y(INTRO.CHUTE + (n - 1) / 120)).toBeLessThan(avant(1.2 + n / 120) - avant(1.2 + (n - 1) / 120));
      }
      let v0 = 0, a0 = 0;
      for (let n = 1; INTRO.CHUTE + n / 120 <= T_SOL; n++) {
        const v = y(INTRO.CHUTE + n / 120) - y(INTRO.CHUTE + (n - 1) / 120), a = v - v0;
        expect(v).toBeGreaterThan(v0);   // la vitesse croît…
        expect(a).toBeGreaterThan(a0);   // …et l'accélération aussi : elle flotte, puis file
        v0 = v;
        a0 = a;
      }
      // l'impact n'est pas un saut : la première image du rebond bouge moins que la dernière de la chute
      expect(Math.abs(y(T_SOL + 1 / 120) - y(T_SOL))).toBeLessThan(Math.abs(y(T_SOL) - y(T_SOL - 1 / 120)));
    }
  });

  it('avant la chute, la Terre et ses nuages sont au-dessus de l’image ; elle y entre plus d’une seconde avant l’impact', () => {
    for (const c of CADRES) {
      for (const t of [0, INTRO.CHUTE]) {
        const f = frameAt(t, c);
        expect(bas(f, c, 1.33 * Math.max(f.squash.sx, f.squash.sy))).toBeLessThan(0);   // nuages : boules à 1,24 + leur taille
      }
      expect(bas(frameAt(T_SOL - 1, c), c, 1)).toBeGreaterThan(0);
    }
  });

  it('ronde quand elle flotte, allongée juste avant l’impact, puis écrasée sans saut (images à 1/120 s)', () => {
    for (const c of CADRES) {
      expect(Math.abs(frameAt(INTRO.CHUTE + 0.4, c).squash.sy - 1)).toBeLessThan(0.005);
      expect(frameAt(T_SOL - 1 / 120, c).squash.sy).toBeGreaterThan(1.1);
      let prev = frameAt(T_SOL - 0.5, c), min = 1;
      for (let n = 1; n <= 120; n++) {
        const f = frameAt(T_SOL - 0.5 + n / 120, c);
        expect(Math.abs(f.squash.sy - prev.squash.sy)).toBeLessThan(0.02);
        expect(Math.abs(f.squash.sx - prev.squash.sx)).toBeLessThan(0.02);
        min = Math.min(min, f.squash.sy);
        prev = f;
      }
      expect(min).toBeLessThan(0.92);
    }
  });

  it('toupie et rezoom : jamais plus de 2,16° de rotation entre deux images à 120 i/s', () => {
    let max = 0;
    for (let n = Math.round(INTRO.CHUTE * 120); n < 11.3 * 120; n++) {
      const a = new THREE.Quaternion().fromArray(frameAt(n / 120, 'portrait').camera.quaternion);
      const b = new THREE.Quaternion().fromArray(frameAt((n + 1) / 120, 'portrait').camera.quaternion);
      max = Math.max(max, a.angleTo(b));
    }
    expect(max * 180 / Math.PI).toBeLessThanOrEqual(2.16 + 0.05);
    expect(max * 180 / Math.PI).toBeGreaterThan(1.5);
  });

  it('aucun saut de caméra : la distance à la Terre varie continûment', () => {
    for (const c of CADRES) {
      let prev = frameAt(0, c);
      for (let t = 1 / 240; t <= INTRO.FIN; t += 1 / 240) {
        const f = frameAt(t, c);
        const d0 = Math.hypot(...prev.camera.position), d1 = Math.hypot(...f.camera.position);
        expect(Math.abs(d1 - d0) / d0).toBeLessThan(0.04);
        prev = f;
      }
    }
  });

  it('continuité aux bornes de phase : ni la Terre ni son écrasement ne sautent', () => {
    for (const c of CADRES) {
      for (const b of [INTRO.CHUTE, T_SOL, 5.8, 8.8, 16.4]) {   // chute, impact, premier dézoom, rezoom, second dézoom
        const f0 = frameAt(b - 1e-6, c), f1 = frameAt(b + 1e-6, c), d0 = disque(f0, c), d1 = disque(f1, c);
        expect(Math.hypot(d1.x - d0.x, d1.y - d0.y)).toBeLessThan(0.5);
        expect(Math.abs(d1.r - d0.r) / d0.r).toBeLessThan(1e-3);
        expect(Math.abs(f1.squash.sy - f0.squash.sy)).toBeLessThan(1e-3);
      }
    }
  });

  it('au gros plan, Paris est au centre de l’image, vers 51 % de la hauteur', () => {
    for (const c of CADRES) {
      const vp = CADRAGES[c], f = frameAt(13.8, c);
      const [x, y] = project(cam(f.camera, vp), vp, toVec([2.35, 48.86]));
      expect(Math.abs(x - vp.width / 2)).toBeLessThan((8 / 844) * vp.height);
      expect(Math.abs(y - (430 / 844) * vp.height)).toBeLessThan((25 / 844) * vp.height);
    }
  });

  it('après la chute, la Terre fait 115 px de rayon de la scène 390 × 844', () => {
    for (const c of CADRES) {
      const vp = CADRAGES[c], r = 115 * (Math.min(vp.width, vp.height / 2) / 390);
      expect(Math.abs(disque(frameAt(5.2, c), c).r - r) / r).toBeLessThan(0.045);
    }
  });

  it('enchaîne : point (10,8 s), frontière (11,5 s), drapeau (13,0 s), tout rangé 0,7 s après BULLES_RANGE', () => {
    const at = (t: number) => frameAt(t, 'portrait');
    expect(at(10.7).point.visible).toBe(false);
    expect(at(11.3).point.visible).toBe(true);
    expect(at(11.4).border).toBe(0);
    expect(at(12.3).border).toBeGreaterThan(0);
    expect(at(12.9).flag.visible).toBe(false);
    expect(at(13.4).flag.visible).toBe(true);
    const fin = at(BULLES_RANGE + 0.8);
    expect([fin.point.visible, fin.flag.visible, fin.border, fin.bead]).toEqual([false, false, 0, null]);
  });

  it('bulles : Capitale, Pays, Drapeau 0,3 s après leur objet, retournées dans le même ordre, rangées avec le reste', () => {
    const ordre: Bulle[] = ['capitale', 'pays', 'drapeau'];
    expect(Object.keys(BULLES)).toEqual(ordre);
    for (let i = 1; i < ordre.length; i++) {
      expect(BULLES[ordre[i]!].apparait).toBeGreaterThan(BULLES[ordre[i - 1]!].apparait);
      expect(BULLES[ordre[i]!].retourne).toBeGreaterThan(BULLES[ordre[i - 1]!].retourne);
    }
    expect(BULLES.capitale.retourne).toBeGreaterThan(BULLES.drapeau.apparait);   // elles se retournent quand les trois sont là
    expect(BULLES.drapeau.retourne).toBeLessThan(BULLES_RANGE);
    const objet: Record<Bulle, (f: IntroFrame) => boolean> = { capitale: (f) => f.point.visible, pays: (f) => f.border > 0, drapeau: (f) => f.flag.visible };
    for (const b of ordre) {
      const t = BULLES[b].apparait - 0.3;
      expect(objet[b](frameAt(t - 0.01, 'portrait'))).toBe(false);
      expect(objet[b](frameAt(t + 0.01, 'portrait'))).toBe(true);
      expect(objet[b](frameAt(BULLES_RANGE - 0.01, 'portrait'))).toBe(true);
      expect(objet[b](frameAt(BULLES_RANGE + 0.71, 'portrait'))).toBe(false);
    }
  });

  it('étoiles : 46 billes fixes (graine de l’intro du 10/10) dans l’image, qui surgissent entre 0,2 et 1,6 s', () => {
    for (const c of CADRES) {
      const { width: W, height: H } = CADRAGES[c], e = REFERENCES[c].echelle;
      const avant = frameAt(0.1, c).etoiles, apres = frameAt(2, c).etoiles;
      expect(apres).toHaveLength(46);
      expect(avant.every((s) => s.alpha === 0 && s.echelle === 0)).toBe(true);
      for (const s of apres) {
        expect(s.x - s.r).toBeGreaterThanOrEqual(0);
        expect(s.x - s.r).toBeLessThan(W);
        expect(s.y - s.r).toBeGreaterThanOrEqual(0);
        expect(s.y - s.r).toBeLessThan(H);
        expect(s.r).toBeGreaterThanOrEqual(0.75 * e);
        expect(s.r).toBeLessThanOrEqual(2.5 * e);
        expect(s.alpha).toBeGreaterThan(0);
        expect(s.alpha).toBeLessThanOrEqual(0.9);
      }
    }
    // la première bille du générateur d'Intro.tsx (graine 12345, × 16807 mod 2³¹ − 1) : diamètre 1,838 px CSS, bord
    // gauche à 83,4 % de la largeur, bord haut à 94,8 % de la hauteur
    const s0 = frameAt(2, 'portrait').etoiles[0]!;
    expect((s0.r * 2) / REFERENCES.portrait.echelle).toBeCloseTo(1.838158, 6);
    expect([(s0.x - s0.r) / 1080, (s0.y - s0.r) / 2340]).toEqual([expect.closeTo(0.833995, 6), expect.closeTo(0.947702, 6)]);
  });

  it('durée de la vidéo ≈ 20 s, dans les 20-25 s du 09/10 (à 1 s près) ; étapes dans l’ordre', () => {
    expect(INTRO.FIN).toBeGreaterThanOrEqual(20 - 1);
    expect(INTRO.FIN).toBeLessThanOrEqual(25);
    const etapes = [INTRO.CHUTE, T_SOL, INTRO.ACCUEIL, INTRO.FONDU, INTRO.FIN];
    expect(etapes).toEqual([...etapes].sort((a, b) => a - b));
  });

  it('l’angle de la Terre à la fin (LOGO_ANGLE_FIN) donne l’image de départ de la petite Terre animée du titre', () => {
    expect(Math.abs(LOGO_ANGLE_FIN - logoAngleAt(INTRO.FIN))).toBeLessThan(1e-12);
    expect(LOGO_ANGLE_FIN).toBeGreaterThanOrEqual(0);
    expect(LOGO_ANGLE_FIN).toBeLessThan(2 * Math.PI);
  });
});
```

- [ ] **Step 9 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit src/intro/timeline.test.ts`. Expected : FAIL — `Tests  15 failed | 2 passed (17)` (l'ancienne `frameAt` attend un viewport : `AssertionError: expected NaN to be less than 1`, `TypeError: frameAt(...).logo.every is not a function` ; seules la toupie et la durée passent).

- [ ] **Step 10 : la chronologie v2.** Remplacer tout `web/src/intro/timeline.ts` par :

```ts
import * as THREE from 'three/webgpu';
import { REFERENCES, TITRES } from './cadrages';
import { BULLES_RANGE, CADRAGES, INTRO, LOGO_LETTRES, LOGO_TOUR_S, type Cadrage } from './temps';

/**
 * Chronologie de l'intro en pâte à modeler, en fonctions pures du temps : la source unique des clés de la vidéo Blender
 * (spec `2026-10-11-countrizz-intro-video-blender-design.md` §2-3). Déroulé du 10/10 : la Terre tombe du ciel (lente au
 * départ, puis de plus en plus vite) et tourne ; un premier dézoom en fait le « o » de C🌍untrizz au milieu de l'image ;
 * rezoom vers la France (point, frontière, drapeau ; les bulles du site s'y posent) ; un second dézoom la loge dans le
 * « o » du titre de fin. La Terre en pâte est la sphère unité fixe à l'origine (repère du globe : lng 0 → +X,
 * lng 90 → −Z, pôle Nord → +Y) ; c'est la caméra qui bouge : la Terre est placée à l'image (centre, rayon en px de la
 * vidéo) par une caméra fixe de 20°, ramenée dans son repère. Deux cadrages (temps.ts) ; les deux « o » et les lettres
 * des titres sont mesurés une fois pour toutes (cadrages.ts). Longueurs du prototype : px d'une scène 390 × 844,
 * `U = min(largeur, ½ hauteur)`.
 */

export const PARIS: readonly [number, number] = [2.35, 48.86];
/** Repère posé à Paris : rayon de la bille, hauteur du mât (unités du repère, qui est grossi × 1,6). */
export const POINT_RP = 0.0062, MAT_HM = 0.135, REPERE_ECHELLE = 1.6;

export interface IntroCamera { position: [number, number, number]; quaternion: [number, number, number, number]; fov: number }
/**
 * Une lettre d'un titre, autour de son centre mesuré (cadrages.ts) : décalage (px de la vidéo), échelle, rotation (rad,
 * sens horaire à l'image, comme `rotate` en CSS) et opacité.
 */
export interface LettreAnim { dx: number; dy: number; echelle: number; rot: number; alpha: number }
export interface IntroFrame {
  /** Caméra dans le repère de la Terre (repère three, Y en haut), quaternion [x, y, z, w], champ vertical 20°. */
  camera: IntroCamera;
  /** Étirement de la Terre le long de l'axe vertical de l'image : allongée avant l'impact, écrasée après ; 1 = ronde. */
  squash: { sx: number; sy: number };
  /** Nuages : échelle (ils se retirent avant le premier dézoom) et rotation propre (rad). */
  clouds: { scale: number; spin: number };
  point: { visible: boolean; y: number; sxz: number; sy: number };
  /** Part de la frontière déroulée (0 → 1) ; `bead` : la perle au bout, visible pendant le déroulé. */
  border: number;
  bead: number | null;
  flag: { visible: boolean; sx: number; sy: number; y: number };
  /** Les 8 lettres du logo du milieu (ordre LOGO_LETTRES) : elles surgissent au premier dézoom, s'envolent au rezoom. */
  logo: LettreAnim[];
  /** Les 8 lettres du titre de fin : elles surgissent comme celles de l'accueil (home.css `.logo-l`), après ACCUEIL. */
  titre: LettreAnim[];
  /** Les 46 étoiles en billes : centre et rayon (px de la vidéo), opacité, échelle. */
  etoiles: { x: number; y: number; r: number; alpha: number; echelle: number }[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const s5 = (x: number) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const sortie = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
/** Dépassement puis retour (easeOutBack). */
export const rebond = (x: number, k = 1.9) => { x = clamp01(x) - 1; return 1 + (k + 1) * x * x * x + k * x * x; };
/** Oscillation amortie (0 en u = 0). */
const ressort = (u: number, f = 2.6, amort = 5) => (u <= 0 ? 0 : Math.exp(-amort * u) * Math.sin(2 * Math.PI * f * u));
const phase = (t: number, a: number, d: number) => (t - a) / d;
/** Hermite cubique : de (p0, pente v0) à (p1, pente v1) entre t0 et t1. */
function hermite(t: number, t0: number, t1: number, p0: number, p1: number, v0: number, v1: number): number {
  const d = t1 - t0, s = clamp01((t - t0) / d), s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * d * v0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * d * v1;
}
/** Courbe CSS `cubic-bezier(x1, y1, x2, y2)` : x résolu par Newton, puis par dichotomie s'il le faut. */
function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s, Y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const f = X(s) - x, d = dX(s);
      if (Math.abs(f) < 1e-9) return Y(s);
      if (Math.abs(d) < 1e-6) break;
      s -= f / d;
    }
    let a = 0, b = 1;
    s = x;
    while (b - a > 1e-9) { if (X(s) < x) a = s; else b = s; s = (a + b) / 2; }
    return Y(s);
  };
}
/** L'élan des entrées de l'accueil (home.css : `cubic-bezier(.25, .46, .45, 1.54)`). */
const ELAN = bezier(0.25, 0.46, 0.45, 1.54);
const RAD = Math.PI / 180;
const U0 = 390, H0 = 844;
interface Ecran { width: number; height: number }
interface Cible { x: number; y: number; r: number }
const unit = (vp: Ecran) => Math.min(vp.width, vp.height / 2) / U0;

// ---------- les étapes (s) : tout ce qui suit la chute de 2,4 s est décalé de +0,8 s (spec vidéo §3.1) ----------
const T_SOL = INTRO.CHUTE + INTRO.D_CHUTE;  // 3,6 : la Terre touche le sol
const DEZOOM1 = 5.8, D_DEZOOM1 = 1.4;       // premier dézoom : vers le « o » du logo
const LETTRES = 6.4, D_LETTRE = 0.45;       // les lettres du logo surgissent (0,09 s d'écart, 0,45 s chacune)
const REZOOM = 8.8, D_REZOOM = 2.0;         // rezoom vers la France
const T_POINT = 10.8, D_POINT = 0.42;       // le point tombe sur Paris
const T_LENT = 11.1;                        // gros plan : le disque grandit encore un peu, lentement, jusqu'au second dézoom
const T_FRONTIERE = 11.5, D_FRONTIERE = 1.5;   // la frontière se déroule
const T_DRAPEAU = 13.0, D_DRAPEAU = 0.9;    // le drapeau sort du point
const RETRAIT = BULLES_RANGE, D_RETRAIT = 0.7;   // le drapeau, la frontière et les bulles se rangent
const DEZOOM2 = 16.4, D_DEZOOM2 = INTRO.FONDU + 0.2 - DEZOOM2;   // second dézoom : vers le « o » du titre
const T_TITRE = INTRO.ACCUEIL + 0.5;        // lettres du titre : au rythme de celles de l'accueil, monté à ACCUEIL

// ---------- la toupie ----------
const BETA = 40 * RAD;                      // au gros plan, Paris est 40° au-dessus du centre du disque
const CIBLE = -Math.PI / 2 - PARIS[0] * RAD;
const W_MAX = 2 * Math.PI * 0.72;           // 0,72 tour/s au plus : 2,16° par image à 120 i/s
const W_LOGO = 0.3;                         // rotation lente pendant le logo (rad/s)
const W_TITRE = (2 * Math.PI) / LOGO_TOUR_S;
const T_FREIN = T_SOL + 0.8, T_LOGO = T_FREIN + 1.8;
const R3 = 0.6;                                         // reste à tourner au début du rezoom
const R2 = R3 + W_LOGO * (REZOOM - T_LOGO);
const R1 = R2 + ((W_MAX + W_LOGO) / 2) * (T_LOGO - T_FREIN);
/** Angle qui reste à tourner avant que Paris soit face à nous (rad). */
function resteAngle(t: number): number {
  if (t < T_FREIN) return R1 + W_MAX * (T_FREIN - t);
  if (t < T_LOGO) return hermite(t, T_FREIN, T_LOGO, R1, R2, -W_MAX, -W_LOGO);
  if (t < REZOOM) return R2 - W_LOGO * (t - T_LOGO);
  if (t < REZOOM + D_REZOOM) return hermite(t, REZOOM, REZOOM + D_REZOOM, R3, 0, -W_LOGO, 0);
  const wobble = -0.16 * ressort(Math.min(t, DEZOOM2) - REZOOM - D_REZOOM, 1.6, 4.5);
  if (t < DEZOOM2) return wobble;
  // vers le titre : elle se remet à tourner ; la vitesse monte en 1,2 s jusqu'à celle de la petite Terre du titre
  const u = t - DEZOOM2, RAMPE = 1.2;
  const tourne = u < RAMPE ? (W_TITRE * u * u) / (2 * RAMPE) : W_TITRE * (RAMPE / 2 + (u - RAMPE));
  return wobble - tourne;
}
/** 0 : axe incliné de 23,4°, vue de côté ; 1 : axe redressé, Paris 40° au-dessus du centre (gros plan). */
function redresse(t: number): number {
  if (t < DEZOOM2) return s5(phase(t, REZOOM, D_REZOOM));
  return 1 - s5(phase(t, DEZOOM2, D_DEZOOM2));
}
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
function orientation(t: number, out = new THREE.Quaternion()): THREE.Quaternion {
  const k = redresse(t);
  const qa = new THREE.Quaternion().setFromAxisAngle(AZ, -23.4 * RAD * (1 - k));
  const qb = new THREE.Quaternion().setFromAxisAngle(AX, (PARIS[1] * RAD - BETA) * k);
  const qc = new THREE.Quaternion().setFromAxisAngle(AY, CIBLE - resteAngle(t) - (1 - k) * 0.35);
  return out.copy(qa).multiply(qb).multiply(qc);
}
/**
 * Angle de la Terre (rotation autour de son axe incliné, dans [0, 2π[) : la petite Terre animée du titre part de
 * l'image qui lui correspond (ses 24 images couvrent un tour, `Z(−23,4°)·Y(angle)`).
 */
export function logoAngleAt(t: number): number {
  const a = CIBLE - resteAngle(t) - 0.35;
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

// ---------- où est la Terre à l'image ----------
const R_LOIN = 115, R_PRES = 507, CY_LOIN = 470, PARIS_Y = 430;
/**
 * La chute : rayon au départ (× celui d'arrivée), hauteur de départ (en rayons au-dessus du bord haut : nuages compris,
 * rien ne dépasse dans l'image), allongement à l'impact (il suit la vitesse, en v²).
 */
const R_CHUTE = 2.3, HORS_CADRE = 1.4, ALLONGE = 0.12;
/** L'impact : l'allongement se mue en écrasement sans saut (pente de départ en 1/s, fréquence en Hz, amortissement en 1/s). */
const PENTE_IMPACT = 2.0, F_IMPACT = 1.8, AMORTI = 3;
/** Largeur à l'impact : `sx = 1 − LARGE·(sy − 1)` (la pâte s'étale quand elle s'écrase). */
const LARGE = 0.7;
/** Écart à la forme ronde (`sy − 1`) après l'impact (`w` en s) : part de l'allongement de la chute, oscille, s'amortit. */
function ecartImpact(w: number): number {
  const om = 2 * Math.PI * F_IMPACT, b = (AMORTI * ALLONGE - PENTE_IMPACT) / om;
  return Math.exp(-AMORTI * w) * (ALLONGE * Math.cos(om * w) + b * Math.sin(om * w));
}
interface Placement { cx: number; cy: number; R: number; sx: number; sy: number }
function placement(t: number, vp: Ecran, c: { logo: Cible; titre: Cible }): Placement {
  const u = unit(vp), hy = vp.height / H0;
  const rl = R_LOIN * u, rp = R_PRES * u, cyl = CY_LOIN * hy, cx0 = vp.width / 2;
  if (t < T_SOL) {                                  // elle tombe du ciel : grande, presque en flottant, puis de plus en plus vite
    const v = clamp01(phase(t, INTRO.CHUTE, INTRO.D_CHUTE)), v3 = v * v * v, e = ALLONGE * v * v;
    const R0 = rl * R_CHUTE;
    // le centre arrive là où le bas de la Terre allongée touche le sol (comme après l'impact)
    return { cx: cx0, cy: lerp(-HORS_CADRE * R0, cyl - rl * ALLONGE, v3), R: lerp(R0, rl, v3), sx: 1 - LARGE * e, sy: 1 + e };
  }
  if (t < DEZOOM1) {                                // l'impact : elle s'écrase, rebondit, se calme
    const w = t - T_SOL, e = ecartImpact(w);
    const cy = cyl - 20 * hy * Math.max(0, Math.sin(Math.PI * clamp01(w / 0.42))) * (1 - clamp01(w / 0.42) * 0.3) - rl * e;
    return { cx: cx0, cy, R: rl, sx: 1 - LARGE * e, sy: 1 + e };
  }
  if (t < REZOOM) {                                 // premier dézoom : elle devient le « o » du logo
    const z = s5(phase(t, DEZOOM1, D_DEZOOM1));
    return { cx: lerp(cx0, c.logo.x, z), cy: lerp(cyl, c.logo.y, z), R: rl * Math.pow(c.logo.r / rl, z), sx: 1, sy: 1 };
  }
  // rezoom : Paris glisse vers sa place, le disque grandit autour (l'horizon reste visible)
  const proche = (tt: number) => {
    const z = s5(phase(tt, REZOOM, D_REZOOM)), lent = 1 + 0.035 * clamp01(phase(Math.min(tt, DEZOOM2), T_LENT, DEZOOM2 - T_LENT));
    const R = c.logo.r * Math.pow((rp / c.logo.r) * lent, z);
    const parisY = lerp(c.logo.y, PARIS_Y * hy, z);
    return { cx: lerp(c.logo.x, cx0, z), cy: parisY + R * Math.sin(BETA) * redresse(tt), R };
  };
  if (t < DEZOOM2) return { ...proche(t), sx: 1, sy: 1 };
  // second dézoom : vers le « o » du titre de fin
  const a = proche(DEZOOM2), z = s5(phase(t, DEZOOM2, D_DEZOOM2));
  return { cx: lerp(a.cx, c.titre.x, z), cy: lerp(a.cy, c.titre.y, z), R: a.R * Math.pow(c.titre.r / a.R, z), sx: 1, sy: 1 };
}

/** Caméra fixe de 20° ramenée dans le repère de la Terre : position Q⁻¹(−T)/R, orientation Q⁻¹. */
const FOV = 20, PROF = 12;
function cameraFrom(p: { cx: number; cy: number; R: number }, q: THREE.Quaternion, vp: Ecran): IntroCamera {
  const k = PROF * Math.tan((FOV * RAD) / 2) / (vp.height / 2);   // px → unités du monde à la profondeur PROF
  const T = new THREE.Vector3((p.cx - vp.width / 2) * k, -(p.cy - vp.height / 2) * k, -PROF);
  const qi = q.clone().invert();
  const pos = T.clone().multiplyScalar(-1 / (p.R * k)).applyQuaternion(qi);
  return { position: pos.toArray() as [number, number, number], quaternion: qi.toArray() as [number, number, number, number], fov: FOV };
}

// ---------- les lettres et les étoiles (px de la vidéo) ----------
/**
 * Logo du milieu (formules de l'intro three.js du 10/10, en px CSS de l'écran de référence, × `e`) : « C » arrive de la
 * gauche, « untrizz » lettre après lettre en tournant, chacune avec élan ; tout s'envole au rezoom.
 */
function lettresLogo(t: number, e: number): LettreAnim[] {
  const out = clamp01(phase(t, REZOOM, 0.5));
  return LOGO_LETTRES.map((_, i) => {
    const p = clamp01(phase(t, LETTRES + 0.09 * i, D_LETTRE)), k = rebond(p, 2.2), alpha = Math.min(1, p * 3) * (1 - out);
    if (i === 0) return { dx: (-80 * (1 - k) - 260 * out) * e, dy: 0, echelle: 1, rot: 0, alpha };
    return { dx: (60 + 25 * i) * out * e, dy: 30 * (1 - k) * e, echelle: Math.max(0.01, k), rot: (1 - k) * (i % 2 ? 12 : -12) * RAD, alpha };
  });
}
/**
 * Titre de fin : l'animation des lettres de l'accueil (home.css `.logo-l` : 0,45 s, retard 0,5 s + 0,09 s·i ; depuis
 * `translateY(.3em) scale(0)` avec l'élan ; opacité de 0 à 1 sur les premiers 40 %, avec l'élan, bornée à 1).
 */
function lettresTitre(t: number, police: number): LettreAnim[] {
  return LOGO_LETTRES.map((_, i) => {
    const p = clamp01(phase(t, T_TITRE + 0.09 * i, D_LETTRE)), k = ELAN(p);
    return { dx: 0, dy: 0.3 * police * (1 - k), echelle: k, rot: 0, alpha: clamp01(ELAN(p / 0.4)) };
  });
}
/** Étoiles en billes, toujours les mêmes (graine fixe) : diamètre 1,5 à 5 px CSS, position en part de l'image, entrée 0,2 à 1,6 s. */
const BILLES = (() => {
  let g = 12345;
  const a = () => (g = (g * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 46 }, () => {
    const d = 1.5 + a() * 3.5, x = a(), y = a();
    return { d, x, y, debut: 0.2 + a() * 1.4, phase: a() * 6 };
  });
})();
function etoiles(t: number, vp: Ecran, e: number): IntroFrame['etoiles'] {
  return BILLES.map((b) => {
    const u = (t - b.debut) / 0.35, r = (b.d * e) / 2;   // bord gauche et haut posés en %, comme en CSS : le centre est à + r
    return { x: b.x * vp.width + r, y: b.y * vp.height + r, r, alpha: clamp01(u) * (0.55 + 0.35 * Math.sin(b.phase + t * 2.1)),
      echelle: u <= 0 ? 0 : Math.min(1.3, 1 + 0.3 * Math.sin(Math.min(1, u) * Math.PI)) };
  });
}

export function frameAt(t: number, cadrage: Cadrage): IntroFrame {
  const vp = CADRAGES[cadrage], titres = TITRES[cadrage];
  const p = placement(t, vp, { logo: titres.logo.o, titre: titres.titre.o });
  const retrait = 1 - s5(phase(t, RETRAIT, D_RETRAIT));

  // le point tombe sur Paris, s'écrase en pastille et y reste : le drapeau en sortira
  const ue = phase(t, T_POINT, D_POINT), pose = T_POINT + D_POINT;
  let point: IntroFrame['point'] = { visible: false, y: 0, sxz: 0, sy: 0 };
  if (ue >= 0 && retrait > 0.01) {
    const chute = clamp01(ue), o = ue > 1 ? ressort(t - pose, 2.6, 5.5) : 0, tasse = ue > 1 ? s5((t - pose) / 0.5) : 0;
    const sy = (chute < 1 ? 1.25 : 1) * (1 - 0.42 * tasse) * (1 - 0.3 * o), sxz = (chute < 1 ? 0.85 : 1) * (1 + 0.3 * tasse) * (1 + 0.22 * o);
    point = { visible: true, y: POINT_RP * sy * 0.8 + 0.5 * (1 - chute * chute), sxz: POINT_RP * sxz * retrait, sy: POINT_RP * sy * retrait };
  }
  const f = clamp01(phase(t, T_FRONTIERE, D_FRONTIERE));
  const border = retrait > 0.01 ? sortie(f) * retrait : 0;
  const ud = phase(t, T_DRAPEAU, D_DRAPEAU);
  let flag: IntroFrame['flag'] = { visible: false, sx: 0, sy: 0, y: 0 };
  if (ud >= 0 && retrait > 0.01) {
    const o = ressort(ud, 2.2, 4.5), grand = sortie(ud * 2.2), D = 0.5 * retrait;
    flag = { visible: true, sx: grand * (1 - 0.18 * o) * D, sy: grand * (1 + 0.32 * o) * D, y: POINT_RP * 0.45 };
  }

  return {
    camera: cameraFrom(p, orientation(t), vp),
    squash: { sx: p.sx, sy: p.sy },
    clouds: { scale: Math.max(0.0001, 1 - s5(phase(t, DEZOOM1 - 0.3, 0.8))), spin: t * 0.16 },
    point,
    border,
    bead: f > 0 && f < 1 && retrait > 0.01 ? sortie(f) : null,
    flag,
    logo: lettresLogo(t, REFERENCES[cadrage].echelle),
    titre: lettresTitre(t, titres.titre.police),
    etoiles: etoiles(t, vp, REFERENCES[cadrage].echelle),
  };
}
```

- [ ] **Step 11 : vérifier.** Run : `cd web && npx vitest run --project unit src/intro/timeline.test.ts`. Expected : PASS — `Tests  17 passed (17)`.

- [ ] **Step 12 : suite complète.** Run : `cd web && npm run check`. Expected : PASS — tsc sans erreur, `Test Files  60 passed (60)`, `Tests  339 passed (339)`.

- [ ] **Step 13 : commit.**

```bash
git add web/src/intro/temps.ts web/src/intro/cadrages.ts web/scripts/intro/mesurer-titres.ts web/src/intro/timeline-v1.ts web/src/intro/timeline.ts web/src/intro/timeline.test.ts web/src/intro/Intro.tsx web/src/intro/scene.ts web/src/ui/LogoTitle.tsx
git commit -m "intro : chronologie v2 de la vidéo (chute de 2,4 s en v³ sans saut à l’impact, deux cadrages, titres mesurés, lettres et étoiles en px vidéo) — spec intro vidéo §2-3"
```

---

### Task 2 : Sources de la fabrique (peintures, hauteur et relief fin en 16 bits, frontière, repères)

**Files:**
- Create: `web/scripts/intro/lib/terre.ts` (géométrie partagée par la fabrique : hauteur, frontière, repères ; ni fichier ni sharp)
- Create: `web/scripts/intro/lib/peinture.ts` (le corps de `build-intro.ts`, paramétré, flous en degrés)
- Create: `web/scripts/intro/sources.ts`
- Test: `web/scripts/intro/__tests__/unit/terre.test.ts`, `web/scripts/intro/__tests__/unit/peinture.test.ts` (créés)
- Modify: `web/vitest.config.ts:10`, `web/package.json:29`, `.gitignore:6`, `web/src/intro/boxes.ts:1` (commentaire seulement : `scene.ts` la lit jusqu'à la Task 10, qui supprime les deux)
- Delete: `web/scripts/intro/build-intro.ts`

**Interfaces:**
- Consumes : `PARIS` (`web/src/intro/timeline.ts`, Task 1) ; `toVec` (`web/src/geo/vec.ts`) ; `TEXTURE_SOURCES` (`scripts/textures/config.ts`), `NE_COUNTRIES`, `TEX_CACHE_DIR` (`scripts/textures/paths.ts`) ; les caches `scripts/textures/.cache/gebco08-elev-21600.tif`, `scripts/textures/.cache/bmng-200407-21600.png` (`npm run textures:fetch`) et `scripts/geodata/.cache/ne_10m_admin_0_countries.geojson` (`npm run geodata:fetch`).
- Produces :
  - `lib/terre.ts` : `HAUTEUR_MAX = 0.0945` ; `hauteurDe(terre: number, altitude: number): number` (formule de scene.ts:92-95) ; `interface Gris16 { w: number; h: number; d: Uint16Array }` ; `hauteurA(g: Gris16, lng: number, lat: number): number` ; `FRONTIERE_DECOLLE = 0.0034` ; `FRONTIERE_SEGMENTS = 2600` ; `courbeFrontiere(france: [number, number][], hauteur: (lng: number, lat: number) => number): THREE.CatmullRomCurve3` ; `pointsFrontiere(courbe: THREE.CatmullRomCurve3): [number, number, number][]` (2601 points, le dernier = le premier) ; `surFrontiere(points, u: number): [number, number, number]` ; `interface Reperes { paris: [number, number, number]; frontiereMilieu: [number, number, number] }` ; `reperes(points, hauteur): Reperes`.
  - `lib/peinture.ts` : `interface Box`, `MONDE`, `INTRO_EUROPE` (déménagé de `src/intro/boxes.ts`), `FLOUS` (degrés), `sigmaPx(deg: number, pxDeg: number): number`, `type Pays`, `lirePays(fichier?: string): Pays`, `peindre(pays, b, W, H): Promise<Sharp>`, `reliefFin(b, W, H): Promise<{ img: Sharp; S: number }>`, `hauteur(pays, W, H): Promise<Uint16Array>`, `france(pays): [number, number][]`.
  - `npm run intro:sources` → `web/scripts/intro/.cache/sources/` (ignoré par git, régénérable), lu par `export-keys.ts` (Task 3) et la scène Blender (Tasks 4-5). Images équirectangulaires : ligne 0 au nord et colonne 0 à l'ouest de leur boîte, centres des pixels en (i + 0,5) :
    - `monde.png` : 8192 × 4096, RGB 8 bits, couleur sRGB (lng −180 → 180, lat 90 → −90) ;
    - `europe.png` : 4200 × 3120, RGB 8 bits, sRGB, boîte `INTRO_EUROPE` (lng −25 → 45, lat 72 → 20) à 60 px/° ; scene.ts:131-137 la fondait sur le monde sur 3° aux bords de la boîte ;
    - `hauteur.png` : 8192 × 4096, gris 16 bits, donnée (Non-Color) : hauteur du relief = v / 65535 · `hauteurMax` en rayons terrestres ; la surface est au rayon 1 + hauteur ;
    - `relief-fin.png` : 4200 × 3120, gris 16 bits, donnée, boîte `INTRO_EUROPE` : détail = `reliefFinS` · atanh(2 v / 65535 − 1) en rayons terrestres (v = 32767,5 : rien) ; scene.ts:139 l'appliquait en bump d'intensité 4 ;
    - `sources.json` : `{ hauteurMax, reliefFinS, europe: { lng0, lng1, lat0, lat1 } }` ;
    - `france.json` : `[lng, lat][]`, 1153 points (les mêmes octets que `public/intro/france.json`) ;
    - `frontiere.json` : 2601 points `[x, y, z]` du repère three de la Terre, les sommets mêmes du boudin de three (`getPointAt(i / 2600)`) ; la Task 5 en fait la spline de la frontière (règles à la Task 3) ;
    - `reperes.json` : `{ paris, frontiereMilieu }`, repère three, sur la surface déplacée : Paris = direction de `PARIS` × (1 + hauteur) (le repère du point et du drapeau, scene.ts:164) ; milieu de la frontière = `frontiere[1300]`.

- [ ] **Step 1 : motif des tests de la fabrique.** Dans `web/vitest.config.ts` (l. 10), remplacer :

```ts
          include: ['src/**/*.test.ts', 'scripts/geodata/__tests__/unit/**/*.test.ts', 'scripts/textures/__tests__/unit/**/*.test.ts', 'scripts/imagery/__tests__/unit/**/*.test.ts'],
```

par :

```ts
          include: ['src/**/*.test.ts', 'scripts/geodata/__tests__/unit/**/*.test.ts', 'scripts/textures/__tests__/unit/**/*.test.ts', 'scripts/imagery/__tests__/unit/**/*.test.ts', 'scripts/intro/__tests__/unit/**/*.test.ts'],
```

- [ ] **Step 2 : tests de la géométrie.** Créer `web/scripts/intro/__tests__/unit/terre.test.ts` (sans les caches : GitHub lance `check`) :

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { angleBetween, toVec } from '../../../../src/geo/vec';
import { PARIS } from '../../../../src/intro/timeline';
import { FRONTIERE_SEGMENTS, HAUTEUR_MAX, courbeFrontiere, hauteurA, hauteurDe, pointsFrontiere, reperes, surFrontiere, type Gris16 } from '../../lib/terre';

/** La formule de scene.ts:92-95, telle quelle. */
const sceneTs = (terre: number, altitude: number) => THREE.MathUtils.smoothstep(terre, 0.3, 0.72) * (0.0045 + 0.09 * Math.pow(Math.sqrt(altitude), 2.4));
const uni = (v: number, w = 360, h = 180): Gris16 => ({ w, h, d: new Uint16Array(w * h).fill(v) });
/** Un petit anneau autour de la France, son point le plus au nord en 4ᵉ position. */
const ANNEAU: [number, number][] = [[-4, 48], [-1, 43], [3, 42.5], [7, 44], [8, 48.5], [3, 51], [-1, 49.5]];

describe('hauteur du relief en pâte', () => {
  it('même formule que scene.ts (terre adoucie × socle + altitude caricaturée)', () => {
    for (const terre of [0, 0.2, 0.3, 0.31, 0.5, 0.71, 0.72, 0.9, 1])
      for (const alt of [0, 0.01, 0.25, 0.5, 0.99, 1]) expect(hauteurDe(terre, alt)).toBeCloseTo(sceneTs(terre, alt), 15);
  });

  it('HAUTEUR_MAX est la plus grande hauteur ; la mer vaut 0', () => {
    expect(HAUTEUR_MAX).toBeCloseTo(0.0945, 15);
    expect(hauteurDe(1, 1)).toBeCloseTo(HAUTEUR_MAX, 15);
    expect(hauteurDe(0.3, 1)).toBe(0);
  });

  it('lue dans le gris 16 bits : v / 65535 · HAUTEUR_MAX, bilinéaire, raccord au méridien 180', () => {
    expect(hauteurA(uni(65535), 2.35, 48.86)).toBeCloseTo(HAUTEUR_MAX, 12);
    const g = uni(0, 4, 2);
    g.d[0] = 65535; g.d[4] = 65535;   // colonne 0 (−180° → −90°) à 1, les autres à 0
    expect(hauteurA(g, -135, 0)).toBeCloseTo(HAUTEUR_MAX, 12);   // centre du pixel
    expect(hauteurA(g, 180, 0)).toBeCloseTo(HAUTEUR_MAX / 2, 12);   // à mi-chemin des colonnes 3 et 0
    expect(hauteurA(g, -180, 0)).toBeCloseTo(HAUTEUR_MAX / 2, 12);
  });
});

describe('frontière et repères des bulles', () => {
  const h = (lng: number, lat: number) => hauteurA(uni(32768), lng, lat);   // relief uniforme : 0,047 25

  it('la frontière part du point le plus au nord, au rayon 1 + hauteur + 0,0034, et se referme', () => {
    const p = pointsFrontiere(courbeFrontiere(ANNEAU, h));
    expect(p).toHaveLength(FRONTIERE_SEGMENTS + 1);
    expect(angleBetween(p[0]!, toVec([3, 51]))).toBeLessThan(1e-12);
    expect(Math.hypot(...p[0]!)).toBeCloseTo(1 + h(3, 51) + 0.0034, 12);
    for (let k = 0; k < 3; k++) expect(p.at(-1)![k]).toBeCloseTo(p[0]![k]!, 12);
  });

  it('surFrontiere : part 0,5 = le point du milieu ; entre deux points, la corde', () => {
    const p = pointsFrontiere(courbeFrontiere(ANNEAU, h));
    expect(surFrontiere(p, 0.5)).toEqual(p[FRONTIERE_SEGMENTS / 2]);
    const m = surFrontiere(p, 10.5 / FRONTIERE_SEGMENTS);
    for (let k = 0; k < 3; k++) expect(m[k]).toBeCloseTo((p[10]![k]! + p[11]![k]!) / 2, 12);
    expect(surFrontiere(p, 1)).toEqual(p.at(-1));
  });

  it('Paris : la bonne direction, posé sur la surface déplacée (rayon 1 + hauteur > 1)', () => {
    const r = reperes(pointsFrontiere(courbeFrontiere(ANNEAU, h)), h);
    expect(angleBetween(r.paris, toVec([PARIS[0], PARIS[1]]))).toBeLessThan(1e-12);
    expect(Math.hypot(...r.paris)).toBeCloseTo(1 + h(PARIS[0], PARIS[1]), 12);
    expect(Math.hypot(...r.paris)).toBeGreaterThan(1);
  });

  it('le milieu de la frontière est son point d’indice SEGMENTS / 2', () => {
    const p = pointsFrontiere(courbeFrontiere(ANNEAU, h));
    expect(reperes(p, h).frontiereMilieu).toEqual(p[FRONTIERE_SEGMENTS / 2]);
  });
});
```

- [ ] **Step 3 : tests des flous.** Créer `web/scripts/intro/__tests__/unit/peinture.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { FLOUS, INTRO_EUROPE, sigmaPx } from '../../lib/peinture';

describe('flous de la peinture, en degrés', () => {
  it('rendent les pixels de build-intro.ts à la définition où ils étaient réglés', () => {
    expect(sigmaPx(FLOUS.cote, 8192 / 360)).toBeCloseTo(0.6, 12);   // masque, monde.jpg peint à 8192 px
    expect(FLOUS.reliefFin * 24).toBeCloseTo(1.2, 12);                // relief-fin.jpg à 24 px/°
    expect(sigmaPx(FLOUS.altitude, 1024 / 360)).toBeCloseTo(0.7, 12); // relief.jpg, canal R
    expect(sigmaPx(FLOUS.terre, 1024 / 360)).toBeCloseTo(1.6, 12);    // relief.jpg, canal G
  });

  it('grandissent avec la définition (même aspect à 60 px/° et à 8192 px)', () => {
    expect(sigmaPx(FLOUS.cote, 60)).toBeCloseTo(1.5820, 4);
    expect(FLOUS.reliefFin * 60).toBeCloseTo(3, 12);
    expect(sigmaPx(FLOUS.altitude, 8192 / 360)).toBeCloseTo(5.6, 12);
    expect(sigmaPx(FLOUS.terre, 8192 / 360)).toBeCloseTo(12.8, 12);
  });

  it('jamais sous 0,3 px (le minimum de sharp)', () => {
    expect(sigmaPx(FLOUS.cote, 1)).toBe(0.3);
  });

  it('boîte de l’Europe : 4200 × 3120 px à 60 px/°', () => {
    expect([(INTRO_EUROPE.lng1 - INTRO_EUROPE.lng0) * 60, (INTRO_EUROPE.lat1 - INTRO_EUROPE.lat0) * 60]).toEqual([4200, 3120]);
  });
});
```

- [ ] **Step 4 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit`. Expected : FAIL —

```text
 FAIL  |unit| scripts/intro/__tests__/unit/peinture.test.ts [ scripts/intro/__tests__/unit/peinture.test.ts ]
Error: Cannot find module '../../lib/peinture' imported from …/web/scripts/intro/__tests__/unit/peinture.test.ts
 FAIL  |unit| scripts/intro/__tests__/unit/terre.test.ts [ scripts/intro/__tests__/unit/terre.test.ts ]
Error: Cannot find module '../../lib/terre' imported from …/web/scripts/intro/__tests__/unit/terre.test.ts
 Test Files  2 failed (2)
      Tests  no tests
```

- [ ] **Step 5 : géométrie de la Terre.** Créer `web/scripts/intro/lib/terre.ts` :

```ts
import * as THREE from 'three';
import { toVec } from '../../../src/geo/vec';
import { PARIS } from '../../../src/intro/timeline';

/**
 * Géométrie de la Terre en pâte, partagée par la fabrique (sources.ts, export-keys.ts) : la hauteur du relief, la
 * frontière de la France et les repères des bulles. Mêmes formules que la scène three.js de l'intro (`src/intro/scene.ts`),
 * dans son repère : sphère unité, lng 0 → +X, lng 90 → −Z, pôle Nord → +Y. Rien n'est lu sur le disque ici.
 */

/** Hauteur la plus grande (rayons terrestres) : socle 0,0045 plus le relief caricaturé à l'altitude maximale. */
export const HAUTEUR_MAX = 0.0045 + 0.09;

/**
 * Hauteur du relief en pâte (rayons terrestres), formule de `scene.ts:92-95` : la terre adoucie (masque flouté, 0 → 1)
 * passée par `smoothstep(0,3 ; 0,72)`, fois le socle plus l'altitude (0 → 1) caricaturée par `√e^2,4`.
 */
export function hauteurDe(terre: number, altitude: number): number {
  const k = Math.max(0, Math.min(1, (terre - 0.3) / (0.72 - 0.3)));   // THREE.MathUtils.smoothstep(terre, 0.3, 0.72)
  return k * k * (3 - 2 * k) * (0.0045 + 0.09 * Math.pow(Math.sqrt(altitude), 2.4));
}

/** Image équirectangulaire en niveaux de gris 16 bits (ligne 0 = 90° N, colonne 0 = 180° O). */
export interface Gris16 { w: number; h: number; d: Uint16Array }

/**
 * Hauteur (rayons terrestres) lue dans `hauteur.png` (valeur 16 bits × HAUTEUR_MAX / 65535) : bilinéaire, centres des
 * pixels en (i + 0,5), comme `echantillon` de scene.ts et la texture « Linear » de Blender ; le méridien 180 se raccorde.
 */
export function hauteurA(g: Gris16, lng: number, lat: number): number {
  const x = ((lng + 180) / 360) * g.w - 0.5, y = ((90 - lat) / 180) * g.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.max(0, Math.min(g.h - 1, Math.floor(y))), y1 = Math.min(g.h - 1, y0 + 1);
  const fx = x - x0, fy = Math.max(0, Math.min(1, y - y0));
  const p = (xx: number, yy: number) => g.d[yy * g.w + (((xx % g.w) + g.w) % g.w)]!;
  const v = (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x0 + 1, y1) * fx) * fy;
  return (v / 65535) * HAUTEUR_MAX;
}

const vec = (lng: number, lat: number, r: number) => new THREE.Vector3(...toVec([lng, lat])).multiplyScalar(r);

/** Le boudin de la frontière flotte 0,0034 au-dessus du relief (scene.ts:184). */
export const FRONTIERE_DECOLLE = 0.0034;
/** Segments du boudin (TubeGeometry de scene.ts:185) : la frontière exportée a FRONTIERE_SEGMENTS + 1 points. */
export const FRONTIERE_SEGMENTS = 2600;

/**
 * La frontière de la France comme scene.ts:182-184 : l'anneau `[lng, lat][]` recommencé à son point le plus au nord,
 * courbe de Catmull-Rom centripète FERMÉE au rayon 1 + hauteur + 0,0034.
 */
export function courbeFrontiere(france: [number, number][], hauteur: (lng: number, lat: number) => number): THREE.CatmullRomCurve3 {
  let depart = 0;
  france.forEach(([, la], i) => { if (la > france[depart]![1]) depart = i; });
  const anneau = [...france.slice(depart), ...france.slice(0, depart)];
  return new THREE.CatmullRomCurve3(anneau.map(([lng, lat]) => vec(lng, lat, 1 + hauteur(lng, lat) + FRONTIERE_DECOLLE)), true, 'centripetal');
}

/**
 * Les points du boudin tel que three le dessine : `getPointAt(i / FRONTIERE_SEGMENTS)`, i = 0 … FRONTIERE_SEGMENTS (le
 * dernier = le premier, la boucle est fermée). La part `border` de la frontière s'arrête à l'indice `border · SEGMENTS`.
 */
export function pointsFrontiere(courbe: THREE.CatmullRomCurve3): [number, number, number][] {
  return courbe.getSpacedPoints(FRONTIERE_SEGMENTS).map((p) => [p.x, p.y, p.z]);
}

/** Point de la frontière à la part `u` (0 → 1) : interpolation linéaire entre ses points, comme le bout du boudin. */
export function surFrontiere(points: readonly (readonly [number, number, number])[], u: number): [number, number, number] {
  const n = points.length - 1, x = Math.max(0, Math.min(1, u)) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
  const a = points[i]!, b = points[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Repères des bulles, sur la surface déplacée : Paris (le repère du point et du drapeau) et le milieu de la frontière. */
export interface Reperes { paris: [number, number, number]; frontiereMilieu: [number, number, number] }

export function reperes(points: readonly (readonly [number, number, number])[], hauteur: (lng: number, lat: number) => number): Reperes {
  const p = vec(PARIS[0], PARIS[1], 1 + hauteur(PARIS[0], PARIS[1]));   // scene.ts:164
  return { paris: [p.x, p.y, p.z], frontiereMilieu: surFrontiere(points, 0.5) };
}
```

- [ ] **Step 6 : peintures.** Créer `web/scripts/intro/lib/peinture.ts` : le corps de `build-intro.ts` (l. 21-165 : biomes, bruits, formules inchangés), avec les données en paramètres (rien n'est lu à l'import : les tests tournent sans les caches), les trois flous en px passés en degrés (`FLOUS`), `reliefFin` qui rend `{ img, S }` en gris 16 bits au lieu d'un JPEG 8 bits et d'un `S` seulement affiché, et `hauteur` qui remplace `relief.jpg` (altitude et terre adoucie en deux canaux 8 bits, combinées par scene.ts) par la hauteur finale en un gris 16 bits :

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import sharp, { type Sharp } from 'sharp';
import { TEXTURE_SOURCES } from '../../textures/config';
import { NE_COUNTRIES, TEX_CACHE_DIR } from '../../textures/paths';
import { HAUTEUR_MAX, hauteurDe } from './terre';

/**
 * Peintures « pâte » de la Terre de l'intro (extraites de l'ancien `build-intro.ts`, spec intro §6), depuis les sources
 * en cache (`npm run geodata:fetch`, `npm run textures:fetch`) : couleurs du monde et de l'Europe, relief fin, hauteur
 * du relief, frontière de la France. Les flous et liserés sont donnés en DEGRÉS : la peinture garde son aspect à toute
 * définition, et les deux peintures se raccordent sans couture.
 */
sharp.cache(false);
const GEBCO = path.join(TEX_CACHE_DIR, TEXTURE_SOURCES.elevation.file);
const BMNG = path.join(TEX_CACHE_DIR, TEXTURE_SOURCES.day.file);
const SRC = 21600 / 360;   // les deux sources : 60 px par degré

export interface Box { lng0: number; lng1: number; lat0: number; lat1: number }
export const MONDE: Box = { lng0: -180, lng1: 180, lat0: -90, lat1: 90 };
/** Boîte de la peinture fine de l'Europe (degrés), là où la caméra s'approche. */
export const INTRO_EUROPE = { lng0: -25, lng1: 45, lat0: 20, lat1: 72 } as const;

/**
 * Les trois flous qui étaient en pixels dans `build-intro.ts`, convertis en degrés à la définition où ils avaient été
 * réglés (aspect validé le 10/10) ; les autres y étaient déjà en degrés.
 */
export const FLOUS = {
  /** Masque terre/mer, anticrénelage des côtes : 0,6 px de la peinture du monde à 8192 px (22,76 px/°). */
  cote: 0.6 / (8192 / 360),
  /** Relief fin, hauteur avant d'en ôter ce que porte le maillage : 1,2 px de `relief-fin.jpg` à 24 px/°. */
  reliefFin: 1.2 / 24,
  /** Hauteur du relief, altitude : 0,7 px de `relief.jpg` à 1024 px (2,84 px/°). */
  altitude: 0.7 / (1024 / 360),
  /** Hauteur du relief, terre adoucie : 1,6 px de `relief.jpg` à 1024 px. */
  terre: 1.6 / (1024 / 360),
} as const;
/** Écart type d'un flou de `deg` degrés à `pxDeg` px/° (sharp refuse moins de 0,3). */
export const sigmaPx = (deg: number, pxDeg: number) => Math.max(0.3, deg * pxDeg);

/** Les pays de Natural Earth (13 Mo, lus une fois par la fabrique). */
export type Pays = FeatureCollection<Polygon | MultiPolygon>;
export const lirePays = (fichier = NE_COUNTRIES): Pays => JSON.parse(readFileSync(fichier, 'utf8')) as Pays;

function svgTerre(pays: Pays, b: Box, w: number, h: number): Buffer {
  const polys = pays.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const X = (lng: number) => ((lng - b.lng0) / (b.lng1 - b.lng0) * w).toFixed(1), Y = (lat: number) => ((b.lat1 - lat) / (b.lat1 - b.lat0) * h).toFixed(1);
  const pxDeg = w / (b.lng1 - b.lng0);
  // un chemin par polygone (nonzero) et un fin trait : les pays voisins se touchent sans couture
  const d = polys.map((p) => '<path d="' + p.map((r) => 'M' + r.map(([a, c]) => X(a!) + ',' + Y(c!)).join('L') + 'Z').join('') + '" fill-rule="evenodd"/>').join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/><g fill="white" stroke="white" stroke-width="${(pxDeg * 0.0045).toFixed(3)}" stroke-linejoin="round">${d}</g></svg>`);
}
const gris = (img: Sharp) => img.greyscale().raw().toBuffer();
/** Une source 21600 × 10800 découpée sur la boîte et mise à la taille voulue. */
function source(fichier: string, b: Box, w: number, h: number): Sharp {
  const img = sharp(fichier, { limitInputPixels: false });
  if (b === MONDE) return img.resize(w, h, { kernel: 'lanczos3' });
  return img.extract({ left: Math.round((b.lng0 + 180) * SRC), top: Math.round((90 - b.lat1) * SRC), width: Math.round((b.lng1 - b.lng0) * SRC), height: Math.round((b.lat1 - b.lat0) * SRC) })
    .resize(w, h, { kernel: 'lanczos3' });
}

function bruit(seed: number) {
  const h = (x: number, y: number) => { let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * xf, c = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * xf; return (a + (c - a) * yf) * 2 - 1; };
}
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (s: string): [number, number, number] => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
/** Biomes : couleur Blue Marble typique → couleur pâte (mélange doux des plus proches). */
const BIOMES: [[number, number, number], [number, number, number]][] = [
  [[38, 62, 30], hex('#2f9a4a')],    // forêt dense
  [[78, 92, 52], hex('#68c44c')],    // prairie
  [[120, 118, 72], hex('#b6cf52')],  // savane
  [[196, 170, 120], hex('#f3cf78')], // désert clair
  [[176, 120, 72], hex('#ec9d52')],  // désert rouge
  [[112, 108, 96], hex('#a7b48a')],  // toundra, steppe
  [[236, 238, 244], hex('#fff8ec')], // glace
];
const MONT = hex('#a8764c'), NEIGE = hex('#fff8ec'), PLAGE = hex('#f6e0a0');
const PROFOND = hex('#2b6fd9'), LAGON = hex('#5cc3f3');
const n1 = bruit(3), n2 = bruit(11);

/** La peinture « pâte » de la boîte `b`, W × H, RGB 8 bits. */
export async function peindre(pays: Pays, b: Box, W: number, H: number): Promise<Sharp> {
  const pxDeg = W / (b.lng1 - b.lng0), f = (deg: number) => sigmaPx(deg, pxDeg);
  const [masque, masqueFlou, eauProche, elev, bm] = await Promise.all([
    gris(sharp(svgTerre(pays, b, W, H), { limitInputPixels: false }).blur(f(FLOUS.cote))),
    gris(sharp(svgTerre(pays, b, W, H), { limitInputPixels: false }).blur(f(0.1))),
    gris(sharp(svgTerre(pays, b, W / 4, H / 4), { limitInputPixels: false }).blur(f(0.7) / 4).resize(W, H, { kernel: 'cubic' })),
    gris(source(GEBCO, b, W, H).blur(f(0.07))),
    source(BMNG, b, W, H).blur(f(0.11)).removeAlpha().raw().toBuffer(),
  ]);
  const rgb = Buffer.alloc(W * H * 3), sig2 = 2 * 34 * 34;
  for (let y = 0; y < H; y++) {
    const lat = b.lat1 - (y + 0.5) / H * (b.lat1 - b.lat0);
    for (let x = 0; x < W; x++) {
      const i = y * W + x, lng = b.lng0 + (x + 0.5) / pxDeg;
      const m = masque[i]! / 255, e = Math.sqrt(elev[i]! / 255);   // racine : les reliefs moyens sont caricaturés
      const v = 0.035 * n1(lng / 4, lat / 4) + 0.02 * n2(lng / 0.97, lat / 0.97);   // teinte « faite à la main »
      const pr = ss(0.02, 0.5, eauProche[i]! / 255);
      let r = PROFOND[0] + (LAGON[0] - PROFOND[0]) * pr, g = PROFOND[1] + (LAGON[1] - PROFOND[1]) * pr, bl = PROFOND[2] + (LAGON[2] - PROFOND[2]) * pr;
      const mf = masqueFlou[i]! / 255;
      const ec = ss(0.03, 0.2, mf) * (1 - ss(0.2, 0.45, mf)) * 0.6 * (1 - m);   // liseré d'écume au ras des côtes
      r += (226 - r) * ec; g += (246 - g) * ec; bl += (255 - bl) * ec;
      if (m > 0.001) {
        const c0 = bm[i * 3]!, c1 = bm[i * 3 + 1]!, c2 = bm[i * 3 + 2]!;
        let sw = 0, tr = 0, tg = 0, tb = 0;
        for (const [ref, pal] of BIOMES) { const d = (c0 - ref[0]) ** 2 + (c1 - ref[1]) ** 2 + (c2 - ref[2]) ** 2; const w = Math.exp(-d / sig2) + 1e-6; sw += w; tr += w * pal[0]; tg += w * pal[1]; tb += w * pal[2]; }
        let lr = tr / sw, lg = tg / sw, lb = tb / sw;
        const mo = ss(0.36, 0.56, e), nei = Math.max(ss(0.6, 0.74, e), ss(66, 72, Math.abs(lat)));
        lr += (MONT[0] - lr) * mo; lg += (MONT[1] - lg) * mo; lb += (MONT[2] - lb) * mo;
        lr += (NEIGE[0] - lr) * nei; lg += (NEIGE[1] - lg) * nei; lb += (NEIGE[2] - lb) * nei;
        const pl = (1 - ss(0.62, 0.9, mf)) * (1 - nei);   // liseré de plage
        lr += (PLAGE[0] - lr) * pl; lg += (PLAGE[1] - lg) * pl; lb += (PLAGE[2] - lb) * pl;
        r += (lr - r) * m; g += (lg - g) * m; bl += (lb - bl) * m;
      }
      const k = 1 + v;
      rgb[i * 3] = Math.min(255, r * k); rgb[i * 3 + 1] = Math.min(255, g * k); rgb[i * 3 + 2] = Math.min(255, bl * k);
    }
  }
  return sharp(rgb, { raw: { width: W, height: H, channels: 3 }, limitInputPixels: false });
}

/** Flou gaussien approché en flottants (trois passes de boîte) : pas de marches d'arrondi qui dessinent des rayures. */
function flouF(src: Float32Array, W: number, H: number, rayon: number): Float32Array {
  const r = Math.max(1, Math.round(rayon));
  const a = Float32Array.from(src), c = new Float32Array(W * H);
  for (let p = 0; p < 3; p++) {
    for (let y = 0; y < H; y++) {
      let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))]!;
      for (let x = 0; x < W; x++) { c[y * W + x] = s / (2 * r + 1); s += a[y * W + Math.min(W - 1, x + r + 1)]! - a[y * W + Math.max(0, x - r)]!; }
    }
    for (let x = 0; x < W; x++) {
      let s = 0; for (let y = -r; y <= r; y++) s += c[Math.min(H - 1, Math.max(0, y)) * W + x]!;
      for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += c[Math.min(H - 1, y + r + 1) * W + x]! - c[Math.max(0, y - r) * W + x]!; }
    }
  }
  return a;
}

/**
 * Relief fin : h = 0,09 · √e^2,4 (comme le maillage) moins ce que le maillage porte déjà (flou de 0,35°), en gris
 * 16 bits : v / 65535 = ½ + ½ · tanh(détail / S), S = 99ᵉ centile de |détail| (rayons terrestres) ; ½ = rien à ajouter.
 */
export async function reliefFin(b: Box, W: number, H: number): Promise<{ img: Sharp; S: number }> {
  const pxDeg = W / (b.lng1 - b.lng0);
  const brutH = await gris(source(GEBCO, b, W, H));
  const h = new Float32Array(W * H); for (let i = 0; i < W * H; i++) h[i] = 0.09 * Math.pow(Math.sqrt(brutH[i]! / 255), 2.4);
  const hl = flouF(h, W, H, FLOUS.reliefFin * pxDeg), floue = flouF(h, W, H, (0.35 * pxDeg) / 1.7);
  const det = new Float32Array(W * H); for (let i = 0; i < W * H; i++) det[i] = hl[i]! - floue[i]!;
  const tri = Float32Array.from(det.filter((_, i) => i % 7 === 0).map(Math.abs)).sort();
  const S = tri[Math.floor(tri.length * 0.99)] || 1;
  const px = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) px[i] = Math.round(32767.5 + 32767.5 * Math.tanh(det[i]! / S));
  return { img: sharp(px, { raw: { width: W, height: H, channels: 1 } }).toColourspace('grey16'), S };
}

/**
 * Hauteur du relief en pâte sur le monde, W × H, en gris 16 bits : v / 65535 · HAUTEUR_MAX = `hauteurDe(terre, altitude)`
 * (rayons terrestres), la terre adoucie et l'altitude floutées comme `relief.jpg` l'était pour le maillage de scene.ts.
 */
export async function hauteur(pays: Pays, W: number, H: number): Promise<Uint16Array> {
  const pxDeg = W / 360;
  const [terre, alt] = await Promise.all([
    gris(sharp(svgTerre(pays, MONDE, W, H), { limitInputPixels: false }).blur(sigmaPx(FLOUS.terre, pxDeg))),
    gris(source(GEBCO, MONDE, W, H).blur(sigmaPx(FLOUS.altitude, pxDeg))),
  ]);
  const out = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.round((hauteurDe(terre[i]! / 255, alt[i]! / 255) / HAUTEUR_MAX) * 65535);
  return out;
}

/** Frontière de la France métropolitaine : le plus grand anneau dans sa boîte, simplifié (Douglas-Peucker 0,008°). */
export function france(pays: Pays): [number, number][] {
  const fra = pays.features.find((f) => f.properties?.ADM0_A3 === 'FRA')!;
  const anneaux = (fra.geometry.type === 'Polygon' ? [fra.geometry.coordinates] : fra.geometry.coordinates).map((p) => p[0]!);
  const aire = (r: number[][]) => Math.abs(r.reduce((s, [a, b], i) => { const [c, e] = r[(i + 1) % r.length]!; return s + a! * e! - c! * b!; }, 0) / 2);
  const ring = anneaux.filter((r) => r.every(([a, b]) => a! > -6 && a! < 10 && b! > 41 && b! < 52)).sort((a, b) => aire(b) - aire(a))[0]!;
  const dp = (pts: number[][], eps: number): number[][] => {
    if (pts.length < 3) return pts;
    const a = pts[0]!, b = pts.at(-1)!;
    let dm = 0, im = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const d = Math.abs((b[1]! - a[1]!) * p[0]! - (b[0]! - a[0]!) * p[1]! + b[0]! * a[1]! - b[1]! * a[0]!) / (Math.hypot(b[1]! - a[1]!, b[0]! - a[0]!) || 1e-9);
      if (d > dm) { dm = d; im = i; }
    }
    return dm > eps ? [...dp(pts.slice(0, im + 1), eps).slice(0, -1), ...dp(pts.slice(im), eps)] : [a, b];
  };
  // un anneau fermé a ses deux bouts confondus : on le simplifie en deux moitiés
  const mi = Math.floor(ring.length / 2);
  return [...dp(ring.slice(0, mi + 1), 0.008).slice(0, -1), ...dp(ring.slice(mi), 0.008)].map(([a, b]) => [+a!.toFixed(3), +b!.toFixed(3)]);
}
```

- [ ] **Step 7 : vérifier.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit`. Expected : PASS — `Test Files  2 passed (2)`, `Tests  11 passed (11)`.

- [ ] **Step 8 : le script des sources.** Créer `web/scripts/intro/sources.ts` :

```ts
/**
 * Sources de la scène Blender de l'intro (spec `2026-10-11-countrizz-intro-video-blender-design.md` §2.3), depuis les
 * caches de `npm run geodata:fetch` et `npm run textures:fetch`, dans `scripts/intro/.cache/sources/` (ignoré par git) :
 *  - `monde.png` : la peinture « pâte » du monde, 8192 × 4096, RGB 8 bits (22,8 px/°, non réduite) ;
 *  - `europe.png` : l'Europe et le Maghreb (`INTRO_EUROPE`) à 60 px/°, la définition des sources ;
 *  - `hauteur.png` : la hauteur du relief, 8192 × 4096, gris 16 bits (v / 65535 · `hauteurMax`, rayons terrestres) ;
 *  - `relief-fin.png` : le relief fin de l'Europe à 60 px/°, gris 16 bits (v / 65535 = ½ + ½ · tanh(détail / `reliefFinS`)) ;
 *  - `sources.json` : `{ hauteurMax, reliefFinS, europe }` ;
 *  - `france.json` : la frontière de la France métropolitaine, `[lng, lat][]` ;
 *  - `frontiere.json` : le boudin de la frontière, 2601 points `[x, y, z]` du repère three (lib/terre.ts) ;
 *  - `reperes.json` : `{ paris, frontiereMilieu }`, points `[x, y, z]` du repère three sur la surface déplacée.
 * Images équirectangulaires : ligne 0 au nord de la boîte, colonne 0 à l'ouest. Usage : `npm run intro:sources`.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { INTRO_EUROPE, MONDE, france, hauteur, lirePays, peindre, reliefFin } from './lib/peinture';
import { HAUTEUR_MAX, courbeFrontiere, hauteurA, pointsFrontiere, reperes, type Gris16 } from './lib/terre';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.cache/sources');
const MW = 8192, MH = 4096;   // monde et hauteur : 22,8 px/°
const PX_DEG = 60;            // Europe et relief fin : la définition des sources (GEBCO, Blue Marble)
const E = INTRO_EUROPE, EW = (E.lng1 - E.lng0) * PX_DEG, EH = (E.lat1 - E.lat0) * PX_DEG;

mkdirSync(OUT, { recursive: true });
const pays = lirePays();
await (await peindre(pays, MONDE, MW, MH)).png().toFile(path.join(OUT, 'monde.png'));
await (await peindre(pays, E, EW, EH)).png().toFile(path.join(OUT, 'europe.png'));
const fin = await reliefFin(E, EW, EH);
await fin.img.png().toFile(path.join(OUT, 'relief-fin.png'));
console.log(`relief fin : échelle de codage ${fin.S.toFixed(5)} (rayons terrestres)`);
const h: Gris16 = { w: MW, h: MH, d: await hauteur(pays, MW, MH) };
await sharp(h.d, { raw: { width: MW, height: MH, channels: 1 } }).toColourspace('grey16').png().toFile(path.join(OUT, 'hauteur.png'));
const fra = france(pays);
const points = pointsFrontiere(courbeFrontiere(fra, (lng, lat) => hauteurA(h, lng, lat)));
writeFileSync(path.join(OUT, 'sources.json'), JSON.stringify({ hauteurMax: HAUTEUR_MAX, reliefFinS: fin.S, europe: { ...E } }));
writeFileSync(path.join(OUT, 'france.json'), JSON.stringify(fra));
writeFileSync(path.join(OUT, 'frontiere.json'), JSON.stringify(points));
writeFileSync(path.join(OUT, 'reperes.json'), JSON.stringify(reperes(points, (lng, lat) => hauteurA(h, lng, lat))));
for (const f of ['monde.png', 'europe.png', 'relief-fin.png', 'hauteur.png', 'sources.json', 'france.json', 'frontiere.json', 'reperes.json']) {
  const p = path.join(OUT, f), m = f.endsWith('.png') ? await sharp(p).metadata() : null;
  console.log(`${f}${m ? ` ${m.width}×${m.height} ${m.channels} canal(aux) ${m.depth}` : ''} ${statSync(p).size} octets`);
}
```

- [ ] **Step 9 : commande, cache ignoré, ménage.**
  - `web/package.json` (l. 29) : remplacer `"intro": "tsx scripts/intro/build-intro.ts"` par `"intro:sources": "tsx scripts/intro/sources.ts"` (le site ne sert plus ces textures : l'ancienne commande disparaît avec son script).
  - `.gitignore` : après la ligne `web/scripts/imagery/.cache/` (l. 6), ajouter la ligne `web/scripts/intro/.cache/`.
  - `web/src/intro/boxes.ts` (l. 1) : remplacer le commentaire par `/** Boîte de la peinture fine de l'Europe (degrés), pour le shader de l'intro three.js (supprimé avec lui) ; la fabrique a la sienne (scripts/intro/lib/peinture.ts). */` (la constante reste : `scene.ts` l'importe jusqu'à la Task 10).
  - Run : `git rm web/scripts/intro/build-intro.ts`.

- [ ] **Step 10 : produire les sources.** Run : `cd web && /usr/bin/time -l npm run intro:sources`. Expected (relevé au plan ; les tailles sont déterministes, le temps varie) :

```text
relief fin : échelle de codage 0.00320 (rayons terrestres)
monde.png 8192×4096 3 canal(aux) uchar 18257052 octets
europe.png 4200×3120 3 canal(aux) uchar 7711893 octets
relief-fin.png 4200×3120 1 canal(aux) ushort 15420400 octets
hauteur.png 8192×4096 1 canal(aux) ushort 4635150 octets
sources.json 107 octets
france.json 17663 octets
frontiere.json 157789 octets
reperes.json 150 octets
```

puis, de `time` : `12,50 real` et `1694990336  maximum resident set size` au premier passage du plan, `17,99 real` et `1747304448` au second (≈ 1,7 Go de mémoire ; l'ancien `build-intro.ts` : 19,44 s et 1 677 328 384 octets).

- [ ] **Step 11 : contrôles des sources.**
  - Repères (recopiés tels quels par le test de la Task 3) : Run : `cd web && cat scripts/intro/.cache/sources/reperes.json scripts/intro/.cache/sources/sources.json`. Expected : `{"paris":[0.6605924688707989,0.7568215134698799,-0.027109560338230285],"frontiereMilieu":[0.753004354824679,0.6943535650710903,-0.006915935790586691]}{"hauteurMax":0.0945,"reliefFinS":0.003202657215297222,"europe":{"lng0":-25,"lng1":45,"lat0":20,"lat1":72}}` (Paris à 2,35° E, 48,86° N, rayon 1,00494 ; le milieu de la frontière dans les Pyrénées, 0,53° E, 42,68° N, rayon 1,0243). S'ils diffèrent, c'est le fichier qu'on recopie dans `REPERES` à la Task 3, Step 5.
  - La peinture du monde n'a pas changé : réduite comme le faisait `build-intro.ts`, elle redonne le JPEG servi aujourd'hui, octet pour octet. Run :

```bash
cd web && node -e "
const sharp = require('sharp'), { createHash } = require('node:crypto'), fs = require('node:fs');
const h = (b) => createHash('sha256').update(b).digest('hex');
sharp('scripts/intro/.cache/sources/monde.png', { limitInputPixels: false }).resize(4096, 2048, { kernel: 'lanczos3' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  .then((b) => console.log(h(b) === h(fs.readFileSync('public/intro/monde.jpg')) ? 'monde.png réduit = public/intro/monde.jpg, octet pour octet' : 'DIFFÉRENT'));
"
```

  Expected : `monde.png réduit = public/intro/monde.jpg, octet pour octet`.
  - Déterministe : Run : `cd web && shasum -a 256 scripts/intro/.cache/sources/* > "$TMPDIR/sources-1.sha" && npm run intro:sources > /dev/null && shasum -a 256 scripts/intro/.cache/sources/* | cmp - "$TMPDIR/sources-1.sha" && echo "mêmes octets"`. Expected : `mêmes octets`.
  - Ignoré par git : Run : `git check-ignore -v web/scripts/intro/.cache/sources/monde.png`. Expected : `.gitignore:7:web/scripts/intro/.cache/	web/scripts/intro/.cache/sources/monde.png`.

- [ ] **Step 12 : suite.** Run : `cd web && npm run check`. Expected : PASS — tsc sans erreur, `Test Files  62 passed (62)`, `Tests  350 passed (350)` (les 339 de la Task 1 et les 11 de la fabrique).

- [ ] **Step 13 : commit.**

```bash
git add .gitignore web/vitest.config.ts web/package.json web/src/intro/boxes.ts web/scripts/intro/lib/terre.ts web/scripts/intro/lib/peinture.ts web/scripts/intro/sources.ts web/scripts/intro/__tests__/unit/terre.test.ts web/scripts/intro/__tests__/unit/peinture.test.ts
git commit -m "fabrique : sources de la scène Blender (peintures, hauteur et relief fin en 16 bits, frontière, repères), build-intro.ts retiré — spec intro vidéo §2.3"
```

---

### Task 3 : Export des clés et des ancres (lib/axes.ts, export-keys.ts, ancres.json)

**Files:**
- Create: `web/scripts/intro/lib/axes.ts`, `web/scripts/intro/export-keys.ts`
- Create (généré par `npm run intro:keys`, versionné) : `web/public/intro/ancres.json`
- Test: `web/scripts/intro/__tests__/unit/axes.test.ts`, `web/scripts/intro/__tests__/unit/export-keys.test.ts` (créés)
- Modify: `web/package.json:29` (script `intro:keys`)

**Interfaces:**
- Consumes :
  - Task 1 : `CADRAGES`, `INTRO`, `IPS_MAITRE`, `BULLES`, `BULLES_RANGE`, `LOGO_LETTRES`, `type Cadrage`, `type Bulle` (`src/intro/temps.ts`) ; `TITRES` (`src/intro/cadrages.ts`, px vidéo ; centre d'une lettre = milieu de sa boîte en ligne, au repos) ; `frameAt(t, cadrage)`, `type IntroFrame`, `MAT_HM`, `REPERE_ECHELLE` (`src/intro/timeline.ts`). Lus tels que la Task 1 les définit : `LettreAnim` = `translate(dx, dy) scale(echelle) rotate(rot)` autour du centre mesuré, px vidéo (y vers le bas), `rot` en rad dans le sens horaire de l'image ; étoile = centre et rayon en px vidéo.
  - Task 2 : `.cache/sources/reperes.json` et `frontiere.json` ; `surFrontiere`, `courbeFrontiere`, `pointsFrontiere`, `type Reperes` (`lib/terre.ts`).
- Produces :
  - `lib/axes.ts` : types `Vec3`, `QuatThree` (`[x, y, z, w]`), `QuatBlender` (`[w, x, y, z]`), `IntroCamera` (= `IntroFrame['camera']`), `Video` ; `memeSigne(q: QuatBlender, prec: QuatBlender): QuatBlender` ; `quatBlender(q: QuatThree, prec?: QuatBlender | null): QuatBlender` (ordre de Blender, `−q` si `q · prec < 0`) ; `signesContinus(valeurs: number[]): void` ; `cameraThree(c: IntroCamera, video: Video): THREE.PerspectiveCamera` ; `projeter(p: Vec3, c: IntroCamera, video: Video): [number, number]` (px vidéo, calcul de scene.ts:263-264 sans tremblé) ; `matriceEcrasement(c: IntroCamera, squash: { sx: number; sy: number }): THREE.Matrix4` (B·S·Bᵀ) ; `unitesParPx(D: number, fovY: number, video: Video): number` ; `versCamera(x: number, y: number, D: number, fovY: number, video: Video): [number, number, number]`.
  - `export-keys.ts` : `PROFONDEUR = { lettres: 2, etoiles: 1000 }` ; `ANCRES_IPS = 60` ; `ANCRES_T0` (= 10,8 : apparition du point, 0,3 s avant la première bulle) ; `nombreImages()` (= round(FIN · 120) + 1 = 2377) ; `interface Sources { reperes: Reperes; frontiere: Vec3[] }`, `Piste`, `Cles`, `Ancres` ; `cles(cadrage: Cadrage, s: Sources): Cles` ; `ancres(r: Reperes): Ancres`.
  - `npm run intro:keys` → `web/scripts/intro/.cache/keys-portrait.json`, `keys-paysage.json` (format du contrat : `version` 1, `frames` 2377, `fps` 120, `fovY` 20, 220 pistes dans l'ordre du test du Step 5) et `web/public/intro/ancres.json` (format du contrat : `t0` 10,8, `fps` 60, 325 points `[x, y]` par bulle, px vidéo au dixième ; capitale = centre du point de pâte, pays = milieu de la frontière, drapeau = haut du mât penché et tourné avec le drapeau).
  - **Ce que les pistes demandent à la scène Blender (Tasks 4-5) :**
    1. Images 1 → `frames` ; l'image k est l'instant (k − 1) / 120 s, la dernière est `INTRO.FIN` ; `render.fps = 120` ; F-curves LINÉAIRES.
    2. Noms et parenté (chaque enfant avec `matrix_parent_inverse` identité ; toutes les valeurs sont des coordonnées three dans le repère local du parent) : `monde` (Empty fixe, rotation X +90°) → `camera` ; `monde` → `ecrasement_rot` → `ecrasement_echelle` → `ecrasement_retour` → `terre_groupe` → `terre`, `nuages`, `frontiere`, `perle`, `repere` → `point`, `drapeau`. Enfants de `camera` : `logo_00` … `logo_07`, `titre_00` … `titre_07`, `etoile_00` … `etoile_45`.
    3. `rotation_mode = 'QUATERNION'` pour `camera`, `ecrasement_rot`, `ecrasement_retour`, `repere`, `drapeau` ; `'XYZ'` pour `nuages` et les lettres (pistes `rotation_euler`).
    4. Caméra : `sensor_fit = 'VERTICAL'`, `angle_y = radians(fovY)` ; `clip_start` ≤ 1 (lettres à 2 unités devant elle) et `clip_end` ≥ 1100 (étoiles à 1000 ; la caméra est au plus à 173,5 unités de la Terre). **Pas de profondeur de champ (D10)** : les lettres (à 2 unités) sont bien plus près que la Terre (la caméra reste à 4,27 unités au moins de son centre), une mise au point sur la Terre les flouterait. Si l'utilisateur la demande (Task 6, Step 12), l'ajouter ainsi : une piste de mise au point `CA:camera` `dof.focus_distance` (dim 1, distance de la caméra à la surface visée, écrite par `cles` à chaque image ; `GENRES['CA'] = ('cameras', 'CAMERA')` dans `anim.py`), `cd.dof.use_dof = True` et une ouverture faible (`cd.dof.aperture_fstop`) dans `camera()` (Task 4), et `PROFONDEUR.lettres` reculé jusque dans la zone nette (`cles` refuse toute image où des lettres visibles passeraient derrière la Terre) ; puis `npm run intro:keys` et de nouveaux témoins.
    5. Géométries à l'échelle 1, dans le repère local three de leur objet (Y = verticale du lieu pour `repere`, `point`, `drapeau`) : `point`, `perle` et `etoile_*` sont des sphères de rayon 1 (la piste `scale` porte la taille ; 0 = caché) ; `drapeau` : mât, tête et toile aux cotes de scene.ts:169-179, le mât le long de +Y local ; `nuages` : les groupes de scene.ts:149-159 ; chaque lettre est un texte Blender d'un caractère, de taille telle que 1 em = 1 unité (Chango sous Blender 5.0.1 : `size = 1,211`, mesuré à la Task 5 ; la piste `scale` vaut police · unités/px · échelle), calé CENTER/CENTER : origine au milieu de sa boîte en ligne (le centre de `TITRES`). Écart accepté entre les lettres de la vidéo et le titre HTML pendant le fondu (D5) : ≤ 0,75 px CSS sur chaque axe (ligne de base 0,3895 em sous l'origine dans Blender contre 0,3760 em sous le centre de la boîte dans Chromium, et la boîte HTML 1 px CSS plus large, 45,39 contre 44,39 px, par `letter-spacing: 1px` : les lettres de la vidéo sont plus bas de 0,73 px CSS et plus à droite de 0,50 px CSS, soit 2,02 et 1,38 px vidéo en portrait, 0,73 et 0,50 en paysage ; mesuré à la relecture des interfaces, constat 7, et remesuré : Blender 5.0.1 `align_y` CENTER contre TOP_BASELINE, Chromium à 54 px/1,1). Le logo du milieu n'existe que dans la vidéo : rien à raccorder. Lettres et étoiles ne projettent pas d'ombre (`visible_shadow = False`, comme le DOM qu'elles remplacent).
    6. Opacité des lettres et des étoiles : la piste `color` de l'objet (1, 1, 1, alpha), lue dans leur matière par `Object Info`.
    7. **Frontière** : courbe `frontiere` (`bpy.data.curves.new('frontiere', 'CURVE')`, `dimensions = '3D'`) faite d'UNE spline `POLY` non cyclique dont les points sont, dans l'ordre, les 2601 points de `frontiere.json` (W = 1) ; `bevel_mode = 'ROUND'`, `bevel_depth = 0.0026` ; `bevel_factor_mapping_start = bevel_factor_mapping_end = 'RESOLUTION'` et `bevel_factor_start = 0`. Alors `bevel_factor_end = border` arrête le boudin à l'indice `border · 2600`, interpolé entre deux points : le paramètre même du `TubeGeometry(courbe, 2600)` de three (scene.ts:185-186, 255-257). Contrôlé sous Blender 5.0.1 au Step 12 : fin à l'indice 780,2601 pour 0,3001 (attendu 780,26) ; avec `'SPLINE'`, 842,47 ; à 0, rien n'est dessiné (three le cache aussi). Ne pas refaire la Catmull-Rom dans Blender : ces points sont ceux que three dessine (son pas d'abscisse curviligne est estimé sur 200 divisions : d'un point au suivant, de 1,8e-5 à 5,4e-3 unité).
    8. **Perle** : piste `OB:perle location` (pas de contrainte « suivre le chemin ») = le point de `frontiere.json` à la part `min(0,9999 ; bead)`, interpolé linéairement, c'est-à-dire exactement le bout du boudin en `'RESOLUTION'` ; `scale` 0,0049, ou 0 quand `bead` est nul.
    9. Les images où le point, le drapeau ou la perle sont cachés (`scale` 0) gardent la position (et l'orientation du drapeau) de l'image visible la plus proche : pas de traînée de flou de mouvement quand ils surgissent.

- [ ] **Step 1 : tests des axes et de la projection.** Créer `web/scripts/intro/__tests__/unit/axes.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CADRAGES, INTRO, type Cadrage } from '../../../../src/intro/temps';
import { TITRES } from '../../../../src/intro/cadrages';
import { frameAt } from '../../../../src/intro/timeline';
import { cameraThree, matriceEcrasement, memeSigne, projeter, quatBlender, signesContinus, versCamera } from '../../lib/axes';

const CAS: Cadrage[] = ['portrait', 'paysage'];

describe('quaternions three → Blender', () => {
  it('ordre [w, x, y, z]', () => {
    expect(quatBlender([0.1, 0.2, 0.3, 0.9])).toEqual([0.9, 0.1, 0.2, 0.3]);
  });

  it('signe continu : opposé au précédent, il est retourné (même rotation, plus court chemin)', () => {
    const prec: [number, number, number, number] = [0.9, 0.1, 0.2, 0.3];
    expect(quatBlender([-0.1, -0.2, -0.3, -0.9], prec)).toEqual(prec);
    expect(quatBlender([0.1, 0.2, 0.3, 0.9], prec)).toEqual(prec);
    expect(memeSigne([0.2, 0.9, 0.1, 0.3], prec)).toEqual([0.2, 0.9, 0.1, 0.3]);     // produit scalaire 0,38 : gardé
    expect(memeSigne([-0.9, 0.1, 0.2, 0.3], prec)).toEqual([0.9, -0.1, -0.2, -0.3]); // −0,67 : retourné
  });

  it('signesContinus : une piste dont le signe saute est remise d’un seul côté, sur place', () => {
    const v = [1, 0, 0, 0, -0.99, -0.1, 0, 0, 0.98, 0.2, 0, 0, -0.97, -0.24, 0, 0];
    signesContinus(v);
    expect(v.map((x) => x + 0)).toEqual([1, 0, 0, 0, 0.99, 0.1, 0, 0, 0.98, 0.2, 0, 0, 0.97, 0.24, 0, 0]);   // + 0 : −0 → 0
  });
});

describe('projection d’un point three en px de la vidéo', () => {
  it('le centre de la Terre tombe au centre du « o » du logo puis du titre (placement), à 1e-6 px', () => {
    for (const c of CAS) {
      const logo = projeter([0, 0, 0], frameAt(8.0, c).camera, CADRAGES[c]);
      expect(Math.abs(logo[0] - TITRES[c].logo.o.x)).toBeLessThan(1e-6);
      expect(Math.abs(logo[1] - TITRES[c].logo.o.y)).toBeLessThan(1e-6);
      for (const t of [INTRO.FONDU + 0.4, INTRO.FIN]) {
        const titre = projeter([0, 0, 0], frameAt(t, c).camera, CADRAGES[c]);
        expect(Math.abs(titre[0] - TITRES[c].titre.o.x)).toBeLessThan(1e-6);
        expect(Math.abs(titre[1] - TITRES[c].titre.o.y)).toBeLessThan(1e-6);
      }
    }
  });

  it('un point posé par versCamera retombe sur son px, à toute profondeur', () => {
    for (const c of CAS)
      for (const t of [0.5, 4, 12, INTRO.FIN]) {
        const cam = frameAt(t, c).camera, k = cameraThree(cam, CADRAGES[c]);
        for (const [x, y, D] of [[100, 200, 2], [CADRAGES[c].width - 3, 7, 1000], [CADRAGES[c].width / 2, CADRAGES[c].height / 2, 50]] as const) {
          const w = new THREE.Vector3(...versCamera(x, y, D, cam.fov, CADRAGES[c])).applyMatrix4(k.matrixWorld);
          const p = projeter([w.x, w.y, w.z], cam, CADRAGES[c]);
          expect(Math.abs(p[0] - x)).toBeLessThan(1e-6);
          expect(Math.abs(p[1] - y)).toBeLessThan(1e-6);
        }
      }
  });

  it('écrasement B·S·Bᵀ : sy le long de l’axe vertical de l’image, sx sur les deux autres', () => {
    const cam = frameAt(4, 'portrait').camera, q = new THREE.Quaternion().fromArray(cam.quaternion);
    const M = matriceEcrasement(cam, { sx: 1.1, sy: 0.8 });
    const haut = new THREE.Vector3(0, 1, 0).applyQuaternion(q), droite = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(haut.clone().applyMatrix4(M).distanceTo(haut.clone().multiplyScalar(0.8))).toBeLessThan(1e-12);
    expect(droite.clone().applyMatrix4(M).distanceTo(droite.clone().multiplyScalar(1.1))).toBeLessThan(1e-12);
  });
});
```

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/axes.test.ts`. Expected : FAIL — `Error: Cannot find module '../../lib/axes' imported from …/web/scripts/intro/__tests__/unit/axes.test.ts`, `Test Files  1 failed (1)`.

- [ ] **Step 3 : axes et projection.** Créer `web/scripts/intro/lib/axes.ts` :

```ts
import * as THREE from 'three';
import type { IntroFrame } from '../../../src/intro/timeline';

/**
 * Du repère three de la chronologie (`src/intro/timeline.ts`) à la scène Blender et à l'image de la vidéo. Blender reçoit
 * les valeurs three telles quelles : sa racine `monde` est tournée de +90° sur X, et les deux caméras regardent leur −Z
 * local avec Y en haut ; seul l'ordre des quaternions change (three `[x, y, z, w]`, Blender `[w, x, y, z]`).
 */
export type Vec3 = readonly [number, number, number];
/** Quaternion three : `[x, y, z, w]`. */
export type QuatThree = readonly [number, number, number, number];
/** Quaternion Blender : `[w, x, y, z]`. */
export type QuatBlender = [number, number, number, number];
export type IntroCamera = IntroFrame['camera'];
export interface Video { width: number; height: number }

/**
 * `q` ou `−q` (la même rotation), celui qui est du côté de `prec` : Blender interpole les clés composante par
 * composante, le signe doit suivre l'image précédente pour que l'interpolation prenne le plus court chemin.
 */
export function memeSigne(q: QuatBlender, prec: QuatBlender): QuatBlender {
  return q[0] * prec[0] + q[1] * prec[1] + q[2] * prec[2] + q[3] * prec[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
}

/** Quaternion three → Blender, de signe continu avec `prec` (le quaternion Blender de l'image précédente) s'il est donné. */
export function quatBlender(q: QuatThree, prec?: QuatBlender | null): QuatBlender {
  const b: QuatBlender = [q[3], q[0], q[1], q[2]];
  return prec ? memeSigne(b, prec) : b;
}

/** Rend continue en signe, sur place, une piste de quaternions Blender (`[w, x, y, z]` à la suite, image après image). */
export function signesContinus(valeurs: number[]): void {
  for (let k = 4; k + 4 <= valeurs.length; k += 4) {
    const q = memeSigne(valeurs.slice(k, k + 4) as QuatBlender, valeurs.slice(k - 4, k) as QuatBlender);
    for (let d = 0; d < 4; d++) valeurs[k + d] = q[d]!;
  }
}

/** La caméra three d'une image de la chronologie, réglée comme scene.ts:212-219 (sans le tremblé du stop motion). */
export function cameraThree(c: IntroCamera, video: Video): THREE.PerspectiveCamera {
  const k = new THREE.PerspectiveCamera(c.fov, video.width / video.height);
  k.position.fromArray(c.position);
  k.quaternion.fromArray(c.quaternion);
  const dist = k.position.length();
  k.near = Math.max(0.01, (dist - 1.3) * 0.5);
  k.far = dist + 3;
  k.updateProjectionMatrix();
  k.updateMatrixWorld(true);
  return k;
}

/** Point three (repère du monde) → px de la vidéo (x vers la droite, y vers le bas), comme scene.ts:263-264. */
export function projeter(p: Vec3, c: IntroCamera, video: Video): [number, number] {
  const v = new THREE.Vector3(p[0], p[1], p[2]).project(cameraThree(c, video));
  return [(v.x * 0.5 + 0.5) * video.width, (-v.y * 0.5 + 0.5) * video.height];
}

/** Écrasement de l'impact, scene.ts:228-230 : B·S·Bᵀ, B = l'orientation de la caméra, S = (sx, sy, sx). */
export function matriceEcrasement(c: IntroCamera, squash: { sx: number; sy: number }): THREE.Matrix4 {
  const B = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().fromArray(c.quaternion));
  return B.clone().multiply(new THREE.Matrix4().makeScale(squash.sx, squash.sy, squash.sx)).multiply(B.clone().transpose());
}

/** Unités de la scène par px de la vidéo, à la profondeur `D` devant la caméra (champ vertical `fovY` en degrés). */
export const unitesParPx = (D: number, fovY: number, video: Video) => (D * Math.tan((fovY * Math.PI) / 360)) / (video.height / 2);

/** Point de l'image (px de la vidéo) → coordonnées locales de la caméra, à la profondeur `D` (la caméra regarde −Z, Y en haut). */
export function versCamera(x: number, y: number, D: number, fovY: number, video: Video): [number, number, number] {
  const k = unitesParPx(D, fovY, video);
  return [(x - video.width / 2) * k, -(y - video.height / 2) * k, -D];
}
```

- [ ] **Step 4 : vérifier.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/axes.test.ts`. Expected : PASS — `Tests  6 passed (6)`.

- [ ] **Step 5 : tests de l'export.** Créer `web/scripts/intro/__tests__/unit/export-keys.test.ts`. `REPERES` = le contenu de `.cache/sources/reperes.json` relevé à la Task 2, Step 11 (le test ne lit pas le cache : GitHub lance `check` sans lui) ; la frontière, elle, est un anneau d'essai (seule la perle la lit) :

```ts
import { describe, expect, it } from 'vitest';
import { BULLES, BULLES_RANGE, CADRAGES, INTRO, IPS_MAITRE, LOGO_LETTRES, type Bulle, type Cadrage } from '../../../../src/intro/temps';
import { frameAt } from '../../../../src/intro/timeline';
import { ANCRES_IPS, ANCRES_T0, PROFONDEUR, ancres, cles, nombreImages, type Cles, type Sources } from '../../export-keys';
import { projeter } from '../../lib/axes';
import { courbeFrontiere, pointsFrontiere, type Reperes } from '../../lib/terre';

/** Repères de la vraie Terre : `.cache/sources/reperes.json` écrit par `npm run intro:sources` (Task 2). */
const REPERES: Reperes = {
  paris: [0.6605924688707989, 0.7568215134698799, -0.027109560338230285],
  frontiereMilieu: [0.753004354824679, 0.6943535650710903, -0.006915935790586691],
};
/** Une frontière d'essai (la perle seule la lit) : un petit anneau autour de la France, relief uniforme. */
const S: Sources = {
  reperes: REPERES,
  frontiere: pointsFrontiere(courbeFrontiere([[-4, 48], [-1, 43], [3, 42.5], [7, 44], [8, 48.5], [3, 51], [-1, 49.5]], () => 0.005)),
};
const CAS: Cadrage[] = ['portrait', 'paysage'];
const CLES: Record<Cadrage, Cles> = { portrait: cles('portrait', S), paysage: cles('paysage', S) };
const piste = (k: Cles, id: string, chemin: string) => k.pistes.find((p) => p.id === id && p.chemin === chemin)!;
const n2 = (i: number) => String(i).padStart(2, '0');

describe('export des clés', () => {
  it('une image par 1/120 s, de 0 à INTRO.FIN compris ; chaque piste a frames × dim valeurs finies', () => {
    expect(nombreImages()).toBe(Math.round(INTRO.FIN * IPS_MAITRE) + 1);
    for (const c of CAS) {
      const k = CLES[c];
      expect([k.version, k.cadrage, k.width, k.height, k.fps, k.frames, k.fovY]).toEqual([1, c, CADRAGES[c].width, CADRAGES[c].height, 120, nombreImages(), 20]);
      for (const p of k.pistes) {
        expect(p.valeurs).toHaveLength(k.frames * p.dim);
        expect(p.valeurs.every(Number.isFinite)).toBe(true);
      }
      const fin = frameAt(INTRO.FIN, c).camera.position;
      piste(k, 'OB:camera', 'location').valeurs.slice(-3).forEach((v, i) => expect(v).toBeCloseTo(fin[i]!, 5));
    }
  });

  it('toutes les pistes que la scène Blender attend, une seule fois chacune', () => {
    const attendues = [
      'OB:camera location', 'OB:camera rotation_quaternion', 'OB:ecrasement_rot rotation_quaternion', 'OB:ecrasement_echelle scale',
      'OB:ecrasement_retour rotation_quaternion', 'OB:nuages rotation_euler', 'OB:nuages scale', 'OB:repere location',
      'OB:repere rotation_quaternion', 'OB:repere scale', 'OB:point location', 'OB:point scale', 'OB:drapeau location',
      'OB:drapeau rotation_quaternion', 'OB:drapeau scale', 'CU:frontiere bevel_factor_end', 'OB:perle location', 'OB:perle scale',
      ...['logo', 'titre'].flatMap((t) => LOGO_LETTRES.flatMap((_, i) => ['location', 'rotation_euler', 'scale', 'color'].map((c) => `OB:${t}_${n2(i)} ${c}`))),
      ...Array.from({ length: 46 }, (_, i) => ['location', 'scale', 'color'].map((c) => `OB:etoile_${n2(i)} ${c}`)).flat(),
    ];
    for (const c of CAS) expect(CLES[c].pistes.map((p) => `${p.id} ${p.chemin}`)).toEqual(attendues);
  });

  it('déterministe : deux exports donnent les mêmes octets', () => {
    expect(JSON.stringify(cles('paysage', S))).toBe(JSON.stringify(CLES.paysage));
    expect(JSON.stringify(ancres(REPERES))).toBe(JSON.stringify(ancres(REPERES)));
  }, 30_000);

  it('quaternions de signe continu d’une image à l’autre (interpolation par le plus court chemin)', () => {
    for (const c of CAS)
      for (const p of CLES[c].pistes.filter((q) => q.chemin === 'rotation_quaternion')) {
        const v = p.valeurs;
        for (let k = 1; k < CLES[c].frames; k++) {
          const dot = v[k * 4]! * v[k * 4 - 4]! + v[k * 4 + 1]! * v[k * 4 - 3]! + v[k * 4 + 2]! * v[k * 4 - 2]! + v[k * 4 + 3]! * v[k * 4 - 1]!;
          expect(dot, `${c} ${p.id} image ${k + 1}`).toBeGreaterThan(0);
        }
      }
  });

  it('les étoiles toujours derrière la Terre, les lettres devant tant qu’elles se voient', () => {
    for (const c of CAS) {
      const k = CLES[c], cam = piste(k, 'OB:camera', 'location').valeurs;
      const alphas = ['logo', 'titre'].flatMap((t) => LOGO_LETTRES.map((_, i) => piste(k, `OB:${t}_${n2(i)}`, 'color').valeurs));
      for (let f = 0; f < k.frames; f++) {
        const d = Math.hypot(cam[f * 3]!, cam[f * 3 + 1]!, cam[f * 3 + 2]!);
        expect(PROFONDEUR.etoiles).toBeGreaterThan(d + 1.4);
        if (alphas.some((a) => a[f * 4 + 3]! > 0)) expect(PROFONDEUR.lettres).toBeLessThan(d - 1.4);
      }
    }
  });
});

describe('ancres des bulles', () => {
  const a = ancres(REPERES);

  it('de t0 (apparition du point, 0,3 s avant la première bulle) à BULLES_RANGE, 60 par seconde', () => {
    expect([a.version, a.fps, a.t0]).toEqual([1, 60, 10.8]);
    expect(ANCRES_T0).toBe(10.8);
    for (const c of CAS)
      for (const b of Object.keys(BULLES) as Bulle[]) expect(a.cadrages[c][b]).toHaveLength(Math.round((BULLES_RANGE - ANCRES_T0) * ANCRES_IPS) + 1);
  });

  it('dans le cadre de la vidéo tant que la bulle est là (portrait et paysage)', () => {
    for (const c of CAS) {
      const { width, height } = a.cadrages[c];
      expect([width, height]).toEqual([CADRAGES[c].width, CADRAGES[c].height]);
      for (const b of Object.keys(BULLES) as Bulle[])
        a.cadrages[c][b].forEach(([x, y], i) => {
          if (a.t0 + i / a.fps < BULLES[b].apparait - 1e-9) return;
          expect(x, `${c} ${b} ${i}`).toBeGreaterThanOrEqual(0);
          expect(x, `${c} ${b} ${i}`).toBeLessThanOrEqual(width);
          expect(y, `${c} ${b} ${i}`).toBeGreaterThanOrEqual(0);
          expect(y, `${c} ${b} ${i}`).toBeLessThanOrEqual(height);
        });
    }
  });

  it('chacune sur son objet : le point posé sur Paris, le milieu de la frontière, le haut du mât au-dessus de Paris', () => {
    for (const c of CAS)
      a.cadrages[c].capitale.forEach((cap, i) => {
        const t = a.t0 + i / a.fps, f = frameAt(t, c);
        const paris = projeter(REPERES.paris, f.camera, CADRAGES[c]), milieu = projeter(REPERES.frontiereMilieu, f.camera, CADRAGES[c]);
        if (t >= 12) expect(Math.hypot(cap[0] - paris[0], cap[1] - paris[1]), `${c} ${t}`).toBeLessThan(8);   // posé depuis 11,22 s
        const pays = a.cadrages[c].pays[i]!;
        expect(Math.hypot(pays[0] - milieu[0], pays[1] - milieu[1]), `${c} ${t}`).toBeLessThan(0.1);   // arrondi au dixième de px
        if (t >= BULLES.drapeau.apparait - 1e-9) expect(a.cadrages[c].drapeau[i]![1], `${c} ${t}`).toBeLessThan(paris[1] - 50);
      });
  });
});
```

- [ ] **Step 6 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/export-keys.test.ts`. Expected : FAIL — `Error: Cannot find module '../../export-keys' imported from …/web/scripts/intro/__tests__/unit/export-keys.test.ts`, `Test Files  1 failed (1)`.

- [ ] **Step 7 : l'export.** Créer `web/scripts/intro/export-keys.ts` :

```ts
/**
 * Clés de l'intro (spec `2026-10-11-countrizz-intro-video-blender-design.md` §2.2) : la chronologie
 * (`src/intro/timeline.ts`) évaluée à chaque image du rendu maître, pour les deux cadrages, en pistes que
 * `blender/anim.py` cuit en F-curves LINÉAIRES (le flou de mouvement échantillonne entre les images) :
 *  - `scripts/intro/.cache/keys-portrait.json`, `keys-paysage.json` : image k (1 → frames) = instant (k − 1) / 120 s, la
 *    dernière est INTRO.FIN ; valeurs en coordonnées three, quaternions dans l'ordre de Blender `[w, x, y, z]` ;
 *  - `public/intro/ancres.json` (versionné) : les ancres des bulles en px de la vidéo, de t0 à BULLES_RANGE au pas 1/60 s.
 * Lit `.cache/sources/reperes.json` et `frontiere.json` (`npm run intro:sources`). Deux exports donnent les mêmes octets.
 * Usage : `npm run intro:keys`.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { BULLES, BULLES_RANGE, CADRAGES, INTRO, IPS_MAITRE, type Bulle, type Cadrage } from '../../src/intro/temps';
import { TITRES } from '../../src/intro/cadrages';
import { MAT_HM, REPERE_ECHELLE, frameAt, type IntroFrame } from '../../src/intro/timeline';
import { matriceEcrasement, projeter, quatBlender, signesContinus, unitesParPx, versCamera, type Vec3 } from './lib/axes';
import { surFrontiere, type Reperes } from './lib/terre';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RAD = Math.PI / 180;

/**
 * Profondeur (unités de la scène, devant la caméra) des objets posés dans le plan de l'image : les lettres devant la
 * Terre quand elles se voient, les étoiles toujours derrière (contrôlé à chaque image par `cles`).
 */
export const PROFONDEUR = { lettres: 2, etoiles: 1000 } as const;
/** La Terre, son relief et ses nuages (rayon 1,24, boules de 0,08) tiennent dans cette sphère. */
const RAYON_MAX = 1.4;
/** Rayon de la perle au bout de la frontière (scene.ts:188). */
const PERLE = 0.0049;
/** Ancres des bulles : 60 par seconde, depuis l'apparition du point (0,3 s avant la première bulle, spec §3.3). */
export const ANCRES_IPS = 60;
export const ANCRES_T0 = Math.round((Math.min(...Object.values(BULLES).map((b) => b.apparait)) - 0.3) * ANCRES_IPS) / ANCRES_IPS;

/** Images du rendu maître : de 0 à INTRO.FIN compris, au pas de 1/IPS_MAITRE. */
export const nombreImages = () => Math.round(INTRO.FIN * IPS_MAITRE) + 1;

export interface Sources { reperes: Reperes; frontiere: Vec3[] }
export interface Piste { id: string; chemin: string; dim: number; valeurs: number[] }
export interface Cles { version: 1; cadrage: Cadrage; width: number; height: number; fps: number; frames: number; fovY: number; pistes: Piste[] }
export interface Ancres {
  version: 1; fps: number; t0: number;
  cadrages: Record<Cadrage, { width: number; height: number } & Record<Bulle, [number, number][]>>;
}

/** Le repère posé à Paris (scene.ts:162-166) : son axe Y sur la verticale du lieu, grossi × REPERE_ECHELLE. */
function repere(paris: Vec3) {
  const p = new THREE.Vector3(...paris), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
  return { q, m: new THREE.Matrix4().compose(p, q, new THREE.Vector3().setScalar(REPERE_ECHELLE)) };
}

/** Le drapeau tourné vers la caméra (scene.ts:242-250) : cap = direction de la caméra dans le repère, écrasement compris. */
function quatDrapeau(c: IntroFrame['camera'], mRepere: THREE.Matrix4): THREE.Quaternion {
  const loc = new THREE.Vector3(...c.position).applyMatrix4(mRepere.clone().invert());
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(-22 * RAD, Math.atan2(loc.x, loc.z), 0, 'YXZ'));
}

/** Une image cachée prend la position de l'image visible la plus proche : pas de traînée de flou quand l'objet surgit. */
function remplirCachees(p: Piste, visible: readonly boolean[]): void {
  const n = visible.length, avant = new Int32Array(n).fill(-1), apres = new Int32Array(n).fill(-1);
  for (let k = 0, v = -1; k < n; k++) { if (visible[k]) v = k; avant[k] = v; }
  for (let k = n - 1, v = -1; k >= 0; k--) { if (visible[k]) v = k; apres[k] = v; }
  for (let k = 0; k < n; k++) {
    if (visible[k]) continue;
    const a = avant[k]!, b = apres[k]!, j = a < 0 ? b : b < 0 ? a : k - a <= b - k ? a : b;
    if (j >= 0) for (let d = 0; d < p.dim; d++) p.valeurs[k * p.dim + d] = p.valeurs[j * p.dim + d]!;
  }
}

/** 9 chiffres significatifs : plus que les flottants 32 bits des F-curves de Blender, et un tiers d'octets en moins. */
const arrondi = (x: number) => Number(x.toPrecision(9));

/**
 * Toutes les pistes d'un cadrage. Objets (noms Blender) et chemins :
 *  - `OB:camera` location, rotation_quaternion — `OB:ecrasement_rot` rotation_quaternion (= la caméra),
 *    `OB:ecrasement_echelle` scale (sx, sy, sx), `OB:ecrasement_retour` rotation_quaternion (son inverse) ;
 *  - `OB:nuages` rotation_euler (0, spin, 0), scale (0 quand three les cache) ;
 *  - `OB:repere` location, rotation_quaternion, scale (fixes) ; ses enfants `OB:point` et `OB:drapeau` location,
 *    scale (0 = caché), et rotation_quaternion du drapeau ;
 *  - `CU:frontiere` bevel_factor_end ; `OB:perle` location (sur `frontiere.json`), scale (0 = cachée) ;
 *  - `OB:logo_00` … `_07`, `OB:titre_00` … `_07` : location (repère local de la caméra, à PROFONDEUR.lettres),
 *    rotation_euler (0, 0, −rot), scale (police · unités/px · échelle), color (1, 1, 1, alpha) ;
 *  - `OB:etoile_00` … `_45` : location (local caméra, à PROFONDEUR.etoiles), scale (rayon en unités), color (1, 1, 1, alpha).
 */
export function cles(cadrage: Cadrage, s: Sources): Cles {
  const video = CADRAGES[cadrage], T = TITRES[cadrage], frames = nombreImages(), rep = repere(s.reperes.paris);
  const pistes = new Map<string, Piste>();
  const poser = (id: string, chemin: string, v: readonly number[]) => {
    const cle = `${id} ${chemin}`;
    let p = pistes.get(cle);
    if (!p) pistes.set(cle, (p = { id, chemin, dim: v.length, valeurs: [] }));
    p.valeurs.push(...v);
  };
  const visible: Record<'OB:point' | 'OB:drapeau' | 'OB:perle', boolean[]> = { 'OB:point': [], 'OB:drapeau': [], 'OB:perle': [] };
  let fovY = NaN;
  for (let k = 0; k < frames; k++) {
    const t = k / IPS_MAITRE, f = frameAt(t, cadrage), c = f.camera, d = Math.hypot(...c.position);
    if (k === 0) fovY = c.fov;
    else if (c.fov !== fovY) throw new Error(`champ de la caméra variable (${c.fov}° à ${t} s) : la caméra de Blender a un champ fixe`);
    if (PROFONDEUR.etoiles < d + RAYON_MAX) throw new Error(`étoiles devant la Terre à ${t} s (caméra à ${d})`);
    if ([...f.logo, ...f.titre].some((a) => a.alpha > 0) && PROFONDEUR.lettres > d - RAYON_MAX) throw new Error(`lettres derrière la Terre à ${t} s (caméra à ${d})`);
    const M = matriceEcrasement(c, f.squash), mRep = M.clone().multiply(rep.m), [qx, qy, qz, qw] = c.quaternion;
    poser('OB:camera', 'location', c.position);
    poser('OB:camera', 'rotation_quaternion', quatBlender(c.quaternion));
    poser('OB:ecrasement_rot', 'rotation_quaternion', quatBlender(c.quaternion));
    poser('OB:ecrasement_echelle', 'scale', [f.squash.sx, f.squash.sy, f.squash.sx]);
    poser('OB:ecrasement_retour', 'rotation_quaternion', quatBlender([-qx, -qy, -qz, qw]));
    const sn = f.clouds.scale > 0.001 ? f.clouds.scale : 0;   // three les cache sous 0,001 (scene.ts:239)
    poser('OB:nuages', 'rotation_euler', [0, f.clouds.spin, 0]);
    poser('OB:nuages', 'scale', [sn, sn, sn]);
    poser('OB:repere', 'location', s.reperes.paris);
    poser('OB:repere', 'rotation_quaternion', quatBlender([rep.q.x, rep.q.y, rep.q.z, rep.q.w]));
    poser('OB:repere', 'scale', [REPERE_ECHELLE, REPERE_ECHELLE, REPERE_ECHELLE]);
    visible['OB:point'].push(f.point.visible);
    poser('OB:point', 'location', [0, f.point.y, 0]);
    poser('OB:point', 'scale', f.point.visible ? [f.point.sxz, f.point.sy, f.point.sxz] : [0, 0, 0]);
    visible['OB:drapeau'].push(f.flag.visible);
    poser('OB:drapeau', 'location', [0, f.flag.y, 0]);
    const qd = quatDrapeau(c, mRep);
    poser('OB:drapeau', 'rotation_quaternion', quatBlender([qd.x, qd.y, qd.z, qd.w]));
    poser('OB:drapeau', 'scale', f.flag.visible ? [f.flag.sx, f.flag.sy, f.flag.sx] : [0, 0, 0]);
    poser('CU:frontiere', 'bevel_factor_end', [f.border]);
    visible['OB:perle'].push(f.bead !== null);
    poser('OB:perle', 'location', surFrontiere(s.frontiere, Math.min(0.9999, f.bead ?? 0)));   // scene.ts:259
    poser('OB:perle', 'scale', f.bead === null ? [0, 0, 0] : [PERLE, PERLE, PERLE]);
    // les deux titres en pâte : chaque lettre autour de son centre mesuré (cadrages.ts), dans le plan de l'image
    const kl = unitesParPx(PROFONDEUR.lettres, c.fov, video);
    for (const [nom, titre, anims] of [['logo', T.logo, f.logo], ['titre', T.titre, f.titre]] as const) {
      anims.forEach((a, i) => {
        const id = `OB:${nom}_${String(i).padStart(2, '0')}`, l = titre.lettres[i]!, e = titre.police * kl * a.echelle;
        poser(id, 'location', versCamera(l.x + a.dx, l.y + a.dy, PROFONDEUR.lettres, c.fov, video));
        poser(id, 'rotation_euler', [0, 0, -a.rot]);   // rot tourne dans le sens horaire à l'écran, comme rotate() en CSS
        poser(id, 'scale', [e, e, e]);
        poser(id, 'color', [1, 1, 1, a.alpha]);
      });
    }
    const ke = unitesParPx(PROFONDEUR.etoiles, c.fov, video);
    f.etoiles.forEach((e, i) => {
      const id = `OB:etoile_${String(i).padStart(2, '0')}`, r = e.r * ke * e.echelle;
      poser(id, 'location', versCamera(e.x, e.y, PROFONDEUR.etoiles, c.fov, video));
      poser(id, 'scale', [r, r, r]);
      poser(id, 'color', [1, 1, 1, e.alpha]);
    });
  }
  for (const [id, vis] of Object.entries(visible))
    for (const p of pistes.values()) if (p.id === id && p.chemin !== 'scale') remplirCachees(p, vis);
  for (const p of pistes.values()) {
    if (p.chemin === 'rotation_quaternion') signesContinus(p.valeurs);
    p.valeurs = p.valeurs.map(arrondi);
  }
  return { version: 1, cadrage, width: video.width, height: video.height, fps: IPS_MAITRE, frames, fovY, pistes: [...pistes.values()] };
}

/**
 * Ancres des bulles en px de la vidéo, de ANCRES_T0 à BULLES_RANGE au pas de 1/ANCRES_IPS : capitale = le centre du point
 * de pâte (Paris), pays = le milieu de la frontière, drapeau = le haut du mât, penché et tourné avec le drapeau (scene.ts:263
 * l'omettait : jusqu'à 45 px d'écart en portrait). Hors cadre, la valeur est gardée telle quelle (le lecteur borne la bulle).
 */
export function ancres(r: Reperes): Ancres {
  const rep = repere(r.paris), n = Math.round((BULLES_RANGE - ANCRES_T0) * ANCRES_IPS) + 1;
  const px = ([x, y]: [number, number]): [number, number] => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  const cadrages = {} as Ancres['cadrages'];
  for (const cadrage of Object.keys(CADRAGES) as Cadrage[]) {
    const video = CADRAGES[cadrage], a: Ancres['cadrages'][Cadrage] = { ...video, capitale: [], pays: [], drapeau: [] };
    for (let i = 0; i < n; i++) {
      const f = frameAt(ANCRES_T0 + i / ANCRES_IPS, cadrage), M = matriceEcrasement(f.camera, f.squash), mRep = M.clone().multiply(rep.m);
      const vers = (m: THREE.Matrix4, p: Vec3) => { const v = new THREE.Vector3(...p).applyMatrix4(m); return px(projeter([v.x, v.y, v.z], f.camera, video)); };
      a.capitale.push(vers(mRep, [0, f.point.visible ? f.point.y : 0, 0]));
      a.pays.push(vers(M, r.frontiereMilieu));
      const mat = new THREE.Matrix4().compose(new THREE.Vector3(0, f.flag.y, 0), quatDrapeau(f.camera, mRep), new THREE.Vector3(f.flag.sx, f.flag.sy, f.flag.sx));
      a.drapeau.push(vers(mRep.clone().multiply(mat), [0, MAT_HM, 0]));
    }
    cadrages[cadrage] = a;
  }
  return { version: 1, fps: ANCRES_IPS, t0: ANCRES_T0, cadrages };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const lire = <T>(f: string): T => {
    try { return JSON.parse(readFileSync(path.join(ICI, '.cache/sources', f), 'utf8')) as T; }
    catch { throw new Error(`.cache/sources/${f} illisible : lancer d'abord npm run intro:sources`); }
  };
  const s: Sources = { reperes: lire<Reperes>('reperes.json'), frontiere: lire<Vec3[]>('frontiere.json') };
  for (const cadrage of Object.keys(CADRAGES) as Cadrage[]) {
    const k = cles(cadrage, s), f = path.join(ICI, `.cache/keys-${cadrage}.json`);
    writeFileSync(f, JSON.stringify(k));
    console.log(`keys-${cadrage}.json : ${k.frames} images, ${k.pistes.length} pistes, ${statSync(f).size} octets`);
  }
  const fa = path.resolve(ICI, '../../public/intro/ancres.json'), a = ancres(s.reperes);
  writeFileSync(fa, JSON.stringify(a));
  console.log(`ancres.json : t0 ${a.t0} s, ${a.cadrages.portrait.capitale.length} instants par bulle, ${statSync(fa).size} octets`);
}
```

- [ ] **Step 8 : la commande.** `web/package.json` (l. 29) : remplacer `"intro:sources": "tsx scripts/intro/sources.ts"` par `"intro:sources": "tsx scripts/intro/sources.ts",` suivi de la ligne `"intro:keys": "tsx scripts/intro/export-keys.ts"`.

- [ ] **Step 9 : vérifier.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/export-keys.test.ts`. Expected : PASS — `Tests  8 passed (8)` (1,2 à 1,7 s au plan : deux exports complets au chargement du fichier, un troisième pour le déterminisme).

- [ ] **Step 10 : exporter.** Run : `cd web && /usr/bin/time -l npm run intro:keys`. Expected :

```text
keys-portrait.json : 2377 images, 220 pistes, 12508923 octets
keys-paysage.json : 2377 images, 220 pistes, 12390977 octets
ancres.json : t0 10.8 s, 325 instants par bulle, 26074 octets
```

puis `1,01 real` et `375586816  maximum resident set size` (relevés au plan sur la chronologie de la Task 1 ; les octets en dépendent). Sans les sources, la commande s'arrête sur `.cache/sources/reperes.json illisible : lancer d'abord npm run intro:sources`.

- [ ] **Step 11 : déterministe.** Run : `cd web && shasum -a 256 scripts/intro/.cache/keys-*.json public/intro/ancres.json > "$TMPDIR/keys-1.sha" && npm run intro:keys > /dev/null && shasum -a 256 scripts/intro/.cache/keys-*.json public/intro/ancres.json | cmp - "$TMPDIR/keys-1.sha" && echo "mêmes octets"`. Expected : `mêmes octets`.

- [ ] **Step 12 : contrôle sous Blender de la piste de la frontière (hors suite, règle 7 des Interfaces).** Créer, hors du dépôt, `$TMPDIR/frontiere-bevel.py` :

```python
# Contrôle de la piste CU:frontiere (Task 3) : spline POLY des 2601 points de frontiere.json, bevel « RESOLUTION ».
import bpy, json, sys, numpy as np
P = np.array(json.load(open(sys.argv[sys.argv.index('--') + 1])))
N = len(P) - 1
cu = bpy.data.curves.new('frontiere', 'CURVE')
cu.dimensions = '3D'
sp = cu.splines.new('POLY')
sp.points.add(N)
sp.points.foreach_set('co', np.hstack([P, np.ones((N + 1, 1))]).ravel())
cu.bevel_mode = 'ROUND'; cu.bevel_depth = 1e-7   # boudin très fin : chaque sommet est sur la frontière
ob = bpy.data.objects.new('frontiere', cu); bpy.context.scene.collection.objects.link(ob)
A, B = P[:-11], P[1:-10]   # sans les derniers points, confondus avec le départ (boucle fermée)
def indice(v):   # indice continu du point de la polyligne le plus proche de v
    t = np.clip(np.sum((v - A) * (B - A), axis=1) / np.maximum(np.sum((B - A) ** 2, axis=1), 1e-30), 0, 1)
    i = int(np.argmin(np.sum((A + (B - A) * t[:, None] - v) ** 2, axis=1)))
    return i + float(t[i])
for mapping in ('RESOLUTION', 'SPLINE'):
    cu.bevel_factor_mapping_start = cu.bevel_factor_mapping_end = mapping
    for b in (0.0, 0.3001, 0.77013):
        cu.bevel_factor_start, cu.bevel_factor_end = 0.0, b
        dg = bpy.context.evaluated_depsgraph_get(); dg.update()
        me = ob.evaluated_get(dg).to_mesh()
        V = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
        ob.evaluated_get(dg).to_mesh_clear()
        fin = max((indice(v) for v in V), default=None)
        print(f'BEVEL {mapping} {b} : attendu {b * N:.2f}, fin du boudin {fin if fin is None else round(fin, 4)}, {len(V)} sommets')
```

Run : `cd web && /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P "$TMPDIR/frontiere-bevel.py" -- scripts/intro/.cache/sources/frontiere.json 2>&1 | node -e "require('fs').readFileSync(0, 'utf8').split('\n').forEach((l) => { if (/BEVEL|Error|Traceback/.test(l)) console.log(l); })"`. Expected (≈ 10 s) :

```text
BEVEL RESOLUTION 0.0 : attendu 0.00, fin du boudin None, 0 sommets
BEVEL RESOLUTION 0.3001 : attendu 780.26, fin du boudin 780.2601, 9384 sommets
BEVEL RESOLUTION 0.77013 : attendu 2002.34, fin du boudin 2002.3385, 24048 sommets
BEVEL SPLINE 0.0 : attendu 0.00, fin du boudin None, 0 sommets
BEVEL SPLINE 0.3001 : attendu 780.26, fin du boudin 842.4721, 10128 sommets
BEVEL SPLINE 0.77013 : attendu 2002.34, fin du boudin 2054.5433, 24672 sommets
```

(« RESOLUTION » suit l'indice des points, donc le paramètre de three ; « SPLINE » suit la longueur vraie et s'en écarte ici de 52 à 62 points.)

- [ ] **Step 13 : suite.** Run : `cd web && npm run check`. Expected : PASS — tsc sans erreur, `Test Files  64 passed (64)`, `Tests  364 passed (364)`.

- [ ] **Step 14 : commit.**

```bash
git add web/package.json web/scripts/intro/lib/axes.ts web/scripts/intro/export-keys.ts web/scripts/intro/__tests__/unit/axes.test.ts web/scripts/intro/__tests__/unit/export-keys.test.ts web/public/intro/ancres.json
git commit -m "fabrique : clés de la scène Blender à chaque 1/120 s et ancres des bulles (ancres.json) — spec intro vidéo §2.2"
```

---

### Task 4 : Scène Blender : socle (Terre en pâte, caméra, lumières, clés linéaires, lanceur)

**Files:**
- Create: `web/scripts/intro/blender/commun.py`, `web/scripts/intro/blender/anim.py`, `web/scripts/intro/blender/scene.py`, `web/scripts/intro/blender/rendre.py`
- Create: `web/scripts/intro/lib/lanceur.ts` (décisions pures du lanceur), `web/scripts/intro/blender.ts` (lanceur)
- Modify: `web/package.json` (scripts `intro:temoins`, `intro:apercu`, `intro:rendu`)
- Test: `web/scripts/intro/blender/essais.py` (essais Python, lancés DANS Blender), `web/scripts/intro/__tests__/unit/lanceur.test.ts` (Vitest)

**Interfaces:**
- Consumes :
  - Task 1 — `web/src/intro/temps.ts` : `INTRO` (`CHUTE`, `D_CHUTE`, `ACCUEIL`, `FIN`), `IPS_MAITRE`, `CADRAGES`, `type Cadrage`.
  - Task 2 — `web/scripts/intro/.cache/sources/` (dossier ignoré par git) : `monde.png` (RGB 8 bits, équirectangulaire), `europe.png` (boîte `europe`), `hauteur.png` (gris 16 bits, 1 canal ; hauteur = v / 65535 · `hauteurMax`, en rayons terrestres), `relief-fin.png` (gris 16 bits, boîte `europe` ; détail = `reliefFinS` · atanh(2 v / 65535 − 1)), `sources.json` `{ hauteurMax, reliefFinS, europe: { lng0, lng1, lat0, lat1 } }` ; l'entrée `'scripts/intro/__tests__/unit/**/*.test.ts'` du projet `unit` de `web/vitest.config.ts` (Task 2, Step 1). Fraîcheur des sources : plus récentes que `scripts/intro/sources.ts`, `lib/peinture.ts`, `lib/terre.ts`.
  - Task 3 — `web/scripts/intro/.cache/keys-<cadrage>.json` (format du contrat : `width`, `height`, `fps`, `frames` = 2377, `fovY` = 20, 220 `pistes`), plus récents que `src/intro/temps.ts`, `timeline.ts`, `cadrages.ts`, `scripts/intro/export-keys.ts`, `lib/axes.ts`, `lib/terre.ts`, `.cache/sources/reperes.json` et `frontiere.json`. Pistes lues par le socle (les 68 autres objets des pistes, ceux de la Task 5, sont ignorés avec un message jusque-là) :

| `id` | `chemin` | `dim` | valeur (repère three.js) |
|---|---|---|---|
| `OB:camera` | `location` | 3 | `IntroFrame.camera.position` |
| `OB:camera` | `rotation_quaternion` | 4 | `camera.quaternion` en `[w, x, y, z]`, signe continu (`quatBlender`) |
| `OB:ecrasement_rot` | `rotation_quaternion` | 4 | le même quaternion que la caméra (B) |
| `OB:ecrasement_echelle` | `scale` | 3 | `[squash.sx, squash.sy, squash.sx]` |
| `OB:ecrasement_retour` | `rotation_quaternion` | 4 | son conjugué `[w, −x, −y, −z]` (Bᵀ) |
- Produces :
  - `rendre.py`, lancé par `Blender -b --factory-startup --python-exit-code 1 --debug-cycles -P scripts/intro/blender/rendre.py -- --mode temoins|apercu|rendu --cadrage portrait|paysage --cache <dossier> [--images 443,985] [--echelle 25] [--echantillons 32] [--neuf]` → `<cache>/frames/<mode>/<cadrage>/f_%04d.png` (RGBA 8 bits, image n ↔ t = (n − 1)/120 s) et `reglages.json` (définition, échantillons, empreinte des clés, empreinte de la scène : sha256 des `.py` de `blender/` hors `essais.py` et des sources lues ; une image n'est reprise que sous la même fiche, sinon refus qui demande `--neuf`) ; journal : `[rendre] f_0443.png 270×585 1.96 s` par image, `[rendre] fini : …` à la fin (Task 6 y lit le temps par image).
  - Python : `commun.REGLAGES` (par mode : `echantillons`, `seuil`, `minimum`, `pourcent`, `flou` ; la Task 6 y recopie ses mesures), `commun.lire_arguments(argv)`, `commun.regler_metal(scene) → str`, `commun.regler_cycles(scene, a, largeur, hauteur)`, `commun.image_complete(chemin, largeur, hauteur) → bool` ; `anim.cuire(cles) → (nb_fcurves: int, pistes_sans_objet: list[str])` ; `rendre.empreinte(chemins) → str` (16 chiffres hexadécimaux), `rendre.scripts() → list[str]`, `rendre.preparer_sortie(dossier, reglages, neuf)`, `rendre.SOURCES_TERRE` (la Task 5 les reprend) ; `scene.construire(scene, dossier_sources, mode, fov)` et les outils réutilisés par la Task 5 : `lin(hexa)`, `vide(nom, parent, quaternion=False)`, `objet(nom, donnees, parent)`, `math_(nt, op, a, b=None, c=None)`, `lisse(nt, x, de, a, vers0=0, vers1=1)`, `pate(nom, couleur, rugosite=0.62, sss_echelle=0.004) → (mat, nt, principled)`, `echantillon(carte, lng, lat)`, `hauteur(carte, src, lng, lat)`, `lire_json(dossier, nom)`, `IPS`, `BOSSE_AMP`.
  - Objets Blender (noms = identifiants des pistes) : `monde` (racine, X +90°), `camera` (champ vertical `fovY`), `cle`, `contre` (soleils enfants de la caméra), `ecrasement_rot` → `ecrasement_echelle` → `ecrasement_retour` → `terre_groupe` → `terre` ; matière `pate_terre` (nœud `fremissement`).
  - TS (`lib/lanceur.ts`) : `type Mode`, `interface Demande { mode; cadrages; images; echelle?; echantillons?; neuf }`, `TEMOINS: readonly { nom: string; t: number }[]` (chute, impact, logo, frontiere, drapeau, titre, fin → images 289, 443, 985, 1465, 1681, 2137, 2377 ; la Task 6 remplace ce bloc tel quel), `imageA(t)`, `lireDemande(argv)`, `argumentsBlender(d, cadrage, rendrePy, cache)`, `refusDisque(octets, mode)`, `perime(cible, nom, sources)`, `peripherique(ligne)`, `DISQUE_MIN_RENDU = 15e9`.
  - npm : `intro:temoins`, `intro:apercu`, `intro:rendu` (options après `--` : `--cadrage`, `--images`, `--echelle`, `--echantillons`, `--neuf`) ; journal complet de Blender dans `web/scripts/intro/.cache/journal-<mode>-<cadrage>.log`.

- [ ] **Step 1 : essais Python (dans Blender).** Créer `web/scripts/intro/blender/essais.py` :

```python
"""
Essais des scripts Blender de la fabrique, dans Blender (hors suite Vitest, sur le Mac) :
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P scripts/intro/blender/essais.py
Code de sortie 1 si un essai échoue.
"""
import math
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True   # pas de __pycache__ à côté des scripts (dépôt)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import anim  # noqa: E402
import commun  # noqa: E402
import rendre  # noqa: E402
import scene  # noqa: E402


def png(largeur, hauteur, entier=True):
    """Octets d'un PNG minimal (signature, IHDR, IEND) ; `entier=False` le coupe avant IEND."""
    ihdr = largeur.to_bytes(4, 'big') + hauteur.to_bytes(4, 'big') + bytes([8, 6, 0, 0, 0])
    corps = b'\x89PNG\r\n\x1a\n' + (13).to_bytes(4, 'big') + b'IHDR' + ihdr + b'\0' * 4 + b'\0' * 64
    return corps + ((0).to_bytes(4, 'big') + b'IEND' + b'\xaeB`\x82' if entier else b'')


class Commun(unittest.TestCase):
    def test_arguments_apres_le_double_tiret(self):
        a = commun.lire_arguments(['blender', '-b', '--', '--mode', 'apercu', '--cache', '/c', '--images', '443,985', '--echelle', '25'])
        self.assertEqual((a.mode, a.cadrage, a.cache, a.images, a.echelle, a.echantillons, a.neuf),
                         ('apercu', 'portrait', '/c', [443, 985], 25, None, False))

    def test_image_complete_seulement_entiere_et_a_la_bonne_taille(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, 'f_0001.png')
            for octets, attendu in ((png(270, 585), True), (png(270, 585, False), False), (png(540, 1170), False), (b'', False)):
                with open(f, 'wb') as fp:
                    fp.write(octets)
                self.assertEqual(commun.image_complete(f, 270, 585), attendu)
            self.assertFalse(commun.image_complete(os.path.join(d, 'absente.png'), 270, 585))


class Anim(unittest.TestCase):
    def test_cles_lineaires_dans_les_slots_et_pistes_sans_objet(self):
        ob = bpy.data.objects.new('essai_anim', None)
        bpy.context.scene.collection.objects.link(ob)
        courbe = bpy.data.objects.new('essai_courbe', bpy.data.curves.new('essai_courbe', 'CURVE'))   # évaluée si utilisée
        bpy.context.scene.collection.objects.link(courbe)
        cles = {'frames': 3, 'pistes': [
            {'id': 'OB:essai_anim', 'chemin': 'location', 'dim': 3, 'valeurs': [0, 0, 0, 2, 4, 6, 4, 8, 12]},
            {'id': 'CU:essai_courbe', 'chemin': 'bevel_factor_end', 'dim': 1, 'valeurs': [0, 0.5, 1]},
            {'id': 'OB:absent', 'chemin': 'scale', 'dim': 3, 'valeurs': [1] * 9},
        ]}
        total, absents = anim.cuire(cles)
        self.assertEqual((total, absents), (4, ['OB:absent']))
        self.assertEqual((bpy.context.scene.frame_start, bpy.context.scene.frame_end), (1, 3))
        ad = ob.animation_data
        self.assertIsNotNone(ad.action_slot)
        for fc in anim.anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot).fcurves:
            self.assertEqual({k.interpolation for k in fc.keyframe_points}, {'LINEAR'})
        # entre deux images (le flou de mouvement y échantillonne) : le milieu, pas la valeur de l'image entière
        bpy.context.scene.frame_set(1, subframe=0.5)
        self.assertAlmostEqual(ob.location.y, 2.0, places=5)
        bpy.context.scene.frame_set(2, subframe=0.25)
        self.assertAlmostEqual(bpy.data.curves['essai_courbe'].bevel_factor_end, 0.625, places=5)

    def test_piste_de_mauvaise_longueur(self):
        bpy.data.objects.new('essai_court', None)
        with self.assertRaises(ValueError):
            anim.cuire({'frames': 3, 'pistes': [{'id': 'OB:essai_court', 'chemin': 'location', 'dim': 3, 'valeurs': [0] * 8}]})


class Rendre(unittest.TestCase):
    def test_empreinte_suit_le_contenu_des_fichiers(self):
        with tempfile.TemporaryDirectory() as d:
            script, source = os.path.join(d, 'scene.py'), os.path.join(d, 'monde.png')
            for f, octets in ((script, b'ROUGE = 0.5\n'), (source, b'\x89PNG')):
                with open(f, 'wb') as fp:
                    fp.write(octets)
            e = rendre.empreinte([script, source])
            self.assertEqual((len(e), rendre.empreinte([script, source])), (16, e))
            with open(script, 'ab') as fp:
                fp.write(b'ROUGE = 0.6\n')   # une matière retouchée
            self.assertNotEqual(rendre.empreinte([script, source]), e)

    def test_scripts_de_la_scene_sans_les_essais(self):
        self.assertEqual([os.path.basename(f) for f in rendre.scripts()], ['anim.py', 'commun.py', 'rendre.py', 'scene.py'])

    def test_reprise_seulement_avec_la_meme_fiche(self):
        with tempfile.TemporaryDirectory() as d:
            sortie = os.path.join(d, 'frames', 'apercu', 'portrait')
            fiche = {'largeur': 270, 'hauteur': 585, 'echantillons': 16, 'cles': 'c' * 16, 'scene': 'a' * 16}
            rendre.preparer_sortie(sortie, fiche, False)
            open(os.path.join(sortie, 'f_0443.png'), 'wb').close()
            rendre.preparer_sortie(sortie, fiche, False)   # même fiche : les images restent (reprise)
            self.assertTrue(os.path.exists(os.path.join(sortie, 'f_0443.png')))
            with self.assertRaises(SystemExit) as refus:
                rendre.preparer_sortie(sortie, {**fiche, 'scene': 'b' * 16}, False)   # scène changée
            self.assertIn(f"(scene : {'a' * 16} → {'b' * 16}) — relancer avec --neuf", str(refus.exception))
            rendre.preparer_sortie(sortie, {**fiche, 'scene': 'b' * 16}, True)   # --neuf : dossier vidé, nouvelle fiche
            self.assertEqual(os.listdir(sortie), ['reglages.json'])


class Terre(unittest.TestCase):
    def test_cube_sphere_fermee_et_tournee_vers_l_exterieur(self):
        d, q = scene.cube_sphere(4)
        self.assertEqual((len(d), len(q)), (6 * 4 * 4 + 2, 6 * 4 * 4))   # sommets d'arête partagés : V = 6n² + 2
        self.assertTrue(np.allclose(np.linalg.norm(d, axis=1), 1.0))
        p = d[q]                                                         # (faces, 4, 3)
        normale = np.cross(p[:, 2] - p[:, 0], p[:, 3] - p[:, 1])
        self.assertTrue(np.all(np.sum(normale * p.mean(axis=1), axis=1) > 0))

    def test_echantillon_bilineaire_boucle_en_longitude(self):
        carte = np.array([[0.0, 1.0, 2.0, 3.0], [4.0, 5.0, 6.0, 7.0]])   # 4 × 2 pixels de 90° × 90°
        self.assertAlmostEqual(float(scene.echantillon(carte, np.array([-135.0]), np.array([45.0]))[0]), 0.0)
        self.assertAlmostEqual(float(scene.echantillon(carte, np.array([-90.0]), np.array([45.0]))[0]), 0.5)
        self.assertAlmostEqual(float(scene.echantillon(carte, np.array([180.0]), np.array([45.0]))[0]), 1.5)   # entre 3 et 0
        self.assertAlmostEqual(float(scene.echantillon(carte, np.array([-135.0]), np.array([0.0]))[0]), 2.0)

    def test_couleur_css_en_lineaire(self):
        self.assertEqual(scene.lin('#ffffff'), (1.0, 1.0, 1.0, 1.0))
        self.assertAlmostEqual(scene.lin('#16173a')[0], 0.0080, places=4)
        self.assertTrue(math.isclose(scene.lin('#808080')[1], 0.2158605, rel_tol=1e-5))


resultat = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
if not resultat.wasSuccessful():
    raise SystemExit(1)
```

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P scripts/intro/blender/essais.py; echo "code $?"`. Expected : FAIL, code 1 :

```
ModuleNotFoundError: No module named 'anim'
Error: script failed, file: 'scripts/intro/blender/essais.py', exiting.
code 1
```

(Sans `--python-exit-code 1`, Blender sort avec le code 0 même quand le script lève : vérifié, d'où l'option partout.)

- [ ] **Step 3 : réglages communs.** Créer `web/scripts/intro/blender/commun.py` :

```python
"""
Fabrique de l'intro vidéo (spec intro vidéo §2.3-2.4) : ce que partagent les scripts Blender — arguments, périphérique
Metal, réglages de Cycles par mode, contrôle des images déjà rendues. Lancé par `scripts/intro/blender.ts`, pas à la main :
  Blender -b --factory-startup [--debug-cycles] -P scripts/intro/blender/rendre.py -- --mode apercu --cadrage portrait --cache …
"""
import argparse
import sys

import bpy

MODES = ('temoins', 'apercu', 'rendu')
CADRAGES = ('portrait', 'paysage')
IPS = 120

# Réglages de Cycles par mode : échantillons, seuil adaptatif et minimum d'échantillons (sans minimum explicite,
# l'échantillonnage adaptatif ne s'arrête jamais avant 64 — recon Blender), définition en % du cadrage, flou de mouvement.
# « temoins » = « rendu » : on mesure sur les témoins le temps par image de la nuit de rendu (Task 6 règle ces valeurs).
REGLAGES = {
    'temoins': {'echantillons': 128, 'seuil': 0.02, 'minimum': 16, 'pourcent': 100, 'flou': True},
    'apercu': {'echantillons': 16, 'seuil': 0.05, 'minimum': 8, 'pourcent': 50, 'flou': True},
    'rendu': {'echantillons': 128, 'seuil': 0.02, 'minimum': 16, 'pourcent': 100, 'flou': True},
}


def lire_arguments(argv=None):
    """Arguments après « -- » (Blender garde les siens avant)."""
    argv = sys.argv if argv is None else argv
    p = argparse.ArgumentParser(prog='rendre.py')
    p.add_argument('--mode', choices=MODES, required=True)
    p.add_argument('--cadrage', choices=CADRAGES, default='portrait')
    p.add_argument('--cache', required=True, help='web/scripts/intro/.cache (sources/, keys-<cadrage>.json, frames/)')
    p.add_argument('--images', default='', help='numéros d’image « 1,600,1200 » ; sinon toutes (ou les 24 vues du sprite)')
    p.add_argument('--echelle', type=int, help='définition en % (remplace celle du mode)')
    p.add_argument('--echantillons', type=int, help='échantillons par pixel (remplace ceux du mode)')
    p.add_argument('--neuf', action='store_true', help='efface les images déjà rendues de ce mode et de ce cadrage')
    a = p.parse_args(argv[argv.index('--') + 1:] if '--' in argv else [])
    a.images = [int(x) for x in a.images.split(',') if x.strip()]
    return a


def regler_metal(scene):
    """Cycles sur le GPU du Mac (Metal) ; lève s'il n'y en a pas : un rendu sur le processeur durerait des jours."""
    cp = bpy.context.preferences.addons['cycles'].preferences
    cp.compute_device_type = 'METAL'
    cp.get_devices()
    metal = [d for d in cp.devices if d.type == 'METAL']
    if not metal:
        raise RuntimeError('aucun périphérique Metal : ' + ', '.join(f'{d.name} ({d.type})' for d in cp.devices))
    for d in cp.devices:
        d.use = d.type == 'METAL'
    scene.cycles.device = 'GPU'
    return metal[0].name


def regler_cycles(scene, a, largeur, hauteur):
    """Cycles, sortie PNG RGBA 8 bits sur fond transparent (la nuit est posée à l'encodage), vue « Standard »."""
    r, c, reg = scene.render, scene.cycles, REGLAGES[a.mode]
    r.engine = 'CYCLES'
    r.resolution_x, r.resolution_y = largeur, hauteur
    r.resolution_percentage = a.echelle or reg['pourcent']
    c.samples = a.echantillons or reg['echantillons']
    c.use_adaptive_sampling = True
    c.adaptive_threshold = reg['seuil']
    c.adaptive_min_samples = min(reg['minimum'], c.samples)
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.denoising_use_gpu = True
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    # la pâte est mate et opaque : peu de rebonds suffisent ; transparence pour les lettres et les étoiles qui s'effacent
    c.max_bounces, c.diffuse_bounces, c.glossy_bounces, c.transmission_bounces = 6, 3, 2, 2
    c.transparent_max_bounces = 8
    c.caustics_reflective = c.caustics_refractive = False
    r.film_transparent = True
    # « Standard » : les couleurs peintes restent les leurs (AgX, le défaut, les délave) ; même nuit que l'accueil
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    r.use_motion_blur = reg['flou']
    r.motion_blur_shutter = 0.5
    r.motion_blur_position = 'CENTER'
    # la géométrie de la Terre est fixe : gardée d'une image à l'autre (sinon reconstruite à chaque image)
    r.use_persistent_data = True
    r.fps, r.fps_base = IPS, 1.0
    im = r.image_settings
    im.file_format = 'PNG'
    im.color_mode = 'RGBA'
    im.color_depth = '8'
    im.compression = 15
    # reprise : rendre.py garde les images entières déjà écrites (image_complete) ; Blender n'écrase rien de lui-même
    r.use_overwrite = False
    r.use_placeholder = False


def image_complete(chemin, largeur, hauteur):
    """Une image déjà rendue est gardée si elle est entière (fin IEND) et à la définition demandée."""
    try:
        with open(chemin, 'rb') as f:
            tete = f.read(24)
            f.seek(-12, 2)
            fin = f.read(12)
    except OSError:
        return False
    return (tete[:8] == b'\x89PNG\r\n\x1a\n' and int.from_bytes(tete[16:20], 'big') == largeur
            and int.from_bytes(tete[20:24], 'big') == hauteur and fin[4:8] == b'IEND')
```

- [ ] **Step 4 : cuisson des clés.** Créer `web/scripts/intro/blender/anim.py` :

```python
"""
Cuisson des clés de la chronologie (keys-<cadrage>.json, écrit par export-keys.ts) en F-curves de Blender. Interpolation
LINÉAIRE partout : le flou de mouvement échantillonne entre deux images, une clé constante y figerait l'objet (recon
Blender). Écriture en bloc (`foreach_set`, ~250 fois plus rapide que `keyframe_insert`) dans les slots d'action de
Blender 5 (`Action.fcurves` n'existe plus). Image n ↔ temps (n − 1) / fps.
"""
import numpy as np
import bpy
from bpy_extras import anim_utils

# « OB:camera » → bpy.data.objects['camera'] ; « CU:frontiere » → bpy.data.curves['frontiere']
GENRES = {'OB': ('objects', 'OBJECT'), 'CU': ('curves', 'CURVE'), 'MA': ('materials', 'MATERIAL')}


def cible(ident):
    """Le bloc de données visé par une piste, ou None s'il n'est pas dans la scène."""
    genre, nom = ident.split(':', 1)
    if genre not in GENRES:
        raise KeyError(f'piste {ident} : genre « {genre} » inconnu ({", ".join(GENRES)})')
    coll, type_id = GENRES[genre]
    return getattr(bpy.data, coll).get(nom), type_id


def cuire(cles):
    """Pose les pistes ; rend le nombre de F-curves écrites et les identifiants des pistes sans objet dans la scène."""
    n = cles['frames']
    images = np.arange(1, n + 1, dtype=np.float32)
    lineaire = np.ones(n, dtype=np.int32)   # 1 = LINEAR (0 = CONSTANT)
    sacs, total, absents = {}, 0, []
    for piste in cles['pistes']:
        bloc, type_id = cible(piste['id'])
        if bloc is None:
            absents.append(piste['id'])
            continue
        valeurs = np.asarray(piste['valeurs'], dtype=np.float32)
        if valeurs.size != n * piste['dim']:
            raise ValueError(f"piste {piste['id']} {piste['chemin']} : {valeurs.size} valeurs pour {n} images × {piste['dim']}")
        valeurs = valeurs.reshape(n, piste['dim'])
        if piste['id'] not in sacs:
            action = bpy.data.actions.new(piste['id'])
            ad = bloc.animation_data_create()
            ad.action = action
            slot = action.slots.new(id_type=type_id, name=bloc.name)
            ad.action_slot = slot
            sacs[piste['id']] = anim_utils.action_ensure_channelbag_for_slot(action, slot)
        for i in range(piste['dim']):
            fc = sacs[piste['id']].fcurves.new(piste['chemin'], index=i)
            fc.keyframe_points.add(n)
            co = np.empty(2 * n, dtype=np.float32)
            co[0::2], co[1::2] = images, valeurs[:, i]
            fc.keyframe_points.foreach_set('co', co)
            fc.keyframe_points.foreach_set('interpolation', lineaire)
            fc.update()
            total += 1
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, n
    return total, sorted(set(absents))
```

- [ ] **Step 5 : la scène (socle).** Créer `web/scripts/intro/blender/scene.py` :

```python
"""
Scène de l'intro en pâte à modeler, construite par script (spec intro vidéo §2.3) ; référence visuelle : l'ancienne scène
three.js `src/intro/scene.ts`. Tout est en coordonnées three.js (Y en haut) sous l'objet racine `monde` (rotation X +90°) :
les clés de export-keys.ts s'y appliquent telles quelles, seul l'ordre du quaternion change ([w, x, y, z]).
  monde ─ camera ─ cle, contre (lumières liées à la caméra)
        └ ecrasement_rot ─ ecrasement_echelle ─ ecrasement_retour ─ terre_groupe ─ terre
L'écrasement de l'impact est B·S·Bᵀ (B : orientation de la caméra, S : (sx, sy, sx)) : trois Empties en chaîne, sans
décomposer le cisaillement. La géométrie de la Terre est FIXE (rendu à données persistantes) : le relief est dans le
maillage, le relief fin, le frémissement et les empreintes de doigts sont dans la matière (bump).
"""
import json
import math
import os

import bpy
import numpy as np
from bpy_extras import anim_utils
from mathutils import Vector

IPS = 120
# cellules par arête de la cube-sphère : 768 → 3,5 millions de sommets, ~0,12° entre deux sommets (≈ 3 px au gros plan)
SUBDIV = {'temoins': 768, 'apercu': 384, 'rendu': 768}
# pâte « roulée à la main » (scene.ts) : bosses de 0,0022 rayon, ~8° de large
BOSSE_AMP, BOSSE_FREQ = 0.0022, 7.0
# frémissement : ondulation lente et continue de la surface (spec §3.2), dans le bump
FREMIT_AMP, FREMIT_ECHELLE, FREMIT_VITESSE = 0.0009, 5.0, 0.35
# empreintes de doigts : une cellule de Voronoi sur trois (cellules de ~1/3 de rayon) porte une empreinte de 0,12 rayon
# à 12 sillons, visibles au gros plan seulement (un sillon ≈ 17 px), à peine au bump
EMPREINTE_DENSITE, EMPREINTE_RAYON, EMPREINTE_SILLONS, EMPREINTE_AMP = 3.0, 0.36, 12.0, 0.0005


def lin(hexa):
    """Couleur CSS « #rrggbb » (sRGB) → couleur linéaire de la scène, alpha 1."""
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# ---------- petits outils ----------

def vide(nom, parent, quaternion=False):
    """Empty rattaché à la scène et à son parent (inverse de parenté identité : la clé s'applique telle quelle)."""
    ob = bpy.data.objects.new(nom, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    if quaternion:
        ob.rotation_mode = 'QUATERNION'
    return ob


def objet(nom, donnees, parent):
    ob = bpy.data.objects.new(nom, donnees)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    return ob


def math_(nt, op, a, b=None, c=None):
    """Nœud Math : a, b, c sont des sorties de nœuds ou des nombres ; rend la sortie."""
    nd = nt.nodes.new('ShaderNodeMath')
    nd.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            nd.inputs[i].default_value = v
        else:
            nt.links.new(v, nd.inputs[i])
    return nd.outputs[0]


def lisse(nt, x, de, a, vers0=0.0, vers1=1.0):
    """smoothstep(de, a, x) remis sur [vers0, vers1] (Map Range, interpolation SMOOTHSTEP, bornée)."""
    nd = nt.nodes.new('ShaderNodeMapRange')
    nd.interpolation_type = 'SMOOTHSTEP'
    nd.clamp = True
    nt.links.new(x, nd.inputs['Value'])
    nd.inputs['From Min'].default_value, nd.inputs['From Max'].default_value = de, a
    nd.inputs['To Min'].default_value, nd.inputs['To Max'].default_value = vers0, vers1
    return nd.outputs['Result']


def image(nt, chemin, donnees, extension):
    nd = nt.nodes.new('ShaderNodeTexImage')
    nd.image = bpy.data.images.load(chemin, check_existing=True)
    if donnees:
        nd.image.colorspace_settings.name = 'Non-Color'
    nd.interpolation = 'Linear'
    nd.extension = extension
    return nd


def anime_lineaire(socket, par_seconde):
    """Valeur d'entrée de nœud qui croît de `par_seconde` par seconde de la scène (image 1 → 0), sans fin."""
    socket.default_value = 0.0
    socket.keyframe_insert('default_value', frame=1)
    socket.default_value = par_seconde / IPS
    socket.keyframe_insert('default_value', frame=2)
    ad = socket.id_data.animation_data
    for fc in anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot).fcurves:
        fc.keyframe_points.foreach_set('interpolation', [1] * len(fc.keyframe_points))   # 1 = LINEAR
        fc.extrapolation = 'LINEAR'


def pate(nom, couleur, rugosite=0.62, sss_echelle=0.004):
    """Matière « pâte à modeler » (scene.ts : roughness 0.62, sheen 0.45 / 0.7) + diffusion sous la surface légère ;
    l'opacité vient de la couleur de l'objet (Object Info › Alpha), animée par les clés (lettres, étoiles)."""
    mat = bpy.data.materials.new(nom)
    mat.displacement_method = 'BUMP'
    nt = mat.node_tree
    nt.nodes.clear()
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = lin(couleur) if isinstance(couleur, str) else couleur
    p.inputs['Roughness'].default_value = rugosite
    p.inputs['Sheen Weight'].default_value = 0.45
    p.inputs['Sheen Roughness'].default_value = 0.7
    p.inputs['Subsurface Weight'].default_value = 0.12
    p.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.25)
    p.inputs['Subsurface Scale'].default_value = sss_echelle
    nt.links.new(nt.nodes.new('ShaderNodeObjectInfo').outputs['Alpha'], p.inputs['Alpha'])
    nt.links.new(p.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    return mat, nt, p


# ---------- la Terre ----------

def cube_sphere(n):
    """Directions unitaires et quadrilatères d'une cube-sphère de n × n cellules par face (sommets des arêtes partagés,
    faces tournées vers l'extérieur). Les cellules restent presque carrées partout : ni pincement aux pôles comme une
    sphère UV, ni la minute d'évaluation que celle-ci coûte (recon Blender)."""
    k = np.arange(n + 1)
    a, b = np.meshgrid(k, k, indexing='ij')
    pts, quads, m = [], [], n + 1
    i, j = np.meshgrid(np.arange(n), np.arange(n), indexing='ij')
    q = np.stack([i * m + j, (i + 1) * m + j, (i + 1) * m + j + 1, i * m + j + 1], axis=-1).reshape(-1, 4)
    for axe in range(3):
        for signe in (-1, 1):
            p = np.empty((m, m, 3), np.int64)
            p[..., axe] = signe * n
            p[..., (axe + 1) % 3] = 2 * a - n
            p[..., (axe + 2) % 3] = 2 * b - n
            quads.append((q if signe > 0 else q[:, ::-1]) + len(pts) * m * m)
            pts.append(p.reshape(-1, 3))
    pts = np.concatenate(pts)
    cote = 2 * n + 1
    uniques, inverse = np.unique(((pts[:, 0] + n) * cote + pts[:, 1] + n) * cote + pts[:, 2] + n, return_inverse=True)
    c = np.stack([uniques // (cote * cote), (uniques // cote) % cote, uniques % cote], axis=-1) - n
    # projection « à angles égaux » : tan(c·π/4) avant normalisation, des cellules de même taille au centre et aux coins
    c = np.tan(c / n * (math.pi / 4))
    return c / np.linalg.norm(c, axis=1, keepdims=True), inverse.reshape(-1)[np.concatenate(quads)]


def lire_gris16(chemin):
    """PNG gris 16 bits → tableau (hauteur, largeur) de 0 à 1, première ligne au nord (Blender range ses pixels du bas)."""
    img = bpy.data.images.load(chemin, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1, :, 0].copy()


def echantillon(carte, lng, lat):
    """Lecture bilinéaire d'une carte équirectangulaire (degrés), bouclée en longitude (comme scene.ts)."""
    h, w = carte.shape
    x, y = (lng + 180) / 360 * w - 0.5, (90 - lat) / 180 * h - 0.5
    x0 = np.floor(x).astype(np.int64)
    y0 = np.clip(np.floor(y).astype(np.int64), 0, h - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    fx, fy = x - x0, np.clip(y - y0, 0, 1)
    xa, xb = x0 % w, (x0 + 1) % w
    return (carte[y0, xa] * (1 - fx) + carte[y0, xb] * fx) * (1 - fy) + (carte[y1, xa] * (1 - fx) + carte[y1, xb] * fx) * fy


def bosse(p, graine):
    """Bruit de valeur 3D lissé, de −1 à 1 : le `bruit3` de scene.ts (mêmes constantes de hachage, en entiers 32 bits)."""
    i = np.floor(p).astype(np.int64)
    f = p - i
    s = f * f * (3 - 2 * f)

    def h(dx, dy, dz):
        n = ((i[:, 0] + dx) * 374761393 + (i[:, 1] + dy) * 668265263 + (i[:, 2] + dz) * 2147483647 + graine * 1442695041) & 0xFFFFFFFF
        n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
        return (n ^ (n >> 16)) / 4294967295.0

    def m(a, b, t):
        return a + (b - a) * t

    x, y, z = s[:, 0], s[:, 1], s[:, 2]
    return m(m(m(h(0, 0, 0), h(1, 0, 0), x), m(h(0, 1, 0), h(1, 1, 0), x), y),
             m(m(h(0, 0, 1), h(1, 0, 1), x), m(h(0, 1, 1), h(1, 1, 1), x), y), z) * 2 - 1


def hauteur(carte, src, lng, lat):
    """Hauteur du relief caricaturé (rayons terrestres) : hauteur.png × hauteurMax (sources.json)."""
    return echantillon(carte, lng, lat) * src['hauteurMax']


def maillage_terre(carte, src, n):
    d, quads = cube_sphere(n)
    lng = np.degrees(np.arctan2(-d[:, 2], d[:, 0]))
    lat = np.degrees(np.arcsin(np.clip(d[:, 1], -1, 1)))
    r = 1 + hauteur(carte, src, lng, lat) + BOSSE_AMP * bosse(d * BOSSE_FREQ, 7)
    co = (d * r[:, None]).astype(np.float32)
    me = bpy.data.meshes.new('terre')
    me.vertices.add(len(co))
    me.vertices.foreach_set('co', co.ravel())
    me.loops.add(quads.size)
    me.loops.foreach_set('vertex_index', quads.astype(np.int32).ravel())
    me.polygons.add(len(quads))
    me.polygons.foreach_set('loop_start', np.arange(0, quads.size, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.shade_smooth()
    return me


def matiere_terre(dossier, src):
    """La peinture du monde, relayée par celle de l'Europe (fondu de 3° sur les bords de sa boîte), lues par la direction
    du point (pas d'UV, pas de couture au 180ᵉ méridien) ; relief fin de l'Europe, frémissement et empreintes en bump."""
    mat, nt, p = pate('pate_terre', (1, 1, 1, 1))
    co = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']   # repère three de la Terre (fixe, avant l'écrasement)
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(co, xyz.inputs[0])
    norme = nt.nodes.new('ShaderNodeVectorMath')
    norme.operation = 'LENGTH'
    nt.links.new(co, norme.inputs[0])
    lon = math_(nt, 'ARCTAN2', math_(nt, 'MULTIPLY', xyz.outputs['Z'], -1.0), xyz.outputs['X'])   # atan2(−z, x)
    lat = math_(nt, 'ARCSINE', math_(nt, 'DIVIDE', xyz.outputs['Y'], norme.outputs['Value']))
    uv = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(math_(nt, 'MULTIPLY_ADD', lon, 1 / (2 * math.pi), 0.5), uv.inputs['X'])
    nt.links.new(math_(nt, 'MULTIPLY_ADD', lat, 1 / math.pi, 0.5), uv.inputs['Y'])
    monde = image(nt, os.path.join(dossier, 'monde.png'), False, 'REPEAT')
    nt.links.new(uv.outputs[0], monde.inputs['Vector'])
    # la boîte de l'Europe, en degrés
    E = src['europe']
    lng_d, lat_d = math_(nt, 'DEGREES', lon), math_(nt, 'DEGREES', lat)
    uve = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(math_(nt, 'MULTIPLY_ADD', lng_d, 1 / (E['lng1'] - E['lng0']), -E['lng0'] / (E['lng1'] - E['lng0'])), uve.inputs['X'])
    nt.links.new(math_(nt, 'MULTIPLY_ADD', lat_d, 1 / (E['lat1'] - E['lat0']), -E['lat0'] / (E['lat1'] - E['lat0'])), uve.inputs['Y'])
    europe = image(nt, os.path.join(dossier, 'europe.png'), False, 'EXTEND')
    nt.links.new(uve.outputs[0], europe.inputs['Vector'])
    bord = math_(nt, 'MINIMUM', math_(nt, 'MINIMUM', math_(nt, 'SUBTRACT', lng_d, E['lng0']), math_(nt, 'SUBTRACT', E['lng1'], lng_d)),
                 math_(nt, 'MINIMUM', math_(nt, 'SUBTRACT', lat_d, E['lat0']), math_(nt, 'SUBTRACT', E['lat1'], lat_d)))
    poids = lisse(nt, bord, 0.0, 3.0)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(poids, mix.inputs['Factor'])
    nt.links.new(monde.outputs['Color'], mix.inputs['A'])
    nt.links.new(europe.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    # relief fin (rayons terrestres) : codé 0,5 + 0,5·tanh(h / S) → h = S·atanh(2v − 1), nul hors de la boîte
    rf = image(nt, os.path.join(dossier, 'relief-fin.png'), True, 'EXTEND')
    nt.links.new(uve.outputs[0], rf.inputs['Vector'])
    x = math_(nt, 'MINIMUM', math_(nt, 'MAXIMUM', math_(nt, 'MULTIPLY_ADD', rf.outputs['Color'], 2.0, -1.0), -0.999), 0.999)
    atanh = math_(nt, 'MULTIPLY', math_(nt, 'LOGARITHM', math_(nt, 'DIVIDE', math_(nt, 'ADD', x, 1.0), math_(nt, 'SUBTRACT', 1.0, x)), math.e), 0.5)
    relief = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', atanh, src['reliefFinS']), poids)
    # frémissement : bruit 4D dont la 4ᵉ dimension avance avec le temps de la scène
    fremit = nt.nodes.new('ShaderNodeTexNoise')
    fremit.noise_dimensions = '4D'
    fremit.name = 'fremissement'
    nt.links.new(co, fremit.inputs['Vector'])
    fremit.inputs['Scale'].default_value = FREMIT_ECHELLE
    fremit.inputs['Detail'].default_value = 2.0
    anime_lineaire(fremit.inputs['W'], FREMIT_VITESSE)
    onde = math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', fremit.outputs['Fac'], 0.5), FREMIT_AMP)
    # empreintes de doigts : sillons concentriques (un peu tordus) autour des germes d'un Voronoi, une cellule sur trois
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    nt.links.new(co, vor.inputs['Vector'])
    vor.inputs['Scale'].default_value = EMPREINTE_DENSITE
    tord = nt.nodes.new('ShaderNodeTexNoise')
    nt.links.new(co, tord.inputs['Vector'])
    tord.inputs['Scale'].default_value = 60.0
    d = math_(nt, 'MULTIPLY_ADD', tord.outputs['Fac'], 0.03, vor.outputs['Distance'])
    sillons = math_(nt, 'SINE', math_(nt, 'MULTIPLY', d, 2 * math.pi * EMPREINTE_SILLONS / EMPREINTE_RAYON))
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(vor.outputs['Color'], sep.inputs[0])
    presente = math_(nt, 'GREATER_THAN', sep.outputs[0], 0.66)
    masque = math_(nt, 'MULTIPLY', lisse(nt, d, 0.55 * EMPREINTE_RAYON, EMPREINTE_RAYON, 1.0, 0.0), presente)
    empreinte = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', sillons, masque), EMPREINTE_AMP)
    bump = nt.nodes.new('ShaderNodeBump')
    nt.links.new(math_(nt, 'ADD', math_(nt, 'ADD', relief, onde), empreinte), bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return mat


# ---------- caméra, lumières, ambiance ----------

def camera(scene, monde, fov):
    """Caméra de la chronologie : champ VERTICAL de `fov` degrés (comme three), regarde son −Z local, Y en haut."""
    cd = bpy.data.cameras.new('camera')
    cd.sensor_fit = 'VERTICAL'
    cd.angle_y = math.radians(fov)
    cd.clip_start, cd.clip_end = 0.05, 3000.0
    cam = objet('camera', cd, monde)
    cam.rotation_mode = 'QUATERNION'
    scene.camera = cam
    return cam


def lumieres(cam):
    """La clé chaude en haut à gauche de l'image (ombres), le contre-jour derrière (scene.ts : 2,7 et 1,5), toutes deux
    liées à la caméra. Un soleil éclaire le long de son −Z : son +Z vise la lumière."""
    for nom, couleur, force, direction, ombre in (('cle', '#ffe9cc', 2.7, (-0.55, 0.62, 0.78), True),
                                                  ('contre', '#9cc8ff', 1.5, (3.0, 1.4, -4.0), False)):
        ld = bpy.data.lights.new(nom, 'SUN')
        ld.color = lin(couleur)[:3]
        ld.energy = force
        ld.angle = math.radians(2.0)
        ld.use_shadow = ombre
        ob = objet(nom, ld, cam)
        ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())


def ambiance(scene):
    """Lumière d'ambiance douce (l'hémisphère et le RoomEnvironment de scene.ts) : claire au-dessus de l'image, violette
    en dessous, prise en repère CAMÉRA comme la clé et le contre-jour. Le fond reste transparent (film)."""
    w = bpy.data.worlds.new('ambiance')
    scene.world = w
    nt = w.node_tree
    nt.nodes.clear()
    vt = nt.nodes.new('ShaderNodeVectorTransform')
    vt.vector_type, vt.convert_from, vt.convert_to = 'VECTOR', 'WORLD', 'CAMERA'
    nt.links.new(nt.nodes.new('ShaderNodeTexCoord').outputs['Generated'], vt.inputs[0])
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(vt.outputs[0], xyz.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(lisse(nt, xyz.outputs['Y'], -1.0, 1.0), mix.inputs['Factor'])
    mix.inputs['A'].default_value = lin('#2a2350')
    mix.inputs['B'].default_value = lin('#e6eeff')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 0.35
    nt.links.new(mix.outputs['Result'], bg.inputs['Color'])
    nt.links.new(bg.outputs[0], nt.nodes.new('ShaderNodeOutputWorld').inputs['Surface'])


# ---------- la scène ----------

def lire_json(dossier, nom):
    with open(os.path.join(dossier, nom), encoding='utf-8') as f:
        return json.load(f)


def construire(scene, dossier, mode, fov):
    """Vide la scène de démarrage et construit le socle : racine, caméra, lumières, ambiance, écrasement, Terre. Les
    objets animés portent les noms des pistes de keys-<cadrage>.json (anim.py)."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    src = lire_json(dossier, 'sources.json')
    carte = lire_gris16(os.path.join(dossier, 'hauteur.png'))
    monde = vide('monde', None)
    monde.rotation_euler = (math.pi / 2, 0.0, 0.0)   # three (Y en haut) → Blender (Z en haut)
    cam = camera(scene, monde, fov)
    lumieres(cam)
    ambiance(scene)
    ecrasement = vide('ecrasement_retour', vide('ecrasement_echelle', vide('ecrasement_rot', monde, True)), True)
    groupe = vide('terre_groupe', ecrasement)
    me = maillage_terre(carte, src, SUBDIV[mode])
    me.materials.append(matiere_terre(dossier, src))
    objet('terre', me, groupe)
```

- [ ] **Step 6 : point d'entrée Blender.** Créer `web/scripts/intro/blender/rendre.py` :

```python
"""
Point d'entrée Blender de la fabrique (spec intro vidéo §2.4), lancé par `npm run intro:<mode>` (scripts/intro/blender.ts) :
  temoins : quelques instants clés (--images, donnés par blender.ts depuis temps.ts) à pleine qualité, pour mesurer ;
  apercu  : toutes les images, définition et échantillons réduits, pour juger le rythme ;
  rendu   : toutes les images à pleine qualité (la nuit).
Sortie : <cache>/frames/<mode>/<cadrage>/f_0001.png … (RGBA 8 bits, image n ↔ t = (n − 1) / 120 s). Une image entière
déjà écrite est gardée (reprise après un arrêt) ; un dossier rendu avec d'autres réglages, d'autres clés ou une autre
scène (scripts de blender/, sources) est refusé sans --neuf : une vidéo ne mélange ni deux qualités ni deux scènes.
"""
import hashlib
import json
import os
import shutil
import sys
import time

sys.dont_write_bytecode = True   # pas de __pycache__ à côté des scripts (dépôt)
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import bpy  # noqa: E402

import anim  # noqa: E402
import commun  # noqa: E402
import scene as construction  # noqa: E402

# Les sources que lit la construction de la Terre (npm run intro:sources)
SOURCES_TERRE = ('sources.json', 'hauteur.png', 'monde.png', 'europe.png', 'relief-fin.png')


def empreinte(chemins):
    """16 chiffres hexadécimaux du sha256 des fichiers donnés (nom et contenu de chacun, dans l'ordre)."""
    h = hashlib.sha256()
    for chemin in chemins:
        h.update(os.path.basename(chemin).encode() + b'\0')
        with open(chemin, 'rb') as f:
            for bloc in iter(lambda: f.read(1 << 20), b''):
                h.update(bloc)
    return h.hexdigest()[:16]


def scripts():
    """Les scripts qui construisent et règlent la scène : tous les .py de blender/, sauf les essais."""
    return [os.path.join(ICI, f) for f in sorted(os.listdir(ICI)) if f.endswith('.py') and f != 'essais.py']


def preparer_sortie(dossier, reglages, neuf):
    """Crée le dossier de sortie ; refuse d'y mêler des images faites avec d'autres réglages, d'autres clés ou une autre
    scène (sauf --neuf, qui l'efface) : après un changement de matière, d'objet ou de source, rien de périmé n'est repris."""
    fiche = os.path.join(dossier, 'reglages.json')
    if neuf and os.path.isdir(dossier):
        shutil.rmtree(dossier)
    if os.path.exists(fiche):
        with open(fiche, encoding='utf-8') as f:
            avant = json.load(f)
        if avant != reglages:
            ecarts = ', '.join(f'{k} : {avant.get(k)} → {reglages.get(k)}'
                               for k in sorted(set(avant) | set(reglages)) if avant.get(k) != reglages.get(k))
            raise SystemExit(f"[rendre] {dossier} : images faites avec d'autres réglages ({ecarts}) — relancer avec --neuf")
    os.makedirs(dossier, exist_ok=True)
    with open(fiche, 'w', encoding='utf-8') as f:
        json.dump(reglages, f)


def main():
    a = commun.lire_arguments()
    debut = time.time()
    scene = bpy.context.scene
    print(f'[rendre] périphérique : {commun.regler_metal(scene)}', flush=True)
    sources = os.path.join(a.cache, 'sources')
    chemin_cles = os.path.join(a.cache, f'keys-{a.cadrage}.json')
    with open(chemin_cles, encoding='utf-8') as f:
        cles = json.load(f)
    construction.construire(scene, sources, a.mode, cles['fovY'])
    commun.regler_cycles(scene, a, cles['width'], cles['height'])
    courbes, absents = anim.cuire(cles)
    print(f'[rendre] scène construite en {time.time() - debut:.1f} s ; {courbes} F-curves, {cles["frames"]} images', flush=True)
    if absents:
        print(f'[rendre] {len(absents)} pistes sans objet dans la scène, ignorées : {", ".join(absents[:4])}…', flush=True)
    images = a.images or list(range(1, cles['frames'] + 1))
    hors = [n for n in images if not 1 <= n <= cles['frames']]
    if hors:
        raise SystemExit(f'[rendre] images hors de 1…{cles["frames"]} : {hors}')
    r = scene.render
    largeur, hauteur = r.resolution_x * r.resolution_percentage // 100, r.resolution_y * r.resolution_percentage // 100
    sortie = os.path.join(a.cache, 'frames', a.mode, a.cadrage)
    preparer_sortie(sortie, {'largeur': largeur, 'hauteur': hauteur, 'echantillons': scene.cycles.samples,
                             'cles': empreinte([chemin_cles]),
                             'scene': empreinte(scripts() + [os.path.join(sources, s) for s in SOURCES_TERRE])}, a.neuf)
    gardees, durees = 0, []
    for n in images:
        chemin = os.path.join(sortie, f'f_{n:04d}.png')
        if commun.image_complete(chemin, largeur, hauteur):
            gardees += 1
            continue
        scene.frame_set(n)
        r.filepath = chemin
        t = time.time()
        bpy.ops.render.render(write_still=True)
        durees.append(time.time() - t)
        print(f'[rendre] {os.path.basename(chemin)} {largeur}×{hauteur} {durees[-1]:.2f} s', flush=True)
    moyenne = sum(durees) / len(durees) if durees else 0.0
    print(f'[rendre] fini : {len(durees)} images rendues (moyenne {moyenne:.2f} s), {gardees} gardées, '
          f'{time.time() - debut:.1f} s en tout → {sortie}', flush=True)


if __name__ == '__main__':   # lancé par Blender -P ; essais.py l'importe sans rien rendre
    main()
```

- [ ] **Step 7 : vérifier.** Run : `cd web && /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P scripts/intro/blender/essais.py; echo "code $?"`. Expected : PASS :

```
test_cles_lineaires_dans_les_slots_et_pistes_sans_objet (__main__.Anim.test_cles_lineaires_dans_les_slots_et_pistes_sans_objet) ... ok
test_piste_de_mauvaise_longueur (__main__.Anim.test_piste_de_mauvaise_longueur) ... ok
test_arguments_apres_le_double_tiret (__main__.Commun.test_arguments_apres_le_double_tiret) ... ok
test_image_complete_seulement_entiere_et_a_la_bonne_taille (__main__.Commun.test_image_complete_seulement_entiere_et_a_la_bonne_taille) ... ok
test_empreinte_suit_le_contenu_des_fichiers (__main__.Rendre.test_empreinte_suit_le_contenu_des_fichiers) ... ok
test_reprise_seulement_avec_la_meme_fiche (__main__.Rendre.test_reprise_seulement_avec_la_meme_fiche) ... ok
test_scripts_de_la_scene_sans_les_essais (__main__.Rendre.test_scripts_de_la_scene_sans_les_essais) ... ok
test_couleur_css_en_lineaire (__main__.Terre.test_couleur_css_en_lineaire) ... ok
test_cube_sphere_fermee_et_tournee_vers_l_exterieur (__main__.Terre.test_cube_sphere_fermee_et_tournee_vers_l_exterieur) ... ok
test_echantillon_bilineaire_boucle_en_longitude (__main__.Terre.test_echantillon_bilineaire_boucle_en_longitude) ... ok
Ran 10 tests in 0.004s
OK
code 0
```

(Le Step 2 échouait d'abord sur `anim` ; `commun.py`, `anim.py`, `scene.py` et `rendre.py` écrits, les 10 essais passent, dont les trois de `Rendre` : empreinte, scripts de la scène, reprise refusée sans `--neuf` quand la scène a changé.)

- [ ] **Step 8 : essais du lanceur.** (Le motif `scripts/intro/__tests__/unit/**/*.test.ts` est dans `web/vitest.config.ts` depuis la Task 2.) Créer `web/scripts/intro/__tests__/unit/lanceur.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { INTRO } from '../../../../src/intro/temps';
import { argumentsBlender, DISQUE_MIN_RENDU, imageA, lireDemande, perime, peripherique, refusDisque, TEMOINS } from '../../lib/lanceur';

const temoins = TEMOINS.map((x) => imageA(x.t));

describe('lanceur de Blender (fabrique de l’intro vidéo, spec §2.4)', () => {
  it('numérote les images comme rendre.py : image n ↔ t = (n − 1) / 120 s', () => {
    expect(imageA(0)).toBe(1);
    expect(imageA(3.68)).toBe(443);
    expect(imageA(19.8)).toBe(2377);
  });

  it('témoins : des instants de l’intro dans l’ordre, jusqu’à la dernière image', () => {
    expect(temoins).toEqual([...temoins].sort((a, b) => a - b));
    expect(new Set(temoins).size).toBe(temoins.length);
    expect(temoins[0]).toBeGreaterThan(imageA(INTRO.CHUTE));
    expect(temoins.at(-1)).toBe(imageA(INTRO.FIN));
  });

  it('lit la demande : mode, cadrages (les deux par défaut), images (les témoins par défaut), options', () => {
    expect(lireDemande(['apercu'])).toEqual({ mode: 'apercu', cadrages: ['portrait', 'paysage'], images: [], neuf: false });
    expect(lireDemande(['temoins', '--cadrage', 'paysage'])).toEqual({ mode: 'temoins', cadrages: ['paysage'], images: temoins, neuf: false });
    expect(lireDemande(['apercu', '--cadrage', 'portrait', '--images', '443,985', '--echelle', '25', '--echantillons', '8', '--neuf']))
      .toEqual({ mode: 'apercu', cadrages: ['portrait'], images: [443, 985], echelle: 25, echantillons: 8, neuf: true });
    expect(() => lireDemande(['film'])).toThrow(/mode/);
    expect(() => lireDemande(['rendu', '--cadrage', 'carre'])).toThrow(/cadrage/);
    expect(() => lireDemande(['apercu', '--images', '12,x'])).toThrow(/images/);
  });

  it('arguments de Blender : usine, code de sortie si Python lève, journal de Cycles, puis ceux de rendre.py', () => {
    expect(argumentsBlender({ mode: 'apercu', cadrages: ['portrait'], images: [443, 985], echelle: 25, neuf: false }, 'portrait', '/w/rendre.py', '/w/.cache')).toEqual([
      '-b', '--factory-startup', '--python-exit-code', '1', '--debug-cycles', '-P', '/w/rendre.py', '--',
      '--mode', 'apercu', '--cadrage', 'portrait', '--cache', '/w/.cache', '--images', '443,985', '--echelle', '25',
    ]);
    expect(argumentsBlender({ mode: 'rendu', cadrages: ['paysage'], images: [], echantillons: 96, neuf: true }, 'paysage', 'r.py', 'c').slice(8))
      .toEqual(['--mode', 'rendu', '--cadrage', 'paysage', '--cache', 'c', '--echantillons', '96', '--neuf']);
  });

  it('refuse un rendu complet sous 15 Go libres, jamais un aperçu ni des témoins', () => {
    expect(refusDisque(DISQUE_MIN_RENDU - 1, 'rendu')).toMatch(/15 Go/);
    expect(refusDisque(DISQUE_MIN_RENDU, 'rendu')).toBeNull();
    expect(refusDisque(1e9, 'apercu')).toBeNull();
    expect(refusDisque(1e9, 'temoins')).toBeNull();
  });

  it('fraîcheur : une cible absente, ou plus vieille qu’une de ses sources, est périmée', () => {
    expect(perime(null, 'keys-portrait.json', [{ chemin: 'timeline.ts', mtimeMs: 1 }])).toMatch(/absent/);
    expect(perime(5, 'keys-portrait.json', [{ chemin: 'temps.ts', mtimeMs: 4 }, { chemin: 'timeline.ts', mtimeMs: 6 }])).toMatch(/timeline\.ts/);
    expect(perime(5, 'keys-portrait.json', [{ chemin: 'timeline.ts', mtimeMs: 5 }])).toBeNull();
  });

  it('reconnaît la ligne de Cycles qui dit sur quel périphérique il calcule', () => {
    expect(peripherique('                            | Path tracing on: Apple M4 Pro (GPU - 16 cores) (Metal) (display) [METAL_Apple M4 Pro (GPU - 16 cores)]')).toBe('metal');
    expect(peripherique('  | Path tracing on: Apple M4 Pro (CPU)')).toBe('autre');
    expect(peripherique('[rendre] f_0443.png 270×585 1.67 s')).toBeNull();
  });
});
```

- [ ] **Step 9 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/lanceur.test.ts`. Expected : FAIL, `Error: Cannot find module '../../lib/lanceur' imported from …/scripts/intro/__tests__/unit/lanceur.test.ts`, `Test Files  1 failed (1)`.

- [ ] **Step 10 : décisions du lanceur.** Créer `web/scripts/intro/lib/lanceur.ts` :

```ts
/**
 * Décisions pures du lanceur de Blender (`scripts/intro/blender.ts`, spec intro vidéo §2.4) : lecture de la demande,
 * arguments de Blender, instants témoins, garde du disque, fraîcheur des entrées, périphérique annoncé par Cycles.
 */
import { CADRAGES, INTRO, IPS_MAITRE, type Cadrage } from '../../../src/intro/temps';

export type Mode = 'temoins' | 'apercu' | 'rendu';
const MODES: readonly Mode[] = ['temoins', 'apercu', 'rendu'];

export interface Demande {
  mode: Mode;
  cadrages: Cadrage[];
  /** Numéros d'image (1 → t = 0) ; vide : toutes. */
  images: number[];
  /** Définition en % (remplace celle du mode dans commun.py). */
  echelle?: number;
  echantillons?: number;
  /** Efface les images déjà rendues de ce mode (sinon reprise). */
  neuf: boolean;
}

/** Espace libre exigé avant un rendu complet : ~12,8 Go de PNG pour les deux cadrages (recon fabrique), plus la marge. */
export const DISQUE_MIN_RENDU = 15e9;

/** Image n ↔ t = (n − 1) / 120 s (rendre.py, anim.py). */
export const imageA = (t: number): number => Math.round(t * IPS_MAITRE) + 1;

/**
 * Instants témoins, rendus à pleine qualité pour mesurer le temps par image et juger la matière (planche, Task 6). Les
 * instants sans constante dans temps.ts suivent timeline.ts : logo complet entre la dernière lettre (7,48 s) et le rezoom
 * (8,8 s) ; frontière à mi-déroulé (11,5 → 13,0 s) ; drapeau grandi (13,0 → 13,45 s).
 */
export const TEMOINS: readonly { nom: string; t: number }[] = [
  { nom: 'chute', t: INTRO.CHUTE + INTRO.D_CHUTE / 2 },
  { nom: 'impact', t: INTRO.CHUTE + INTRO.D_CHUTE + 0.08 },
  { nom: 'logo', t: 8.2 },
  { nom: 'frontiere', t: 12.2 },
  { nom: 'drapeau', t: 14.0 },
  { nom: 'titre', t: INTRO.ACCUEIL + 0.8 },
  { nom: 'fin', t: INTRO.FIN },
];

function entier(nom: string, v: string | undefined): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${nom} : entier positif attendu, reçu « ${v} »`);
  return n;
}

/** `temoins|apercu|rendu [--cadrage portrait|paysage] [--images 1,600] [--echelle 25] [--echantillons 32] [--neuf]`. */
export function lireDemande(argv: string[]): Demande {
  const [mode, ...reste] = argv;
  if (!MODES.includes(mode as Mode)) throw new Error(`mode « ${mode} » inconnu : ${MODES.join(', ')}`);
  const d: Demande = { mode: mode as Mode, cadrages: Object.keys(CADRAGES) as Cadrage[], images: [], neuf: false };
  for (let i = 0; i < reste.length; i++) {
    const opt = reste[i], val = reste[i + 1];
    if (opt === '--neuf') { d.neuf = true; continue; }
    i++;
    if (opt === '--cadrage') {
      if (!(val! in CADRAGES)) throw new Error(`cadrage « ${val} » inconnu : ${Object.keys(CADRAGES).join(', ')}`);
      d.cadrages = [val as Cadrage];
    } else if (opt === '--images') d.images = val!.split(',').map((x) => entier('images', x));
    else if (opt === '--echelle') d.echelle = entier('echelle', val);
    else if (opt === '--echantillons') d.echantillons = entier('echantillons', val);
    else throw new Error(`option « ${opt} » inconnue`);
  }
  if (d.mode === 'temoins' && d.images.length === 0) d.images = TEMOINS.map((x) => imageA(x.t));
  return d;
}

/** Ligne de commande de Blender : sans préférences, code de sortie 1 si Python lève, journal de Cycles (périphérique). */
export function argumentsBlender(d: Demande, cadrage: Cadrage, rendrePy: string, cache: string): string[] {
  return [
    '-b', '--factory-startup', '--python-exit-code', '1', '--debug-cycles', '-P', rendrePy, '--',
    '--mode', d.mode, '--cadrage', cadrage, '--cache', cache,
    ...(d.images.length ? ['--images', d.images.join(',')] : []),
    ...(d.echelle ? ['--echelle', String(d.echelle)] : []),
    ...(d.echantillons ? ['--echantillons', String(d.echantillons)] : []),
    ...(d.neuf ? ['--neuf'] : []),
  ];
}

/** Message de refus si le disque manque de place pour un rendu complet, sinon null. */
export function refusDisque(libresOctets: number, mode: Mode): string | null {
  if (mode !== 'rendu' || libresOctets >= DISQUE_MIN_RENDU) return null;
  return `${(libresOctets / 1e9).toFixed(1)} Go libres : il en faut 15 Go pour un rendu complet (PNG des deux cadrages)`;
}

/** Message si `cible` (date en ms, null si absente) est plus vieille qu'une de ses sources, sinon null. */
export function perime(cible: number | null, nom: string, sources: { chemin: string; mtimeMs: number }[]): string | null {
  if (cible === null) return `${nom} absent`;
  const neuve = sources.find((s) => s.mtimeMs > cible);
  return neuve ? `${nom} plus vieux que ${neuve.chemin}` : null;
}

/** « Path tracing on: … (Metal) » (journal de --debug-cycles) → 'metal' ; un autre périphérique → 'autre'. */
export function peripherique(ligne: string): 'metal' | 'autre' | null {
  if (!ligne.includes('Path tracing on:')) return null;
  return ligne.includes('(Metal)') ? 'metal' : 'autre';
}
```

- [ ] **Step 11 : vérifier.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/lanceur.test.ts`. Expected : PASS, `Test Files  1 passed (1)`, `Tests  7 passed (7)`.

- [ ] **Step 12 : le lanceur.** Créer `web/scripts/intro/blender.ts` :

```ts
/**
 * Lanceur de la scène Blender de l'intro (spec intro vidéo §2.4, §2.7) :
 *   npm run intro:temoins  — les instants témoins à pleine qualité (temps par image, matière) ;
 *   npm run intro:apercu   — toute l'intro en basse qualité (rythme) ;
 *   npm run intro:rendu    — le rendu final des deux cadrages (refusé sous 15 Go libres).
 * Options après « -- » : --cadrage portrait|paysage (les deux sinon), --images 1,600, --echelle 25, --echantillons 32,
 * --neuf (efface les images déjà rendues ; sinon le rendu reprend où il s'était arrêté).
 * Vérifie que les sources (`npm run intro:sources`) et les clés (`npm run intro:keys`) sont à jour, lance
 * `Blender -b --factory-startup -P scripts/intro/blender/rendre.py -- …` cadrage par cadrage, garde tout son journal dans
 * `.cache/journal-<mode>-<cadrage>.log` et s'arrête si Cycles ne calcule pas sur le GPU (Metal).
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, statfsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Cadrage } from '../../src/intro/temps';
import { argumentsBlender, lireDemande, perime, peripherique, refusDisque, type Demande } from './lib/lanceur';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(ICI, '../..');
const CACHE = path.join(ICI, '.cache');
const RENDRE = path.join(ICI, 'blender', 'rendre.py');
const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';

const date = (f: string): number | null => (existsSync(f) ? statSync(f).mtimeMs : null);
/** Dates des fichiers (chemins depuis web/) qui existent : ceux qui fabriquent une entrée. */
const dates = (...fichiers: string[]) =>
  fichiers.map((f) => path.join(WEB, f)).filter((f) => existsSync(f)).map((f) => ({ chemin: path.relative(WEB, f), mtimeMs: statSync(f).mtimeMs }));

function verifierEntrees(d: Demande): void {
  const erreurs: string[] = [];
  const s = perime(date(path.join(CACHE, 'sources', 'sources.json')), 'sources/sources.json',
    dates('scripts/intro/sources.ts', 'scripts/intro/lib/peinture.ts', 'scripts/intro/lib/terre.ts'));
  if (s) erreurs.push(`${s} — lancer npm run intro:sources`);
  for (const c of d.cadrages) {
    const k = perime(date(path.join(CACHE, `keys-${c}.json`)), `keys-${c}.json`, dates('src/intro/temps.ts', 'src/intro/timeline.ts',
      'src/intro/cadrages.ts', 'scripts/intro/export-keys.ts', 'scripts/intro/lib/axes.ts', 'scripts/intro/lib/terre.ts',
      'scripts/intro/.cache/sources/reperes.json', 'scripts/intro/.cache/sources/frontiere.json'));
    if (k) erreurs.push(`${k} — lancer npm run intro:keys`);
  }
  if (erreurs.length) throw new Error(erreurs.join('\n'));
}

/** Un passage de Blender pour un cadrage ; rejette si Blender échoue ou si Cycles n'est pas sur le GPU. */
function lancer(d: Demande, c: Cadrage): Promise<void> {
  const nomJournal = path.join(CACHE, `journal-${d.mode}-${c}.log`);
  const args = argumentsBlender(d, c, RENDRE, CACHE);
  const journal = createWriteStream(nomJournal, { flags: 'a' });
  journal.write(`\n=== ${new Date().toISOString()} ${BLENDER} ${args.join(' ')}\n`);
  const p = spawn(BLENDER, args, { cwd: WEB, stdio: ['ignore', 'pipe', 'pipe'] });
  let metal = false, horsGpu = '', rendues = 0;
  for (const flux of [p.stdout, p.stderr]) {
    createInterface({ input: flux }).on('line', (l) => {
      journal.write(l + '\n');
      const per = peripherique(l);
      if (per === 'metal' && !metal) { metal = true; console.log(l.trim()); }
      if (per === 'autre' && !horsGpu) { horsGpu = l.trim(); p.kill(); }
      if (l.startsWith('[rendre] f_')) rendues++;
      if (l.startsWith('[rendre]') || /Error|Traceback/.test(l)) console.log(l);
    });
  }
  return new Promise((ok, echec) => {
    p.on('error', echec);
    p.on('close', (code) => {
      journal.end();
      if (horsGpu) echec(new Error(`Cycles hors du GPU : ${horsGpu}`));
      else if (code !== 0) echec(new Error(`Blender a rendu le code ${code} — journal : ${nomJournal}`));
      else if (rendues > 0 && !metal) echec(new Error(`aucune ligne « Path tracing on: … (Metal) » — journal : ${nomJournal}`));
      else ok();
    });
  });
}

async function main(): Promise<void> {
  const d = lireDemande(process.argv.slice(2));
  mkdirSync(CACHE, { recursive: true });
  const { bavail, bsize } = statfsSync(CACHE);
  const refus = refusDisque(bavail * bsize, d.mode);
  if (refus) throw new Error(refus);
  verifierEntrees(d);
  for (const c of d.cadrages) {
    const t0 = Date.now();
    await lancer(d, c);
    console.log(`[blender] ${d.mode} ${c} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

Dans `web/package.json`, insérer juste avant la ligne `"intro:keys": "tsx scripts/intro/export-keys.ts"` (Task 3 ; elle reste la dernière du bloc `scripts`, sans virgule, et les Tasks 5 à 7 insèrent leurs scripts au même endroit) :

```json
    "intro:temoins": "tsx scripts/intro/blender.ts temoins",
    "intro:apercu": "tsx scripts/intro/blender.ts apercu",
    "intro:rendu": "tsx scripts/intro/blender.ts rendu",
```

- [ ] **Step 13 : suite unitaire et types.** Run : `cd web && npm run check`. Expected : `tsc` sans erreur ; Vitest tout vert, dont les 7 essais de `lanceur.test.ts` : `Test Files  65 passed (65)`, `Tests  371 passed (371)` (relevé au plan sur une copie portant les Tasks 1 à 4 telles qu'écrites).

- [ ] **Step 14 : refus du lanceur.** Run : `cd web && npx tsx scripts/intro/blender.ts film; echo "code $?"`. Expected : `mode « film » inconnu : temoins, apercu, rendu` puis `code 1`. Run : `cd web && touch src/intro/timeline.ts && npm run intro:apercu -- --cadrage portrait --images 443,985,1681 --echelle 25; echo "code $?"`. Expected : `keys-portrait.json plus vieux que src/intro/timeline.ts — lancer npm run intro:keys` puis `code 1`. Puis `npm run intro:keys` (Task 3) pour remettre les clés à jour.

- [ ] **Step 15 : trois images en aperçu à 25 %.** Run : `cd web && npm run intro:apercu -- --cadrage portrait --images 443,985,1681 --echelle 25`. Expected (sortie de la copie de rédaction, clés et sources de test au format du contrat ; les durées varient, le premier passage de Metal compile ses noyaux une fois, ~2 min) :

```
[rendre] périphérique : Apple M4 Pro (GPU - 16 cores)
[rendre] scène construite en 0.8 s ; 18 F-curves, 2377 images
[rendre] 68 pistes sans objet dans la scène, ignorées : CU:frontiere, OB:drapeau, OB:etoile_00, OB:etoile_01…
| Path tracing on: Apple M4 Pro (GPU - 16 cores) (Metal) (display) [METAL_Apple M4 Pro (GPU - 16 cores)]
[rendre] f_0443.png 270×585 1.41 s
[rendre] f_0985.png 270×585 0.12 s
[rendre] f_1681.png 270×585 0.29 s
[rendre] fini : 3 images rendues (moyenne 0.61 s), 0 gardées, 2.7 s en tout → …/web/scripts/intro/.cache/frames/apercu/portrait
[blender] apercu portrait : 3.2 s
```

18 F-curves = caméra 3 + 4, écrasement 4 + 3 + 4 ; 68 = les 72 objets des pistes de la Task 3 moins les 4 du socle.

- [ ] **Step 16 : reprise, et refus quand la scène a changé.** Relancer la même commande. Expected : aucune image refaite — `[rendre] fini : 0 images rendues (moyenne 0.00 s), 3 gardées, 1.2 s en tout → …` (une image gardée doit être entière, à la bonne définition, et `reglages.json` identique : définition, échantillons, empreinte des clés, empreinte de la scène — les `.py` de `blender/` sauf `essais.py`, et les sources de la Terre). Puis une scène changée : Run : `cd web && echo '# essai : la scène a changé' >> scripts/intro/blender/scene.py && npm run intro:apercu -- --cadrage portrait --images 443,985,1681 --echelle 25; echo "code $?"`. Expected (les empreintes varient) :

```
[rendre] …/web/scripts/intro/.cache/frames/apercu/portrait : images faites avec d'autres réglages (scene : 81c28c36d5e4fdc4 → 0428dd678e94c093) — relancer avec --neuf
Blender a rendu le code 1 — journal : …/web/scripts/intro/.cache/journal-apercu-portrait.log
code 1
```

Run : `cd web && npm run intro:apercu -- --cadrage portrait --images 443,985,1681 --echelle 25 --neuf`. Expected : les trois lignes `[rendre] f_….png 270×585 …` et `[rendre] fini : 3 images rendues …, 0 gardées, …`. Enfin retirer la ligne d'essai : Run : `cd web && node -e "const f='scripts/intro/blender/scene.py',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('# essai : la scène a changé\n',''))" && tail -1 scripts/intro/blender/scene.py`. Expected : `    objet('terre', me, groupe)`.

- [ ] **Step 17 : regarder.** Run :

```bash
cd web && node -e "
const sharp = require('sharp'), d = 'scripts/intro/.cache/frames/apercu/portrait/';
const n = process.argv.slice(1);
Promise.all(n.map((i) => sharp(d + 'f_' + i.padStart(4, '0') + '.png').flatten({ background: '#16173a' }).toBuffer()))
  .then((b) => sharp({ create: { width: 274 * b.length, height: 585, channels: 3, background: '#000' } })
    .composite(b.map((input, k) => ({ input, left: 274 * k, top: 0 }))).png().toFile('scripts/intro/.cache/socle-portrait.png'))
  .then((i) => console.log(i.width + '×' + i.height));
" 443 985 1681
```

Expected : `822×585` ; ouvrir `web/scripts/intro/.cache/socle-portrait.png` : f_0443 la Terre écrasée par l'impact au milieu de l'image ; f_0985 la petite Terre à la place du « o » du logo (gauche du milieu) ; f_1681 le gros plan : l'Europe en haut, l'horizon visible, les Alpes et l'Atlas en relief, éclairés en haut à gauche — les mêmes cadrages que l'ancienne scène three.js aux mêmes instants (vérifié à la rédaction, image contre image, à 390 × 844).

- [ ] **Step 18 : commit.**

```bash
git add web/scripts/intro/blender/commun.py web/scripts/intro/blender/anim.py web/scripts/intro/blender/scene.py web/scripts/intro/blender/rendre.py web/scripts/intro/blender/essais.py web/scripts/intro/lib/lanceur.ts web/scripts/intro/blender.ts web/scripts/intro/__tests__/unit/lanceur.test.ts web/package.json
git commit -m "fabrique : scène Blender, socle (Terre en pâte, caméra, lumières, clés linéaires, lanceur) — spec intro vidéo §2.3-2.4"
```

---

### Task 5 : Scène Blender : objets (nuages, point, drapeau, frontière et perle, étoiles, lettres, sprite)

**Files:**
- Modify: `web/scripts/intro/blender/scene.py` (objets, `construire`, `vue_sprite`), `web/scripts/intro/blender/commun.py` (mode `sprite`)
- Modify: `web/scripts/intro/blender/rendre.py` (remplacé : mode `sprite`, pistes toutes exigées, police)
- Modify: `web/scripts/intro/lib/lanceur.ts`, `web/scripts/intro/blender.ts` (mode `sprite`), `web/package.json` (`intro:sprite`)
- Test: `web/scripts/intro/blender/essais.py`, `web/scripts/intro/__tests__/unit/lanceur.test.ts`

**Interfaces:**
- Consumes :
  - Task 4 : tout ce qu'elle produit (outils de `scene.py`, `anim.cuire`, `commun`, lanceur).
  - Task 2 — `.cache/sources/frontiere.json` (2601 points `[x, y, z]` du repère three, le dernier = le premier), `.cache/sources/reperes.json` (`{ paris: [x, y, z], frontiereMilieu }`) ; `sources.json` (`hauteurMax`).
  - `web/public/fonts/chango-latin.woff2` (Blender 5.0.1 la lit telle quelle, décision D6).
  - Task 3 — dans `keys-<cadrage>.json`, les 220 pistes et les règles 1 à 9 de ses Interfaces (toute piste sans objet fait désormais échouer `rendre.py`) : `OB:nuages` rotation_euler, scale ; `OB:repere` location, rotation_quaternion, scale ; `OB:point` location, scale ; `OB:drapeau` location, rotation_quaternion (penché de −22° et tourné vers la caméra par l'export), scale ; `CU:frontiere` bevel_factor_end ; `OB:perle` location, scale ; `OB:logo_00` … `OB:logo_07`, `OB:titre_00` … `OB:titre_07` location (repère caméra, à 2 unités), rotation_euler, scale (1 unité = 1 em), color ; `OB:etoile_00` … `OB:etoile_45` location (à 1000 unités), scale (rayon), color. `point`, `perle`, `etoile_*` : sphères de rayon 1 ; frontière : spline POLY ouverte des 2601 points de `frontiere.json`, `bevel_factor_mapping` `'RESOLUTION'`.
- Produces :
  - Objets Blender (enfants de `terre_groupe` sauf mention) : `nuages` (`nuage_k` → `nuage_k_j`), `frontiere` (courbe `frontiere`), `perle`, `repere` (rotation en quaternion) → `point`, `drapeau` (rotation en quaternion) → `mat`, `tete`, `toile` (Geometry Nodes `ondulation` sur le temps de la scène, puis Solidify) ; enfants de `camera`, sans ombre portée : `etoile_00…45`, `logo_00…07`, `titre_00…07` (texte Chango, taille 1,211 : 1 unité = 1 em, calé CENTER/CENTER).
  - `scene.construire(scene, dossier, mode, fov, police=None) → src` ; `scene.vue_sprite(cam, i, src, fov=20)` ; `SPRITE_RAYON = 0.4545`, `SPRITE_MARGE = 1.0`, `SPRITE_COTE = 128`.
  - Sprite (pour la Task 7) : `npm run intro:sprite` → `web/scripts/intro/.cache/frames/sprite/f_0001.png` … `f_0024.png`, 128 × 128 RGBA 8 bits, fond transparent, vue n ↔ angle (n − 1)·15° (la tuile n − 1 de `logo-terre.webp`), relief à ≥ 1 px du bord. Son `reglages.json` porte l'empreinte de la scène (scripts de `blender/`, sources de la Terre) ; celui des autres modes y ajoute `reperes.json`, `frontiere.json` et la police : après une retouche de la scène, des images d'avant sont refusées tant qu'on ne relance pas avec `--neuf` (Task 4, Step 16).
  - Temps par image à pleine qualité des 7 témoins (Step 11), pour la Task 6.

- [ ] **Step 1 : essais des objets.** Dans `web/scripts/intro/blender/essais.py`, remplacer :

```python
import numpy as np  # noqa: E402
```

par :

```python
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
```

Puis insérer, juste avant la ligne `resultat = unittest.TextTestRunner(verbosity=2).run(…)` :

```python
POLICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'public', 'fonts', 'chango-latin.woff2')


class Objets(unittest.TestCase):
    def setUp(self):
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob)
        for cu in list(bpy.data.curves):
            bpy.data.curves.remove(cu)

    def test_frontiere_deroulee_a_l_indice_des_points(self):
        """bevel_factor_end = f arrête le boudin à l'indice f·N des points (spline ouverte, 'RESOLUTION'), comme three."""
        x = np.array([0, 0.1, 0.15, 0.5, 1.2, 1.25, 2.0, 3.0, 3.1])   # pas inégaux : l'indice n'est pas la longueur
        scene.frontiere(scene.vide('terre_groupe', None), np.stack([x, 0 * x, 0 * x], axis=1).tolist())
        fr = bpy.data.objects['frontiere']
        self.assertFalse(fr.data.splines[0].use_cyclic_u)
        for f in (0.3, 0.7):
            fr.data.bevel_factor_end = f
            dg = bpy.context.evaluated_depsgraph_get()
            dg.update()
            bout = max(v.co.x for v in fr.evaluated_get(dg).to_mesh().vertices)   # le boudin avance vers +x
            fr.evaluated_get(dg).to_mesh_clear()
            i = f * (len(x) - 1)
            self.assertAlmostEqual(bout, x[int(i)] + (x[int(i) + 1] - x[int(i)]) * (i - int(i)), places=4)

    def test_objets_et_rotations_que_lisent_les_cles(self):
        """Les noms et modes de rotation des pistes d'export-keys.ts (Task 3) : une piste sans objet arrête rendre.py."""
        cam = scene.objet('camera', bpy.data.cameras.new('camera'), None)
        groupe = scene.vide('terre_groupe', None)
        scene.nuages(groupe)
        scene.repere(groupe, {'paris': [0.66, 0.757, -0.027]})
        scene.frontiere(groupe, [[1, 0, 0], [0, 1, 0], [1, 0, 0]])
        scene.etoiles(cam)
        scene.lettres(cam, bpy.data.fonts.load(POLICE))
        plan = [f'{t}_{i:02d}' for t in ('logo', 'titre') for i in range(8)] + [f'etoile_{i:02d}' for i in range(46)]
        for nom in ['nuages', 'repere', 'point', 'drapeau', 'frontiere', 'perle'] + plan:
            self.assertIn(nom, bpy.data.objects)
        self.assertIn('frontiere', bpy.data.curves)
        self.assertEqual({bpy.data.objects[n].rotation_mode for n in ('repere', 'drapeau')}, {'QUATERNION'})
        self.assertEqual({bpy.data.objects[n].rotation_mode for n in ('nuages', 'logo_00', 'titre_07')}, {'XYZ'})
        self.assertEqual({bpy.data.objects[n].parent.name for n in ('nuages', 'repere', 'frontiere', 'perle')}, {'terre_groupe'})
        self.assertEqual({bpy.data.objects[n].parent.name for n in plan}, {'camera'})
        self.assertFalse(any(bpy.data.objects[n].visible_shadow for n in plan))

    def test_vue_sprite_terre_centree_axe_penche_relief_dans_le_cadre(self):
        cam = bpy.data.objects.new('essai_cam', bpy.data.cameras.new('essai_cam'))
        cam.rotation_mode = 'QUATERNION'
        t = math.tan(math.radians(10))
        bord = lambda rho: scene.SPRITE_COTE / 2 * math.tan(math.asin(rho / cam.location.length)) / t   # px du centre
        for i in (0, 7, 18):
            scene.vue_sprite(cam, i, {'hauteurMax': 0.0})   # relief bas : le rayon du sprite actuel est gardé
            self.assertAlmostEqual(cam.location.length, 0.5 / (scene.SPRITE_RAYON * t), places=5)
            self.assertLess((cam.rotation_quaternion @ Vector((0, 0, -1)) + cam.location.normalized()).length, 1e-6)
        scene.vue_sprite(cam, 0, {'hauteurMax': 0.0945})    # relief caricaturé maximal : la caméra recule
        self.assertAlmostEqual(bord(1 + 0.0945 + scene.BOSSE_AMP), scene.SPRITE_COTE / 2 - scene.SPRITE_MARGE, places=4)
        pole = cam.rotation_quaternion.inverted() @ Vector((0, 1, 0))   # le pôle Nord, en repère caméra
        self.assertAlmostEqual(math.degrees(math.atan2(pole.x, pole.y)), 23.4, places=4)   # penché vers la droite
```

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P scripts/intro/blender/essais.py; echo "code $?"`. Expected : FAIL, code 1 :

```
AttributeError: module 'scene' has no attribute 'frontiere'
AttributeError: module 'scene' has no attribute 'nuages'
AttributeError: module 'scene' has no attribute 'vue_sprite'
Ran 13 tests in 0.007s
FAILED (errors=3)
```

- [ ] **Step 3 : les objets dans `scene.py`.** Dans la docstring du module, remplacer :

```python
  monde ─ camera ─ cle, contre (lumières liées à la caméra)
        └ ecrasement_rot ─ ecrasement_echelle ─ ecrasement_retour ─ terre_groupe ─ terre
```

par :

```python
  monde ─ camera ─ cle, contre (lumières liées à la caméra) ; etoile_00…45, logo_00…07, titre_00…07 (plan de l'image)
        └ ecrasement_rot ─ ecrasement_echelle ─ ecrasement_retour ─ terre_groupe ─ terre, nuages, frontiere, perle,
          repere (point, drapeau)
```

Remplacer :

```python
import bpy
import numpy as np
from bpy_extras import anim_utils
from mathutils import Vector
```

par :

```python
import bmesh
import bpy
import numpy as np
from bpy_extras import anim_utils
from mathutils import Matrix, Quaternion, Vector
```

Remplacer :

```python
SUBDIV = {'temoins': 768, 'apercu': 384, 'rendu': 768}
```

par :

```python
SUBDIV = {'temoins': 768, 'apercu': 384, 'rendu': 768, 'sprite': 384}
```

Insérer, juste avant la ligne `# ---------- la scène ----------` :

```python
# ---------- les objets posés sur la Terre (scene.ts l.148-188) ----------

MAT_HM = 0.135   # hauteur du mât (timeline.ts)
NUAGES = ((-35, 22, 1), (75, -12, 0.85), (160, 42, 0.9), (-120, -32, 0.8), (30, -45, 0.7), (-80, 52, 0.75), (110, 10, 0.8))
BOULES = ((0, 0, 0, 0.07), (0.075, -0.01, 0.01, 0.052), (-0.075, -0.012, 0, 0.048), (0.025, 0.04, 0, 0.05))
TOILE_L, TOILE_H, TOILE_E = 0.088, 0.058, 0.0042
TOILE_COLONNES = 30   # multiple de 3 : les trois bandes tombent sur des arêtes, aux couleurs nettes
FRONTIERE_RAYON = 0.0026


def vers(lng, lat, r=1.0):
    """lng/lat (°) → point du repère three (lng 0 → +X, lng 90 → −Z, pôle Nord → +Y), comme toVec de geo/vec.ts."""
    l, p = math.radians(lng), math.radians(lat)
    return Vector((math.cos(p) * math.cos(l) * r, math.sin(p) * r, -math.cos(p) * math.sin(l) * r))


def boule(nom, mat, rayon=1.0):
    """Sphère lisse 40 × 28 (la SphereGeometry de scene.ts), centrée, de rayon `rayon`."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=28, radius=rayon)
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(mat)
    return me


def nuages(groupe):
    """Sept nuages de quatre boules à 1,24 rayon ; `nuages` tourne sur l'axe des pôles et rétrécit (clés)."""
    mat = pate('pate_nuage', '#ffffff', rugosite=0.75)[0]
    me = boule('boule_nuage', mat)
    tout = vide('nuages', groupe)
    for k, (lng, lat, s) in enumerate(NUAGES):
        d = vers(lng, lat)
        g = vide(f'nuage_{k}', tout, True)
        g.location = d * 1.24
        g.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(d)
        g.scale = (s, s, s)
        for j, (x, y, z, r) in enumerate(BOULES):
            b = objet(f'nuage_{k}_{j}', me, g)
            b.location = (x, y, z)
            b.scale = (r * 1.15, r * 0.9, r)


def ondulation(L):
    """Geometry Nodes : la toile ondule avec le temps de la scène (scene.ts l.251) — z += 0,009·u·sin(6,5u − 6,5t),
    y −= 0,004·u², u = (x − 0,003) / L, t = (image − 1) / 120. Évalué aussi entre deux images (flou de mouvement)."""
    ng = bpy.data.node_groups.new('ondulation', 'GeometryNodeTree')
    ng.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    entree, sortie = ng.nodes.new('NodeGroupInput'), ng.nodes.new('NodeGroupOutput')
    pos = ng.nodes.new('GeometryNodeSetPosition')
    ng.links.new(entree.outputs['Geometry'], pos.inputs['Geometry'])
    ng.links.new(pos.outputs['Geometry'], sortie.inputs['Geometry'])
    xyz = ng.nodes.new('ShaderNodeSeparateXYZ')
    ng.links.new(ng.nodes.new('GeometryNodeInputPosition').outputs['Position'], xyz.inputs[0])
    u = math_(ng, 'MULTIPLY', math_(ng, 'SUBTRACT', xyz.outputs['X'], 0.003), 1 / L)
    t = math_(ng, 'MULTIPLY', math_(ng, 'SUBTRACT', ng.nodes.new('GeometryNodeInputSceneTime').outputs['Frame'], 1.0), 1 / IPS)
    vague = math_(ng, 'SINE', math_(ng, 'MULTIPLY', math_(ng, 'SUBTRACT', u, t), 6.5))
    decal = ng.nodes.new('ShaderNodeCombineXYZ')
    ng.links.new(math_(ng, 'MULTIPLY', math_(ng, 'MULTIPLY', u, u), -0.004), decal.inputs['Y'])
    ng.links.new(math_(ng, 'MULTIPLY', math_(ng, 'MULTIPLY', u, vague), 0.009), decal.inputs['Z'])
    ng.links.new(decal.outputs[0], pos.inputs['Offset'])
    return ng


def toile():
    """Le drapeau tricolore : une grille de 30 × 4 cellules (x de 0,003 à 0,003 + L), couleurs par face (bleu, blanc,
    rouge), ondulée (Geometry Nodes) puis épaissie de 0,0042 (Solidify) — la boîte de scene.ts l.172-179."""
    nx, ny = TOILE_COLONNES, 4
    x = 0.003 + np.linspace(0, TOILE_L, nx + 1)
    y = np.linspace(-TOILE_H / 2, TOILE_H / 2, ny + 1)
    gx, gy = np.meshgrid(x, y, indexing='ij')
    co = np.stack([gx, gy, np.zeros_like(gx)], axis=-1).reshape(-1, 3).astype(np.float32)
    i, j = np.meshgrid(np.arange(nx), np.arange(ny), indexing='ij')
    q = np.stack([i * (ny + 1) + j, (i + 1) * (ny + 1) + j, (i + 1) * (ny + 1) + j + 1, i * (ny + 1) + j + 1], axis=-1).reshape(-1, 4)
    me = bpy.data.meshes.new('toile')
    me.vertices.add(len(co))
    me.vertices.foreach_set('co', co.ravel())
    me.loops.add(q.size)
    me.loops.foreach_set('vertex_index', q.astype(np.int32).ravel())
    me.polygons.add(len(q))
    me.polygons.foreach_set('loop_start', np.arange(0, q.size, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.shade_smooth()
    bandes = [lin('#2b55c9'), lin('#fff8ec'), lin('#e8413a')]
    attr = me.color_attributes.new('couleur', 'FLOAT_COLOR', 'CORNER')
    attr.data.foreach_set('color', np.repeat([bandes[c * 3 // nx] for c in i.ravel()], 4, axis=0).astype(np.float32).ravel())
    mat, nt, p = pate('pate_toile', '#ffffff')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'couleur'
    nt.links.new(ca.outputs['Color'], p.inputs['Base Color'])
    me.materials.append(mat)
    return me


def drapeau(rep):
    """Mât, tête et toile (scene.ts l.169-179), sous `drapeau` : sa position, son orientation (penché de −22°, tourné
    vers la caméra) et son échelle (sx, sy, sx) sont des clés (export-keys.ts)."""
    dr = vide('drapeau', rep, True)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=0.0034, radius2=0.0026, depth=MAT_HM)
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))   # axe Z de bmesh → axe Y de three
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0.0, MAT_HM / 2, 0.0))
    me = bpy.data.meshes.new('mat')
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(pate('pate_mat', '#fff8ec')[0])
    objet('mat', me, dr)
    tete = objet('tete', boule('boule_tete', pate('pate_tete', '#f7dc6f')[0], 0.0062), dr)
    tete.location = (0.0, MAT_HM + 0.002, 0.0)
    t = objet('toile', toile(), dr)
    t.location = (0.0, MAT_HM - TOILE_H / 2 - 0.004, 0.0)
    t.modifiers.new('ondulation', 'NODES').node_group = ondulation(TOILE_L)
    epais = t.modifiers.new('epaisseur', 'SOLIDIFY')
    epais.thickness, epais.offset = TOILE_E, 0.0


def repere(groupe, reperes):
    """Le repère posé à Paris (reperes.json, sur la surface déplacée ; position, orientation et échelle × 1,6 : clés), le
    point rouge (sphère de rayon 1 : position et échelle sont des clés) et le drapeau."""
    rep = vide('repere', groupe, True)
    rep.location = reperes['paris']
    rep.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(Vector(reperes['paris']).normalized())
    objet('point', boule('boule_point', pate('pate_point', '#e8413a', rugosite=0.5)[0]), rep)
    drapeau(rep)


def frontiere(groupe, points):
    """Le boudin jaune de la frontière : une spline POLY OUVERTE par les 2601 points de frontiere.json (les sommets du
    TubeGeometry de scene.ts, le dernier = le premier), bevel rond rapporté à l'INDICE des points ('RESOLUTION') :
    bevel_factor_end = border arrête le boudin à l'indice border·2600, comme three (Task 3). Sur une spline cyclique,
    bevel_factor serait sans effet. La perle, sphère de rayon 1 : position (sur la frontière) et échelle sont des clés."""
    co = np.asarray(points, dtype=np.float32)
    cu = bpy.data.curves.new('frontiere', 'CURVE')
    cu.dimensions = '3D'
    cu.twist_mode = 'MINIMUM'
    cu.bevel_mode = 'ROUND'
    cu.bevel_depth, cu.bevel_resolution = FRONTIERE_RAYON, 3
    cu.use_fill_caps = True
    cu.bevel_factor_mapping_start = cu.bevel_factor_mapping_end = 'RESOLUTION'
    sp = cu.splines.new('POLY')
    sp.points.add(len(co) - 1)
    sp.points.foreach_set('co', np.hstack([co, np.ones((len(co), 1), dtype=np.float32)]).ravel())
    mat = pate('pate_frontiere', '#f7dc6f', rugosite=0.5)[0]
    cu.materials.append(mat)
    objet('frontiere', cu, groupe)
    objet('perle', boule('boule_perle', mat), groupe)


# ---------- les objets du plan de l'image : étoiles, lettres (enfants de la caméra, posés par les clés) ----------

ETOILES = 46
LOGO_LETTRES = ('C', 'u', 'n', 't', 'r', 'i', 'z', 'z')
# Les clés comptent 1 unité = 1 em (police · unités/px · échelle, export-keys.ts). Chango (hhea) : ascendante 995,
# descendante 216 pour 1000 unités par em, et Blender met ascendante + descendante à 1 unité à la taille 1 (mesuré :
# « C » haut de 0,6135 au lieu de 0,743) : taille 1,211. Calage CENTER/CENTER : l'origine est le milieu de la boîte de
# la lettre dans la page (avance × hauteur de contenu), le centre mesuré de cadrages.ts.
TAILLE_EM = (995 + 216) / 1000
LETTRE_LUEUR = 0.25
LETTRE_RELIEF, LETTRE_BISEAU = 0.09, 0.02   # en em ; un biseau de 0,03 em vide la face avant du « z »


def etoiles(cam):
    """46 billes de pâte jaune (le fond étoilé d'Intro.tsx), légèrement lumineuses : elles ne s'éteignent pas dans
    l'ombre de la Terre. Ni ombre portée ; position, échelle et opacité : clés."""
    mat, nt, p = pate('pate_etoile', '#f7dc6f', rugosite=0.5, sss_echelle=0.0)
    p.inputs['Emission Color'].default_value = lin('#f7dc6f')
    p.inputs['Emission Strength'].default_value = 0.6
    me = boule('boule_etoile', mat)
    for i in range(ETOILES):
        e = objet(f'etoile_{i:02d}', me, cam)
        e.visible_shadow = False
        e.scale = (0.0, 0.0, 0.0)


def lettres(cam, police):
    """Les lettres en pâte du logo du milieu (logo_00…07) et du titre de fin (titre_00…07), une par objet texte (Chango) :
    relief et biseau arrondi, contour gardé (offset = −biseau). Position, rotation, échelle (1 = 1 em) et opacité : clés."""
    mat, nt, p = pate('pate_lettre', '#f7dc6f', rugosite=0.5, sss_echelle=0.0008)
    # un peu de lumière propre : la face avant garde le jaune du titre HTML (#f7dc6f), qui prend le relais au fondu
    p.inputs['Emission Color'].default_value = lin('#f7dc6f')
    p.inputs['Emission Strength'].default_value = LETTRE_LUEUR
    for titre in ('logo', 'titre'):
        for i, c in enumerate(LOGO_LETTRES):
            cu = bpy.data.curves.new(f'{titre}_{i:02d}', 'FONT')
            cu.body, cu.font, cu.size = c, police, TAILLE_EM
            cu.align_x, cu.align_y = 'CENTER', 'CENTER'
            cu.extrude = LETTRE_RELIEF
            cu.bevel_depth, cu.bevel_resolution, cu.offset = LETTRE_BISEAU, 3, -LETTRE_BISEAU
            cu.materials.append(mat)
            ob = objet(f'{titre}_{i:02d}', cu, cam)
            ob.visible_shadow = False
            ob.scale = (0.0, 0.0, 0.0)
```

Remplacer la fonction `construire` (jusqu'à la fin du fichier) par :

```python
def construire(scene, dossier, mode, fov, police=None):
    """Vide la scène de démarrage et construit tout (le sprite : la Terre seule, sans police) ; rend sources.json. Les
    objets animés portent les noms des pistes de keys-<cadrage>.json (anim.py)."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    src = lire_json(dossier, 'sources.json')
    carte = lire_gris16(os.path.join(dossier, 'hauteur.png'))
    monde = vide('monde', None)
    monde.rotation_euler = (math.pi / 2, 0.0, 0.0)   # three (Y en haut) → Blender (Z en haut)
    cam = camera(scene, monde, fov)
    lumieres(cam)
    ambiance(scene)
    ecrasement = vide('ecrasement_retour', vide('ecrasement_echelle', vide('ecrasement_rot', monde, True)), True)
    groupe = vide('terre_groupe', ecrasement)
    me = maillage_terre(carte, src, SUBDIV[mode])
    me.materials.append(matiere_terre(dossier, src))
    objet('terre', me, groupe)
    if mode != 'sprite':
        nuages(groupe)
        repere(groupe, lire_json(dossier, 'reperes.json'))
        frontiere(groupe, lire_json(dossier, 'frontiere.json'))
        etoiles(cam)
        lettres(cam, bpy.data.fonts.load(police))
    return src


# rayon de la Terre / côté du cadre : 58,2 px sur 128, comme le sprite actuel (home.css) ; marge du relief au bord (px)
SPRITE_RAYON, SPRITE_MARGE, SPRITE_COTE = 0.4545, 1.0, 128


def vue_sprite(cam, i, src, fov=20):
    """Vue i (0…23) de la petite Terre du titre : la Terre tournée de Rz(−23,4°)·Ry(i·15°) en axes three (l'orientation
    de logoAngleAt), centrée, vue de la distance de `cameraFrom` (timeline.ts) pour un rayon SPRITE_RAYON — ou de plus
    loin s'il le faut pour que le relief le plus haut (1 + hauteurMax + bosses) reste à SPRITE_MARGE px du bord."""
    t = math.tan(math.radians(fov / 2))
    plus_haut = 1 + src['hauteurMax'] + BOSSE_AMP
    d = max(0.5 / (SPRITE_RAYON * t), plus_haut / math.sin(math.atan((1 - 2 * SPRITE_MARGE / SPRITE_COTE) * t)))
    q = Quaternion((0, 0, 1), math.radians(-23.4)) @ Quaternion((0, 1, 0), math.radians(15 * i))
    qi = q.inverted()
    cam.location = qi @ Vector((0.0, 0.0, d))
    cam.rotation_quaternion = qi
```

- [ ] **Step 4 : vérifier.** Run : `cd web && /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P scripts/intro/blender/essais.py; echo "code $?"`. Expected : PASS — les 10 essais de la Task 4 et :

```
bevel_factor_end = f arrête le boudin à l'indice f·N des points (spline ouverte, 'RESOLUTION'), comme three. ... ok
Les noms et modes de rotation des pistes d'export-keys.ts (Task 3) : une piste sans objet arrête rendre.py. ... ok
test_vue_sprite_terre_centree_axe_penche_relief_dans_le_cadre (__main__.Objets.test_vue_sprite_terre_centree_axe_penche_relief_dans_le_cadre) ... ok
Ran 13 tests in 0.054s
OK
code 0
```

(L'essai de la frontière épingle deux pièges vérifiés : en `'SPLINE'` le boudin s'arrête à la longueur, pas à l'indice — `AssertionError: 0.9300000071525574 != 0.2899999999999999` ; sur une spline CYCLIQUE, `bevel_factor_end` ne raccourcit rien.)

- [ ] **Step 5 : mode sprite dans Blender.** Dans `commun.py`, remplacer :

```python
MODES = ('temoins', 'apercu', 'rendu')
```

par :

```python
MODES = ('temoins', 'apercu', 'rendu', 'sprite')
```

Remplacer :

```python
    'rendu': {'echantillons': 128, 'seuil': 0.02, 'minimum': 16, 'pourcent': 100, 'flou': True},
}
```

par :

```python
    'rendu': {'echantillons': 128, 'seuil': 0.02, 'minimum': 16, 'pourcent': 100, 'flou': True},
    'sprite': {'echantillons': 128, 'seuil': 0.01, 'minimum': 32, 'pourcent': 100, 'flou': False},
}
```

Remplacer `web/scripts/intro/blender/rendre.py` en entier par :

```python
"""
Point d'entrée Blender de la fabrique (spec intro vidéo §2.4), lancé par `npm run intro:<mode>` (scripts/intro/blender.ts) :
  temoins : quelques instants clés (--images, donnés par blender.ts depuis temps.ts) à pleine qualité, pour mesurer ;
  apercu  : toutes les images, définition et échantillons réduits, pour juger le rythme ;
  rendu   : toutes les images à pleine qualité (la nuit) ;
  sprite  : les 24 vues de la petite Terre du titre (logo-terre.webp), 128 × 128, sans clés.
Sortie : <cache>/frames/<mode>/<cadrage>/f_0001.png … (RGBA 8 bits, image n ↔ t = (n − 1) / 120 s) ; sprite :
<cache>/frames/sprite/f_0001.png … f_0024.png (vue n ↔ angle (n − 1)·15°). Une image entière déjà écrite est gardée
(reprise après un arrêt) ; un dossier rendu avec d'autres réglages, d'autres clés ou une autre scène (scripts de blender/,
sources, police) est refusé sans --neuf : une vidéo ne mélange ni deux qualités ni deux scènes. Toute piste des clés doit
trouver son objet dans la scène (contrat avec export-keys.ts).
"""
import hashlib
import json
import os
import shutil
import sys
import time

sys.dont_write_bytecode = True   # pas de __pycache__ à côté des scripts (dépôt)
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import bpy  # noqa: E402

import anim  # noqa: E402
import commun  # noqa: E402
import scene as construction  # noqa: E402

POLICE = os.path.normpath(os.path.join(ICI, '..', '..', '..', 'public', 'fonts', 'chango-latin.woff2'))   # lue telle quelle
# Les sources que lit la construction (npm run intro:sources) : la Terre (sprite compris), puis les objets posés dessus
SOURCES_TERRE = ('sources.json', 'hauteur.png', 'monde.png', 'europe.png', 'relief-fin.png')
SOURCES_OBJETS = ('reperes.json', 'frontiere.json')


def empreinte(chemins):
    """16 chiffres hexadécimaux du sha256 des fichiers donnés (nom et contenu de chacun, dans l'ordre)."""
    h = hashlib.sha256()
    for chemin in chemins:
        h.update(os.path.basename(chemin).encode() + b'\0')
        with open(chemin, 'rb') as f:
            for bloc in iter(lambda: f.read(1 << 20), b''):
                h.update(bloc)
    return h.hexdigest()[:16]


def scripts():
    """Les scripts qui construisent et règlent la scène : tous les .py de blender/, sauf les essais."""
    return [os.path.join(ICI, f) for f in sorted(os.listdir(ICI)) if f.endswith('.py') and f != 'essais.py']


def preparer_sortie(dossier, reglages, neuf):
    """Crée le dossier de sortie ; refuse d'y mêler des images faites avec d'autres réglages, d'autres clés ou une autre
    scène (sauf --neuf, qui l'efface) : après un changement de matière, d'objet ou de source, rien de périmé n'est repris."""
    fiche = os.path.join(dossier, 'reglages.json')
    if neuf and os.path.isdir(dossier):
        shutil.rmtree(dossier)
    if os.path.exists(fiche):
        with open(fiche, encoding='utf-8') as f:
            avant = json.load(f)
        if avant != reglages:
            ecarts = ', '.join(f'{k} : {avant.get(k)} → {reglages.get(k)}'
                               for k in sorted(set(avant) | set(reglages)) if avant.get(k) != reglages.get(k))
            raise SystemExit(f"[rendre] {dossier} : images faites avec d'autres réglages ({ecarts}) — relancer avec --neuf")
    os.makedirs(dossier, exist_ok=True)
    with open(fiche, 'w', encoding='utf-8') as f:
        json.dump(reglages, f)


def main():
    a = commun.lire_arguments()
    debut = time.time()
    scene = bpy.context.scene
    print(f'[rendre] périphérique : {commun.regler_metal(scene)}', flush=True)
    sources = os.path.join(a.cache, 'sources')
    terre = [os.path.join(sources, s) for s in SOURCES_TERRE]
    if a.mode == 'sprite':
        src = construction.construire(scene, sources, 'sprite', 20)
        commun.regler_cycles(scene, a, construction.SPRITE_COTE, construction.SPRITE_COTE)
        total, sortie = 24, os.path.join(a.cache, 'frames', 'sprite')
        fiche = {'scene': empreinte(scripts() + terre)}

        def poser(n):
            construction.vue_sprite(scene.camera, n - 1, src)
            scene.frame_set(1)   # frémissement figé : les 24 vues ont la même pâte
    else:
        chemin_cles = os.path.join(a.cache, f'keys-{a.cadrage}.json')
        with open(chemin_cles, encoding='utf-8') as f:
            cles = json.load(f)
        construction.construire(scene, sources, a.mode, cles['fovY'], POLICE)
        commun.regler_cycles(scene, a, cles['width'], cles['height'])
        courbes, absents = anim.cuire(cles)
        if absents:
            raise SystemExit(f'[rendre] pistes sans objet dans la scène ({len(absents)}) : {", ".join(absents)}')
        print(f'[rendre] {courbes} F-curves, {cles["frames"]} images', flush=True)
        total, sortie = cles['frames'], os.path.join(a.cache, 'frames', a.mode, a.cadrage)
        fiche = {'cles': empreinte([chemin_cles]),
                 'scene': empreinte(scripts() + terre + [os.path.join(sources, s) for s in SOURCES_OBJETS] + [POLICE])}
        poser = scene.frame_set
    print(f'[rendre] scène construite en {time.time() - debut:.1f} s', flush=True)
    images = a.images or list(range(1, total + 1))
    hors = [n for n in images if not 1 <= n <= total]
    if hors:
        raise SystemExit(f'[rendre] images hors de 1…{total} : {hors}')
    r = scene.render
    largeur, hauteur = r.resolution_x * r.resolution_percentage // 100, r.resolution_y * r.resolution_percentage // 100
    preparer_sortie(sortie, {'largeur': largeur, 'hauteur': hauteur, 'echantillons': scene.cycles.samples, **fiche}, a.neuf)
    gardees, durees = 0, []
    for n in images:
        chemin = os.path.join(sortie, f'f_{n:04d}.png')
        if commun.image_complete(chemin, largeur, hauteur):
            gardees += 1
            continue
        poser(n)
        r.filepath = chemin
        t = time.time()
        bpy.ops.render.render(write_still=True)
        durees.append(time.time() - t)
        print(f'[rendre] {os.path.basename(chemin)} {largeur}×{hauteur} {durees[-1]:.2f} s', flush=True)
    moyenne = sum(durees) / len(durees) if durees else 0.0
    print(f'[rendre] fini : {len(durees)} images rendues (moyenne {moyenne:.2f} s), {gardees} gardées, '
          f'{time.time() - debut:.1f} s en tout → {sortie}', flush=True)


if __name__ == '__main__':   # lancé par Blender -P ; essais.py l'importe sans rien rendre
    main()
```

- [ ] **Step 6 : essai du lanceur (sprite).** Dans `lanceur.test.ts`, insérer avant `  it('refuse un rendu complet sous 15 Go libres…` :

```ts
  it('sprite : une seule passe, sans cadrage ni clés', () => {
    const d = lireDemande(['sprite']);
    expect(d).toEqual({ mode: 'sprite', cadrages: [], images: [], neuf: false });
    expect(argumentsBlender(d, null, 'r.py', 'c').slice(8)).toEqual(['--mode', 'sprite', '--cache', 'c']);
  });
```

Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/lanceur.test.ts`. Expected : FAIL, `× sprite : une seule passe, sans cadrage ni clés`, `Error: mode « sprite » inconnu : temoins, apercu, rendu`, `Tests  1 failed | 7 passed (8)`.

- [ ] **Step 7 : mode sprite dans le lanceur.** Dans `web/scripts/intro/lib/lanceur.ts` :

Remplacer :

```ts
export type Mode = 'temoins' | 'apercu' | 'rendu';
const MODES: readonly Mode[] = ['temoins', 'apercu', 'rendu'];
```

par :

```ts
export type Mode = 'temoins' | 'apercu' | 'rendu' | 'sprite';
const MODES: readonly Mode[] = ['temoins', 'apercu', 'rendu', 'sprite'];
```

Remplacer :

```ts
  mode: Mode;
  cadrages: Cadrage[];
```

par :

```ts
  mode: Mode;
  /** Vide pour le sprite (une seule passe, sans clés). */
  cadrages: Cadrage[];
```

Remplacer :

```ts
/** `temoins|apercu|rendu [--cadrage
```

par :

```ts
/** `temoins|apercu|rendu|sprite [--cadrage
```

Remplacer :

```ts
  if (d.mode === 'temoins' && d.images.length === 0) d.images = TEMOINS.map((x) => imageA(x.t));
  return d;
```

par :

```ts
  if (d.mode === 'temoins' && d.images.length === 0) d.images = TEMOINS.map((x) => imageA(x.t));
  if (d.mode === 'sprite') d.cadrages = [];
  return d;
```

Remplacer :

```ts
export function argumentsBlender(d: Demande, cadrage: Cadrage, rendrePy: string, cache: string): string[] {
```

par :

```ts
export function argumentsBlender(d: Demande, cadrage: Cadrage | null, rendrePy: string, cache: string): string[] {
```

Remplacer :

```ts
    '--mode', d.mode, '--cadrage', cadrage, '--cache', cache,
```

par :

```ts
    '--mode', d.mode, ...(cadrage ? ['--cadrage', cadrage] : []), '--cache', cache,
```

Dans `web/scripts/intro/blender.ts` :

Remplacer :

```ts
 *   npm run intro:rendu    — le rendu final des deux cadrages (refusé sous 15 Go libres).
```

par :

```ts
 *   npm run intro:rendu    — le rendu final des deux cadrages (refusé sous 15 Go libres) ;
 *   npm run intro:sprite   — les 24 vues de la petite Terre du titre (sans clés).
```

Remplacer :

```ts
/** Un passage de Blender pour un cadrage ; rejette si Blender échoue ou si Cycles n'est pas sur le GPU. */
function lancer(d: Demande, c: Cadrage): Promise<void> {
  const nomJournal = path.join(CACHE, `journal-${d.mode}-${c}.log`);
```

par :

```ts
/** Un passage de Blender pour un cadrage (null : le sprite) ; rejette si Blender échoue ou si Cycles n'est pas sur le GPU. */
function lancer(d: Demande, c: Cadrage | null): Promise<void> {
  const nomJournal = path.join(CACHE, `journal-${d.mode}${c ? `-${c}` : ''}.log`);
```

Remplacer :

```ts
  for (const c of d.cadrages) {
    const t0 = Date.now();
    await lancer(d, c);
    console.log(`[blender] ${d.mode} ${c} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
```

par :

```ts
  for (const c of d.mode === 'sprite' ? [null] : d.cadrages) {
    const t0 = Date.now();
    await lancer(d, c);
    console.log(`[blender] ${d.mode}${c ? ` ${c}` : ''} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
```

Dans `web/package.json`, insérer juste avant la ligne `"intro:keys": "tsx scripts/intro/export-keys.ts"` (la dernière du bloc `scripts`, sans virgule) la ligne `"intro:sprite": "tsx scripts/intro/blender.ts sprite",`.

- [ ] **Step 8 : vérifier.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/lanceur.test.ts && npm run check`. Expected : `Tests  8 passed (8)` puis `tsc` sans erreur et Vitest tout vert : `Test Files  65 passed (65)`, `Tests  372 passed (372)` (relevé au plan sur une copie portant les Tasks 1 à 5 telles qu'écrites).

- [ ] **Step 9 : les objets aux instants témoins, en aperçu.** Run : `cd web && npm run intro:apercu -- --cadrage portrait --images 390,443,985,1465,1681,2137,2377 --neuf`. Expected (copie de rédaction ; durées variables) :

```
[rendre] périphérique : Apple M4 Pro (GPU - 16 cores)
[rendre] 725 F-curves, 2377 images
[rendre] scène construite en 1.0 s
| Path tracing on: Apple M4 Pro (GPU - 16 cores) (Metal) (display) [METAL_Apple M4 Pro (GPU - 16 cores)]
[rendre] f_0390.png 540×1170 1.27 s
[rendre] f_0443.png 540×1170 0.49 s
[rendre] f_0985.png 540×1170 0.37 s
[rendre] f_1465.png 540×1170 0.97 s
[rendre] f_1681.png 540×1170 0.97 s
[rendre] f_2137.png 540×1170 0.40 s
[rendre] f_2377.png 540×1170 0.36 s
[rendre] fini : 7 images rendues (moyenne 0.69 s), 0 gardées, 5.8 s en tout → …/web/scripts/intro/.cache/frames/apercu/portrait
[blender] apercu portrait : 6.4 s
```

725 F-curves = les 220 pistes de la Task 3, composante par composante ; une piste sans objet arrêterait ici sur `pistes sans objet dans la scène`. (390 = la chute à 85 %, la Terre filant vers le sol : à mi-chute, image 289, elle est encore au-dessus de l'image.) Puis la planche :

```bash
cd web && node -e "
const sharp = require('sharp'), d = 'scripts/intro/.cache/frames/apercu/portrait/';
const n = process.argv.slice(1);
Promise.all(n.map((i) => sharp(d + 'f_' + i.padStart(4, '0') + '.png').flatten({ background: '#16173a' }).resize(270).toBuffer()))
  .then((b) => sharp({ create: { width: 274 * b.length, height: 585, channels: 3, background: '#000' } })
    .composite(b.map((input, k) => ({ input, left: 274 * k, top: 0 }))).png().toFile('scripts/intro/.cache/objets-portrait.png'))
  .then((i) => console.log(i.width + '×' + i.height));
" 390 443 985 1465 1681 2137 2377
```

Expected : `1918×585`. Ouvrir `web/scripts/intro/.cache/objets-portrait.png` et vérifier, de gauche à droite : chute — la Terre en haut, étirée par le flou de mouvement, nuages en boules autour ; impact — écrasée, nuages autour, étoiles jaunes sur tout le fond ; logo — « C🌍untrizz » en pâte jaune, la Terre dans le « o » ; frontière — point rouge sur Paris, boudin jaune déroulé depuis le nord, perle au bout ; drapeau — mât crème, tête jaune, toile bleu-blanc-rouge ondulée, face à la caméra (orientation des clés), son ombre sur le sol ; titre — lettres du titre qui surgissent, la Terre en route vers le « o » ; fin — « C🌍untrizz » complet, la Terre dans le « o ». Les étoiles n'apparaissent jamais devant la Terre.

- [ ] **Step 10 : le sprite.** Run : `cd web && npm run intro:sprite`. Expected : `[rendre] scène construite en 0.7 s`, la ligne `Path tracing on: … (Metal)`, 24 lignes `[rendre] f_00NN.png 128×128 …` puis `[rendre] fini : 24 images rendues (moyenne 0.26 s), 0 gardées, 6.9 s en tout → …/web/scripts/intro/.cache/frames/sprite` et `[blender] sprite : 7.5 s` (copie de rédaction). Marge du relief :

```bash
cd web && node -e "
const sharp = require('sharp'), d = 'scripts/intro/.cache/frames/sprite/';
(async () => {
  let marge = 64;
  for (let i = 1; i <= 24; i++) {
    const { data, info } = await sharp(d + 'f_' + String(i).padStart(4, '0') + '.png').raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 8) marge = Math.min(marge, x, y, info.width - 1 - x, info.height - 1 - y);
  }
  console.log('24 vues, marge minimale ' + marge + ' px');
})();"
```

Expected : `24 vues, marge minimale 1 px` (au rayon 0,4545 sans recul, l'Himalaya touchait le bord : 0 px, mesuré). Planche des 24 vues :

```bash
cd web && node -e "
const sharp = require('sharp'), d = 'scripts/intro/.cache/frames/sprite/';
const tuiles = Array.from({ length: 24 }, (_, i) => ({ input: d + 'f_' + String(i + 1).padStart(4, '0') + '.png', left: (i % 12) * 130, top: Math.floor(i / 12) * 130 }));
sharp({ create: { width: 1560, height: 260, channels: 4, background: '#16173a' } }).composite(tuiles).png().toFile('scripts/intro/.cache/sprite-planche.png').then((i) => console.log(i.width + '×' + i.height));"
```

Expected : `1560×260` ; la Terre seule (ni nuages ni objets), axe penché vers la droite, éclairée en haut à gauche dans les 24 vues ; d'une vue à la suivante les continents glissent vers la droite (les Amériques en vue 1, puis le Pacifique, l'Asie, l'Afrique, de nouveau les Amériques en vue 24).

- [ ] **Step 11 : temps par image à pleine qualité.** Run : `cd web && npm run intro:temoins -- --cadrage portrait`. Expected (copie de rédaction : 128 échantillons, seuil 0,02, minimum 16, 1080 × 2340, sources de test) :

```
[rendre] 725 F-curves, 2377 images
[rendre] scène construite en 2.1 s
| Path tracing on: Apple M4 Pro (GPU - 16 cores) (Metal) (display) [METAL_Apple M4 Pro (GPU - 16 cores)]
[rendre] f_0289.png 1080×2340 2.71 s
[rendre] f_0443.png 1080×2340 2.82 s
[rendre] f_0985.png 1080×2340 1.91 s
[rendre] f_1465.png 1080×2340 6.82 s
[rendre] f_1681.png 1080×2340 6.83 s
[rendre] f_2137.png 1080×2340 2.16 s
[rendre] f_2377.png 1080×2340 1.79 s
[rendre] fini : 7 images rendues (moyenne 3.58 s), 0 gardées, 27.2 s en tout → …/web/scripts/intro/.cache/frames/temoins/portrait
[blender] temoins portrait : 27.8 s
```

La première image d'un passage porte aussi la préparation de la scène (BVH) ; le gros plan (frontière, drapeau) est le plus cher. Ces durées, relevées sur les vraies sources et les vraies clés, sont l'entrée de la Task 6 (réglage des échantillons, estimation de la nuit de rendu).

- [ ] **Step 12 : commit.**

```bash
git add web/scripts/intro/blender/scene.py web/scripts/intro/blender/commun.py web/scripts/intro/blender/rendre.py web/scripts/intro/blender/essais.py web/scripts/intro/lib/lanceur.ts web/scripts/intro/blender.ts web/scripts/intro/__tests__/unit/lanceur.test.ts web/package.json
git commit -m "fabrique : objets de la scène Blender (nuages, point, drapeau, frontière et perle, étoiles, lettres) et sprite du titre — spec intro vidéo §2.3, §2.6"
```

---

### Task 6 : Témoins, planche et aperçu — point d'arrêt utilisateur (planche) et réglage des échantillons

**Files:**
- Modify: `web/scripts/intro/lib/lanceur.ts` (Task 4 : `TEMOINS` complété, import de `BULLES`)
- Create: `web/scripts/intro/lib/temoins.ts`, `web/scripts/intro/lib/mesure.ts`
- Create: `web/scripts/intro/planche.ts`, `web/scripts/intro/avancement.ts`
- Modify: `web/package.json` (scripts `intro:planche`, `intro:avancement`)
- Modify (seulement si la règle du Step 11 le demande) : `web/scripts/intro/blender/commun.py` (`REGLAGES['temoins']['echantillons']` et `REGLAGES['rendu']['echantillons']`)
- Modify: `docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md` (§1 : décision sur la planche)
- Test: `web/scripts/intro/__tests__/unit/temoins.test.ts`

**Interfaces:**
- Consumes : `temps.ts` (`INTRO`, `BULLES`, `BULLES_RANGE`, `CADRAGES`, `IPS_MAITRE`, `type Bulle`, `type Cadrage`) de la Task 1 ; `public/intro/ancres.json` et son type `Ancres` (`scripts/intro/export-keys.ts`, import de type seulement) de la Task 3 ; de la Task 4 : `imageA(t)` et `TEMOINS` (`lib/lanceur.ts` ; `lireDemande` prend les images de `TEMOINS` quand le mode `temoins` n'en reçoit pas), `npm run intro:temoins` / `npm run intro:apercu` (options après `--` : `--echantillons <n>`, `--neuf`), les journaux du lanceur `web/scripts/intro/.cache/journal-<mode>-<cadrage>.log` (sortie complète de Blender, ajoutée passage après passage, chaque passage précédé d'une ligne `=== <date ISO> <commande>`), les images `web/scripts/intro/.cache/frames/<mode>/<cadrage>/f_NNNN.png` (+ `reglages.json` ; un dossier rendu avec d'autres réglages, d'autres clés ou une autre scène est refusé sans `--neuf`), `REGLAGES` de `blender/commun.py` (témoins = rendu : 128 échantillons ; aperçu : 16 échantillons, 50 %).
- Produces :
  - `TEMOINS` (12 instants : chute 0,7 s avant l'impact — la Terre n'est dans l'image que ≈ 1,1 s avant l'impact —, chute juste avant l'impact, impact, toupie, logo, rezoom, bulle Capitale, bulle Pays, bulle Drapeau, drapeau, titre, titre de fin).
  - `lib/temoins.ts` : `instantDe(image): number`, `IMAGES_MAITRE` (= `imageA(INTRO.FIN)`, 2377), `legende(image): string`, `ancreTemoin(a: Ancres, cadrage, bulle, t): [number, number] | null`.
  - `lib/mesure.ts` : `dernierPassage(journal)`, `enregistrements(journal)`, `interface Mesure { moyenne; mediane; ecarts }`, `tempsParImage(journal): Record<string, Mesure>`, `lireMesures(cache, mode)`, `estimation(sParImage, images, echantillons, cibleH = 10): { heures; echantillons }`.
  - `npm run intro:planche -- --echantillons <n>` → `web/scripts/intro/.cache/planche-portrait.png`, `planche-paysage.png` et une ligne de résumé (durée et place du rendu final) ; `npm run intro:avancement -- apercu|rendu` (images faites, temps restant), utilisés aussi aux Tasks 7 et 8.

Ordre retenu : la planche (Steps 9-13) est montrée ici ; l'aperçu est seulement **lancé** à la fin de cette tâche (Step 15, en arrière-plan ; `npm run intro:avancement -- apercu` en donne le temps restant) et c'est la Task 7, une fois `encode.ts` écrit, qui l'encode, y pose les bulles et le montre à l'utilisateur (second point d'arrêt : rythme, seconde de plus pour les bulles). Le tout a été vérifié au plan sur de vrais journaux de Blender 5.0.1 (rendus `write_still` d'une scène d'essai) et des images synthétiques.

- [ ] **Step 1 : tests des témoins et de la mesure.** Créer `web/scripts/intro/__tests__/unit/temoins.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { BULLES, INTRO } from '../../../../src/intro/temps';
import { imageA, TEMOINS } from '../../lib/lanceur';
import { dernierPassage, estimation, tempsParImage } from '../../lib/mesure';
import type { Ancres } from '../../export-keys';
import { ancreTemoin, IMAGES_MAITRE, instantDe, legende } from '../../lib/temoins';

describe('images témoins', () => {
  it('chute, impact, toupie, logo, rezoom, chaque bulle, drapeau, titre : dans l’intro, dans l’ordre, distinctes', () => {
    expect(TEMOINS.map((x) => x.nom)).toEqual([
      'chute, départ', 'chute, avant l’impact', 'impact', 'toupie', 'logo', 'rezoom',
      'bulle Capitale', 'bulle Pays', 'bulle Drapeau', 'drapeau', 'titre', 'titre de fin',
    ]);
    const images = TEMOINS.map((x) => imageA(x.t)), T_SOL = INTRO.CHUTE + INTRO.D_CHUTE;
    expect(images).toEqual([...new Set(images)].sort((a, b) => a - b));
    expect(images[0]).toBeGreaterThan(imageA(INTRO.CHUTE));
    expect(images[1]).toBeLessThan(imageA(T_SOL));
    expect(images[2]).toBeGreaterThan(imageA(T_SOL));
    expect(images.at(-1)).toBe(IMAGES_MAITRE);
    const t = (nom: string) => TEMOINS.find((x) => x.nom === nom)!.t;
    expect([t('bulle Capitale'), t('bulle Pays'), t('bulle Drapeau')])
      .toEqual([BULLES.capitale.apparait, BULLES.pays.apparait, BULLES.drapeau.apparait]);
  });

  it('numérotation : f_0001 à t = 0, la dernière image à FIN', () => {
    expect(instantDe(1)).toBe(0);
    expect(instantDe(imageA(3.55))).toBeCloseTo(3.55, 9);
    expect(instantDe(IMAGES_MAITRE)).toBeCloseTo(INTRO.FIN, 9);
  });

  it('légende : instant à la française, nom, numéro', () => {
    expect(legende(IMAGES_MAITRE)).toBe(`${INTRO.FIN.toFixed(2).replace('.', ',')} s · titre de fin · image ${IMAGES_MAITRE}`);
    expect(legende(2)).toBe('0,01 s · image 2');
  });

  it('ancre d’une bulle : échantillon le plus proche, null hors de la fenêtre', () => {
    const a: Ancres = {
      version: 1, fps: 60, t0: 10.8,
      cadrages: {
        portrait: { width: 1080, height: 2340, capitale: [[500, 900], [502, 901], [504, 902]], pays: [], drapeau: [] },
        paysage: { width: 1920, height: 1080, capitale: [], pays: [], drapeau: [] },
      },
    };
    expect(ancreTemoin(a, 'portrait', 'capitale', 10.8 + 1 / 60)).toEqual([502, 901]);
    expect(ancreTemoin(a, 'portrait', 'capitale', 10.8 + 1.4 / 60)).toEqual([502, 901]);
    expect(ancreTemoin(a, 'portrait', 'capitale', 10.7)).toBeNull();
    expect(ancreTemoin(a, 'portrait', 'pays', 11)).toBeNull();
  });
});

// Journal du lanceur au format relevé sur ce Mac (Blender 5.0.1) : deux passages, des lignes d'autre nature entre les
// images ; une heure au-delà de 59:59 s'écrit `h:mm:ss.mmm`.
const JOURNAL = [
  '',
  '=== 2026-10-11T17:40:00.000Z /Applications/Blender.app/Contents/MacOS/Blender -b … --mode temoins --cadrage portrait',
  "00:09.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0181.png'",
  "00:30.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0429.png'",
  '',
  '=== 2026-10-11T17:53:22.485Z /Applications/Blender.app/Contents/MacOS/Blender -b … --mode temoins --cadrage portrait --neuf',
  '[rendre] périphérique : Apple M4 Pro (GPU - 16 cores)',
  "02:14.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0181.png'",
  '[rendre] f_0181.png 1080×2340 9.10 s',
  '02:20.100  render           | Fra: 429 | Mem: 3352M | Finished',
  "02:26.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0429.png'",
  "02:40.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0439.png'",
  "1:00:00.000  render           | Saved: '/w/.cache/frames/temoins/portrait/f_0481.png'",
].join('\n');

describe('mesure du temps de rendu', () => {
  it('dernier passage du journal ; écarts entre images successives, la première écartée', () => {
    const p = dernierPassage(JOURNAL);
    expect(p.startsWith('=== 2026-10-11T17:53:22.485Z')).toBe(true);
    const t = tempsParImage(p);
    expect(Object.keys(t)).toEqual(['portrait']);
    expect(t.portrait).toEqual({ moyenne: (12 + 14 + 3440) / 3, mediane: 14, ecarts: 3 });
    expect(dernierPassage("00:01.000  render | Saved: '/a/b.png'")).toBe("00:01.000  render | Saved: '/a/b.png'");
  });

  it('rendu final : heures = images × somme des s/image ; au-delà de la cible, échantillons proportionnels au multiple de 16', () => {
    expect(estimation([10, 4], 2377, 128)).toEqual({ heures: (2377 * 14) / 3600, echantillons: 128 });
    // 2377 × 20 s = 13,2 h > 10 h → 128 × 10 / 13,2 = 96,9 → 96
    expect(estimation([14, 6], 2377, 128)).toEqual({ heures: (2377 * 20) / 3600, echantillons: 96 });
    expect(estimation([200, 100], 2377, 64).echantillons).toBe(16);
  });
});
```

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/temoins.test.ts`. Expected : FAIL — `Error: Cannot find module '../../lib/mesure'`, `Test Files  1 failed (1)`.

- [ ] **Step 3 : les instants témoins.** Dans `web/scripts/intro/lib/lanceur.ts`, remplacer

```ts
import { CADRAGES, INTRO, IPS_MAITRE, type Cadrage } from '../../../src/intro/temps';
```

par

```ts
import { BULLES, CADRAGES, INTRO, IPS_MAITRE, type Cadrage } from '../../../src/intro/temps';
```

puis remplacer

```ts
/**
 * Instants témoins, rendus à pleine qualité pour mesurer le temps par image et juger la matière (planche, Task 6). Les
 * instants sans constante dans temps.ts suivent timeline.ts : logo complet entre la dernière lettre (7,48 s) et le rezoom
 * (8,8 s) ; frontière à mi-déroulé (11,5 → 13,0 s) ; drapeau grandi (13,0 → 13,45 s).
 */
export const TEMOINS: readonly { nom: string; t: number }[] = [
  { nom: 'chute', t: INTRO.CHUTE + INTRO.D_CHUTE / 2 },
  { nom: 'impact', t: INTRO.CHUTE + INTRO.D_CHUTE + 0.08 },
  { nom: 'logo', t: 8.2 },
  { nom: 'frontiere', t: 12.2 },
  { nom: 'drapeau', t: 14.0 },
  { nom: 'titre', t: INTRO.ACCUEIL + 0.8 },
  { nom: 'fin', t: INTRO.FIN },
];
```

par

```ts
const T_SOL = INTRO.CHUTE + INTRO.D_CHUTE;
/**
 * Instants témoins, rendus à pleine qualité pour mesurer le temps par image et juger la matière (planche, Task 6) :
 * la chute (0,7 s avant l'impact, la Terre bien entrée dans l'image — elle n'y entre que ≈ 1,1 s avant l'impact —, puis
 * filée juste avant l'impact), l'impact, la toupie, le logo, le rezoom, chaque bulle (son objet à l'instant où elle
 * apparaît), le drapeau quand les bulles se retournent, les lettres du titre de fin qui surgissent, la dernière image.
 * Les instants sans constante dans temps.ts suivent timeline.ts : toupie à pleine vitesse avant le freinage
 * (T_SOL + 0,8 s) ; logo complet entre la dernière lettre (7,48 s) et le rezoom (8,8 s) ; rezoom à mi-course (8,8 → 10,8 s).
 */
export const TEMOINS: readonly { nom: string; t: number }[] = [
  { nom: 'chute, départ', t: T_SOL - 0.7 },
  { nom: 'chute, avant l’impact', t: T_SOL - 1 / 30 },
  { nom: 'impact', t: T_SOL + 0.08 },
  { nom: 'toupie', t: T_SOL + 0.4 },
  { nom: 'logo', t: 8.2 },
  { nom: 'rezoom', t: 9.8 },
  { nom: 'bulle Capitale', t: BULLES.capitale.apparait },
  { nom: 'bulle Pays', t: BULLES.pays.apparait },
  { nom: 'bulle Drapeau', t: BULLES.drapeau.apparait },
  { nom: 'drapeau', t: BULLES.drapeau.retourne },
  { nom: 'titre', t: INTRO.ACCUEIL + 0.8 },
  { nom: 'titre de fin', t: INTRO.FIN },
];
```

- [ ] **Step 4 : numérotation, légende, ancres.** Créer `web/scripts/intro/lib/temoins.ts` :

```ts
import { INTRO, IPS_MAITRE, type Bulle, type Cadrage } from '../../../src/intro/temps';
import type { Ancres } from '../export-keys';
import { imageA, TEMOINS } from './lanceur';

/** Instant (s) de l'image maîtresse `image` (`f_0001.png` est t = 0, une image par 1/120 s ; inverse d'`imageA`). */
export function instantDe(image: number): number {
  return (image - 1) / IPS_MAITRE;
}

/** Nombre d'images maîtresses, de t = 0 à `INTRO.FIN` compris (`f_0001.png` …). */
export const IMAGES_MAITRE = imageA(INTRO.FIN);

/** Légende d'une vignette de la planche : instant, nom du témoin s'il en est un, numéro d'image. */
export function legende(image: number): string {
  const temoin = TEMOINS.find((x) => imageA(x.t) === image);
  return `${instantDe(image).toFixed(2).replace('.', ',')} s${temoin ? ` · ${temoin.nom}` : ''} · image ${image}`;
}

/** Ancre d'une bulle à l'instant `t` dans `public/intro/ancres.json` (échantillon le plus proche), `null` hors fenêtre. */
export function ancreTemoin(a: Ancres, cadrage: Cadrage, bulle: Bulle, t: number): [number, number] | null {
  const k = Math.round((t - a.t0) * a.fps);
  return a.cadrages[cadrage][bulle][k] ?? null;
}
```

- [ ] **Step 5 : la mesure.** Créer `web/scripts/intro/lib/mesure.ts` :

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CADRAGES } from '../../../src/intro/temps';

/**
 * Temps de rendu mesuré dans les journaux du lanceur (`.cache/journal-<mode>-<cadrage>.log`, sortie complète de
 * `Blender -b`, un passage après l'autre), et règle des échantillons du rendu final (spec intro vidéo §2.4 et §9 : la
 * qualité se règle sur la mesure, pas l'inverse ; décision D9 du plan). Chaque passage commence par une ligne
 * `=== <date ISO> <commande>` ; chaque image enregistrée écrit une ligne horodatée depuis le lancement de Blender :
 *   `00:24.509  render           | Saved: '/…/frames/temoins/portrait/f_0429.png'`
 */

/** Le dernier passage d'un journal (tout le texte s'il n'a pas d'en-tête `=== `). */
export function dernierPassage(journal: string): string {
  const i = journal.lastIndexOf('\n=== ');
  return i >= 0 ? journal.slice(i + 1) : journal;
}

/** Horodatage (s depuis le lancement) et chemin de chaque image enregistrée, dans l'ordre du journal. */
export function enregistrements(journal: string): { s: number; chemin: string }[] {
  const out: { s: number; chemin: string }[] = [];
  for (const ligne of journal.split('\n')) {
    const m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\s+render\s+\|\s+Saved: '(.+)'\s*$/.exec(ligne);
    if (m) out.push({ s: Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]), chemin: m[4]! });
  }
  return out;
}

export interface Mesure { moyenne: number; mediane: number; ecarts: number }

/**
 * Secondes par image pour chaque dossier (le cadrage) : écarts entre deux enregistrements successifs du même dossier.
 * La première image d'un dossier n'a pas d'écart : elle porte le chargement des noyaux et la construction de la scène,
 * que le rendu final ne paie qu'une fois.
 */
export function tempsParImage(journal: string): Record<string, Mesure> {
  const parDossier = new Map<string, number[]>();
  for (const { s, chemin } of enregistrements(journal)) {
    const d = path.basename(path.dirname(chemin));
    parDossier.set(d, [...(parDossier.get(d) ?? []), s]);
  }
  const out: Record<string, Mesure> = {};
  for (const [d, temps] of parDossier) {
    const e = temps.slice(1).map((s, i) => s - temps[i]!).sort((a, b) => a - b);
    if (e.length === 0) continue;
    out[d] = { moyenne: e.reduce((a, b) => a + b, 0) / e.length, mediane: e[Math.floor(e.length / 2)]!, ecarts: e.length };
  }
  return out;
}

/** Mesures de chaque cadrage d'un mode, d'après le dernier passage de `<cache>/journal-<mode>-<cadrage>.log`. */
export function lireMesures(cache: string, mode: string): Record<string, Mesure> {
  const out: Record<string, Mesure> = {};
  for (const c of Object.keys(CADRAGES)) {
    const f = path.join(cache, `journal-${mode}-${c}.log`);
    if (existsSync(f)) Object.assign(out, tempsParImage(dernierPassage(readFileSync(f, 'utf8'))));
  }
  return out;
}

/**
 * Durée du rendu final des deux cadrages : `heures = images × (s_portrait + s_paysage) / 3600`, avec les MOYENNES des
 * témoins (les instants lourds y sont nombreux : estimation prudente). Au-delà de `cibleH`, échantillons proposés par
 * proportion, arrondis au multiple de 16 inférieur (au moins 16) : `S' = 16 × ⌊S × cibleH / heures / 16⌋`. La part fixe
 * d'une image (débruitage, synchronisation, enregistrement) ne diminue pas avec S : `S'` se vérifie en rendant de
 * nouveau les témoins.
 */
export function estimation(
  sParImage: number[], images: number, echantillons: number, cibleH = 10,
): { heures: number; echantillons: number } {
  const heures = (images * sParImage.reduce((a, b) => a + b, 0)) / 3600;
  if (heures <= cibleH) return { heures, echantillons };
  return { heures, echantillons: Math.max(16, 16 * Math.floor((echantillons * cibleH) / heures / 16)) };
}
```

- [ ] **Step 6 : vérifier.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/temoins.test.ts scripts/intro/__tests__/unit/lanceur.test.ts`. Expected : PASS — `Test Files  2 passed (2)`, `Tests  14 passed (14)` (6 + les 8 du lanceur, dont l'essai du sprite de la Task 5 ; la nouvelle liste de témoins suit toujours ses règles : croissante, distincte, après le début de la chute, jusqu'à la dernière image).

- [ ] **Step 7 : la planche et l'avancement.** Créer `web/scripts/intro/planche.ts` :

```ts
/**
 * Planche contact des images témoins (spec intro vidéo §2.4 et §3 : la planche est validée par l'utilisateur avant la
 * prévisualisation). Pour chaque cadrage, les PNG de `.cache/frames/temoins/<cadrage>/` posés sur la nuit (comme à
 * l'encodage), réduits au tiers, l'instant écrit dessous. Sur les images où des bulles sont ouvertes, un cercle marque
 * l'ancre exportée (`public/intro/ancres.json`) : la bulle pointera là, elle doit tomber sur le point, la frontière, le
 * haut du mât. En tête : le temps de rendu par image lu dans les journaux des témoins (dernier passage de
 * `.cache/journal-temoins-<cadrage>.log`), l'estimation du rendu final des deux cadrages (`lib/mesure.ts`) et la place
 * qu'il prendra (taille moyenne d'un PNG témoin × images).
 * Usage : `npm run intro:temoins`, puis `npm run intro:planche -- --echantillons <échantillons du rendu final>`.
 * Sorties : `.cache/planche-portrait.png`, `.cache/planche-paysage.png`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp, { type OverlayOptions } from 'sharp';
import { BULLES, BULLES_RANGE, CADRAGES, type Bulle, type Cadrage } from '../../src/intro/temps';
import { estimation, lireMesures } from './lib/mesure';
import type { Ancres } from './export-keys';
import { ancreTemoin, IMAGES_MAITRE, instantDe, legende } from './lib/temoins';

sharp.cache(false);
const ICI = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(ICI, '.cache');
const ANCRES = path.resolve(ICI, '../../public/intro/ancres.json');
const NUIT = '#16173a';
const REDUCTION = 3, COLONNES: Record<Cadrage, number> = { portrait: 6, paysage: 4 };
const MARGE = 16, LEGENDE = 36, ENTETE = 64;
const INITIALES: Record<Bulle, string> = { capitale: 'C', pays: 'P', drapeau: 'D' };

const { values: opts } = parseArgs({ options: { echantillons: { type: 'string' } } });
const echantillons = opts.echantillons === undefined ? undefined : Number(opts.echantillons);
const virgule = (x: number) => x.toFixed(1).replace('.', ',');
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const temoins = (cadrage: Cadrage) => {
  const d = path.join(CACHE, 'frames', 'temoins', cadrage);
  return existsSync(d) ? readdirSync(d).filter((f) => /^f_\d{4}\.png$/.test(f)).map((f) => path.join(d, f)).sort() : [];
};

const mesures = lireMesures(CACHE, 'temoins');
const ancres = existsSync(ANCRES) ? (JSON.parse(readFileSync(ANCRES, 'utf8')) as Ancres) : null;

// Place des PNG du rendu final : taille moyenne d'un témoin (rendu aux mêmes réglages) × images, pour chaque cadrage.
const go = (['portrait', 'paysage'] as const).reduce((s, c) => {
  const f = temoins(c);
  return s + (f.length ? (IMAGES_MAITRE * f.reduce((n, x) => n + statSync(x).size, 0)) / f.length / 1e9 : 0);
}, 0);
let resume = 'journaux des témoins absents ou incomplets : pas de mesure';
if (mesures.portrait && mesures.paysage) {
  const e = estimation([mesures.portrait.moyenne, mesures.paysage.moyenne], IMAGES_MAITRE, echantillons ?? 0);
  resume = `rendu final ≈ ${virgule(e.heures)} h pour ${IMAGES_MAITRE} images × 2 cadrages`;
  if (echantillons !== undefined) {
    resume += ` à ${echantillons} échantillons`
      + (e.echantillons === echantillons ? ' (≤ 10 h)' : ` → ${e.echantillons} échantillons proposés`);
  }
}
resume += ` ; PNG ≈ ${virgule(go)} Go`;
console.log(resume);

for (const cadrage of ['portrait', 'paysage'] as const) {
  const fichiers = temoins(cadrage);
  if (fichiers.length === 0) { console.log(`${cadrage} : aucune image témoin`); continue; }
  const { width, height } = CADRAGES[cadrage];
  const w = Math.round(width / REDUCTION), h = Math.round(height / REDUCTION);
  const col = COLONNES[cadrage], lignes = Math.ceil(fichiers.length / col);
  const W = MARGE + col * (w + MARGE), H = ENTETE + lignes * (h + LEGENDE + MARGE);
  const m = mesures[cadrage];
  const titre = `Témoins ${cadrage} — ${fichiers.length} images`
    + (m ? ` — ${virgule(m.moyenne)} s/image en moyenne (médiane ${virgule(m.mediane)}, ${m.ecarts} écarts)` : '');
  const textes = [
    `<text x="${MARGE}" y="28" font-size="24" fill="#fff">${xml(titre)}</text>`,
    `<text x="${MARGE}" y="54" font-size="18" fill="#bbb">${xml(resume)}</text>`,
  ];
  const vignettes: OverlayOptions[] = [];
  for (const [i, fichier] of fichiers.entries()) {
    const n = Number(path.basename(fichier).slice(2, 6));
    const x = MARGE + (i % col) * (w + MARGE), y = ENTETE + Math.floor(i / col) * (h + LEGENDE + MARGE);
    const input = await sharp(fichier).flatten({ background: NUIT }).resize(w, h).png().toBuffer();
    vignettes.push({ input, left: x, top: y });
    textes.push(`<text x="${x}" y="${y + h + 26}" font-size="20" fill="#fff">${xml(legende(n))}</text>`);
    const t = instantDe(n);
    for (const b of Object.keys(BULLES) as Bulle[]) {
      const p = ancres && t >= BULLES[b].apparait && t < BULLES_RANGE ? ancreTemoin(ancres, cadrage, b, t) : null;
      if (!p) continue;
      const ax = x + p[0] / REDUCTION, ay = y + p[1] / REDUCTION;
      textes.push(`<circle cx="${ax}" cy="${ay}" r="14" fill="none" stroke="#ff3df2" stroke-width="3"/>`,
        `<circle cx="${ax}" cy="${ay}" r="2.5" fill="#ff3df2"/>`,
        `<text x="${ax + 17}" y="${ay - 10}" font-size="18" font-weight="bold" fill="#ff3df2">${INITIALES[b]}</text>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`
    + `${textes.join('')}</svg>`;
  const sortie = path.join(CACHE, `planche-${cadrage}.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#2b2b2b' } })
    .composite([...vignettes, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(sortie);
  console.log(`${sortie} : ${fichiers.length} images${m ? `, ${virgule(m.moyenne)} s/image` : ''}`);
}
```

et `web/scripts/intro/avancement.ts` :

```ts
/**
 * Avancement d'un rendu Blender lancé en arrière-plan (`npm run intro:apercu` ou `intro:rendu`) : images écrites par
 * cadrage et temps restant, estimé avec les secondes par image du dernier passage de `.cache/journal-<mode>-<cadrage>.log`
 * (`lib/mesure.ts`) ; pour le rendu final, un cadrage pas encore commencé prend la mesure des témoins (mêmes réglages).
 * Usage : `npm run intro:avancement -- apercu|rendu`.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireMesures } from './lib/mesure';
import { IMAGES_MAITRE } from './lib/temoins';

const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');
const mode = process.argv[2];
if (mode !== 'apercu' && mode !== 'rendu') throw new Error('usage : npm run intro:avancement -- apercu|rendu');

const ici = lireMesures(CACHE, mode), temoins = mode === 'rendu' ? lireMesures(CACHE, 'temoins') : {};
let reste = 0, inconnu = false;
for (const c of ['portrait', 'paysage'] as const) {
  const d = path.join(CACHE, 'frames', mode, c);
  const faites = existsSync(d) ? readdirSync(d).filter((f) => /^f_\d{4}\.png$/.test(f)).length : 0;
  const s = ici[c]?.moyenne ?? temoins[c]?.moyenne;
  if (s === undefined) inconnu ||= faites < IMAGES_MAITRE;
  else reste += (IMAGES_MAITRE - faites) * s;
  const mesure = s === undefined ? '' : `, ${s.toFixed(2)} s/image${ici[c] ? '' : ' (témoins)'}`;
  console.log(`${c} : ${faites}/${IMAGES_MAITRE} images${mesure}`);
}
console.log(`reste ≈ ${(reste / 3600).toFixed(1)} h${inconnu ? ' + un cadrage sans mesure' : ''}`);
```

Dans `web/package.json`, insérer juste avant la ligne `"intro:keys": "tsx scripts/intro/export-keys.ts"` (la dernière du bloc `scripts`, sans virgule) :

```json
    "intro:planche": "tsx scripts/intro/planche.ts",
    "intro:avancement": "tsx scripts/intro/avancement.ts",
```

Run : `cd web && npx tsc --noEmit`. Expected : aucune sortie, code 0.

- [ ] **Step 8 : rendre les témoins.** Run : `cd web && npm run intro:temoins -- --neuf` (`--neuf` : la Task 5, Step 11, a laissé dans `frames/temoins/portrait/` 7 témoins aux mêmes réglages et de la même scène ; sans lui, 443, 985, 2137 et 2377 seraient gardées, 289, 1465 et 1681 resteraient sur la planche et la mesure ne porterait que sur 8 images ; premier rendu Metal de la session : ≈ 2 min de compilation des noyaux en plus). Expected : la ligne de Cycles `… | Path tracing on: Apple M4 Pro (GPU - 16 cores) (Metal) …`, pour chaque cadrage 12 lignes `[rendre] f_0349.png 1080×2340 <s> s` … `[rendre] f_2377.png …` (`1920×1080` en paysage ; images 349, 429, 443, 481, 985, 1177, 1333, 1417, 1597, 1753, 2137, 2377), `[rendre] fini : 12 images rendues (moyenne <s> s), 0 gardées, …` et `[blender] temoins portrait : <s> s`, puis la même chose en paysage ; code 0 (relevé au plan sur les vraies sources et les vraies clés : moyenne 4.13 s et `[blender] temoins portrait : 52.7 s`, moyenne 2.72 s et `[blender] temoins paysage : 35.7 s`). `ls scripts/intro/.cache/frames/temoins/portrait` : les 12 `f_NNNN.png` et `reglages.json`, rien d'autre.

- [ ] **Step 9 : la planche.** Run : `cd web && npm run intro:planche -- --echantillons 128` (128 = `REGLAGES['rendu']['echantillons']` de `commun.py`). Expected : sur ce modèle (les nombres sont ceux de la mesure) —

```text
rendu final ≈ <H> h pour 2377 images × 2 cadrages à 128 échantillons (≤ 10 h) ; PNG ≈ <G> Go
…/web/scripts/intro/.cache/planche-portrait.png : 12 images, <s> s/image
…/web/scripts/intro/.cache/planche-paysage.png : 12 images, <s> s/image
```

ou, si l'estimation dépasse 10 h, `… à 128 échantillons → <S'> échantillons proposés ; PNG ≈ <G> Go`. En tête de chaque planche : `Témoins <cadrage> — 12 images — <s> s/image en moyenne (médiane <m>, 11 écarts)`. (Relevé au plan, sur les témoins du Step 8 : `rendu final ≈ 4,5 h pour 2377 images × 2 cadrages à 128 échantillons (≤ 10 h) ; PNG ≈ 5,9 Go`, `12 images, 4,1 s/image` en portrait, `12 images, 2,7 s/image` en paysage.)

- [ ] **Step 10 : relire la planche avant de la montrer.** Ouvrir les deux PNG (outil Read) : 12 vignettes par planche sur la nuit, légendées `2,90 s · chute, départ · image 349` … `19,80 s · titre de fin · image 2377`, la Terre entrée par le haut dans la première vignette ; sur `bulle Capitale` un cercle `C`, sur `bulle Pays` `C` et `P`, à partir de `bulle Drapeau` `C`, `P` et `D`. Un cercle hors de son objet (point, milieu de la frontière, haut du mât) est un écart entre l'export des ancres (Task 3) et la scène (Tasks 4-5) : le corriger avant la suite (superpowers:systematic-debugging).

- [ ] **Step 11 : la règle des échantillons (cible : rendu final des deux cadrages ≤ 10 h).** Formule (`estimation`, `lib/mesure.ts`) : `heures = images × (s/image portrait + s/image paysage) / 3600`, avec les moyennes des témoins ; au-delà de 10 h, `S' = 16 × ⌊S × 10 / heures / 16⌋` (au moins 16).
  - Résumé en `(≤ 10 h)` : on garde 128, rien à changer ; passer au Step 12.
  - Sinon : Run : `cd web && npm run intro:temoins -- --echantillons <S'> --neuf && npm run intro:planche -- --echantillons <S'>`. Si le résumé est maintenant en `(≤ 10 h)`, écrire `<S'>` dans `web/scripts/intro/blender/commun.py` : `'temoins': {'echantillons': 128,` devient `'temoins': {'echantillons': <S'>,` et `'rendu': {'echantillons': 128,` devient `'rendu': {'echantillons': <S'>,` (les témoins déjà rendus l'ont été à `<S'>` échantillons : pas de nouveau rendu ; l'empreinte de la scène change avec `commun.py`, tout nouveau passage des témoins prend donc `--neuf`, comme au Step 12). S'il dépasse encore 10 h (la part fixe de chaque image ne baisse pas avec les échantillons), c'est la décision D9 : demander à l'utilisateur au Step 12 de choisir entre le `<S''>` proposé par une nouvelle planche (même commande) et deux nuits à `<S'>` (le rendu reprend où il s'est arrêté, Task 8).

- [ ] **Step 12 : POINT D'ARRÊT — l'utilisateur juge la planche.** Run : `cd web && open scripts/intro/.cache/planche-portrait.png scripts/intro/.cache/planche-paysage.png`. Lui donner le résumé du Step 9 (durée, place, échantillons) et lui demander, puis attendre sa réponse : la matière (pâte, satiné, empreintes, frémissement), la lumière, le flou de mouvement (chute à 0,7 s de l'impact, filée avant l'impact, toupie) — en lui disant que la phase « presque en flottant » de la chute (spec §3.1) se passe au-dessus du cadre : la Terre n'est à l'image qu'≈ 1,1 s avant l'impact (Task 1, écart 4) —, l'absence de profondeur de champ (D10 : la veut-il, au prix de reculer les lettres ? la marche à suivre est la règle 4 des Interfaces de la Task 3), les lettres du logo et du titre, les étoiles, les cadrages (titre de fin dans le « o »), les ancres des bulles ; et, le cas échéant (Step 11), son choix D9. Une reprise de la scène renvoie à la Task 5 (ou à la Task 1 pour la chorégraphie, puis `npm run intro:keys`) ; on revient ensuite au Step 8 avec `npm run intro:temoins -- --neuf`.

- [ ] **Step 13 : consigner la décision.** Dans `docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md`, §1, ajouter à la fin du tableau la ligne `| JJ/MM | Planche des témoins validée : <remarques de l'utilisateur> ; rendu final à <S> échantillons (≈ <H> h, ≈ <G> Go de PNG<, en deux nuits>) |` (date du jour, ses mots, les nombres du Step 9 ou 11).

- [ ] **Step 14 : suite et commit.** Run : `cd web && npm run check`. Expected : tsc sans erreur, `Test Files  66 passed (66)`, `Tests  378 passed (378)` (relevé au plan sur une copie portant les Tasks 1 à 6 telles qu'écrites). Puis :

```bash
git add web/scripts/intro/lib/lanceur.ts web/scripts/intro/lib/temoins.ts web/scripts/intro/lib/mesure.ts web/scripts/intro/planche.ts web/scripts/intro/avancement.ts web/scripts/intro/__tests__/unit/temoins.test.ts web/package.json web/scripts/intro/blender/commun.py docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md
git commit -m "intro : images témoins, planche contact, mesure du temps de rendu et règle des échantillons — spec intro vidéo §2.4, §9"
```

- [ ] **Step 15 : lancer l'aperçu** (toute l'intro, 50 %, 16 échantillons ; il tourne pendant l'écriture d'`encode.ts`, Task 7). Run :

```bash
cd web
rm -rf scripts/intro/.cache/frames/apercu
nohup caffeinate -i npm run intro:apercu > scripts/intro/.cache/console-apercu.log 2>&1 &
```

(`rm -rf` : les 7 images d'aperçu de la Task 5, Step 9, partent, et avec elles toute image d'une scène ou de clés antérieures au Step 12 ; pour reprendre un aperçu interrompu, relancer seulement la ligne `nohup …` depuis `web/` : les images entières sont gardées.) Expected : quelques minutes plus tard, `cd web && npm run intro:avancement -- apercu` montre `portrait : <n>/2377 images, <s> s/image` avec `<n>` qui monte, `paysage : 0/2377 images` et `reste ≈ <h> h + un cadrage sans mesure` ; une fois le portrait fini, la mesure du paysage s'ajoute. `caffeinate -i` tient le Mac éveillé tant que l'aperçu tourne ; `tail -3 scripts/intro/.cache/console-apercu.log` montre la dernière image écrite. La Task 7 attend qu'il soit fini (son Step 12).

---

### Task 7 : Encodage (encode.ts, manifeste, affiches, sprite assemblé, contrôles) — mis au point sur l'aperçu, point d'arrêt utilisateur

**Files:**
- Create: `web/src/intro/videos.ts` (types du manifeste, partagés avec le lecteur de la Task 9)
- Create: `web/scripts/intro/lib/mp4.ts`, `web/scripts/intro/lib/encodage.ts`, `web/scripts/intro/lib/apercu.ts`
- Create: `web/scripts/intro/encode.ts`
- Modify: `web/package.json` (script `intro:encode`)
- Modify (seulement si l'utilisateur demande la seconde de plus au Step 15) : `web/src/intro/temps.ts`, `web/src/intro/timeline.ts`, `web/src/intro/timeline.test.ts`, et `web/public/intro/ancres.json` (régénéré par `npm run intro:keys`)
- Modify: `docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md` (§1 : décision sur l'aperçu)
- Test: `web/scripts/intro/__tests__/unit/mp4.test.ts`, `web/scripts/intro/__tests__/unit/encodage.test.ts`, `web/scripts/intro/__tests__/unit/apercu.test.ts` (le motif `scripts/intro/__tests__/unit/**/*.test.ts` est dans `vitest.config.ts` depuis la Task 2)

**Interfaces:**
- Consumes : `temps.ts` (`CADRAGES`, `INTRO`, `IPS_MAITRE`, `BULLES`, `BULLES_RANGE`, `type Cadrage`, `type Bulle`) et `cadrages.ts` (`REFERENCES[c].echelle`) de la Task 1 ; `public/intro/ancres.json` et son type `Ancres` (`scripts/intro/export-keys.ts`) de la Task 3 ; les PNG RGBA 8 bits de `rendre.py` (Tasks 4-5) : `web/scripts/intro/.cache/frames/<apercu|rendu>/<cadrage>/f_0001.png … f_2377.png` (aperçu à 50 % : 540 × 1170 et 960 × 540) et `web/scripts/intro/.cache/frames/sprite/f_0001.png … f_0024.png` (128 × 128) ; `IMAGES_MAITRE`, `ancreTemoin` de `lib/temoins.ts` (Task 6) ; `npm run intro:avancement` (Task 6) ; ffmpeg/ffprobe 8.0.1 (`libsvtav1`, `libx265`), sharp 0.35.5.
- Produces :
  - `web/src/intro/videos.ts` : `type Codec = 'av1' | 'hevc'` ; `type Taille = 'plein' | 'leger'` ; `type Ips = 60 | 120` ; `interface Variante { cadrage; taille; ips; codec; src; type; width; height; octets }` ; `interface Manifeste { version: 1; duree: number; affiches: Record<Cadrage, string>; variantes: Variante[] }` ; `idVariante(v): string` (`portrait-plein-60-av1`, le format de `?introVariante=`).
  - `lib/mp4.ts` : `boites(b, debut?, fin?): Boite[]`, `ordreDeTete(b): string[]`, `chaineAv1(av1C): string`, `chaineHevc(hvcC, entree?): string`, `chaineCodec(b): string`.
  - `lib/encodage.ts` : `interface Sortie`, `LEGER`, `SORTIES` (10), `NUIT`, `NUIT_RGB`, `FOND_TOLERANCE`, `interface Reglage { crf; maxKbps }`, `REGLAGES: Record<idVariante, Reglage>`, `verdictDebit(kbps, r)`, `imagesAttendues(ips, n?)`, `nomFichier(s)`, `nomImage(n)`, `argsFfmpeg(s, entree, fichier)`, `interface Sonde`, `controlerSonde(s, p, images)`, `pointsDeFond(alpha, w, h, pas?, marge?)`, `controlerFond(rgb, w, points)`, `plafond(octets)`, `manifeste(faites): Manifeste`.
  - `lib/apercu.ts` : `bullesApercu()`, `bulleSvg(texte, e)`, `interface PoseBulle`, `grapheApercu(c, poses)`.
  - `npm run intro:encode -- --source apercu|rendu [--variantes id,…]`, `-- --sprite`, `-- --bulles`, `-- --plafonds`. Fichiers : `web/public/video/intro-<cadrage>[-leger]-<ips>.<codec>.mp4` (10), `web/public/video/videos.json` (format du contrat), `web/public/intro/affiche-<cadrage>.webp`, `web/public/intro/logo-terre.webp`, `web/e2e-budget/plafonds-video.json` (`{ version: 1, regle: string, plafonds: Record<src, octets> }`, lu par le budget de la Task 11) ; pour l'aperçu, tout va dans `web/scripts/intro/.cache/video-apercu/` (rien dans `public/`).

L'encodage complet a été vérifié au plan sur des PNG synthétiques (mire dans un disque flou mobile, fond transparent) : 2377 images 1080 × 2340 et 1920 × 1080 → 10 vidéos conformes en 4 min 06 s ; 2377 images à 50 % (aperçu) + bulles → 3 min 31 s à 3 min 42 s selon le passage ; fond décodé (22, 23, 58) en AV1 10 bits, (22, 23, 57) en HEVC 8 bits.

- [ ] **Step 1 : tests du lecteur MP4.** Créer `web/scripts/intro/__tests__/unit/mp4.test.ts` (les octets av1C et hvcC sont ceux de deux fichiers encodés par la fabrique) :

```ts
import { describe, expect, it } from 'vitest';
import { boites, chaineAv1, chaineCodec, chaineHevc, ordreDeTete } from '../../lib/mp4';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((x) => parseInt(x, 16)));
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** Boîte ISO BMFF : taille sur 32 bits, type, contenu. */
function boite(type: string, ...contenus: Uint8Array[]): Uint8Array {
  const n = 8 + contenus.reduce((s, c) => s + c.length, 0);
  const b = new Uint8Array(n);
  new DataView(b.buffer).setUint32(0, n);
  b.set(ascii(type), 4);
  let o = 8;
  for (const c of contenus) { b.set(c, o); o += c.length; }
  return b;
}

/** MP4 minimal : ftyp, moov (une piste dont l'entrée `entree` porte la configuration `conf`), free, mdat. */
function mp4(entree: string, conf: Uint8Array, faststart = true): Uint8Array {
  const stsd = boite('stsd', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]), boite(entree, new Uint8Array(78), conf));
  const moov = boite('moov', boite('mvhd', new Uint8Array(100)), boite('trak', boite('tkhd', new Uint8Array(84)),
    boite('mdia', boite('mdhd', new Uint8Array(24)), boite('minf', boite('vmhd', new Uint8Array(12)), boite('stbl', stsd)))));
  const morceaux = faststart
    ? [boite('ftyp', ascii('isom')), moov, boite('free'), boite('mdat', new Uint8Array(16))]
    : [boite('ftyp', ascii('isom')), boite('free'), boite('mdat', new Uint8Array(16)), moov];
  const out = new Uint8Array(morceaux.reduce((s, m) => s + m.length, 0));
  let o = 0;
  for (const m of morceaux) { out.set(m, o); o += m.length; }
  return out;
}

// Octets lus dans des fichiers encodés par la fabrique (portrait 1080 × 2340, 120 i/s) :
// av1C de libsvtav1 10 bits (en-tête de 4 octets puis l'OBU de séquence) ; en-tête hvcC de libx265 Main (22 octets),
// suivi ici de 0 tableau de paramètres (le vrai fichier en porte 4 : VPS, SPS, PPS, SEI).
const AV1C_PORTRAIT_120 = hex('810d4c000a0f0000006aae1bc91805f0a020202080');
const HVCC_PORTRAIT_120 = hex('01016000000090000000000099f000fcfdf8f800000f00');

describe('chaîne de codec RFC 6381', () => {
  it('AV1 : profil, niveau, rang, profondeur lus dans av1C', () => {
    expect(chaineAv1(AV1C_PORTRAIT_120)).toBe('av01.0.13M.10');
    expect(chaineAv1(hex('810d0c00'))).toBe('av01.0.13M.08');
    expect(chaineAv1(hex('8108cc00'))).toBe('av01.0.08H.10');
    expect(chaineAv1(hex('8148cc00'))).toBe('av01.2.08H.10');
    expect(chaineAv1(hex('8148ec00'))).toBe('av01.2.08H.12');
  });
  it('HEVC : compatibilités inversées, niveau, contraintes sans les nuls de fin', () => {
    expect(chaineHevc(HVCC_PORTRAIT_120)).toBe('hvc1.1.6.L153.90');
    // Main 10 (profil 2, compatibilité du profil 2 seule), rang haut, niveau 5.0, contraintes B0
    expect(chaineHevc(hex('012220000000b0000000000096f000fcfdfafa00000f00'))).toBe('hvc1.2.4.H150.B0');
    expect(chaineHevc(HVCC_PORTRAIT_120, 'hev1')).toBe('hev1.1.6.L153.90');
  });
  it('refuse une configuration inattendue', () => {
    expect(() => chaineAv1(hex('010d4c00'))).toThrow(/av1C/);
    expect(() => chaineHevc(hex('0201'))).toThrow(/hvcC/);
  });
  it('trouve la configuration dans moov → trak → mdia → minf → stbl → stsd', () => {
    expect(chaineCodec(mp4('av01', boite('av1C', AV1C_PORTRAIT_120)))).toBe('av01.0.13M.10');
    expect(chaineCodec(mp4('hvc1', boite('hvcC', HVCC_PORTRAIT_120)))).toBe('hvc1.1.6.L153.90');
    expect(() => chaineCodec(mp4('avc1', boite('avcC', new Uint8Array(8))))).toThrow(/ni hvcC/);
  });
});

describe('boîtes de tête', () => {
  it('faststart : moov avant mdat ; sinon après', () => {
    expect(ordreDeTete(mp4('av01', boite('av1C', AV1C_PORTRAIT_120)))).toEqual(['ftyp', 'moov', 'free', 'mdat']);
    expect(ordreDeTete(mp4('av01', boite('av1C', AV1C_PORTRAIT_120), false))).toEqual(['ftyp', 'free', 'mdat', 'moov']);
  });
  it('taille 64 bits (1) et taille 0 (jusqu’à la fin)', () => {
    const grande = new Uint8Array(20);
    new DataView(grande.buffer).setUint32(0, 1);
    grande.set(ascii('mdat'), 4);
    new DataView(grande.buffer).setBigUint64(8, 20n);
    const fin = new Uint8Array(12);
    fin.set(ascii('free'), 4);
    const b = new Uint8Array(32);
    b.set(grande, 0);
    b.set(fin, 20);
    expect(boites(b)).toEqual([{ type: 'mdat', debut: 0, fin: 20, corps: 16 }, { type: 'free', debut: 20, fin: 32, corps: 28 }]);
  });
  it('refuse une boîte qui dépasse le fichier', () => {
    const b = boite('mdat', new Uint8Array(8));
    expect(() => boites(b.subarray(0, 12))).toThrow(/tronquée/);
  });
});
```

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/mp4.test.ts`. Expected : FAIL — `Error: Cannot find module '../../lib/mp4'`, `Test Files  1 failed (1)`.

- [ ] **Step 3 : le lecteur MP4.** Créer `web/scripts/intro/lib/mp4.ts` :

```ts
/**
 * Lecture minimale d'un MP4 (ISO BMFF, ISO/IEC 14496-12) : l'ordre des boîtes de tête (`moov` avant `mdat` pour une
 * lecture qui démarre avant la fin du téléchargement) et la chaîne de codec RFC 6381 lue dans la configuration du
 * décodeur : `av1C` (AV1 Codec ISO Media File Format Binding, « Codecs Parameter String ») ou `hvcC` (ISO/IEC 14496-15,
 * annexe E). Le lecteur s'en sert pour `canPlayType` et `decodingInfo` : rien n'est écrit à la main.
 */
export interface Boite { type: string; debut: number; fin: number; corps: number }

/** Boîtes contiguës de `b` entre `debut` et `fin` (taille sur 32 bits ; 1 → 64 bits qui suivent ; 0 → jusqu'à `fin`). */
export function boites(b: Uint8Array, debut = 0, fin = b.length): Boite[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Boite[] = [];
  for (let o = debut; o + 8 <= fin;) {
    const type = String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!);
    let taille = dv.getUint32(o);
    let corps = o + 8;
    if (taille === 1) { taille = Number(dv.getBigUint64(o + 8)); corps = o + 16; }
    else if (taille === 0) taille = fin - o;
    if (taille < corps - o || o + taille > fin) throw new Error(`MP4 : boîte « ${type} » tronquée à l'octet ${o}`);
    out.push({ type, debut: o, fin: o + taille, corps });
    o += taille;
  }
  return out;
}

/** Types des boîtes de tête dans l'ordre du fichier (`+faststart` : `ftyp, moov, free, mdat`). */
export function ordreDeTete(b: Uint8Array): string[] {
  return boites(b).map((x) => x.type);
}

function sous(b: Uint8Array, parent: Boite, type: string): Boite | undefined {
  return boites(b, parent.corps, parent.fin).find((x) => x.type === type);
}

/** `av01.P.LLT.DD` : profil, niveau (2 chiffres), rang M/H, profondeur (08, 10, 12). */
export function chaineAv1(av1C: Uint8Array): string {
  if (av1C.length < 4 || av1C[0] !== 0x81) throw new Error('av1C : marqueur ou version inattendus');
  const profil = av1C[1]! >> 5, niveau = av1C[1]! & 31;
  const rang = av1C[2]! >> 7, haute = (av1C[2]! >> 6) & 1, douze = (av1C[2]! >> 5) & 1;
  const bits = profil === 2 && haute ? (douze ? 12 : 10) : haute ? 10 : 8;
  return `av01.${profil}.${String(niveau).padStart(2, '0')}${rang ? 'H' : 'M'}.${String(bits).padStart(2, '0')}`;
}

/**
 * `hvc1.[A|B|C]profil.compat.Lniveau.contraintes` : compatibilités en bits inversés et en hexadécimal, rang L/H et
 * niveau en décimal, octets de contraintes en hexadécimal, les nuls de fin omis.
 */
export function chaineHevc(hvcC: Uint8Array, entree = 'hvc1'): string {
  if (hvcC.length < 23 || hvcC[0] !== 1) throw new Error('hvcC : version inattendue');
  const espace = hvcC[1]! >> 6, rang = (hvcC[1]! >> 5) & 1, profil = hvcC[1]! & 31;
  const compat = new DataView(hvcC.buffer, hvcC.byteOffset + 2, 4).getUint32(0);
  let inverse = 0;
  for (let k = 0; k < 32; k++) if (compat & (1 << k)) inverse |= 1 << (31 - k);
  const contraintes = Array.from(hvcC.subarray(6, 12));
  while (contraintes.length > 0 && contraintes[contraintes.length - 1] === 0) contraintes.pop();
  const hex = (n: number) => n.toString(16).toUpperCase();
  return [`${entree}`, `${['', 'A', 'B', 'C'][espace]}${profil}`, hex(inverse >>> 0), `${rang ? 'H' : 'L'}${hvcC[12]}`, ...contraintes.map(hex)].join('.');
}

/** Chaîne de codec de la première piste vidéo AV1 ou HEVC (moov → trak → mdia → minf → stbl → stsd). */
export function chaineCodec(b: Uint8Array): string {
  const moov = boites(b).find((x) => x.type === 'moov');
  if (!moov) throw new Error('MP4 sans boîte moov');
  for (const trak of boites(b, moov.corps, moov.fin).filter((x) => x.type === 'trak')) {
    let n: Boite | undefined = trak;
    for (const t of ['mdia', 'minf', 'stbl', 'stsd']) n = n && sous(b, n, t);
    if (!n) continue;
    // stsd : version et drapeaux (4 octets), nombre d'entrées (4), puis les entrées ; une entrée visuelle a 78 octets
    // de champs fixes avant ses boîtes filles (ISO/IEC 14496-12 §12.1.3).
    for (const e of boites(b, n.corps + 8, n.fin)) {
      const enfants = boites(b, e.corps + 78, e.fin);
      const conf = enfants.find((x) => x.type === 'av1C' || x.type === 'hvcC');
      if (!conf) continue;
      const octets = b.subarray(conf.corps, conf.fin);
      return conf.type === 'av1C' ? chaineAv1(octets) : chaineHevc(octets, e.type);
    }
  }
  throw new Error('MP4 sans configuration av1C ni hvcC');
}
```

- [ ] **Step 4 : vérifier.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/mp4.test.ts`. Expected : PASS — `Tests  7 passed (7)`.

- [ ] **Step 5 : tests de l'encodage et de l'aperçu.** Créer `web/scripts/intro/__tests__/unit/encodage.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { INTRO, IPS_MAITRE } from '../../../../src/intro/temps';
import { idVariante } from '../../../../src/intro/videos';
import {
  argsFfmpeg, controlerFond, controlerSonde, imagesAttendues, manifeste, nomFichier, plafond, pointsDeFond, REGLAGES,
  SORTIES, verdictDebit, type Sonde, type Sortie,
} from '../../lib/encodage';
import { IMAGES_MAITRE } from '../../lib/temoins';

const sortie = (id: string): Sortie => SORTIES.find((s) => idVariante(s) === id)!;

describe('les 10 vidéos', () => {
  it('portrait plein 60/120, portrait léger 60, paysage 60/120, chacune en AV1 et HEVC, chacune réglée', () => {
    expect(SORTIES.map(idVariante)).toEqual([
      'portrait-plein-120-av1', 'portrait-plein-120-hevc', 'portrait-plein-60-av1', 'portrait-plein-60-hevc',
      'portrait-leger-60-av1', 'portrait-leger-60-hevc', 'paysage-plein-120-av1', 'paysage-plein-120-hevc',
      'paysage-plein-60-av1', 'paysage-plein-60-hevc',
    ]);
    expect(Object.keys(REGLAGES).sort()).toEqual(SORTIES.map(idVariante).sort());
    expect(SORTIES.map(nomFichier)).toContain('intro-portrait-leger-60.hevc.mp4');
    expect(nomFichier(sortie('portrait-plein-120-av1'))).toBe('intro-portrait-120.av1.mp4');
    expect(sortie('portrait-leger-60-av1')).toMatchObject({ width: 720, height: 1560 });
    expect(sortie('paysage-plein-60-hevc')).toMatchObject({ width: 1920, height: 1080 });
  });

  it('images : la dernière image maîtresse est l’instant FIN ; à 60 i/s une sur deux (mesuré : 241 → 120)', () => {
    expect((IMAGES_MAITRE - 1) / IPS_MAITRE).toBeCloseTo(INTRO.FIN, 9);
    expect(imagesAttendues(120, 241)).toBe(241);
    expect(imagesAttendues(60, 241)).toBe(120);
    expect(imagesAttendues(60, 360)).toBe(180);
  });
});

describe('arguments ffmpeg', () => {
  const entree = { dossier: '/f/portrait', width: 1080, height: 2340 };

  it('AV1 120 : nuit exacte en gbrp, bt709 étiqueté, 10 bits, plafond mbr, faststart', () => {
    expect(argsFfmpeg(sortie('portrait-plein-120-av1'), entree, '/o/a.mp4')).toEqual([
      '-hide_banner', '-y', '-framerate', '120', '-start_number', '1', '-i', '/f/portrait/f_%04d.png',
      '-f', 'lavfi', '-i', 'color=c=0x16173a:s=1080x2340:r=120,format=gbrp',
      '-filter_complex', '[1][0]overlay=format=gbrp:shortest=1,scale=w=1080:h=2340:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p10le,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
      '-c:v', 'libsvtav1', '-preset', '5', '-crf', '30', '-g', '240', '-svtav1-params', 'mbr=4000',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', '-an', '/o/a.mp4',
    ]);
  });

  it('HEVC 60 léger : fps=60 dans le graphe, réduction à 720 × 1560, Main 8 bits, étiquette hvc1, VBV', () => {
    const a = argsFfmpeg(sortie('portrait-leger-60-hevc'), entree, '/o/b.mp4');
    expect(a[a.indexOf('-filter_complex') + 1]).toBe('[1][0]overlay=format=gbrp:shortest=1,fps=60,scale=w=720:h=1560:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv');
    expect(a.slice(a.indexOf('-c:v'), a.indexOf('-colorspace'))).toEqual([
      '-c:v', 'libx265', '-preset', 'slow', '-crf', '22', '-g', '120', '-tag:v', 'hvc1',
      '-x265-params', 'log-level=error:vbv-maxrate=4000:vbv-bufsize=8000',
    ]);
    expect(a).not.toContain('select');
  });

  it('la source de nuit a la taille des images d’entrée (aperçu plus petit : mis à l’échelle par scale)', () => {
    const a = argsFfmpeg(sortie('paysage-plein-60-av1'), { dossier: '/f/paysage', width: 960, height: 540 }, '/o/c.mp4');
    expect(a).toContain('color=c=0x16173a:s=960x540:r=120,format=gbrp');
    expect(a[a.indexOf('-filter_complex') + 1]).toContain(',fps=60,scale=w=1920:h=1080:');
  });
});

describe('contrôles', () => {
  const conforme: Sonde = {
    codec_name: 'av1', codec_tag_string: 'av01', width: 1080, height: 2340, pix_fmt: 'yuv420p10le',
    r_frame_rate: '120/1', nb_frames: '2377', color_range: 'tv', color_space: 'bt709', color_primaries: 'bt709',
    color_transfer: 'bt709', bit_rate: '991000',
  };

  it('ffprobe : conforme → aucun écart ; étiquettes de couleur perdues ou image manquante → nommées', () => {
    const s = sortie('portrait-plein-120-av1');
    expect(controlerSonde(s, conforme, 2377)).toEqual([]);
    const { color_primaries: _p, color_transfer: _t, ...sans } = conforme;
    expect(controlerSonde(s, { ...sans, nb_frames: '2376' }, 2377)).toEqual([
      'images : 2376 au lieu de 2377', 'primaires : (absentes) au lieu de bt709', 'transfert : (absent) au lieu de bt709',
    ]);
    expect(controlerSonde(sortie('portrait-plein-120-hevc'), conforme, 2377)).toEqual([
      'codec : av1 au lieu de hevc', 'étiquette : av01 au lieu de hvc1', 'format : yuv420p10le au lieu de yuv420p',
    ]);
  });

  it('points de fond : seulement là où tout le carré autour est transparent', () => {
    const w = 200, h = 100, alpha = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 100; x < w; x++) alpha[y * w + x] = 255;   // moitié droite opaque
    const p = pointsDeFond(alpha, w, h, 30, 10);
    expect(p).toEqual([[10, 10], [40, 10], [70, 10], [10, 40], [40, 40], [70, 40], [10, 70], [40, 70], [70, 70]]);
  });

  it('fond décodé : ± 3 de (22, 23, 58)', () => {
    const rgb = Uint8Array.from([22, 23, 58, 19, 26, 61, 22, 23, 54]);
    expect(controlerFond(rgb, 3, [[0, 0], [1, 0]])).toEqual([]);
    expect(controlerFond(rgb, 3, [[2, 0]])).toEqual(['(2, 0) : 22,23,54']);
  });

  it('verdict de débit : plafond au-delà de 90 %, marge sous 50 %', () => {
    expect(verdictDebit(3700, { crf: 30, maxKbps: 4000 })).toBe('plafond');
    expect(verdictDebit(1999, { crf: 30, maxKbps: 4000 })).toBe('marge');
    expect(verdictDebit(2500, { crf: 30, maxKbps: 4000 })).toBe('ok');
  });
});

describe('plafonds du budget', () => {
  it('taille mesurée arrondie au Mo supérieur, + 10 %', () => {
    expect(plafond(2_546_202)).toBe(3_300_000);
    expect(plafond(3_000_000)).toBe(3_300_000);
    expect(plafond(3_000_001)).toBe(4_400_000);
  });
});

describe('manifeste', () => {
  it('au format du contrat : chemins /video/, type lu dans le fichier, octets réels', () => {
    const m = manifeste([
      { s: sortie('portrait-plein-120-av1'), octets: 250758, codecs: 'av01.0.13M.10' },
      { s: sortie('paysage-plein-60-hevc'), octets: 53518, codecs: 'hvc1.1.6.L123.90' },
    ]);
    expect(m).toEqual({
      version: 1, duree: INTRO.FIN,
      affiches: { portrait: '/intro/affiche-portrait.webp', paysage: '/intro/affiche-paysage.webp' },
      variantes: [
        { cadrage: 'portrait', taille: 'plein', ips: 120, codec: 'av1', src: '/video/intro-portrait-120.av1.mp4',
          type: 'video/mp4; codecs="av01.0.13M.10"', width: 1080, height: 2340, octets: 250758 },
        { cadrage: 'paysage', taille: 'plein', ips: 60, codec: 'hevc', src: '/video/intro-paysage-60.hevc.mp4',
          type: 'video/mp4; codecs="hvc1.1.6.L123.90"', width: 1920, height: 1080, octets: 53518 },
      ],
    });
  });
});
```

et `web/scripts/intro/__tests__/unit/apercu.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { BULLES, BULLES_RANGE } from '../../../../src/intro/temps';
import { REFERENCES } from '../../../../src/intro/cadrages';
import { bullesApercu, bulleSvg, grapheApercu } from '../../lib/apercu';

describe('aperçu avec bulles', () => {
  it('six bulles : chaque question de son apparition à son retournement, puis sa réponse jusqu’au rangement', () => {
    expect(bullesApercu()).toEqual([
      { bulle: 'capitale', texte: 'Capitale ?', de: BULLES.capitale.apparait, a: BULLES.capitale.retourne },
      { bulle: 'capitale', texte: 'Paris', de: BULLES.capitale.retourne, a: BULLES_RANGE },
      { bulle: 'pays', texte: 'Pays ?', de: BULLES.pays.apparait, a: BULLES.pays.retourne },
      { bulle: 'pays', texte: 'France', de: BULLES.pays.retourne, a: BULLES_RANGE },
      { bulle: 'drapeau', texte: 'Drapeau ?', de: BULLES.drapeau.apparait, a: BULLES.drapeau.retourne },
      { bulle: 'drapeau', texte: null, de: BULLES.drapeau.retourne, a: BULLES_RANGE },
    ]);
  });

  it('bulle : la pointe de la queue est en bas à gauche, à l’échelle du cadrage', () => {
    expect(bulleSvg('Paris', 1).pointe).toEqual([8, 58]);
    const p = bulleSvg('Paris', REFERENCES.portrait.echelle);
    expect(p.pointe[0]).toBeCloseTo(8 * 1080 / 390, 9);
    expect(p.svg).toContain('>Paris</text>');
    expect(bulleSvg(null, 1).svg).toContain('fill="#2b55c9"');
  });

  it('graphe : nuit, 60 i/s, cadrage plein, une superposition par bulle dans sa fenêtre, bt709 étiqueté', () => {
    expect(grapheApercu('paysage', [{ x: 10.4, y: -3.6, de: 11.1, a: 14 }, { x: 0, y: 0, de: 14, a: 16.2 }])).toBe(
      '[1][0]overlay=format=gbrp:shortest=1,fps=60,scale=w=1920:h=1080:flags=lanczos[v0];'
      + "[v0][2]overlay=format=gbrp:x=10:y=-4:enable='gte(t,11.1)*lt(t,14)'[v1];"
      + "[v1][3]overlay=format=gbrp:x=0:y=0:enable='gte(t,14)*lt(t,16.2)'[v2];"
      + '[v2]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    );
  });
});
```

- [ ] **Step 6 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/encodage.test.ts scripts/intro/__tests__/unit/apercu.test.ts`. Expected : FAIL — `Error: Cannot find module '../../../../src/intro/videos'` (encodage), `Error: Cannot find module '../../lib/apercu'` (aperçu), `Test Files  2 failed (2)`.

- [ ] **Step 7 : les types du manifeste.** Créer `web/src/intro/videos.ts` :

```ts
import type { Cadrage } from './temps';

/**
 * Manifeste des vidéos de l'intro (`/video/videos.json`) : écrit par la fabrique (`scripts/intro/encode.ts`), lu par le
 * lecteur. Le `type` porte la chaîne de codec lue dans le fichier (boîte av1C ou hvcC), jamais écrite à la main.
 */
export type Codec = 'av1' | 'hevc';
/** `plein` : la résolution du cadrage ; `leger` : portrait 720 × 1560 pour les décodeurs qui ne tiennent pas le niveau 5. */
export type Taille = 'plein' | 'leger';
export type Ips = 60 | 120;

export interface Variante {
  cadrage: Cadrage;
  taille: Taille;
  ips: Ips;
  codec: Codec;
  /** URL absolue du fichier (`/video/intro-portrait-120.av1.mp4`). */
  src: string;
  /** Pour `canPlayType` et `decodingInfo` : `video/mp4; codecs="av01.0.13M.10"`. */
  type: string;
  width: number;
  height: number;
  octets: number;
}

export interface Manifeste {
  version: 1;
  /** Durée de l'intro (s), `INTRO.FIN`. */
  duree: number;
  affiches: Record<Cadrage, string>;
  variantes: Variante[];
}

/** Identifiant d'une variante, celui du crochet `?introVariante=` : `portrait-plein-60-av1`. */
export function idVariante(v: Pick<Variante, 'cadrage' | 'taille' | 'ips' | 'codec'>): string {
  return `${v.cadrage}-${v.taille}-${v.ips}-${v.codec}`;
}
```

- [ ] **Step 8 : ce que la fabrique encode.** Créer `web/scripts/intro/lib/encodage.ts` :

```ts
import path from 'node:path';
import { CADRAGES, INTRO, IPS_MAITRE, type Cadrage } from '../../../src/intro/temps';
import { idVariante, type Codec, type Ips, type Manifeste, type Taille } from '../../../src/intro/videos';
import { IMAGES_MAITRE } from './temoins';

/**
 * Ce que la fabrique encode (spec intro vidéo §2.5, décisions D2 et D7 du plan) : 10 vidéos, réglages de débit, graphe
 * ffmpeg, contrôles et manifeste. Fonctions pures : `encode.ts` les exécute.
 */

/** Une vidéo à produire. */
export interface Sortie { cadrage: Cadrage; taille: Taille; ips: Ips; codec: Codec; width: number; height: number }

/** Portrait léger (D2) : 2/3 du plein, pour les décodeurs qui ne tiennent pas le niveau 5 (1080 × 2340). */
export const LEGER = { width: 720, height: 1560 } as const;

const CODECS: Codec[] = ['av1', 'hevc'];
const GABARITS: Omit<Sortie, 'codec'>[] = [
  { cadrage: 'portrait', taille: 'plein', ips: 120, ...CADRAGES.portrait },
  { cadrage: 'portrait', taille: 'plein', ips: 60, ...CADRAGES.portrait },
  { cadrage: 'portrait', taille: 'leger', ips: 60, ...LEGER },
  { cadrage: 'paysage', taille: 'plein', ips: 120, ...CADRAGES.paysage },
  { cadrage: 'paysage', taille: 'plein', ips: 60, ...CADRAGES.paysage },
];
/** Les 10 vidéos, dans l'ordre du manifeste. */
export const SORTIES: Sortie[] = GABARITS.flatMap((g) => CODECS.map((codec) => ({ ...g, codec })));

/** Nuit de l'accueil (`--nuit`), posée sous les images transparentes. */
export const NUIT = '#16173a';
export const NUIT_RGB = [22, 23, 58] as const;
/** Écart toléré sur le fond décodé (spec §8 : ± 3). */
export const FOND_TOLERANCE = 3;

export interface Reglage { crf: number; maxKbps: number }
/**
 * Débit : CRF (qualité visée) et plafond de débit crête (kb/s : `mbr` de SVT-AV1, VBV de x265).
 * Plafond : un lien 4G médiocre de 8 Mb/s, dont la moitié pour la vidéo (l'autre au globe, qui se charge pendant
 * l'intro) → 4000 kb/s pour toutes les variantes. CRF de départ : AV1 10 bits 30, HEVC 22 (reconnaissance ffmpeg).
 * Règle de réglage, appliquée une fois sur le rendu final (Task 8) d'après le débit moyen mesuré `d` (ffprobe) :
 *  - d > 0,9 × maxKbps : le plafond mord, la qualité est bornée par le lien visé ; on garde, revue à l'œil ;
 *  - d < 0,5 × maxKbps : de la marge, CRF − 2 (meilleure qualité) et ré-encodage de cette variante ;
 *  - sinon : on garde.
 * `encode.ts` affiche ce verdict pour chaque vidéo (`verdictDebit`).
 */
export const REGLAGES: Record<string, Reglage> = {
  'portrait-plein-120-av1': { crf: 30, maxKbps: 4000 },
  'portrait-plein-120-hevc': { crf: 22, maxKbps: 4000 },
  'portrait-plein-60-av1': { crf: 30, maxKbps: 4000 },
  'portrait-plein-60-hevc': { crf: 22, maxKbps: 4000 },
  'portrait-leger-60-av1': { crf: 30, maxKbps: 4000 },
  'portrait-leger-60-hevc': { crf: 22, maxKbps: 4000 },
  'paysage-plein-120-av1': { crf: 30, maxKbps: 4000 },
  'paysage-plein-120-hevc': { crf: 22, maxKbps: 4000 },
  'paysage-plein-60-av1': { crf: 30, maxKbps: 4000 },
  'paysage-plein-60-hevc': { crf: 22, maxKbps: 4000 },
};

export function verdictDebit(kbps: number, r: Reglage): 'plafond' | 'marge' | 'ok' {
  return kbps > 0.9 * r.maxKbps ? 'plafond' : kbps < 0.5 * r.maxKbps ? 'marge' : 'ok';
}

/**
 * Images d'une vidéo encodée depuis `n` images maîtres. `fps=60` garde une image sur deux à partir de la première ;
 * quand `n` est impair, la dernière (instant `FIN`, 1/120 s après l'avant-dernière gardée) tombe. Mesuré : 241 → 120,
 * 2377 → 1188.
 */
export function imagesAttendues(ips: Ips, n = IMAGES_MAITRE): number {
  return ips === IPS_MAITRE ? n : Math.floor(n / 2);
}

export function nomFichier(s: Pick<Sortie, 'cadrage' | 'taille' | 'ips' | 'codec'>): string {
  return `intro-${s.cadrage}${s.taille === 'leger' ? '-leger' : ''}-${s.ips}.${s.codec}.mp4`;
}

export function nomImage(n: number): string {
  return `f_${String(n).padStart(4, '0')}.png`;
}

/**
 * Arguments ffmpeg d'une vidéo. Entrée : les PNG `f_0001.png…` de `dossier` (taille `width × height`), à 120 i/s.
 * Graphe vérifié (reconnaissance ffmpeg) : nuit `color` forcée en gbrp, sinon elle n'est pas exacte ; superposition
 * en gbrp et en alpha droit (celui des PNG de Blender 5.0.1 : bord d'une sphère rouge lu (255, 0, 0) sous α 76 à 207) ;
 * une image sur deux par `fps=60` (jamais `select` sans `-r`) ; conversion bt709 limitée, mise à l'échelle comprise ;
 * puis `setparams`, sans lequel ffmpeg 8 perd primaires et transfert dans le fichier.
 */
export function argsFfmpeg(s: Sortie, e: { dossier: string; width: number; height: number }, fichier: string): string[] {
  const r = REGLAGES[idVariante(s)];
  if (!r) throw new Error(`pas de réglage pour ${idVariante(s)}`);
  const cadence = s.ips === IPS_MAITRE ? '' : `,fps=${s.ips}`;
  const format = s.codec === 'av1' ? 'yuv420p10le' : 'yuv420p';
  const graphe = `[1][0]overlay=format=gbrp:shortest=1${cadence},`
    + `scale=w=${s.width}:h=${s.height}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,`
    + `format=${format},setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`;
  const gop = String(2 * s.ips);   // une image clé toutes les 2 s (`?introT=` s'y place vite)
  const codec = s.codec === 'av1'
    ? ['-c:v', 'libsvtav1', '-preset', '5', '-crf', String(r.crf), '-g', gop, '-svtav1-params', `mbr=${r.maxKbps}`]
    : ['-c:v', 'libx265', '-preset', 'slow', '-crf', String(r.crf), '-g', gop, '-tag:v', 'hvc1',
      '-x265-params', `log-level=error:vbv-maxrate=${r.maxKbps}:vbv-bufsize=${2 * r.maxKbps}`];
  return [
    '-hide_banner', '-y',
    '-framerate', String(IPS_MAITRE), '-start_number', '1', '-i', path.join(e.dossier, 'f_%04d.png'),
    '-f', 'lavfi', '-i', `color=c=0x${NUIT.slice(1)}:s=${e.width}x${e.height}:r=${IPS_MAITRE},format=gbrp`,
    '-filter_complex', graphe,
    ...codec,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-an', fichier,
  ];
}

/** Ce que ffprobe dit du flux vidéo (`-show_entries stream=…`). */
export interface Sonde {
  codec_name: string; codec_tag_string: string; width: number; height: number; pix_fmt: string;
  r_frame_rate: string; nb_frames: string; color_range?: string; color_space?: string;
  color_primaries?: string; color_transfer?: string; bit_rate: string;
}

/** Écarts entre une vidéo encodée et ce qui est attendu ; vide = conforme. */
export function controlerSonde(s: Sortie, p: Sonde, images: number): string[] {
  const attendu: [string, string | number, string | number][] = [
    ['codec', p.codec_name, s.codec === 'av1' ? 'av1' : 'hevc'],
    ['étiquette', p.codec_tag_string, s.codec === 'av1' ? 'av01' : 'hvc1'],
    ['format', p.pix_fmt, s.codec === 'av1' ? 'yuv420p10le' : 'yuv420p'],
    ['largeur', p.width, s.width],
    ['hauteur', p.height, s.height],
    ['cadence', p.r_frame_rate, `${s.ips}/1`],
    ['images', Number(p.nb_frames), images],
    ['plage', p.color_range ?? '(absente)', 'tv'],
    ['matrice', p.color_space ?? '(absente)', 'bt709'],
    ['primaires', p.color_primaries ?? '(absentes)', 'bt709'],
    ['transfert', p.color_transfer ?? '(absent)', 'bt709'],
  ];
  return attendu.filter(([, lu, voulu]) => lu !== voulu).map(([nom, lu, voulu]) => `${nom} : ${lu} au lieu de ${voulu}`);
}

/**
 * Points de fond pour le contrôle de couleur : sur une grille de pas `pas`, ceux dont le carré de côté 2·marge + 1 est
 * entièrement transparent sur l'image source (le sous-échantillonnage de la chrominance ne mêle rien d'autre).
 */
export function pointsDeFond(alpha: Uint8Array, width: number, height: number, pas = 60, marge = 16): [number, number][] {
  const out: [number, number][] = [];
  for (let y = marge; y < height - marge; y += pas) {
    for (let x = marge; x < width - marge; x += pas) {
      let vide = true;
      for (let j = y - marge; vide && j <= y + marge; j++) {
        for (let i = x - marge; i <= x + marge; i++) if (alpha[j * width + i] !== 0) { vide = false; break; }
      }
      if (vide) out.push([x, y]);
    }
  }
  return out;
}

/** Écarts du fond décodé (rgb24, `width` px par ligne) à la nuit, aux points donnés. */
export function controlerFond(rgb: Uint8Array, width: number, points: [number, number][]): string[] {
  const ecarts: string[] = [];
  for (const [x, y] of points) {
    const o = (y * width + x) * 3;
    const lu = [rgb[o]!, rgb[o + 1]!, rgb[o + 2]!];
    if (lu.some((v, k) => Math.abs(v - NUIT_RGB[k]!) > FOND_TOLERANCE)) ecarts.push(`(${x}, ${y}) : ${lu.join(',')}`);
  }
  return ecarts;
}

/**
 * Plafond d'octets d'une vidéo pour le test de budget (spec §7 : fixé après mesure) : la taille mesurée arrondie au Mo
 * supérieur (10⁶ octets), plus 10 %. Un ré-encodage qui grossit au-delà fait échouer le budget : on décide alors.
 */
export function plafond(octets: number): number {
  return Math.round(Math.ceil(octets / 1e6) * 1e6 * 1.1);
}

/** Le manifeste du lecteur ; `type` vient de la chaîne de codec lue dans chaque fichier. */
export function manifeste(faites: { s: Sortie; octets: number; codecs: string }[]): Manifeste {
  return {
    version: 1,
    duree: INTRO.FIN,
    affiches: { portrait: '/intro/affiche-portrait.webp', paysage: '/intro/affiche-paysage.webp' },
    variantes: faites.map(({ s, octets, codecs }) => ({
      cadrage: s.cadrage, taille: s.taille, ips: s.ips, codec: s.codec,
      src: `/video/${nomFichier(s)}`, type: `video/mp4; codecs="${codecs}"`,
      width: s.width, height: s.height, octets,
    })),
  };
}
```

- [ ] **Step 9 : l'aperçu à bulles.** Créer `web/scripts/intro/lib/apercu.ts` :

```ts
import { BULLES, BULLES_RANGE, CADRAGES, type Bulle, type Cadrage } from '../../../src/intro/temps';
import { NUIT } from './encodage';

/**
 * Aperçu à juger avec ses bulles (spec intro vidéo §3.3 : le rythme des bulles se juge sur la prévisualisation, l'intro
 * peut gagner ≈ 1 s). Les vraies bulles sont du HTML (Task 10) : ici une esquisse posée sur la vidéo, à l'ancre de
 * l'instant d'apparition, la question puis la réponse. Pas un livrable.
 */

/** Une bulle dans l'aperçu : texte (null = drapeau tricolore), fenêtre d'affichage (s). */
export interface BulleApercu { bulle: Bulle; texte: string | null; de: number; a: number }

const QUESTIONS: Record<Bulle, string> = { capitale: 'Capitale ?', pays: 'Pays ?', drapeau: 'Drapeau ?' };
const REPONSES: Record<Bulle, string | null> = { capitale: 'Paris', pays: 'France', drapeau: null };

/** Les six bulles : chaque question de son apparition à son retournement, puis la réponse jusqu'au rangement. */
export function bullesApercu(): BulleApercu[] {
  return (Object.keys(BULLES) as Bulle[]).flatMap((b) => [
    { bulle: b, texte: QUESTIONS[b], de: BULLES[b].apparait, a: BULLES[b].retourne },
    { bulle: b, texte: REPONSES[b], de: BULLES[b].retourne, a: BULLES_RANGE },
  ]);
}

/**
 * Bulle en SVG à l'échelle `e` (px vidéo par px CSS, `REFERENCES[cadrage].echelle`) : cartouche crème cerné de nuit,
 * texte en 20 px CSS (Arial Black), queue en bas à gauche ; `pointe` = bout de la queue, à poser sur l'ancre.
 */
export function bulleSvg(texte: string | null, e: number): { svg: string; pointe: [number, number] } {
  const H0 = 44 * e, H = H0 + 14 * e;
  const W = texte === null ? 72 * e : (24 + 0.72 * 20 * texte.length) * e;
  const contenu = texte === null
    ? ['#2b55c9', '#fff8ec', '#e8413a'].map((c, i) => `<rect x="${(18 + 12 * i) * e}" y="${10 * e}" width="${12 * e}" height="${24 * e}" fill="${c}"/>`).join('')
    : `<text x="${W / 2}" y="${H0 / 2 + 7 * e}" font-size="${20 * e}" text-anchor="middle" font-family="Arial Black" fill="${NUIT}">${texte}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H + 3 * e)}">`
    + `<path d="M${14 * e} ${H0 - 2 * e} L${8 * e} ${H} L${30 * e} ${H0 - 2 * e} Z" fill="#fff8e7" stroke="${NUIT}" stroke-width="${3 * e}" stroke-linejoin="round"/>`
    + `<rect x="${1.5 * e}" y="${1.5 * e}" width="${W - 3 * e}" height="${H0 - 3 * e}" rx="${12 * e}" fill="#fff8e7" stroke="${NUIT}" stroke-width="${3 * e}"/>`
    + `${contenu}</svg>`;
  return { svg, pointe: [8 * e, H] };
}

/** Coin haut-gauche (px vidéo) de chaque bulle et sa fenêtre, dans l'ordre des entrées ffmpeg 2, 3, … */
export interface PoseBulle { x: number; y: number; de: number; a: number }

/**
 * Graphe de l'aperçu à juger : nuit, une image sur deux (60 i/s), cadrage plein, puis chaque bulle superposée pendant
 * sa fenêtre [de, a[ ; HEVC Main 8 bits (lu par QuickTime).
 */
export function grapheApercu(c: Cadrage, poses: PoseBulle[]): string {
  const { width, height } = CADRAGES[c];
  const etapes = [`[1][0]overlay=format=gbrp:shortest=1,fps=60,scale=w=${width}:h=${height}:flags=lanczos[v0]`];
  poses.forEach((p, i) => etapes.push(
    `[v${i}][${i + 2}]overlay=format=gbrp:x=${Math.round(p.x)}:y=${Math.round(p.y)}:enable='gte(t,${p.de})*lt(t,${p.a})'[v${i + 1}]`));
  etapes.push(`[v${poses.length}]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,`
    + 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv');
  return etapes.join(';');
}
```

- [ ] **Step 10 : vérifier.** Run : `cd web && npx vitest run --project unit scripts/intro/__tests__/unit/mp4.test.ts scripts/intro/__tests__/unit/encodage.test.ts scripts/intro/__tests__/unit/apercu.test.ts`. Expected : PASS — `Test Files  3 passed (3)`, `Tests  21 passed (21)` (7 + 11 + 3).

- [ ] **Step 11 : le script.** Créer `web/scripts/intro/encode.ts` :

```ts
/**
 * Encodage de l'intro (spec intro vidéo §2.5) : des PNG RGBA 8 bits rendus par Blender, fond transparent
 * (`.cache/frames/<source>/<cadrage>/f_0001.png…`, 120 i/s), aux 10 vidéos du lecteur, aux deux affiches et au
 * manifeste `videos.json` :
 *  - la nuit `#16173a` est posée ici, exacte (graphe et réglages : `lib/encodage.ts`) ;
 *  - AV1 10 bits (libsvtav1) et HEVC Main (libx265, étiquette hvc1 pour Safari), 60 et 120 i/s, `+faststart` ;
 *  - contrôles : nombre de PNG AVANT d'encoder (image2 s'arrête en silence au premier PNG manquant), puis pour chaque
 *    vidéo ffprobe (codec, format, taille, cadence, nombre d'images, étiquettes de couleur), `moov` avant `mdat`, fond
 *    décodé à ± 3 de (22, 23, 58) ; la chaîne de codec du manifeste est lue dans le fichier (`lib/mp4.ts`) ;
 *  - affiches : la première image sur la nuit, en WebP sans perte (sharp : ffmpeg n'a pas d'encodeur WebP).
 * `--sprite` assemble les 24 vues de la petite Terre du titre (`npm run intro:sprite` : `.cache/frames/sprite/f_0001.png`
 * … `f_0024.png`, 128 × 128, vue i ↔ angle (i − 1)·15°) en `public/intro/logo-terre.webp` (3072 × 128, q88, alpha 90 :
 * même chemin, même disposition qu'avant).
 * `--bulles` fait de l'aperçu (`.cache/frames/apercu/`) une vidéo à juger, bulles esquissées à leurs ancres
 * (`lib/apercu.ts`) : `.cache/video-apercu/apercu-<cadrage>-bulles.mp4`, HEVC 60 i/s lu par QuickTime.
 * `--plafonds` fige les plafonds d'octets du test de budget depuis `public/video/videos.json` dans
 * `e2e-budget/plafonds-video.json` (règle : `plafond` de `lib/encodage.ts`) ; à lancer exprès, jamais à chaque encodage.
 * Usage : `npm run intro:encode -- --source apercu|rendu [--variantes portrait-plein-60-hevc,…]`, et/ou `--sprite`,
 * `--bulles`, `--plafonds`.
 * Sorties : `rendu` → `public/video/` (vidéos, `videos.json`) et `public/intro/` (affiches) ; `apercu` →
 * `scripts/intro/.cache/video-apercu/` (rien dans `public/`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { REFERENCES } from '../../src/intro/cadrages';
import { BULLES, CADRAGES, type Cadrage } from '../../src/intro/temps';
import { idVariante, type Manifeste } from '../../src/intro/videos';
import {
  argsFfmpeg, controlerFond, controlerSonde, imagesAttendues, manifeste, nomFichier, nomImage, NUIT, plafond,
  pointsDeFond, REGLAGES, SORTIES, verdictDebit, type Sonde, type Sortie,
} from './lib/encodage';
import { bullesApercu, bulleSvg, grapheApercu, type PoseBulle } from './lib/apercu';
import { chaineCodec, ordreDeTete } from './lib/mp4';
import type { Ancres } from './export-keys';
import { ancreTemoin, IMAGES_MAITRE } from './lib/temoins';

sharp.cache(false);
const ICI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(ICI, '../..');
const CACHE = path.join(ICI, '.cache');
const SPRITE = { vues: 24, cote: 128 };

const { values: opts } = parseArgs({
  options: {
    source: { type: 'string' }, variantes: { type: 'string' }, sprite: { type: 'boolean' }, bulles: { type: 'boolean' },
    plafonds: { type: 'boolean' },
  },
});
const source = opts.source;
if (source !== undefined && source !== 'apercu' && source !== 'rendu') throw new Error('--source apercu|rendu');
if (source === undefined && !opts.sprite && !opts.bulles && !opts.plafonds) {
  throw new Error('usage : --source apercu|rendu [--variantes …] [--sprite] [--bulles] [--plafonds]');
}

/** Refuse un dossier où il manque une image, où une image est vide (rendu interrompu), ou qui en a de trop. */
function verifierImages(dossier: string, n: number): void {
  if (!existsSync(dossier)) throw new Error(`${dossier} absent : lancer le rendu d'abord`);
  const presentes = new Set(readdirSync(dossier).filter((f) => /^f_\d{4}\.png$/.test(f)));
  const manquantes: number[] = [], vides: number[] = [];
  for (let i = 1; i <= n; i++) {
    if (!presentes.has(nomImage(i))) manquantes.push(i);
    else if (statSync(path.join(dossier, nomImage(i))).size === 0) vides.push(i);
  }
  const liste = (l: number[]) => `${l.slice(0, 10).join(', ')}${l.length > 10 ? ` … (${l.length})` : ''}`;
  if (manquantes.length > 0) throw new Error(`${dossier} : ${manquantes.length} image(s) manquante(s) sur ${n} : ${liste(manquantes)}`);
  if (vides.length > 0) throw new Error(`${dossier} : image(s) vide(s) : ${liste(vides)} — relancer le rendu (reprise)`);
  if (presentes.size !== n) throw new Error(`${dossier} : ${presentes.size} images pour ${n} attendues`);
}

function lancer(cmd: string, args: string[], journal: string): void {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 << 20 });
  writeFileSync(journal, r.stderr ?? '');
  if (r.status !== 0) throw new Error(`${cmd} (code ${r.status}) — journal : ${journal}\n${(r.stderr ?? '').trim().split('\n').slice(-5).join('\n')}`);
}

function sonder(fichier: string): Sonde {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=codec_name,codec_tag_string,width,height,pix_fmt,r_frame_rate,nb_frames,color_range,color_space,color_primaries,color_transfer,bit_rate',
    '-of', 'json', fichier], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe ${fichier} : ${r.stderr}`);
  return (JSON.parse(r.stdout) as { streams: Sonde[] }).streams[0]!;
}

/** Première image décodée en rgb24, conversion exacte (sans `accurate_rnd`, swscale décale le fond de 3 à 4). */
function premiereImage(fichier: string): Buffer {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', fichier, '-frames:v', '1', '-vf',
    'scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24',
    '-f', 'rawvideo', '-'], { maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`décodage de ${fichier} : ${r.stderr}`);
  return r.stdout;
}

async function encoder(source: 'apercu' | 'rendu', choix: Sortie[]): Promise<void> {
  const sortieVideo = source === 'rendu' ? path.join(WEB, 'public/video') : path.join(CACHE, 'video-apercu');
  const sortieAffiche = source === 'rendu' ? path.join(WEB, 'public/intro') : sortieVideo;
  const journaux = path.join(CACHE, 'journaux-encode', source);
  mkdirSync(sortieVideo, { recursive: true });
  mkdirSync(journaux, { recursive: true });

  // 1. Contrôle préalable des deux cadrages, avant la première minute d'encodage.
  const cadrages = [...new Set(choix.map((s) => s.cadrage))];
  const entrees = {} as Record<Cadrage, { dossier: string; width: number; height: number; fond: [number, number][] }>;
  for (const c of cadrages) {
    const dossier = path.join(CACHE, 'frames', source, c);
    verifierImages(dossier, IMAGES_MAITRE);
    const { data, info } = await sharp(path.join(dossier, nomImage(1))).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
    if (source === 'rendu' && (info.width !== CADRAGES[c].width || info.height !== CADRAGES[c].height)) {
      throw new Error(`${c} : images ${info.width}×${info.height}, ${CADRAGES[c].width}×${CADRAGES[c].height} attendues`);
    }
    const fond = pointsDeFond(new Uint8Array(data), info.width, info.height);
    if (fond.length === 0) throw new Error(`${c} : aucun fond transparent sur la première image, contrôle du fond impossible`);
    entrees[c] = { dossier, width: info.width, height: info.height, fond };
    console.log(`${c} : ${IMAGES_MAITRE} images ${info.width}×${info.height}, ${fond.length} points de fond`);
  }

  // 2. Vidéos, chacune contrôlée dès sa sortie.
  const erreurs: string[] = [];
  for (const s of choix) {
    const id = idVariante(s), e = entrees[s.cadrage];
    const fichier = path.join(sortieVideo, nomFichier(s));
    const t0 = Date.now();
    lancer('ffmpeg', argsFfmpeg(s, e, fichier), path.join(journaux, `${id}.log`));
    const octets = readFileSync(fichier);
    const tete = ordreDeTete(octets);
    const sonde = sonder(fichier);
    const echelle = s.width / e.width;
    const points = e.fond.map(([x, y]) => [Math.round(x * echelle), Math.round(y * echelle)] as [number, number]);
    const ecarts = [
      ...controlerSonde(s, sonde, imagesAttendues(s.ips)),
      ...(tete.indexOf('moov') >= 0 && tete.indexOf('moov') < tete.indexOf('mdat') ? [] : [`boîtes de tête : ${tete.join(', ')}`]),
      ...controlerFond(premiereImage(fichier), s.width, points).slice(0, 5).map((p) => `fond ${p}`),
    ];
    const codecs = chaineCodec(octets);
    const kbps = Number(sonde.bit_rate) / 1000;
    console.log(`${id.padEnd(24)} ${String(octets.length).padStart(10)} o  ${kbps.toFixed(0).padStart(5)} kb/s  `
      + `${verdictDebit(kbps, REGLAGES[id]!).padEnd(7)} ${codecs.padEnd(18)} ${((Date.now() - t0) / 1000).toFixed(0)} s`
      + `${ecarts.length ? `  ÉCARTS : ${ecarts.join(' ; ')}` : ''}`);
    erreurs.push(...ecarts.map((x) => `${id} : ${x}`));
  }

  // 3. Affiches : la première image sur la nuit, sans perte (le fond reste exact).
  for (const c of cadrages) {
    const fichier = path.join(sortieAffiche, `affiche-${c}.webp`);
    await sharp(path.join(entrees[c].dossier, nomImage(1))).flatten({ background: NUIT }).webp({ lossless: true }).toFile(fichier);
    console.log(`affiche ${c} : ${statSync(fichier).size} o`);
  }

  // 4. Manifeste : toutes les vidéos présentes dans le dossier (un ré-encodage partiel garde les autres), octets et
  //    chaîne de codec relus dans chaque fichier.
  const presentes = SORTIES.filter((s) => existsSync(path.join(sortieVideo, nomFichier(s)))).map((s) => {
    const octets = readFileSync(path.join(sortieVideo, nomFichier(s)));
    return { s, octets: octets.length, codecs: chaineCodec(octets) };
  });
  const json = path.join(sortieVideo, 'videos.json');
  writeFileSync(json, `${JSON.stringify(manifeste(presentes), null, 2)}\n`);
  console.log(`${json} : ${presentes.length} variantes, ${presentes.reduce((n, p) => n + p.octets, 0)} o`);
  if (erreurs.length > 0) throw new Error(`${erreurs.length} écart(s) :\n${erreurs.join('\n')}`);
}

/** Les 24 vues de la petite Terre, côte à côte (vue i = angle i·15°). */
async function assemblerSprite(): Promise<void> {
  const dossier = path.join(CACHE, 'frames', 'sprite');
  verifierImages(dossier, SPRITE.vues);
  const vues: Buffer[] = [];
  for (let i = 1; i <= SPRITE.vues; i++) {
    const f = path.join(dossier, nomImage(i));
    const m = await sharp(f).metadata();
    if (m.width !== SPRITE.cote || m.height !== SPRITE.cote || m.channels !== 4) throw new Error(`${f} : ${m.width}×${m.height}×${m.channels}, ${SPRITE.cote}×${SPRITE.cote}×4 attendu`);
    vues.push(readFileSync(f));
  }
  const fichier = path.join(WEB, 'public/intro/logo-terre.webp');
  await sharp({ create: { width: SPRITE.cote * SPRITE.vues, height: SPRITE.cote, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(vues.map((input, i) => ({ input, left: i * SPRITE.cote, top: 0 })))
    .webp({ quality: 88, alphaQuality: 90 }).toFile(fichier);
  console.log(`${fichier} : ${statSync(fichier).size} o`);
}

/** L'aperçu avec ses bulles, par cadrage ; chaque bulle reste à l'ancre de son apparition. */
async function apercuBulles(): Promise<void> {
  const ancres = JSON.parse(readFileSync(path.join(WEB, 'public/intro/ancres.json'), 'utf8')) as Ancres;
  const sortie = path.join(CACHE, 'video-apercu'), journaux = path.join(CACHE, 'journaux-encode', 'apercu');
  mkdirSync(journaux, { recursive: true });
  for (const c of ['portrait', 'paysage'] as const) {
    const dossier = path.join(CACHE, 'frames', 'apercu', c);
    verifierImages(dossier, IMAGES_MAITRE);
    const { width, height } = await sharp(path.join(dossier, nomImage(1))).metadata();
    const entrees: string[] = [], poses: PoseBulle[] = [];
    for (const [i, b] of bullesApercu().entries()) {
      const ancre = ancreTemoin(ancres, c, b.bulle, BULLES[b.bulle].apparait);
      if (!ancre) throw new Error(`${c} : pas d'ancre « ${b.bulle} » à ${BULLES[b.bulle].apparait} s dans ancres.json`);
      const { svg, pointe } = bulleSvg(b.texte, REFERENCES[c].echelle);
      const png = path.join(sortie, `bulle-${c}-${i}.png`);
      await sharp(Buffer.from(svg)).png().toFile(png);
      entrees.push('-i', png);
      poses.push({ x: ancre[0] - pointe[0], y: ancre[1] - pointe[1], de: b.de, a: b.a });
    }
    const fichier = path.join(sortie, `apercu-${c}-bulles.mp4`);
    lancer('ffmpeg', [
      '-hide_banner', '-y', '-framerate', '120', '-start_number', '1', '-i', path.join(dossier, 'f_%04d.png'),
      '-f', 'lavfi', '-i', `color=c=0x${NUIT.slice(1)}:s=${width}x${height}:r=120,format=gbrp`, ...entrees,
      '-filter_complex', grapheApercu(c, poses),
      '-c:v', 'libx265', '-preset', 'medium', '-crf', '24', '-tag:v', 'hvc1', '-x265-params', 'log-level=error',
      '-movflags', '+faststart', '-an', fichier,
    ], path.join(journaux, `bulles-${c}.log`));
    console.log(`${fichier} : ${statSync(fichier).size} o`);
  }
}

/** Plafonds d'octets du budget (Task 11), depuis le manifeste ; refuse un manifeste qui ne dit plus la taille des fichiers. */
function figerPlafonds(): void {
  const m = JSON.parse(readFileSync(path.join(WEB, 'public/video/videos.json'), 'utf8')) as Manifeste;
  const faux = m.variantes.filter((v) => statSync(path.join(WEB, 'public', v.src)).size !== v.octets).map((v) => v.src);
  if (faux.length > 0) throw new Error(`videos.json périmé (${faux.join(', ')}) : relancer l'encodage`);
  const plafonds = Object.fromEntries(m.variantes.map((v) => [v.src, plafond(v.octets)]));
  const regle = `octets du ${new Date().toISOString().slice(0, 10)} arrondis au Mo supérieur (10^6), + 10 %`;
  const fichier = path.join(WEB, 'e2e-budget/plafonds-video.json');
  writeFileSync(fichier, `${JSON.stringify({ version: 1, regle, plafonds }, null, 2)}\n`);
  for (const v of m.variantes) console.log(`${v.src.padEnd(40)} ${String(v.octets).padStart(10)} o → plafond ${plafonds[v.src]}`);
  console.log(fichier);
}

if (source !== undefined) {
  const ids = opts.variantes?.split(',').map((x) => x.trim()).filter(Boolean);
  const inconnus = (ids ?? []).filter((id) => !SORTIES.some((s) => idVariante(s) === id));
  if (inconnus.length > 0) throw new Error(`variantes inconnues : ${inconnus.join(', ')} (connues : ${SORTIES.map(idVariante).join(', ')})`);
  await encoder(source, ids ? SORTIES.filter((s) => ids.includes(idVariante(s))) : SORTIES);
}
if (opts.sprite) await assemblerSprite();
if (opts.bulles) await apercuBulles();
if (opts.plafonds) figerPlafonds();
```

Dans `web/package.json`, insérer juste avant la ligne `"intro:keys": "tsx scripts/intro/export-keys.ts"` (la dernière du bloc `scripts`, sans virgule) :

```json
    "intro:encode": "tsx scripts/intro/encode.ts",
```

Run : `cd web && npx tsc --noEmit`. Expected : aucune sortie, code 0.

- [ ] **Step 12 : attendre l'aperçu** (lancé au Step 15 de la Task 6). Run : `cd web && npm run intro:avancement -- apercu`. Expected : `portrait : 2377/2377 images, …` et `paysage : 2377/2377 images, …`, `reste ≈ 0.0 h` ; sinon relancer cette commande plus tard (la ligne `reste ≈ …` dit combien d'heures).

- [ ] **Step 13 : encoder l'aperçu, avec ses bulles.** Run : `cd web && npm run intro:encode -- --source apercu --bulles` (≈ 4 min). Expected : sur ce modèle (octets, kb/s, verdicts et secondes sont ceux du rendu ; les chaînes de codec, elles, ne dépendent que de la taille et de la cadence — relevées au plan sur des images de mêmes tailles) :

```text
portrait : 2377 images 540×1170, <n> points de fond
paysage : 2377 images 960×540, <n> points de fond
portrait-plein-120-av1   <octets> o  <kb/s> kb/s  <verdict> av01.0.13M.10      <s> s
portrait-plein-120-hevc  <octets> o  <kb/s> kb/s  <verdict> hvc1.1.6.L153.90   <s> s
portrait-plein-60-av1    … av01.0.12M.10
portrait-plein-60-hevc   … hvc1.1.6.L150.90
portrait-leger-60-av1    … av01.0.08M.10
portrait-leger-60-hevc   … hvc1.1.6.L123.90
paysage-plein-120-av1    … av01.0.12M.10
paysage-plein-120-hevc   … hvc1.1.6.L150.90
paysage-plein-60-av1     … av01.0.09M.10
paysage-plein-60-hevc    … hvc1.1.6.L123.90
affiche portrait : <octets> o
affiche paysage : <octets> o
…/scripts/intro/.cache/video-apercu/videos.json : 10 variantes, <octets> o
…/scripts/intro/.cache/video-apercu/apercu-portrait-bulles.mp4 : <octets> o
…/scripts/intro/.cache/video-apercu/apercu-paysage-bulles.mp4 : <octets> o
```

Aucune ligne ne porte `ÉCARTS`, code de sortie 0. Une ligne `ÉCARTS` (ou une erreur « image(s) manquante(s) », « aucun fond transparent sur la première image ») arrête la tâche : diagnostiquer avec superpowers:systematic-debugging avant d'aller plus loin (journaux ffmpeg dans `web/scripts/intro/.cache/journaux-encode/apercu/<variante>.log`).

- [ ] **Step 14 : POINT D'ARRÊT — l'utilisateur juge l'aperçu.** Run : `cd web && open scripts/intro/.cache/video-apercu/apercu-portrait-bulles.mp4 scripts/intro/.cache/video-apercu/apercu-paysage-bulles.mp4` (QuickTime ; HEVC 60 i/s ; les bulles sont des esquisses posées à l'ancre de leur apparition, les vraies sont du HTML, Task 10). Lui dire que l'aperçu est en basse qualité (50 %, 16 échantillons) et lui demander, puis attendre sa réponse :
  1. le rythme d'ensemble (chute lente puis accélérée, impact, toupie, logo, rezoom, second dézoom, titre de fin) ;
  2. les bulles : le temps de lire chaque question avant les retournements (spec §3.3 : l'intro peut gagner ≈ 1 s) — **seconde de plus, oui ou non** ;
  3. les bords des objets sur la nuit (pas de liseré clair ou sombre autour des lettres, des étoiles, de la Terre).
  Une demande sur la scène (matière, objets, cadrage) renvoie à la Task 5 (ou à la Task 1 pour la chorégraphie) : on la fait, on relance l'aperçu (les trois lignes de la Task 6, Step 15, dont le `rm -rf` des images d'aperçu : avec une autre scène, `rendre.py` refuserait de toute façon de les reprendre) et on revient au Step 12.

- [ ] **Step 15 : appliquer la décision sur la seconde de plus.** Si l'utilisateur ne la veut pas, passer au Step 16. S'il la veut, la seconde s'insère quand les trois questions sont posées, avant le premier retournement : tout ce qui se passe à partir de 14,0 s est décalé de +1 s.
  - `web/src/intro/temps.ts` : remplacer
    ```ts
      ACCUEIL: 17.0,
    ```
    par `  ACCUEIL: 18.0,`, `  FONDU: 18.2,` par `  FONDU: 19.2,`, `  FIN: 19.8,` par `  FIN: 20.8,` ;
    ```ts
    export const BULLES = { capitale: { apparait: 11.1, retourne: 14.0 }, pays: { apparait: 11.8, retourne: 14.3 }, drapeau: { apparait: 13.3, retourne: 14.6 } } as const;
    ```
    par
    ```ts
    export const BULLES = { capitale: { apparait: 11.1, retourne: 15.0 }, pays: { apparait: 11.8, retourne: 15.3 }, drapeau: { apparait: 13.3, retourne: 15.6 } } as const;
    ```
    et `export const BULLES_RANGE = 16.2;` par `export const BULLES_RANGE = 17.2;`.
  - `web/src/intro/timeline.ts` : `const DEZOOM2 = 16.4, D_DEZOOM2 = INTRO.FONDU + 0.2 - DEZOOM2;` devient `const DEZOOM2 = 17.4, D_DEZOOM2 = INTRO.FONDU + 0.2 - DEZOOM2;` (`RETRAIT` suit `BULLES_RANGE`, la croissance lente suit `DEZOOM2`, le second dézoom garde ses 2,0 s).
  - `web/src/intro/timeline.test.ts` (« continuité aux bornes de phase ») : `[INTRO.CHUTE, T_SOL, 5.8, 8.8, 16.4]` devient `[INTRO.CHUTE, T_SOL, 5.8, 8.8, 17.4]`.
  - Angle de fin : Run : `cd web && npx tsx -e "import { logoAngleAt } from './src/intro/timeline'; import { INTRO } from './src/intro/temps'; console.log(logoAngleAt(INTRO.FIN));"` ; recopier la valeur imprimée dans `export const LOGO_ANGLE_FIN = …;` de `temps.ts` (le test la vérifie à 1e-12).
  - Run : `cd web && npx vitest run --project unit src/intro/timeline.test.ts scripts/intro/__tests__/unit`. Expected : PASS — `Test Files  10 passed (10)`, `Tests  77 passed (77)` (`IMAGES_MAITRE` vaut maintenant 2497 : les tests des témoins et de l'encodage suivent `INTRO.FIN` ; celui de la numérotation du lanceur, `imageA(19.8)`, n'en dépend pas). Relevé au plan en appliquant ces remplacements à une copie portant les Tasks 1 à 7 ; `LOGO_ANGLE_FIN` y valait alors `2.4364181508089438`.
  - Ré-exporter les clés et les ancres : `cd web && npm run intro:keys` (Task 3) ; relancer l'aperçu (les trois lignes de la Task 6, Step 15) ; reprendre au Step 12 de cette tâche (2497 images au lieu de 2377) et remontrer l'aperçu (Step 14).

- [ ] **Step 16 : consigner la décision.** Dans `docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md`, §1, ajouter à la fin du tableau la ligne `| JJ/MM | Aperçu validé : <remarques de l'utilisateur> ; seconde de plus pour les bulles : <oui (retournements 15,0/15,3/15,6 s, FIN 20,8 s) / non> |` (date du jour, ses mots).

- [ ] **Step 17 : suite et commit.** Run : `cd web && npm run check`. Expected : tsc sans erreur, `Test Files  69 passed (69)`, `Tests  399 passed (399)` — avec ou sans la seconde de plus (relevé au plan sur les deux branches). Puis :

```bash
git add web/src/intro/videos.ts web/scripts/intro/lib/mp4.ts web/scripts/intro/lib/encodage.ts web/scripts/intro/lib/apercu.ts web/scripts/intro/encode.ts web/scripts/intro/__tests__/unit/mp4.test.ts web/scripts/intro/__tests__/unit/encodage.test.ts web/scripts/intro/__tests__/unit/apercu.test.ts web/package.json docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md
git commit -m "intro : encodage de la vidéo (10 variantes AV1/HEVC contrôlées, manifeste, affiches, sprite, aperçu à bulles) — spec intro vidéo §2.5"
```

Si la seconde de plus a été prise, ajouter au `git add` : `web/src/intro/temps.ts web/src/intro/timeline.ts web/src/intro/timeline.test.ts web/public/intro/ancres.json`.

---

### Task 8 : Rendu final et vidéos versionnées — point d'arrêt utilisateur (accord avant le rendu, revue des vidéos)

**Files:**
- Create (générés) : `web/public/video/intro-portrait-120.av1.mp4`, `intro-portrait-120.hevc.mp4`, `intro-portrait-60.av1.mp4`, `intro-portrait-60.hevc.mp4`, `intro-portrait-leger-60.av1.mp4`, `intro-portrait-leger-60.hevc.mp4`, `intro-paysage-120.av1.mp4`, `intro-paysage-120.hevc.mp4`, `intro-paysage-60.av1.mp4`, `intro-paysage-60.hevc.mp4`, `web/public/video/videos.json`, `web/public/intro/affiche-portrait.webp`, `web/public/intro/affiche-paysage.webp`, `web/e2e-budget/plafonds-video.json`
- Modify (généré) : `web/public/intro/logo-terre.webp` (rendu Blender au lieu de la capture three.js)
- Modify (seulement si la règle de débit du Step 7 le demande) : `web/scripts/intro/lib/encodage.ts` (`REGLAGES`)

**Interfaces:**
- Consumes : `npm run intro:rendu` et `npm run intro:sprite` (Tasks 4-5 : `rendre.py` garde les images entières déjà écrites, ce qui fait la reprise ; `blender.ts` refuse `rendu` sous 15 Go libres) ; `npm run intro:planche`, `npm run intro:avancement` (Task 6) ; `npm run intro:encode` (Task 7) ; échantillons du rendu final = `REGLAGES['rendu']['echantillons']` de `web/scripts/intro/blender/commun.py`, fixés à la Task 6.
- Produces : les 10 vidéos, le manifeste (format du contrat, `octets` réels, `type` lu dans chaque fichier), les affiches et le sprite, versionnés (git, sans LFS) ; `web/e2e-budget/plafonds-video.json` = `{ "version": 1, "regle": string, "plafonds": { "<src>": <octets max> } }`, plafond = taille mesurée arrondie au Mo supérieur (10⁶ octets) + 10 % (`plafond()` de `lib/encodage.ts`), lu par le test de budget de la Task 11 (chaque `variantes[i].octets` de `videos.json` ≤ `plafonds[src]`).

- [ ] **Step 1 : l'estimation à montrer.** Run : `cd web && npm run intro:planche -- --echantillons <S>` (`<S>` = `REGLAGES['rendu']['echantillons']` de `commun.py`) puis `df -h .`. Expected : une première ligne `rendu final ≈ <H> h pour 2377 images × 2 cadrages à <S> échantillons (≤ 10 h) ; PNG ≈ <G> Go` (2497 images si la seconde de plus a été prise à la Task 7 ; `→ … échantillons proposés` à la place de `(≤ 10 h)` si l'utilisateur a choisi les deux nuits à la Task 6), et la place libre (colonne `Avail`). Règle : on ne lance que si `Avail` ≥ `<G>` + 10 Go (le système garde de quoi vivre ; `blender.ts` refuse de toute façon sous 15 Go au départ). Sinon, proposer de libérer d'abord les PNG de l'aperçu, devenus inutiles une fois l'aperçu validé : `rm -rf scripts/intro/.cache/frames/apercu` (avec l'accord de l'utilisateur) et refaire `df -h .`.

- [ ] **Step 2 : POINT D'ARRÊT — accord de l'utilisateur.** Lui montrer : la durée `<H>` h (et la nuit visée, ou les deux nuits), la place `<G>` Go et ce qui restera libre, les échantillons `<S>`. Conditions à lui rappeler : Mac sur secteur, couvercle ouvert (ou écran externe), le rendu tient le GPU — pas de jeu ni de montage pendant ce temps ; il survit à la fermeture du terminal. Attendre son « oui » explicite avant le Step 3.

- [ ] **Step 3 : lancer le rendu.** Run :

```bash
cd web
nohup caffeinate -i npm run intro:rendu > scripts/intro/.cache/console-rendu.log 2>&1 &
echo $! > scripts/intro/.cache/rendu.pid
```

(trois lignes séparées : `cd web && nohup … &` lancerait le `cd` dans le sous-shell de la tâche de fond ; `caffeinate -i` empêche la mise en veille tant que le rendu tourne ; le journal complet de Blender va, comme toujours, dans `scripts/intro/.cache/journal-rendu-<cadrage>.log`.) Expected, au bout de quelques minutes : `ps -p $(cat scripts/intro/.cache/rendu.pid) -o pid,etime,command` montre `caffeinate -i npm run intro:rendu`, et `tail -3 scripts/intro/.cache/console-rendu.log` montre des lignes `[rendre] f_0001.png 1080×2340 <s> s`, précédées plus haut de `… | Path tracing on: Apple M4 Pro (GPU - 16 cores) (Metal) …`.

- [ ] **Step 4 : surveiller, reprendre.** Run (autant de fois que voulu) : `cd web && npm run intro:avancement -- rendu`. Expected : `portrait : <n>/2377 images, <s> s/image`, `paysage : <n>/2377 images, <s> s/image (témoins)` tant qu'il n'a pas commencé, puis `reste ≈ <h> h`. Le rendu est fini quand les deux cadrages sont à `2377/2377` et que `tail -3 scripts/intro/.cache/console-rendu.log` montre `[rendre] fini : …` puis `[blender] rendu paysage : <s> s` ; `ps -p $(cat scripts/intro/.cache/rendu.pid)` n'affiche plus que l'en-tête. Recopier alors, telles quelles, les deux lignes `portrait : 2377/2377 images, <s> s/image` et `paysage : 2377/2377 images, <s> s/image` de la dernière sortie de `npm run intro:avancement -- rendu` (2497 avec la seconde de plus) : la passation de la Task 12 les reprend, et elles ne se relisent plus une fois les PNG effacés (Step 13 : la commande compterait alors 0 image et un reste de plusieurs heures).
  - **Reprise** (Mac arrêté, rendu tombé : `ps -p $(cat scripts/intro/.cache/rendu.pid)` n'affiche plus que l'en-tête alors qu'un cadrage n'est pas à 2377 ; la cause est à la fin de `console-rendu.log`) : relancer exactement les trois lignes du Step 3. Les images entières sont gardées, celle qui était en cours est refaite ; ne jamais vider `frames/rendu` (ce serait tout refaire).
  - **Deux nuits** (si l'utilisateur l'a choisi à la Task 6) : le matin, `pkill -f 'scripts/intro/blender.ts'` puis `pkill -f 'blender/rendre.py'` (le lanceur d'abord, sinon il passerait au cadrage suivant) ; le soir, relancer le Step 3.

- [ ] **Step 5 : la petite Terre du titre.** Run : `cd web && npm run intro:sprite -- --neuf && npm run intro:encode -- --sprite` (`--neuf` : les 24 vues de la Task 5, Step 10, sont celles de la scène d'alors ; on refait le sprite sur la scène validée, celle du rendu). Expected : `[rendre] fini : 24 images rendues (moyenne <s> s), 0 gardées, …`, 24 images dans `scripts/intro/.cache/frames/sprite/`, puis `…/public/intro/logo-terre.webp : <octets> o` (l'ancien fichier, capturé dans three.js, faisait 116632 o ; même chemin, 3072 × 128 : `home.css` n'a rien à changer).

- [ ] **Step 6 : encoder.** Run : `cd web && npm run intro:encode -- --source rendu` (≈ 4 à 5 min ; 4 min 06 s au plan sur des images synthétiques de mêmes tailles). Expected : `portrait : 2377 images 1080×2340, <n> points de fond`, `paysage : 2377 images 1920×1080, <n> points de fond`, puis dix lignes `<variante> <octets> o <kb/s> kb/s <verdict> <codecs> <s> s` avec les chaînes `av01.0.13M.10`, `hvc1.1.6.L153.90`, `av01.0.12M.10`, `hvc1.1.6.L150.90`, `av01.0.08M.10`, `hvc1.1.6.L123.90`, `av01.0.12M.10`, `hvc1.1.6.L150.90`, `av01.0.09M.10`, `hvc1.1.6.L123.90` (dans l'ordre de la Task 7, Step 13), `affiche portrait : <octets> o`, `affiche paysage : <octets> o`, `…/public/video/videos.json : 10 variantes, <octets> o` ; aucune ligne `ÉCARTS`, code 0. Sinon : superpowers:systematic-debugging (journaux dans `scripts/intro/.cache/journaux-encode/rendu/`).

- [ ] **Step 7 : la règle de débit, une fois.** Lire la colonne verdict du Step 6 (`lib/encodage.ts`, commentaire de `REGLAGES`) : pour chaque variante en `marge` (débit moyen < 50 % du plafond de 4000 kb/s), baisser son `crf` de 2 dans `REGLAGES` ; les variantes en `plafond` (> 90 %) restent telles quelles et sont signalées à l'utilisateur pour la revue (Step 11) ; `ok` : rien. S'il y a des `marge`, Run : `cd web && npm run intro:encode -- --source rendu --variantes <ids séparés par des virgules>` et relire les nouvelles lignes (même Expected qu'au Step 6, pour ces variantes ; le manifeste est refait depuis les 10 fichiers). On n'itère pas une seconde fois.

- [ ] **Step 8 : figer les plafonds du budget.** Run : `cd web && npm run intro:encode -- --plafonds`. Expected : dix lignes `/video/<fichier>  <octets> o → plafond <octets max>` (ex. au plan : `2546202 o → plafond 3300000`), puis le chemin `…/web/e2e-budget/plafonds-video.json`, dont le contenu est `{ "version": 1, "regle": "octets du <AAAA-MM-JJ> arrondis au Mo supérieur (10^6), + 10 %", "plafonds": { … } }`.

- [ ] **Step 9 : la taille de ce qu'on versionne.** Run :

```bash
cd web && node -e "const fs=require('fs');const f=[...fs.readdirSync('public/video').sort().map((x)=>'public/video/'+x),'public/intro/affiche-portrait.webp','public/intro/affiche-paysage.webp','public/intro/logo-terre.webp','e2e-budget/plafonds-video.json'];let t=0;for(const x of f){const n=fs.statSync(x).size;t+=n;console.log(String(n).padStart(10),x)}console.log(String(t).padStart(10),'octets en tout')"
```

Expected : une ligne par fichier (10 `.mp4`, `videos.json`, 2 affiches, le sprite, les plafonds) et `<total> octets en tout`. Ce total entre pour toujours dans l'historique git (pas de LFS : chaque ré-encodage versionné l'ajoute à nouveau ; `.git` pèse 208 Mo aujourd'hui) et forme le calque `video` de l'image (Task 10 ; un calque doit rester sous 150 Mo, commentaire du `Dockerfile`).

- [ ] **Step 10 : relire les fichiers que le lecteur recevra.** Run : `cd web && head -c 600 public/video/videos.json`. Expected : `"version": 1`, `"duree": 19.8` (20.8 avec la seconde de plus), les affiches `/intro/affiche-portrait.webp` et `/intro/affiche-paysage.webp`, une première variante `portrait`, `plein`, `120`, `av1`, `"src": "/video/intro-portrait-120.av1.mp4"`, `"type": "video/mp4; codecs=\"av01.0.13M.10\""`, `"width": 1080`, `"height": 2340`, `"octets"` égal à la taille du fichier au Step 9.

- [ ] **Step 11 : POINT D'ARRÊT — revue des vidéos par l'utilisateur.** Run : `cd web && open public/video/intro-portrait-60.hevc.mp4 public/video/intro-paysage-60.hevc.mp4` (QuickTime) et `open -a "Google Chrome" public/video/intro-portrait-120.av1.mp4` (AV1 à 120 i/s, lu par Chrome). Lui montrer aussi le total du Step 9 et les variantes en `plafond` du Step 7. Lui demander, puis attendre sa réponse : matière et lumière, flou de mouvement (chute, toupie), propreté de la nuit (aucune bande, aucun liseré), lettres et étoiles, titre de fin ; artefacts de compression sur les variantes en `plafond`. Une reprise de la scène renvoie à la Task 5 (puis témoins, Task 6, et nouveau rendu : `rm -rf scripts/intro/.cache/frames/rendu` avant le Step 3, sinon `rendre.py` refuse de mêler les deux scènes et demande `--neuf`) ; une reprise d'encodage, au Step 7 (`REGLAGES`) puis au Step 6. Rien n'est versionné sans son accord.

- [ ] **Step 12 : commit des vidéos.** Run : `git add web/public/video web/public/intro/affiche-portrait.webp web/public/intro/affiche-paysage.webp web/public/intro/logo-terre.webp web/public/intro/ancres.json web/e2e-budget/plafonds-video.json web/scripts/intro/lib/encodage.ts` puis `git status --short`. Expected : seulement ces chemins en `A` ou `M` (`ancres.json` et `encodage.ts` n'y figurent que s'ils ont changé), aucun `.png` ni rien sous `web/scripts/intro/.cache/` (ignoré par git). Puis :

```bash
git commit -m "intro : vidéos de l'intro rendues dans Blender et encodées (10 variantes, manifeste, affiches, petite Terre du titre, plafonds du budget) — spec intro vidéo §2.4-2.6, §7"
```

- [ ] **Step 13 : nettoyage, avec l'accord de l'utilisateur.** Lui demander s'il garde les PNG du rendu (un nouvel encodage sans nouveau rendu en a besoin ; les refaire coûte une nuit). S'il accepte de les effacer, Run : `cd web && rm -rf scripts/intro/.cache/frames/rendu scripts/intro/.cache/frames/apercu && df -h .`. Expected : `Avail` remonte d'environ `<G>` Go (Step 1). Les témoins, le sprite, les journaux et l'aperçu encodé (`.cache/video-apercu/`) restent : ils sont petits.

---

### Task 9 : Lecteur : décisions pures (cadrage, cadence, variante, écran, questions, abandons)

**Files:**
- Create: `web/src/intro/lecteur.ts`
- Test: `web/src/intro/lecteur.test.ts` (créé)
- Create: `web/src/intro/questions.ts`
- Test: `web/src/intro/questions.test.ts` (créé)
- Modify: `web/scripts/intro/export-keys.ts` (Step 9 : son type `Ancres` devient celui des questions, ré-exporté)

**Interfaces:**
- Consumes : `web/src/intro/temps.ts` (Task 1) : `type Cadrage`, `CADRAGES`, `INTRO`, `INTRO_GIVE_UP_MS`, `LOGO_ANGLE_FIN`, `LOGO_TOUR_S`, et `BULLES_RANGE` dans les tests (fin de la fenêtre d'`ancres.json`) ; `web/src/intro/videos.ts` (Task 7) : `type Variante`, `type Manifeste`, `idVariante` ; `messages` de `web/src/i18n` (catalogues `modes.*`), `type Lang` et `type Mode` de `web/src/game/types.ts` (existants) ; dans les tests seulement : `frameAt`, `POINT_RP`, `logoAngleAt` de `web/src/intro/timeline.ts` et `TITRES` de `web/src/intro/cadrages.ts` (Task 1), `web/public/intro/ancres.json` (Task 3) ; `web/scripts/intro/export-keys.ts` (Task 3 : son `interface Ancres`, remplacée au Step 9). Le site ne lit plus `BULLES` ni `type Bulle` : ils restent les instants de la fabrique (`ANCRES_T0` d'`export-keys.ts`, témoins, planche, aperçu à esquisses de la Task 7) ; `temps.ts` n'est pas touché.
- Produces :
  - `web/src/intro/lecteur.ts` :
    - ré-exporte de `./videos` (Task 7, un seul jeu de types pour la fabrique et le lecteur) : `idVariante`, `type Manifeste`, `type Variante` ; `type Echec = 'lecture-refusee' | 'pas-d-image' | 'erreur' | 'aucun-codec' | 'bloquee'` ;
    - `choisirCadrage(w: number, h: number): Cadrage` ; `INTERVALLE_DEFAUT_MS = 16.7` ; `SEUIL_120_MS = 10` ; `medianeIntervalle(echantillonsMs: number[]): number` ; `mesurerIntervalle(raf: (cb: FrameRequestCallback) => number, maxMs = 150, horloge = () => performance.now(), delaiMaxMs = 500): Promise<number>` ;
    - `interface Capacites { decodingInfo?(c: MediaDecodingConfiguration): Promise<{ supported: boolean; smooth: boolean; powerEfficient: boolean }>; canPlayType(type: string): string }` ; `choisirVariantes(m: Manifeste, cadrage: Cadrage, intervalleMs: number, caps: Capacites): Promise<Variante[]>` ;
    - `interface Couverture { echelle: number; x: number; y: number }` ; `couverture(video: { width: number; height: number }, ecran: { width: number; height: number }, cadrage: Cadrage): Couverture` (le calque des questions, dans le repère de la vidéo, se pose par `translate(x px, y px) scale(echelle)`, origine en haut à gauche) ; `versEcran(p: [number, number], video: { width: number; height: number }, ecran: { width: number; height: number }, cadrage: Cadrage): [number, number]` ;
    - `angleTerre(t: number): number` (angle de la Terre de la vidéo entre FONDU et FIN, pour le relais de la petite Terre du titre) ;
    - machine des abandons : `interface Releve { ms: number; visible: boolean; temps: number; image: boolean; attendue: boolean }`, `interface Suivi { precedent: Releve | null; attenteMs: number }`, `SUIVI_DEPART`, `PAS_MAX_MS = 250`, `suivreLecture(s: Suivi, r: Releve, delaiMs = INTRO_GIVE_UP_MS): { suivi: Suivi; echec: Echec | null }`.
  - `web/src/intro/questions.ts` (pur : ni DOM, ni three) :
    - `type Question = 'capitale' | 'pays' | 'drapeau'` ; `interface Ancres { version: 1; fps: number; t0: number; cadrages: Record<Cadrage, { width: number; height: number } & Record<Question, [number, number][]>> }` (le seul type des ancres : `export-keys.ts` le ré-exporte, Step 9 ; les fabriques des Tasks 6 et 7 l'importent toujours de `export-keys.ts`) ;
    - `ORDRE_QUESTIONS: readonly Question[]` (`capitale`, `pays`, `drapeau`) ; `MODE_QUESTION: Record<Question, Mode>` ; `QUESTIONS: Record<Question, { naissance: number; ecart: number; vol: number; saut: number; phase: number }>` ; `RETOUR = 15.6` ; `POSES: Record<Cadrage, { taille: number } & Record<Question, [x: number, y: number, inclinaison: number]>>` ; `MARGE_QUESTION = 8` (px CSS) ;
    - `texteQuestion(lang: Lang, q: Question): string` (FR : le mot du catalogue, U+202F, « ? » ; EN : « Capital? ») ; `signes(texte: string): { c: string; blanc: boolean }[]` ;
    - `ancreQuestion(a: Ancres, cadrage: Cadrage, q: Question, t: number): [number, number]` (interpolée, tenue aux bornes de la fenêtre) ;
    - `interface Cadre { x0: number; y0: number; x1: number; y1: number }` ; `partieVisible(cadrage: Cadrage, ecran: { width: number; height: number }, marge = 0): Cadre` ;
    - `interface Gabarit { largeur: number; hauteur: number; lettres: { x: number; y: number; w: number; h: number }[] }` (mesuré par la page, en px de la vidéo, à la taille `POSES[cadrage].taille`, blancs exclus) ; `etendue(g: Gabarit, inclinaison: number, taille: number): { gauche: number; droite: number; haut: number; bas: number }` ;
    - `interface Mot { question: Question; cadrage: Cadrage; taille: number; centre: [number, number]; inclinaison: number; lettres: [number, number][] }` ; `poserMot(q: Question, cadrage: Cadrage, g: Gabarit, ecran: { width: number; height: number }, marge = MARGE_QUESTION): Mot` ;
    - `interface EtatLettre { x: number; y: number; rot: number; echelle: number; opacite: number }` ; `etatLettre(t: number, mot: Mot, i: number, a: Ancres): EtatLettre | null` (null : pas encore née, ou rentrée dans son objet).

Règles tranchées ici (pour le relecteur) : `choisirVariantes` rend une variante par codec lisible, rangées économe > fluide > lisible, AV1 avant HEVC à égalité ; la légère (portrait 720 × 1560) remplace la pleine qui n'est ni fluide ni économe (ou illisible) ; le 120 i/s remplace le 60 seulement si l'intervalle mesuré est ≤ 10 ms ET si `decodingInfo` à 120 dit `powerEfficient` (jamais pour la légère) ; sans `decodingInfo` (ou s'il lève), `canPlayType` dit seulement « lisible » : la légère en portrait. Les abandons ne comptent que le temps où l'onglet est visible ; un écart de plus de 250 ms entre deux relevés (page gelée, changement d'onglet manqué) ne compte que 250 ms.

Règles des questions (pour le relecteur) :
- Le module porte le `<script>` de la maquette validée le 12/10 (« ok go ») : instants et envols (naissance, écart, vol, saut), places de repos et tailles, `sortie`, `elan`, `recul`, onde, sautillement du « ? », oscillation. Une seule différence, le ruling du contrôleur : le retour part de `RETOUR` = 15,6 s au lieu de 16,2. Il finit entre 16,2 et 16,4 s (15,6 + (n − 1) × 0,04 + 0,45 s : 16,21 s pour 5 lettres, 16,37 s pour 9), avant le second dézoom (16,4 s) ; au-delà de 16,2 s, l'ancre est tenue à sa dernière valeur. Une lettre est invisible (null) avant sa naissance et quand son échelle tombe sous 0,001 (début du vol, fin du retour), comme dans la maquette.
- Les instants de naissance (11,22 / 11,6 / 13,15 s) recopient des constantes privées de `timeline.ts` (T_POINT + D_POINT, T_FRONTIERE, T_DRAPEAU) : le test « chaque mot naît de son objet » les confronte à `frameAt`, qu'un déplacement de phase ferait échouer.
- La typographie de la langue est dans `questions.ts` (`texteQuestion`), sur les mots des catalogues (`modes.*`) : FR « Capitale », U+202F, « ? » ; EN « Capital? ». Le blanc ne vole pas, il ne fait que l'espace (`signes`).
- Places de repos : `poserMot` borne l'étendue du mot vivant (le cercle de la boîte de chaque lettre, l'inclinaison ± 2,2°, l'onde, le saut du « ? ») dans la partie visible, à `MARGE_QUESTION` px CSS des bords. Relevé au plan, avec les chasses de Chango mesurées dans Chromium : « Capitale ? » (FR) glisse de x = 860 à 843,4 px vidéo sur le téléphone de référence et le téléphone court, à 854,3 sur l'iPad portrait ; « Pays ? » remonte de y = 1470 à 1375,2 (FR) et 1368,0 (EN) sur l'iPad portrait ; partout ailleurs, les places de la maquette tiennent. Écran tourné (cadrage portrait gardé, 844 × 390) : les trois mots sont ramenés vers y ≈ 425-436 et peuvent se chevaucher ; cas dégradé accepté, les objets eux-mêmes sont alors hors de l'écran.
- Les lettres partent de l'ancre courante et y rentrent même quand l'objet est hors de l'écran rogné (elles viennent de lui) : seul le mot posé est garanti entier dans l'écran, de sa pose au retour.
- Review Focus épinglés : écrans éloignés des références (1), onglet caché (3), rotation (4), réseau qui cale (5).

- [ ] **Step 1 : écrire les tests du lecteur.** Créer `web/src/intro/lecteur.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SUIVI_DEPART, angleTerre, choisirCadrage, choisirVariantes, couverture, idVariante, medianeIntervalle, mesurerIntervalle, suivreLecture, versEcran,
  type Capacites, type Manifeste, type Releve, type Suivi, type Variante,
} from './lecteur';
import { TITRES } from './cadrages';
import { CADRAGES, INTRO, type Cadrage } from './temps';
import { logoAngleAt } from './timeline';

// ---------- manifeste de test : les 10 vidéos de D2 ----------
const V = (cadrage: Cadrage, taille: Variante['taille'], ips: Variante['ips'], codec: Variante['codec']): Variante => {
  const { width, height } = taille === 'leger' ? { width: 720, height: 1560 } : CADRAGES[cadrage];
  return {
    cadrage, taille, ips, codec, width, height, octets: 6_000_000,
    src: `/video/intro-${cadrage}${taille === 'leger' ? '-leger' : ''}-${ips}.${codec}.mp4`,
    type: `video/mp4; codecs="${codec === 'av1' ? 'av01.0.12M.10' : 'hvc1.1.6.L150.90'}"`,
  };
};
const MANIFESTE: Manifeste = {
  version: 1, duree: 19.8, affiches: { portrait: '/intro/affiche-portrait.webp', paysage: '/intro/affiche-paysage.webp' },
  variantes: [
    V('portrait', 'plein', 60, 'av1'), V('portrait', 'plein', 120, 'av1'), V('portrait', 'plein', 60, 'hevc'), V('portrait', 'plein', 120, 'hevc'),
    V('portrait', 'leger', 60, 'av1'), V('portrait', 'leger', 60, 'hevc'),
    V('paysage', 'plein', 60, 'av1'), V('paysage', 'plein', 120, 'av1'), V('paysage', 'plein', 60, 'hevc'), V('paysage', 'plein', 120, 'hevc'),
  ],
};
type Apt = [supported: boolean, smooth: boolean, powerEfficient: boolean];
const OUI: Apt = [true, true, true], FLUIDE: Apt = [true, true, false], LISIBLE: Apt = [true, false, false];
/** MediaCapabilities simulé : réponse par variante (identifiant), « non » par défaut ; garde les configurations reçues. */
function capacites(table: Record<string, Apt>, canPlay: (type: string) => string = () => ''): Capacites & { recues: MediaDecodingConfiguration[] } {
  const recues: MediaDecodingConfiguration[] = [];
  return {
    recues,
    canPlayType: canPlay,
    async decodingInfo(c) {
      recues.push(c);
      const v = MANIFESTE.variantes.find((x) => x.type === c.video!.contentType && x.width === c.video!.width && x.height === c.video!.height && x.ips === c.video!.framerate)!;
      const [supported, smooth, powerEfficient] = table[idVariante(v)] ?? [false, false, false];
      return { supported, smooth, powerEfficient };
    },
  };
}
const ids = (vs: Variante[]) => vs.map(idVariante);
const tous = (a: Apt) => Object.fromEntries(MANIFESTE.variantes.map((v) => [idVariante(v), a]));

describe('cadrage et cadence', () => {
  it('fenêtre plus haute que large : portrait ; sinon paysage', () => {
    expect(choisirCadrage(390, 844)).toBe('portrait');
    expect(choisirCadrage(768, 1024)).toBe('portrait');
    expect(choisirCadrage(390, 664)).toBe('portrait');
    expect(choisirCadrage(2560, 1080)).toBe('paysage');
    expect(choisirCadrage(1280, 800)).toBe('paysage');
    expect(choisirCadrage(900, 900)).toBe('paysage');
  });

  it('médiane des intervalles (une image lente ne compte pas) ; sans échantillon : 60 Hz', () => {
    expect(medianeIntervalle([8.3, 8.4, 50, 8.3, 8.2])).toBe(8.3);
    expect(medianeIntervalle([16.6, 16.8, 16.7, 33.4])).toBeCloseTo(16.75, 6);
    expect(medianeIntervalle([])).toBe(16.7);
  });
});

describe('mesure de l’intervalle entre images (rAF et horloge injectés)', () => {
  afterEach(() => { vi.useRealTimers(); });
  /** Un écran simulé : chaque `tourner` fait passer une image après `dt` ms. */
  function ecran() {
    let ms = 1000, file: FrameRequestCallback[] = [], appels = 0;
    const raf = (cb: FrameRequestCallback) => { appels++; file.push(cb); return appels; };
    const tourner = (dt: number) => { ms += dt; const cbs = file; file = []; for (const cb of cbs) cb(ms); };
    return { raf, horloge: () => ms, tourner, appels: () => appels };
  }

  it('écran à 120 Hz : ≈ 8,3 ms, en ≈ 0,15 s', async () => {
    const e = ecran();
    let fin: number | null = null;
    void mesurerIntervalle(e.raf, 150, e.horloge).then((ms) => { fin = ms; });
    for (let i = 0; i < 40 && fin === null; i++) { e.tourner(8.33); await Promise.resolve(); }
    expect(fin).toBeCloseTo(8.33, 6);
    expect(e.appels()).toBe(19);
  });

  it('écran à 60 Hz, une image lente (chargement) : ≈ 16,7 ms', async () => {
    const e = ecran();
    const p = mesurerIntervalle(e.raf, 150, e.horloge);
    e.tourner(16.67);
    e.tourner(50);
    for (let i = 0; i < 12; i++) e.tourner(16.67);
    expect(await p).toBeCloseTo(16.67, 6);
  });

  it('onglet caché (rAF suspendu) : 16,7 au délai maximal, pas avant', async () => {
    vi.useFakeTimers();
    const e = ecran();
    let fin: number | null = null;
    const p = mesurerIntervalle(e.raf, 150, e.horloge, 500);
    void p.then((ms) => { fin = ms; });
    await vi.advanceTimersByTimeAsync(499);
    expect(fin).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe(16.7);
  });
});

describe('choix des variantes (ordre d’essai ; [] → accueil direct)', () => {
  it('AV1 économe d’abord, puis HEVC ; 60 i/s sur un écran à 60 Hz', async () => {
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, capacites(tous(OUI))))).toEqual(['portrait-plein-60-av1', 'portrait-plein-60-hevc']);
  });

  it('120 i/s seulement si l’écran dépasse 100 Hz (≤ 10 ms) ET si le décodage à 120 est économe', async () => {
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 8.3, capacites(tous(OUI))))).toEqual(['portrait-plein-120-av1', 'portrait-plein-120-hevc']);
    expect(ids(await choisirVariantes(MANIFESTE, 'paysage', 10, capacites(tous(OUI))))).toEqual(['paysage-plein-120-av1', 'paysage-plein-120-hevc']);
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 10.5, capacites(tous(OUI))))).toEqual(['portrait-plein-60-av1', 'portrait-plein-60-hevc']);
    // Chromium de Playwright : AV1 fluide mais pas économe, HEVC illisible
    const pw = capacites({ 'portrait-plein-60-av1': FLUIDE, 'portrait-plein-120-av1': FLUIDE });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 8.3, pw))).toEqual(['portrait-plein-60-av1']);
  });

  it('un HEVC économe passe devant un AV1 seulement fluide ; Safari sans AV1 matériel : HEVC seul', async () => {
    const mac = capacites({ 'portrait-plein-60-av1': FLUIDE, 'portrait-plein-60-hevc': OUI });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, mac))).toEqual(['portrait-plein-60-hevc', 'portrait-plein-60-av1']);
    const safari = capacites({ 'portrait-plein-60-hevc': OUI, 'portrait-plein-120-hevc': OUI, 'portrait-leger-60-hevc': OUI });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, safari))).toEqual(['portrait-plein-60-hevc']);
  });

  it('variante légère quand la pleine n’est ni fluide ni économe (ou illisible) ; jamais à 120 i/s', async () => {
    const android = capacites({ 'portrait-plein-60-av1': LISIBLE, 'portrait-plein-120-av1': OUI, 'portrait-leger-60-av1': FLUIDE });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 8.3, android))).toEqual(['portrait-leger-60-av1']);
    const niveau5 = capacites({ 'portrait-leger-60-av1': OUI, 'portrait-leger-60-hevc': LISIBLE });
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, niveau5))).toEqual(['portrait-leger-60-av1', 'portrait-leger-60-hevc']);
    // la légère illisible : la pleine, seulement lisible, reste à essayer
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, capacites({ 'portrait-plein-60-av1': LISIBLE })))).toEqual(['portrait-plein-60-av1']);
  });

  it('paysage : pas de variante légère, la pleine même peu fluide', async () => {
    expect(ids(await choisirVariantes(MANIFESTE, 'paysage', 16.7, capacites({ 'paysage-plein-60-av1': LISIBLE })))).toEqual(['paysage-plein-60-av1']);
  });

  it('rien de lisible : aucune variante (accueil direct)', async () => {
    expect(await choisirVariantes(MANIFESTE, 'portrait', 8.3, capacites({}))).toEqual([]);
  });

  it('sans MediaCapabilities, ou s’il lève : canPlayType (lisible, sans rien sur la fluidité : la légère en portrait)', async () => {
    const lit = (t: string) => (t.includes('av01') ? 'probably' : '');
    const sans: Capacites = { canPlayType: lit };
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 8.3, sans))).toEqual(['portrait-leger-60-av1']);
    expect(ids(await choisirVariantes(MANIFESTE, 'paysage', 8.3, sans))).toEqual(['paysage-plein-60-av1']);
    const leve: Capacites = { canPlayType: lit, decodingInfo: () => Promise.reject(new TypeError('type inconnu')) };
    expect(ids(await choisirVariantes(MANIFESTE, 'portrait', 16.7, leve))).toEqual(['portrait-leger-60-av1']);
  });

  it('decodingInfo reçoit la variante : type du fichier, taille, cadence, débit moyen', async () => {
    const c = capacites(tous(OUI));
    await choisirVariantes(MANIFESTE, 'portrait', 16.7, c);
    expect(c.recues[0]).toEqual({ type: 'file', video: { contentType: 'video/mp4; codecs="av01.0.12M.10"', width: 1080, height: 2340, framerate: 60, bitrate: 2_424_242 } });
  });
});

// ---------- écrans de proportions éloignées des références (Review Focus 1 et 4) ----------
const ECRANS = { telephone: { width: 390, height: 844 }, ipad: { width: 768, height: 1024 }, bureau219: { width: 2560, height: 1080 }, court: { width: 390, height: 664 }, bureau: { width: 1280, height: 800 } };

describe('de la vidéo à l’écran (object-fit: cover)', () => {
  it('la vidéo couvre l’écran sans bande vide ; portrait calé en haut, paysage centré ; centrée en largeur', () => {
    for (const ecran of Object.values(ECRANS)) {
      const cadrage = choisirCadrage(ecran.width, ecran.height), video = CADRAGES[cadrage];
      const [x0, y0] = versEcran([0, 0], video, ecran, cadrage), [x1, y1] = versEcran([video.width, video.height], video, ecran, cadrage);
      expect(x0).toBeLessThanOrEqual(0);
      expect(y0).toBeLessThanOrEqual(0);
      expect(x1).toBeGreaterThanOrEqual(ecran.width - 1e-9);
      expect(y1).toBeGreaterThanOrEqual(ecran.height - 1e-9);
      expect(x0 + x1).toBeCloseTo(ecran.width, 9);
      if (cadrage === 'portrait') expect(y0).toBe(0);
      else expect(y0 + y1).toBeCloseTo(ecran.height, 9);
    }
  });

  it('valeurs : le « o » du titre mesuré (cadrages.ts, portrait 390 × 844) ; 21:9 et 16:10 rognés', () => {
    const { x, y } = TITRES.portrait.titre.o;   // px vidéo, mesurés sur l’écran de référence 390 × 844 (× 1080 / 390)
    const o = versEcran([x, y], CADRAGES.portrait, ECRANS.telephone, 'portrait');
    expect(o[0]).toBeCloseTo(83.72, 2);
    expect(o[1]).toBeCloseTo(144.44, 2);
    expect(versEcran([960, 540], CADRAGES.paysage, ECRANS.bureau219, 'paysage')).toEqual([1280, 540]);
    expect(versEcran([0, 0], CADRAGES.paysage, ECRANS.bureau219, 'paysage')).toEqual([0, -180]);
    const b = versEcran([0, 0], CADRAGES.paysage, ECRANS.bureau, 'paysage');
    expect(b[0]).toBeCloseTo(-71.11, 2);
    expect(b[1]).toBeCloseTo(0, 9);
    expect(versEcran([1080, 2340], CADRAGES.portrait, ECRANS.ipad, 'portrait').map((v) => Math.round(v * 100) / 100)).toEqual([768, 1664]);
  });

  it('couverture : un seul transform du repère de la vidéo à l’écran (translate puis scale), celui de versEcran', () => {
    for (const ecran of [...Object.values(ECRANS), { width: 844, height: 390 }]) for (const cadrage of ['portrait', 'paysage'] as const) {
      const video = CADRAGES[cadrage], c = couverture(video, ecran, cadrage);
      expect(c.echelle).toBe(Math.max(ecran.width / video.width, ecran.height / video.height));
      for (const p of [[0, 0], [video.width, video.height], [123.4, 567.8]] as [number, number][])
        expect(versEcran(p, video, ecran, cadrage)).toEqual([c.x + p[0] * c.echelle, c.y + p[1] * c.echelle]);
    }
    expect(couverture(CADRAGES.paysage, ECRANS.bureau219, 'paysage')).toEqual({ echelle: 2560 / 1920, x: 0, y: -180 });
    expect(couverture(CADRAGES.portrait, ECRANS.ipad, 'portrait')).toEqual({ echelle: 768 / 1080, x: 0, y: 0 });
  });

  it('rotation pendant l’intro : la même vidéo (même cadrage) couvre encore l’écran tourné', () => {
    const tourne = { width: 844, height: 390 };
    const [x0, y0] = versEcran([0, 0], CADRAGES.portrait, tourne, 'portrait');
    const [x1, y1] = versEcran([1080, 2340], CADRAGES.portrait, tourne, 'portrait');
    expect([x0, y0]).toEqual([0, 0]);
    expect(x1).toBeCloseTo(844, 9);
    expect(y1).toBeGreaterThan(390);
  });
});

describe('relais de la petite Terre du titre', () => {
  const ecart = (a: number, b: number) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  it('de FONDU à FIN, l’angle de la Terre en pâte est celui de la chronologie (même vitesse que la petite Terre)', () => {
    for (let t = INTRO.FONDU; t <= INTRO.FIN + 1e-9; t += 0.1) expect(ecart(angleTerre(t), logoAngleAt(t)), `t = ${t.toFixed(1)}`).toBeLessThan(1e-9);
  });
  it('au-delà de FIN (vidéo sur sa dernière image) : l’angle de la dernière image', () => {
    expect(angleTerre(INTRO.FIN + 3)).toBeCloseTo(angleTerre(INTRO.FIN), 12);
  });
});

describe('abandons (8 s sans image, 8 s sans progrès ; onglet caché : rien ne compte)', () => {
  /** Relevés à 60 Hz pendant `ms` ; `temps` : currentTime à chaque relevé. */
  function jouer(s: Suivi, de: number, ms: number, r: Omit<Releve, 'ms'>, avance = 0): { s: Suivi; echec: ReturnType<typeof suivreLecture>['echec']; quand: number } {
    let echec: ReturnType<typeof suivreLecture>['echec'] = null, t = r.temps, quand = -1;
    for (let k = 16; k <= ms; k += 16) {
      t += avance;
      ({ suivi: s, echec } = suivreLecture(s, { ...r, temps: t, ms: de + k }));
      if (echec) { quand = de + k; break; }
    }
    return { s, echec, quand };
  }
  const attend = { visible: true, temps: 0, image: false, attendue: true };

  it('aucune image : « pas-d-image » à 8 s, pas avant', () => {
    const r = jouer(SUIVI_DEPART, 0, 9000, attend);
    expect(r.echec).toBe('pas-d-image');
    expect(r.quand).toBe(8016);
  });

  it('onglet caché pendant l’attente : l’absence ne compte pas ; au retour, le compte reprend où il était', () => {
    let { s } = jouer(SUIVI_DEPART, 0, 3000, attend);
    ({ suivi: s } = suivreLecture(s, { ...attend, ms: 3010, visible: false }));
    // 60 s plus tard, l'onglet revient (aucun relevé entre-temps : rAF suspendu)
    let r = jouer(s, 63_000, 4000, attend);
    expect(r.echec).toBeNull();
    r = jouer(r.s, 67_000, 2000, attend);
    expect(r.echec).toBe('pas-d-image');
    expect(r.quand).toBe(68_040);
  });

  it('au retour de l’onglet, la vidéo reprend : plus d’abandon', () => {
    let { s } = jouer(SUIVI_DEPART, 0, 2000, { ...attend, image: true, temps: 5 }, 1 / 60);
    ({ suivi: s } = suivreLecture(s, { ...attend, image: true, temps: 5.6, ms: 2010, visible: false }));
    const r = jouer(s, 90_000, 20_000, { ...attend, image: true, temps: 5.6 }, 1 / 60);
    expect(r.echec).toBeNull();
  });

  it('un relevé manqué (page gelée 30 s sans événement) ne compte que pour un pas', () => {
    let { s } = jouer(SUIVI_DEPART, 0, 1000, attend);
    let echec: ReturnType<typeof suivreLecture>['echec'];
    ({ suivi: s, echec } = suivreLecture(s, { ...attend, ms: 31_000 }));
    expect(echec).toBeNull();
    expect(s.attenteMs).toBeCloseTo(1226, 9);
  });

  it('réseau qui cale en cours de lecture : « bloquee » au bout de 8 s sans progrès ; un progrès remet le compte à zéro', () => {
    let { s } = jouer(SUIVI_DEPART, 0, 3000, { ...attend, image: true, temps: 0 }, 1 / 60);
    let r = jouer(s, 3000, 7000, { ...attend, image: true, temps: 3 });   // calé : currentTime ne bouge plus
    expect(r.echec).toBeNull();
    r = jouer(r.s, 10_000, 500, { ...attend, image: true, temps: 3 }, 1 / 60);   // il repart un instant
    r = jouer(r.s, 10_500, 9000, { ...attend, image: true, temps: 3.6 });
    expect(r.echec).toBe('bloquee');
    expect(r.quand).toBe(18_516);
  });

  it('lecture qui n’a pas à avancer (figée par ?introT, dernière image en attendant le globe) : jamais d’abandon', () => {
    expect(jouer(SUIVI_DEPART, 0, 20_000, { ...attend, image: true, temps: 19.8, attendue: false }).echec).toBeNull();
  });
});
```

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit src/intro/lecteur.test.ts`. Expected : FAIL — `Error: Cannot find module './lecteur' imported from …/web/src/intro/lecteur.test.ts` ; `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 3 : implémenter le lecteur.** Créer `web/src/intro/lecteur.ts` :

```ts
import { INTRO, INTRO_GIVE_UP_MS, LOGO_ANGLE_FIN, LOGO_TOUR_S, type Cadrage } from './temps';
import type { Manifeste, Variante } from './videos';

/**
 * Décisions du lecteur vidéo de l'intro (spec `2026-10-11-countrizz-intro-video-blender-design.md` §4), en fonctions
 * pures : cadrage, cadence, variante, passage du repère de la vidéo à l'écran (`object-fit: cover`), abandons. Les
 * questions qui naissent des objets de la vidéo sont dans `questions.ts` (§5). `Intro.tsx` les branche sur la page ;
 * tout ce qui décide se teste ici, sans navigateur.
 */

/** Le manifeste `/video/videos.json` et ses variantes (videos.ts, partagés avec la fabrique), repris pour Intro.tsx et les tests. */
export { idVariante, type Manifeste, type Variante } from './videos';
/** Pourquoi l'intro mène à l'accueil direct (spec §4). */
export type Echec = 'lecture-refusee' | 'pas-d-image' | 'erreur' | 'aucun-codec' | 'bloquee';

/** Fenêtre plus haute que large : portrait ; sinon paysage. */
export function choisirCadrage(w: number, h: number): Cadrage {
  return h > w ? 'portrait' : 'paysage';
}

// ---------- cadence ----------
/** Intervalle retenu sans mesure possible (onglet caché, aucune image) : un écran à 60 Hz. */
export const INTERVALLE_DEFAUT_MS = 16.7;
/** Écran à 100 Hz ou plus : le 120 i/s peut être servi (D3). */
export const SEUIL_120_MS = 10;

export function medianeIntervalle(echantillonsMs: number[]): number {
  if (echantillonsMs.length === 0) return INTERVALLE_DEFAUT_MS;
  const s = [...echantillonsMs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Intervalle médian entre deux images de l'écran (ms), mesuré par `requestAnimationFrame` pendant `maxMs` (≈ 0,15 s).
 * Onglet caché (rAF suspendu) : 16,7 au bout de `delaiMaxMs`, sans attendre davantage.
 */
export function mesurerIntervalle(raf: (cb: FrameRequestCallback) => number, maxMs = 150, horloge: () => number = () => performance.now(), delaiMaxMs = 500): Promise<number> {
  return new Promise((resolve) => {
    const debut = horloge(), ecarts: number[] = [];
    let precedente: number | null = null, fini = false;
    const finir = (ms: number) => { if (!fini) { fini = true; clearTimeout(garde); resolve(ms); } };
    const garde = setTimeout(() => finir(INTERVALLE_DEFAUT_MS), delaiMaxMs);
    const image = (ts: number) => {
      if (fini) return;
      if (precedente !== null) ecarts.push(ts - precedente);
      precedente = ts;
      if (horloge() - debut >= maxMs && ecarts.length > 0) finir(medianeIntervalle(ecarts));
      else raf(image);
    };
    raf(image);
  });
}

// ---------- variante ----------
export interface Capacites { decodingInfo?(c: MediaDecodingConfiguration): Promise<{ supported: boolean; smooth: boolean; powerEfficient: boolean }>; canPlayType(type: string): string }
interface Aptitude { supported: boolean; smooth: boolean; powerEfficient: boolean }

/** MediaCapabilities pour la variante ; absent ou en échec : `canPlayType` (lisible ou non, rien sur la fluidité). */
async function aptitude(v: Variante, duree: number, caps: Capacites): Promise<Aptitude> {
  if (caps.decodingInfo) {
    try {
      const bitrate = Math.max(1, Math.round((v.octets * 8) / duree));
      const r = await caps.decodingInfo({ type: 'file', video: { contentType: v.type, width: v.width, height: v.height, framerate: v.ips, bitrate } });
      return { supported: r.supported, smooth: r.smooth, powerEfficient: r.powerEfficient };
    } catch { /* type refusé par l'API : canPlayType */ }
  }
  return { supported: caps.canPlayType(v.type) !== '', smooth: false, powerEfficient: false };
}
const rang = (a: Aptitude) => (a.powerEfficient ? 3 : a.smooth ? 2 : a.supported ? 1 : 0);

/**
 * Les variantes à essayer, dans l'ordre (une par codec lisible) ; [] : aucun codec, accueil direct. Économe d'abord, puis
 * fluide, puis seulement lisible ; AV1 avant HEVC à égalité. La légère (portrait) remplace la pleine qui n'est ni fluide
 * ni économe (D2) ; le 120 i/s remplace le 60 seulement si l'écran dépasse 100 Hz et si son décodage est économe (D3).
 */
export async function choisirVariantes(m: Manifeste, cadrage: Cadrage, intervalleMs: number, caps: Capacites): Promise<Variante[]> {
  const trouver = (taille: Variante['taille'], ips: Variante['ips'], codec: Variante['codec']) =>
    m.variantes.find((v) => v.cadrage === cadrage && v.taille === taille && v.ips === ips && v.codec === codec);
  const choix: { v: Variante; rang: number; ordre: number }[] = [];
  for (const [ordre, codec] of (['av1', 'hevc'] as const).entries()) {
    let v = trouver('plein', 60, codec), a = v ? await aptitude(v, m.duree, caps) : null;
    const leger = trouver('leger', 60, codec);
    if (leger && (!a || (!a.smooth && !a.powerEfficient))) {
      const b = await aptitude(leger, m.duree, caps);
      if (b.supported) { v = leger; a = b; }
    }
    if (!v || !a || !a.supported) continue;
    const v120 = trouver('plein', 120, codec);
    if (intervalleMs <= SEUIL_120_MS && v.taille === 'plein' && v120) {
      const b = await aptitude(v120, m.duree, caps);
      if (b.supported && b.powerEfficient) { v = v120; a = b; }
    }
    choix.push({ v, rang: rang(a), ordre });
  }
  return choix.sort((x, y) => y.rang - x.rang || x.ordre - y.ordre).map((c) => c.v);
}

// ---------- de la vidéo à l'écran ----------
/**
 * Rognage `object-fit: cover` : la vidéo couvre l'écran, centrée en largeur ; le portrait est calé en haut
 * (`object-position: 50% 0`, D8), le paysage centré. Un point p de la vidéo (px vidéo) est à l'écran (px CSS) en
 * `(x + p₀·echelle, y + p₁·echelle)` : le calque des questions, dans le repère de la vidéo, se pose donc par un seul
 * `translate(x, y) scale(echelle)` (origine en haut à gauche), recalculé quand l'écran change.
 */
export interface Couverture { echelle: number; x: number; y: number }
export function couverture(video: { width: number; height: number }, ecran: { width: number; height: number }, cadrage: Cadrage): Couverture {
  const echelle = Math.max(ecran.width / video.width, ecran.height / video.height);
  return { echelle, x: (ecran.width - video.width * echelle) / 2, y: cadrage === 'portrait' ? 0 : (ecran.height - video.height * echelle) / 2 };
}

/** Un point de la vidéo (px vidéo) à l'écran (px CSS), sous ce rognage. */
export function versEcran(p: [number, number], video: { width: number; height: number }, ecran: { width: number; height: number }, cadrage: Cadrage): [number, number] {
  const c = couverture(video, ecran, cadrage);
  return [c.x + p[0] * c.echelle, c.y + p[1] * c.echelle];
}

// ---------- relais de la petite Terre du titre ----------
/**
 * Angle de la Terre en pâte (rad, [0, 2π[) à l'instant `t` de la vidéo, de FONDU à FIN : elle y tourne à la vitesse de
 * la petite Terre du titre (un tour en LOGO_TOUR_S) jusqu'à LOGO_ANGLE_FIN ; au-delà, la vidéo reste sur sa dernière
 * image. La petite Terre part de cet angle quand le fondu commence (D5).
 */
export function angleTerre(t: number): number {
  const a = LOGO_ANGLE_FIN - (INTRO.FIN - Math.min(t, INTRO.FIN)) * ((2 * Math.PI) / LOGO_TOUR_S);
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

// ---------- abandons ----------
/** Ce que le lecteur relève à chaque image de l'écran, et quand l'onglet change de visibilité. */
export interface Releve {
  /** Horloge (ms). */
  ms: number;
  /** Onglet visible ; caché, rien ne compte (rAF et vidéo suspendus). */
  visible: boolean;
  /** `currentTime` de la vidéo (s). */
  temps: number;
  /** La première image est affichée. */
  image: boolean;
  /** La lecture doit avancer : ni figée par `?introT`, ni sur sa dernière image, ni dans le fondu. */
  attendue: boolean;
}
export interface Suivi { precedent: Releve | null; attenteMs: number }
export const SUIVI_DEPART: Suivi = { precedent: null, attenteMs: 0 };
/** Un écart plus long entre deux relevés visibles (page gelée, changement d'onglet manqué) ne compte que pour ce pas (ms). */
export const PAS_MAX_MS = 250;

/**
 * Attente sans progrès, comptée sur le temps où l'onglet est visible : au bout de `delaiMs`, « pas-d-image » si aucune
 * image n'est venue, « bloquee » si la lecture a calé (spec §4). Une image ou un `currentTime` qui avance remet à zéro.
 */
export function suivreLecture(s: Suivi, r: Releve, delaiMs = INTRO_GIVE_UP_MS): { suivi: Suivi; echec: Echec | null } {
  const p = s.precedent;
  const progres = p !== null && (r.temps > p.temps || (r.image && !p.image));
  let attenteMs = s.attenteMs;
  if (!r.attendue || progres) attenteMs = 0;
  else if (p && p.visible && r.visible) attenteMs += Math.min(PAS_MAX_MS, Math.max(0, r.ms - p.ms));
  return { suivi: { precedent: r, attenteMs }, echec: attenteMs >= delaiMs ? (r.image ? 'bloquee' : 'pas-d-image') : null };
}
```

- [ ] **Step 4 : vérifier.** Run : `cd web && npx vitest run --project unit src/intro/lecteur.test.ts`. Expected : PASS — `Tests  25 passed (25)`. (Le test « relais de la petite Terre » compare `angleTerre` à `logoAngleAt` de la chronologie v2 de FONDU à FIN : s'il échoue, la Terre de la vidéo ne tourne pas à la vitesse de la petite Terre du titre pendant le fondu — c'est la chronologie (Task 1) qu'il faut regarder, pas ce test.)

- [ ] **Step 5 : écrire les tests des questions.** Créer `web/src/intro/questions.test.ts` (les chasses de Chango du gabarit de test ont été mesurées dans Chromium sur `web/public/fonts/chango-latin.woff2` ; la page, elle, mesure ses propres lettres : Task 10) :

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { versEcran } from './lecteur';
import {
  MARGE_QUESTION, ORDRE_QUESTIONS, POSES, QUESTIONS, RETOUR, ancreQuestion, etatLettre, etendue, partieVisible, poserMot, signes,
  texteQuestion, type Ancres, type Gabarit, type Mot,
} from './questions';
import { BULLES_RANGE, CADRAGES, type Cadrage } from './temps';
import { POINT_RP, frameAt } from './timeline';

/** Les ancres livrées (Task 3) : point, milieu de la frontière, haut du mât, px de la vidéo. */
const ANCRES = JSON.parse(readFileSync(new URL('../../public/intro/ancres.json', import.meta.url), 'utf8')) as Ancres;
/**
 * Chasse des signes de Chango (em), mesurée dans Chromium sur la police du site (`chango-latin.woff2`, le 12/10) ; U+202F,
 * l'espace fine, y fait 0,2 em. Le gabarit de test range les lettres comme la page les mesure (Intro.tsx) : une boîte de
 * leur chasse sur la hauteur de ligne (1 em).
 */
const CHASSE: Record<string, number> = {
  C: 0.82, a: 0.8, p: 0.81, i: 0.44, t: 0.66, l: 0.44, e: 0.74, '?': 0.68, P: 0.89, y: 0.77, s: 0.65, D: 0.9, r: 0.66, u: 0.86,
  o: 0.83, n: 0.86, F: 0.81, g: 0.83, '\u202F': 0.2,
};
function gabarit(texte: string, taille: number): Gabarit {
  let x = 0;
  const lettres: Gabarit['lettres'] = [];
  for (const s of signes(texte)) {
    if (!(s.c in CHASSE)) throw new Error(`chasse de « ${s.c} » inconnue`);
    const w = CHASSE[s.c] * taille;
    if (!s.blanc) lettres.push({ x: x + w / 2, y: taille / 2, w, h: taille });
    x += w;
  }
  return { largeur: x, hauteur: taille, lettres };
}

const LANGUES = ['fr', 'en'] as const;
/** Les écrans du Review Focus (1), le téléphone de référence et un bureau 16:10 ; l'écran tourné du Review Focus (4). */
const ECRANS = { telephone: { width: 390, height: 844 }, ipad: { width: 768, height: 1024 }, bureau219: { width: 2560, height: 1080 }, court: { width: 390, height: 664 }, bureau: { width: 1280, height: 800 } };
const TOURNE = { width: 844, height: 390 };
const cadrageDe = (e: { width: number; height: number }): Cadrage => (e.height > e.width ? 'portrait' : 'paysage');
/** Les trois mots d'une langue, mesurés (gabarit) puis posés pour un écran. */
const poser = (lang: 'fr' | 'en', cadrage: Cadrage, ecran: { width: number; height: number }, marge?: number) => ORDRE_QUESTIONS.map((q) => {
  const g = gabarit(texteQuestion(lang, q), POSES[cadrage].taille);
  return { g, mot: poserMot(q, cadrage, g, ecran, marge) };
});
/** Instant où la lettre `i` se pose (fin de son vol). */
const posee = (mot: Mot, i: number) => { const q = QUESTIONS[mot.question]; return q.naissance + i * q.ecart + q.vol; };

/**
 * Plus grand débordement de l'écran (px CSS, ≤ 0 : tout dedans) des lettres de ces mots, de leur pose au retour, au pas
 * d'une image à 60 i/s : chaque lettre est le cercle de sa boîte (elle peut tourner), à son échelle, ramené à l'écran.
 */
function debordement(poses: { g: Gabarit; mot: Mot }[], ecran: { width: number; height: number }, cadrage: Cadrage) {
  const video = CADRAGES[cadrage], s = Math.max(ecran.width / video.width, ecran.height / video.height);
  let pire = -Infinity, ou = '';
  for (const { g, mot } of poses) for (let t = posee(mot, 0); t < RETOUR; t += 1 / 60) mot.lettres.forEach((_, i) => {
    if (t < posee(mot, i)) return;
    const e = etatLettre(t, mot, i, ANCRES)!, [x, y] = versEcran([e.x, e.y], video, ecran, cadrage);
    const r = (Math.hypot(g.lettres[i].w, g.lettres[i].h) / 2) * e.echelle * s;
    const d = Math.max(r - x, x + r - ecran.width, r - y, y + r - ecran.height);
    if (d > pire) { pire = d; ou = `${mot.question}, lettre ${i}, à ${t.toFixed(2)} s`; }
  });
  return { pire, ou };
}

describe('textes des questions', () => {
  it('textes des catalogues à la typographie de chaque langue : espace fine insécable (U+202F) avant « ? » en français, « ? » collé en anglais', () => {
    expect(ORDRE_QUESTIONS.map((q) => texteQuestion('fr', q))).toEqual(['Capitale\u202F?', 'Pays\u202F?', 'Drapeau\u202F?']);
    expect(ORDRE_QUESTIONS.map((q) => texteQuestion('en', q))).toEqual(['Capital?', 'Country?', 'Flag?']);
    expect(signes('Pays\u202F?')).toEqual([
      { c: 'P', blanc: false }, { c: 'a', blanc: false }, { c: 'y', blanc: false }, { c: 's', blanc: false }, { c: '\u202F', blanc: true }, { c: '?', blanc: false },
    ]);
    // les lettres qui volent : les blancs n'en sont pas
    const lettres = (lang: 'fr' | 'en') => ORDRE_QUESTIONS.map((q) => signes(texteQuestion(lang, q)).filter((s) => !s.blanc).length);
    expect(lettres('fr')).toEqual([9, 5, 8]);
    expect(lettres('en')).toEqual([8, 8, 5]);
  });
});

describe('ancres des questions', () => {
  const n = Math.round((BULLES_RANGE - 10.8) * 60) + 1;
  const piste = Array.from({ length: n }, (_, i) => [i * 10, 1000 + i] as [number, number]);
  const A: Ancres = { version: 1, fps: 60, t0: 10.8, cadrages: {
    portrait: { width: 1080, height: 2340, capitale: piste, pays: piste, drapeau: piste },
    paysage: { width: 1920, height: 1080, capitale: [[5, 6]], pays: [], drapeau: [] },
  } };

  it('interpolation linéaire entre deux échantillons', () => {
    expect(ancreQuestion(A, 'portrait', 'capitale', 10.8)).toEqual([0, 1000]);
    const p = ancreQuestion(A, 'portrait', 'pays', 10.8 + 1.5 / 60);
    expect(p[0]).toBeCloseTo(15, 9);
    expect(p[1]).toBeCloseTo(1001.5, 9);
  });

  it('hors de la fenêtre : tenue à la première et à la dernière valeur (les lettres rentrent là où était l’objet)', () => {
    expect(ancreQuestion(A, 'portrait', 'capitale', 10.2)).toEqual([0, 1000]);
    const fin = ancreQuestion(A, 'portrait', 'drapeau', BULLES_RANGE);
    expect(fin[0]).toBeCloseTo((n - 1) * 10, 9);
    expect(fin[1]).toBeCloseTo(1000 + n - 1, 9);
    expect(ancreQuestion(A, 'portrait', 'drapeau', BULLES_RANGE + 0.3)).toEqual(ancreQuestion(A, 'portrait', 'drapeau', BULLES_RANGE + 0.02));
    expect(ancreQuestion(A, 'portrait', 'drapeau', BULLES_RANGE + 0.3)[0]).toBeCloseTo((n - 1) * 10, 9);
    expect(ancreQuestion(A, 'paysage', 'capitale', 12)).toEqual([5, 6]);
    expect(() => ancreQuestion(A, 'paysage', 'pays', 12)).toThrow('aucune ancre « pays » en paysage');
  });

  it('les ancres livrées couvrent la vie des questions : de la première naissance au retour (60 par seconde, jusqu’à BULLES_RANGE)', () => {
    expect(ANCRES.version).toBe(1);
    expect(ANCRES.fps).toBe(60);
    for (const c of ['portrait', 'paysage'] as const) for (const q of ORDRE_QUESTIONS) {
      const pts = ANCRES.cadrages[c][q], fin = ANCRES.t0 + (pts.length - 1) / ANCRES.fps;
      expect(ANCRES.t0).toBeLessThanOrEqual(QUESTIONS.capitale.naissance);
      expect(fin).toBeCloseTo(BULLES_RANGE, 9);
      expect(fin).toBeGreaterThan(RETOUR);
      expect(pts.flat().every(Number.isFinite)).toBe(true);
    }
  });
});

describe('naissance, vol et retour (horloge de la vidéo)', () => {
  it('ordre et instants de naissance : Capitale, Pays, Drapeau, lettre après lettre ; rien avant', () => {
    expect(ORDRE_QUESTIONS.map((q) => QUESTIONS[q].naissance)).toEqual([11.22, 11.6, 13.15]);
    for (const lang of LANGUES) for (const { mot } of poser(lang, 'portrait', ECRANS.telephone)) {
      const q = QUESTIONS[mot.question];
      mot.lettres.forEach((_, i) => {
        const t0 = q.naissance + i * q.ecart;
        expect(etatLettre(t0 - 0.3, mot, i, ANCRES), `${mot.question} ${i} avant`).toBeNull();
        expect(etatLettre(t0, mot, i, ANCRES), `${mot.question} ${i} à sa naissance`).toBeNull();
        expect(etatLettre(t0 + 0.01, mot, i, ANCRES), `${mot.question} ${i} juste après`).not.toBeNull();
      });
    }
    // avant la naissance de « Capitale ? », aucune lettre de la vidéo
    const tous = LANGUES.flatMap((l) => poser(l, 'paysage', ECRANS.bureau)).map((p) => p.mot);
    let vues = 0;
    for (let t = 0; t <= QUESTIONS.capitale.naissance; t += 1 / 120) for (const mot of tous) mot.lettres.forEach((_, i) => { if (etatLettre(t, mot, i, ANCRES)) vues++; });
    expect(vues).toBe(0);
  });

  it('chaque mot naît de son objet : le point vient de toucher Paris, la frontière se déroule, le drapeau sort du point (frameAt)', () => {
    const f = (t: number) => frameAt(t, 'portrait');
    const { capitale, pays, drapeau } = QUESTIONS;
    // le point tombe encore 0,02 s avant « Capitale ? » ; à sa naissance, il est posé sur Paris (plus de hauteur de chute)
    expect(f(capitale.naissance - 0.02).point.y).toBeGreaterThan(POINT_RP * 1.25 * 0.8 + 0.01);
    expect(f(capitale.naissance).point.y).toBeLessThanOrEqual(POINT_RP * 1.25 * 0.8 + 1e-9);
    // la frontière a commencé de se dérouler à la naissance de « Pays ? », pas 0,11 s avant ; pas finie quand la
    // dernière lettre de « Country? » (8 lettres) s'envole
    expect(f(pays.naissance - 0.11).border).toBe(0);
    expect(f(pays.naissance).border).toBeGreaterThan(0);
    expect(f(pays.naissance + 7 * pays.ecart).border).toBeLessThan(1);
    // le drapeau sort du point : visible à la naissance de « Drapeau ? », pas 0,16 s avant
    expect(f(drapeau.naissance - 0.16).flag.visible).toBe(false);
    expect(f(drapeau.naissance).flag.visible).toBe(true);
  });

  it('chaque lettre part de l’ancre courante de son objet et se pose à sa place (le drapeau monte : l’ancre suit)', () => {
    for (const lang of LANGUES) for (const cadrage of ['portrait', 'paysage'] as const) {
      for (const { mot } of poser(lang, cadrage, cadrage === 'portrait' ? ECRANS.telephone : ECRANS.bureau)) {
        const q = QUESTIONS[mot.question], [cx, cy] = mot.centre, a = (mot.inclinaison * Math.PI) / 180;
        mot.lettres.forEach(([nx, ny], i) => {
          const t0 = q.naissance + i * q.ecart;
          const d = etatLettre(t0 + 2e-4, mot, i, ANCRES)!, o = ancreQuestion(ANCRES, cadrage, mot.question, t0 + 2e-4);
          expect(Math.hypot(d.x - o[0], d.y - o[1]), `${mot.question} ${i} part de l’objet`).toBeLessThan(1);
          const p = etatLettre(t0 + q.vol, mot, i, ANCRES)!;
          expect(p.x).toBeCloseTo(cx + (nx - cx) * Math.cos(a) - (ny - cy) * Math.sin(a), 6);
          expect(p.y).toBeCloseTo(cy + (nx - cx) * Math.sin(a) + (ny - cy) * Math.cos(a), 6);
          expect([p.rot, p.echelle, p.opacite]).toEqual([expect.closeTo(mot.inclinaison, 9), 1, 1]);
        });
      }
    }
    // le haut du mât monte pendant que « Drapeau ? » s'envole : la dernière lettre ne part pas d'où partait la première
    const { naissance, ecart } = QUESTIONS.drapeau, n = signes(texteQuestion('fr', 'drapeau')).filter((s) => !s.blanc).length;
    const [a0, a1] = [naissance, naissance + (n - 1) * ecart].map((t) => ancreQuestion(ANCRES, 'portrait', 'drapeau', t));
    expect(Math.hypot(a1[0] - a0[0], a1[1] - a0[1])).toBeGreaterThan(10);
  });

  it('au rangement, retour dans l’objet : la dernière lettre d’abord dès RETOUR (15,6 s), toutes rentrées vers 16,2 s, avant le second dézoom (16,4 s)', () => {
    for (const lang of LANGUES) for (const cadrage of ['portrait', 'paysage'] as const) {
      for (const { mot } of poser(lang, cadrage, cadrage === 'portrait' ? ECRANS.telephone : ECRANS.bureau)) {
        const n = mot.lettres.length, fins: number[] = [];
        mot.lettres.forEach((_, i) => {
          expect(etatLettre(RETOUR, mot, i, ANCRES)!.echelle, `${mot.question} ${i} encore posée`).toBe(1);
          let t = RETOUR;
          while (etatLettre(t, mot, i, ANCRES) !== null) t += 0.001;
          fins.push(t);
          // juste avant de disparaître, elle est dans son objet, minuscule
          const e = etatLettre(t - 0.001, mot, i, ANCRES)!, b = ancreQuestion(ANCRES, cadrage, mot.question, t - 0.001);
          const r = etatLettre(RETOUR, mot, i, ANCRES)!, depart = Math.hypot(r.x - b[0], r.y - b[1]);
          expect(Math.hypot(e.x - b[0], e.y - b[1]), `${mot.question} ${i} dans son objet`).toBeLessThan(0.01 * depart);
          expect(e.echelle).toBeLessThan(0.02);
        });
        expect(etatLettre(RETOUR + 0.02, mot, n - 1, ANCRES)!.echelle, 'la dernière lettre part la première').not.toBe(1);
        expect(etatLettre(RETOUR + 0.02, mot, 0, ANCRES)!.echelle).toBe(1);
        for (let i = 1; i < n; i++) expect(fins[i]).toBeLessThan(fins[i - 1]);
        expect(Math.max(...fins)).toBeGreaterThanOrEqual(BULLES_RANGE);   // la première lettre rentre la dernière : vers 16,2 s
        expect(Math.max(...fins)).toBeLessThan(16.4);
        mot.lettres.forEach((_, i) => expect(etatLettre(16.4, mot, i, ANCRES)).toBeNull());
      }
    }
  });

  it('fonction pure du temps de la vidéo : le même instant donne la même image, quel que soit l’ordre des appels (?introT, réseau qui cale)', () => {
    const mots = poser('fr', 'portrait', ECRANS.telephone).map((p) => p.mot);
    const image = (t: number) => mots.map((mot) => mot.lettres.map((_, i) => etatLettre(t, mot, i, ANCRES)));
    const vues = [13.6, 11.5, 15.9, 13.6, 12.0, 16.1, 13.6].map(image);
    expect(vues[3]).toEqual(vues[0]);
    expect(vues[6]).toEqual(vues[0]);
    expect(vues[0].flat().filter((e) => e !== null)).toHaveLength(22);   // à 13,6 s : 9 + 5 + 8 lettres à l'image
  });
});

describe('places de repos dans la partie visible (Review Focus 1 et 4)', () => {
  it('partie visible : ce que l’écran montre de la vidéo, à la marge près', () => {
    for (const ecran of [...Object.values(ECRANS), TOURNE]) for (const cadrage of ['portrait', 'paysage'] as const) {
      const v = partieVisible(cadrage, ecran, MARGE_QUESTION), video = CADRAGES[cadrage];
      const [a, b] = [versEcran([v.x0, v.y0], video, ecran, cadrage), versEcran([v.x1, v.y1], video, ecran, cadrage)];
      for (const [x, y] of [[a[0], MARGE_QUESTION], [a[1], MARGE_QUESTION], [b[0], ecran.width - MARGE_QUESTION], [b[1], ecran.height - MARGE_QUESTION]]) expect(x).toBeCloseTo(y, 9);
    }
    // iPad portrait : toute la largeur, les 1440 premiers px ; bureau 21:9 : toute la largeur, de 135 à 945 px
    const ipad = partieVisible('portrait', ECRANS.ipad), large = partieVisible('paysage', ECRANS.bureau219);
    expect([ipad.x0, ipad.y0, ipad.x1, ipad.y1].map((x) => Math.round(x * 1e6) / 1e6)).toEqual([0, 0, 1080, 1440]);
    expect([large.x0, large.y0, large.x1, large.y1].map((x) => Math.round(x * 1e6) / 1e6)).toEqual([0, 135, 1920, 945]);
  });

  it('l’étendue d’un mot contient chacune de ses lettres, de la pose au retour (inclinaison qui oscille, onde, saut du « ? »)', () => {
    for (const lang of LANGUES) for (const cadrage of ['portrait', 'paysage'] as const) {
      for (const { g, mot } of poser(lang, cadrage, cadrage === 'portrait' ? ECRANS.telephone : ECRANS.bureau)) {
        const e = etendue(g, mot.inclinaison, mot.taille), [cx, cy] = mot.centre;
        let pire = -Infinity;
        for (let t = posee(mot, 0); t < RETOUR; t += 1 / 240) mot.lettres.forEach((_, i) => {
          if (t < posee(mot, i)) return;
          const l = etatLettre(t, mot, i, ANCRES)!, r = Math.hypot(g.lettres[i].w, g.lettres[i].h) / 2;
          pire = Math.max(pire, cx + e.gauche - (l.x - r), l.x + r - (cx + e.droite), cy + e.haut - (l.y - r), l.y + r - (cy + e.bas));
        });
        expect(pire, `${lang} ${cadrage} ${mot.question}`).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it('mot dont la place de repos sort de la partie visible : ramené dedans (iPad portrait : « Pays ? » remonte ; 900 × 900 : « Capitale ? » rentre à gauche) ; gardé s’il y tient ; centré s’il est plus grand qu’elle', () => {
    // bureau 16:10 : les trois places de la maquette tiennent
    for (const lang of LANGUES) for (const { mot } of poser(lang, 'paysage', ECRANS.bureau)) {
      const [x, y] = POSES.paysage[mot.question];
      expect(mot.centre).toEqual([x, y]);
    }
    // iPad portrait : la vidéo n'y montre que ses 1440 premiers px ; « Pays ? » (y = 1470) remonte contre la marge
    const ipad = poser('fr', 'portrait', ECRANS.ipad)[1], vi = partieVisible('portrait', ECRANS.ipad, MARGE_QUESTION);
    const ei = etendue(ipad.g, ipad.mot.inclinaison, ipad.mot.taille);
    expect(ipad.mot.centre[0]).toBe(POSES.portrait.pays[0]);
    expect(ipad.mot.centre[1]).toBeLessThan(POSES.portrait.pays[1] - 50);
    expect(ipad.mot.centre[1] + ei.bas).toBeCloseTo(vi.y1, 9);
    // écran carré : le paysage n'y montre que 1080 px de large, de 420 à 1500 ; « Capitale ? » (x = 1300) rentre à gauche
    const carre = { width: 900, height: 900 }, cap = poser('fr', 'paysage', carre)[0], vc = partieVisible('paysage', carre, MARGE_QUESTION);
    const ec = etendue(cap.g, cap.mot.inclinaison, cap.mot.taille);
    expect(cap.mot.centre[0]).toBeLessThan(POSES.paysage.capitale[0]);
    expect(cap.mot.centre[0] + ec.droite).toBeCloseTo(vc.x1, 9);
    expect(cap.mot.centre[1]).toBe(POSES.paysage.capitale[1]);
    // marge démesurée : la partie visible est plus étroite que le mot, il est centré dessus
    const etroit = poser('fr', 'paysage', ECRANS.bureau, 500)[0], ve = partieVisible('paysage', ECRANS.bureau, 500);
    const ee = etendue(etroit.g, etroit.mot.inclinaison, etroit.mot.taille);
    expect(ve.x1 - ve.x0).toBeLessThan(ee.droite - ee.gauche);
    expect(etroit.mot.centre[0] + (ee.gauche + ee.droite) / 2).toBeCloseTo((ve.x0 + ve.x1) / 2, 9);
  });

  it('les ancres livrées (public/intro/ancres.json), sur chaque écran du Review Focus : chaque mot entier dans l’écran, de sa pose à son retour', () => {
    for (const [nom, ecran] of Object.entries(ECRANS)) for (const lang of LANGUES) {
      const cadrage = cadrageDe(ecran), d = debordement(poser(lang, cadrage, ecran), ecran, cadrage);
      expect(d.pire, `${nom} (${lang}) : ${d.ou}`).toBeLessThanOrEqual(-MARGE_QUESTION + 0.01);
    }
  });

  it('rotation pendant l’intro (portrait gardé sur l’écran tourné 844 × 390) : chaque mot ramené dans le haut visible, entier', () => {
    for (const lang of LANGUES) {
      const poses = poser(lang, 'portrait', TOURNE), v = partieVisible('portrait', TOURNE, MARGE_QUESTION);
      for (const { mot } of poses) {
        expect(mot.centre[1], mot.question).toBeLessThan(POSES.portrait[mot.question][1]);
        expect(mot.centre[1]).toBeLessThan(v.y1);
      }
      const d = debordement(poses, TOURNE, 'portrait');
      expect(d.pire, `${lang} : ${d.ou}`).toBeLessThanOrEqual(-MARGE_QUESTION + 0.01);
    }
  });
});
```

- [ ] **Step 6 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit src/intro/questions.test.ts`. Expected : FAIL — `Error: Cannot find module './questions' imported from …/web/src/intro/questions.test.ts` ; `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 7 : implémenter les questions.** Créer `web/src/intro/questions.ts` :

```ts
import type { Lang, Mode } from '../game/types';
import { messages } from '../i18n';
import { couverture } from './lecteur';
import { CADRAGES, type Cadrage } from './temps';

/**
 * Les questions de l'intro (spec `2026-10-11-countrizz-intro-video-blender-design.md` §5), en fonctions pures du temps
 * de la vidéo : « Capitale ? », « Pays ? », « Drapeau ? » en Chango, sans bulle ni réponse. Chaque mot naît de son objet
 * au moment où il apparaît (le point qui touche Paris, la frontière qui se déroule, le drapeau qui sort du point) : ses
 * lettres jaillissent l'une après l'autre de l'ancre courante de l'objet (`ancres.json`), volent avec un saut et une
 * vrille, se posent avec élan près de lui, ondulent, puis rentrent dans l'objet au rangement. Tout est en px de la
 * vidéo : `Intro.tsx` pose le calque sur l'écran par un seul transform (`couverture`) et mesure les lettres dans la page
 * (`Gabarit`). Implémentation de référence : la maquette validée le 12/10 (« ok go »), retour avancé à 15,6 s.
 */

export type Question = 'capitale' | 'pays' | 'drapeau';
/** Ancres des questions (`/intro/ancres.json`, écrit par `scripts/intro/export-keys.ts`) : px vidéo, de `t0` au pas 1/`fps`. */
export interface Ancres { version: 1; fps: number; t0: number; cadrages: Record<Cadrage, { width: number; height: number } & Record<Question, [number, number][]>> }

/** Les questions dans l'ordre de leur naissance (celui de leurs lettres dans la page). */
export const ORDRE_QUESTIONS: readonly Question[] = ['capitale', 'pays', 'drapeau'];
/** Le mode du jeu de chaque question : son texte est `modes.*` du catalogue. */
export const MODE_QUESTION: Record<Question, Mode> = { capitale: 'capital', pays: 'country', drapeau: 'flag' };

/**
 * Envol des lettres de chaque mot : naissance de la première lettre (s), écart entre deux lettres (s), durée du vol (s),
 * hauteur du saut (px vidéo) ; `phase` décale l'oscillation d'un mot à l'autre. « Capitale ? » naît quand le point touche
 * Paris (T_POINT + D_POINT de timeline.ts), « Pays ? » pendant que la frontière se déroule (T_FRONTIERE + 0,1 s, une
 * lettre toutes les 0,16 s), « Drapeau ? » avec le drapeau qui sort du point (T_DRAPEAU + 0,15 s) ; testé sur `frameAt`.
 */
export const QUESTIONS: Record<Question, { naissance: number; ecart: number; vol: number; saut: number; phase: number }> = {
  capitale: { naissance: 11.22, ecart: 0.06, vol: 0.55, saut: 170, phase: 0 },
  pays: { naissance: 11.6, ecart: 0.16, vol: 0.6, saut: 120, phase: 1 },
  drapeau: { naissance: 13.15, ecart: 0.06, vol: 0.55, saut: 110, phase: 2 },
};
/**
 * Les lettres rentrent dans leur objet à partir de RETOUR, la dernière d'abord ; elles ont fini entre 16,2 et 16,4 s
 * (16,21 s pour 5 lettres, 16,37 s pour 9 ; au-delà de 16,2 s, fin de la fenêtre d'`ancres.json`, BULLES_RANGE, l'ancre
 * est tenue pendant que les objets se rangent, de 16,2 à 16,9 s), avant le second dézoom (16,4 s).
 */
export const RETOUR = 15.6;

/**
 * Taille des lettres (px vidéo) et place de repos de chaque mot, près de son objet : centre (px vidéo) et inclinaison (°).
 * Ce sont celles de la maquette validée ; un écran loin des références peut rogner une place : `poserMot` la ramène.
 */
export const POSES: Record<Cadrage, { taille: number } & Record<Question, [x: number, y: number, inclinaison: number]>> = {
  portrait: { taille: 62, capitale: [860, 1262, -4], pays: [330, 1470, 4], drapeau: [560, 900, -3] },
  paysage: { taille: 64, capitale: [1300, 600, -4], pays: [680, 730, 4], drapeau: [990, 330, -3] },
};
/** Marge entre un mot et le bord de l'écran (px CSS). */
export const MARGE_QUESTION = 8;

// ---------- le mouvement (constantes de la maquette) ----------
const RAD = Math.PI / 180;
/** Une fois posé, le mot s'anime peu à peu (s) : son inclinaison oscille (± °, Hz). */
const VIE_S = 0.8, OSC_DEG = 2.2, OSC_HZ = 0.55;
/** Onde à travers les lettres : amplitude (× taille), fréquence (Hz), déphasage d'une lettre à la suivante (rad). */
const ONDE = 0.08, ONDE_HZ = 1.1, ONDE_DEPHASAGE = 0.6;
/** Vrille pendant le vol (°, sens alterné d'une lettre à l'autre). */
const VRILLE_DEG = 220;
/** Le « ? » sautille : 0,4 s après sa pose, un saut (× taille, et un balancement en °) de 0,45 s toutes les 1,6 s. */
const SAUTILLE = 0.35, SAUTILLE_DEG = 18, SAUTILLE_DELAI_S = 0.4, SAUTILLE_PERIODE_S = 1.6, SAUTILLE_S = 0.45;
/** Retour dans l'objet : écart entre deux lettres (s), durée (s), tour sur elle-même (°). */
const RETOUR_ECART = 0.04, RETOUR_S = 0.45, RETOUR_DEG = 160;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Arrivée qui ralentit. */
const sortie = (x: number) => 1 - (1 - clamp01(x)) ** 3;
/** Élan : dépassement puis retour (easeOutBack). */
const elan = (x: number, k = 2.2) => { const u = clamp01(x) - 1; return 1 + (k + 1) * u ** 3 + k * u ** 2; };
/** Recul : un peu en arrière avant de partir (easeInBack). */
const recul = (x: number, k = 1.8) => { const u = clamp01(x); return (k + 1) * u ** 3 - k * u ** 2; };

// ---------- textes ----------
/** Ce qui suit le mot : en français une espace fine insécable (U+202F) puis « ? », en anglais « ? » collé. */
const POINT: Record<Lang, string> = { fr: '\u202F?', en: '?' };
/** Le texte d'une question dans la langue : `modes.*` du catalogue, suivi de « ? » à la typographie de la langue. */
export function texteQuestion(lang: Lang, q: Question): string {
  return messages[lang].modes[MODE_QUESTION[q]] + POINT[lang];
}
/** Les signes d'un texte, dans l'ordre : les lettres (qui volent) et les blancs (qui ne font que l'espace). */
export function signes(texte: string): { c: string; blanc: boolean }[] {
  return Array.from(texte, (c) => ({ c, blanc: /\s/u.test(c) }));
}

// ---------- ancres ----------
/**
 * Ancre d'une question à l'instant `t` (px vidéo), interpolée entre deux échantillons ; tenue à sa première et à sa
 * dernière valeur hors de la fenêtre d'`ancres.json` (après 16,2 s, les lettres finissent de rentrer là où était l'objet).
 */
export function ancreQuestion(a: Ancres, cadrage: Cadrage, q: Question, t: number): [number, number] {
  const pts = a.cadrages[cadrage][q], n = pts.length;
  if (n === 0) throw new Error(`ancres.json : aucune ancre « ${q} » en ${cadrage}`);
  if (n === 1) return [pts[0][0], pts[0][1]];
  const u = Math.min(n - 1, Math.max(0, (t - a.t0) * a.fps)), i = Math.min(n - 2, Math.floor(u)), k = u - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
}

// ---------- places de repos, dans la partie visible ----------
/** Un rectangle en px de la vidéo. */
export interface Cadre { x0: number; y0: number; x1: number; y1: number }
/** La partie de la vidéo que l'écran montre sous le rognage `cover` (px vidéo), rentrée de `marge` px CSS de chaque bord. */
export function partieVisible(cadrage: Cadrage, ecran: { width: number; height: number }, marge = 0): Cadre {
  const c = couverture(CADRAGES[cadrage], ecran, cadrage);
  return { x0: (marge - c.x) / c.echelle, y0: (marge - c.y) / c.echelle, x1: (ecran.width - marge - c.x) / c.echelle, y1: (ecran.height - marge - c.y) / c.echelle };
}

/**
 * Un mot tel que la page l'a mesuré, à la taille `POSES[cadrage].taille` dans le calque (px vidéo) : sa boîte, et pour
 * chaque lettre (blancs exclus, dans l'ordre) son centre dans la boîte et sa taille.
 */
export interface Gabarit { largeur: number; hauteur: number; lettres: { x: number; y: number; w: number; h: number }[] }

/**
 * Ce qu'un mot posé occupe autour du centre de sa place de repos tant qu'il y vit (px vidéo) : chaque lettre — le cercle
 * de sa boîte, qu'elle peut tourner — à sa place tournée de l'inclinaison ± OSC_DEG (9 angles : moins de 0,01 px
 * d'erreur), plus l'onde, plus le saut du « ? ».
 */
export function etendue(g: Gabarit, inclinaison: number, taille: number): { gauche: number; droite: number; haut: number; bas: number } {
  let gauche = 0, droite = 0, haut = 0, bas = 0;
  g.lettres.forEach((l, i) => {
    const dx = l.x - g.largeur / 2, dy = l.y - g.hauteur / 2, r = Math.hypot(l.w, l.h) / 2;
    const monte = ONDE * taille + (i === g.lettres.length - 1 ? SAUTILLE * taille : 0), descend = ONDE * taille;
    for (let k = 0; k <= 8; k++) {
      const a = (inclinaison + OSC_DEG * (k / 4 - 1)) * RAD;
      const x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a);
      gauche = Math.min(gauche, x - r);
      droite = Math.max(droite, x + r);
      haut = Math.min(haut, y - r - monte);
      bas = Math.max(bas, y + r + descend);
    }
  });
  return { gauche, droite, haut, bas };
}

/** Un mot posé pour un écran : centre et inclinaison (°) de sa place de repos, centres des lettres au repos sans inclinaison (px vidéo). */
export interface Mot { question: Question; cadrage: Cadrage; taille: number; centre: [number, number]; inclinaison: number; lettres: [number, number][] }

/**
 * Pose un mot mesuré : à sa place de repos (`POSES`) si elle tient dans la partie visible de l'écran (à `marge` px CSS
 * des bords, son mouvement compris : `etendue`), sinon ramené dedans au plus près ; centré s'il est plus grand qu'elle.
 * À refaire quand l'écran change (redimensionnement, rotation) ou la langue.
 */
export function poserMot(q: Question, cadrage: Cadrage, g: Gabarit, ecran: { width: number; height: number }, marge = MARGE_QUESTION): Mot {
  const { taille } = POSES[cadrage], [x, y, inclinaison] = POSES[cadrage][q];
  const v = partieVisible(cadrage, ecran, marge), e = etendue(g, inclinaison, taille);
  const ramener = (c: number, moins: number, plus: number, min: number, max: number) =>
    max - min < plus - moins ? (min + max - moins - plus) / 2 : Math.min(max - plus, Math.max(min - moins, c));
  const cx = ramener(x, e.gauche, e.droite, v.x0, v.x1), cy = ramener(y, e.haut, e.bas, v.y0, v.y1);
  const x0 = cx - g.largeur / 2, y0 = cy - g.hauteur / 2;
  return { question: q, cadrage, taille, centre: [cx, cy], inclinaison, lettres: g.lettres.map((l): [number, number] => [x0 + l.x, y0 + l.y]) };
}

// ---------- chaque lettre, en fonction du temps ----------
/** Une lettre à l'image : centre (px vidéo), rotation (°, sens horaire comme `rotate` en CSS), échelle, opacité. */
export interface EtatLettre { x: number; y: number; rot: number; echelle: number; opacite: number }

/**
 * La lettre `i` d'un mot posé à l'instant `t` de la vidéo ; null quand elle ne se voit pas (pas encore née, ou rentrée
 * dans son objet). Fonction pure de t : `?introT` fige les questions avec la vidéo, le réseau qui cale aussi.
 */
export function etatLettre(t: number, mot: Mot, i: number, a: Ancres): EtatLettre | null {
  const q = QUESTIONS[mot.question], n = mot.lettres.length, taille = mot.taille;
  const t0 = q.naissance + i * q.ecart, p = (t - t0) / q.vol;
  if (p <= 0) return null;
  const pe = sortie(p);
  // place de repos : la mise en page du mot, tournée de son inclinaison (qui oscille un peu une fois le mot posé)
  const vie = clamp01((t - t0 - q.vol) / VIE_S);
  const incl = (mot.inclinaison + OSC_DEG * vie * Math.sin(2 * Math.PI * OSC_HZ * (t - q.naissance) + q.phase)) * RAD;
  const [nx, ny] = mot.lettres[i], [cx, cy] = mot.centre;
  const rx = cx + (nx - cx) * Math.cos(incl) - (ny - cy) * Math.sin(incl);
  const ry = cy + (nx - cx) * Math.sin(incl) + (ny - cy) * Math.cos(incl);
  // envol depuis l'objet, qui peut encore bouger (le drapeau monte) : l'ancre suit jusqu'à la pose
  const [ax, ay] = ancreQuestion(a, mot.cadrage, mot.question, Math.min(t, t0 + q.vol));
  let x = ax + (rx - ax) * pe;
  let y = ay + (ry - ay) * pe - q.saut * Math.sin(Math.PI * clamp01(p));
  let echelle = elan(p), rot = incl / RAD + (1 - pe) * (i % 2 ? VRILLE_DEG : -VRILLE_DEG);
  const opacite = clamp01(p * 4);
  // l'onde à travers les lettres, et le « ? » qui sautille
  y -= ONDE * taille * vie * Math.sin(2 * Math.PI * ONDE_HZ * (t - q.naissance) - i * ONDE_DEPHASAGE);
  const u = t - (t0 + q.vol) - SAUTILLE_DELAI_S;
  if (i === n - 1 && u > 0) {
    const h = (u % SAUTILLE_PERIODE_S) / SAUTILLE_S;
    if (h < 1) { y -= SAUTILLE * taille * Math.sin(Math.PI * h); rot += SAUTILLE_DEG * Math.sin(2 * Math.PI * h); }
  }
  // au rangement : retour dans l'objet, la dernière lettre d'abord, en rétrécissant
  const e = clamp01((t - RETOUR - (n - 1 - i) * RETOUR_ECART) / RETOUR_S);
  if (e > 0) {
    const [bx, by] = ancreQuestion(a, mot.cadrage, mot.question, t), k = e * e;
    x += (bx - x) * k;
    y += (by - y) * k;
    echelle *= 1 - recul(e);
    rot += RETOUR_DEG * k * (i % 2 ? 1 : -1);
  }
  return echelle > 0.001 ? { x, y, rot, echelle, opacite } : null;
}
```

- [ ] **Step 8 : vérifier.** Run : `cd web && npx vitest run --project unit src/intro/lecteur.test.ts src/intro/questions.test.ts`. Expected : PASS — `Test Files  2 passed (2)`, `Tests  39 passed (39)` (25 pour le lecteur, 14 pour les questions). (Si « chaque mot naît de son objet » échoue, c'est que la chronologie (Task 1) a déplacé le point, la frontière ou le drapeau : recaler `QUESTIONS` sur elle, pas le test.)

- [ ] **Step 9 : un seul type des ancres.** **Garde :** `blender.ts` date `export-keys.ts` pour la fraîcheur des clés de `.cache/` ; après ce Step, toute commande Blender (rendu, reprise, sprite, témoins, aperçu) refuse tant que `npm run intro:keys` n'a pas tourné. Ne faire ce Step que si la Task 8 n'a plus aucune commande Blender à lancer ; sinon, faire le reste de la tâche sans lui (les deux `Ancres` sont structurellement identiques : `tsc` et la suite passent, les comptes du Step 10 ne changent pas) et le signaler : il sera fait après la Task 8, en vérifiant que `intro:keys` redonne les mêmes octets (sha256 des deux clés et d'`ancres.json`, avant et après). `web/scripts/intro/export-keys.ts` (Task 3) définit sa propre `interface Ancres`, identique à celle des questions : il prend désormais celle de `questions.ts` et la ré-exporte (les fabriques des Tasks 6 et 7 l'importent toujours de `export-keys.ts` ; `Question` et `Bulle` sont la même union, leurs `Record` s'indexent l'un par l'autre). `questions.ts` ne charge pas three. Trois remplacements dans `web/scripts/intro/export-keys.ts`.

1. Remplacer :
   
   ```ts
   import { BULLES, BULLES_RANGE, CADRAGES, INTRO, IPS_MAITRE, type Bulle, type Cadrage } from '../../src/intro/temps';
   ```
   
   par :
   
   ```ts
   import { BULLES, BULLES_RANGE, CADRAGES, INTRO, IPS_MAITRE, type Cadrage } from '../../src/intro/temps';
   ```
2. Remplacer :
   
   ```ts
   import { surFrontiere, type Reperes } from './lib/terre';
   ```
   
   par :
   
   ```ts
   import { surFrontiere, type Reperes } from './lib/terre';
   import type { Ancres } from '../../src/intro/questions';
   ```
3. Remplacer :
   
   ```ts
   export interface Ancres {
     version: 1; fps: number; t0: number;
     cadrages: Record<Cadrage, { width: number; height: number } & Record<Bulle, [number, number][]>>;
   }
   ```
   
   par :
   
   ```ts
   /** Ancres des questions (`public/intro/ancres.json`) : le type du site (`src/intro/questions.ts`, Task 9), un seul pour la fabrique et le lecteur. */
   export type { Ancres };
   ```

Run : `cd web && npx tsc --noEmit && npx vitest run --project unit scripts/intro/__tests__/unit/axes.test.ts scripts/intro/__tests__/unit/export-keys.test.ts && npm run intro:keys && git status --short public/intro` (une fois le rendu final de la Task 8 fini : `intro:keys` réécrit les clés de `.cache/`, aux mêmes octets). Expected : `tsc` sans sortie ; `Test Files  2 passed (2)`, `Tests  14 passed (14)` ; puis l'export inchangé (`keys-portrait.json : 2377 images, 220 pistes, 12508923 octets`, `keys-paysage.json : 2377 images, 220 pistes, 12390977 octets`, `ancres.json : t0 10.8 s, 325 instants par bulle, 26074 octets`) ; `git status` ne montre rien : `ancres.json` a les mêmes octets.

- [ ] **Step 10 : suite complète.** Run : `cd web && npm run check`. Expected : `tsc` sans erreur, toutes les suites unitaires vertes (dont `src/intro/lecteur.test.ts`, 25 tests, et `src/intro/questions.test.ts`, 14 tests ; au plan, sur un worktree à 06fe6e4 (Tasks 1 à 7 ; la Task 8 n'ajoute aucun test) qui porte cette tâche : `Test Files  71 passed (71)`, `Tests  438 passed (438)`).

- [ ] **Step 11 : commit.**

```bash
git add web/src/intro/lecteur.ts web/src/intro/lecteur.test.ts web/src/intro/questions.ts web/src/intro/questions.test.ts web/scripts/intro/export-keys.ts
git commit -m "intro : décisions pures du lecteur vidéo (cadrage, cadence, variante, cover, abandons) et questions nées de leur objet, type des ancres unique — spec intro vidéo §4-5"
```

---

### Task 10 : Lecteur : Intro.tsx, questions, CSS, i18n, App/Home/LogoTitle, suppressions, PWA, nginx, image

**Files:**
- Modify: `web/src/i18n/types.ts`, `web/src/i18n/fr.ts`, `web/src/i18n/en.ts` ; Test: `web/src/i18n/i18n.test.ts`
- Create: `web/src/pwa/motifs.ts`
- Modify: `web/src/pwa/cache.ts`, `web/vite.config.ts`, `web/tsconfig.json` ; Test: `web/src/pwa/pwa.test.ts`
- Modify: `web/src/ui/LogoTitle.tsx` (réécrit), `web/src/ui/Home.tsx`, `web/src/ui/home.css`, `web/src/app/App.tsx` (réécrit)
- Create: `web/src/globe/LoadErrorCard.tsx` (la carte « Réessayer », sortie de `GlobeView.tsx`) ; Modify: `web/src/globe/GlobeView.tsx` (l'importe)
- Modify: `web/src/intro/Intro.tsx` (réécrit), `web/src/intro/intro.css` (réécrit)
- Modify: `web/e2e/intro.spec.ts` (seul le test de pixel de la pâte three.js est retiré : il lit `__intro.frames`, qui n'existe plus, et `tsc` couvre `e2e/` ; la Task 11 réécrit le fichier)
- Delete: `web/src/intro/scene.ts`, `web/src/intro/boxes.ts`, `web/src/intro/timeline-v1.ts` (copie gelée de la Task 1), `web/scripts/intro/build-logo-sprite.mjs`, `web/public/intro/monde.jpg`, `web/public/intro/europe.jpg`, `web/public/intro/relief.jpg`, `web/public/intro/relief-fin.jpg`, `web/public/intro/france.json`
- Modify: `deploy/web/nginx.conf`, `deploy/web/Dockerfile`, `deploy/scripts/stage-image.mjs`

**Interfaces:**
- Consumes : tout `web/src/intro/lecteur.ts` et tout `web/src/intro/questions.ts` (Task 9) ; `web/src/intro/temps.ts` (Task 1) : `CADRAGES`, `INTRO`, `LOGO_ANGLE_FIN`, `LOGO_LETTRES`, `LOGO_TOUR_S`, `type Cadrage` ; `type Lang` de `web/src/game/types.ts` (existant) ; `GlobeView` (`web/src/globe/GlobeView.tsx`, export nommé, `ref` en prop sous React 19) et sa carte d'erreur ; la police Chango de `web/src/ui/theme.css` (existante) ; fichiers servis : `/video/videos.json` et ses vidéos (Tasks 7-8), `/intro/ancres.json` (Task 3), `/intro/affiche-<cadrage>.webp` (Tasks 7-8), `/intro/logo-terre.webp` (Task 7).
- Produces :
  - `Intro({ lang, m, globeReady, onHome, onFade, onDone })` avec `lang: Lang` (langue des questions), `onHome(): void` (à `INTRO.ACCUEIL`), **`onFade(angle: number | null): void`** (le fondu part : angle de la Terre de la vidéo à cet instant, `angleTerre(t)` ; null : accueil direct), `onDone(angle: number | null): void` (fin du fondu : `LOGO_ANGLE_FIN` ; null : intro abandonnée) ;
  - crochets (dev ou `countrizz:e2e`) : `window.__intro = { t, ready, skipped, variante: { cadrage, taille, ips, codec } | null, echec: Echec | null, premiereImageMs: number | null }` (`ready` : première image affichée ; `premiereImageMs` : `performance.now()` à cet instant) ; `?introT=13` (vidéo à 13 s, en pause, questions de 13 s) ; `?introVariante=portrait-plein-60-av1` (`idVariante`) ;
  - DOM pour les e2e (Task 11) : `.intro` (+ `.intro--image` après la première image, `.intro--fondu` pendant le fondu), `video.intro-video[data-cadrage]` (`aria-label` = `intro.videoLabel`), `img.intro-affiche`, bouton « Passer › » `.intro-passer` ; le calque des questions `.intro-questions[data-cadrage][aria-hidden="true"]`, dans le repère de la vidéo (style : `width` et `height` du cadrage en px, `font-size` `POSES[cadrage].taille` px, `transform: translate(<x>px, <y>px) scale(<echelle>)` de `couverture(CADRAGES[cadrage], écran, cadrage)`, écrit par la boucle dès que la mesure existe, puis à chaque changement de taille de l'écran ou de mesure) ; un mot par question, `.intro-question.intro-question--capitale|--pays|--drapeau[data-question]`, dont le texte est `texteQuestion(lang, q)` ; dans chaque mot, un `span` par signe de `signes(texte)` : `.intro-lettre` (style écrit à partir de la première image de la vidéo, à chaque image où t ou la pose change : `opacity`, et `transform: translate(<dx>px, <dy>px) rotate(<r>deg) scale(<s>)` autour de son centre, qui amène ce centre en `etatLettre(t, …)` ; `opacity: 0` quand `etatLettre` rend null ; `opacity: 0` par la CSS avant toute écriture) ou `.intro-blanc` (U+202F, immobile) ;
  - `export type EntreeTitre = 'pop' | 'fondu'` et `LogoTitle({ angle, visible, entree })` (`web/src/ui/LogoTitle.tsx`) ; `Home` : `logo: { angle: number | null; visible: boolean; entree: EntreeTitre }` ; classes `.logo-titre--pop` / `.logo-titre--fondu` (+ `.logo-titre--visible`) ;
  - D15 : `App` charge `GlobeView` par `React.lazy(() => import('../globe/GlobeView').then((m) => ({ default: m.GlobeView })))` sous `<Suspense fallback={null}>`, dans une frontière d'erreur (`CodeDuGlobe`) : morceau introuvable → `onError` (le fondu part) et la carte « Réessayer », qui recharge la page ; `LoadErrorCard({ texts, detail, onRetry })` (`web/src/globe/LoadErrorCard.tsx`) ; `dist/index.html` ne charge plus ni `GlobeView-*.js` ni `textures-*.js` ;
  - `MOTIF_LOURD`, `MOTIF_PAYS`, `MOTIF_DONNEES` (`web/src/pwa/motifs.ts`) ; `INTRO_URLS = ['/intro/affiche-portrait.webp', '/intro/affiche-paysage.webp', '/intro/ancres.json']` ;
  - i18n `intro.videoLabel` (les questions prennent `modes.*`, leur typographie est dans `questions.ts`) ;
  - nginx : `/video/` dans la location des noms fixes ; image : calque `.image-staging/video/` (refus au-delà de 150 000 000 octets).

Déroulé du lecteur (pour le relecteur) : le code du globe arrive à part (D15) — l'intro se monte avec le premier JavaScript de la page (au plan, Resource Timing sous « bonne connexion » : l'affiche part à 207 ms et la première image vient à 590 ms) ; l'affiche du cadrage de la fenêtre s'affiche tout de suite ; en parallèle, `videos.json`, `ancres.json` et la mesure rAF (≈ 0,15 s) ; puis `choisirVariantes` (ou la variante forcée) ; `src` posé en JS, `play()` sans attribut `autoplay`. Refus `NotAllowedError` → accueil direct ; `error` avant la première image → variante suivante (l'autre codec), sinon accueil direct ; 8 s sans image ou sans progrès (onglet visible seulement, `suivreLecture`) → accueil direct. Retour sur l'onglet : la vidéo suspendue repart (`play()`). Tout suit l'image affichée (`requestVideoFrameCallback`, `currentTime` en repli ; `ended` → FIN). « Passer › » avant la première image : accueil direct ; après : la vidéo saute à sa dernière image (titre en pâte), l'accueil se monte, le fondu part dès que le globe est prêt. Globe pas prêt : la vidéo finit et reste sur sa dernière image, l'accueil par-dessus. Fondu : CSS sur la vidéo de `FONDU_S = FIN − FONDU` ; le titre HTML apparaît en fondu au même rythme (animation, pas transition : elle joue aussi quand « Passer » monte l'accueil et lance le fondu dans la même image) ; la petite Terre est remontée (`key`) à l'angle `onFade` (corrige le bogue de `animation-delay` relevé à la reconnaissance) ; fin sur `transitionend` de l'opacité de la vidéo, au plus tard `FONDU_S + 1 s`. Questions (spec §5) : un `span` par signe, mesuré dans le calque (repère de la vidéo, à la taille `POSES[cadrage].taille`) à la langue, au cadrage de la vidéo chargée, puis de nouveau quand Chango est chargée (`document.fonts.load`) ; à chaque image, la taille de l'écran est relevée : si elle ou la mesure a changé, le calque est reposé (`couverture`, un seul transform) et les mots ramenés dans la partie visible (`poserMot`) ; puis chaque lettre est écrite depuis `etatLettre(t)`, sans lecture de mise en page, et rien n'est réécrit tant que t et la pose ne changent pas. Rien avant la première image, ni sans ancres. Rotation : la vidéo n'est jamais rechargée, les questions sont reposées.

- [ ] **Step 1 : test des catalogues (échec attendu).** Dans `web/src/i18n/i18n.test.ts`, bloc `describe('catalogues', …)`, juste après le test « textes des maquettes validées » (qui finit par `expect(messages.fr.errors.unsupportedHint)…` puis `});`), ajouter :

```ts
  it('intro : la vidéo porte son étiquette pour les lecteurs d’écran (les questions, décoratives, prennent modes.*)', () => {
    expect(messages.fr.intro.videoLabel).toBe('Countrizz : une Terre en pâte à modeler tombe du ciel et montre la France');
    expect(messages.en.intro.videoLabel).toBe('Countrizz: a modelling-clay Earth falls from the sky and shows France');
  });
```

Run : `cd web && npx vitest run --project unit src/i18n/i18n.test.ts`. Expected : FAIL — `AssertionError: expected undefined to be 'Countrizz : une Terre en pâte à model…' // Object.is equality` sur « intro : la vidéo porte son étiquette … » ; `Tests  1 failed | 9 passed (10)`.

- [ ] **Step 2 : textes de l'intro.** `web/src/i18n/types.ts` : Remplacer :

```ts
  intro: { skip: string };
```

par :

```ts
  /** `videoLabel` : la vidéo pour les lecteurs d'écran (les questions, décoratives, prennent `modes.*` : intro/questions.ts). */
  intro: { skip: string; videoLabel: string };
```

`web/src/i18n/fr.ts` : Remplacer :

```ts
  intro: { skip: 'Passer ›' },
```

par :

```ts
  intro: { skip: 'Passer ›', videoLabel: 'Countrizz : une Terre en pâte à modeler tombe du ciel et montre la France' },
```

`web/src/i18n/en.ts` : Remplacer :

```ts
  intro: { skip: 'Skip ›' },
```

par :

```ts
  intro: { skip: 'Skip ›', videoLabel: 'Countrizz: a modelling-clay Earth falls from the sky and shows France' },
```

Run : `cd web && npx vitest run --project unit src/i18n/i18n.test.ts`. Expected : PASS — `Tests  10 passed (10)` (mêmes clés, mêmes emplacements `{…}` dans les deux langues ; plus de `intro.ask` : la typographie des questions est dans `questions.ts`, testée à la Task 9).

- [ ] **Step 3 : tests du service worker et de l'intro mise en cache (échec attendu).** Remplacer tout le contenu de `web/src/pwa/pwa.test.ts` par :

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { heavyUrls, outdatedCaches, warm } from './cache';
import { isIos, shouldOffer } from './install';
import { MOTIF_DONNEES, MOTIF_LOURD, MOTIF_PAYS } from './motifs';

const base = { canPrompt: false, ios: false, standalone: false, coarsePointer: true, dismissed: false };

describe('proposer l’installation', () => {
  it('sur un téléphone Android dont le navigateur a donné l’invite', () => {
    expect(shouldOffer({ ...base, canPrompt: true })).toBe(true);
  });
  it('sur iPhone, même sans invite (astuce « Partager »)', () => {
    expect(shouldOffer({ ...base, ios: true })).toBe(true);
  });
  it('jamais sur un ordinateur, une fois installée, ni après « Plus tard »', () => {
    expect(shouldOffer({ ...base, canPrompt: true, coarsePointer: false })).toBe(false);
    expect(shouldOffer({ ...base, canPrompt: true, standalone: true })).toBe(false);
    expect(shouldOffer({ ...base, ios: true, dismissed: true })).toBe(false);
  });
  it('ni sur un téléphone qui ne sait pas installer', () => {
    expect(shouldOffer(base)).toBe(false);
  });
  it('reconnaît iPhone, iPad, et l’iPad qui se dit Macintosh', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5)).toBe(false);
  });
});

describe('caches de l’appareil', () => {
  it('garde les caches courants, supprime les anciens countrizz-*, ignore les autres', () => {
    expect(outdatedCaches(['countrizz-lourd-a1', 'countrizz-lourd-b2', 'workbox-precache-v2', 'countrizz-pays-c3'], ['countrizz-lourd-b2', 'countrizz-pays-c3']))
      .toEqual(['countrizz-lourd-a1']);
  });
  it('télécharge d’avance les textures du niveau du téléphone, et l’intro (affiches, ancres ; jamais les vidéos)', () => {
    expect(heavyUrls('standard')).toContain('/textures/day-4k.ktx2');
    expect(heavyUrls('standard')).not.toContain('/textures/day-8k.ktx2');
    expect(heavyUrls('haute')).toContain('/textures/day-8k.ktx2');
    expect(heavyUrls('haute')).toEqual(expect.arrayContaining(['/intro/affiche-portrait.webp', '/intro/affiche-paysage.webp', '/intro/ancres.json']));
    expect(heavyUrls('haute').filter((u) => u.startsWith('/video/') || u.endsWith('.jpg'))).toEqual([]);
  });
  it('un fichier en échec n’arrête pas les autres', async () => {
    const r = await warm(['/a', '/b', '/c'], async (u) => { if (u === '/b') throw new Error('réseau'); return { ok: u !== '/c' }; });
    expect(r).toEqual({ ok: 1, failed: ['/b', '/c'] });
  });
});

describe('service worker : ce qu’il garde (vite.config.ts, runtimeCaching)', () => {
  const motifs = [MOTIF_LOURD, MOTIF_PAYS, MOTIF_DONNEES];
  it('les vidéos de l’intro et leur manifeste passent au réseau : plages d’octets, que CacheFirst « 200 seulement » casserait (D1)', () => {
    for (const u of ['/video/intro-portrait-60.av1.mp4', '/video/intro-portrait-leger-60.hevc.mp4', '/video/videos.json', 'https://countrizz.fr/video/intro-paysage-120.av1.mp4'])
      for (const m of motifs) expect(m.test(u), `${u} ~ ${m}`).toBe(false);
  });
  it('les affiches, les ancres et la petite Terre de l’intro restent gardées', () => {
    for (const u of ['/intro/affiche-portrait.webp', '/intro/ancres.json', 'https://countrizz.fr/intro/logo-terre.webp']) expect(MOTIF_LOURD.test(u), u).toBe(true);
  });
  it('ce sont bien les motifs de vite.config.ts (aucun motif écrit en dur à côté)', () => {
    const conf = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(conf.match(/urlPattern: [^,]+/g)).toEqual(['urlPattern: MOTIF_LOURD', 'urlPattern: MOTIF_PAYS', 'urlPattern: MOTIF_DONNEES']);
  });
});
```

Run : `cd web && npx vitest run --project unit src/pwa/pwa.test.ts`. Expected : FAIL — `Error: Cannot find module './motifs' imported from …/web/src/pwa/pwa.test.ts`.

- [ ] **Step 4 : motifs du service worker, liste de l'intro.** Créer `web/src/pwa/motifs.ts` :

```ts
/**
 * Adresses que le service worker range dans ses caches à l'usage (vite.config.ts, `runtimeCaching`), testées dans
 * pwa.test.ts. Les vidéos de l'intro (`/video/`) n'y sont pas : lues en flux par plages d'octets, qu'une réponse
 * « 200 seulement » servie du cache casserait (Safari), elles passent toujours au réseau (D1 du plan de l'intro vidéo).
 */
/** Textures du globe, transcodeur, intro (affiches, ancres, petite Terre du titre), police, icônes. */
export const MOTIF_LOURD = /\/(textures|basis|intro|fonts|icons)\/[^/]+$/;
/** Pays déjà vus : patchs et drapeaux. */
export const MOTIF_PAYS = /\/data\/(patches|flags)\//;
/** Index de données (countries.json, imagery.json…). */
export const MOTIF_DONNEES = /\/data\/[a-z]+\.json$/;
```

`web/vite.config.ts` : sept remplacements.

1. Remplacer :
   
   ```ts
   import { VitePWA } from 'vite-plugin-pwa';
   ```
   
   par :
   
   ```ts
   import { VitePWA } from 'vite-plugin-pwa';
   import { MOTIF_DONNEES, MOTIF_LOURD, MOTIF_PAYS } from './src/pwa/motifs.ts';
   ```
2. Remplacer :
   
   ```ts
     /** Textures du globe, transcodeur, intro, police, icônes. */
   ```
   
   par :
   
   ```ts
     /** Textures du globe, transcodeur, intro (affiches, ancres, petite Terre ; pas les vidéos, hors de public/intro), police, icônes. */
   ```
3. Remplacer :
   
   ```ts
           runtimeCaching: [
   ```
   
   par :
   
   ```ts
           // motifs dans src/pwa/motifs.ts (testés) : les vidéos de l'intro (/video/) n'en sont pas, elles passent au réseau
           runtimeCaching: [
   ```
4. Remplacer :
   
   ```ts
               urlPattern: /\/(textures|basis|intro|fonts|icons)\/[^/]+$/,
   ```
   
   par :
   
   ```ts
               urlPattern: MOTIF_LOURD,
   ```
5. Remplacer :
   
   ```ts
               urlPattern: /\/data\/(patches|flags)\//,
   ```
   
   par :
   
   ```ts
               urlPattern: MOTIF_PAYS,
   ```
6. Remplacer :
   
   ```ts
               urlPattern: /\/data\/[a-z]+\.json$/,
   ```
   
   par :
   
   ```ts
               urlPattern: MOTIF_DONNEES,
   ```
7. Le commentaire de `ignoreVary` (l. 63-64 du fichier d'origine) parle des textures de l'intro, supprimées au Step 8 ; l'image que l'intro demande par `<img>` après l'avoir rangée par `fetch()` (`INTRO_URLS`) est désormais son affiche (les ancres passent deux fois par `fetch()`). Remplacer :
   
   ```ts
           // différents ; sinon, hors ligne, l'intro ne trouvait pas ses textures — constaté le 10/10)
   ```
   
   par :
   
   ```ts
           // différents ; sinon, hors ligne, l'intro ne trouve pas ses affiches — constaté le 10/10 sur ses textures d'alors)
   ```

L'extension `.ts` est voulue : sans elle, `vite build` avertit « import "./src/pwa/motifs" without a file extension … Add the file extension » (chargeur de configuration natif à venir) ; avec elle, TypeScript exige `allowImportingTsExtensions` (permis ici : `noEmit`). `web/tsconfig.json` : Remplacer :

```json
    "noEmit": true,
```

par :

```json
    "noEmit": true,
    "allowImportingTsExtensions": true,
```

`web/src/pwa/cache.ts` : Remplacer :

```ts
/** Les fichiers de l'intro : à la première visite, elle les charge avant que le service worker ne contrôle la page. */
export const INTRO_URLS = ['/intro/monde.jpg', '/intro/europe.jpg', '/intro/relief-fin.jpg', '/intro/relief.jpg', '/intro/france.json'] as const;
```

par :

```ts
/**
 * Les fichiers de l'intro que le service worker garde (affiches, ancres des questions) : à la première visite, elle les charge
 * avant qu'il ne contrôle la page. Ni les vidéos ni leur manifeste : ils ne passent jamais par lui (hors ligne : accueil direct).
 */
export const INTRO_URLS = ['/intro/affiche-portrait.webp', '/intro/affiche-paysage.webp', '/intro/ancres.json'] as const;
```

Run : `cd web && npx vitest run --project unit src/pwa/pwa.test.ts && npx tsc --noEmit`. Expected : PASS — `Tests  11 passed (11)`, puis `tsc` sans sortie.

- [ ] **Step 5 : titre de l'accueil, entrée en fondu et relais de la petite Terre.** Remplacer tout le contenu de `web/src/ui/LogoTitle.tsx` par :

```tsx
import type { CSSProperties } from 'react';
import { INTRO, LOGO_LETTRES, LOGO_TOUR_S } from '../intro/temps';

/**
 * Entrée du titre : `pop`, ses lettres surgissent une à une (accueil direct) ; `fondu`, il vient de la vidéo de l'intro,
 * qui le montre en pâte : invisible jusqu'au fondu, il apparaît pendant qu'elle s'efface, au même rythme (D5).
 */
export type EntreeTitre = 'pop' | 'fondu';

/**
 * Le titre C🌍untrizz (déroulé du 10/10) : une petite Terre en pâte tient la place du « o ». Elle tourne en stop motion
 * (24 images, un tour en 4 s) ; `angle` (rad) : celui de la Terre de la vidéo quand elle devient visible, pour que la
 * relève ne saute pas. Elle est remontée (`key`) à ce moment : un nouvel `animation-delay` sur un élément déjà animé ne
 * relance pas l'animation (constaté dans Chromium le 11/10). Le glyphe « o » reste dans le texte, invisible : il donne
 * l'espacement exact de la police.
 */
export function LogoTitle({ angle, visible, entree }: { angle: number | null; visible: boolean; entree: EntreeTitre }) {
  const delay = angle === null ? 0 : -(angle / (2 * Math.PI)) * LOGO_TOUR_S;
  return (
    <h1 className={`accueil-titre logo-titre logo-titre--${entree}${visible ? ' logo-titre--visible' : ''}`} aria-label="Countrizz"
      style={{ '--fondu': `${(INTRO.FIN - INTRO.FONDU).toFixed(2)}s` } as CSSProperties}>
      <span className="logo-l" aria-hidden="true" style={{ '--i': 0 } as CSSProperties}>{LOGO_LETTRES[0]}</span>
      <span className="logo-o" aria-hidden="true">o<i key={visible ? `terre${delay}` : 'cachee'} className="logo-terre" style={{ opacity: visible ? 1 : 0, animationDelay: `${delay}s` }} /></span>
      {LOGO_LETTRES.slice(1).map((l, i) => <span key={i} className="logo-l" aria-hidden="true" style={{ '--i': i + 1 } as CSSProperties}>{l}</span>)}
    </h1>
  );
}
```

`web/src/ui/Home.tsx` : trois remplacements.

1. Remplacer :
   
   ```tsx
   import { LogoTitle } from './LogoTitle';
   ```
   
   par :
   
   ```tsx
   import { LogoTitle, type EntreeTitre } from './LogoTitle';
   ```
2. Remplacer :
   
   ```tsx
     /** La petite Terre du titre : visible quand l'intro a fini, à l'angle où elle l'a laissée. */
     logo: { angle: number | null; visible: boolean };
   ```
   
   par :
   
   ```tsx
     /**
      * Le titre : `visible` quand le fondu commence (ou à l'accueil direct) ; la petite Terre part alors de `angle`, celui de
      * la Terre de la vidéo ; `entree` : en fondu depuis la vidéo, ou lettres qui surgissent (LogoTitle).
      */
     logo: { angle: number | null; visible: boolean; entree: EntreeTitre };
   ```
3. Remplacer :
   
   ```tsx
         <LogoTitle angle={logo.angle} visible={logo.visible} />
   ```
   
   par :
   
   ```tsx
         <LogoTitle angle={logo.angle} visible={logo.visible} entree={logo.entree} />
   ```

`web/src/ui/home.css` : après la ligne `@keyframes logo-tourne { to { background-position: -15.84em 0; } }`, ajouter :

```css
/* Titre venu de la vidéo (D5) : invisible tant qu'elle le montre en pâte, il apparaît en fondu pendant qu'elle s'efface
   (--fondu, posé par LogoTitle) ; ses lettres ne surgissent pas, elles sont déjà là. Une animation et non une transition :
   le fondu joue même quand le titre est monté déjà visible (« Passer » : accueil et fondu dans la même image). */
.logo-titre--fondu { opacity: 0; }
.logo-titre--fondu.logo-titre--visible { opacity: 1; animation: logo-fondu var(--fondu) ease-in-out; }
.logo-titre--fondu .logo-l { animation: none; }
@keyframes logo-fondu { from { opacity: 0; } }
```

- [ ] **Step 6 : App, et le code du globe chargé à part (D15).** `main` importait `GlobeView` d'emblée : la page attendait le code du globe (three, R3F : morceaux `GlobeView-*.js` et `textures-*.js`) avant de monter l'intro, et la première image venait à ≈ 1 s sur une bonne connexion, au ras du budget (D14). App le charge maintenant par `import()` (`React.lazy`, sous `<Suspense fallback={null}>`) : l'intro démarre avec le premier JavaScript de la page, le globe se monte caché sous elle dès que son code est là. Mesuré au plan (budget de la Task 11 sur le nginx de l'image, vidéos factices, trois passes, médiane de trois visites chacune) : première image à 951, 973 et 974 ms avant, 584, 589 et 589 ms après sous « bonne connexion » ; 1509, 1531 et 1532 ms avant, 1142, 1165 et 1165 ms après en Fast 4G. Si le morceau ne vient pas, une frontière d'erreur (`CodeDuGlobe`) prend le chemin d'un globe en échec : `onError` (le fondu part), puis la carte « Réessayer » — qui recharge la page, car Chromium ne refait pas un `import()` raté (sondé au plan : le second appel échoue sans nouvelle requête) ; sans elle, la page entière se démonte (page blanche, sondé au plan). Le globe ne tourne à l'accueil qu'une fois prêt : à l'accueil direct, son code a pu arriver après.

La carte « Réessayer » sort de `GlobeView.tsx` (App la montre sans charger le code du globe). Créer `web/src/globe/LoadErrorCard.tsx` :

```tsx
import type { Messages } from '../i18n';

/**
 * Carte d'erreur « le globe n'a pas pu se charger » avec « Réessayer » (spec §10) : chargement en échec, recréation après
 * une perte du GPU (GlobeView), ou code du globe introuvable (App, D15 du plan de l'intro vidéo).
 */
export function LoadErrorCard({ texts, detail, onRetry }: { texts: Messages['errors']; detail: string; onRetry(): void }) {
  return (
    <div role="alert" title={detail} style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', gap: 12, color: '#f7dc6f', background: '#16173a', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <p>{texts.loadTitle}</p>
      <p>{texts.loadText}</p>
      <button onClick={onRetry}>{texts.retry}</button>
    </div>
  );
}
```

`web/src/globe/GlobeView.tsx` : deux remplacements.

1. Remplacer :
   
   ```tsx
   import { ImageryCredit, type CreditPlacement } from './credits';
   ```
   
   par :
   
   ```tsx
   import { ImageryCredit, type CreditPlacement } from './credits';
   import { LoadErrorCard } from './LoadErrorCard';
   ```
2. Supprimer ces lignes (et la ligne vide qui les suit) :
   
   ```tsx
   /** Carte d'erreur « le globe n'a pas pu se charger » avec « Réessayer » (spec §10) : chargement en échec, ou recréation après une perte du GPU. */
   function LoadErrorCard({ texts, detail, onRetry }: { texts: Messages['errors']; detail: string; onRetry(): void }) {
     return (
       <div role="alert" title={detail} style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', gap: 12, color: '#f7dc6f', background: '#16173a', textAlign: 'center', fontFamily: 'sans-serif' }}>
         <p>{texts.loadTitle}</p>
         <p>{texts.loadText}</p>
         <button onClick={onRetry}>{texts.retry}</button>
       </div>
     );
   }
   ```

Remplacer tout le contenu de `web/src/app/App.tsx` par :

```tsx
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
```

- [ ] **Step 7 : le lecteur.** Remplacer tout le contenu de `web/src/intro/Intro.tsx` par :

```tsx
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Lang } from '../game/types';
import type { Messages } from '../i18n';
import {
  SUIVI_DEPART, angleTerre, choisirCadrage, choisirVariantes, couverture, idVariante, mesurerIntervalle, suivreLecture,
  type Capacites, type Echec, type Manifeste, type Releve, type Variante,
} from './lecteur';
import { ORDRE_QUESTIONS, POSES, etatLettre, poserMot, signes, texteQuestion, type Ancres, type Gabarit, type Mot, type Question } from './questions';
import { CADRAGES, INTRO, LOGO_ANGLE_FIN, type Cadrage } from './temps';
import './intro.css';

/**
 * Crochets de test (dev, ou drapeau des e2e posé par Playwright) : `?introT=13` place la vidéo à 13 s, en pause ;
 * `?introVariante=portrait-plein-60-av1` force la variante (Chromium headless mesure toujours 60 Hz et lit l'AV1).
 */
const E2E_FLAG = 'countrizz:e2e';
const hooks = (): boolean => { try { return import.meta.env.DEV || localStorage.getItem(E2E_FLAG) === '1'; } catch { return import.meta.env.DEV; } };
declare global {
  interface Window {
    __intro?: {
      /** Instant de la vidéo (s) qui règle les questions, l'accueil et le fondu. */
      t: number;
      /** La première image de la vidéo est affichée. */
      ready: boolean;
      skipped: boolean;
      variante: Pick<Variante, 'cadrage' | 'taille' | 'ips' | 'codec'> | null;
      echec: Echec | null;
      /** `performance.now()` à la première image (ms depuis le début de la navigation). */
      premiereImageMs: number | null;
    };
  }
}

/** Fondu de la vidéo vers le globe (s), de FONDU à FIN ; le titre de l'accueil apparaît au même rythme (LogoTitle). */
const FONDU_S = INTRO.FIN - INTRO.FONDU;

/**
 * Les questions telles que la page les a mesurées dans le calque (un `span` par signe, à la taille `POSES[cadrage].taille`,
 * px de la vidéo) : pour chaque mot, son gabarit et ses lettres dans l'ordre (blancs exclus), celui d'`etatLettre`.
 */
interface Mesure { cadrage: Cadrage; mots: { q: Question; g: Gabarit; lettres: HTMLElement[] }[] }

interface Props {
  /** Langue des questions (la vidéo est la même en français et en anglais). */
  lang: Lang;
  m: Messages;
  /** Le vrai globe est prêt : le fondu peut partir. */
  globeReady: boolean;
  /** `INTRO.ACCUEIL` : l'accueil se monte, son titre invisible (la vidéo le montre en pâte). */
  onHome(): void;
  /**
   * Le fondu part (`INTRO.FONDU`, globe prêt) : le globe reprend son rendu ; `angle` : celui de la Terre de la vidéo à cet
   * instant, d'où part la petite Terre du titre (null : accueil direct).
   */
  onFade(angle: number | null): void;
  /** Fin du fondu : l'intro peut être démontée ; `angle` : LOGO_ANGLE_FIN, ou null si elle a été abandonnée (accueil direct). */
  onDone(angle: number | null): void;
}

/**
 * Intro en vidéo précalculée (spec `2026-10-11-countrizz-intro-video-blender-design.md` §4-5) : un calque par-dessus le
 * globe ; l'affiche du cadrage tout de suite, puis la vidéo choisie (cadrage, cadence, codec : lecteur.ts), les questions
 * en HTML qui naissent de leurs objets (questions.ts), « Passer › ». Tout suit l'image affichée
 * (`requestVideoFrameCallback`, `currentTime` en repli) ; la vidéo ne se recharge jamais (rotation : seules les questions
 * se reposent). Globe pas prêt : la vidéo reste sur sa dernière image, l'accueil par-dessus. Tout échec mène à l'accueil
 * direct.
 */
export function Intro({ lang, m, globeReady, onHome, onFade, onDone }: Props) {
  const racine = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), calque = useRef<HTMLDivElement>(null);
  const mesure = useRef<Mesure | null>(null);
  const ready = useRef(globeReady);
  ready.current = globeReady;
  const skip = useRef(false);
  const cb = useRef({ onHome, onFade, onDone });
  cb.current = { onHome, onFade, onDone };
  // le cadrage de la fenêtre au montage : celui de l'affiche, et de la vidéo choisie au même instant (elle n'en change plus)
  const [cadrage] = useState<Cadrage>(() => choisirCadrage(innerWidth, innerHeight));
  // le repère des questions : celui de la vidéo chargée (le cadrage du montage, sauf variante forcée par ?introVariante)
  const [cadrageVideo, setCadrageVideo] = useState<Cadrage>(cadrage);

  // Les questions sont mesurées dans la page (les chasses de Chango) à la langue et au cadrage de la vidéo, puis de
  // nouveau quand la police est chargée (celle de repli n'a pas les mêmes) ; la boucle les pose pour l'écran et les anime.
  useEffect(() => {
    const couche = calque.current!;
    let vivant = true;
    const mesurer = () => {
      mesure.current = {
        cadrage: cadrageVideo,
        mots: ORDRE_QUESTIONS.map((q) => {
          const mot = couche.querySelector<HTMLElement>(`[data-question="${q}"]`)!, lettres = [...mot.querySelectorAll<HTMLElement>('.intro-lettre')];
          const g: Gabarit = { largeur: mot.offsetWidth, hauteur: mot.offsetHeight,
            lettres: lettres.map((l) => ({ x: l.offsetLeft + l.offsetWidth / 2, y: l.offsetTop + l.offsetHeight / 2, w: l.offsetWidth, h: l.offsetHeight })) };
          return { q, g, lettres };
        }),
      };
    };
    mesurer();
    const textes = ORDRE_QUESTIONS.map((q) => texteQuestion(lang, q)).join('');
    document.fonts.load(`${POSES[cadrageVideo].taille}px Chango`, textes).then(() => { if (vivant) mesurer(); }, () => {});
    return () => { vivant = false; };
  }, [lang, cadrageVideo]);

  useEffect(() => {
    const v = video.current!, el = racine.current!, couche = calque.current!;
    const q = hooks() ? new URLSearchParams(location.search) : null;
    const gele = q?.has('introT') ? Number(q.get('introT')) : null, forcee = q?.get('introVariante') ?? null;
    if (q) window.__intro = { t: 0, ready: false, skipped: false, variante: null, echec: null, premiereImageMs: null };
    const rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    let alive = true, raf = 0, finFondu = 0, image = false, tImage = 0, saute = false, home = false, fondu = false, done = false;
    let variantes: Variante[] = [], courante: Variante | null = null, ancres: Ancres | null = null, suivi = SUIVI_DEPART;
    // les questions posées pour l'écran (taille relevée à chaque image), et la dernière image écrite
    let poses: { mot: Mot; g: Gabarit; lettres: HTMLElement[] }[] = [], posees: Mesure | null = null, ecranPose = '';
    let ecrit: { t: number; poses: typeof poses } | null = null;

    /** Accueil direct (spec §4) : l'intro disparaît d'un coup, les lettres du titre surgissent. */
    const abandonner = (echec: Echec | null) => {
      if (done || fondu) return;
      done = true;
      if (echec) console.warn('intro abandonnée :', echec);
      if (window.__intro) window.__intro.echec = echec;
      v.pause();
      if (!home) { home = true; cb.current.onHome(); }
      cb.current.onFade(null);
      cb.current.onDone(null);
    };
    const premiere = () => {
      if (image) return;
      image = true;
      el.classList.add('intro--image');   // l'affiche s'efface : la vidéo montre la même image
      if (window.__intro) { window.__intro.ready = true; window.__intro.premiereImageMs = performance.now(); }
    };
    const surImage = (_: number, meta: VideoFrameCallbackMetadata) => {
      if (!alive) return;
      tImage = meta.mediaTime;
      premiere();
      v.requestVideoFrameCallback(surImage);
    };
    // play() rejeté parce que la page n'en a pas le droit (économie d'énergie d'iOS…) : accueil direct ; les autres refus
    // (source illisible, chargement interrompu) : l'événement « error » ou le compte des 8 s décident
    const lancer = () => {
      v.play().catch((e: unknown) => { if (alive && e instanceof DOMException && e.name === 'NotAllowedError') abandonner('lecture-refusee'); });
    };
    const charger = (x: Variante) => {
      courante = x;
      if (window.__intro) window.__intro.variante = { cadrage: x.cadrage, taille: x.taille, ips: x.ips, codec: x.codec };
      v.dataset.cadrage = x.cadrage;
      setCadrageVideo(x.cadrage);   // le repère des questions suit la vidéo
      v.src = x.src;
      if (gele !== null) v.addEventListener('loadedmetadata', () => { v.currentTime = gele; }, { once: true });
      else lancer();
    };
    // une variante en erreur avant sa première image : la suivante (l'autre codec) ; sinon, ou après : accueil direct
    const surErreur = () => {
      if (!alive || done || !courante) return;
      const suivante = image ? undefined : variantes[variantes.indexOf(courante) + 1];
      if (suivante) charger(suivante); else abandonner('erreur');
    };
    const surCalage = () => { if (gele !== null) premiere(); };   // ?introT : l'image demandée est prête
    // fin du fondu : quand la vidéo a fini de s'effacer (une image lente retarde la transition CSS, pas un minuteur) ;
    // sans transition (onglet caché…), au plus tard une seconde après
    const finir = () => { if (done) return; done = true; clearTimeout(finFondu); cb.current.onDone(LOGO_ANGLE_FIN); };
    const surTransition = (e: TransitionEvent) => { if (fondu && e.target === v && e.propertyName === 'opacity') finir(); };

    const releve = (): Releve => ({ ms: performance.now(), visible: !document.hidden, temps: v.currentTime, image,
      attendue: gele === null ? !fondu && !skip.current && !v.ended : !image });
    const surVisibilite = () => {
      ({ suivi } = suivreLecture(suivi, releve()));   // l'absence de l'onglet ne compte pas dans les 8 s
      // retour sur l'onglet : la vidéo que le navigateur a suspendue repart (un refus : accueil direct)
      if (!document.hidden && courante && gele === null && !skip.current && !fondu && !done && v.paused && !v.ended) lancer();
    };

    /**
     * Les questions à l'instant t (questions.ts). Écran ou mesure changés : le calque, dans le repère de la vidéo, est
     * reposé par un seul transform (`couverture`) et les mots ramenés dans la partie visible (`poserMot`). Puis chaque
     * lettre, depuis `etatLettre`, sans lecture de mise en page ; rien avant la première image, ni sans ancres.
     */
    const dessinerQuestions = (t: number) => {
      const me = mesure.current, ecran = { width: el.clientWidth, height: el.clientHeight }, cle = `${ecran.width}×${ecran.height}`;
      if (!me || ecran.width === 0 || ecran.height === 0) return;
      if (me !== posees || cle !== ecranPose) {
        posees = me;
        ecranPose = cle;
        const k = couverture(CADRAGES[me.cadrage], ecran, me.cadrage);
        couche.style.transform = `translate(${k.x}px, ${k.y}px) scale(${k.echelle})`;
        poses = me.mots.map((x) => ({ ...x, mot: poserMot(x.q, me.cadrage, x.g, ecran) }));
      }
      const a = ancres;
      if (!a || !image || (ecrit && ecrit.t === t && ecrit.poses === poses)) return;
      ecrit = { t, poses };
      for (const { mot, g, lettres } of poses) {
        lettres.forEach((l, i) => {
          const e = etatLettre(t, mot, i, a);
          if (!e) { l.style.opacity = '0'; return; }
          l.style.opacity = String(e.opacite);
          l.style.transform = `translate(${e.x - g.lettres[i].x}px, ${e.y - g.lettres[i].y}px) rotate(${e.rot}deg) scale(${e.echelle})`;
        });
      }
    };

    const boucle = () => {
      raf = requestAnimationFrame(boucle);
      if (done) return;
      if (skip.current && !image) { abandonner(null); return; }   // « Passer » avant la première image : accueil direct
      if (skip.current && !saute) {   // « Passer » : la vidéo saute à sa dernière image (le titre en pâte), puis le fondu
        saute = true;
        v.pause();
        if (Number.isFinite(v.duration)) v.currentTime = v.duration;
      }
      if (!image && !rvfc && gele === null && v.currentTime > 0) premiere();
      const t = skip.current || v.ended ? INTRO.FIN : gele ?? (rvfc && image ? tImage : v.currentTime);
      let echec: Echec | null;
      ({ suivi, echec } = suivreLecture(suivi, releve()));
      if (echec) { abandonner(echec); return; }
      if (!home && t >= INTRO.ACCUEIL) { home = true; cb.current.onHome(); }
      if (!fondu && (gele === null || skip.current) && t >= INTRO.FONDU && ready.current) {
        fondu = true;
        el.classList.add('intro--fondu');
        cb.current.onFade(angleTerre(t));
        finFondu = window.setTimeout(finir, FONDU_S * 1000 + 1000);
      }
      dessinerQuestions(t);
      if (window.__intro) { window.__intro.t = t; window.__intro.skipped = skip.current; }
    };

    const demarrer = async () => {
      const json = <T,>(u: string) => fetch(u).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
      const [manifeste, a, intervalle] = await Promise.all([json<Manifeste>('/video/videos.json'), json<Ancres>('/intro/ancres.json'), mesurerIntervalle((f) => requestAnimationFrame(f))]);
      if (!alive || done) return;
      ancres = a;   // sans ancres, la vidéo se lit sans questions
      if (!manifeste) { abandonner('erreur'); return; }
      const caps: Capacites = { canPlayType: (t) => v.canPlayType(t), decodingInfo: navigator.mediaCapabilities ? (c) => navigator.mediaCapabilities.decodingInfo(c) : undefined };
      variantes = forcee !== null ? manifeste.variantes.filter((x) => idVariante(x) === forcee) : await choisirVariantes(manifeste, cadrage, intervalle, caps);
      if (!alive || done) return;
      if (variantes.length === 0) abandonner('aucun-codec');
      else charger(variantes[0]);
    };

    v.defaultMuted = true;   // muette : lecture sans geste de l'utilisateur (iOS, Chrome)
    v.muted = true;
    v.dataset.cadrage = cadrage;
    if (rvfc && gele === null) v.requestVideoFrameCallback(surImage);   // une seule chaîne, d'une source à l'autre
    v.addEventListener('error', surErreur);
    v.addEventListener('seeked', surCalage);
    v.addEventListener('transitionend', surTransition);
    document.addEventListener('visibilitychange', surVisibilite);
    raf = requestAnimationFrame(boucle);
    void demarrer();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(finFondu);
      document.removeEventListener('visibilitychange', surVisibilite);
      v.removeEventListener('error', surErreur);
      v.removeEventListener('seeked', surCalage);
      v.removeEventListener('transitionend', surTransition);
      v.pause();
      v.removeAttribute('src');
      v.load();
      el.classList.remove('intro--image', 'intro--fondu');
    };
  }, [cadrage]);

  return (
    <div className="intro" ref={racine} style={{ '--fondu': `${FONDU_S.toFixed(2)}s` } as CSSProperties}>
      <video ref={video} className="intro-video" muted playsInline preload="auto" disablePictureInPicture disableRemotePlayback aria-label={m.intro.videoLabel} />
      <img className="intro-affiche" data-cadrage={cadrage} src={`/intro/affiche-${cadrage}.webp`} alt="" aria-hidden="true" />
      <div className="intro-questions" ref={calque} data-cadrage={cadrageVideo} aria-hidden="true"
        style={{ width: CADRAGES[cadrageVideo].width, height: CADRAGES[cadrageVideo].height, fontSize: POSES[cadrageVideo].taille }}>
        {ORDRE_QUESTIONS.map((q) => (
          <div key={q} className={`intro-question intro-question--${q}`} data-question={q}>
            {signes(texteQuestion(lang, q)).map((s, i) => <span key={i} className={s.blanc ? 'intro-blanc' : 'intro-lettre'}>{s.c}</span>)}
          </div>
        ))}
      </div>
      <button type="button" className="intro-passer" onClick={() => { skip.current = true; if (window.__intro) window.__intro.skipped = true; }}>{m.intro.skip}</button>
    </div>
  );
}
```

Remplacer tout le contenu de `web/src/intro/intro.css` par :

```css
/* Calque de l'intro, par-dessus le globe ; l'accueil se monte par-dessus lui. La vidéo (nuit comprise) s'efface au fondu. */
.intro { position: absolute; inset: 0; overflow: hidden; font-family: var(--cartoon); pointer-events: none; }
.intro > * { pointer-events: auto; }
/* Vidéo et affiche (sa première image) : plein écran, bords rognés ; portrait calé en haut, paysage centré (D8). L'affiche
   couvre la vidéo jusqu'à sa première image. Le cadrage est posé par Intro.tsx (data-cadrage). */
.intro-video, .intro-affiche { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; object-position: 50% 50%; background: var(--nuit); }
.intro-video[data-cadrage="portrait"], .intro-affiche[data-cadrage="portrait"] { object-position: 50% 0; }
.intro--image .intro-affiche { visibility: hidden; }
/* Fondu vers le globe, de FONDU à FIN (--fondu, posé par Intro.tsx) ; le titre de l'accueil apparaît au même rythme. */
.intro-video, .intro-affiche, .intro-passer { transition: opacity var(--fondu) ease-in-out; }
.intro--fondu .intro-video, .intro--fondu .intro-affiche, .intro--fondu .intro-passer { opacity: 0; pointer-events: none; }

/* Questions (spec §5) : trois mots en Chango jaune, avec l'ombre du titre de l'accueil (--ombre-titre, -6px 4px 2px sur
   54 px, ici en em : à l'échelle des lettres). Le calque est dans le repère de la vidéo (taille et police posées par
   Intro.tsx), posé sur l'écran par un seul transform (couverture, D8) ; chaque lettre y est posée à chaque image autour
   de son centre (questions.ts : etatLettre). Le blanc (U+202F) ne fait que l'espace. */
.intro-questions { position: absolute; left: 0; top: 0; transform-origin: 0 0; color: var(--jaune); line-height: 1; pointer-events: none; }
.intro-question { position: absolute; left: 0; top: 0; white-space: nowrap; }
.intro-lettre, .intro-blanc { display: inline-block; }
.intro-lettre { opacity: 0; transform-origin: 50% 50%; text-shadow: -0.11em 0.075em 0.035em rgb(11, 13, 15); }
.intro-passer { position: absolute; right: 16px; bottom: calc(34px + env(safe-area-inset-bottom, 0px)); background: rgba(22, 23, 58, .7); color: var(--jaune); border: 2px solid #000; box-shadow: 3px 3px 0 #000; padding: 6px 12px; font: 14px var(--cartoon); cursor: pointer; transform: skewX(-15deg); }
.intro-passer:focus-visible { outline: 3px solid var(--jaune); outline-offset: 3px; }
```

- [ ] **Step 8 : suppressions.** La scène three.js de l'intro, sa boîte (`INTRO_EUROPE` a déménagé dans `scripts/intro/lib/peinture.ts` à la Task 2, qui a laissé `boxes.ts` à `scene.ts`), la chronologie gelée pour elle (`timeline-v1.ts`, Task 1), la fabrication du sprite par capture (Blender le rend, Task 5/7) et les textures servies :

```bash
git rm -q web/src/intro/scene.ts web/src/intro/boxes.ts web/src/intro/timeline-v1.ts web/scripts/intro/build-logo-sprite.mjs
git rm -q web/public/intro/monde.jpg web/public/intro/europe.jpg web/public/intro/relief.jpg web/public/intro/relief-fin.jpg web/public/intro/france.json
```

Dans `web/e2e/intro.spec.ts`, supprimer la ligne `import { PNG } from 'pngjs';` et le test entier :

```ts
test('image figée à 5 s : la Terre en pâte est dessinée au centre', async ({ page }) => {
  await page.goto('/?webgl&introT=5');
  await page.waitForFunction(() => window.__intro?.ready === true && window.__intro.frames > 2, null, { timeout: 120_000 });
  const png = PNG.sync.read(await page.screenshot());
  const i = (Math.floor((470 / 844) * png.height) * png.width + Math.floor(png.width / 2)) * 4;
  const [r, g, b] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  // le fond de l'intro est #16173a (22, 23, 58) : au centre du disque, il y a de la pâte
  expect(Math.abs(r - 22) + Math.abs(g - 23) + Math.abs(b - 58)).toBeGreaterThan(60);
});
```

Contrôle (plus aucun import des fichiers supprimés). Run :

```bash
cd web && node -e '
const fs = require("fs"), walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
const motifs = [/from ["\x27][^"\x27]*\/(scene|boxes|timeline-v1)["\x27]/, /build-logo-sprite/];
for (const f of [...walk("src"), ...walk("scripts"), ...walk("e2e"), ...walk("e2e-budget"), "package.json"].filter((f) => /\.(ts|tsx|mjs|json)$/.test(f)))
  fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (motifs.some((m) => m.test(l))) console.log(`${f}:${i + 1}: ${l.trim()}`); });
console.log("fin du relevé");'
```

Expected : la seule ligne `fin du relevé`.

- [ ] **Step 9 : vérifier types, tests et build.** Run : `cd web && npm run check`. Expected : `tsc` sans erreur ; toutes les suites unitaires vertes (dont `i18n.test.ts` 10, `pwa.test.ts` 11, `lecteur.test.ts` 25, `questions.test.ts` 14 ; au plan, sur une copie qui porte les Tasks 1 à 10 : `Test Files  71 passed (71)`, `Tests  442 passed (442)`).

Run : `cd web && npm run build`. Expected : build réussi, sans l'avertissement « without a file extension » ; la ligne `precache  N entries` ne compte aucune vidéo (au plan, sur la copie des Tasks 1 à 10 : `precache  29 entries (2595.39 KiB)`, avec comme sans `public/video/` ; `precache  26 entries` avant le Step 6 : le chargement à part du globe sépare les morceaux communs à App et à GlobeView).

Run (D15 : la page ne charge d'emblée ni le globe ni ses textures ; noms des morceaux sans leur empreinte) :

```bash
cd web && node -e 'const s=require("fs").readFileSync("dist/index.html","utf8");console.log((s.match(/(src|href)="\/assets\/[^"]+\.js"/g)||[]).map((x)=>x.replace(/^(src|href)="\/assets\//,"").replace(/-[\w-]{8}\.js"$/,"")).join(" "))'
```

Expected : `main LoadErrorCard modulepreload-polyfill client` (noms donnés par le bundler aux morceaux communs ; au plan, le même build avant le Step 6 donnait `main rolldown-runtime textures GlobeView`).

Run (spec §1 : l'intro ne charge plus aucun moteur 3D ; aucun de ces fichiers n'importe `timeline.ts` — `angleTerre` est dans `lecteur.ts`, sur `LOGO_ANGLE_FIN` ; les instants des questions sont recopiés dans `questions.ts` et confrontés à `frameAt` par ses tests seulement —, le contrôle porte donc sur three, R3F et la chronologie) :

```bash
cd web && node -e '
const fs = require("fs");
for (const f of ["src/intro/Intro.tsx", "src/intro/lecteur.ts", "src/intro/questions.ts", "src/intro/temps.ts", "src/intro/videos.ts", "src/ui/LogoTitle.tsx"])
  fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (/from ["\x27](three(\/[\w/]+)?|@react-three\/[\w-]+|\.\/timeline|\.\.\/intro\/timeline)["\x27]/.test(l)) console.log(`${f}:${i + 1}: ${l.trim()}`); });
console.log("intro sans moteur 3D");'
```

Expected : la seule ligne `intro sans moteur 3D`. (Le même contrôle sur `Intro.tsx`, `scene.ts` et `LogoTitle.tsx` d'avant le plan relève `Intro.tsx:4` (`./timeline`), `scene.ts:1`, `:2` (`three/webgpu`, `three/tsl`), `:7` et `LogoTitle.tsx:2` (`../intro/timeline`) : il mord.)

Run (les routes du service worker construit n'attrapent pas `/video/`) :

```bash
cd web && node -e '
const s = require("fs").readFileSync("dist/sw.js", "utf8"), routes = s.match(/registerRoute\(\/[^,]+/g).map((x) => eval(x.slice(14)));
console.log(routes.map(String).join("  "));
for (const u of ["https://countrizz.fr/video/intro-portrait-60.av1.mp4", "https://countrizz.fr/video/videos.json", "https://countrizz.fr/intro/ancres.json"]) console.log(u, routes.map((r) => r.test(u)).join(" "));'
```

Expected :

```
/\/(textures|basis|intro|fonts|icons)\/[^/]+$/  /\/data\/(patches|flags)\//  /\/data\/[a-z]+\.json$/
https://countrizz.fr/video/intro-portrait-60.av1.mp4 false false false
https://countrizz.fr/video/videos.json false false false
https://countrizz.fr/intro/ancres.json true false false
```

- [ ] **Step 10 : nginx.** `deploy/web/nginx.conf` : Remplacer :

```nginx
    # Noms fixes (patchs, textures, drapeaux, données, transcodeur, textures de l'intro, police, icônes) : cache court,
    # revalidé par ETag. Sur l'appareil, le service worker les garde (caches nommés par l'empreinte de leur contenu).
    location ~ ^/(data|textures|basis|intro|fonts|icons)/ { add_header Cache-Control "public, max-age=3600, must-revalidate"; try_files $uri =404; }
```

par :

```nginx
    # Noms fixes (patchs, textures, drapeaux, données, transcodeur, affiches et ancres de l'intro, vidéos de l'intro, police,
    # icônes) : cache court, revalidé par ETag. Sur l'appareil, le service worker les garde (caches nommés par l'empreinte de
    # leur contenu) — sauf les vidéos (/video/), lues en flux par plages d'octets (206), que nginx sert telles quelles.
    location ~ ^/(data|textures|basis|intro|video|fonts|icons)/ { add_header Cache-Control "public, max-age=3600, must-revalidate"; try_files $uri =404; }
```

Run (depuis la racine du dépôt ; l'image est celle du Dockerfile ; `web/public/video/` contient les vidéos de la Task 8) :

```bash
docker run -d --rm --name countrizz-nginx-essai -p 5646:8080 -v "$PWD/deploy/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/web/public:/usr/share/nginx/html:ro" nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
docker exec countrizz-nginx-essai nginx -t
curl -s -D - -o /dev/null -H 'Range: bytes=0-99' http://localhost:5646/video/intro-portrait-60.av1.mp4
docker stop countrizz-nginx-essai
```

Expected : `nginx: configuration file /etc/nginx/nginx.conf test is successful` ; puis `HTTP/1.1 206 Partial Content`, `Content-Type: video/mp4`, `Cache-Control: public, max-age=3600, must-revalidate`, `Content-Range: bytes 0-99/<taille du fichier>`.

- [ ] **Step 11 : calque des vidéos dans l'image.** Remplacer tout le contenu de `deploy/scripts/stage-image.mjs` par :

```js
// Prépare .image-staging/ pour deploy/web/Dockerfile : site/ (dist sans les patchs image ni les vidéos), video/ (vidéos de
// l'intro et leur manifeste), puis img-<taille>/ par résolution (un calque Docker chacun, < 150 Mo). Refuse de continuer si
// un patch manque ou diffère de imagery.json, ou si les vidéos ne tiennent pas dans un calque.
// Usage : node deploy/scripts/stage-image.mjs [--dist web/dist] [--imagery web/public/data/imagery.json] [--out .image-staging]
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { verifierPatchs } from './patchs.mjs';

const arg = (nom, defaut) => { const i = process.argv.indexOf(nom); return i > 0 ? process.argv[i + 1] : defaut; };
const dist = arg('--dist', 'web/dist');
const index = JSON.parse(readFileSync(arg('--imagery', 'web/public/data/imagery.json'), 'utf8'));
const out = arg('--out', '.image-staging');
const img = join(dist, 'data/patches/img');
const video = join(dist, 'video');
/** Les envois de calques de plus de 150 Mo échouent. */
const CALQUE_MAX = 150_000_000;

const { attendus, erreurs } = verifierPatchs(img, index);
if (erreurs.length) {
  console.error(`Patchs image : ${erreurs.length} problème(s) sur ${attendus} fichiers attendus :\n  ${erreurs.slice(0, 20).join('\n  ')}`);
  process.exit(1);
}
const videos = existsSync(video) ? readdirSync(video) : [];
const octetsVideo = videos.reduce((s, f) => s + statSync(join(video, f)).size, 0);
if (octetsVideo >= CALQUE_MAX) {
  console.error(`Vidéos de l'intro : ${octetsVideo} octets, au-delà d'un calque (${CALQUE_MAX}) : les répartir sur deux calques.`);
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync(dist, join(out, 'site'), { recursive: true, filter: (src) => !src.startsWith(img) && !src.startsWith(video) });
// les vidéos de l'intro : leur propre calque (elles ne changent qu'avec un nouveau rendu)
mkdirSync(join(out, 'video'), { recursive: true });
for (const f of videos) copyFileSync(join(video, f), join(out, 'video', f));
console.log(`video : ${videos.length} fichiers, ${octetsVideo} octets`);
for (const taille of index.sizes) {
  const d = join(out, `img-${taille}`);
  mkdirSync(d, { recursive: true });
  for (const f of readdirSync(img).filter((n) => n.endsWith(`-${taille}.ktx2`))) copyFileSync(join(img, f), join(d, f));
  const total = readdirSync(d).reduce((s, f) => s + statSync(join(d, f)).size, 0);
  console.log(`img-${taille} : ${readdirSync(d).length} fichiers, ${total} octets`);
}
console.log(`Patchs image vérifiés : ${attendus} fichiers conformes à imagery.json.`);
```

Remplacer tout le contenu de `deploy/web/Dockerfile` par :

```dockerfile
# Image du site Countrizz. Construite SUR LE MAC (arm64) par deploy/scripts/build-image.sh, à partir de
# .image-staging/ préparé par deploy/scripts/stage-image.mjs : site/ (dist sans les patchs image ni les vidéos), video/
# (vidéos de l'intro), puis un dossier par résolution de patchs, chacun dans son propre calque (< 150 Mo : les envois de
# calques plus gros échouent).
FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY .image-staging/site/ /usr/share/nginx/html/
COPY .image-staging/video/ /usr/share/nginx/html/video/
COPY .image-staging/img-1024/ /usr/share/nginx/html/data/patches/img/
COPY .image-staging/img-2048/ /usr/share/nginx/html/data/patches/img/
USER 101
EXPOSE 8080
```

Run (refus d'un calque trop gros, sur un dossier temporaire) :

```bash
D=$(mktemp -d) && mkdir -p "$D/dist/video" && node -e 'require("fs").writeFileSync(process.argv[1], ""); require("fs").truncateSync(process.argv[1], 150_000_000)' "$D/dist/video/grosse.mp4" && echo '{"sizes":[],"countries":{}}' > "$D/imagery.json" && node deploy/scripts/stage-image.mjs --dist "$D/dist" --imagery "$D/imagery.json" --out "$D/staging"; echo "exit=$?"; rm -rf "$D"
```

Expected : `Vidéos de l'intro : 150000000 octets, au-delà d'un calque (150000000) : les répartir sur deux calques.` puis `exit=1`.

Run (vrai `dist`, patchs image du Mac compris ; après le build du Step 9) :

```bash
node deploy/scripts/stage-image.mjs && test ! -e .image-staging/site/video && echo 'site sans vidéo'; rm -rf .image-staging
```

Expected : `video : 11 fichiers, <N> octets` (les 10 vidéos et `videos.json` ; N < 150000000), les lignes `img-1024 : …` et `img-2048 : …` habituelles, `Patchs image vérifiés : …`, puis `site sans vidéo`. (La construction de l'image elle-même est à la Task 12.)

- [ ] **Step 12 : commit.**

```bash
git add web/src/i18n/types.ts web/src/i18n/fr.ts web/src/i18n/en.ts web/src/i18n/i18n.test.ts web/src/pwa/motifs.ts web/src/pwa/cache.ts web/src/pwa/pwa.test.ts web/vite.config.ts web/tsconfig.json web/src/ui/LogoTitle.tsx web/src/ui/Home.tsx web/src/ui/home.css web/src/app/App.tsx web/src/globe/LoadErrorCard.tsx web/src/globe/GlobeView.tsx web/src/intro/Intro.tsx web/src/intro/intro.css web/e2e/intro.spec.ts deploy/web/nginx.conf deploy/web/Dockerfile deploy/scripts/stage-image.mjs
git commit -m "intro : lecteur vidéo (questions nées de leurs objets, fondu, relais de la petite Terre), code du globe chargé à part (D15), scène three.js et textures servies retirées, vidéos hors du service worker, calque d'image — spec intro vidéo §4-6"
```

---

### Task 11 : e2e et budget de l'intro vidéo

**Files:**
- Modify: `web/e2e/intro.spec.ts` (réécrit), `web/e2e/pwa.spec.ts` (réécrit), `web/e2e/deployed.ts`, `web/e2e-budget/first-load.spec.ts` (réécrit)

**Interfaces:**
- Consumes :
  - `web/src/intro/temps.ts` (Task 1) : `CADRAGES`, `INTRO`, `INTRO_GIVE_UP_MS`, `LOGO_ANGLE_FIN`, `LOGO_TOUR_S`, `type Cadrage` ;
  - `web/src/intro/videos.ts` (Task 7) : `type Manifeste`, `idVariante` ;
  - `web/src/intro/lecteur.ts` (Task 9) : `couverture`, `versEcran` ;
  - `web/src/intro/questions.ts` (Task 9) : `ORDRE_QUESTIONS`, `QUESTIONS`, `RETOUR`, `MARGE_QUESTION`, `ancreQuestion`, `etatLettre`, `poserMot`, `type Ancres`, `type Question` ;
  - `web/src/i18n` (Task 10) : `messages[lang].modes`, `messages.fr.intro.videoLabel` ;
  - crochets et DOM de la Task 10 : `window.__intro = { t, ready, skipped, variante, echec, premiereImageMs }` (`ready` : première image affichée ; `premiereImageMs` : `performance.now()` à cet instant), `?introT=`, `?introVariante=<idVariante>` ; `.intro`, `.intro video` (`object-fit: cover`, portrait calé en haut par `data-cadrage`), `.intro img[src$="/intro/affiche-<cadrage>.webp"]`, le calque `.intro .intro-questions[data-cadrage]` (cadrage de la vidéo chargée ; style `transform: translate(<x>px, <y>px) scale(<échelle>)`, celui de `couverture`), ses mots `.intro-question--capitale|--pays|--drapeau[data-question]` dans l'ordre `ORDRE_QUESTIONS`, un `span` par signe (`.intro-lettre`, ou `.intro-blanc` pour U+202F), l'opacité et le transform de chaque lettre écrits d'après `etatLettre` (opacité 0 quand il rend null) ; bouton « Passer › » / « Skip › » ; `aria-label` de la vidéo (`intro.videoLabel`), `aria-hidden="true"` sur l'affiche et sur le calque des questions ; titre de l'accueil `.accueil-titre.logo-titre--fondu|--pop` (+ `.logo-titre--visible`), animation `logo-fondu` de durée `FIN − FONDU`, lettres `.logo-l` (animation `logo-lettre` en « pop », aucune en fondu), petite Terre `.logo-terre` (`animation-delay` = −angle / 2π × `LOGO_TOUR_S`) ; code du globe chargé à part (D15) : `/src/globe/GlobeView.tsx` en dev, `/assets/GlobeView-<empreinte>.js` en production, carte « Réessayer » s'il manque ; vidéos hors des motifs du service worker (`web/src/pwa/motifs.ts`, D1) ;
  - fichiers versionnés : `web/public/video/videos.json` (Task 8), `web/public/intro/ancres.json` (Task 3), `web/e2e-budget/plafonds-video.json` (Task 8 : `{ "version": 1, "regle": …, "plafonds": { "<src>": <octets max> } }`) ; `deploy/web/nginx.conf` (Task 10 : `/video/` dans la location des noms fixes).
- Produces :
  - `web/e2e-budget/first-load.spec.ts` : `FIRST_LOAD_BUDGET = { standard: 8_000_000, demarrage: 1_000, affiche: 100_000, accueil: 12_000_000 }` (`intro: 3_000_000` disparaît) et `RESEAUX` (`'bonne connexion'`, bornée ; `'Fast 4G'`, mesurée) ;
  - `web/e2e/deployed.ts` : `checkVideos(baseURL: string, root = 'public'): Promise<void>`, appelée par `checkDeployed` ; `SHARED` compte aussi `video/videos.json` et `intro/ancres.json` (intro.spec.ts contrôle les questions d'après eux).

Choix de cette tâche (pour le relecteur) :
- Chromium headless mesure toujours 60 Hz et lit l'AV1 : les parcours forcent `portrait-plein-60-av1` (ou `paysage-plein-60-av1`), sauf deux qui contrôlent le choix lui-même (cadrage selon la fenêtre, 60 i/s). La vidéo se lit en temps réel sous SwiftShader (décodée hors du GPU) : deux parcours vont au bout sans « Passer ».
- Questions, figées par `?introT=` aux instants nés des objets (`QUESTIONS`, `RETOUR`) : avant « Capitale ? » (11,12 s), chaque mot en plein envol (11,5, 11,9 et 13,43 s), les trois posés (14,5 s), le retour en cours (15,95 s), après le second dézoom (16,4 s) ; en FR et en EN.
  - L'état attendu de chaque lettre vient d'`etatLettre` à l'instant affiché (`__intro.t`), sur le mot que `poserMot` pose d'après le gabarit relu dans la page (`offset*`, px de la vidéo, comme `Intro.tsx` le mesure). Le centre de la lettre à l'écran doit être `versEcran` de cet état, à 1,5 px vidéo près (les `offset*` sont entiers). Relevé le 12/10 sur le worktree d'essai, par une copie de ce fichier qui note les écarts (hors plan) : 0,92 px CSS d'écart au plus, pour 2,25 px admis à cette échelle (41 % de la tolérance au plus).
  - En vol, la lettre est entre l'ancre convertie de son objet (`ancreQuestion`, `versEcran`) et sa place de repos, saut compris ; à mi-vol, la première lettre est à plus de 10 px CSS de l'un et de l'autre (au plan, sur les fonctions pures et le gabarit de Chango du test unitaire : 35 px au moins sur le téléphone).
  - Le calque : son `data-cadrage`, et son transform comparé à `couverture` (Chromium le relit à 6 chiffres significatifs ; écarts relevés de la même façon le 12/10 : 2,5e-6 en relatif sur l'échelle pour 1e-5 admis, 2,3e-8 px sur la translation pour 0,01). Quand l'écran grandit, des mots qui n'ont pas été reposés restent dans l'écran, et seul le transform le montre (mesuré le 12/10 sur la Task 10 : à 768 × 1024, le calque resté à `scale(0.361111)` garde les mots dedans).
  - Deux contrôles ne doivent rien à `questions.ts`, pour qu'une erreur de ce module ne se cache pas dans l'oracle : le texte (le catalogue `modes.*`, plus la typographie écrite dans la spec) et « entier dans l'écran » (les boîtes des lettres d'un mot posé, à 8 px des bords, 1 px admis ; au plan, sur les fonctions pures, 12,1 px au moins sur les écrans du Review Focus ; relevé à l'e2e le 12/10 : 11,98 px au moins, sur les 40 mots posés que voient les tests des questions, des trois écrans et de la rotation).
  - Une contre-épreuve (Step 3) montre que ces contrôles mordent.
- Onglet caché : Chromium headless ne cache jamais une page (sondé le 11/10 : `visibilityState` reste `visible` derrière un autre onglet, en shell comme en `channel: 'chromium'`) ; un script d'init fait ce que fait le navigateur (`document.hidden`, l'évènement, rAF suspendu, vidéo suspendue puis relancée), les minuteurs continuent comme dans un vrai onglet caché. Dans « onglet caché pendant la lecture », le script ne relance pas la vidéo (`__onglet(false, false)`) : la reprise doit venir d'`Intro.tsx` (contre-épreuve e).
- Titre de l'accueil (D5) : l'opacité calculée et l'animation sont lues (`toBeVisible` tient pour visible un élément à `opacity: 0`) ; le globe retenu (textures en attente) garde l'accueil sous la vidéo, titre à 0, puis le fondu ; « Passer » met la vidéo sur sa dernière image, la petite Terre part donc de `LOGO_ANGLE_FIN`. Accueil direct : lettres en « pop ».
- Échecs : chacun de ceux du §4 mène à l'accueil direct, « aucun codec » compris (MediaCapabilities et `canPlayType` remplacés par un script d'init) ; le code du globe introuvable (D15) prend le chemin du globe en échec, jamais la page blanche (contre-épreuve f).
- Réseau qui cale : le serveur (route) ne sert que les octets jusqu'au milieu de la vie des questions, de la naissance de « Capitale ? » au retour (11,22 et 15,6 s : calage vers 13,4 s si le débit était régulier), la suite jamais. Le test vérifie les questions à l'image arrêtée, quel que soit l'instant (il est noté en annotation), puis que ni le calque ni aucune lettre ne bougent pendant 2 s. Relevé le 12/10 sur les vidéos de l'aperçu de la Task 7 (annotation lue par le rapporteur JSON) : `vidéo calée à 11.983333 s`, soit, d'après les fonctions pures, les 9 lettres de « Capitale ? » et 3 de « Pays ? » ; les vidéos de la Task 8 déplaceront cet instant.
- Démarrage (spec §7 « première image en < 1 s sur une bonne connexion ») : « bonne connexion » = 40 ms de latence par requête et 10 Mbit/s (les chiffres de `desktopDense4G` de Lighthouse, réseau fixe), bornée à 1 000 ms ; « Fast 4G » des DevTools (165 ms, 8,1 Mbit/s) mesurée, pas bornée. Une visite d'échauffement puis la médiane de trois : la première visite d'un navigateur neuf coûte 1,3 à 2 s de plus (au plan, avant D15 : 2971 et 2558 ms au lieu de ~960 sous « bonne connexion », 1592 au lieu de ~270 sans émulation). Affiche : 100 000 octets (moins d'un dixième de seconde de bonne connexion).
- Plafonds par vidéo : ceux de la Task 8 (`plafonds-video.json`), comparés à la taille servie (HEAD) et à `octets` du manifeste servi. Total de l'accueil : les `.mp4` de `/video/` hors budget (spec §7), `videos.json` compté.

- [ ] **Step 1 : réécrire les e2e de l'intro.** Remplacer tout le contenu de `web/e2e/intro.spec.ts` par :

```ts
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { messages } from '../src/i18n';
import { couverture, versEcran } from '../src/intro/lecteur';
import { MARGE_QUESTION, ORDRE_QUESTIONS, QUESTIONS, RETOUR, ancreQuestion, etatLettre, poserMot, type Ancres, type Question } from '../src/intro/questions';
import { CADRAGES, INTRO, INTRO_GIVE_UP_MS, LOGO_ANGLE_FIN, LOGO_TOUR_S, type Cadrage } from '../src/intro/temps';
import { idVariante, type Manifeste } from '../src/intro/videos';

/**
 * Intro en vidéo précalculée (spec `2026-10-11-countrizz-intro-video-blender-design.md` §4, §5, §8). La vidéo est décodée
 * hors du GPU logiciel : elle se lit en temps réel, deux parcours la laissent aller au bout. Chromium headless mesure
 * toujours ~60 Hz et lit l'AV1 : les parcours forcent leur variante (`?introVariante=`, crochets e2e), sauf ceux qui
 * contrôlent le choix lui-même. Les questions se contrôlent à des instants figés (`?introT=`) contre
 * `public/intro/ancres.json` et les fonctions pures des questions (`poserMot`, `etatLettre`, `versEcran`) : le site doit
 * servir les fichiers de ce dépôt (e2e/deployed.ts).
 */
test.slow(true, 'SwiftShader : le globe se charge lentement sous la vidéo');
test.use({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });

const manifeste = JSON.parse(readFileSync('public/video/videos.json', 'utf8')) as Manifeste;
const ancres = JSON.parse(readFileSync('public/intro/ancres.json', 'utf8')) as Ancres;
/** Variantes forcées : AV1 à 60 i/s, celle que Chromium headless reçoit (D3, D6), sans dépendre de sa mesure. */
const VARIANTE: Record<Cadrage, string> = { portrait: 'portrait-plein-60-av1', paysage: 'paysage-plein-60-av1' };
/**
 * Texte attendu de chaque question : `modes.*` du catalogue, suivi de la typographie de la langue. Elle est écrite ici,
 * et non prise à `questions.ts`, puisque c'est elle qu'on contrôle : en français une espace fine insécable (U+202F)
 * avant « ? », en anglais « ? » collé.
 */
const MODE = { capitale: 'capital', pays: 'country', drapeau: 'flag' } as const;
const POINT = { fr: ' ?', en: '?' } as const;
/** Lettres de chaque mot (blancs exclus), dans l'ordre des questions. */
const LETTRES = { fr: [9, 5, 8], en: [8, 8, 5] } as const;
/**
 * La page mesure le centre au repos de chaque lettre en `offset*`, qui sont entiers : il est donc connu à 0,75 px vidéo
 * près. On l'admet à 1,5 px vidéo, plus un quart de px CSS.
 */
const ECART_VIDEO = 1.5;
/** Un mot posé reste à 8 px CSS des bords (spec §5) ; on admet 1 px pour la mesure entière des lettres. */
const BORD = MARGE_QUESTION - 1;

const accueil = (page: Page) => page.locator('.accueil .accueil-titre');
const credit = (page: Page) => page.getByRole('contentinfo', { name: 'Crédits de l’imagerie' });
const passer = (page: Page) => page.getByRole('button', { name: /Passer|Skip/ });
const intro = (page: Page) => page.evaluate(() => window.__intro!);
const uneImage = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Instants figés sur la grille de 1/60 s (la vidéo à 60 i/s). */
const grille = (t: number) => Math.round(t * 60) / 60;
/** Avant la naissance de « Capitale ? » (le point touche Paris à 11,22 s) : aucune lettre. */
const AVANT = grille(QUESTIONS.capitale.naissance - 0.1);
/** Chaque mot en plein envol : sa première lettre à mi-vol, entre son objet et sa place. */
const ENVOL = Object.fromEntries(ORDRE_QUESTIONS.map((q) => [q, grille(QUESTIONS[q].naissance + QUESTIONS[q].vol / 2)])) as Record<Question, number>;
/** Les trois mots posés (la dernière lettre de « Drapeau ? » se pose à 14,12 s), avant le retour (RETOUR, 15,6 s). */
const TOUS_POSES = grille(14.5);
/** Le retour dans les objets, en cours. */
const RENTRENT = grille(RETOUR + 0.35);
/** Second dézoom (16,4 s) : toutes les lettres sont rentrées. */
const APRES = grille(16.4);

/**
 * Une passe de scène par trame de three (skill threejs-r186-webgpu-tsl, règle 3) : un second rendu dans la même trame montre
 * une image périmée. Le globe compte ces rendus ; après quelques images rendues, il n'y en a aucun.
 */
async function expectNoStaleFrame(page: Page) {
  await page.waitForFunction(() => (window.__globe?.frames ?? 0) > 5, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__globe?.staleFrames)).toBe(0);
}

/**
 * `?introT=` : la vidéo posée à t, en pause, son image affichée ; police chargée (Intro.tsx mesure de nouveau les
 * questions quand Chango arrive) et une image de plus pour leur pose.
 */
async function figee(page: Page, t: number) {
  await page.waitForFunction((t) => window.__intro?.ready === true && Math.abs(window.__intro.t - t) < 0.05, t, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await uneImage(page);
}

/** La vidéo couvre tout l'écran (rognage `cover`, portrait calé en haut — D8) : aucune bande vide. */
async function couvre(page: Page, cadrage: Cadrage) {
  const { width, height } = page.viewportSize()!;
  const v = await page.locator('.intro video').evaluate((el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return { gauche: r.left, haut: r.top, droite: r.right, bas: r.bottom, fit: s.objectFit, pos: s.objectPosition };
  });
  expect(v.gauche).toBeLessThanOrEqual(0);
  expect(v.haut).toBeLessThanOrEqual(0);
  expect(v.droite).toBeGreaterThanOrEqual(width);
  expect(v.bas).toBeGreaterThanOrEqual(height);
  expect(v.fit).toBe('cover');
  expect(v.pos).toMatch(cadrage === 'portrait' ? /^50% 0(%|px)?$/ : /^50% 50%$/); // valeur calculée : « 50% 0px » pour « 50% 0 »
}

/**
 * Ce que la page montre des questions, lu d'un coup. Le calque d'abord. Puis, pour chaque mot, son texte, son gabarit
 * mesuré comme Intro.tsx le mesure (`offset*` : px de la vidéo, le transform du calque n'y entre pas) et chaque lettre
 * à l'écran.
 */
const lire = (page: Page) => page.locator('.intro .intro-questions').evaluate((c: HTMLElement) => ({
  cadrage: c.dataset.cadrage,
  transform: c.style.transform,
  mots: [...c.querySelectorAll<HTMLElement>('.intro-question')].map((m) => {
    const ls = [...m.querySelectorAll<HTMLElement>('.intro-lettre')];
    return {
      q: m.dataset.question,
      texte: m.textContent,
      g: { largeur: m.offsetWidth, hauteur: m.offsetHeight, lettres: ls.map((l) => ({ x: l.offsetLeft + l.offsetWidth / 2, y: l.offsetTop + l.offsetHeight / 2, w: l.offsetWidth, h: l.offsetHeight })) },
      lettres: ls.map((l) => {
        const r = l.getBoundingClientRect();
        return { opacite: Number(getComputedStyle(l).opacity), x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, gauche: r.left, droite: r.right, haut: r.top, bas: r.bottom };
      }),
    };
  }),
}));

/**
 * Les questions à l'image affichée (`__intro.t`), dans la langue :
 * - le calque est dans le repère de la vidéo de ce cadrage, posé sur l'écran par le transform de `couverture` (D8) ;
 * - chaque mot a son texte ;
 * - chaque lettre est visible si et seulement si `etatLettre` la montre, et là où il la met, sur le mot que `poserMot`
 *   pose pour cet écran ; aucune lettre avant la naissance de son mot ;
 * - en vol, une lettre est entre l'ancre de son objet (convertie à l'écran) et sa place de repos, saut compris ;
 * - un mot posé (toutes ses lettres arrivées, avant le retour) est entier dans l'écran, à 8 px des bords. Ce contrôle
 *   ne prend que les boîtes des lettres, rien de `questions.ts`.
 * Rend le nombre de lettres visibles de chaque mot. Pour la première lettre en vol de chaque mot, rend aussi ses
 * distances à son objet et à sa place (px CSS).
 */
async function verifierQuestions(page: Page, cadrage: Cadrage, lang: 'fr' | 'en') {
  const { t } = await intro(page);
  const ecran = page.viewportSize()!, video = CADRAGES[cadrage], k = couverture(video, ecran, cadrage);
  const ici = `${ecran.width}×${ecran.height}, ${t} s`, lu = await lire(page);
  expect(lu.cadrage, `repère du calque des questions (${ici})`).toBe(cadrage);
  // Chromium relit le style à 6 chiffres significatifs : 0,01 px pour la translation, 1e-5 en relatif pour l'échelle
  const [tx, ty, s] = (/^translate\((\S+)px, (\S+)px\) scale\((\S+)\)$/.exec(lu.transform) ?? []).slice(1).map(Number);
  expect(Math.abs(s / k.echelle - 1) < 1e-5 && Math.abs(tx - k.x) < 0.01 && Math.abs(ty - k.y) < 0.01,
    `calque des questions posé par couverture (${ici}) : « ${lu.transform} », attendu translate(${k.x}px, ${k.y}px) scale(${k.echelle})`).toBe(true);
  expect(lu.mots.map((m) => m.q)).toEqual([...ORDRE_QUESTIONS]);
  const tol = ECART_VIDEO * k.echelle + 0.25;
  const vues: Record<Question, number> = { capitale: 0, pays: 0, drapeau: 0 };
  const envol: Partial<Record<Question, { objet: number; place: number }>> = {};
  ORDRE_QUESTIONS.forEach((q, j) => {
    const m = lu.mots[j], Q = QUESTIONS[q], n = m.lettres.length;
    expect(m.texte, `texte de ${q} (${lang})`).toBe(messages[lang].modes[MODE[q]] + POINT[lang]);
    const mot = poserMot(q, cadrage, m.g, ecran), a = (mot.inclinaison * Math.PI) / 180, [cx, cy] = mot.centre;
    m.lettres.forEach((l, i) => {
      const e = etatLettre(t, mot, i, ancres), vue = l.opacite > 0.01;
      expect(vue, `${q}, lettre ${i}, visible à ${t} s`).toBe(e !== null && e.opacite > 0.01);
      if (!vue || !e) return;
      vues[q]++;
      const [ex, ey] = versEcran([e.x, e.y], video, ecran, cadrage);
      expect(Math.hypot(l.x - ex, l.y - ey), `${q}, lettre ${i}, à sa place (${ici})`).toBeLessThanOrEqual(tol);
      if (t >= Q.naissance + i * Q.ecart + Q.vol) return;
      // en vol : partie de l'ancre de son objet (qui bouge : le drapeau monte), vers sa place de repos (inclinée)
      const A = versEcran(ancreQuestion(ancres, cadrage, q, t), video, ecran, cadrage), [nx, ny] = mot.lettres[i];
      const R = versEcran([cx + (nx - cx) * Math.cos(a) - (ny - cy) * Math.sin(a), cy + (nx - cx) * Math.sin(a) + (ny - cy) * Math.cos(a)], video, ecran, cadrage);
      const entre = l.x >= Math.min(A[0], R[0]) - tol && l.x <= Math.max(A[0], R[0]) + tol
        && l.y >= Math.min(A[1], R[1]) - Q.saut * k.echelle - tol && l.y <= Math.max(A[1], R[1]) + tol;
      expect(entre, `${q}, lettre ${i}, en vol entre son objet (${A.map(Math.round).join(', ')}) et sa place (${R.map(Math.round).join(', ')}) : (${Math.round(l.x)}, ${Math.round(l.y)}) à ${t} s`).toBe(true);
      envol[q] ??= { objet: Math.hypot(l.x - A[0], l.y - A[1]), place: Math.hypot(l.x - R[0], l.y - R[1]) };
    });
    if (t <= Q.naissance) expect(vues[q], `${q} : aucune lettre avant sa naissance (${Q.naissance} s)`).toBe(0);
    if (t >= Q.naissance + (n - 1) * Q.ecart + Q.vol && t < RETOUR) {
      const dit = `${q} (${lang}) entière dans l'écran (${ici})`;
      expect(vues[q], dit).toBe(n);
      expect(Math.min(...m.lettres.map((l) => l.gauche)), dit).toBeGreaterThanOrEqual(BORD);
      expect(Math.min(...m.lettres.map((l) => l.haut)), dit).toBeGreaterThanOrEqual(BORD);
      expect(Math.max(...m.lettres.map((l) => l.droite)), dit).toBeLessThanOrEqual(ecran.width - BORD);
      expect(Math.max(...m.lettres.map((l) => l.bas)), dit).toBeLessThanOrEqual(ecran.height - BORD);
    }
  });
  return { vues, envol };
}
/** Lettres visibles de chaque mot, dans l'ordre des questions. */
const compte = (v: { vues: Record<Question, number> }) => ORDRE_QUESTIONS.map((q) => v.vues[q]);

/** Le calque et chaque lettre tels que la page les a écrits (pour voir qu'ils ne bougent plus). */
const ecrites = (page: Page) => page.locator('.intro .intro-questions').evaluate((c: HTMLElement) =>
  [c.style.transform, ...[...c.querySelectorAll<HTMLElement>('.intro-lettre')].map((l) => `${l.style.opacity} ${l.style.transform}`)]);

/**
 * Onglet caché, simulé : Chromium headless ne cache jamais une page (sondé le 11/10 : `visibilityState` reste « visible »
 * derrière un autre onglet). Le script fait ce que fait le navigateur : `document.hidden` et son évènement, rAF suspendu,
 * vidéo mise en pause (Chrome suspend une vidéo muette en arrière-plan), relancée au retour sauf `relancer = false` :
 * c'est alors à la page de la relancer (Intro.tsx, comme pour un navigateur qui ne le fait pas). Les minuteurs
 * (`setTimeout`, `setInterval`) continuent, comme dans un vrai onglet caché (ralentis, pas arrêtés).
 */
type Onglet = { __onglet(cache: boolean, relancer?: boolean): void };
function simulerOnglet() {
  let cache = false;
  const attente: FrameRequestCallback[] = [], pausees: HTMLVideoElement[] = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => { if (!cache) return raf(f); attente.push(f); return 0; };
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => cache });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (cache ? 'hidden' : 'visible') });
  (window as unknown as Onglet).__onglet = (c, relancer = true) => {
    cache = c;
    if (c) for (const v of document.querySelectorAll('video')) if (!v.paused) { v.pause(); pausees.push(v); }
    document.dispatchEvent(new Event('visibilitychange'));
    if (!c) {
      for (const v of pausees.splice(0)) if (relancer) void v.play().catch(() => undefined);
      for (const f of attente.splice(0)) raf(f);
    }
  };
}

test('la vidéo se lit jusqu’au bout et mène à l’accueil, sans « Passer » ; le globe tourne ensuite', async ({ page }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  expect((await intro(page)).variante).toEqual({ cadrage: 'portrait', taille: 'plein', ips: 60, codec: 'av1' });
  // accessibilité (spec §5) : la vidéo a un nom ; l'affiche et le calque des questions sont décoratifs
  await expect(page.locator('.intro video')).toHaveAttribute('aria-label', messages.fr.intro.videoLabel);
  const decor = page.locator('.intro .intro-affiche, .intro .intro-questions');
  await expect(decor).toHaveCount(2);
  for (const el of await decor.all()) await expect(el).toHaveAttribute('aria-hidden', 'true');
  // temps réel : le temps de la vidéo avance avec l'horloge ; pas d'accueil avant ACCUEIL
  const t0 = (await intro(page)).t;
  await page.waitForTimeout(1000);
  expect((await intro(page)).t - t0).toBeGreaterThan(0.5);
  await page.waitForFunction((t) => window.__intro!.t >= t, INTRO.ACCUEIL - 1, { timeout: 60_000 });
  await expect(page.locator('.accueil')).toHaveCount(0);
  await expect(accueil(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 120_000 }); // globe prêt, fondu fini
  expect(await intro(page)).toMatchObject({ skipped: false, echec: null });
  await expect(page.getByRole('link', { name: /Jouer|Play/ })).toHaveAttribute('href', '/demo.html');
  await expect(credit(page)).toBeVisible();
  // rotation légère de l'accueil (HOME_SPIN_DEG_PER_S) : la longitude visée bouge d'une image à l'autre (SwiftShader rend
  // une image en quelques secondes : on compte les images, pas le temps)
  const vue = () => page.evaluate(() => ({ lng: window.__globe!.view()![0], frames: window.__globe!.frames }));
  const a = await vue();
  await page.waitForFunction((f) => window.__globe!.frames >= f + 2, a.frames, { timeout: 60_000 });
  const b = await vue();
  expect(Math.abs(((b.lng - a.lng + 540) % 360) - 180)).toBeGreaterThan(0.01);
  await expectNoStaleFrame(page);
});

test('sans variante forcée : le lecteur choisit une vidéo lisible du bon cadrage, à 60 i/s, et elle avance', async ({ page }) => {
  await page.goto('/?webgl');
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  const { variante, t } = await intro(page);
  expect(variante).toMatchObject({ cadrage: 'portrait', ips: 60 }); // headless : rAF à 16,7 ms → 60 i/s (D3)
  await page.waitForTimeout(1000);
  expect((await intro(page)).t).toBeGreaterThan(t + 0.5);
});

test('« Passer › » saute à la fin : accueil, fondu, intro démontée', async ({ page }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await passer(page).click();
  await expect(accueil(page)).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  expect(await intro(page)).toMatchObject({ skipped: true, echec: null });
});

test('vidéo absente (requête en échec) : accueil direct sur le globe', async ({ page }) => {
  await page.route(/\/video\/[^/]+\.mp4$/, (r) => r.abort());
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await expect(accueil(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('erreur');
  // accueil direct (D5) : pas de titre en pâte à relayer, les lettres surgissent une à une
  await expect(accueil(page)).toHaveClass(/\blogo-titre--pop\b/);
  expect(await accueil(page).locator('.logo-l').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('logo-lettre');
});

test('lecture refusée (play() rejeté, ex. économie d’énergie d’iOS) : accueil direct', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('lecture refusée (test)', 'NotAllowedError'));
  });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await expect(accueil(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('lecture-refusee');
});

test('aucun codec lisible (MediaCapabilities et canPlayType disent non) : accueil direct', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.canPlayType = () => '';
    Object.defineProperty(Navigator.prototype, 'mediaCapabilities', { configurable: true, get: () => ({ decodingInfo: async () => ({ supported: false, smooth: false, powerEfficient: false }) }) });
  });
  await page.goto('/?webgl'); // variante non forcée : le lecteur choisit, et ne trouve rien
  await expect(accueil(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('aucun-codec');
});

test('requête vidéo jamais servie : l’affiche du bon cadrage, puis l’accueil direct au bout de 8 s', async ({ page }) => {
  await page.route(/\/video\/[^/]+\.mp4$/, () => { /* jamais servie : aucune image ne vient */ });
  const debut = Date.now();
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await expect(page.locator(`.intro img[src$="${manifeste.affiches.portrait}"]`)).toBeVisible({ timeout: 5_000 });
  await expect(accueil(page)).toBeVisible({ timeout: INTRO_GIVE_UP_MS + 20_000 });
  expect(Date.now() - debut).toBeGreaterThanOrEqual(INTRO_GIVE_UP_MS);
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('pas-d-image');
});

test('« Passer » pendant que la vidéo se charge : accueil tout de suite', async ({ page }) => {
  await page.route(/\/video\/[^/]+\.mp4$/, () => { /* jamais servie */ });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await expect(passer(page)).toBeVisible({ timeout: 30_000 });
  await passer(page).click();
  await expect(accueil(page)).toBeVisible({ timeout: 5_000 });
});

test('globe lent : la vidéo s’arrête sur sa dernière image sous l’accueil, puis le fondu part', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/textures/day-*.ktx2', async (route) => { await gate; await route.continue(); });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await expect(accueil(page)).toBeVisible({ timeout: (INTRO.ACCUEIL + 30) * 1000 });
  await page.waitForFunction((d) => {
    const v = document.querySelector<HTMLVideoElement>('.intro video');
    return !!v && v.paused && v.currentTime >= d - 0.1;
  }, manifeste.duree, { timeout: 60_000 });
  await page.waitForTimeout(2000);
  await expect(page.locator('.intro')).toHaveCount(1); // le fondu attend le globe
  expect(await page.locator('.intro video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  release();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  await expectNoStaleFrame(page); // l'image de préchauffage (globe inactif) compte aussi
});

test('globe en échec : le fondu part quand même et « Réessayer » se voit', async ({ page }) => {
  await page.route('**/data/borders.json', (r) => r.abort());
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await passer(page).click();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: /Réessayer|Try again/ })).toBeVisible({ timeout: 60_000 });
});

test('code du globe introuvable (D15) : le fondu part quand même, « Réessayer » sous l’accueil, pas de page blanche', async ({ page }) => {
  // le morceau GlobeView : /src/globe/GlobeView.tsx en dev, /assets/GlobeView-<empreinte>.js en production
  await page.route(/\/(src\/globe\/GlobeView\.tsx|assets\/GlobeView-[\w-]+\.js)(\?.*)?$/, (r) => r.abort());
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await passer(page).click();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 60_000 });
  await expect(accueil(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /Réessayer|Try again/ })).toBeVisible();
});

test('titre de l’accueil (D5) : invisible sous la vidéo jusqu’au fondu, puis en fondu ; la petite Terre repart à l’angle de la vidéo', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/textures/day-*.ktx2', async (route) => { await gate; await route.continue(); });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await passer(page).click(); // la vidéo saute à sa dernière image (le titre en pâte), l'accueil se monte ; le fondu attend le globe
  const titre = accueil(page);
  const style = () => titre.evaluate((e) => { const s = getComputedStyle(e); return { opacite: Number(s.opacity), animation: s.animationName, duree: parseFloat(s.animationDuration) }; });
  await expect(titre).toHaveClass(/\blogo-titre--fondu\b/, { timeout: 5_000 });
  await page.waitForTimeout(1000);
  await expect(titre).not.toHaveClass(/\blogo-titre--visible\b/);
  expect((await style()).opacite).toBe(0); // la vidéo le montre en pâte : le titre HTML attend
  expect(await titre.locator('.logo-l').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('none'); // ses lettres ne surgissent pas
  release();
  await expect(titre).toHaveClass(/\blogo-titre--visible\b/, { timeout: 180_000 });
  // en fondu, au rythme de la vidéo qui s'efface (FIN − FONDU), jusqu'à l'opacité pleine
  expect(await style()).toMatchObject({ animation: 'logo-fondu', duree: expect.closeTo(INTRO.FIN - INTRO.FONDU, 2) });
  await expect.poll(async () => (await style()).opacite, { timeout: 10_000 }).toBe(1);
  // « Passer » : la vidéo est sur sa dernière image, la petite Terre part de son angle (LOGO_ANGLE_FIN)
  const delai = await page.locator('.accueil .logo-terre').evaluate((e) => parseFloat(getComputedStyle(e).animationDelay));
  expect(delai).toBeCloseTo(-(LOGO_ANGLE_FIN / (2 * Math.PI)) * LOGO_TOUR_S, 2);
});

for (const lang of ['fr', 'en'] as const) {
  test.describe(`questions (${lang})`, () => {
    test.use({ locale: lang === 'fr' ? 'fr-FR' : 'en-US' });
    test('aux instants figés : rien avant la naissance, chaque mot né de son objet, les trois posés entiers dans l’écran, plus rien après le retour', async ({ page }) => {
      const voir = async (t: number) => {
        await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}&introT=${t}`);
        await figee(page, t);
        return verifierQuestions(page, 'portrait', lang);
      };
      expect(compte(await voir(AVANT)), `lettres visibles à ${AVANT} s`).toEqual([0, 0, 0]);
      for (const q of ORDRE_QUESTIONS) {
        // en plein envol : la première lettre a quitté son objet et n'est pas encore à sa place
        const { envol } = await voir(ENVOL[q]);
        expect(envol[q]?.objet, `${q} a quitté son objet à ${ENVOL[q]} s`).toBeGreaterThan(10);
        expect(envol[q]?.place, `${q} pas encore à sa place à ${ENVOL[q]} s`).toBeGreaterThan(10);
      }
      expect(compte(await voir(TOUS_POSES)), `lettres visibles à ${TOUS_POSES} s`).toEqual([...LETTRES[lang]]);
      await voir(RENTRENT);
      expect(compte(await voir(APRES)), `lettres visibles à ${APRES} s`).toEqual([0, 0, 0]);
    });
  });
}

// Review Focus 1 : écrans loin des deux références (1080×2340, 1920×1080). Variante non forcée : le cadrage vient de la fenêtre.
const ECRANS = [
  { nom: 'iPad portrait', width: 768, height: 1024, cadrage: 'portrait' },
  { nom: 'bureau 21:9', width: 2560, height: 1080, cadrage: 'paysage' },
  { nom: 'téléphone court', width: 390, height: 664, cadrage: 'portrait' },
] as const;
for (const e of ECRANS) {
  test(`${e.nom} ${e.width}×${e.height} : la vidéo couvre l’écran, chaque question reste entière dedans`, async ({ page }) => {
    await page.setViewportSize({ width: e.width, height: e.height });
    for (const t of [TOUS_POSES, grille(RETOUR - 0.1)]) { // les trois mots posés, à deux instants de leur vie (onde, oscillation)
      await page.goto(`/?webgl&introT=${t}`);
      await figee(page, t);
      expect((await intro(page)).variante?.cadrage).toBe(e.cadrage);
      await couvre(page, e.cadrage);
      expect(compte(await verifierQuestions(page, e.cadrage, 'fr'))).toEqual([...LETTRES.fr]);
    }
  });
}

test('rotation et redimensionnement pendant l’intro : la vidéo n’est pas rechargée, les questions sont reposées et restent entières dans l’écran', async ({ page }) => {
  const t = TOUS_POSES;
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}&introT=${t}`);
  await figee(page, t);
  const src = await page.locator('.intro video').evaluate((v: HTMLVideoElement) => {
    v.dataset.chargements = '0';
    v.addEventListener('loadstart', () => { v.dataset.chargements = String(Number(v.dataset.chargements) + 1); });
    return v.currentSrc;
  });
  const autres: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()).pathname; if (/^\/video\/.+\.mp4$/.test(u) && !src.endsWith(u)) autres.push(u); });
  // 768 × 1024 : l'écran grandit, les mots y tiendraient même sans être reposés ; seul le transform du calque le voit
  for (const ecran of [{ width: 430, height: 932 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(ecran);
    await uneImage(page);
    await couvre(page, 'portrait'); // le cadrage choisi au départ reste (même vidéo, calée en haut)
    expect(compte(await verifierQuestions(page, 'portrait', 'fr'))).toEqual([...LETTRES.fr]);
  }
  // même élément (marqué), même source, aucun nouveau chargement
  expect(await page.locator('.intro video').evaluate((v: HTMLVideoElement) => [v.dataset.chargements, v.currentSrc])).toEqual(['0', src]);
  expect(autres).toEqual([]);
});

test('le réseau cale en pleine lecture : les questions attendent avec la vidéo, puis accueil après 8 s sans progrès', async ({ page }) => {
  // le serveur n'a que les octets jusqu'au milieu de la vie des questions (débit supposé régulier) ; la suite ne vient jamais
  const v = manifeste.variantes.find((x) => idVariante(x) === VARIANTE.portrait)!;
  const coupe = Math.floor((v.octets * (QUESTIONS.capitale.naissance + RETOUR)) / 2 / manifeste.duree);
  await page.route(/\/video\/[^/]+\.mp4$/, async (route) => {
    const debut = Number(/bytes=(\d+)-/.exec(route.request().headers()['range'] ?? '')?.[1] ?? 0);
    if (debut >= coupe) return; // jamais servie : la lecture cale
    const r = await route.fetch({ headers: { ...route.request().headers(), range: `bytes=${debut}-${coupe - 1}` } });
    const total = /\/(\d+)$/.exec(r.headers()['content-range'] ?? '')?.[1] ?? String(v.octets);
    await route.fulfill({ status: 206, headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${debut}-${coupe - 1}/${total}` }, body: await r.body() });
  });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  // calée : le temps de la vidéo ne bouge plus depuis 1 s
  const tCale = await (await page.waitForFunction(() => {
    const w = window as unknown as { __cale?: { t: number; depuis: number } }, t = window.__intro!.t, now = performance.now();
    if (!w.__cale || w.__cale.t !== t) { w.__cale = { t, depuis: now }; return false; }
    return now - w.__cale.depuis > 1000 ? t : false;
  }, null, { timeout: 40_000, polling: 100 })).jsonValue();
  const cale = Date.now();
  test.info().annotations.push({ type: 'calage', description: `vidéo calée à ${tCale} s` });
  // la coupe doit tomber pendant la vie des questions : sans lettre visible, « elles attendent » ne vérifierait rien
  expect(compte(await verifierQuestions(page, 'portrait', 'fr')).some((n) => n > 0), `lettres visibles à ${tCale} s`).toBe(true);
  const avant = await ecrites(page);
  await page.waitForTimeout(2000);
  expect(await ecrites(page)).toEqual(avant); // elles attendent avec la vidéo
  expect((await intro(page)).echec).toBeNull();
  await expect(accueil(page)).toBeVisible({ timeout: INTRO_GIVE_UP_MS + 15_000 });
  expect(Date.now() - cale).toBeGreaterThanOrEqual(INTRO_GIVE_UP_MS - 2000); // 8 s sans progrès, dont ~1 s pour voir le calage
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('bloquee');
});

test('onglet caché pendant la lecture : aucun abandon pendant l’absence ni à cause d’elle ; au retour, la lecture reprend', async ({ page }) => {
  await page.addInitScript(simulerOnglet);
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true && window.__intro.t > 1, null, { timeout: 60_000 });
  await page.evaluate(() => (window as unknown as Onglet).__onglet(true));
  const tCache = (await intro(page)).t;
  await page.waitForTimeout(INTRO_GIVE_UP_MS + 2000); // plus long que les abandons (« pas d'image », « plus de progrès »)
  expect((await intro(page)).echec).toBeNull();
  await expect(page.locator('.intro')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as Onglet).__onglet(false, false));
  // le script ne relance pas la vidéo : c'est Intro.tsx qui doit le faire (play() est permis ici), sans compter l'absence
  // comme un calage
  await page.waitForFunction((t0) => window.__intro!.t > t0 + 0.5, tCache, { timeout: 10_000 });
  expect((await intro(page)).echec).toBeNull();
  await expect(page.locator('.intro')).toHaveCount(1);
});

test('onglet caché avant la première image : l’absence ne compte pas dans les 8 s', async ({ page }) => {
  await page.addInitScript(simulerOnglet);
  await page.route(/\/video\/[^/]+\.mp4$/, () => { /* jamais servie */ });
  const debut = Date.now();
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro !== undefined, null, { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as Onglet).__onglet(true));
  const cache = Date.now();
  await page.waitForTimeout(INTRO_GIVE_UP_MS + 2000);
  expect((await intro(page)).echec).toBeNull();
  await expect(page.locator('.intro')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as Onglet).__onglet(false));
  const retour = Date.now();
  await expect(accueil(page)).toBeVisible({ timeout: INTRO_GIVE_UP_MS + 10_000 });
  // les 8 s se comptent onglet visible : avant l'absence (majoré par le chargement de la page) et après le retour
  expect(cache - debut + (Date.now() - retour)).toBeGreaterThanOrEqual(INTRO_GIVE_UP_MS - 500);
  expect((await intro(page)).echec).toBe('pas-d-image');
});
```

- [ ] **Step 2 : les lancer sur le serveur de dev.** Run : `cd web && npm run e2e:local -- e2e/intro.spec.ts`. Expected : PASS, `Running 21 tests using 1 worker`, puis `21 passed` (≈ 2,6 min). Le fichier déclare 21 tests, autant qu'avant l'amendement du 12/10 : les deux « questions (fr|en) », les trois écrans, la rotation et le calage remplacent les tests des bulles. Relevé au plan le 12/10, sur le worktree d'essai qui porte les Tasks 9 à 11 telles qu'écrites ici, avec les vidéos et les affiches de l'aperçu de la Task 7 (pas celles de la Task 8) : `21 passed (2.6m)`, au premier passage. Avant l'amendement, sur la version à bulles (copie de travail, vidéos et ancres factices) : `21 passed (2.6m)` aussi. Le lecteur existe déjà (Task 10) : ces tests passent d'emblée ; la preuve qu'ils mordent est au Step 3.

- [ ] **Step 3 : contre-épreuves (chaque test doit échouer quand son comportement casse).** Depuis `web/`, sept mutations, chacune suivie de son test puis de sa remise en état :

```bash
cd web
# a) mots non ramenés dans la partie visible (questions.ts, poserMot)
node -e 'const f="src/intro/questions.ts",fs=require("fs"),a="Math.min(max - plus, Math.max(min - moins, c));",s=fs.readFileSync(f,"utf8");if(!s.includes(a))throw new Error("motif absent");fs.writeFileSync(f,s.replace(a,"c;"))'
npm run e2e:local -- e2e/intro.spec.ts -g 'iPad portrait'
git checkout -- src/intro/questions.ts
```

Expected : FAIL — `Error: pays (fr) entière dans l'écran (768×1024, 14.5 s)`, `Expected: <= 1017`, `Received:    1073.434326171875`, puis `1 failed`. L'oracle des places (`poserMot`) est muté avec la page : seul le contrôle des boîtes, qui ne doit rien à `questions.ts`, peut mordre. Relevé au plan le 12/10 sur le worktree d'essai (remis en état par copie, les Tasks 9 et 10 n'y étant pas commitées) : ces quatre lignes. La mutation laisse « Pays ? » à sa place de la maquette, y = 1470 px vidéo, sous les 1440 que l'iPad montre : son bas sort de l'écran de 49,4 px CSS, comme les fonctions pures le prévoyaient.

```bash
# b) calque des questions non reposé quand l'écran change (Intro.tsx, dessinerQuestions)
node -e 'const f="src/intro/Intro.tsx",fs=require("fs"),a="if (me !== posees || cle !== ecranPose) {",s=fs.readFileSync(f,"utf8");if(!s.includes(a))throw new Error("motif absent");fs.writeFileSync(f,s.replace(a,"if (me !== posees) {"))'
npm run e2e:local -- e2e/intro.spec.ts -g 'rotation'
git checkout -- src/intro/Intro.tsx
```

Expected : FAIL — `Error: calque des questions posé par couverture (430×932, 14.5 s) : « translate(0px, 0px) scale(0.361111) », attendu translate(-0.07692307692306599px, 0px) scale(0.39829059829059826)`, `Expected: true`, `Received: false`, puis `1 failed`. Les valeurs attendues sont celles de `couverture` pour 430 × 932 ; le calque a gardé celui de 390 × 844. Relevé au plan le 12/10 sur le worktree d'essai : ces lignes, mot pour mot ; le test tombe dès le premier écran. Une sonde Chromium hors e2e (Task 10) avait aussi montré qu'avec cette mutation « Capitale ? » et « Pays ? » sortent de l'écran à 844 × 390, mais restent dedans à 768 × 1024 : seul le transform le voit alors.

```bash
# c) l'absence de l'onglet comptée dans les 8 s (suivreLecture)
node -e 'const f="src/intro/lecteur.ts",fs=require("fs"),a="else if (p && p.visible && r.visible) attenteMs += Math.min(PAS_MAX_MS, Math.max(0, r.ms - p.ms));",s=fs.readFileSync(f,"utf8");if(!s.includes(a))throw new Error("motif absent");fs.writeFileSync(f,s.replace(a,"else if (p) attenteMs += Math.max(0, r.ms - p.ms) + 0 * PAS_MAX_MS;"))'
npm run e2e:local -- e2e/intro.spec.ts -g 'onglet caché avant'
git checkout -- src/intro/lecteur.ts
```

Expected : FAIL — `Expected: >= 7500`, `Received: <ms>` (au plan : `302`, `392` puis `207` sur trois passes : l'accueil tombe dès le retour sur l'onglet).

```bash
# d) typographie anglaise ignorée (« Capital ? » au lieu de « Capital? », questions.ts)
node -e 'const f="src/intro/questions.ts",fs=require("fs"),a="en: \x27?\x27 };",s=fs.readFileSync(f,"utf8");if(!s.includes(a))throw new Error("motif absent");fs.writeFileSync(f,s.replace(a,"en: \x27 ?\x27 };"))'
npm run e2e:local -- e2e/intro.spec.ts -g 'questions \(en\)'
git checkout -- src/intro/questions.ts
```

Expected : FAIL — `Error: texte de capitale (en)`, `Expected: "Capital?"`, `Received: "Capital ?"`, puis `1 failed`. La spec écrit la typographie elle-même : la mutation de `questions.ts` ne touche pas l'attendu. Relevé au plan le 12/10 sur le worktree d'essai : ces lignes.

```bash
# e) au retour sur l'onglet, la page ne relance pas la vidéo suspendue (Intro.tsx, surVisibilite)
node -e 'const f="src/intro/Intro.tsx",fs=require("fs"),a="&& v.paused && !v.ended) lancer();",s=fs.readFileSync(f,"utf8");if(!s.includes(a))throw new Error("motif absent");fs.writeFileSync(f,s.replace(a,"&& v.paused && !v.ended) void 0;"))'
npm run e2e:local -- e2e/intro.spec.ts -g 'onglet caché pendant'
git checkout -- src/intro/Intro.tsx
```

Expected : FAIL — `TimeoutError: page.waitForFunction: Timeout 10000ms exceeded.` (la vidéo reste en pause : `t` n'avance plus).

```bash
# f) code du globe introuvable sans frontière d'erreur (App.tsx, D15)
node -e 'const f="src/app/App.tsx",fs=require("fs"),a="<CodeDuGlobe texts={m.errors} onError={() => setGlobeReady(true)}>",s=fs.readFileSync(f,"utf8");if(!s.includes(a))throw new Error("motif absent");fs.writeFileSync(f,s.replace(a,"<>").replace("</CodeDuGlobe>","</>"))'
npm run e2e:local -- e2e/intro.spec.ts -g 'code du globe'
git checkout -- src/app/App.tsx
```

Expected : FAIL — `TimeoutError: page.waitForFunction: Timeout 60000ms exceeded.` (l'import raté démonte toute la page avant la première image : page blanche).

```bash
# g) titre de l'accueil visible dès qu'il est monté, sous la vidéo qui le montre en pâte (App.tsx, D5)
node -e 'const f="src/app/App.tsx",fs=require("fs"),a="visible: phase !== \x27intro\x27, entree",s=fs.readFileSync(f,"utf8");if(!s.includes(a))throw new Error("motif absent");fs.writeFileSync(f,s.replace(a,"visible: true, entree"))'
npm run e2e:local -- e2e/intro.spec.ts -g 'titre de l’accueil'
git checkout -- src/app/App.tsx
```

Expected : FAIL — `Expected pattern: not /\blogo-titre--visible\b/`, `Received string: "accueil-titre logo-titre logo-titre--fondu logo-titre--visible"`. Après les sept : `git status --short src` n'affiche rien.

- [ ] **Step 4 : PWA.** Remplacer tout le contenu de `web/e2e/pwa.spec.ts` par :

```ts
import { expect, test, type Page } from '@playwright/test';

/**
 * PWA (spec 2A §8, décisions du 10/10) : manifeste installable, service worker, fichiers lourds gardés sur l'appareil,
 * accueil hors ligne après une première visite. Le service worker n'existe qu'en production : ces contrôles tournent sur
 * le site déployé (ou sur `vite preview`) ; ailleurs ils sont sautés. Les vidéos de l'intro ne passent jamais par lui
 * (D1 du plan de l'intro vidéo : lues par plages d'octets) : hors ligne, accueil direct.
 */
test.slow(true, 'SwiftShader : la première visite charge tout le globe');
test.use({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });

/** Variante forcée (crochets e2e) : AV1 à 60 i/s, lue par Chromium headless. */
const VARIANTE = 'portrait-plein-60-av1';
/** Chemins rangés dans les caches du service worker. */
const enCache = (page: Page) => page.evaluate(async () => {
  const out: string[] = [];
  for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
  return out;
});

test('le manifeste décrit une appli installable (portrait, plein écran, icônes)', async ({ page, request }) => {
  await page.goto('/?webgl');
  // compter d'abord : `getAttribute` attendrait l'élément jusqu'au délai du test sur le serveur de dev (constaté le 10/10)
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de manifeste : serveur de dev');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const m = await (await request.get(href!)).json() as { display: string; orientation: string; theme_color: string; start_url: string; icons: { src: string; purpose?: string }[] };
  expect(m).toMatchObject({ display: 'standalone', orientation: 'portrait', theme_color: '#16173a', start_url: '/' });
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test('après une visite, les fichiers lourds sont sur l’appareil et l’accueil s’ouvre hors ligne', async ({ page, context }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE}`);
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de service worker : serveur de dev');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // première visite : on saute l'intro, on attend le globe (tout ce qui est chargé passe par le service worker)
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: /Passer|Skip/ }).click();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  // le passage par le service worker se fait en arrière-plan, fichier après fichier : on attend qu'il ait fini
  const lourds = ['/textures/day-4k.ktx2', '/textures/surface-4k.ktx2', '/intro/affiche-portrait.webp', '/intro/ancres.json', '/basis/basis_transcoder.wasm'];
  await expect.poll(async () => { const out = await enCache(page); return lourds.filter((w) => !out.includes(w)); }, { timeout: 60_000 }).toEqual([]);
  expect((await enCache(page)).filter((p) => p.startsWith('/video/'))).toEqual([]);
  // hors ligne : la page et le globe viennent de l'appareil ; la vidéo non (D1) : accueil direct
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  await context.setOffline(false);
});

test('seconde visite, service worker actif : la vidéo se lit, servie par le réseau, jamais rangée dans ses caches', async ({ page }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE}`);
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de service worker : serveur de dev');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const videos: { url: string; status: number; sw: boolean }[] = [];
  page.on('response', (r) => { if (/^\/video\/.+\.mp4$/.test(new URL(r.url()).pathname)) videos.push({ url: r.url(), status: r.status(), sw: r.fromServiceWorker() }); });
  await page.reload(); // la page est maintenant contrôlée par le service worker
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  const { t, echec } = await page.evaluate(() => window.__intro!);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__intro!.t)).toBeGreaterThan(t + 0.5); // elle avance
  expect(echec).toBeNull();
  expect(videos.length).toBeGreaterThan(0);
  expect(videos.filter((v) => v.sw)).toEqual([]); // jamais servie par le service worker
  expect((await enCache(page)).filter((p) => p.startsWith('/video/'))).toEqual([]);
});
```

- [ ] **Step 5 : contrôles du site déployé.** Remplacer tout le contenu de `web/e2e/deployed.ts` par :

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Manifeste } from '../src/intro/videos';

/**
 * Fichiers que les specs lisent sur le disque (public/) et que le site sert : ils doivent être les mêmes. Le manifeste
 * des vidéos et les ancres des questions en sont : intro.spec.ts contrôle les questions d'après eux.
 */
const SHARED = ['data/countries.json', 'data/imagery.json', 'data/borders.json', 'video/videos.json', 'intro/ancres.json'] as const;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/**
 * Préparation des e2e sur un site déployé : les pages de test existent, et le site sert les données de ce dépôt (sinon les
 * specs compareraient l'écran à d'autres contours). Lève une erreur qui dit quoi faire.
 */
export async function checkDeployed(baseURL: string, root = 'public'): Promise<void> {
  for (const page of ['probe.html', 'calibrate.html']) {
    const r = await fetch(new URL(page, baseURL));
    if (!r.ok) throw new Error(`${baseURL}${page} : HTTP ${r.status} — la version déployée n'a pas les pages de test (déployer une image construite depuis ce dépôt)`);
  }
  for (const file of SHARED) {
    const r = await fetch(new URL(file, baseURL));
    if (!r.ok) throw new Error(`${baseURL}${file} : HTTP ${r.status}`);
    const remote = sha(new Uint8Array(await r.arrayBuffer()));
    const local = sha(readFileSync(path.join(root, file)));
    if (remote !== local) throw new Error(`${file} : le site ${baseURL} ne sert pas la version de ce dépôt — déployer d'abord, ou E2E_BASE_URL=http://localhost:5174 pour le serveur local`);
  }
  await checkVideos(baseURL, root);
}

/**
 * Les vidéos de l'intro (manifeste de ce dépôt) : servies entières en `video/mp4`, à leur taille, et par plages d'octets
 * (Safari les exige, spec intro vidéo §4) — HEAD, puis les deux premiers octets.
 */
export async function checkVideos(baseURL: string, root = 'public'): Promise<void> {
  const m = JSON.parse(readFileSync(path.join(root, 'video/videos.json'), 'utf8')) as Manifeste;
  for (const v of m.variantes) {
    const url = new URL(v.src.slice(1), baseURL);
    const h = await fetch(url, { method: 'HEAD' });
    const type = h.headers.get('content-type') ?? '', plages = h.headers.get('accept-ranges') ?? '', octets = Number(h.headers.get('content-length'));
    if (h.status !== 200 || !type.startsWith('video/mp4') || plages !== 'bytes' || octets !== v.octets) {
      throw new Error(`${url} : HEAD ${h.status}, « ${type} », accept-ranges « ${plages} », ${octets} octets (attendu : 200, video/mp4, bytes, ${v.octets}) — déployer l'image qui porte les vidéos de ce dépôt`);
    }
    const r = await fetch(url, { headers: { range: 'bytes=0-1' } });
    await r.arrayBuffer();
    if (r.status !== 206 || r.headers.get('content-range') !== `bytes 0-1/${v.octets}`) {
      throw new Error(`${url} : plage bytes=0-1 → HTTP ${r.status}, content-range « ${r.headers.get('content-range')} » (attendu : 206, bytes 0-1/${v.octets})`);
    }
  }
}

export default async function globalSetup(): Promise<void> {
  const target = process.env.E2E_BASE_URL ?? 'https://countrizz.fr/';
  if (!target.includes('localhost')) await checkDeployed(target.endsWith('/') ? target : `${target}/`);
}
```

- [ ] **Step 6 : budget.** Remplacer tout le contenu de `web/e2e-budget/first-load.spec.ts` par :

```ts
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test, type Browser } from '@playwright/test';
import type { ImageryIndex } from '../src/data/imagery';
import type { Manifeste } from '../src/intro/videos';

/**
 * Octets transférés (texte compté gzip, comme le servira nginx). Démo : jusqu'à l'arrivée sur le premier pays (spec 2A §11).
 * Accueil (spec intro vidéo §7, 11/10/2026) : l'affiche puis la première image de l'intro en moins d'une seconde sur une
 * bonne connexion ; chaque vidéo sous son plafond ; tout jusqu'à la fin du fondu ≤ 12 Mo en « standard », vidéos non
 * comptées (lues en flux pendant que le globe se charge).
 */
export const FIRST_LOAD_BUDGET = {
  standard: 8_000_000,
  /** Première image de l'intro (`__intro.premiereImageMs`, ms depuis la navigation) sur une bonne connexion : « < 1 s » (spec §7). */
  demarrage: 1_000,
  /** Affiche du cadrage (octets) : moins d'un dixième de seconde de bonne connexion (1 280 000 o/s), pris sur le démarrage. */
  affiche: 100_000,
  accueil: 12_000_000,
} as const;
/**
 * Réseaux du démarrage, émulés par CDP (`Network.emulateNetworkConditions` : latence en ms, débits en octets/s), sources
 * lues le 11/10/2026 dans devtools-frontend :
 * - « bonne connexion » (spec §7, bornée) : les chiffres de `desktopDense4G`, la connexion des audits de bureau de
 *   Lighthouse (`front_end/models/trace/lantern/simulation/Constants.ts` : 40 ms d'aller-retour, 10 × 1024 kbit/s), posés
 *   tels quels en latence par requête — les DevTools multiplient un aller-retour visé par 2,75 à 3,75 pour en faire une
 *   latence par requête : c'est donc un réseau fixe (≈ 11 à 15 ms d'aller-retour), pas un mobile ;
 * - « Fast 4G » (mesurée, pas encore bornée) : le préréglage des DevTools (`front_end/core/sdk/NetworkManager.ts` :
 *   9 Mbit/s × 0,9 en descente, 1,5 Mbit/s × 0,9 en montée, 60 ms × 2,75 de latence), le plus rapide de ses profils mobiles.
 */
export const RESEAUX = {
  'bonne connexion': { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1000) / 8, uploadThroughput: (10 * 1024 * 1000) / 8 },
  'Fast 4G': { offline: false, latency: 60 * 2.75, downloadThroughput: (9_000_000 / 8) * 0.9, uploadThroughput: (1_500_000 / 8) * 0.9 },
} as const;
const imagery = JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex;
/** Plafond de chaque vidéo (octets), fixé à la Task 8 du plan de l'intro vidéo sur les fichiers rendus. */
const { plafonds } = JSON.parse(readFileSync('e2e-budget/plafonds-video.json', 'utf8')) as { plafonds: Record<string, number> };
/** Les vidéos de l'intro : lues en flux, hors du total de l'accueil (spec §7). */
const VIDEO = /^\/video\/[^/]+\.mp4$/;

function collect(page: import('@playwright/test').Page) {
  const rows: { url: string; bytes: number }[] = [];
  const pending: Promise<void>[] = []; // mesures asynchrones : toutes attendues avant le total
  const onResponse = (r: import('@playwright/test').Response) => { pending.push(measure(r)); };
  page.on('response', onResponse);
  const measure = async (r: import('@playwright/test').Response) => {
    if (r.url().startsWith('blob:') || r.url().startsWith('data:')) return; // workers du transcodeur : pas du réseau
    const url = new URL(r.url()).pathname;
    if (r.status() === 404 && /\/patches\/img\/(\w+)-(\d+)\.ktx2$/.test(url)) {
      // patchs image hors dépôt (absents en CI) : on compte la taille que donne l'index
      const [, id, size] = url.match(/\/patches\/img\/(\w+)-(\d+)\.ktx2$/)!;
      rows.push({ url: `${url} (index)`, bytes: imagery.countries[id!.toUpperCase()]!.files[size!]!.bytes });
      return;
    }
    if (r.status() >= 300) return;
    const type = r.headers()['content-type'] ?? '';
    let sent: number;
    try { sent = (await r.request().sizes()).responseBodySize; } // 0 si servi par le cache du navigateur
    catch { console.log(`taille inconnue (requête interrompue) : ${url}`); return; } // ex. vidéo démontée en pleine lecture
    if (sent === 0) return;
    const body = /javascript|json|html|css|wasm/.test(type) ? await r.body().catch(() => null) : null;
    rows.push({ url, bytes: body ? gzipSync(body, { level: 9 }).length : sent });
  };
  const stop = async () => { page.off('response', onResponse); await Promise.all(pending); };
  /** Chaque fichier (ceux que `keep` écarte marqués « hors budget »), puis le total compté. */
  const report = (budget: number, keep: (url: string) => boolean = () => true) => {
    rows.sort((a, b) => b.bytes - a.bytes);
    const total = rows.filter((r) => keep(r.url)).reduce((s, r) => s + r.bytes, 0);
    console.log(rows.map((r) => `${String(r.bytes).padStart(9)}  ${r.url}${keep(r.url) ? '' : '  (hors budget)'}`).join('\n'));
    console.log(`total ${total} octets (budget ${budget})`);
    return total;
  };
  return { stop, report };
}

test('premier chargement au niveau « standard » (WebGL 2) : globe, données, premier pays', async ({ page }) => {
  const m = collect(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo.html?demo=FRA&webgl');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 0 });
  await page.waitForLoadState('networkidle');
  await m.stop(); // ce qui arrive après le premier pays n'est pas du premier chargement
  expect(m.report(FIRST_LOAD_BUDGET.standard)).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.standard);
});

/**
 * Une première visite (contexte neuf : rien en cache, service worker bloqué) sous `conditions` : l'instant de la première
 * image de l'intro (`__intro.premiereImageMs`) et les octets de l'affiche du cadrage.
 */
async function premiereVisite(browser: Browser, baseURL: string, conditions: (typeof RESEAUX)[keyof typeof RESEAUX] | null) {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  try {
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('countrizz:e2e', '1')); // crochets window.__intro
    if (conditions) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', conditions);
    }
    const affiche = page.waitForResponse((r) => new URL(r.url()).pathname === '/intro/affiche-portrait.webp');
    await page.goto('/?webgl');
    await page.waitForFunction(() => window.__intro?.premiereImageMs != null || window.__intro?.echec != null, null, { timeout: 0 });
    const { premiereImageMs, echec, variante } = await page.evaluate(() => window.__intro!);
    return { ms: premiereImageMs, echec, variante, affiche: (await (await affiche).request().sizes()).responseBodySize };
  } finally { await ctx.close(); }
}

for (const [reseau, conditions] of Object.entries(RESEAUX)) {
  test(`démarrage (${reseau}) : l’affiche, puis la première image de l’intro`, async ({ browser, baseURL }) => {
    // une visite d'échauffement (lecteur vidéo et GPU du navigateur démarrés : la première coûte 1,3 à 2 s de plus, mesuré
    // le 11/10), puis la médiane de trois premières visites
    await premiereVisite(browser, baseURL!, null);
    const visites = [];
    for (let i = 0; i < 3; i++) visites.push(await premiereVisite(browser, baseURL!, conditions));
    const ms = visites.map((v) => v.ms ?? Infinity).sort((x, y) => x - y), mediane = ms[1]!;
    console.log(`démarrage (${reseau}) : première image à ${ms.map(Math.round).join(', ')} ms, médiane ${Math.round(mediane)} (budget ${FIRST_LOAD_BUDGET.demarrage}) ; affiche ${visites[0]!.affiche} octets (budget ${FIRST_LOAD_BUDGET.affiche}) ; variante ${JSON.stringify(visites[0]!.variante)}`);
    for (const v of visites) {
      expect(v.echec).toBeNull();
      expect(v.affiche).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.affiche);
    }
    // « Fast 4G » : mesurée, pas encore bornée (plafond à proposer à l'utilisateur sur ce chiffre)
    if (reseau === 'bonne connexion') expect(mediane).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.demarrage);
  });
}

test('chaque vidéo de l’intro sous son plafond (fichiers servis par le site, octets de son manifeste)', async ({ request }) => {
  const m = await (await request.get('/video/videos.json')).json() as Manifeste;
  expect(m.variantes.map((v) => v.src).sort()).toEqual(Object.keys(plafonds).sort());
  for (const v of m.variantes) {
    const r = await request.head(v.src);
    const octets = Number(r.headers()['content-length']);
    console.log(`${String(octets).padStart(9)}  ${v.src} (plafond ${plafonds[v.src]})`);
    expect(r.status()).toBe(200);
    expect(octets).toBe(v.octets);
    expect(octets).toBeLessThanOrEqual(plafonds[v.src]!);
  }
});

for (const tier of ['standard', 'haute'] as const) {
  test(`accueil (${tier}) : tout jusqu'à la fin du fondu, vidéos non comptées`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('countrizz:e2e', '1')); // crochets window.__intro
    const m = collect(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(tier === 'standard' ? '/?webgl' : '/');
    await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 0 });
    await page.getByRole('button', { name: /Passer|Skip/ }).click();
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 0 });
    await page.waitForLoadState('networkidle');
    await m.stop();
    const total = m.report(FIRST_LOAD_BUDGET.accueil, (u) => !VIDEO.test(u));
    // « haute » : mesuré, pas encore borné (plafond à proposer à l'utilisateur sur ce chiffre)
    if (tier === 'standard') expect(total).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.accueil);
  });
}
```

- [ ] **Step 7 : types, et la PWA sautée en dev.** Run : `cd web && npx tsc --noEmit && npm run e2e:local -- e2e/pwa.spec.ts`. Expected : `tsc` sans sortie ; puis `3 skipped` (pas de service worker sur le serveur de dev). Au plan, à l'amendement du 12/10 (Tasks 9 à 11 sur le worktree d'essai) : `tsc` sans sortie, puis `Running 3 tests using 1 worker` et `3 skipped`, code 0.

- [ ] **Step 8 : le build de production servi par le nginx de l'image.** Le service worker, les en-têtes de nginx (plages d'octets des vidéos) et le budget ne se voient qu'en production. Depuis la racine du dépôt, le port 5176 libre (`lsof -iTCP:5176 -sTCP:LISTEN` ne rend rien) :

```bash
(cd web && npm run build)
docker run -d --rm --name countrizz-e2e -p 127.0.0.1:5176:8080 -v "$PWD/deploy/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/web/dist:/usr/share/nginx/html:ro" nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
cd web
E2E_BASE_URL=http://127.0.0.1:5176 npx playwright test e2e/intro.spec.ts e2e/pwa.spec.ts
BUDGET_BASE_URL=http://127.0.0.1:5176 npm run budget
```

(`127.0.0.1` et non `localhost` : la config ne lance pas le serveur de dev, et la préparation `e2e/deployed.ts` tourne comme sur le site — pages de test, mêmes `videos.json` et `ancres.json`, HEAD et plage `bytes=0-1` de chaque vidéo.) Expected : `Running 24 tests using 1 worker`, puis `24 passed` (≈ 3 min : les 21 tests de l'intro et les 3 de la PWA ; relevé au plan le 12/10 sur le worktree d'essai, son build servi par ce nginx, avec les vidéos et les affiches de l'aperçu de la Task 7 : `24 passed (3.1m)`, la préparation `e2e/deployed.ts` passée, HEAD et plages des dix vidéos compris ; avant l'amendement, sur la version à bulles : `24 passed (3.2m)`) ; puis le budget, `6 passed`, avec ces lignes (au plan, avant l'amendement, sur les vidéos factices ; le budget n'a pas tourné à l'amendement : il lit `e2e-budget/plafonds-video.json`, que la Task 8 écrit et que le worktree d'essai n'a pas, et l'amendement ne change aucune de ses lignes) :

```text
total 6891338 octets (budget 8000000)                                ← premier chargement de la démo
démarrage (bonne connexion) : première image à 583, 584, 600 ms, médiane 584 (budget 1000) ; affiche 4622 octets (budget 100000) ; variante {"cadrage":"portrait","taille":"plein","ips":60,"codec":"av1"}
démarrage (Fast 4G) : première image à 1141, 1142, 1159 ms, médiane 1142 (budget 1000) ; affiche 4622 octets (budget 100000) ; variante {"cadrage":"portrait","taille":"plein","ips":60,"codec":"av1"}
  2364780  /video/intro-portrait-60.av1.mp4 (plafond 3300000)        ← dix lignes, une par vidéo
total 6102945 octets (budget 12000000)                               ← accueil standard (la vidéo lue : « (hors budget) »)
total 9678878 octets (budget 12000000)                               ← accueil haute
```

Recopier les deux médianes du démarrage, l'affiche et les deux totaux de l'accueil : la passation de la Task 12 les reprend. **Si la médiane « bonne connexion » dépasse 1000** : ne pas relever le plafond (c'est le spec §7) ; arrêter et le dire à l'utilisateur avec le chiffre. Relevé au plan, avant et après le chargement à part du globe (D15, Task 10 Step 6), même nginx, mêmes vidéos factices, trois passes du démarrage : médianes 974, 973 et 951 ms avant, 589, 589 et 584 ms après sous « bonne connexion » ; 1532, 1531 et 1509 ms avant, 1165, 1165 et 1142 ms après en Fast 4G. Avant D15, l'intro ne se montait qu'après les modules du globe que `main` importait (`GlobeView-*.js` et `textures-*.js` ; l'affiche partait à 673 ms, Resource Timing) ; après, l'affiche part à 207 ms et la première image vient à 590 ms.

- [ ] **Step 9 : contre-épreuve du service worker.** Une vidéo attrapée par le service worker doit faire échouer le contrôle de la seconde visite :

```bash
node -e 'const f="src/pwa/motifs.ts",fs=require("fs"),a="/\\/(textures|basis|intro|fonts|icons)\\/[^/]+$/",s=fs.readFileSync(f,"utf8");if(!s.includes(a))throw new Error("motif absent");fs.writeFileSync(f,s.replace(a,"/\\/(textures|basis|intro|video|fonts|icons)\\/[^/]+$/"))'
npm run build
E2E_BASE_URL=http://127.0.0.1:5176 npx playwright test e2e/pwa.spec.ts -g 'seconde visite'
git checkout -- src/pwa/motifs.ts && npm run build
docker stop countrizz-e2e
```

Expected : FAIL — le tableau des réponses vidéo n'est pas vide : `"sw": true`, `"status": 206`, `"url": "http://127.0.0.1:5176/video/intro-portrait-60.av1.mp4"` ; puis le build propre, et `countrizz-e2e` arrêté.

- [ ] **Step 10 : commit.**

```bash
git add web/e2e/intro.spec.ts web/e2e/pwa.spec.ts web/e2e/deployed.ts web/e2e-budget/first-load.spec.ts
git commit -m "e2e : intro vidéo (fin sans « Passer », échecs dont aucun codec, titre en fondu et petite Terre relayée, code du globe introuvable, questions FR/EN nées de leurs objets, écrans éloignés, rotation, calage, onglet caché, accessibilité, service worker) ; budget du démarrage et des vidéos — spec intro vidéo §5, §7-8"
```

---

### Task 12 : Suite complète, passation, image 1.7, e2e et budget sur le site

**Files:**
- Modify: `docs/HANDOFF.md` (une ligne datée en tête de la reprise), `deploy/k8s/countrizz.yaml:27` (étiquette `1.6` → `1.7`)

**Interfaces:**
- Consumes : toute la branche (Tasks 1-11) ; `npm run intro:avancement -- rendu` (Task 6 : `<cadrage> : <n>/<N> images, <s> s/image`) ; `web/public/video/videos.json` (Task 8) ; `deploy/web/nginx.conf`, `deploy/web/Dockerfile`, `deploy/scripts/stage-image.mjs` (Task 10 : calque `video`) ; `deploy/scripts/build-image.sh` (lit l'étiquette dans `deploy/k8s/countrizz.yaml`, refuse une étiquette déjà publiée, puis `npm run build`, `stage-image.mjs`, `docker buildx … --push`) ; `web/e2e/deployed.ts` (Task 11 : préparation des e2e sur le site, vidéos comprises).
- Produces : l'image `pablohassan/countrizz-web:1.7` sur Docker Hub et son déploiement dans `countrizz` (chacun sur GO de l'utilisateur) ; la passation.

État relevé en écrivant le plan (11/10, ≈ 20 h, lectures seules) : le cluster sert `pablohassan/countrizz-web:1.5` (deux pods prêts) ; `1.6` et `1.7` n'existent pas sur Docker Hub — la 1.6 (API du globe, 2A-4) a été étiquetée dans `countrizz.yaml` (commit `9dde8a6`) mais jamais construite. Si c'est encore vrai au Step 6, la 1.7 met en ligne **la 2A-4 et l'intro vidéo** ensemble, et la 1.6 ne sera jamais publiée.

- [ ] **Step 1 : suite du Mac, en local.** Run : `cd web && npm run check && npm run test:data && npm run e2e:local`. Expected : `tsc` sans erreur ; Vitest `Tests  <U> passed (<U>)` (au plan, à l'amendement du 12/10, sur le worktree d'essai à 06fe6e4 qui porte les Tasks 9 à 11 : `Test Files  71 passed (71)`, `Tests  442 passed (442)` ; la Task 11 n'ajoute aucun test unitaire) ; `test:data` `<D> passed` (au plan, même worktree, avec les patchs image et le cache geodata du Mac, qui sont hors dépôt : `Test Files  10 passed (10)`, `Tests  68 passed (68)`) ; Playwright `<E> passed` et `3 skipped` (les trois de `pwa.spec.ts`, seuls tests sautés en dev : pas de service worker), aucun échec (au plan, à l'amendement du 12/10, par cette commande sur le même worktree, avec les vidéos et les affiches de l'aperçu de la Task 7 : `Running 529 tests using 1 worker`, puis `3 skipped` et `526 passed (18.0m)`, code 0 ; avant l'amendement, sur une copie de travail avec la version à bulles et les vidéos factices : `526 passed (17.5m)`, `3 skipped`) ; `e2e/visual.spec.ts` sans nouvelle référence (l'intro n'en a pas, le globe ne change pas) ; `staleFrames` à 0. Garder `<U>`, `<D>`, `<E>` pour le Step 5.

- [ ] **Step 2 : le build de production sous le nginx de l'image.** Run, depuis la racine du dépôt, le port 5176 libre (`lsof -iTCP:5176 -sTCP:LISTEN` ne rend rien) :

```bash
(cd web && npm run build)
docker run -d --rm --name countrizz-e2e -p 127.0.0.1:5176:8080 -v "$PWD/deploy/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/web/dist:/usr/share/nginx/html:ro" nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
(cd web && E2E_BASE_URL=http://127.0.0.1:5176 npx playwright test e2e/intro.spec.ts e2e/pwa.spec.ts)
(cd web && BUDGET_BASE_URL=http://127.0.0.1:5176 npm run budget)
docker stop countrizz-e2e
```

Expected : `24 passed` ; puis `6 passed` et les lignes `démarrage (bonne connexion) : première image à …, médiane <MB> (budget 1000) ; affiche <AFF> octets (budget 100000) ; …`, `démarrage (Fast 4G) : … médiane <MF> …`, `total <TS> octets (budget 12000000)` (accueil standard) et `total <TH> octets (budget 12000000)` (accueil haute). Garder `<MB>`, `<MF>`, `<AFF>`, `<TS>`, `<TH>`. (Au plan, à l'amendement du 12/10, sur le worktree d'essai (Tasks 9 à 11, vidéos et affiches de l'aperçu de la Task 7) : `24 passed (3.1m)`, par la même commande qu'à la Task 11, Step 8 ; le budget n'y a pas tourné, faute de `plafonds-video.json` (Task 8). Avant l'amendement, sur une copie de travail avec les vidéos factices et la version à bulles, après D15 : `24 passed (3.2m)` ; médianes 584 ms et 1142 ms, affiche 4622 octets, accueil 6102945 et 9678878 octets — les vraies vidéos changeront ces chiffres.) Une médiane « bonne connexion » au-dessus de 1000 : arrêt, avec le chiffre, devant l'utilisateur (spec §7 ; ne pas relever le plafond).

- [ ] **Step 3 : revue finale** par un relecteur neuf sur toute la branche depuis le commit qui précède la Task 1 (skill du mode d'exécution choisi) ; corrections test d'abord ; si une correction touche le code ou les vidéos, refaire les Steps 1 et 2. Garder son issue en une phrase, `<REVUE>` : le nombre de remarques par gravité, ce qui a été corrigé, les mineurs différés, nommés.

- [ ] **Step 4 : les chiffres de la fabrique et du jour.** Run, depuis la racine du dépôt :

```bash
(cd web && npm run intro:avancement -- rendu)
(cd web && node -e "const m=JSON.parse(require('fs').readFileSync('public/video/videos.json','utf8'));const v=[...m.variantes].sort((a,b)=>b.octets-a.octets);for(const x of v)console.log(String(x.octets).padStart(9),x.src);console.log(String(v.reduce((s,x)=>s+x.octets,0)).padStart(9),'octets en tout')")
date +%d/%m
```

Expected : `portrait : <NP>/<NP> images, <SP> s/image`, `paysage : <NL>/<NL> images, <SL> s/image`, `reste ≈ 0.0 h` (2377 images) — si les PNG du rendu ont été effacés (Task 8, Step 13), la commande compte 0 image et un reste de plusieurs heures : prendre alors les deux lignes `portrait : …` et `paysage : …` recopiées à la Task 8, Step 4 ; dix lignes `<octets> /video/<fichier>`, de la plus lourde à la plus légère, puis `<TOTAL> octets en tout` (au plan, sur les vidéos factices : première ligne `  3954627 /video/intro-portrait-120.av1.mp4`, dixième `   809349 /video/intro-portrait-leger-60.hevc.mp4`, puis ` 19065992 octets en tout`) ; la date du jour. Valeurs pour le Step 5 :

| Gabarit | Valeur |
|---|---|
| `<JJ/MM>` | la sortie de `date +%d/%m` |
| `<NP>`, `<SP>`, `<NL>`, `<SL>` | les lignes `portrait : …` et `paysage : …` (de cette commande, ou celles de la Task 8, Step 4, si les PNG ont été effacés) |
| `<HP>`, `<HL>` | `<NP> × <SP> ÷ 3600` et `<NL> × <SL> ÷ 3600`, en heures à une décimale |
| `<TOTAL>` | le nombre de la ligne `… octets en tout` |
| `<SRC_MAX> <OCT_MAX>`, `<SRC_MIN> <OCT_MIN>` | la première et la dixième ligne (chemin, octets) |
| `<U>`, `<D>`, `<E>` | Step 1 |
| `<MB>`, `<MF>`, `<AFF>`, `<TS>`, `<TH>` | Step 2 |
| `<REVUE>` | Step 3 |

- [ ] **Step 5 : passation.** Dans `docs/HANDOFF.md`, juste après la ligne qui commence par `> **Récupérer le travail.**` (donc avant `> **11/10, après-midi — plan 2A-4 fait`), insérer la ligne suivante, chaque `<…>` remplacé par sa valeur du Step 4 :

```markdown
> **<JJ/MM> — plan de l'intro vidéo fait : intro précalculée dans Blender** (`docs/superpowers/plans/2026-10-11-countrizz-intro-video-blender.md`, spec `docs/superpowers/specs/2026-10-11-countrizz-intro-video-blender-design.md`). Chronologie v2 (`web/src/intro/temps.ts`, `cadrages.ts`, `timeline.ts` : chute de 2,4 s en v³, point, frontière et drapeau) ; fabrique dans `web/scripts/intro/` (`npm run intro:sources`, `intro:keys`, `intro:temoins`, `intro:apercu`, `intro:rendu`, `intro:sprite`, `intro:encode`, `intro:planche`, `intro:avancement`) ; rendu Cycles sur le Mac : <HP> h en portrait (<NP> images à <SP> s/image), <HL> h en paysage (<NL> images à <SL> s/image) ; 10 vidéos versionnées dans `web/public/video/`, <TOTAL> octets en tout (la plus lourde `<SRC_MAX>` <OCT_MAX> o, la plus légère `<SRC_MIN>` <OCT_MIN> o ; plafonds dans `web/e2e-budget/plafonds-video.json`) ; lecteur (`web/src/intro/lecteur.ts`, `questions.ts`, `Intro.tsx` : affiche, variante par cadrage / cadence / codec, questions HTML « Capitale ? », « Pays ? », « Drapeau ? » en FR et en EN, nées du point, de la frontière et du drapeau, accueil direct à chaque échec, rien de compté onglet caché ; code du globe chargé à part, D15). Suite du Mac en local : `check` <U> passed, `test:data` <D> passed, `e2e:local` <E> passed ; build de production sous le nginx de l'image : e2e de l'intro et de la PWA 24 passed, budget 6 passed (démarrage, médiane de trois : <MB> ms sur une bonne connexion, <MF> ms en Fast 4G, non borné ; affiche <AFF> o ; accueil standard <TS> / 12 000 000 octets, haute <TH>). Revue finale (agent neuf) : <REVUE>. Décisions du plan validées à la relecture (spec §12) ; **reste à fixer par l'utilisateur** : un plafond pour le démarrage en Fast 4G et pour l'accueil « haute » (D14 n'en fixe pas ; mesurés, non bornés). Image `countrizz-web:1.7` à construire et déployer sur GO. **Suite : plan 2A-5 (écrans).**
```

Run : `node -e 'require("fs").readFileSync("docs/HANDOFF.md","utf8").split("\n").slice(4,10).forEach((l,i)=>console.log(i+5,l.slice(0,100)))'`. Expected : ligne 7 `> **Récupérer le travail.** …`, ligne 8 `> **<JJ/MM> — plan de l'intro vidéo fait : intro précalculée dans Blender** …` (la date réelle), ligne 9 `> **11/10, après-midi — plan 2A-4 fait : API du globe** …` ; la ligne 8 entière ne contient plus aucun gabarit `<…>`.

- [ ] **Step 6 : l'étiquette réellement en ligne, puis 1.7.** Run (lectures seules) :

```bash
ssh pablo1@192.168.1.171 "kubectl -n countrizz get deploy countrizz-web -o jsonpath='{.spec.template.spec.containers[0].image}'"; echo
for t in 1.6 1.7; do docker buildx imagetools inspect pablohassan/countrizz-web:$t >/dev/null 2>&1 && echo "$t publiée" || echo "$t absente"; done
```

Expected (au plan, le 11/10) : `pablohassan/countrizz-web:1.5`, `1.6 absente`, `1.7 absente`. Règle, qui donne `<PORTEE>` pour les Steps 7 et 9 : en ligne 1.5 et 1.6 absente → `<PORTEE>` = « l'API du globe (2A-4, la 1.6 jamais publiée) et l'intro vidéo » ; en ligne 1.6 → « l'intro vidéo » ; `1.7 publiée` → arrêt (le script refuserait), demander à l'utilisateur. Puis dans `deploy/k8s/countrizz.yaml`, remplacer `image: pablohassan/countrizz-web:1.6` par `image: pablohassan/countrizz-web:1.7`. Run : `node -e 'const t=require("fs").readFileSync("deploy/k8s/countrizz.yaml","utf8");console.log(t.match(/image: (pablohassan\/countrizz-web:\S+)/)[1])'`. Expected : `pablohassan/countrizz-web:1.7` (l'étiquette que lit `build-image.sh`, par la même expression). Commit :

```bash
git add docs/HANDOFF.md deploy/k8s/countrizz.yaml
git commit -m "déploiement : countrizz-web 1.7 (intro vidéo Blender) — passation"
```

- [ ] **Step 7 : GO de l'utilisateur, puis l'image.** Lui demander, et attendre un « oui » explicite : « Je construis l'image arm64 `pablohassan/countrizz-web:1.7` sur ce Mac et je la pousse sur Docker Hub (publique) par `deploy/scripts/build-image.sh` : build de production, calque `video` de <TOTAL> octets (+ `videos.json`), patchs image vérifiés, `docker buildx … --push`. Elle porte <PORTEE>. GO ? » Puis Run : `deploy/scripts/build-image.sh`. Expected : le build Vite, puis `video : 11 fichiers, <octets> octets` (les dix vidéos et `videos.json`, sous 150000000 ; au plan, sur les vidéos factices : `video : 11 fichiers, 19068626 octets`), `img-2048 : 197 fichiers, <octets> octets`, `img-1024 : 197 fichiers, <octets> octets` (au plan : `140436773` et `43034204`), `Patchs image vérifiés : 394 fichiers conformes à imagery.json.`, la poussée de buildx, et en dernière ligne `pablohassan/countrizz-web:1.7` ; code 0. Contrôle : `docker buildx imagetools inspect pablohassan/countrizz-web:1.7` montre `Platform:    linux/arm64` (plus une attestation `unknown/unknown`, comme la 1.5). Refus ou échec : arrêt et rapport ; rien n'est relancé sans lui.

- [ ] **Step 8 : nouveau GO, puis le déploiement.** Lui demander : « J'applique `deploy/k8s/countrizz.yaml` sur le cluster depuis rpi1 (`kubectl apply`, étiquette 1.7) et j'attends le déploiement. GO ? » Puis Run :

```bash
ssh pablo1@192.168.1.171 'kubectl apply -f -' < deploy/k8s/countrizz.yaml
ssh pablo1@192.168.1.171 'kubectl -n countrizz rollout status deploy/countrizz-web --timeout=300s'
ssh pablo1@192.168.1.171 "kubectl -n countrizz get deploy countrizz-web -o jsonpath='{.spec.template.spec.containers[0].image}'"; echo
curl -sI https://countrizz.fr/video/intro-portrait-60.av1.mp4
```

Expected (forme attendue, non relevée au plan) : `deployment.apps/countrizz-web configured` (le namespace, le service et la NetworkPolicy `unchanged`) ; `deployment "countrizz-web" successfully rolled out` ; `pablohassan/countrizz-web:1.7` ; puis, à travers le proxy .60, `HTTP/2 200`, `content-type: video/mp4`, `content-length:` les octets de cette variante (Step 4), `cache-control: public, max-age=3600, must-revalidate`, `accept-ranges: bytes`. (Au plan, avant ce déploiement : `/video/videos.json` répond `HTTP/2 404`, et un fichier statique déjà en ligne, `/intro/logo-terre.webp`, montre `accept-ranges: bytes` à travers le proxy.) Retour arrière si le site casse : remettre l'étiquette relevée au Step 6 dans `countrizz.yaml` et réappliquer, sur GO.

- [ ] **Step 9 : sur le site.** Run : `cd web && npm run e2e && npm run budget`. Expected : la préparation passe (pages de test ; `countries.json`, `imagery.json`, `borders.json`, `videos.json`, `ancres.json` identiques au dépôt ; HEAD et plage `bytes=0-1` des dix vidéos) ; `<E_SITE> passed`, aucun échec ni test sauté (sur le site, les trois de `pwa.spec.ts` tournent) ; puis le budget, `6 passed`, et ses lignes `démarrage (bonne connexion) : … médiane <MB_SITE> …`, `démarrage (Fast 4G) : … médiane <MF_SITE> …`, `total <TS_SITE> octets …` (standard), `total <TH_SITE> octets …` (haute). Un échec : superpowers:systematic-debugging (d'abord : le site sert-il la version de ce dépôt ? la préparation le dit) ; rien n'est changé en ligne sans GO. Puis, dans la ligne du Step 5 de `docs/HANDOFF.md`, remplacer la phrase

```markdown
Image `countrizz-web:1.7` à construire et déployer sur GO.
```

par

```markdown
**`countrizz-web:1.7` en ligne** (<JJ/MM>, GO de l'utilisateur ; elle porte <PORTEE>) : sur countrizz.fr, e2e <E_SITE> passed, budget 6 passed (démarrage <MB_SITE> ms, Fast 4G <MF_SITE> ms ; accueil standard <TS_SITE> octets, haute <TH_SITE>).
```

(les valeurs de ce Step et du Step 6). Commit :

```bash
git add docs/HANDOFF.md
git commit -m "passation : countrizz-web 1.7 en ligne, e2e et budget sur countrizz.fr — spec intro vidéo §7-8"
```

- [ ] **Step 10 : à la main (spec §8).** Proposer à l'utilisateur le contrôle sur un vrai téléphone, sur countrizz.fr (60 et 120 Hz s'il en a un) : l'intro se lit d'elle-même (iPhone en économie d'énergie : accueil direct, c'est attendu), les questions qui naissent du point, de la frontière et du mât (en français et en anglais), le fondu vers le globe, « Passer › ». S'il répond, ajouter à la fin de la ligne du Step 5 `Vérifié à la main par l'utilisateur le <JJ/MM> : <sa réponse, telle qu'il la donne>.`, puis `git add docs/HANDOFF.md && git commit -m "passation : intro vidéo vérifiée à la main sur téléphone"`. Sans réponse : rien à écrire.

---
