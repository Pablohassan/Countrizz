# Countrizz — phase 2A · design

> Spec de la phase 2A, rédigé le 05/10/2026 (session cloud) à partir des décisions de l'utilisateur prises du 03 au
> 05/10. Il **complète** le spec de refonte `2026-10-02-countrizz-refonte-design.md` et l'**amende** là où il le dit
> (§12). La matière (maquettes, prototypes, captures, recherches) est dans
> `docs/superpowers/brainstorm/2026-10-03-phase2a-interface/` : son `README.md` numérote les 17 décisions d'interface
> citées ici « D1 » à « D17 » ; `section-4-donnees-bilingues.md` et `section-5-tests-erreurs.md` portent les sections
> 4 et 5. **Aucun code avant la validation de ce spec puis du plan.**

## 0. Objet et périmètre

**2A = le jeu jouable de bout en bout, bilingue FR/EN, en ligne sur `countrizz.fr`, installable (PWA).**

Dans la 2A :
- le jeu complet : accueil → choix du mode → 3-2-1 → manches (vol → question → révélation) → fin → scores ;
- l'interface cartoon des maquettes validées (D1–D17), français et anglais ;
- scores **locaux** (top 10 par mode, sur l'appareil) ;
- PWA : manifeste, service worker, installation, jeu hors ligne après une première visite (**avancée de la 2B**, D17) ;
- retours haptiques (§7) ;
- déploiement sur le cluster K3s (§9), **en première tâche** avec le globe actuel, pour valider la chaîne tôt.

Hors 2A (→ 2B ou plus tard) : l'intro 3D du spec de refonte §6.4, les scores en ligne (service `scores`, PostgreSQL,
`.102`), la file IndexedDB d'envoi, la limitation de débit `/api/`.

## 1. Rappel des décisions d'architecture (validées le 03/10)

- **Approche A** : la logique du jeu en TypeScript pur, testée sans navigateur ; React n'affiche que l'état.
  - `web/src/game/` : `rules` (score, fin), `draw` (tirage à graine), `clock` (chrono net), `machine` (réducteur
    d'états), `scores` (top 10 local).
  - `web/src/i18n/` : `fr.ts` et `en.ts` du **même type** ; langue du navigateur, puis choix mémorisé.
  - `web/src/ui/` : les écrans React (style cartoon).
  - `App.tsx` relie la machine au `GlobeHandle`.
- **Aucun nouveau paquet** pour le jeu ; la PWA ajoute `vite-plugin-pwa` (déjà prévu au spec de refonte §2).
- La page de démo actuelle part dans `demo.html` ; les specs e2e qui la pilotent suivent.

## 2. Parcours

`chargement → accueil → choix du mode → 3-2-1 → [vol → question → révélation 1,5 s] × n → fin → scores`,
plus « À propos », « Tourne ton téléphone » et les écrans d'erreur.

- **Chrono net de 60 s** : en pause pendant le vol, la révélation, onglet caché et « Tourne ton téléphone ». À zéro,
  la question en cours n'est pas comptée.
- **Le premier vol part pendant le 3-2-1** (D17) : la première question arrive juste après « GO ! ».
- +10 par bonne réponse, 0 sinon. Tirage : aucun pays deux fois, jamais deux réponses identiques dans la langue
  jouée, difficulté progressive (monde → même région après 3 bonnes d'affilée → sous-région ou voisins après 6).
- « Quitter » sans confirmation. Pas de son.

## 3. Écrans

| Écran | Décision | Contenu (résumé ; détails et valeurs dans le README du dossier de conception) |
|---|---|---|
| Chargement | D15 | Fond étoilé, titre, **Terre cartoon 3D** (relief × ≈ 20, 2 000 facettes, épingles géantes, nuages, **avion rouge à hélice en orbite**), jauge jaune ; seulement si le globe n'est pas prêt après ≈ 300 ms ; module WebGL autonome + carte d'élévation de 49 Ko |
| Accueil | D6, D7, D8 | H3 « lever de Terre » : titre, nom (≤ 12 caractères), FR/EN, « Jouer », Scores, **À propos** ; repères G5 en calque DOM projeté ; **avion A2 3D en boucle** (§4) ; crédit EOX en bas |
| Choix du mode | D9 | Boutons inclinés empilés Drapeau / Pays / Capitale, étoiles de difficulté, record en pastille jaune (« Nouveau » si jamais joué), « ‹ Retour » |
| 3-2-1 | D11 | Chiffres géants jaunes cernés de noir, une seconde chacun, « GO ! » dans un pavé violet ; HUD déjà affiché, jauge en pause |
| Question | D1, D2, D3, D5 | Globe plein écran, grille 2×2 en bas sur voile, question juste au-dessus, crédit sur sa ligne dessous ; touches 1-4 ; drapeaux à aire égale en « autocollant » ; même grille en paysage et sur bureau |
| HUD | D10 | Barre ✕ / secondes / score, jauge jaune pleine largeur ; pause = hachures + « ❚❚ » ; 10 dernières secondes = rouge clignotant |
| Révélation | D4 | 1,5 s : bon vert ✓, mauvais rouge ✗ + secousse, autres estompés, « +10 », `aria-live` ; globe vert + flash / rouge pulsé ; étiquette « Pays · capitale » posée sur le pays |
| Fin | D12 | Carte crème en haut (score, « 19 bonnes réponses sur 24 », ancien record, tampon « Nouveau record ! », drapeaux de la partie), Rejouer / Changer de mode / Scores ; globe en bas en vue d'ensemble |
| Scores | D13 | Top 10 par mode en bandes inclinées, 1ᵉʳ en jaune, joueur en violet « · toi », onglets des modes |
| À propos | D14 | « Installer l'appli », astuce iPhone/iPad, « Partager le jeu », lien `github.com/Pablohassan`, réglage « Vibrations », petit lien « Mentions et licences » |
| Erreurs | D16 | Chargement raté (globe grisé, bulle, Réessayer) ; navigateur incompatible (bulle sans bouton) ; perte du GPU (§10) |
| Tourne ton téléphone | D5, D16 | Téléphones seulement, en paysage : écran bleu nuit, téléphone jaune qui pivote, « ❚❚ Partie en pause » |

Les ombres des titres sont `-6px 4px 2px rgb(11,13,15)` (valeur de l'ancien jeu, D6) ; la variante à `-4px 3px` sert
aux titres plus petits.

## 4. L'avion de l'accueil (D8)

Avion en papier **A2 cartoon**, dosage **E2**, dans la scène du globe (WebGPU/TSL, avec les équivalents nodaux
listés en tête de `ecrans/avion-cartoon.js`) :
- tour du monde **en boucle** : Rabat → Madrid → Paris → Athènes (rase-mottes), puis vers l'est derrière le globe et
  retour par l'ouest (≈ 20 s, ≈ 2,4 s hors écran) ;
- à chaque escale il prend les couleurs du pays (quille = couleur principale, bande au bord de fuite = seconde) et la
  bulle « Pays · Capitale » apparaît avec un point vert #2fbf4a ; aucun nom au départ ; bulles et traînée s'effacent
  quand il quitte l'écran ;
- taille réduite de 30 %, vitesse de l'ancien vol, roulis permanent de −25° ;
- prototype de référence : `ecrans/avion-cartoon-escales.js` (WebGL, à porter).

## 5. API du globe à ajouter

Le `GlobeHandle` actuel (`flyTo`, `prefetch`, `showQuestion`, `answer`, `clear`, `overview`, `setIdleSpin`) ne
suffit pas. Il faut :
1. **décalage de l'axe optique** (D1) : recentrer le pays dans la zone libre entre HUD et grille — y compris le
   contournement du TRAA qui réécrit `setViewOffset` à chaque image ;
2. **position écran d'un point** (`project`, aujourd'hui crochet de test) en API publique, avec visibilité : bulles
   des escales, étiquette R3, épingles G5 ;
3. **objets de scène de l'accueil** : l'avion A2 et sa traînée, l'ombre portée par le soleil du globe ;
4. **vue d'accueil propre** (lever de Terre : globe bas, altitude et cadrage dédiés) ;
5. **signaux** `onError`, `onLoading`, `onLost` pour que l'interface dessine erreurs et chargement (traduits) ; la
   position du crédit paramétrable ;
6. **jeton d'annulation** des vols (un vol remplacé ne doit plus résoudre sa promesse comme une arrivée) et durée du
   vol exposée (le 3-2-1 l'utilise) ;
7. arrêt de la rotation d'accueil en mouvement réduit, relu à chaud.

## 6. Données bilingues (section 4)

- `countries.json` bilingue : `name: { fr, en }`, `capital: { fr, en }`, `capitals: { fr: [], en: [] }`, nouveau
  `capitalLngLat`.
- EN : mledoze `name.common` (gardé tel quel : « DR Congo », « Ivory Coast », « Türkiye »…) ; capitale mledoze, sauf
  arbitrages `overrides.capitals.<cca3>` en `{ fr, en }` (BEN, BOL, GNQ, LKA, MYS, PAK, PSE, SWZ, YEM, ZAF).
- FR : inchangé, sauf `overrides.names.fr` : **RD Congo**, **Cap-Vert**, **Vatican** ; Ukraine : **Kiev** ;
  Guinée équatoriale : **Ciudad de la Paz** (FR et EN).
- Coordonnées : Natural Earth `populated_places` (épinglé), 188/197 directs ; alias ou points imposés pour 9 cas
  (dont Jérusalem-Est, Ngerulmud, Ciudad de la Paz : 1,5925° N, 10,8236° E).
- Contrôles : libellés complets et uniques par langue, arbitrages complets, capitale dans le pays et dans le cadre de
  la caméra à l'arrivée (règle le cadrage de Kiribati).

## 7. Haptique (section 5)

Module unique (`ui/haptics`, prototype `ecrans/haptique.js`), réglage « Vibrations » oui par défaut, mémorisé :
- **Android** (`navigator.vibrate`) : appui 9 ms synchronisé avec l'enfoncement du bouton, relâcher 4 ms, bonne
  réponse 14·60·22, **mauvaise réponse 70·25·(8·2)×4·25·140** (retour de force, avec la secousse), 3-2-1 18 par
  chiffre, « GO ! » 45, record 20·40·20·40·20·40·90 (ms) ;
- **iPhone iOS 18+** : « tic » système (interrupteur `switch` caché) à l'appui et aux réponses ;
- **ordinateur** : rien ; les effets visuels restent.
Motifs réglés **après la 2A**, au doigt, sur countrizz.fr déployé (§13) ; d'ici là, ceux-ci (essai : `ecrans/haptique.html`).

## 8. PWA

- Manifeste : `Countrizz`, `standalone`, **`orientation: portrait`**, `theme_color #16173a`, icônes adaptatives.
- Service worker (`vite-plugin-pwa`) : précache de l'application, `countries.json`, drapeaux, textures de base,
  module et carte du chargement ; cache borné des patchs déjà vus ; **partie complète hors ligne** après une visite.
- « Installer l'appli » : invite `beforeinstallprompt` quand elle existe ; astuce « Partager → Sur l'écran
  d'accueil » sur iPhone/iPad ; bouton masqué si l'appli est déjà installée (`display-mode: standalone`).
- « Partager le jeu » : `navigator.share` (titre, texte, `https://countrizz.fr`) ; sinon copie du lien + « Lien
  copié ! » ; sinon lien affiché.
- nginx du pod : `sw.js`, `registerSW.js`, `manifest.webmanifest` sans cache (le proxy .60 le fait déjà).

## 9. Déploiement sur countrizz.fr (validé le 03/10 ; sources dans `docs/infra/2026-10-03-conventions-deploiement-countrizz.md`, partie 2 prime)

**Première tâche du plan**, avec le globe actuel, puis à chaque jalon.

- **Image** `pablohassan/countrizz-web:<branche>-<sha8>-<AAAAMMJJHHMMSS>`, **publique** sur Docker Hub, construite
  **sur le Mac** : `docker buildx --builder fresh-builder --platform linux/arm64 --push`, **après** la suite complète
  (`check`, `test:data`, `e2e`, `budget`). Les patchs image viennent du disque du Mac : **un `COPY` par résolution**
  (calques < 150 Mo), contrôle des **394 fichiers** contre `imagery.json` (taille + sha256) au build.
- **nginx non privilégié** dans le pod (port 8080 ; Service 80 sur **`.101`** par `loadBalancerIP`), `mime.types`
  complété de `ktx2` et `wasm` ; cache : `immutable` pour `assets/*` hachés, `max-age` court + revalidation pour
  patchs, textures et drapeaux (noms fixes), aucun cache pour `sw.js` / manifeste.
- **Chart Helm** `deploy/helm/countrizz` (`web` seul) : 2 réplicas étalés par nœud (`topologySpreadConstraints`),
  PodDisruptionBudget, `nodeSelector node.agiso.fr/class=worker` **et** `NotIn [raspberrypi0, rpi6-4b]`,
  NetworkPolicy `namespace-isolation`, `securityContext` non root, sondes, ressources ; **test du chart** qui refuse
  tout nœud inexistant ; `pullPolicy: IfNotPresent` (tags immuables).
- **Script de déploiement** à la `deploy-helm.sh` : staging par `scp` dans `/tmp/countrizz-deploy-staging` sur rpi1,
  `helm upgrade --install --history-max 5`, **`--dry-run` puis `--atomic`** (Helm part de rpi1 : kubeconfig du Mac
  cassé, dette 20).
- **Écritures annexes, chacune sur GO de l'utilisateur** : page `~/docs/cluster/countrizz.md` avant le premier
  déploiement ; `gen-metallb-allocations.sh` après le Service ; cible `blackbox-websites` **une fois le site en 200**
  (alertes déjà routées vers Discord).
- Rappels : la purge du dimanche 03:00 (`crictl rmi --prune`) retire toute image inutilisée — un rollback peut devoir
  re-tirer depuis Docker Hub ; l'apiserver joint depuis rpi1 est celui de rpi1 seul (dérive de doc).
- Qui fait quoi : le code de déploiement (Dockerfile, nginx, chart, test, script) s'écrit et se teste dans le dépôt
  (cloud ou Mac) ; **la construction de l'image et le déploiement se lancent depuis le Mac**.

## 10. Erreurs (section 5)

| Situation | Comportement |
|---|---|
| ni WebGPU ni WebGL 2 | écran « navigateur incompatible », sans bouton |
| textures ou frontières introuvables | carte d'erreur + Réessayer |
| perte du GPU | recréation du rendu et **reprise de la partie** ; la carte d'erreur seulement si la recréation échoue |
| patch image absent ou lent | texture globale + contour ; une manche n'est jamais bloquée |
| hors ligne | service worker ; patchs déjà vus en cache |
| stockage local indisponible | scores gardés le temps de la visite ; « Ton score ne peut pas être gardé sur cet appareil » discret à la fin |
| invite d'installation / partage absents | astuce iOS ou bouton masqué ; copie du lien, sinon lien affiché |

## 11. Tests

GitHub : `check` seul. **Le Mac fait foi** (`check && test:data && e2e && budget`) et barre l'image. Test d'abord.
- **Unitaires** : `rules`, `draw` (10 000 graines), `clock`, `machine` (dont premier vol pendant le 3-2-1), `scores`,
  `i18n`, logique d'interface (libellés longs, aire égale des drapeaux, installation, partage, haptique avec
  `navigator.vibrate` simulé).
- **Données** : §6.
- **Bout en bout** : parcours complet FR et EN, téléphone et bureau, trois modes ; crédit EOX jamais recouvert
  (`elementFromPoint`, chaque écran avec globe) ; « Tourne ton téléphone » ; mouvement réduit ; erreurs simulées ;
  PWA hors ligne ; avion de l'accueil et Terre de chargement dessinés ; haptique par espion injecté ; références
  visuelles `-darwin` des nouveaux écrans, WebGPU et `forceWebGL`.
- **Chart** : `helm template` + refus des nœuds inexistants.
- **Budget** : premier chargement ≤ 8 Mo (comme en 1B) ; écran de chargement ≈ 60 Ko ; précache borné.
- **À la main, sur vrais téléphones** : installation PWA ; ressenti haptique **après la 2A**, sur countrizz.fr.

## 12. Amendements au spec de refonte

| § refonte | Avant | Après (2A) |
|---|---|---|
| 6.1 | modes « Niv 1/2/3 » | **Drapeau / Pays / Capitale** (D9) ; capitale FR **et EN** |
| 6.3 | titres `5px 2px 1px black` | `-6px 4px 2px rgb(11,13,15)` (D6) |
| 6.3 | vibration légère | **haptique poussée** (§7) |
| 6.4 | l'intro sert d'écran de chargement | en 2A, **Terre cartoon 3D** (D15) ; l'intro 3D reste en 2B |
| 6.5 | PWA en 2B | **PWA en 2A** (D17), `orientation: portrait` |
| 7 | build par GitHub Actions | **build sur le Mac**, image publique, Helm depuis rpi1 (§9) |
| 9 | page « Crédits » | « **À propos** » + lien « Mentions et licences » (liste brute des attributions exigées) |

## 13. Points ouverts : résolus le 06/10

| # | Point | Résolution |
|---|---|---|
| 1 | Réglage fin de l'haptique | **Après la 2A**, par l'utilisateur, au doigt, **sur countrizz.fr déployé** depuis son téléphone. La 2A livre les motifs du §7 tels quels ; le plan prévoit un réglage facile (motifs dans un seul fichier). |
| 2 | Coordonnées de Ciudad de la Paz | **1,5925° N, 10,8236° E** (geodatos.net, cohérent avec l'article Wikipedia « Djibloho ») en point imposé ; le contrôle « capitale dans le pays » le vérifie contre le contour de la Guinée équatoriale. Recoupement Wikidata (P625) facultatif depuis le Mac. |
| 3 | Docker Hub, tirages anonymes | La documentation Docker indique, selon les pages, 100 tirages / 6 h ou **10 tirages / heure par adresse IP** pour un anonyme (on retient le plus strict). Avec une image publique, `pullPolicy: IfNotPresent`, 2 réplicas et des tags immuables, un déploiement coûte au plus 2 tirages : on reste **anonyme**, comme le reste du parc. Repli documenté si une erreur 429 apparaît (rafale après la purge du dimanche ou un drain) : un `imagePullSecret` vers le compte `pablohassan`. |
| 4 | Namespace `countrizz` | **Pod Security Admission `restricted`** (le pod nginx non root s'y conforme : `runAsNonRoot`, `seccompProfile: RuntimeDefault`, `capabilities.drop: [ALL]`, `allowPrivilegeEscalation: false`) — une première sur le parc, à noter dans `~/docs/cluster/countrizz.md` ; étiquette **`goldilocks.fairwinds.com/enabled=true`** comme les autres namespaces applicatifs. Les deux sont posés par le chart. |
| 5 | Proxy .60 et gros KTX2 | **`proxy_max_temp_file_size 0;`** dans le **seul** vhost `countrizz.fr` (pas de fichiers temporaires sur la carte SD du proxy) ; écriture sur .60, donc appliquée **sur GO** au moment du premier déploiement, avec synchronisation vers le backup .3. |

Sources du point 3 : [Docker Hub pull usage and limits](https://docs.docker.com/docker-hub/usage/pulls/),
[Docker Hub usage and limits](https://docs.docker.com/docker-hub/usage/),
[Revisiting Docker Hub Policies](https://www.docker.com/blog/revisiting-docker-hub-policies-prioritizing-developer-experience/).
Point 2 : [geodatos.net — Ciudad de la Paz](https://www.geodatos.net/en/coordinates/equatorial-guinea/djibloho),
[Wikipedia — Djibloho](https://en.wikipedia.org/wiki/Djibloho).
