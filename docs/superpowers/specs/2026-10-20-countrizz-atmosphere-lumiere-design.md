# Countrizz — atmosphère et lumière (sous-projet 3)

Date : 20/10/2026. Suite des sous-projets 2a (océan et relief, 1.12) et 2b (nuages en relief, 1.13).

## Décisions

- Consignes de l'utilisateur : une solution publiée plutôt qu'un calcul maison ; sources de 2026 ; aucune micro-validation.
- **Bibliothèque retenue : `@takram/three-atmosphere` 0.19.1** (module `webgpu`, 26/05/2026, MIT). Modèle de Bruneton
  (diffusion précalculée, table 4D) avec la diffusion multiple de Hillaire (table ajoutée en 0.19.0, 27/04/2026), et
  marche du rayon entre la caméra et la surface. Tables calculées sur le GPU au démarrage : aucun fichier à télécharger.
  Écrite en TSL ; tables aussi pour le backend WebGL 2 de `WebGPURenderer` (`AtmosphereLUTTexturesWebGL`).
- Rien d'équivalent dans three 0.186.1 (seul `SkyMesh`, ciel vu du sol).
- Poids : le moteur WebGL classique de three est déjà dans le build (importé par R3F) ; la bibliothèque n'ajoute que son
  code (module `webgpu` : 85 281 octets avant minification) et celui de `@takram/three-geospatial`.

## 1. Échelle

- Unité du monde = rayon terrestre (le globe est la sphère unité). `worldToUnit` vaut 6371 (rayons → km) ; toutes les
  longueurs des paramètres (exprimées « en mètres » dans la bibliothèque, c'est-à-dire en unités du monde) sont
  converties, les coefficients de diffusion divisés d'autant (la bibliothèque applique `worldToUnit` uniformément,
  `AtmosphereContextBase.ts`).
- Ellipsoïde : sphère de rayon 1 ; bas de l'atmosphère = 1.
- **Épaisseur exagérée** comme le relief (× 10) : sans cela, le relief soulevé (Everest × 10 ≈ 0,014) sortirait d'une
  atmosphère réelle de 60 km (0,0094). Hauteurs d'échelle (Rayleigh 8 km, Mie 1,2 km, ozone) et sommet multipliés par le
  facteur, coefficients divisés par lui : l'épaisseur optique, donc les couleurs, ne change pas. Facteur réglé à l'œil.

## 2. Ce qui change

1. **Lumière du soleil** : `AtmosphereLight` remplace la lumière directionnelle et l'ambiance. Le soleil rougit au ras
   du terminateur (transmittance) et le ciel éclaire la face de jour (irradiance indirecte).
2. **Halo et voile** : `aerialPerspective(couleur, profondeur)` dans la chaîne de rendu, avant le bloom et le TRAA ;
   il dessine l'atmosphère autour du limbe (profondeur 1) et voile la surface selon le trajet dans l'air. Il remplace
   la coque `atmosphere.ts` et le voile approché d'`earth.ts`.
3. **Le jaune du pays reste exact** : le matériau écrit dans un canal MRT la part de la couche pays ; la sortie mêle
   l'image voilée et l'image d'origine selon cette part (le voile approché était déjà posé avant la couche pays).
4. **Étoiles, soleil** : on garde les nôtres (le ciel de la bibliothèque sans étoiles, ni lune). Le disque du soleil :
   celui de la bibliothèque s'il s'accorde au bloom, sinon le nôtre.
5. **Nuages** : liseré à contre-jour, un lobe de diffusion avant (Henyey-Greenstein) sur les bords minces, éclairé par la
   même lumière.
6. **Qualité** : marche du rayon dans les deux niveaux, avec un décalage fixe d'une image à l'autre (voir les décisions
   d'exécution : la lecture des tables seule ne donnait pas le voile bleu).

## Décisions d'exécution (20/10)

- **Compatibilité three 0.186** : la 0.19.1 lit `struct().layout.name`, disparu depuis three r185 (ticket #111) ; correctif du
  PR #118 (non fusionné, vérifié sur 0.186.1 par son auteur) appliqué par `patch-package` (`web/patches/`). Dépôt sans
  commit depuis le 27/05/2026.
- **WebGPU seulement** ; le repli WebGL 2 garde le halo approché (tickets #108, #114, #116).
- **Marche du rayon gardée** : sans elle, la lecture des tables ne donnait presque pas de voile bleu, seulement le
  roussissement de la transmittance (mesuré sur la vue globale). Son décalage par pixel ne vient plus de la texture STBN
  téléchargée de GitHub (1 Mo, hors ligne impossible, licence NVIDIA discutée, #117) mais d'un bruit à gradient entrelacé
  (Jimenez 2014) généré au démarrage, identique d'une image à l'autre (pas de scintillement sans TRAA).
- **Calibration** tirée des paramètres : exposition 1,7138 (même luminance que l'ancien soleil d'intensité 3), balance des
  blancs (0,8939 ; 1 ; 1,0184) sur le résultat (le soleil de la bibliothèque est plus rouge que vert).
- **Épaisseur × 10** (× 6 essayé : halo trop fin vu de loin).
- **Antialiasing** : avec le MSAA, la profondeur d'un pixel de bord ne correspond plus à sa couleur moyennée (pointillé le
  long du limbe) ; en standard, MSAA remplacé par SMAA (le FXAA effaçait les étoiles : 1 pixel de ciel au-dessus de 60
  contre 494) ; le ciel est ajouté à la couleur au lieu de la remplacer.
- **Canal « pays »** déclaré par la passe et résolu par matériau (une MRT posée sur le matériau échouait hors de la passe).

## 3. Tests

- Unitaires : conversion des paramètres à l'échelle (épaisseur optique conservée), mélange du masque pays.
- E2E : couleurs mesurées du halo (jour, nuit), jaune du pays inchangé, rendu WebGPU et WebGL 2 sans erreur ;
  références visuelles refaites ; durée des tables au démarrage mesurée (SwiftShader) ; budget.

## 4. Hors champ

Ombres volumétriques (`ShadowLengthNode`, cascades d'ombres) ; lune ; étoiles du catalogue Yale.

## Sources

- `@takram/three-atmosphere` 0.19.1, `WEBGPU.md` et `CHANGELOG.md` (lus le 20/10/2026) :
  https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/atmosphere
- E. Bruneton, *Precomputed Atmospheric Scattering* ; S. Hillaire, *A Scalable and Production Ready Sky and Atmosphere
  Rendering Technique* (EGSR 2020) — modèles repris par la bibliothèque.
