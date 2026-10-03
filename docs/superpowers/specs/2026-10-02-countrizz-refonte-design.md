# Countrizz — refonte WebGPU · design

- **Date** : 02/10/2026
- **Branche** : `refonte-webgpu` (part de `2d62fc2`, instantané de l'ancien code sur `newcountri`)
- **Statut** : design validé section par section avec l'utilisateur ; ce document attend sa relecture avant le plan d'implémentation.
- **Amendements** : 02/10 au soir, avant la phase 1B — imagerie (§1, §3.1, §4.2, §4.3, §9) : millésime EOX 2025, Sentinel-2 en texture de jour mondiale et en patchs image, patchs image hors dépôt (décisions de l'utilisateur).

---

## 0. Pourquoi une refonte

Countrizz est un jeu de géographie : un globe 3D vole vers un pays mis en évidence, le joueur choisit parmi quatre réponses (drapeau, nom ou capitale). L'ancienne version (React 17, Vite 2.8, three 0.140, globe.gl 2.26) ne fonctionne plus, et sa donnée ne permet pas d'identifier les pays de façon fiable.

**Ce qui la casse (constaté le 02/10/2026)**

- restcountries v3.1 est déprécié : il répond « This API version has been deprecated… (v5) » ; la v5 exige une clé. Le contrôleur `/api/countries` écrivait cette réponse dans son cache ; côté front, `getRandomCountry` boucle alors sans fin.
- `globeImageUrl={preloadedEarthImage}` (travail non commité) : la prop n'est jamais transmise à `Jeu`, la texture de la Terre disparaît.
- `/scores` répond 500 sans MySQL, et `onGameEnd` attend `addScores` avant de naviguer : la fin de partie se bloque.
- Défauts secondaires : anti-doublon des réponses inopérant (compare une capitale à des objets pays), tirage hors bornes (`length + 1`), quatre `<Globe>` à tailles fixes sous des media queries qui se chevauchent (390, 460, 677 px), `onFinished()` appelé dans un updater `setState`.

**Ce qui rend l'identification peu fiable (mesuré sur la donnée)**

- 15 pays tirables n'ont aucun polygone (Vatican, Saint-Marin, Nauru, Kiribati, Dominique, Saint-Christophe-et-Niévès…) : rien ne s'allume.
- Identifiants en double : `CYP` (+ Chypre du Nord), `SOM` (+ Somaliland), `SLB`.
- Cadrage par table de 13 paliers de surface × 2 appareils, décorrélé de la forme : rapport altitude actuelle / altitude ajustée à la géométrie de ×0,14 à ×11,7 (médiane ×4,5) sur 163 pays ; 7 archipels sortent de l'écran (Sainte-Hélène, Cook, Micronésie, Maldives, Marshall, Seychelles, Tuvalu).
- Le point de cadrage `latlng` de l'API tombe hors du pays pour 25 pays.

## 1. Décisions de l'utilisateur

| Sujet | Décision |
|---|---|
| Approche | **A** — moteur maison `three/webgpu` + TSL, sans globe.gl (resté en WebGL) |
| Pays jouables | **197** : les 194 entrées marquées `unMember` de `mledoze/countries` (Vatican inclus) + Palestine, Kosovo, Taïwan |
| Hébergement | site **statique** + **service de scores sur le cluster K3s** (PostgreSQL) ; plus d'appel à restcountries |
| Couche pays | **patchs locaux par pays** (champ de distance + image), lignes vectorielles pour la vue d'ensemble, balises pour les micro-États |
| Imagerie | **Sentinel-2 cloudless (EOX), millésime 2025** : texture de jour mondiale **et** patchs image des pays ; le jeu reste **non commercial** ; patchs image **hors dépôt** (générés sur le poste, déposés sur Garage au déploiement) — amendé le 02/10 |
| Style | **globe photoréaliste + interface cartoon** (l'esthétique actuelle des boutons et polices) |
| Application | **PWA**, conçue **mobile d'abord** |
| Intro | recréée en **three.js** ; plus de Lottie, plus de vélos |
| Retraits | crédit « Le Gruppetto », GIF Rick & Morty, Lottie (`boucleterre.json` 12 Mo et les autres) |
| Domaine | **`countrizz.fr`** (vhost et certificat en place depuis le 02/10, voir §7) |

## 2. Architecture

```
countrizz/                      (branche refonte-webgpu ; frontend/ et backend/ supprimés, gardés par l'historique)
├─ web/                         site statique PWA
│  ├─ scripts/geodata/          pipeline de données (Node) + ses tests
│  ├─ public/data/              sorties du pipeline, versionnées
│  └─ src/
│     ├─ globe/                 rendu (three/webgpu, TSL, R3F)
│     ├─ camera/                CameraDirector (TypeScript pur)
│     ├─ game/                  machine d'états, tirage (TypeScript pur)
│     └─ ui/                    couche React (HUD, écrans, cartoon)
├─ scores/                      service de scores (Node + TypeScript + PostgreSQL)
└─ deploy/helm/countrizz/       chart Helm (web, scores, postgres)
```

**Stack** — alignée sur Zone Club : three **r186** (`three/webgpu`, `three/tsl`), **@react-three/fiber 9**, **React 19**, **TypeScript**, Vite, `vite-plugin-pwa`, Vitest, Playwright. État applicatif : machine d'états en TypeScript pur dans `game/`, exposée à React par un petit store (Zustand).

**Principe d'isolation** — `game/` et `camera/` n'importent ni React ni three ; ils se testent sans navigateur. `globe/` ne connaît pas les règles du jeu : il reçoit « pays cible », « état de révélation », « position caméra ».

## 3. Données (le point critique)

### 3.1 Sources épinglées

| Source | Rôle | Licence |
|---|---|---|
| Natural Earth 10m Admin 0 @ `9380cca8` (13/05/2022, v5.1.1) | géométrie de vue d'ensemble (frontières) | domaine public (vérifiée : « Everything here is public domain. ») |
| `mledoze/countries` @ `c2ac0049c1` (29/09/2026) | noms FR, `cca2`, région, sous-région, voisins, drapeaux SVG (250) | ODbL 1.0 (vérifiée) |
| geoBoundaries `gbOpen` ADM0 | contours fins des patchs (ex. Monaco : 840 sommets, segments de 19 m) | ODbL 1.0 pour MCO/SMR/LUX (source OSM) ; **à relever pays par pays** (`boundaryLicense`) |
| Wikidata (instantané SPARQL) | capitales en français (P36) | à confirmer au plan |
| EOX Sentinel-2 cloudless 2025 | texture de jour mondiale et patchs image | CC BY-NC-SA 4.0, non commercial (vérifiée le 02/10 ; 2017, dernier millésime CC BY, ne couvre que l'Europe ; 2016 a des bandes nuageuses) |
| NASA Blue Marble / Black Marble / nuages | glaces polaires du jour, nuit, relief, nuages | crédits NASA (plans 1A et 1B) |

Le pipeline se lance à la main (`npm run geodata`) ; ses sorties sont versionnées. Le build et l'exécution n'appellent aucune API.

### 3.2 Jointure et exceptions

- Clé : `cca3` (mledoze) ↔ code Natural Earth `ISO_A3_EH`, repli `ADM0_A3`. Natural Earth porte `ISO_A3 = -99` pour la France et la Norvège ; Kosovo, Somaliland et Chypre du Nord n'ont que `ADM0_A3` (`KOS`, `SOL`, `CYN`).
- `overrides.json` :
  - `UNK ↔ KOS` (Kosovo) ;
  - fusions : Chypre du Nord → Chypre, Somaliland → Somalie (comme l'ancien jeu) ;
  - **frontières internationalement reconnues** (décision du 02/10, appliquée aux zones disputées de Natural Earth, `ne_10m_admin_0_disputed_areas`) : Crimée → Ukraine ; plateau du Golan → Syrie ; Palestine dans les lignes de 1967 (Cisjordanie, Jérusalem-Est comprise, et Gaza) ; Sahara occidental et Cachemire (toutes parties, Aksai Chin compris) **neutres** ;
  - **neutres** : les autres territoires (Groenland, Porto Rico…) et les zones neutralisées ci-dessus — frontières tracées, jamais allumés ni demandés ;
  - les DOM, inclus dans la France chez Natural Earth, s'allument avec elle ;
  - capitales à arbitrer (une « capitale de jeu » par pays) : Afrique du Sud (3 capitales), Bolivie (2), Palestine (Ramallah / Jérusalem-Est), Kosovo (absent de la requête par code ISO).
- Vérifié : avec Natural Earth 10m, **les 197 pays ont une géométrie**.
- Contours geoBoundaries : leur sens d'enroulement est inversé pour d3 (Monaco sort à 510 064 469,88 km², le globe moins Monaco) — le pipeline normalise l'enroulement.

### 3.3 Calculs par pays

- **Corps principal** : on écarte d'abord les polygones dont le centre est à plus de **25°** (réglable) du centre du plus grand polygone, puis on garde, par surface décroissante, ceux qui couvrent 90 % de la surface restante. La France cadre ainsi sur la métropole, pas sur la Guyane ; les États-Unis sur les 48 États contigus. Le rapport de génération liste, pays par pays, les polygones écartés.
- **Calotte de cadrage** : centre et rayon angulaire θ de la plus petite calotte englobant le corps principal.
- **Point de balise** : pôle d'inaccessibilité (cœur du territoire).
- Surface mesurée, région, sous-région, voisins.
- **Patchs** (§4.3) : projection azimutale équidistante centrée sur la calotte, emprise = cadrage × marge.

### 3.4 Sorties

- `countries.json` : 197 pays — id, `cca3`, `cca2`, nom FR, capitale de jeu FR, région, sous-région, voisins, surface, calotte, balise, chemin du drapeau.
- Géométrie simplifiée des frontières (vue d'ensemble).
- Par pays : patch SDF (canal R : distance au bord du pays ; canal G : distance aux frontières voisines) et patch image.
- `flags/*.svg` (197), hébergés avec le site.
- `rapport-geodata.md` : écarts avec la génération précédente (codes, surfaces, cadrages), à relire avant de commiter.

### 3.5 Tests bloquants (Vitest)

- exactement 197 pays ; chacun a une géométrie et un patch ;
- aucune entité Natural Earth attribuée à deux pays ;
- la calotte contient tout le corps principal, et le point de balise tombe dans le pays. *(Amendé le 02/10 : l'exigence initiale « centre de cadrage dans le pays » échouerait pour 41 pays sur 197 — 30 archipels et 11 pays en croissant ou en longueur comme la Chine, la Croatie, le Viêt Nam — sans que leur cadrage soit faux ; ces centres sont listés dans le rapport, à titre informatif.)*
- surface mesurée entre ×0,5 et ×2 de la référence mledoze, sauf liste blanche (attrape aussi les enroulements inversés) ;
- nom FR, capitale de jeu et drapeau présents pour chaque pays.

## 4. Rendu du globe

### 4.1 Moteur

- `WebGPURenderer` avec repli automatique WebGL 2 (« If not, `WebGPURenderer` falls backs to a WebGL 2 backend »), piloté par R3F 9.
- `RenderPipeline` (nouveau nom de `PostProcessing` depuis r183) : scène → bloom → `TRAANode` → tone mapping.
- Deux niveaux de qualité selon le backend obtenu et l'appareil :

| Niveau | Quand | Textures globales | Patchs | Effets | DPR |
|---|---|---|---|---|---|
| **haute** | WebGPU sur bureau | 8K (limite par défaut WebGPU : 8192) | image 2048 px | bloom + TRAA | ≤ 2 |
| **standard** | mobile, ou WebGL 2 | 4K | image 1024 px | allégés | ≤ 2, résolution dynamique |

Le patch SDF fait **1024 px à tous les niveaux** : l'interpolation bilinéaire d'un champ de distance donne des bords nets sous le texel, et cela divise par quatre le poids versionné des 197 patchs.

### 4.2 La Terre (matériau TSL, une sphère)

1. jour — Sentinel-2 cloudless 2025 (glaces polaires de Blue Marble, que Sentinel-2 rend en blanc plat), précisé par le patch image du pays visé (§4.3) ;
2. nuit — lumières des villes (Black Marble) sur la face nocturne, transition douce au terminateur, alimentant le bloom ;
3. relief — normal map issue de l'altimétrie (remplace le `bumpScale 10` actuel) ;
4. océan — masque de rugosité (remplace la carte spéculaire `shininess 18`), reflet du soleil, léger Fresnel ;
5. nuages — couche séparée, dérive lente, ombres au sol ; **s'effacent à l'arrivée sur un pays** ;
6. atmosphère — halo de limbe, bleu côté jour, orangé au crépuscule (diffusion physique takram : option ultérieure, son support WebGPU est « Work-in-progress »).

Autour : champ d'étoiles, soleil et halo.

### 4.3 Couche pays

| Élément | Technique |
|---|---|
| frontières vues de loin | lignes vectorielles Natural Earth simplifiées, estompées avec l'altitude |
| pays à deviner | **patch SDF local** lu dans le shader de la Terre : remplissage animé `#ffee03a1`, bord sans crénelage, lueur intérieure, révélation en vague depuis le centre ; frontières voisines nettes (canal G) |
| imagerie en gros plan | **patch image local** (Sentinel-2 cloudless 2025) fondu sur la texture globale à l'intérieur de son emprise ; emprise = **la vue d'arrivée** (max(θ, θ_min) × m × 2,2, plafonnée à 30°), et non celle du patch SDF ; alpha = masque d'eau (amendé le 02/10) |
| micro-États | **balise** : anneau pulsant + faisceau vertical au pôle d'inaccessibilité, dimensionnés en pixels d'écran |
| révélation | bonne réponse : vert + flash du contour ; mauvaise : pulsation rouge |

Pourquoi des patchs locaux : la caméra cadre chaque pays selon sa taille, donc un patch de taille fixe donne une précision constante à l'écran (Luxembourg : 83,8 km sur 2048 px ≈ 41 m par texel). Une carte d'identifiants globale de 8192 px donnerait 9,3 px d'écran par texel au cadrage le plus serré. Agrandissement d'un pixel source quand le pays occupe 300 px d'écran : Blue Marble 500 m → 1,8 (Luxembourg) à 24,2 (Monaco) ; Sentinel-2 10 m → ≤ 0,48 pour tous sauf le Vatican (19,5, d'où sa balise).

Seuls le patch courant et le suivant sont en mémoire ; le suivant est préchargé pendant la manche en cours. La projection locale règle l'antiméridien (Russie, Fidji, Kiribati). Ce sont des textures : le repli WebGL 2 les gère.

## 5. Caméra — `CameraDirector`

**Conservé** (mêmes valeurs par défaut) : caméra verrouillée pendant la question ; nord en haut, caméra tournée vers le centre de la Terre ; vue d'ensemble à l'altitude 1.4 (bureau) / 2.2 (mobile) ; séquence dézoom → vol → arrivée, courbe cubique ; 1500 ms de révélation.

**Constat sur l'ancien vol** : globe.gl interpole `lat`, `lng`, `altitude` séparément ; le second `pointOfView` démarre 400 ms après un dézoom de 1500 ms sans l'arrêter — le dézoom n'était perçu que 400 ms.

**API** : `flyTo(pays): Promise<void>`, résolue à l'arrivée ; la boucle de jeu l'attend.

**Trajectoire** : direction en `slerp` (grand cercle) ; profil d'altitude continu « monte puis redescend » de van Wijk & Nuij (*Smooth and efficient zooming and panning*, implémenté par `d3.interpolateZoom`) — l'amplitude du dézoom dépend de la distance. Durée par défaut 400 + 2500 ms, modulée par la distance dans des bornes réglables (défaut 1500–3500 ms).

**Cadrage** :

```
altitude = k · (cos θ + sin θ / tan(α / m)) − 1      bornée à [plancher ; vue d'ensemble]
```

θ = rayon de la calotte (pipeline) ; α = demi-champ limitant (vertical en paysage, horizontal en portrait), recalculé au redimensionnement ; m = marge ; **k = facteur de contexte**, seul réglage, calibré au prototype sur une dizaine de pays de référence pour garder le recul actuel. Plancher : là où le patch image cesse de gagner en détail (seul le Vatican l'atteint ; sa balise prend le relais). Arrivée au centre de la calotte, plus au `latlng` de l'API.

**Lumière** : soleil placé par rapport à la caméra, pas à l'heure réelle — le pays visé est toujours de jour, le terminateur reste visible au limbe. **Rotation** : aucune pendant une question (seuls les nuages dérivent) ; rotation lente au repos sur l'écran d'accueil. Léger rapprochement pendant la révélation. `prefers-reduced-motion` : fondu + coupe.

## 6. Jeu, interface, intro, PWA

### 6.1 Règles

- Trois modes : *Niv 1* drapeau, *Niv 2* nom du pays, *Niv 3* capitale (FR). Quatre réponses, +10 points par bonne réponse. `JeuNomPays` (doublon) disparaît.
- Partie de **60 s nettes** (l'ancien compteur finissait au 61e tick). **Chrono en pause pendant le vol et la révélation** ; boutons actifs à la résolution de `flyTo`.
- Tirage : aucun pays demandé deux fois dans une partie, jamais deux réponses identiques, graine reproductible.
- Mauvaises réponses de plus en plus proches : monde entier au départ, même région après 3 bonnes réponses d'affilée, même sous-région ou voisins après 6 (seuils réglables).

### 6.2 Machine d'états

`intro → accueil → choix du mode → compte à rebours → [vol → question → révélation] × n → fin → scores`

### 6.3 Interface (cartoon, mobile d'abord)

- Constantes reprises de l'ancienne interface : police **Chango**, fond `#16173a`, texte `#f7dc6f`, boutons violets `#6225e6` inclinés `skewX(-15deg)` avec ombre `6px 6px 0 black` et chevrons animés, titres en `text-shadow: 5px 2px 1px black`.
- Un seul canvas plein écran (`ResizeObserver`) ; couche React au-dessus.
- Portrait d'abord : score et chrono en haut, globe au centre, **réponses en grille 2×2 en bas, à portée de pouce** ; zones sûres, `100dvh`, cibles ≥ 48 px ; aucun effet dépendant du survol (déclenché au toucher) ; vibration légère où c'est possible.
- Clavier 1–4 ; `aria-live` pour le retour ; nom du joueur mémorisé localement.
- Crédit EOX affiché dans la vue du globe (§9).

### 6.4 Intro (three.js, ~8 s, même scène que le jeu)

1. espace et champ d'étoiles ; 2. la Terre côté nuit, lumières des villes, liseré d'atmosphère ; 3. lever de soleil derrière le limbe (halo, atmosphère orangée, bloom) ; 4. titre *Countrizz* en surimpression lumineuse ; 5. recul vers la rotation lente de l'accueil (nom du joueur, choix du mode).

Elle sert d'écran de chargement (textures légères d'abord, 8K pendant qu'elle joue) ; un clic la passe ; `prefers-reduced-motion` : plan fixe. Le compte à rebours 3-2-1 se joue aussi dans la scène. `lottie-web` quitte les dépendances.

### 6.5 PWA

- Manifest : `Countrizz`, `standalone`, `theme_color #16173a`, icônes adaptatives.
- Service worker (`vite-plugin-pwa`) : précache de l'application, `countries.json`, drapeaux, textures de base ; cache borné pour les patchs déjà vus. **Jouable hors ligne** après la première visite.
- Scores hors ligne en file (IndexedDB), avec clé d'idempotence, envoyés au retour du réseau.
- Côté nginx, `sw.js`, `registerSW.js` et `manifest.webmanifest` sont servis sans cache (déjà configuré, §7).

### 6.6 Performance mobile

Niveau « standard » par défaut sur mobile ; densité de pixels plafonnée ; résolution dynamique ; rendu en pause onglet caché ; budget de premier chargement fixé et mesuré au prototype.

## 7. Scores et déploiement (conventions du cluster)

**Dépôt et CI** : dépôt `Pablohassan/Countrizz` (remote `countriz`) ; l'ancien `deploy.yml` (VPS Wild Code School) est supprimé. GitHub Actions construit des images **arm64** (workers Raspberry Pi) : `pablohassan/countrizz-web:<commit>`, `pablohassan/countrizz-scores:<commit>`. Déploiement par Helm depuis l'opérateur.

**Chart `deploy/helm/countrizz`, namespace `countrizz`**

| Ressource | Détail |
|---|---|
| `web` | nginx non privilégié servant le build ; textures, patchs, drapeaux intégrés à l'image ; Service `LoadBalancer` **`192.168.1.101:80`** |
| `scores` | Node + TypeScript (Fastify, `pg`) ; Service `LoadBalancer` **`192.168.1.102:80`** |
| `postgres` | StatefulSet `postgres:16-alpine`, volume `longhorn-ha` 1 Gi (modèle `postgre-agi-so`) |
| secret | `countrizz-secrets` (modèle `agi-so-secrets`), valeur conservée dans Vault KV, jamais affichée ni commitée |
| NetworkPolicies | une règle d'entrée par port exposé |
| placement | jamais sur les masters ; exclusion de `raspberrypi0` ; test Helm refusant tout nom de nœud inexistant dans un `NotIn` |

IP `.101` et `.102` déclarées par `loadBalancerIP` uniquement, Services créés par Helm uniquement (règles du registre MetalLB) ; **réservées** dans `gen-metallb-allocations.sh` le 02/10.

**API**

- `GET /api/scores?mode=drapeau|pays|capitale&limit=10` — classement par mode.
- `POST /api/scores` `{ gameId (uuid), name (≤ 12), mode, score }` — `gameId` unique (idempotence de la file hors ligne) ; score plafonné à ce qu'une partie de 60 s permet (10 points × nombre maximal de manches, valeur fixée au plan) ; limite de requêtes par IP.
- Table `scores(id, game_id uuid unique, name varchar(12), mode, score int, created_at)`.

**Entrée publique (en place depuis le 02/10)** : vhost `countrizz.fr` sur `.60`, gabarit `mecapilote.fr` — HTTP → 301, ACME en `webroot`, snippets `ssl-params` / `security-headers` / `block-malicious`, `/` → `.101`, `/api/` → `.102` (même origine, pas de CORS) ; certificat Let's Encrypt (`webroot`, `ecdsa`) ; synchronisé vers le backup `.3`. `www.countrizz.fr` est servi par le même vhost depuis le 02/10 (certificat étendu : `countrizz.fr` + `www.countrizz.fr`).

**Sauvegarde et supervision** : `pg_dump` quotidien vers Garage sur le modèle Politika (lire `garage-s3.md` en entier avant de l'écrire) ; aucune règle d'alerte sans sa route Alertmanager.

## 8. Tests et erreurs

**Tests**

- Données : §3.5 + `rapport-geodata.md`.
- Logique pure : cadrage sur Russie, France, Chili, Luxembourg, Malte, Vatican, Kiribati (portrait et paysage) ; continuité des `slerp`, antiméridien compris ; machine d'états et pause du chrono ; tirage sur 10 000 graines (ni doublon, ni répétition, difficulté progressive).
- « Chaque pays s'allume là où on l'attend » : pour les 197, rendu hors écran du seul masque SDF après cadrage, contrôle de la zone couverte à l'écran (Chromium headless, repli WebGL 2).
- Non-régression visuelle (Playwright) : six plans de référence, WebGPU et `forceWebGL`, téléphone et bureau.
- API : intégration avec un PostgreSQL éphémère (idempotence, plafond, limite de requêtes).
- Helm : `helm template` + refus des noms de nœuds inexistants.

**Erreurs**

| Situation | Comportement |
|---|---|
| WebGPU absent | WebGL 2 automatique ; ni l'un ni l'autre → écran « navigateur non compatible » |
| perte du GPU | recréation du renderer, reprise de la partie |
| patch absent ou lent | texture globale + contour vectoriel ; une manche n'est jamais bloquée |
| hors ligne | service worker ; scores en file IndexedDB |
| API en échec | la fin de partie n'attend jamais l'envoi ; écran « enregistré » / « en attente d'envoi » |
| mémoire mobile | patchs courant + suivant seulement ; tailles plafonnées |

## 9. Crédits et licences — conséquences

- **Sentinel-2 cloudless** : attribution obligatoire, visible dans l'interface de la carte : « Data & Viewing Products: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data "year") ». Licence NC-SA : les patchs dérivés restent sous CC BY-NC-SA 4.0 ; **tout passage au commercial impose la licence payante EOX**. Millésime retenu le 02/10 : **2025** (« … Copernicus Sentinel data 2025) »).
- **ODbL** (mledoze, geoBoundaries) : `countries.json` et les contours dérivés sont publiés avec le site, donc partagés sous ODbL avec attribution ; page « Crédits » dans l'application.
- Natural Earth : domaine public (vérifié le 02/10).
- À confirmer au plan : Wikidata, NASA, police Chango, licence des drapeaux SVG de mledoze.

## 10. À valider au prototype

1. Faisabilité en CI du contrôle des 197 pays (Chromium headless, WebGL 2).
2. Lignes épaisses en WebGPU (frontières) ou rubans générés au build.
3. Support des textures compressées (KTX2) avec `WebGPURenderer` et en repli WebGL 2.
4. Calibration de `k` et de la marge `m` sur les pays de référence.
5. Budget du premier chargement et poids total des patchs (197 × 2 résolutions).
6. Accès à Sentinel-2 cloudless pour la génération (service EOX : documentation à lire avant tout appel).
7. Construction arm64 en CI (émulation ou runners arm64).

## 11. Hors périmètre (plus tard, peut-être)

Mode « clique sur le pays » (exigerait une carte d'identifiants), mode expert avec les territoires, nuages volumétriques (takram, pas encore WebGPU), diffusion atmosphérique Bruneton, plongée 3D Tiles à la révélation, comptes joueurs.
