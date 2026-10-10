# Countrizz — intro en pâte, accueil 3D, Terre dans l'espace, PWA · plan d'exécution

> Écrit le 10/10/2026. L'utilisateur a demandé de **tout faire puis de montrer le résultat** (« va-s'y fait tout et
> montre-moi le résultat puis je critiquerai et on ajustera »). Specs : plan A
> `docs/superpowers/specs/2026-10-10-countrizz-intro-pate-accueil-design.md` ; plan C (Terre dans l'espace) : spec de
> refonte §4.2 et §6.4, points relevés le 10/10 ; plan B (PWA) : spec 2A §8 + décisions du 10/10 (textures selon le
> téléphone, stockage persistant). Exécution en direct, test d'abord pour la logique pure ; rendu vérifié en images sur
> le GPU du Mac. **Aucune écriture hors dépôt sans GO** (Docker Hub, cluster) : la démonstration se fait en local, le
> déploiement attend le GO.

## Décisions prises en route (registre)

- **Vue d'accueil** : la capture validée `acc-16.jpg` est la sonde à l'altitude 1,6, décalée de 400 px vers le bas.
  Ajustement sur 5 repères (Paris, Gibraltar, Sicile, delta du Nil, lac Tchad) : regard **lng 10°, lat 19,5°**, altitude
  **1,6**, écart moyen 15,6 px (image 780 × 1688). Le décalage est rendu par un **tangage** de la caméra (atan(0,948 ·
  tan 25°) ≈ 23,85°) et non par `setViewOffset`, que le TRAA de three réécrit à chaque image (`TRAANode.setViewOffset`
  pose `offsetX/Y = 0` + gigue puis `clearViewOffset`).
- **Intro** : portée sur `three/webgpu` (WebGPURenderer + matériaux nodaux TSL, repli WebGL 2), pas sur
  `WebGLRenderer` : `three/webgpu` n'exporte pas `WebGLRenderer`, l'importer de `three` doublerait three dans le bundle.
- **Intro** : la Terre en pâte est fixe à l'origine (sphère unité, même repère que le globe : lng 0 → +X, lng 90 → −Z) ;
  c'est la caméra qui bouge. Les phases du prototype (Terre placée à l'écran, caméra fixe de 20°) sont converties en
  caméra relative à la Terre ; la dernière phase rejoint la caméra de la vue d'accueil (50°, tangage) : l'image finale
  de l'intro est celle du globe réel.

## Tâches

### A — intro et accueil
- [ ] A1 `camera/home.ts` : `homePose(viewport)` (regard, altitude, haut, tangage) + tests (Paris et haut du disque aux
      positions de la capture validée)
- [ ] A2 tangage dans le pilote de caméra (`FramePose.pitch`, animé pendant les vols, 0 pour les pays) et
      `Globe.applyPose` ; tests
- [ ] A3 `GlobeView` : départ sur la vue d'accueil, `home()`, rendu suspendu (`active`) avec précompilation ; rotation
      légère
- [ ] A4 fabrique des textures de l'intro dans `web/scripts/intro/` → `public/intro/` (≤ 3 Mo avec le code)
- [ ] A5 `intro/timeline.ts` : chronologie pure (caméra relative, objets, DOM) + tests (continuité, toupie ≤ 21,6°/image,
      image finale = vue d'accueil)
- [ ] A6 `intro/scene.ts` : la Terre en pâte en TSL (couleur monde + Europe, pentes, empreintes, frémissement), nuages,
      point, drapeau, frontière, lumières, ombres
- [ ] A7 `intro/Intro.tsx` + écran d'accueil `ui/Home.tsx` + `App.tsx` (raccord, attentes, « Passer ») ; démo dans
      `demo.html`
- [ ] A8 e2e (intro → accueil, Passer, Jouer → démo, globe lent, pâte absente) ; budget à deux plafonds

### C — la Terre dans l'espace
- [ ] C1 relief : normal map précalculée (pipeline textures) à la place du `bumpMap`
- [ ] C2 nuages : couche à part avec ombre décalée vers le soleil, sans couture au 180ᵉ méridien
- [ ] C3 atmosphère : diffusion (Rayleigh + Mie) sur la coquille et voile au sol, orangé au crépuscule
- [ ] C4 océan : Fresnel (Schlick) et reflet du soleil
- [ ] C5 accueil : lever de soleil derrière le limbe (soleil placé pour l'accueil)
- [ ] C6 réglages jamais tranchés (lueur de nuit du bloom, saturation du Sahara, tone mapping) : planche comparative

### B — PWA
- [ ] B1 `vite-plugin-pwa` (compatibilité Vite 8 vérifiée) : manifeste, icônes, service worker
- [ ] B2 cache d'exécution (textures, patchs, drapeaux, intro) borné, versionné ; données en revalidation
- [ ] B3 téléchargement des textures selon le téléphone à l'installation + `navigator.storage.persist()`
- [ ] B4 invitation à installer (Android `beforeinstallprompt`, astuce iOS), sur l'accueil des téléphones
- [ ] B5 e2e hors ligne, budget du précache

## Registre d'avancement

(une ligne par tâche terminée : commits, tests)
