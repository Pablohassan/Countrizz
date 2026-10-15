# Countrizz — zoom sur le pays et images de près · design

> Spec rédigé le 15/10/2026 à partir des réponses de l'utilisateur pendant le brainstorming (sections 1 à 4 validées
> une à une). C'est le **sous-projet 1 sur 3** de la demande « rendu de la Terre plus réaliste » : 1. zoom et images de
> près (ce spec) ; 2. océan et nuages ; 3. atmosphère et lumière — chacun aura son spec, son plan et sa mise en ligne.
> Il **amende** le spec de la refonte (`2026-10-02-countrizz-refonte-design.md`) sur le cadrage (§5), les vols et les
> niveaux de rendu (§4.1) ; ce qui n'y est pas amendé reste valable. **Aucun code avant la validation de ce spec puis du plan.**

## 0. Objet et périmètre

Aujourd'hui, à l'arrivée sur un téléphone 390 × 844, la Russie déborde (113,0 % du petit côté de l'écran) et le Vatican
n'est qu'un point (0,1 %), Monaco aussi (0,2 %) : le contexte minimal de 3° (θ_min) écrase les petits pays, et la photo
Sentinel-2 qui les couvre est taillée pour cette vue large (Vatican : 19,8° de demi-côté, ≈ 1 073 m/px en 2048).

Dans ce plan :
- un **nouveau cadrage** : le pays occupe toujours entre 10 % et 80 % du petit côté de l'écran ;
- des **vols** dont la durée suit l'ampleur du zoom ;
- des **images emboîtées** : une chaîne de photos de plus en plus serrées, relayées sans saut pendant la plongée ;
- la **qualité haute** ouverte aux téléphones en WebGPU (8K, photos 2048), WebGL 2 n'étant plus qu'un repli ;
- le **cache** de ces fichiers, le budget de téléchargement, l'essai de **XUASTC** ;
- les tests, la publication des photos et une nouvelle image `countrizz-web:1.9`.

Hors de ce plan : l'océan, les nuages (sous-projet 2) ; l'atmosphère, la lumière (sous-projet 3) ; les textures
`surface-4k` et `clouds-4k` (inchangées) ; tout changement des règles du jeu.

## 1. Décisions de l'utilisateur (ne pas les rouvrir sans lui)

| Décision | Ses mots |
|---|---|
| Les petits pays doivent se voir ; zoom plus long pour eux, durée proportionnelle au zoom | « par exemple monaco ou le vatican son invisibles aujourdhui, de plus pour les peti pays je voudrais un zoom plus long que pour les grand pays […] pour un zoom 300% par exemple on dois metre 3 fois lus de temps a arriver au pays que sur un zoom 10% » |
| Bornes de taille à l'écran | « un pays ne dois jamais dépaser 80% de la largeur de l'ecran et jamais etre en dessous de 10% » |
| Les bornes se lisent sur le **petit côté** (largeur du téléphone en portrait, hauteur en paysage) ; le téléphone d'abord | « ok pour le choix par default […] 80% en en effet concerne dabord le telephone qui sera le moyen le plus rependu d'y jouer » |
| Plafond de durée des vols à 6 s | « A » |
| Images emboîtées (option C), seulement pour les pays qui en ont besoin | « et utiliser un texture plus définie? […] passer vers une image nette sans que on s'appercois de la supercherie? » puis « ok pour C » |
| 8K pour les téléphones ; WebGL 2 seulement en repli | « oui on ajoute la texture 8K pour les telephones […] pour moi ca dois être uniquement un fallback » |
| Exploiter l'état de l'art d'octobre 2026, sources de 2026 seulement | « on dois exploiter la technologie de maniére a optimiser au maximum ce que le sota permet a octobre 2026 » ; « on cherche rien qui soit avant 2026 » |
| Cache : ne pas tout recharger à chaque partie | « on dois utiliser le cache pour eviter de recharger systématiquement » |
| Découpage en trois sous-projets, périmètre du premier | « oui go » ; sections 1, 2, 3 et 4 : « ok », « ok », « ok validé », « ok » |

## 2. Cadrage à l'arrivée

**Mesure.** La part d'écran d'un pays est celle de sa **calotte** (le cercle de rayon `cap.radiusDeg` qui le contient,
dans `countries.json`) : la caméra à l'altitude `a` au-dessus du centre voit le bord de la calotte sous l'angle
β = atan2(sin r, 1 + a − cos r) ; part = tan β / tan α, où α est le demi-champ **limitant** (`limitingHalfAngle`,
le petit côté du `Viewport` passé au cadrage). La calotte contient le pays : un pays ne dépasse donc jamais la part
de sa calotte ; sa plus grande dimension vaut au moins 87 % (√3 / 2) du diamètre de la calotte.

**Part visée.** Nouvelle fonction pure `arrivalShare(rec, v, p)` dans `web/src/camera/framing.ts` :
1. part B = la part que donne le cadrage actuel (`frameAltitude` avec `FRAMING`, θ_min = 3° compris) — c'est la
   référence du « zoom par rapport à aujourd'hui » ;
2. facteur de taille f = 1,1 + 1,9 × (ln A_max − ln A) / (ln A_max − ln A_min), A = `areaKm2`, A_max et A_min pris sur
   les 197 pays (Russie 16 859 281,08 km², Vatican 0,51 km²) : 1,1 pour la Russie, 3 pour le Vatican ;
3. part visée = clamp(part B × f, 0,10, 0,80).

**Altitude.** `arrivalAltitude(rec, v, p)` inverse la mesure : on cherche `a` tel que la part vaille la part visée
(formule fermée : la caméra voit le bord sous β = atan(part × tan α), d'où 1 + a = cos r + sin r / tan β), bornée
en bas par `floor` seulement. Elle **n'est plus bornée par la vue d'ensemble** : sur téléphone, la Russie (3,18) et
l'Indonésie (2,27) demandent une altitude au-dessus de 2,2, et la règle des 80 % prime ; le plan vérifie qu'aucune
borne de la caméra (contrôles, plan lointain) ne l'empêche. θ_min ne sert plus qu'au calcul de la part B.
`inArrivalView` et tout appelant de `frameAltitude` pour l'arrivée passent à `arrivalAltitude`.

Valeurs sur téléphone 390 × 844 (calcul du 15/10 sur `countries.json`) :

| Pays | Part B | f | Part visée | Zoom z = visée / B |
|---|---|---|---|---|
| Russie | 113,0 % | 1,100 | 80,0 % | ×0,71 |
| États-Unis | 74,2 % | 1,164 | 80,0 % | ×1,08 |
| France | 32,9 % | 1,460 | 48,0 % | ×1,46 |
| Belgique | 14,4 % | 1,793 | 25,8 % | ×1,79 |
| Luxembourg | 4,2 % | 2,064 | 10,0 % | ×2,39 |
| Singapour | 2,8 % | 2,203 | 10,0 % | ×3,53 |
| Monaco | 0,2 % | 2,848 | 10,0 % | ×59,29 |
| Vatican | 0,1 % | 3,000 | 10,0 % | ×184,11 |

**Réglages.** `FRAMING` reçoit `share: { min: 0.10, max: 0.80 }` et `sizeFactor: { large: 1.1, small: 3 }` ;
`calibrate.html` les expose en curseurs, comme les réglages actuels.

**Balise.** Au plancher de 10 %, un pays fait au moins ≈ 39 px de large sur un téléphone : `needsBeacon` (qui passe à
`arrivalAltitude`) devrait être faux partout. Le code de la balise reste, en filet ; un test vérifie qu'aucun pays ne
la déclenche sur les deux cadrages de référence. Un pays qui la déclencherait encore est montré à l'utilisateur, pas
corrigé en silence.

## 3. Vols

`planFlight` (`web/src/camera/flight.ts`) garde la trajectoire de van Wijk et sa durée naturelle bornée à
[1500 ; 3500] ms, puis la multiplie par un **facteur de zoom** :

- d(z) = max(1, 1 + 2 × log2(z / 1,1) / log2(3 / 1,1)), z étant le zoom du tableau du §2 ;
- d vaut 1 pour z ≤ ×1,1, 2 vers ×1,82, 3 pour ×3 (la règle de l'utilisateur), et continue au-delà ;
- durée = min(6000 ms, durée bornée × d) ; mouvement réduit : 0, comme aujourd'hui.

`FLIGHT` reçoit `zoomRef: { from: 1.1, to: 3 }` et `capMs: 6000`. `planFlight` reçoit z dans ses paramètres (calculé
par l'appelant à partir de `arrivalShare`). Le chrono du jeu reste arrêté pendant les vols (`machine.ts`, inchangé) : un
vol plus long ne coûte aucun temps de jeu ; le 3-2-1 se cale déjà sur `durationMs`.

## 4. Images emboîtées

### 4.1 La chaîne de niveaux

Pour chaque pays, une chaîne de photos carrées centrées sur le centre de la calotte, du plus large (niveau 0) au plus fin :

- **emprise la plus fine** (demi-côté) E = 2,2 × r / part visée, en degrés — la vue d'arrivée sur le petit côté,
  étendue au grand côté par `viewFactor` = 2,2 comme aujourd'hui ; on retient la plus petite des deux valeurs données
  par les cadrages de référence (portrait 390 × 844 et paysage 1440 × 900), plafonnée à 30° (`maxExtentDeg`) ;
- **niveaux plus larges** : E × 4, E × 16, … tant que l'emprise reste ≤ 30° ;
- nombre de niveaux = 1 + ⌊log4(30 / E)⌋.

Calcul du 15/10 sur `countries.json` : **219 niveaux** pour 197 pays (182 pays à 1 niveau, 11 à 2, 2 à 3, 1 à 4, 1 à
5). Exemples : Russie 1 niveau (30°), France 1 (22,30°), Singapour 2, Monaco 4 (le plus fin : 0,3377°, ≈ 36,7 m/px en
2048), Vatican 5 (0,1088°, ≈ 11,8 m/px en 2048, pour une mosaïque Sentinel-2 à 10 m). Le test recompte la chaîne à
partir des données, ces chiffres n'y sont pas figés.

### 4.2 Fabrication et données

- `web/scripts/imagery/build-patches.ts` refait **toutes** les photos selon la chaîne, en 2048 et 1024, depuis la même
  source (EOX WMS, couche `s2cloudless-2025`, requêtes de 4096 px au plus, CC BY-NC-SA 4.0). La chaîne est calculée par
  la **même fonction que le jeu** (`arrivalShare`, importée de `web/src/camera/framing.ts`, comme `FRAMING` l'est déjà)
  pour que photos et caméra ne divergent jamais. `imageExtentRad` est remplacé par `imageLevels(rec, framing, o)`.
- Fichiers : `data/patches/img/<cca3>-<niveau>-<taille>.ktx2` (cca3 en minuscules, niveau 0 = le plus large).
- `imagery.json` : par pays, `center` et `levels: [{ extentRad, files: { "2048": {bytes, sha256}, "1024": {…} } }]`,
  du plus large au plus fin ; en tête, `levelRatio: 4` à côté de `viewFactor` et `maxExtentDeg`. `imagePatchUrl` reçoit
  le niveau. Les anciens fichiers `<cca3>-<taille>.ktx2` disparaissent.
- Stockage estimé (219 × poids moyen actuel) : 156 120 067 octets en 2048, 47 840 054 en 1024. Publication sur une
  **nouvelle Release GitHub** de `Pablohassan/Countrizz` (nouveau tag, `imagerie-2025-niveaux`, archives
  `patchs-img-niveaux-<taille>.tar`) ; `fetch-patches.ts` et `checkPatches` suivent.

### 4.3 Rendu

- Le globe a **deux emplacements** de photo (`createImageLayer` deux fois) : le niveau **courant** (couvre la vue) et le
  niveau **suivant**, plus fin, posé par-dessus ; tous deux gardent le fondu de 15 % au bord (`IMAGE_FEATHER`) et se
  fondent dans la texture globale comme aujourd'hui.
- Fonction pure `pickLevels(altitude, v, levels)` : D = 2,2 × γ, où γ est le demi-angle au sol visible sur le petit côté
  à cette altitude (l'horizon s'il est en deçà) ; courant = le niveau le plus fin dont l'emprise est ≥ D (le niveau 0 si
  aucun) ; suivant = le niveau d'après, d'opacité clamp(log4(E_courant / D), 0, 1). Quand D atteint l'emprise du suivant,
  son opacité vaut 1 et il devient le courant : le relais n'a pas de saut. À l'arrivée, D = E du plus fin : il est seul.
- Le contrôleur (`web/src/globe/controller.ts`) appelle `pickLevels` à chaque image pendant le vol et à l'arrivée, et
  met à jour les deux emplacements ; le fondu d'entrée de 0,4 s (`IMAGE_FADE_S`) ne joue qu'à la première photo du pays.

### 4.4 Chargement et échecs

- Tous les niveaux du pays sont demandés **dès qu'il est tiré** (le préchargement du pays suivant existe déjà), du
  plus large au plus fin. `patchCache` garde tous les niveaux du pays courant et du suivant.
- Un niveau absent, en erreur ou en retard laisse le niveau plus large (ou la texture globale) : la manche **n'attend
  jamais** une photo.
- Mémoire graphique : un niveau 2048 transcodé en ASTC, BC7 ou ETC2 pèse 1 octet par texel, mipmaps comprises
  ≈ 5 592 405 octets. Au pire, le Vatican puis Monaco en mémoire : 9 niveaux ≈ 50 Mo ; deux pays à un niveau ≈ 11 Mo.
  Si le transcodeur retombe sur du RGBA non compressé (4 octets par texel), c'est quatre fois plus : le plan mesure
  le format retenu sur les appareils de test.

## 5. Qualité et fluidité

- `qualityTier` (`web/src/globe/renderer.ts`) : **haute** = WebGPU et `maxTexture2D >= 8192`, sans condition sur le
  pointeur (le `coarsePointer` est retiré, `GlobeView.tsx` ne le calcule plus) ; **standard** = tout le reste, dont
  WebGL 2. Le §4.1 de la refonte (« standard = mobile ») est amendé en ce sens.
- Haute = textures jour et nuit 8K, photos 2048, TRAA ; standard = 4K, photos 1024, MSAA 4 (inchangé).
- La **résolution dynamique** (`createDprGovernor`) tourne dans les deux niveaux, plus seulement en standard : c'est elle
  qui protège un téléphone en qualité haute.

## 6. Cache et budget

- Le motif `MOTIF_PAYS` (`/data/(patches|flags)/`) couvre déjà `data/patches/img/` : les niveaux d'un pays déjà vu
  restent dans le cache « pays » du service worker (CacheFirst). Son plafond passe de 400 à **700** entrées
  (219 niveaux + 197 SDF + 197 drapeaux = 613 pour un tour complet dans une taille). Un test e2e vérifie qu'un niveau
  vu est servi par le service worker à la partie suivante.
- `heavyUrls('haute')` précharge déjà la 8K : un téléphone en WebGPU la reçoit désormais à l'installation.
- nginx (`deploy/web/nginx.conf`) : inchangé ; les noms de fichiers changent, aucun ancien fichier ne peut être servi
  à la place d'un nouveau.
- Budget (`npm run budget`) : le plafond de **12 000 000 octets** s'applique aux deux niveaux de qualité, mesurés sur un
  téléphone simulé ; ce qui se charge pendant le 3-2-1 (photos du premier pays) est compté sur sa propre ligne.

## 7. XUASTC (première tâche du plan)

Basis Universal v2.5 propose XUASTC LDR (≈ 2,25 bits par texel en 4 × 4, transcodé vers ASTC, BC7 ou ETC2), en cours
de normalisation dans KTX2 en mars 2026 ; son support par three 0.186.1 n'est pas connu. La première tâche vérifie si
`KTX2Loader` et le transcodeur livré lisent un fichier XUASTC. Si oui, elle compare poids et finesse avec ETC1S
(qlevel 192) sur trois pays (Russie, France, Vatican au niveau le plus fin) ; XUASTC n'est adopté que s'il gagne **sur
les deux**. Sinon, ETC1S reste, et la tâche le note dans la passation.

## 8. Tests

**Unitaires (Vitest), écrits avant le code :**
- cadrage, sur les 197 pays, en portrait 390 × 844 et en paysage 1440 × 900 : part visée dans [10 % ; 80 %] ; la part
  mesurée à `arrivalAltitude` égale la part visée (à 1e-6 près ; Russie et Indonésie comprises) ; f = 1,1 pour la Russie et 3
  pour le Vatican ; la part visée ne diminue pas quand la superficie diminue, à part B égale ;
- vols : d = 1 à ×1,1 et ×0,71, 3 à ×3 ; durée ≤ 6000 ms pour tout z ; 0 en mouvement réduit ;
- chaîne : rapport 4 entre niveaux, plus fin = 2,2 × r / part visée (minimum des deux cadrages), aucun niveau au-delà
  de 30°, total recompté sur les données ; `imagery.json` conforme aux fichiers (`checkPatches`) ;
- `pickLevels` : à l'arrivée, le plus fin seul ; en vue d'ensemble, le niveau 0 ; opacité continue à chaque relais ;
- `qualityTier` : téléphone en WebGPU avec 8192 → haute ; WebGL 2 → standard ; WebGPU avec 4096 → standard ;
- `needsBeacon` faux pour les 197 pays sur les deux cadrages ;
- `MOTIF_PAYS` couvre `data/patches/img/<cca3>-<niveau>-<taille>.ktx2`.

**E2e (Playwright, SwiftShader) :**
- à l'arrivée sur le Vatican, Monaco, la France et la Russie (téléphone 390 × 844) : la part de la calotte projetée par
  la caméra de la page est dans [10 % ; 80 %] (à 1 point près) et le cadre de la frontière projetée ne dépasse pas 80 %
  du petit côté ; pas de balise ;
- la plongée vers le Vatican demande ses 5 niveaux et montre le plus fin à l'arrivée ;
- un niveau en 404 (route simulée) : la manche continue, le niveau plus large reste affiché ;
- le service worker sert à la partie suivante un niveau déjà vu (sous le nginx de l'image) ;
- budget : les deux niveaux de qualité sous 12 000 000 octets.

**Pour le regard de l'utilisateur :** captures avant/après sur téléphone (Russie, France, Monaco, Vatican) par
`CAPTURES=`, déposées sur sa page de suivi (https://claude.ai/artifact/4Sd4LAsYeL8YUa77vBhLki).

## 9. Mise en ligne (chaque étape sur un GO explicite de l'utilisateur, avec la commande exacte)

1. publication de la Release GitHub `imagerie-2025-niveaux` ;
2. construction et poussée de l'image `pablohassan/countrizz-web:1.9` (`deploy/scripts/build-image.sh`) ;
3. `kubectl apply` de `deploy/k8s/countrizz.yaml` depuis rpi1 ; retour arrière : 1.8 ;
4. e2e et budget sur countrizz.fr ;
5. essai de l'utilisateur sur de vrais téléphones (iPhone sous Safari, Android sous Chrome) : netteté du Vatican et de
   Monaco, fluidité de la plongée, chaleur et autonomie en qualité haute.

## 10. Corrections de chiffres annoncés pendant le brainstorming

Recalculés le 15/10 en écrivant ce spec, ils remplacent ceux annoncés en séance :
- **219 niveaux** au lieu de 208, **5 pour le Vatican** au lieu de 4 : le premier calcul prenait la largeur visible
  entière (2r / part) comme demi-côté, soit des photos deux fois trop larges ; le chiffre de ≈ 12 m/px annoncé pour le
  Vatican correspond, lui, au calcul corrigé.
- Mémoire graphique au pire **≈ 50 Mo** (Vatican puis Monaco) au lieu de ≈ 30 Mo.
- Stockage 2048 : 156 120 067 octets au lieu de 148 278 420.
- La vue d'ensemble restait annoncée comme borne haute de l'altitude : elle aurait laissé la Russie à 113 % sur
  téléphone. Elle ne borne plus l'arrivée (§2).
