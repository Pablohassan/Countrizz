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
6. **Qualité** : `raymarchScattering` seulement en « haute » (le bruit temporel qu'il introduit n'est lissé que par le
   TRAA) ; « standard » lit les tables.

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
