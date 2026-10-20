# Countrizz — sous-projet 2a du rendu réaliste : océan et relief (spec)

Date : 20/10/2026. Branche `newcountri`. Suite du sous-projet 1 (zoom et images de près, en ligne en 1.10–1.11).

## 0. Décisions de l'utilisateur (20/10/2026)

- Sous-projet 2 coupé en deux : **2a océan** (ce document), **2b nuages en relief** ensuite.
- Approche **légère** pour l'océan (pas de houle FFT calculée en temps réel).
- **Des images toutes faites plutôt que des calculs** quand elles existent (« il existe des images utilisables ») ; une
  image libre plus récente remplace l'ancienne si elle existe ; chercher des formats de compression plus légers.
- **Relief soulevé** ajouté à ce chantier, **exagération 10** (essai du 20/10 : ×10 et ×30 comparés sur l'Himalaya et les
  Andes, caméra inclinée).
- Sources : 2026 d'abord (pour les nuages, repli 2025 permis) ; une image ancienne reste permise quand aucune image libre
  récente ne couvre le besoin (cas de Blue Marble, §1.1).

## 1. Océan

### 1.1 Couleur : la mer de Blue Marble

**Constat (20/10)** : l'océan de la mosaïque EOxCloudless 2025 n'est pas une photo mais un bleu sombre uniforme ombré
par le relief du fond ; les bancs des Bahamas y sont bleu foncé. Les photos de près des pays (même source) n'ont de vraie
couleur que dans un mince liseré côtier.

**Décision** : les pixels de mer prennent la couleur de **Blue Marble: Next Generation** (NASA, juillet 2004, sans
ombrage), déjà téléchargée par le pipeline (`bmng-200407-21600.png`, 21 600 × 10 800) et déjà créditée (glaces polaires).

- **Texture globale** (`day-8k`, `day-4k`) : au build, mélange par le masque mer de Natural Earth adouci d'un flou d'environ
  un pixel ; terre = Sentinel-2, mer = Blue Marble. Essai du 20/10 : lagons des Bahamas, de Cuba et de Floride
  turquoise, océan un peu plus sombre ; fichiers plus légers (8K : 2 726 241 octets contre 3 873 228 ; 4K : 742 879
  contre 1 096 801).
- **Photos de près des pays** (`public/data/patches/img`, 438 fichiers hors dépôt) : même mélange, la mer de Blue
  Marble reprojetée dans le cadre azimutal du patch, là où l'alpha marque la mer. Remplace l'option (b) « profondeur
  dans chaque photo » acceptée plus tôt : une image existe, on ne calcule pas de couleur par la profondeur.
- **Limite connue** : les atolls des Maldives restent à peine visibles (Blue Marble à ≈ 500 m n'en montre que de faibles
  anneaux). Piste pour plus tard, hors de ce chantier : mosaïques trimestrielles Sentinel-2 sans nuages de Copernicus
  (2025, côtes seulement, accès par API).
- Le léger relèvement `vec3(0, 0.012, 0.035) · sea` de `earth.ts` est réglé de nouveau sur la nouvelle mer (planche
  de réglage, page de sonde).

### 1.2 Reflet du soleil (loi de Cox et Munk)

Repris d'une implémentation three.js de 2026 (globe « Moon », PR #22 fusionnée le 08/10/2026), elle-même fondée sur la
loi de Cox et Munk :

- rugosité de la mer tirée du vent : pente quadratique moyenne `mss = 0,003 + 0,00512 · U` (U en m/s),
  `roughness = mss^0,25` ;
- Fresnel de l'eau de mer : F0 = 0,02006 (indice 1,33) au lieu de 0,04 par défaut ;
- seul l'excès de luminance passe au bloom (seuil doux) ; le reflet reste plafonné pour ne pas saturer.
- **Vent** : une fonction de la latitude dans le shader (alizés, calmes équatoriaux, vents d'ouest, plus une variation lente
  en longitude), sans fichier. Les valeurs de U viennent d'une climatologie publiée, lue à la source au moment du plan.

### 1.3 Mer vivante

- **Scintillement et vagues** : une petite texture de pentes de vagues (normal map RG, 512 × 512, répétable), fabriquée
  une fois au build à partir d'un spectre de vagues ; deux couches qui glissent en sens différents, à vitesses
  différentes. Elle n'apparaît qu'en approchant (même critère de grossissement que le relief, §2.3) ; de loin, la
  rugosité de Cox et Munk porte seule le reflet.
- Quand les vagues de la texture sont visibles, la rugosité baisse d'autant (la pente que la texture dessine n'est plus
  comptée deux fois) : le reflet devient une traînée scintillante au lieu d'une tache floue.
- Objectif de poids : 300 Ko au plus pour cette texture (mesuré au build ; un dépassement se soumet à l'utilisateur).

## 2. Relief soulevé

### 2.1 Principe

La boule (`SphereGeometry(1, 512, 256)`, `globe.ts`) est soulevée par l'altitude : `positionNode = positionLocal +
normalLocal · h · 10 · relief`, où `h` est l'altitude lue dans la texture de surface (canal R) au niveau de détail 0, en
rayons terrestres, et `relief` le facteur d'apparition du §2.3. Le relief d'ombrage existant (normale exagérée 14 fois)
reste.

### 2.2 Altitude plus récente

Le canal R passe de GEBCO_08 (Blue Marble, 8 bits, 0 → 6 400 m) à **GEBCO_2026** (publiée en avril 2026, domaine
public, citation obligatoire), lue au build dans l'aperçu réduit du COG de source.coop (`gebco_2026.tif`) sans
télécharger le fichier complet. Plage 0 → 8 850 m (l'Everest n'est plus écrêté) ; `RELIEF.metresFull` suit. La mer
reste à 0 (le relief ne creuse pas l'océan).

### 2.3 Apparition et disparition

- De près, au cadrage d'un pays, la caméra est à la verticale : la hauteur ne s'y voit pas, et le relief d'ombrage s'y
  efface déjà (`RELIEF_MAGNIFY`). Le soulèvement s'efface selon le **même critère** (pixels par texel de relief),
  calculé par image côté CPU à partir de l'altitude de la caméra, et passé en uniforme.
- Conséquence voulue : au cadrage serré, la surface redevient la sphère exacte ; photos de près, pays en jaune, balises et
  positions à l'écran gardent leur précision actuelle.

### 2.4 Ce qui doit suivre le relief

- **Pays en jaune et photos de près** (dans le matériau de la Terre) : le point lu passe de la sphère exacte
  (`exactSpherePoint`) au point réellement dessiné (`normalize(positionWorld)`) en proportion de `relief` ; à `relief = 0`,
  rien ne change.
- **Frontières** (`borders.ts`, `BORDER_RADIUS = 1.0002`) : soulevées de la même hauteur dans leur vertex shader, et
  découpées au build en segments assez courts pour ne pas passer sous une crête.
- **Balise** : `depthTest: false`, rien à changer.
- **Positions à l'écran** (`screenPoint`, bulles et étiquettes) : calculées sur la sphère ; l'écart reste faible là où
  elles servent (cadrage serré, relief effacé). Pas de changement.
- **Atmosphère** (coquille à 1,06) : au-dessus du relief soulevé (≈ 0,014 rayon au plus à l'Everest × 10).

### 2.5 Défaut connu

À forte exagération, la photo s'étire sur les pentes raides (traînées blanches à ×30 dans l'essai). À ×10, l'essai ne l'a
pas montré de façon gênante ; à vérifier sur les planches.

## 3. Cache fichier par fichier

**Problème (lu dans `vite.config.ts`)** : le cache `countrizz-lourd-<empreinte>` est nommé d'après tout `public/textures`,
`basis`, `intro`, `fonts`, `icons` ; changer une seule texture renomme le cache et fait tout retélécharger. De même,
`countrizz-pays-<empreinte>` dépend de tout `imagery.json` : un pays changé fait retélécharger tous les pays déjà vus.

**Décision** :

- Caches à **nom stable** (`countrizz-lourd`, `countrizz-pays`, `countrizz-donnees`).
- Chaque adresse de fichier lourd porte l'**empreinte de son contenu** (`?v=<empreinte>`) : textures, transcodeur,
  fichiers de l'intro, polices, icônes ; empreintes calculées au build (table injectée par `define`) ; les photos de
  pays prennent la leur dans `imagery.json` (`sha256`, déjà présent).
- Au démarrage, l'appli retire de chaque cache les entrées dont l'adresse n'est plus dans la table courante.
- Effet : seul un fichier changé se retélécharge. La migration (anciens noms de cache supprimés) fait retélécharger une
  dernière fois.

## 4. Compression

- Textures : KTX2 (ETC1S pour la couleur, UASTC pour la surface), inchangé.
- Le format qui vient, **XUASTC LDR** (Basis Universal 2.5, mars 2026 : ≈ 1,15 à 3,5 bits par pixel en 4 × 4 avec
  meilleure qualité qu'ETC1S), n'est pas encore normalisé dans KTX2 (travail avec Khronos en cours en mars 2026) et la
  documentation n'indique pas de prise en charge par three.js : **non retenu**, à revoir au prochain chantier de textures.
- La nouvelle normal map des vagues (§1.3) se compresse comme la surface (UASTC linéaire, supercompression zstd).

## 5. Performances et repli

- Tout est dans le matériau de la Terre et dans des textures : rien de nouveau en passe de rendu, aucun calcul GPU
  hors du shader ; fonctionne de la même façon en WebGPU et en repli WebGL 2.
- Le soulèvement lit une texture dans le vertex shader : 513 × 257 = 131 841 sommets, une lecture chacun.
- Budget de poids inchangé (12 Mo au premier chargement de l'accueil) ; `npm run budget` le vérifie.

## 6. Tests

- **Unitaires** : mélange mer/terre du build (pixel de mer = Blue Marble, pixel de terre = Sentinel-2, côte mêlée) ;
  loi de Cox et Munk et vent par latitude ; facteur d'apparition du relief (0 au cadrage serré, 1 de loin) ; table des
  empreintes et purge des entrées du cache absentes de la table.
- **e2e (page de sonde)** : Bahamas plus turquoise que le large (rapport des canaux mesuré) ; reflet du soleil au point
  attendu ; relief : silhouette des Andes au limbe différente avec et sans relief, frontières jamais cachées sous une
  crête ; au cadrage serré d'un petit pays (Monaco, Vatican), image identique à aujourd'hui à la tolérance près.
- **Cache** : `pwa.spec` — après changement d'une seule texture, seul ce fichier repasse au réseau.
- **Suites complètes** : `check`, `test:data`, `e2e:local`, puis e2e et `budget` sur le site après déploiement.

## 7. Livraison

- Les photos de pays sont hors dépôt (Release GitHub) : leur nouvelle version demande le GO de l'utilisateur sur la
  commande exacte de publication, comme le déploiement.
- Version suivante : 1.12.

## 8. Hors champ

Nuages en relief (2b) ; atmosphère et lumière (sous-projet 3) ; houle FFT en temps réel ; couleur calculée par la
profondeur ; caméra qui s'incline sur le pays visé.

## 9. Sources lues

- Thèse TU Wien, W. Muth, 23/03/2026, *Real-Time Volumetric Rendering of Meteorological Cloud Data* (pour 2b).
- azabrod1/Moon, PR #22, fusionnée le 08/10/2026 : reflet de l'océan (Cox et Munk, F0 de l'eau de mer, seuil du bloom).
- owenyuwono/poseidon (three.js 0.184, WebGPU/TSL, MIT) : houle FFT, écartée (plan plat, WebGPU seul).
- GEBCO_2026 Grid (gebco.net, avril 2026, domaine public) ; COG sur source.coop (giswqs/gebco-bathymetry).
- Basis Universal (BinomialLLC, README, v2.5) : XUASTC LDR.
- Copernicus Data Space : mosaïques trimestrielles Sentinel-2 sans nuages (piste pour les côtes).
- NASA Blue Marble: Next Generation (juillet 2004), déjà dans `scripts/textures/config.ts`.
