# Countrizz — intro en vidéo précalculée (Blender) · design

> Spec rédigé le 11/10/2026 à partir des réponses de l'utilisateur du même jour (sections 1, 1 bis, 2, 3 et 4 validées
> une à une). Il **amende** le spec de l'intro (`2026-10-10-countrizz-intro-pate-accueil-design.md`) là où il le dit
> (§11) ; ce qui n'y est pas amendé reste valable (accueil, vue « lever de Terre », `homeView`, démo dans `demo.html`).
> **Aucun code avant la validation de ce spec puis du plan.**

## 0. Objet et périmètre

L'intro en pâte à modeler n'est plus calculée dans le navigateur : elle devient une **vidéo précalculée**, rendue par
**Blender (Cycles)** à partir de la chronologie existante, **fluide à 120 images/s**, avec une **chute plus douce au
départ puis accélérée**, et des **bulles de questions** (« Capitale ? », « Pays ? », « Drapeau ? ») qui surgissent au
zoom sur la France pour faire le lien avec le jeu.

Dans ce plan :
- l'export de la chronologie en clés par image (`timeline.ts` → `intro-keys.json`) ;
- la scène Blender construite par script, son rendu (images témoins, prévisualisation, rendu final) et l'encodage ;
- la petite Terre animée du titre (24 vues) rendue dans Blender ;
- le lecteur vidéo du site (format, cadence, codec, fin, cas d'échec) et les bulles en HTML ;
- la suppression de la scène three.js de l'intro et de ses textures ;
- le budget révisé, les tests, le déploiement d'une nouvelle image.

Hors de ce plan : la PWA (plan B du spec de l'intro) ; les écrans du jeu (2A-5) ; tout changement du globe du jeu.

## 1. Décisions de l'utilisateur (ne pas les rouvrir sans lui)

| Date | Décision |
|---|---|
| 11/10 | **Vidéo précalculée** au lieu du rendu en temps réel (annule la décision du 09/10 « rendu en temps réel, pas de vidéo ») |
| 11/10 | **Blender (Cycles)** pour la qualité (option B), plutôt qu'une capture de la scène three.js |
| 11/10 | **Fluide, pâte vivante** : plus de stop motion à 12 i/s ; la pâte garde sa matière et un léger frémissement continu |
| 11/10 | **Deux vidéos** (portrait, paysage), plein écran avec rognage des bords, **fondu** vers l'accueil sans raccord géométrique exact |
| 11/10 | Rendu maître à **120 i/s** ; deux encodages, **60 et 120 i/s** ; le 120 n'est servi qu'aux écrans ≥ 100 Hz |
| 11/10 | **Chute** lente au départ puis accélérée (≈ 2,4 s au lieu de 1,6 s) |
| 11/10 | **Bulles** aux trois modes du jeu : point → « Capitale ? », frontière → « Pays ? », drapeau → « Drapeau ? », puis chacune se retourne sur sa réponse (Paris, France, 🇫🇷) ; la vignette « France / Paris » disparaît |
| 11/10 | Bulles en **HTML** par-dessus la vidéo (bilingues, nettes) ; titre « Countrizz » du milieu et étoiles **dans la vidéo**, en pâte |
| 11/10 | Rendu **sur le Mac** (M4 Pro, 48 Go) ; vidéos **versionnées** dans le dépôt |
| 11/10 | Le **jeu et son globe restent en WebGPU** (WebGL 2 en repli) ; l'intro n'utilise plus aucun moteur 3D |
| 10/10 (inchangé) | Jouée à chaque visite ; toujours la France, Paris ; mouvement réduit : rien de particulier ; « Jouer » ouvre la démo jusqu'au 2A-5 |
| 11/10 | Planche des témoins validée : « oui ça me paraît plutôt ok » (planche des mêmes témoins montrée à l'utilisateur ; celle du dépôt est identique à l'œil) ; rendu final à 128 échantillons (≈ 4,4 h, ≈ 5,9 Go de PNG) |
| 12/10 | Aperçu validé : « tout me paraît ok » ; seconde de plus pour les bulles : non (les bulles elles-mêmes sont refusées le même jour, ligne suivante) |

## 2. Chaîne de fabrication

```
timeline.ts ──(Node)──► intro-keys.json ──(Blender -b -P)──► PNG 120 i/s ──(ffmpeg)──► vidéos + affiches
 source unique           1 clé / image / format       Cycles, 2 cadrages          AV1 + HEVC, 60 et 120
```

1. **Une seule chorégraphie : `web/src/intro/timeline.ts`.** Blender ne décide rien : il rejoue des clés.
2. **Export des clés** (script Node dans `web/scripts/intro/`) : `timeline.ts` évalué à chaque 1/120 s pour les deux
   cadrages de référence, **portrait 1080 × 2340** et **paysage 1920 × 1080** (px de la vidéo). Pour chaque image :
   caméra (position, orientation, champ), écrasement de la Terre, rotation, nuages, point, avancée de la frontière,
   drapeau, lettres des deux titres, étoiles. Les **ancres des bulles** (point, milieu de la frontière, haut du mât, en px
   de la vidéo) sont exportées à part pour le lecteur (`web/public/intro/ancres.json`, fenêtre des bulles seulement). L'export est
   déterministe : deux exports donnent les mêmes octets.
3. **Scène Blender construite par script Python versionné** (`web/scripts/intro/blender/`), lancé par
   `/Applications/Blender.app/Contents/MacOS/Blender -b -P …` (Blender 5.0.1 sur le Mac) ; pas de `.blend` fait à la
   main. Sources : celles de la fabrique actuelle (relief GEBCO, peintures du monde et de l'Europe, contour de la France),
   à plus haute définition puisque le site ne les charge plus. Elle construit :
   - la Terre en pâte : déplacement du relief exagéré, matériau translucide (diffusion sous la surface) légèrement satiné,
     empreintes de doigts, frémissement continu très léger ;
   - nuages en boules de pâte, point rouge, frontière en boudin jaune avec sa perle, drapeau tricolore ondulant ;
   - étoiles en billes de pâte jaunes ;
   - les lettres « Countrizz » en pâte (police Chango, OFL — le fichier du site `web/public/fonts/chango-latin.woff2`, que Blender 5.0.1 lit tel quel : D6) : le logo
     C🌍untrizz du milieu et le titre de fin où la Terre se loge.
4. **Rendu Cycles (Metal) sur le Mac** : vrai flou de mouvement, débruitage, sans profondeur de champ (D10). Fond rendu
   **transparent**, la nuit `#16173a` est posée à l'encodage (couleur exacte, même que l'accueil). Le rendu **reprend où
   il s'est arrêté** (images déjà faites gardées). Trois niveaux :
   - **images témoins** : quelques instants clés à pleine qualité, pour **mesurer** le temps par image et régler
     échantillons et débruitage — cible : le rendu final des deux cadrages en une nuit au plus ;
   - **prévisualisation** : toute l'intro en basse qualité, pour juger le rythme ;
   - **rendu final** : 120 i/s, deux cadrages.
5. **Encodage ffmpeg** : par cadrage, 60 et 120 i/s, en **AV1** (`libsvtav1`) et **HEVC** (`libx265`, étiquette
   `hvc1` pour Safari) ; une **affiche** WebP (première image) par cadrage. Vidéos et manifeste dans `web/public/video/` (hors du service worker : D1), affiches dans `web/public/intro/`,
   versionnées ; les PNG restent hors du dépôt (dossier ignoré par git).
6. **Petite Terre du titre** (`logo-terre.webp`, 24 vues d'un tour) : rendue dans la même scène Blender.
7. **Commande unique** par étape (`npm run intro:keys`, `intro:temoins`, `intro:apercu`, `intro:rendu`, `intro:encode`),
   chacune documentée en tête de son script.

## 3. Chorégraphie

On garde le déroulé du 10/10 au soir (double dézoom), avec ces changements :

1. **Chute** : ≈ 2,4 s (au lieu de 1,6 s). La Terre descend d'abord presque en flottant, grande, puis accélère fort
   jusqu'à l'impact (position en `v³` au lieu de `v²`). Plus de flou CSS : le flou de mouvement de Cycles la rend nette
   quand elle flotte et filée quand elle file. L'étirement suit la vitesse (ronde, allongée juste avant l'impact, puis
   écrasée). Tout ce qui suit est décalé d'autant (≈ + 0,8 s).
2. **Fluidité** : plus de quantification à 12 i/s (`INTRO.IPS` disparaît) ; le frémissement devient une ondulation
   continue et lente de la surface ; plus de tremblé de la lumière. La toupie garde sa vitesse et son freinage.
3. **Bulles** (HTML, §5) : ≈ 0,3 s après chaque apparition — point → « Capitale ? », frontière → « Pays ? »,
   drapeau → « Drapeau ? » ; puis elles se retournent l'une après l'autre sur Paris, France, 🇫🇷 ; elles se rangent avec
   le reste au second dézoom. Les instants sont des constantes de `timeline.ts`. L'intro peut gagner ≈ 1 s si le rythme
   est trop serré (jugé sur la prévisualisation).
4. **Fin** : le second dézoom loge la Terre dans le « o » d'un titre « Countrizz » en pâte, placé où est le titre de
   l'accueil sur l'écran de référence de chaque cadrage ; puis fondu vers l'accueil HTML. Les cibles des deux « o »
   deviennent des constantes de chaque cadrage (plus de mesure dans la page).
5. **Durée** : ≈ 20 s (≈ 21 s avec la seconde de plus des bulles), dans les 20-25 s du 09/10.

Validation par l'utilisateur, dans l'ordre : planche d'images témoins, puis prévisualisation complète ; le rendu final
ne part qu'après son accord.

## 4. Lecteur vidéo du site

- **Premier écran** : fond `#16173a` et l'affiche du bon cadrage, tout de suite.
- **Cadrage** : fenêtre plus haute que large → portrait ; sinon paysage. `object-fit: cover` (bords rognés).
- **Cadence** : avant de lancer la vidéo, ≈ 0,15 s de mesure de l'intervalle entre images de l'écran
  (`requestAnimationFrame`) ; ≥ 100 Hz → 120 i/s, sinon 60.
- **Codec** : la variante la plus économe, puis la plus fluide, AV1 avant HEVC à égalité (D11) ; `<video muted playsinline>`
  lancée par `play()`, sans attribut `autoplay` (D13).
- **Globe** : monté caché dès que son code est arrivé (import différé : D15), chargé pendant la vidéo ; la vidéo est décodée par le circuit vidéo,
  le GPU reste au globe.
- **Synchronisation** : bulles, montage de l'accueil et fondu suivent l'image affichée (`requestVideoFrameCallback`,
  `currentTime` en repli).
- **« Passer › »** : saute à la fin (accueil monté, fondu).
- **Fin** : l'accueil HTML se monte 1,2 s avant le fondu, comme aujourd'hui (`ACCUEIL` 16,2 s, `FONDU` 17,4 s, décalés
  avec la chute) ; la vidéo fond vers le vrai globe
  en rotation légère ; la petite Terre animée du titre prend le relais. **Globe pas prêt** : la vidéo reste sur sa
  dernière image (pause), l'accueil monté par-dessus ; le fondu part dès que le globe est prêt. **Erreur du globe** :
  l'écran d'erreur existant (« Réessayer ») sous l'accueil.
- **Accueil direct sur le globe** si : lecture automatique refusée (`play()` rejeté, ex. mode économie d'énergie
  d'iOS) ; aucune image au bout de 8 s ; vidéo en erreur ou aucun codec lisible ; plus de 8 s sans progrès en cours de
  lecture (avant cela, les bulles attendent avec la vidéo).
- **Mouvement réduit** : rien de particulier (décision du 10/10).
- **Crochets de test** (dev ou drapeau `countrizz:e2e`, comme aujourd'hui) : `?introT=13` place la vidéo à 13 s en
  pause ; `window.__intro` donne `t`, `ready`, `skipped` et la variante choisie (cadrage, cadence, codec).

## 5. Bulles de questions

- Textes des catalogues : `modes.capital`, `modes.country`, `modes.flag` suivis de « ? » ; réponses « Paris »,
  « France » (identiques en FR et EN) et le drapeau 🇫🇷. Style de l'accueil (Chango, couleurs, inclinaison, élan).
- Chaque bulle pointe vers son ancre (`ancres.json`), convertie du repère de la vidéo vers l'écran selon le
  rognage `cover` de la fenêtre courante ; recalculée au redimensionnement.
- Les bulles sont décoratives pour les lecteurs d'écran (`aria-hidden`) ; la vidéo porte un `aria-label`.

## 6. Ce qui disparaît du site

`web/src/intro/scene.ts`, `web/src/intro/boxes.ts`, la mesure des « o » dans la page, le double invisible du titre, la
vignette, les étoiles en DOM, et les textures de l'intro dans `public/intro/` (`monde.jpg`, `europe.jpg`, `relief.jpg`,
`relief-fin.jpg`, `france.json`) — elles restent des **sources** de la fabrique (régénérables), plus des fichiers servis.
`timeline.ts` reste (source des clés et de l'horloge des bulles), sans `IPS`.

## 7. Budget (amende le §7 du spec de l'intro)

- **Démarrage** : affiche + début de la vidéo → première image en < 1 s sur une bonne connexion, mesurée en temps de
  première image (médiane de 3, 40 ms par requête, 10 Mbit/s) ; affiche ≤ 100 000 octets (D14).
- **Chaque vidéo** (portrait/paysage × 60/120 × AV1/HEVC) a son plafond, fixé au plan après mesure : la meilleure
  qualité qui reste fluide en 4G.
- **Le reste du premier chargement** (globe, données, code) garde le plafond de 12 Mo en « standard » ; la vidéo n'y
  est pas comptée (lue en flux pendant le chargement du globe).
- Le test de budget mesure tout cela sur le site déployé.

## 8. Tests

- **Unitaires (Vitest)** :
  - chronologie : la chute part plus lentement qu'avant et sa vitesse croît jusqu'à l'impact ; continuité aux bornes de
    phase ; bulles dans l'ordre Capitale, Pays, Drapeau puis retournement ; durée totale ≈ 20 s (test : entre 19 et 25 s, D12) ;
  - export : une clé par 1/120 s, sortie déterministe, ancres dans le cadre ;
  - lecteur : cadrage selon la fenêtre, cadence selon l'intervalle mesuré, la plus économe puis la plus fluide, AV1 avant HEVC à égalité (D11), conversion des ancres par le
    rognage `cover`, chaque cas d'échec du §4 mène à l'accueil direct.
- **Fabrique (sur le Mac, hors suite)** : rendu « aperçu » de quelques images basse définition (la scène se construit) ;
  contrôle de l'encodage (durée, cadence, résolution, codec lus par `ffprobe`) ; fond de la vidéo à ± 3 de `#16173a`.
- **Bout en bout sur countrizz.fr (Playwright)** : la vidéo mène à l'accueil ; « Passer › » ; bulles en FR et en EN aux
  bons instants, posées sur leur ancre (instants figés par `?introT=`) ; globe lent → dernière image puis fondu ;
  vidéo absente ou refusée → accueil direct ; globe en rotation après le fondu ; « Jouer » ouvre la démo ; e2e du globe
  (WebGPU et WebGL 2) inchangés. Les images de référence de l'intro three.js sont remplacées par ces contrôles.
- **Budget** : §7.
- **À la main** : sur un vrai téléphone (60 et 120 Hz si possible), sur countrizz.fr déployé.

## 9. Risques connus

- **Temps de rendu** inconnu tant que les images témoins ne sont pas mesurées ; le plan règle la qualité sur cette
  mesure (pas l'inverse).
- **Poids des vidéos** : à 120 i/s, le plafond peut forcer à baisser le débit ; le 60 i/s reste la version de tous les
  écrans courants.
- **Lecture automatique** refusée sur certains iPhone (économie d'énergie) : accueil direct, sans intro.
- **HEVC** : sa lecture par Chromium sans décodeur matériel n'est pas garantie ; l'AV1 y est lu (décodeur logiciel) — les
  e2e (Chromium) forcent une variante AV1 et ne dépendent pas de HEVC (D6).

## 10. Contraintes globales

- Pile inchangée côté site (React 19, three 0.186.1 pour le globe, Vite, Vitest, Playwright) ; aucun nouveau paquet npm
  sans accord.
- Outils de fabrique sur le Mac : Blender 5.0.1, ffmpeg (encodeurs `libsvtav1`, `libx265`).
- Branche `newcountri` ; jamais de fusion dans `Master` ; rien poussé sans accord ; déploiement avec GO de l'utilisateur.

## 11. Amendements au spec de l'intro (2026-10-10)

| § intro | Avant | Après |
|---|---|---|
| 1 (09/10) | rendu en temps réel, pas de vidéo | **vidéo précalculée, Blender** |
| 2 | stop motion à 12 i/s | **fluide, 120 i/s** (60 servi aux écrans < 100 Hz) |
| 2 (déroulé) | chute 1,2 → 2,8 s ; vignette « France / Paris » | **chute ≈ 2,4 s accélérée ; bulles Capitale/Pays/Drapeau** |
| 2 (format) | l'intro remplit la fenêtre, tailles en `U` | **deux cadrages fixes, `cover`, fondu** |
| 3 | Terre en pâte three.js dans le navigateur | **Terre en pâte Blender, dans la vidéo** |
| 6 | fabrique des textures servies | **sources de la fabrique Blender**, plus servies |
| 7 | intro prête ≤ 3 Mo | **§7 de ce spec** |
| 9 | images de référence de l'intro à des instants figés | **contrôles des bulles et des étapes** |

## 12. Décisions du plan (validées à la relecture du plan `docs/superpowers/plans/2026-10-11-countrizz-intro-video-blender.md`)

| | Décision |
|---|---|
| D1 | Vidéos et manifeste dans `web/public/video/`, hors du service worker et de l'empreinte `CACHES.lourd` ; calque d'image à part ; hors ligne : accueil direct |
| D2 | Variante portrait légère 720 × 1560 à 60 i/s (AV1 et HEVC), servie quand la 1080 n'est ni fluide ni économe : 10 vidéos |
| D3 | 120 i/s seulement si l'intervalle mesuré est ≤ 10 ms et que le décodage à 120 est économe ; Safari (≈ 60 Hz par défaut) reçoit 60 |
| D4 | Drapeau des bulles : l'image `/data/flags/fra.svg` (l'émoji n'est pas rendu sous Windows) |
| D5 | Titre de fin en pâte dans la vidéo ; le titre HTML de l'accueil reste invisible jusqu'au fondu puis entre en fondu ; la petite Terre repart de l'angle de la vidéo |
| D6 | Blender lit la police WOFF2 du site ; les e2e (Chromium) lisent l'AV1 et ne dépendent pas de HEVC |
| D7 | Images rendues en PNG RGBA 8 bits ; AV1 en 10 bits |
| D8 | Vidéo portrait calée en haut (`object-position: 50% 0`), paysage centrée ; ancres converties par la même règle |
| D9 | Échantillons réglés sur la mesure des images témoins ; au-delà de ≈ 10 h de rendu, l'utilisateur choisit (moins d'échantillons ou deux nuits) |
| D10 | Pas de profondeur de champ (les lettres sont à 2 unités de la caméra, la Terre à ≥ 4,27) |
| D11 | Ordre d'essai des variantes : économe, puis fluide, puis lisible ; AV1 avant HEVC à égalité |
| D12 | Fin à 19,8 s (≈ 20 s) |
| D13 | `<video muted playsinline>` sans `autoplay`, `src` posé en JS puis `play()` |
| D14 | Démarrage ≤ 1000 ms (médiane de 3, 40 ms par requête, 10 Mbit/s) et affiche ≤ 100 000 o ; débit plafonné à 4000 kb/s, CRF de départ 30 (AV1) / 22 (HEVC) |
| D15 | `GlobeView` chargé par import différé pour tenir le démarrage |
