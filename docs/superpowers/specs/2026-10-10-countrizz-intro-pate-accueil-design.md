# Countrizz — intro en pâte à modeler et accueil 3D · design

> Spec rédigé le 10/10/2026 à partir du prototype validé avec l'utilisateur (versions 1 à 5,
> https://claude.ai/artifact/K2h5GdvXXmaqWoCBjhtQm8) et de ses réponses du 09 et du 10/10. Il **amende** le spec de la
> phase 2A (`2026-10-05-countrizz-phase2a-design.md`) là où il le dit (§10). Prototype, fabrique des textures et
> captures : `docs/superpowers/brainstorm/2026-10-10-intro-pate/`. **Aucun code avant la validation de ce spec puis du
> plan.** C'est le **plan A** ; la PWA (installation, textures téléchargées, cache) est le **plan B**, juste après.

## 0. Objet et périmètre

Le premier écran de countrizz.fr devient : **intro en pâte à modeler (≈ 21 s) → fondu vers l'accueil, sur le vrai globe
3D en rotation légère**.

Dans ce plan :
- l'intro, portée du prototype dans le jeu (`web/src/intro/`), et la fabrique de ses textures dans le dépôt ;
- la vue d'accueil « lever de Terre » du globe (caméra inclinée, Terre en bas de l'écran, rotation légère) ;
- l'écran d'accueil (maquette validée, écran 1 de la planche « Countrizz jouable ») ;
- la page de démo déplacée dans `demo.html`, « Jouer » y mène en attendant les écrans du jeu (plan 2A-5) ;
- la couture des nuages sur l'antiméridien (mineur reporté de la 1B), corrigée au passage ;
- les tests et le budget révisé ; le déploiement d'une nouvelle image.

Hors de ce plan : la PWA (plan B) ; l'avion de l'accueil et le reste de l'API du globe (plan 2A-4) ; les écrans du jeu
(2A-5) ; l'écran de chargement « Terre cartoon » (D15), **remplacé** par l'intro (§10).

## 1. Décisions de l'utilisateur (ne pas les rouvrir sans lui)

| Date | Décision |
|---|---|
| 09/10 | Intro de 20-25 s, stop motion, pâte à modeler style Pixar, Terre caricaturale aux reliefs exagérés, qui tourne vite ; un point se pose ; drapeau, ville, frontière ; fondu vers l'accueil |
| 09/10 | Jouée **à chaque visite** : elle couvre le chargement de la carte lourde et des textures |
| 09/10 | Toujours le **même lieu** : la France, Paris |
| 09/10 | Rendu **en temps réel** (three.js), pas de vidéo précalculée |
| 10/10 | Chorégraphie de l'ancienne intro Lottie (titre qui glisse depuis la gauche, Terre qui tombe du ciel floue puis nette, entrées l'une après l'autre avec élan), **sans cycliste ni « Grupetto »** |
| 10/10 | Terre **30 % plus petite** en vue d'ensemble ; approche de la France **deux fois moins forte** ; textures plus fines |
| 10/10 | Point de pâte **rouge** (plus d'épingle), drapeau **÷ 2**, frontière **÷ 2** |
| 10/10 | Après le fondu, le globe 3D de l'accueil **tourne légèrement** |
| 10/10 | Budget en **deux plafonds** (§7) ; « Jouer » ouvre la **démo des vols** jusqu'au plan 2A-5 |
| 10/10 | **Mouvement réduit : rien de particulier** — l'intro se joue pareil |

## 2. Déroulé de l'intro

> **Révisé le 10/10 au soir (décision de l'utilisateur) — prime sur le tableau suivant : double dézoom.** 0 → 1,2 s nuit et
> étoiles (plus de titre au début) ; 1,2 → 2,8 s chute ; impact, toupie ; 5,0 → 6,4 s premier dézoom : la Terre devient le « o »
> de **C🌍untrizz** au milieu de l'écran, les lettres surgissent (5,6 → 6,6 s) ; 8,0 → 10,0 s les lettres s'envolent,
> rezoom vers la France ; point (10,0 s), frontière (10,7 s), drapeau (12,2 s), vignette (12,9 s) inchangés ; 15,6 → 17,6 s
> second dézoom : la Terre se loge dans le « o » du titre de l'accueil (C🌍untrizz) ; accueil monté à 16,2 s ; 17,4 → 19 s le
> fond de nuit s'efface sur la vraie Terre ; à 19 s une petite Terre animée (24 vues, `public/intro/logo-terre.webp`,
> `scripts/intro/build-logo-sprite.mjs`) prend le relais dans le « o » du titre. Le raccord pâte → vraie Terre du §4 ne vaut plus.

### Déroulé d'origine (prototype v5)

| t | Ce qui se passe |
|---|---|
| 0 → 1,4 | Nuit `#16173a`, étoiles en billes jaunes qui s'allument une à une |
| 1,0 → 2,0 | « Countrizz » glisse depuis la gauche avec rebond (Chango, `#f7dc6f`, ombre `-6px 4px 2px rgb(11,13,15)`) |
| 2,0 → 3,6 | La Terre en pâte tombe du ciel : × 2,3, floue (30 px), transparente → nette, à sa place ; étirée par la vitesse |
| 3,6 → 4,6 | Impact : elle s'écrase, rebondit, se calme |
| 4,6 → 8,6 | Toupie : 0,72 tour/s au plus (21,6° par image à 12 i/s), freinage cubique de 6,0 à 8,6, arrêt en se dandinant ; l'axe passe de 23,4° à « Paris à 40° au-dessus du centre du disque » |
| 8,2 → 9,3 | Les nuages en pâte se retirent ; 8,7 : le titre s'envole |
| 8,4 → 10,3 | Approche : Paris glisse vers (195, 430) et le rayon passe de 115 à 507 px (scène 390 × 844) |
| 10,0 → 10,9 | Le point de pâte rouge tombe sur Paris, s'écrase en pastille |
| 10,7 → 12,2 | La frontière de la France se déroule en boudin de pâte jaune, une perle au bout |
| 12,2 → 13,1 | Le drapeau jaillit de la pastille (étiré puis tassé), la toile ondule |
| 12,9 → 13,4 | Vignette « France / Paris » au-dessus du mât |
| 15,4 → 18,0 | Tout se range ; la Terre recule et se lève en bas de l'écran (cadrage de l'accueil, §4) |
| 16,8 → 19,1 | L'accueil se monte : titre, FR/EN, nom, « Jouer », Scores / À propos, chacun avec élan |
| 19,6 → 21,0 | Fondu de la Terre en pâte vers le vrai globe ; crédit EOX |

- **Stop motion à 12 images/s** : à chaque image, un des trois états de « frémissement » de la pâte, léger tremblé de la
  Terre et de la lumière. Les éléments DOM suivent la même horloge quantifiée.
- **« Passer »** (bas droite) saute à la fin de l'intro (accueil monté).
- **Langue** : la vignette dit « France / Paris » dans les deux langues ; l'accueil suit la langue du joueur.
- **Format** : le prototype est une scène de téléphone 390 × 844. Dans le jeu, l'intro remplit la fenêtre : les tailles
  se calculent sur `U = min(largeur, 0,5 × hauteur)` (115 px ↔ 0,295 U ; 507 px ↔ 1,3 U) et la position finale vient
  de la vue d'accueil du globe (§4), quelle que soit la fenêtre.

## 3. Rendu de la Terre en pâte

- three.js **WebGL** (`WebGLRenderer`), module autonome, **son propre canvas** au-dessus du globe ; détruit après le
  fondu (contexte, géométries, textures libérés).
- Matière : `MeshPhysicalMaterial` (rugosité 0,62, `sheen` 0,45), environnement `RoomEnvironment`, tone mapping ACES,
  ombres (`PCFShadowMap`, carte 4096 qui suit la Terre), lumière clé chaude en haut à gauche + contre-jour bleuté.
- Icosphère de détail 150, déplacée par le relief : socle en biseau + `0,09 · √e^2,4` (e = altitude GEBCO normalisée),
  bosses « roulées à la main » ; trois variantes de frémissement (amplitude 0,0016).
- Couleur : texture équirectangulaire lue **depuis la position** (pas d'UV), dérivées choisies pour qu'aucune couture
  n'apparaisse au 180ᵉ méridien (`textureGrad`) ; sur l'Europe (lng −25 → 45, lat 20 → 72) la **peinture fine**
  prend le relais avec un fondu de 3°, et ses **pentes** penchent la normale (relief fin que le maillage ne porte pas) ;
  petites fossettes d'empreintes de doigts dans la normale.
- Objets : nuages en boules de pâte ; point rouge (rayon 0,0062 × 1,6 R) ; drapeau tricolore (mât 0,135 × 0,8 R,
  toile 0,088 × 0,058 × 0,8 R, ondulante) ; frontière en tube de rayon 0,0026 R sur 1 153 points (Natural Earth 10m,
  Douglas-Peucker 0,008°).
- Le flou de la chute est un `filter: blur()` CSS sur le canvas.

## 4. Vue d'accueil du globe (« lever de Terre ») et raccord

- **Nouvelle pose** du globe : la caméra regarde un point du globe puis s'incline (**tangage**) pour poser la Terre en bas
  de l'écran. `FramePose` gagne `pitch` (radians, 0 par défaut) ; `Globe.applyPose` l'applique après `lookAt`. Les vols
  existants gardent `pitch = 0`.
- **Une seule définition** : `homeView(viewport)` (fonction pure, `web/src/camera/`) rend le point regardé (lng, lat),
  l'altitude, le tangage, **et** la projection à l'écran du disque terrestre (centre, rayon) et de Paris. L'intro en
  tire sa position finale : la Terre en pâte finit exactement où le vrai globe apparaît.
- Cadrage visé (téléphone 390 × 844, maquette validée) : haut du disque vers y ≈ 445, Paris vers (130, 565), Europe et
  Afrique visibles, Paris de jour.
- `GlobeHandle.home()` : vol (ou pose immédiate) vers cette vue ; puis **rotation légère** par `setIdleSpin` (valeur au
  plan, de l'ordre de 1,5°/s). La règle existante du spec 2A §5.7 (pas de rotation en mouvement réduit) est inchangée.
- **Raccord** : le globe est monté dès le début de l'intro, caché, sans rendu continu (pas de GPU pris à l'intro) ; une
  image est rendue vers 15 s pour compiler ses shaders ; il passe en rendu continu au début du fondu (19,6 s).
- **Si le globe n'est pas prêt** à 19,6 s (réseau lent) : l'accueil reste monté sur la Terre en pâte, qui tourne
  doucement ; le fondu part dès que le globe est prêt. **En cas d'erreur du globe** : l'écran d'erreur existant
  (« Réessayer ») apparaît sous l'accueil.
- **Si la pâte n'est pas prête** : titre et étoiles attendent ; la chute part quand ses textures sont là. Au-delà de
  8 s sans elles, l'intro est abandonnée : accueil direct sur le globe.

## 5. Écran d'accueil

- Maquette validée (planche « Countrizz jouable », écran 1) : FR/EN en haut à droite, titre « Countrizz » (54 px),
  « Ton nom : Globetrotteur » (≤ 12 caractères, `prefs`), « Jouer » violet incliné, « Scores » et « À propos »,
  crédit EOX en bas, jamais recouvert. Textes : catalogues `fr.ts` / `en.ts` existants (`home.*`).
- **« Jouer »** ouvre `demo.html` (vols, question, réponse) jusqu'au plan 2A-5. **« Scores » et « À propos »** sont
  affichés mais inactifs, marqués « bientôt », jusqu'au plan 2A-5 (À propos accueillera l'installation, plan B).
- Le choix FR/EN et le nom sont gardés (`prefs`).

## 6. Fabrique des textures de l'intro

- Script `web/scripts/intro/` (Node, `sharp`), depuis les sources déjà en cache : Natural Earth 10m
  (`scripts/geodata/.cache`), Blue Marble 21600 et GEBCO 21600 (`scripts/textures/.cache`). Sorties dans
  `public/intro/`, **versionnées** (régénérables, sources épinglées) :
  - peinture du monde (4096 × 2048 ; une 8192 seulement si le budget §7 le permet) ;
  - peinture fine de l'Europe (48 px/degré) et ses pentes (24 px/degré, gradient est/nord compressé en `tanh`) ;
  - relief de déplacement (2048 × 1024) ; contour de la France (`france.json`).
- Style peint en **degrés** (flous, liserés) pour que monde et Europe se raccordent sans couture ; biomes caricaturés
  depuis Blue Marble (forêt, prairie, savane, désert clair, désert rouge, steppe, glace), montagnes brunes, neige,
  lagon, liseré d'écume et de plage.
- Formats choisis au plan pour tenir le plafond de 3 Mo (JPEG pour les peintures, pentes et relief recompressés).

## 7. Budget (amende le spec 2A §11)

- **Intro prête ≤ 3 Mo** : tout ce qu'il faut avant la chute de la Terre (code de l'intro compris).
- **Premier chargement total ≤ 12 Mo en « standard »** (intro + globe + données + code) ; en « haute », le plan propose
  un plafond mesuré (le jeu 8K seul pèse 8 321 977 octets).
- Le test de budget mesure les deux plafonds sur le site déployé.

## 8. Démo et page d'accueil

- `index.html` porte l'intro et l'accueil ; la démo actuelle (`main.tsx`) part dans `demo.html` avec ses paramètres
  (`?demo=FRA,JPN,FJI`) ; les specs e2e qui la pilotent pointent sur `/demo.html`.
- Les crochets de test de l'intro (temps figé `?t=`, image comptée) ne s'installent qu'en dev ou sous le drapeau
  `countrizz:e2e`, comme ceux du globe.

## 9. Tests

- **Unitaires** : la chronologie de l'intro en fonctions pures du temps (placement, orientation, entrées, retrait) :
  continuité aux bornes de phase, vitesse de toupie ≤ 21,6° par image, position finale = `homeView` ; `homeView`
  (disque et Paris aux positions visées sur 390 × 844 et sur bureau) ; `pitch` appliqué par `applyPose`.
- **Bout en bout, sur countrizz.fr** : l'intro va jusqu'à l'accueil ; « Passer » ; globe en rotation après le fondu ;
  « Jouer » ouvre la démo ; globe lent (réseau ralenti) : accueil sur la pâte puis fondu ; pâte absente : accueil
  direct ; crédit EOX jamais recouvert ; images de référence de l'intro à des instants figés (`-darwin`) ; les e2e de la
  démo sur `demo.html`.
- **Budget** : les deux plafonds du §7.
- **Nuages** : un contrôle de la couture à l'antiméridien (vue au-dessus du Pacifique).
- **À la main** : sur un vrai téléphone, sur countrizz.fr déployé.

## 10. Amendements au spec 2A

| § 2A | Avant | Après |
|---|---|---|
| 0 | intro 3D hors 2A | **intro en pâte dans la 2A** (ce spec) |
| 3, D15 | écran de chargement « Terre cartoon 3D » | **remplacé par l'intro** (elle couvre le chargement) |
| 5.4 | vue d'accueil propre | définie ici : `homeView`, tangage, `home()` |
| 11 | premier chargement ≤ 8 Mo | **intro ≤ 3 Mo, total ≤ 12 Mo** en standard (§7) |
