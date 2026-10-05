# Brief de conception : interface de la phase 2A (Countrizz)

**Ce qui a été relu.** Tout est en lecture seule, sur la branche `newcountri` (HEAD 659cc2d, arbre propre) :
- dans le dépôt : `docs/HANDOFF.md`, le spec, `GlobeView.tsx`, `credits.tsx`, `index.html`, `main.tsx`, `camera/{config,framing,director,flight}.ts`, `globe/{controller,reveal,beacon,clouds,renderer,postprocessing}.ts`, `countryLayer.ts:55-98`, `credit.spec.ts`, `playwright.config.ts` et `package.json` ;
- au commit 2d62fc2 : `ButtonPlay.css/.jsx`, `App.css:1-8,100-175`, `Reponse.css` et les composants `Home`, `Modejeu`, `Bravo`, `Loose`, `Header`, `TableauScores`, `NomDuJoueur`, `Countdown`, `GameCountdown`.

Les chiffres marqués **[recalculé]** viennent de scripts node du scratchpad (`verif.cjs`, `verif2.cjs`, `vols.mjs`). La mention **[non vérifié, lecteur X]** signale une valeur reprise d'un rapport sans contrôle de ma part.

**Géométrie utilisée.** Modèle sténopé, d'après `framing.ts:19-35` et `config.ts:5,12` :
- f = (H/2) / tan 25° ;
- rayon à l'écran d'une calotte θ = f · sin θ / (D − cos θ), avec D = 1 + altitude.

---

## 1. Contraintes dures

1. **Un seul canvas plein écran**, mesuré par ResizeObserver, avec la couche React au-dessus (spec:191).
   - `GlobeView` rend un div `position:absolute; inset:0` (`GlobeView.tsx:91`). Il faut le monter une seule fois pour toute la session. Le démonter recrée le renderer, recharge les textures et retire le crédit.
   - Aucun z-index : c'est l'ordre du DOM qui décide (Canvas, voile d'erreur, crédit, voile de coupe ; `GlobeView.tsx:92-119`). Une couche UI placée après `GlobeView` peint donc par-dessus le crédit.
2. **Portrait d'abord** (spec:192) : score et chrono en haut, globe au centre, réponses en grille 2×2 en bas, à portée de pouce. Zones sûres, `100dvh`, cibles d'au moins 48 px, aucun effet qui dépende du survol, « vibration légère où c'est possible ».
   - Déjà en place : `viewport-fit=cover` et `html, body, #root { margin: 0; height: 100dvh; background: #000; overflow: hidden; }` (`index.html:5,7`).
3. **Clavier, accessibilité, nom** : touches 1 à 4, `aria-live` pour le retour, nom du joueur mémorisé en local (spec:193 ; HANDOFF:14).
4. **Crédit EOX jamais recouvert, sur aucun écran.** Le contrôle se fera par `elementFromPoint` (HANDOFF:14-15).
   - Aujourd'hui : `<footer role="contentinfo" aria-label="Crédits de l’imagerie">`, en `right: 8` et `bottom: calc(4px + env(safe-area-inset-bottom, 0px))`. Il porte `maxWidth: calc(100% - 16px)`, la police `10px/1.3 sans-serif`, la couleur `rgba(255, 255, 255, 0.7)` et `textShadow: 0 0 2px #000` (`credits.tsx:13-24`).
   - Texte, en anglais, à reprendre mot pour mot et avec son lien : « EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025) ». Il fait 111 caractères [recalculé] (`credits.tsx:2-8`).
   - `credit.spec.ts:7-15` contrôle, en 390×844, le rôle, le nom accessible, le texte, le href et `x + width ≤ 390`. Il ne contrôle pas le recouvrement.
   - L'encombrement réel n'a pas été mesuré. À 360 px de large, il prend vraisemblablement 2 lignes de 13 px [non vérifié].
5. **Bilingue FR/EN** : catalogues `web/src/i18n/fr.ts` et `en.ts` d'un même type, langue du navigateur et choix mémorisé (HANDOFF:13).
   - `<html lang="fr">` est écrit en dur (`index.html:2`).
   - Textes français en dur dans le globe : `GlobeView.tsx:59`, `GlobeView.tsx:110`, `GlobeView.tsx:111` et l'aria-label de `credits.tsx:15`.
6. **Déroulé imposé** (HANDOFF:14) :
   - accueil : globe en rotation lente, nom mémorisé, FR/EN, « Jouer », crédit ;
   - choix du mode : Drapeau (4 drapeaux), Pays (4 noms), Capitale (4 capitales), meilleur score affiché ;
   - 3-2-1 ;
   - manches : vol (chrono en pause, réponses masquées, suivant préchargé), puis question (pays allumé, grille 2×2, touches 1 à 4, chrono), puis révélation de 1,5 s (vert et flash, ou rouge et pulsation, bonne réponse montrée, `aria-live`) ;
   - fin à 60 s nettes : la question en cours n'est pas comptée ; écran avec score, bonnes/total, « Nouveau record ! », et les boutons Rejouer, Changer de mode, Scores ;
   - scores : top 10 local par mode.
   - Le chrono se met aussi en pause quand l'onglet est caché. « Quitter » part sans confirmation. Pas de son.
7. **Règles** : +10 points par bonne réponse ; les boutons deviennent actifs quand `flyTo` se résout (spec:179-180).
8. **Aucun nouveau paquet** (HANDOFF:13). Les dépendances actuelles sont `@react-three/fiber`, `d3-interpolate`, `react`, `react-dom` et `three` (`package.json`). Donc ni routeur, ni bibliothèque i18n, ni police en paquet.
9. **Style imposé** : spec:190 et HANDOFF:68 ; le détail est au §3.
10. **Retraits** : « Le Gruppetto », GIF Rick & Morty, Lottie (spec:40).
11. **Testabilité** :
    - les specs n'utilisent que rôles et noms accessibles, aucun `data-testid` [non vérifié, lecteur e2e-dependances] ;
    - il faut un signal DOM « globe prêt » pour remplacer « Pays suivant » (`main.tsx:53`), par exemple « Jouer » activé après `onReady` ;
    - `?webgl` est lu dans `location.search` (`GlobeView.tsx:76`) et doit survivre à la navigation ;
    - Playwright tourne par défaut en locale « Defaults to `en-US` » (`playwright/types/test.d.ts:7577`) : si l'interface suit le navigateur, les textes français attendus par les specs sortiront en anglais ;
    - formats testés : 360×640, 390×844, 800×450, 960×600 et 480×300 [non vérifié, lecteur e2e-dependances].

---

## 2. Inventaire des écrans

L'API existante est `GlobeHandle` : `flyTo`, `prefetch`, `showQuestion`, `answer`, `clear`, `overview`, `setIdleSpin` (`GlobeView.tsx:22-30`). Les props sont limitées à `ref`, `framing` et `onReady({backend, tier})` (`GlobeView.tsx:48-52`).

| # | Écran | Ce qu'il affiche | Ce que fait le globe dessous |
|---|---|---|---|
| 0 | Chargement (avant `onReady`) | Hors du déroulé (l'intro est en 2B). À décider : titre et « Jouer » désactivé ? | Rien de visible avant les textures. `onReady` part en `GlobeView.tsx:163`. **Manque** : `onLoading` et `onError`. |
| 1 | Accueil | Titre, champ du nom (`maxLength` 12, comme `name ≤ 12` de spec:233), FR/EN, « Jouer », accès Scores et Crédits (à décider), crédit EOX. | Vue d'ensemble au départ `[2.35, 30]` (`controller.ts:47`), altitude 2,2 en portrait et 1,4 si W ≥ H (`framing.ts:26-27`). Appeler `setIdleSpin(v)`. Aucune vitesse par défaut dans `config.ts`. La rotation ne tourne que hors vol et n'est pas coupée en mouvement réduit (`director.ts:123-126`). Au retour d'une partie, il faut `clear()` puis `overview()`, car `overview` seul laisse le pays (`GlobeView.tsx:85`). Ensuite seulement `setIdleSpin`, car tout vol remet la rotation à 0 (`director.ts:79`). |
| 2 | Choix du mode | Titre, 3 boutons avec le meilleur score local, retour. | La rotation continue ; rien à appeler. |
| 3 | 3-2-1 | 3, 2, 1, puis « GO » ou non. | `prefetch(premier pays)` est possible (`controller.ts:99-104`). Le spec §6.4 (spec:200) place ce compte à rebours « dans la scène », donc en 2B. |
| 4 | Vol | HUD (score, chrono figé, Quitter), réponses masquées, consigne à décider. | `prefetch(suivant)` puis `await flyTo(pays)`, durée bornée 1500 à 3500 ms (`config.ts:15`) ; mesures ci-dessous. Le pays est masqué : `flyTo` remet la chronologie à `null` (`controller.ts:81`) et `lookAt(null)` rend `visible: false` (`reveal.ts:13`). Nuages ramenés à 1 pendant le vol, effacés en 800 ms après l'arrivée (`controller.ts:92,95` ; `clouds.ts:12`). Pour un micro-État, la balise apparaît dès le début du vol (`controller.ts:93,148`) : 56 px, anneau jaune pulsant, cœur blanc, faisceau (`beacon.ts:10-11,34-39`). En mouvement réduit, le vol devient une coupe sous un voile noir de 250 ms (`flight.ts:36` ; `GlobeView.tsx:115-118`). **Manque** : la durée du vol n'est pas exposée, donc pas de jauge de vol possible. |
| 5 | Question | HUD avec chrono actif, consigne selon le mode, 4 réponses en 2×2 numérotées de 1 à 4. | `showQuestion()` lance une vague de 600 ms en courbe `1 − (1 − e)³` (`reveal.ts:4,14-15`). Pays jaune `vec3(1.0, 0.933, 0.012)`, rempli à 0.63 avec une lueur jusqu'à 0.35, liseré de 1,5 px environ (`countryLayer.ts:63-74`). Caméra fixe. Le pays est au centre du canvas. |
| 6 | Révélation (1,5 s, minutées par le jeu) | Choix en rouge s'il est faux, bonne réponse en verte, message `aria-live`, score. | `answer('correct' \| 'wrong')`, sans effet si `showQuestion` n'a pas été appelé avant (`controller.ts:123-125`). Vert `vec3(0.18, 0.8, 0.44)` avec flash du contour `exp(−3t)`. Rouge `vec3(0.91, 0.3, 0.24)` pulsé à `sin(t·4π)·0.25 + 0.75`, soit 2 Hz, sans fin (`countryLayer.ts:69-72`). **Attention** : sur une erreur, c'est le pays cible, donc la bonne réponse, qui devient rouge sur le globe pendant que le bouton correct passe au vert. **Manque** : le « léger rapprochement » du spec (spec:173). Ensuite `flyTo(suivant)`, qui coupe la pulsation. |
| 7 | Fin (chrono à 0, donc pendant une question) | Score, bonnes/total, « Nouveau record ! », Rejouer, Changer de mode, Scores. | `clear()` : nuages à 1, pays, patch et balise retirés, caméra immobile (`controller.ts:135-140`). Puis `overview()`, puis `setIdleSpin(v)`. |
| 7b | Quitter (à tout moment) | Retour à l'accueil. | Pendant un vol, `overview()` remplace le vol, et la promesse du `flyTo` se résout comme une arrivée (`director.ts:64,78`). Le jeu doit donc ignorer la suite de la manche abandonnée. |
| 8 | Scores | Top 10 local par mode, ligne du joueur mise en évidence. | Vue d'ensemble et rotation. Aucune pause de rendu à la demande : seul l'onglet caché coupe le rendu (`GlobeView.tsx:136-141`). |
| 9 | Crédits | Contenu de `credits.json` (HANDOFF:15) : Natural Earth, mledoze ODbL 1.0, Wikidata, 66 entrées geoBoundaries sous 9 licences, 5 couches de `textures/credits.json`, EOX CC BY-NC-SA 4.0 [non vérifié, lecteur donnees-ressources]. C'est une longue liste à faire défiler dans `100dvh`. | Identique à l'écran 8. |
| 10 | Navigateur non compatible | Aujourd'hui, une error boundary (`getDerivedStateFromError`, qui attrape toute erreur du sous-arbre) rend `<p className="globe-unsupported">Ton navigateur ne peut pas afficher le globe : il faut WebGPU ou WebGL 2.</p>` (`GlobeView.tsx:54-62`). Aucune couleur n'est définie : `index.html:7` ne fixe que le fond `#000`. Le crédit disparaît avec le sous-arbre. | Pas de globe. |
| 11 | Échec de chargement | Après 3 tentatives espacées de 800 ms (`GlobeView.tsx:157`) : voile `role="alert"` plein cadre, `#16173a`, texte `#f7dc6f` en sans-serif, « Le globe n’a pas pu se charger (réseau ?). » et un bouton « Réessayer » sans style (`GlobeView.tsx:108-113`). Le crédit passe au-dessus (`GlobeView.tsx:114`). | « Réessayer » recrée le renderer. `onReady` est rappelé : le traiter de façon idempotente. |
| 12 | Perte du GPU | Pas d'écran. | Le Canvas est recréé et le contrôleur garde la partie (`GlobeView.tsx:75,100-101`). Le chrono doit-il se mettre en pause pendant ce temps ? À décider. |

**Durées de vol** [recalculé avec `d3.interpolateZoom`, ρ = √2] :
- 390×844 : départ→FRA 1500 ms ; FRA→JPN 2164 ms ; JPN→FJI 2199 ms ; RUS→CHL 2445 ms ; FRA→BEL 1500 ms.
- 1440×900 : FRA→JPN 2112 ms ; JPN→FJI 2148 ms ; RUS→CHL 2030 ms.

**Après un onglet caché**, un vol en cours saute à sa fin : t est calculé sur l'horloge réelle (`director.ts:112`).

---

## 3. Style cartoon : valeurs exactes de l'ancienne interface (2d62fc2)

**Jetons et police**
- `--background-color #16173a` ; `--Main-Font-Color #f7dc6f` (`App.css:3-5`).
- Chango chargée par `@import url("https://fonts.googleapis.com/css2?family=Chango&display=swap")` (`App.css:1`).
- Écrite `"Chango", cursive` aux lignes `App.css:105,115,125`, mais `"chango"` sans repli dans `ButtonPlay.css:12`.
- Poppins:900i est importée (`ButtonPlay.css:1`) ; inutilisée [non vérifié, lecteur ancienne-ui].
- Aucun fichier de police dans le dépôt actuel : `web/public/fonts` n'existe pas [recalculé].

**Bouton principal `.cta`** (`ButtonPlay.css:8-21`)
- `display: flex` ; `padding: 10px 20px` ; Chango 30px ; blanc ; fond `#6225e6` ; `transition: 1s`.
- `box-shadow: 6px 6px 0 black` ; `transform: skewX(-15deg)` ; `margin: 10px` ; `max-width: 800px`.
- Libellé `.BtnPlay` en `skewX(15deg)` (`ButtonPlay.css:42-44`).
- Au survol : `box-shadow: 10px 10px 0 var(--Main-Font-Color)` en 0.5s (`ButtonPlay.css:27-30`) ; le second span passe de `margin-right: 0` à `45px` (`ButtonPlay.css:32-40`).
- `.cta:focus { outline: none; }` (`ButtonPlay.css:23-25`) : à **ne pas** reprendre.

**Chevrons**
- SVG `width="66px" height="43px" viewBox="0 0 66 43"`, trois paths `fill="#FFFFFF"` de classes `one`, `two`, `three` (`ButtonPlay.jsx:11-33`).
- Au repos : `one` en `translateX(-60%)` (0.4s), `two` en `translateX(-30%)` (0.5s) (`ButtonPlay.css:53-61`).
- Au survol : `translateX(0%)` et `color_anim 1s infinite`, avec un délai de 0.2s pour `three`, 0.4s pour `two`, 0.6s pour `one` (`ButtonPlay.css:63-75`).
- `@keyframes color_anim` : white, puis `var(--Main-Font-Color)` à 50 %, puis white (`ButtonPlay.css:77-89`).
- Conteneur `span:nth-child(2)` : `width: 20px` ; `margin-left: 30px` ; `top: 12%` (`ButtonPlay.css:46-51`).
- Sous 500 px : 22px, `padding: 10px 15px`, `box-shadow: 5px 7px 0 black`, `margin: 8px` [non vérifié, lecteur ancienne-ui, `ButtonPlay.css:178-196`].

**Ombres de texte**
- Grands titres `.titre` et `.titre-splash` : Chango 4rem `#f7dc6f`, `text-shadow: -6px 4px 2px rgb(11, 13, 15)` (`App.css:104-122`).
- Score et question : `text-shadow: 5px 2px 1px black` (`Header.css:42,48,61` ; `Questions.css:10,23`) ; question sous 500 px : `5px 2px 2px black` (`Questions.css:35`).
- Taille de la question : 30px ; 26px de 500 à 676 px ; 22px sous 500 px (`Questions.css:2,17,29`).

**Réponses `.ctaRep`** (non inclinées)
- Chango 20px blanc, `text-shadow: 2px 1px 5px black`, fond `#6225e6be`, `box-shadow: 3px 3px 0 black`, `border-radius: 15px`, `max-width: 290px`, `max-height: 85px` (`Reponse.css:27-42`).
- Dans les media queries :

  | Plage | Police | Largeur |
  |---|---|---|
  | ≥ 678 px | 18px | 250px |
  | 460 à 677 px | 18px | 210 à 245px |
  | 390 à 460 px | 18px | 170 à 200px |
  | < 390 px | 16px | 155 à 160px |

  `min-height` vaut 95px, et 90px pour les variantes vert et rouge sous 390 px (`Reponse.css:126-134, 221-229, 317-325, 412-421, 461, 478`).
- Grille : `repeat(2, 1fr)` × 2, `grid-column-gap: 15px`, `grid-row-gap: 2px` (`Reponse.css:1-7`).
- Révélation : `.greenBtn` fond `green`, `.redBtn` fond `red`, 22px, `padding: 10px 20px`, `box-shadow: 6px 6px 0 black`, rayon 15px, aucune animation, seulement `transition: 1s` (`Reponse.css:67-97`).

**Chrono `.BtnGameCountdown`**
- 50×50, `border-radius: 100%`, fond `#ff5722`, Chango 35px blanc, `text-shadow: 2px 1px 5px black`, `box-shadow: 6px 6px 0 black` (`App.css:154-174`).
- Démarrait à 61 (`GameCountdown.jsx:34`).

**En-tête de jeu** : `{playerName}` puis `score {score}` (`Header.jsx:7-9`).

**Champ du nom** : placeholder « Entrez votre nom », `maxLength="12"`, `required` sans formulaire (`NomDuJoueur.jsx:6-14`). Style : Chango `#f7dc6f` sur `#16173a`, bordure `#f7dc6f`, rayon 2px, clignotement de 2.5s [non vérifié, lecteur ancienne-ui].

**Compte à rebours Lottie** « 3 2 1 GO »
- 300×300, 30 images/s, `op` 150, soit 5 s.
- Calques : « 3 » images 0 à 42 ; « 2 » 30 à 73 ; « 1 » 60 à 103 ; « GO » 90 à 150 [recalculé].
- Couleurs `#bf76ff`, reflet `#d6a4f8`, ombre `#f7dc6f` [non vérifié, lecteur ancienne-ui].
- Navigation à 4050 ms (`Countdown.jsx:24-26`) : le « GO » est coupé.

**Scores** : « Top Scores », un tableau nom | score, puis « Rejouer » (`TableauScores.jsx:14-27`). Bordures `4px solid #f7dc6f`, rayon 10px [non vérifié, lecteur ancienne-ui].

**Textes historiques à réécrire**
- « LET'S GO » (`Home.jsx:31`).
- « Choisis ton mode de jeu! ».
- « Niv 1 Trouve le  Drapeau » (double espace dans la source), « Niv 2 Trouve le Pays », « Niv 3 trouve la capitale », suivis de 1, 2 et 3 étoiles U+2B50 (`Modejeu.jsx:18-29`).
- « Tu déchire!! la réponse était bien {…} » (`Bravo.jsx:19`).
- « Oh non! tu t' es trompé,la réponse était {…} » (`Loose.jsx:20`).

**Couleurs du globe à ne pas confondre avec l'interface**
- Pays jaune `vec3(1.0, 0.933, 0.012)`, commenté `#ffee03` (`postprocessing.ts:12`), contre le jaune d'interface `#f7dc6f`.
- Vert `vec3(0.18, 0.8, 0.44)` et rouge `vec3(0.91, 0.3, 0.24)` (`countryLayer.ts:69`).
- Balise : même jaune et blanc (`beacon.ts:38`).
- Le rendu exact de ces couleurs à l'écran (conversion de sortie) n'a pas été vérifié [non vérifié].

---

## 4. Contraintes de dimension

**Libellés FR** (197 pays, `countries.json`) [recalculé]
- Noms : médiane 8 caractères, maximum 31 pour VCT « Saint-Vincent-et-les-Grenadines ». Suivent KNA (26), CAF (25), PNG (25), DOM (22), STP (20). 6 noms font 20 caractères ou plus : CAF, DOM, KNA, PNG, STP, VCT.
- Capitales : médiane 7, maximum 19 pour BRN « Bandar Seri Begawan » et LKA « Sri Jayawardenapura ». Suivent AND « Andorre-la-Vieille » (18) et GNQ « Ciudad de la Paz » (16).
- Plus long segment qu'on ne peut pas couper (coupure aux espaces et aux traits d'union) : 14 caractères pour un nom (« centrafricaine »), 15 pour une capitale (« Jayawardenapura »).

**Libellés EN** (cache mledoze, 250 entrées dont 197 jouables) [recalculé]
- Noms : maximum 32 pour VCT « Saint Vincent and the Grenadines », puis CAF (24) et BIH (22).
- Capitales : maximum 19 pour BRN, puis SMR « City of San Marino » (18) et AND « Andorra la Vella » (16).

**Autres contraintes de texte**
- Parenthèses dans « Congo (Rép. dém.) » et « Palaos (Palau) » [non vérifié, lecteur donnees-ressources].
- Glyphes à couvrir : ș et ă (Chișinău), ʻ U+02BB (Nukuʻalofa) [non vérifié, lecteur donnees-ressources]. La couverture par Chango n'a pas été vérifiée [non vérifié].
- **Règle pour les boutons** : 2 lignes au plus, coupure aux espaces et aux traits d'union, police réduite pour les libellés de 20 caractères ou plus.

**Drapeaux** [recalculé]
- 197 SVG, 3 626 847 octets au total.
- Rapport largeur/hauteur de 0.8203 (`npl.svg`) à 2.5455 (`qat.svg`, `preserveAspectRatio="none"`). `che.svg` et `vat.svg` sont carrés.
- 26 rapports distincts ; 3:2 pour 86 drapeaux, 2:1 pour 55.
- `afg.svg` n'a pas de viewBox.
- Plus lourds : mex 345 548 octets, ecu 279 168, smr 270 808.
- Conséquence : un cadre de rapport fixe, des `<img>` en `object-fit: contain`, et le préchargement des 4 drapeaux de la manche suivante.
- Exemple, en supposant 16 px de gouttière et 12 px d'écart en 360 px : une cellule fait 158 px de large ; un cadre 3:2 y fait 105,3 px de haut ; le Népal y tient en 86,4 × 105,3 px et le Qatar en 158 × 62,1 px.

**Place du pays au cadrage** [recalculé]

La « calotte standard » est celle d'un pays dont θ est d'au moins 3° sans atteindre le plafond. C'est un majorant : 92 pays ont θ < 3°, sont cadrés comme une calotte de 3° et occupent moins de place.

| Format | α | Altitude d'ensemble | Rayon du disque terrestre | Rayon de la calotte standard | Bande libre au centre | RUS (rayon) | IDN (rayon) | Pays plafonnés | Balises |
|---|---|---|---|---|---|---|---|---|---|
| 360×640 | 14.6975° | 2,2 | 225,8 | 58,8 | y 261,2 à 378,8 | 167,1 | 121,9 | 15 | 42 |
| 390×844 | 12.1598° | 2,2 | 297,7 | 64,1 | y 357,9 à 486,1 | 220,4 | 160,8 | 24 | 38 |
| 844×390 | 25° | 1,4 | 191,7 | 61,3 | y 133,7 à 256,3 ; x 360,7 à 483,3 | 153,2 | 114,3 | 13 | 42 |
| 960×600 | 25° | 1,4 | 294,9 | 94,2 | y 205,8 à 394,2 | 235,7 | 175,8 | 13 | 30 |
| 1440×900 | 25° | 1,4 | 442,3 | 141,4 | y 308,6 à 591,4 | 353,5 | 263,7 | 13 | 27 |

Ce que cela implique pour les maquettes :
- **360×640** : le HUD du haut doit finir à 261 px au plus, et la zone basse (grille, crédit, zone sûre) commencer à 379 px au moins, soit 261 px de hauteur disponible.
- **390×844** : HUD haut jusqu'à 357 px au plus ; zone basse à partir de 486 px (358 px disponibles).
- **Accueil en portrait** : le globe déborde la largeur (diamètre 451,6 px pour 360 de large ; 595,4 px pour 390).
- **Paysage 844×390** : le disque fait 383,4 px de diamètre pour 390 px de haut, et le pays est cadré dans la bande x 360,7 à 483,3. Les côtés restent libres.

**Fonds de maquette disponibles** : 24 PNG `-darwin` dans `web/e2e/visual.spec.ts-snapshots`, en 360×640 et 800×450 (recalculé). Plans : accueil, question, bonne-reponse, micro-etat, nuit, lever-de-soleil. Le plan « accueil » est rendu à l'altitude 1,4, pas 2,2 [non vérifié, lecteur e2e-dependances].

**Budget du premier chargement** : 8 000 000 octets, dernière mesure 6 617 449, marge 1 382 551. La police et les drapeaux de la première manche s'y ajoutent [non vérifié, lecteur e2e-dependances].

---

## 5. Contradictions, trous, API manquante

### Contradictions vérifiées
1. **Ombre des titres** : le spec (spec:190) donne `5px 2px 1px black`. L'ancien code met `-6px 4px 2px rgb(11, 13, 15)` sur les titres (`App.css:116,125`). La valeur `5px 2px 1px` est celle du score et de la question.
2. **Attribution EOX** : spec:264 commence par « Data & Viewing Products: ». Ce préfixe est absent de `credits.tsx:2-8` et de `credit.spec.ts:4`.
3. **Specs dépendantes de la démo** : HANDOFF:24 annonce « 4 specs ». En réalité, 14 lignes `goto` visent « / ». Elles se répartissent sur 10 specs e2e et le budget (`first-load.spec.ts:29`). Parmi elles, 12 lignes pilotent la démo (toutes sauf `credit:8` et `unsupported:7`) [recalculé].
4. **Paquets** : spec:59 prévoit Zustand et `vite-plugin-pwa`. HANDOFF:13 dit « aucun nouveau paquet », et `package.json` ne contient ni l'un ni l'autre.
5. **Intro et 3-2-1** : spec:186 commence par « intro » et spec:200 joue le 3-2-1 « dans la scène ». Or l'intro est en 2B (HANDOFF:10), alors que le 3-2-1 fait partie du déroulé de la 2A (HANDOFF:14).
6. **Capitales** : spec:179 dit « capitale (FR) », mais la 2A est bilingue. Les capitales EN de mledoze diffèrent [recalculé] :

   | Pays | EN (mledoze) | FR (jeu) |
   |---|---|---|
   | LKA | Colombo | Sri Jayawardenapura |
   | PSE | Ramallah | Jérusalem-Est |
   | SWZ | Lobamba | Mbabane |
   | GNQ | Malabo | Ciudad de la Paz |
   | UKR | Kyiv | Kiev |

   GNQ ne figure pas dans les arbitrages (HANDOFF:66).
7. **Vue d'ensemble** : spec:157 dit « 1.4 (bureau) / 2.2 (mobile) ». Le code décide par `width >= height` (`framing.ts:26-27`) : un téléphone en paysage reçoit 1,4.
8. **Durée de vol** : spec:163 dit « 400 + 2500 ms ». Le code borne la durée naturelle à 1500–3500 ms (`config.ts:15`).
9. **Vibration** : demandée par spec:192, pas tranchée dans HANDOFF:14 (qui dit seulement « pas de son »).
10. **État des scores** : spec:259 prévoit un écran « enregistré / en attente d'envoi ». La 2A n'a que des scores locaux et le chart ne déploie que `web` (HANDOFF:10,12) : rien à maquetter pour cet état.
11. **Noms des modes** : « Niv 1/2/3 » dans spec:179, « Drapeau / Pays / Capitale » dans HANDOFF:14.
12. **Révélation d'une erreur** : HANDOFF:14 demande « rouge + pulsation, bonne réponse montrée ». Sur le globe, c'est le pays cible, donc la bonne réponse, qui devient rouge (`controller.ts:28,145` ; `countryLayer.ts:69-70`).
13. **Portée du crédit** : spec:194 dit « dans la vue du globe ». HANDOFF:14 dit « jamais recouvert ». Que faire sur les écrans opaques (scores, crédits) ?

Les rayons de api-globe et les diamètres de cadrage-ecran concordent (64,1 et 128,3 ; 297,7 et 595,4 ; 220,4 et 440,7 ; recalculés).

### API du globe : ce qui manque (vérifié dans le code)
1. Aucun `onError`, `onLoading` ni `onLost` (`GlobeView.tsx:48-52`). Les écrans d'erreur sont dessinés par `GlobeView`, en français codé en dur.
2. Aucun décalage du centre de cadrage. `Viewport` ne porte que `{ width, height, fovYDeg }` (`framing.ts:1`). Le TRAA réécrit le `viewOffset` à chaque image [non vérifié, lecteur cadrage-ecran].
3. Aucun « léger rapprochement » : les méthodes de `director.ts:51-128` sont `setViewport`, `setFraming`, `setIdleSpin`, `flyTo`, `flyToOverview` et `update`.
4. Rotation d'accueil :
   - aucune vitesse par défaut ;
   - la rotation n'est pas coupée en mouvement réduit (`director.ts:123`) ;
   - `prefers-reduced-motion` n'est lu qu'au montage (`GlobeView.tsx:66`).
5. `overview()` ne retire pas le pays (`GlobeView.tsx:85`).
6. Pas de pause de rendu à la demande (`GlobeView.tsx:136-141`).
7. Pas d'altitude d'accueil propre.
8. Un vol remplacé résout sa promesse comme une arrivée (`director.ts:78`) : il faut un jeton d'annulation côté jeu.
9. La durée du vol n'est pas exposée.
10. `answer()` est sans effet si `showQuestion()` n'a pas été appelé avant (`controller.ts:123-125`).
11. La pulsation rouge ne s'arrête qu'avec `clear()` ou `flyTo()`.
12. Aucun libellé traduisible n'est passé en prop.
13. La position du crédit n'est pas paramétrable (`credits.tsx:17`).

---

## 6. Questions de conception à trancher (de la plus structurante à la moins)

Chaque question donne des variantes à maquetter, en 360×640, 390×844, 844×390 et 1440×900, sans casser en 480×300.

1. **Disposition selon le format**
   - A. Grille 2×2 en bas partout. En paysage téléphone, elle mord sur la bande du pays (y 133,7 à 256,3).
   - B. Portrait : 2×2 en bas. Paysage et bureau : une colonne de 4 réponses à droite (le côté droit est libre au-delà de x 483,3 en 844×390).
   - C. Portrait : 2×2 en bas. Bureau : une rangée 1×4 en bas. Téléphone en paysage : 2×2 compacte à droite.
2. **Place du crédit EOX par rapport à la grille**
   - A. Le crédit reste dans `GlobeView` en bas à droite, et l'interface réserve une bande basse (environ 2 lignes de 13 px, plus 4 px, plus la zone sûre) sous la grille.
   - B. Le crédit monte dans la couche UI, en haut, sous le HUD, sur toute la largeur.
   - C. Le crédit va dans une barre basse de l'interface, pleine largeur sous la grille, sortie de `GlobeView`.
3. **Centrage du pays**
   - A. Garder le centre géométrique : HUD haut jusqu'à 261 px et zone basse à partir de 379 px en 360×640 (357 et 486 en 390×844).
   - B. Décaler l'axe optique de (bas − haut) / 2. Il faut une nouvelle API et un contournement du TRAA.
   - C. Centre géométrique avec des HUD minces, en acceptant que les 15 à 24 pays plafonnés passent sous les HUD.
4. **Forme des boutons de réponse (texte)**
   - A. Inclinés `skewX(-15deg)`, fond `#6225e6` plein, ombre `6px 6px 0 black`, libellé contre-incliné : les mêmes boutons que les menus.
   - B. L'ancien style : non inclinés, rayon 15px, `#6225e6be`, ombre `3px 3px 0 black`.
   - C. Inclinés avec ombre de 3px et une pastille jaune `#f7dc6f` qui porte le numéro 1 à 4.
   - Dans tous les cas, appliquer la règle des 2 lignes et la réduction à partir de 20 caractères.
5. **Cases du mode Drapeau**
   - A. Cadre fixe 3:2 en `contain`, sur un fond neutre (`#16173a` ou blanc cassé), avec la pastille du numéro.
   - B. Cadre carré, drapeau centré.
   - C. Proportions libres, cellule ajustée au drapeau (grille irrégulière).
6. **Révélation**
   - A. Sur les boutons seulement (choix rouge, bonne réponse verte) plus un `aria-live` invisible.
   - B. En plus, un bandeau sous le HUD : « Bravo ! » ou « Raté : c'était {pays} », avec la capitale et le drapeau quand le mode s'y prête.
   - C. En plus, une étiquette près du pays (nom, capitale, drapeau).
   - Sous-question : sur le globe, le pays devient-il rouge sur une erreur (comportement actuel, le globe montre la bonne réponse en rouge), ou vert pour enseigner la bonne réponse ?
7. **HUD et chrono**
   - A. Une barre : Quitter (×) à gauche, score au centre, pastille ronde orange `#ff5722` à droite.
   - B. Le chrono en jauge pleine largeur sous la barre, avec le nombre à côté.
   - C. Une pastille violette ou jaune avec un anneau de progression, et le score en grand à gauche.
   - À placer aussi : la consigne (« Quel est ce pays ? »), pendant le vol ou seulement à la question.
8. **Accueil**
   - A. Globe débordant (altitude 2,2), titre en haut, carte basse avec le nom, FR/EN, « Jouer », Scores et Crédits.
   - B. Une altitude d'accueil propre, qui montre le globe entier (nouvelle API).
   - C. Le globe à moitié visible en bas, façon « lever de Terre », avec le titre au-dessus (demande un décalage du centre).
9. **Choix du mode**
   - A. Trois boutons inclinés empilés « Drapeau / Pays / Capitale », avec le meilleur score à droite de chacun.
   - B. Trois cartes avec une icône, 1, 2 ou 3 étoiles de difficulté et le meilleur score.
   - C. Garder « Niv 1/2/3 » et ajouter un sous-titre.
10. **Compte à rebours 3-2-1**
    - A. Chiffres Chango géants `#f7dc6f` avec une ombre noire de 6px, une seconde chacun, puis « GO ! ».
    - B. Les couleurs du Lottie : `#bf76ff`, reflet `#d6a4f8`, ombre `#f7dc6f`.
    - C. Un cercle violet `#6225e6` avec le chiffre en blanc (le style `.BtnCountdown`, jamais branché).
    - Sous-question : le premier vol part-il pendant le compte à rebours ?
11. **Fin de partie**
    - A. Une carte centrale sur le globe en vue d'ensemble.
    - B. Un panneau plein écran `#16173a` (ce qui pose la question de la pause du rendu et du crédit).
    - C. Une feuille basse qui laisse le globe visible en haut.
12. **Scores**
    - A. Le tableau à bordures jaunes de l'ancien jeu, avec des onglets par mode et la ligne du joueur surlignée.
    - B. Une liste de cartes inclinées (rang, nom, score).
    - C. Un podium pour le top 3, puis une liste de la 4ᵉ à la 10ᵉ place.
13. **Consigne du mode Capitale**
    - A. « Quelle est la capitale de ce pays ? », le globe seul désignant le pays.
    - B. « Capitale de : {Pays} ? ».
    - C. Le nom du pays n'apparaît qu'à la révélation.
14. **Sélecteur FR/EN**
    - A. Une bascule « FR | EN » sur l'accueil seulement.
    - B. Un bouton permanent dans un coin.
    - C. Dans un menu ou une page Réglages.
15. **Ombre des titres** : `-6px 4px 2px rgb(11, 13, 15)` (l'ancien code) ou `5px 2px 1px black` (le spec). Dans les deux cas, le spec est à corriger.
16. **Écrans d'erreur et de chargement**
    - A. L'interface les dessine dans le style cartoon (`#16173a`, `#f7dc6f`, un bouton `.cta` « Réessayer »), via un nouvel `onError`.
    - B. `GlobeView` les garde, stylés et traduits.
    - Et faut-il un écran « chargement » avant `onReady` ?
17. **Focus et état pressé**
    - A. L'ombre jaune `10px 10px 0 #f7dc6f` sert d'état actif, au toucher comme au focus.
    - B. Un contour jaune de 3px en plus de l'ombre.
    - C. Un enfoncement : ombre `2px 2px 0` et translation de 4px.

---

Scripts de vérification (lecture seule, dans le scratchpad) :
- /private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad/verif.cjs
- /private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad/verif2.cjs
- /private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad/vols.mjs