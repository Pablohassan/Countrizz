# Phase 2A — conception de l'interface (section 3) : décisions et pièces

Sessions du 03 au 05/10/2026 (brainstorming architectural, skill `superpowers:brainstorming`, compagnon visuel).
**Rien de tout ceci n'est encore écrit dans le spec de la 2A** : ce dossier en est la matière. Il a été versionné le 05/10
pour qu'une session cloud reprenne au même endroit (avant, tout vivait hors du dépôt : `.superpowers/`, scratchpad, mémoire).

## Où on en est, exactement

**Question en attente de l'utilisateur** : le style de l'avion en papier 3D de l'écran d'accueil — **A1 papier réaliste**,
**A2 cartoon premium** ou **A3 origami et effets** (combinaison possible, par ex. A1 + les traînées d'A3). Écran :
`ecrans/accueil-avion-3d.html` (trois téléphones animés). Le reprendre en premier.

Puis, dans l'ordre : choix du mode → HUD et chrono → 3-2-1 → fin de partie → scores → crédits → erreurs et chargement →
« Tourne ton téléphone » ; puis section 4 (données bilingues), section 5 (tests et erreurs), écriture du spec
`docs/superpowers/specs/2026-10-0X-countrizz-phase2a-design.md` (il amende aussi le spec de refonte : §6.3 ombre des titres,
§7 build sur le Mac), auto-relecture, relecture par l'utilisateur, puis skill `writing-plans`. **Aucun code avant la
validation du spec et du plan.** Les 17 questions de conception recensées sont au §6 de `contexte/brief-interface.md`.

## Décisions de l'utilisateur

| # | Sujet | Décision | Écran |
|---|---|---|---|
| 1 | Question, téléphone portrait | **A** : globe plein écran, grille 2×2 de réponses en bas sur un voile dégradé #16173a ; **question juste au-dessus de la grille** ; crédit EOX sur sa propre ligne sous la grille ; pays recentré dans la zone libre (décalage de l'axe optique : nouvelle API du globe, et contournement du TRAA qui réécrit `setViewOffset` à chaque image) | question-telephone.html, question-modes.html |
| 2 | Boutons texte | violets inclinés skewX(-15deg), ombre 6px 6px 0 #000, libellé contre-incliné ; à partir de 20 caractères (6 noms) → 2 lignes, police réduite ; capitales sur 2 lignes au plus à la taille normale | question-modes.html |
| 3 | Mode Drapeau | **P1** : pas de tuile, la case est un bouton invisible ; drapeau à ses vraies proportions, **aire égale bornée** (zone utile ≈ 150×88, A = 7776 : Népal 72×88, Suisse 88×88, France 108×72, 2:1 125×62, Qatar 141×55) ; décor « autocollant » (liseré crème #fff8e7 3px + trait noir 2,5px + ombre noire 6px), sans skew ; proportions lues dans width/height du SVG (`qat.svg` : le viewBox ment), précalculées au build ; Népal : contour qui suit la forme ; états : pression = s'enfonce, focus = contour jaune décalé, bonne = anneau vert + ✓ + nom, mauvaise = ✗ + nom + secousse, autres estompés ; ne jamais teinter le drapeau. P3 (carte 3:2) puis V1/V2 ont été essayés puis écartés par l'utilisateur | drapeaux-sans-tuile.html, carte-32-v2.html |
| 4 | Révélation (1,5 s) | **R3** : boutons (bon vert ✓, mauvais rouge ✗ + secousse, autres estompés, « +10 » près du score, aria-live) + globe (vert + flash / rouge pulsé) + **étiquette autocollant « Pays · capitale » posée sur le pays** (crème, bord noir, rotation −3°) → API du globe : position écran du pays ; ne pas masquer un micro-État | revelation.html |
| 5 | Paysage / bureau | **L1** : la même grille 2×2 en bas partout (bureau compris, touches 1-4 rappelées sur les boutons) ; **smartphone : portrait imposé** → en 2A écran cartoon « Tourne ton téléphone » (chrono en pause), en 2B manifeste PWA `orientation: portrait` (un navigateur ne peut pas verrouiller l'orientation, iOS Safari) | paysage.html |
| 6 | Accueil | **H3 · Lever de Terre** : globe proche qui se lève dans la moitié basse et tourne lentement ; titre, nom, FR/EN, « Jouer » (chevrons), Scores, Crédits au-dessus dans l'espace ; titre en ombre −6px 4px 2px rgb(11,13,15) (valeur réelle de l'ancien jeu ; corriger le spec §6.3, sans objection de l'utilisateur) | accueil.html |
| 7 | Repères de l'accueil | **G5 · Escales** : le globe raconte une partie — épingles-drapeaux ✓ des pays trouvés (Maroc, Espagne, route pointillée crème), drapeau planté qui ondule à Paris + étiquette « France · Paris », balise jaune du jeu sur la prochaine question « Grèce · ? » ; repères en calque DOM projeté (échelle et estompe selon l'orientation de la surface, suivent la rotation) ; **l'avion en papier en vraie 3D haute qualité** (objet three.js dans la scène du globe, sur le grand cercle, ombre réelle) — style en attente (ci-dessus) | accueil-reperes.html, accueil-avion-3d.html |

Le portrait imposé, les repères G5 et la révélation R3 demandent des **coordonnées de capitales**, que les données n'ont pas
encore (à traiter en section 4). Les positions utilisées par les maquettes sont dans `contexte/pins.json` (projection exacte
de la page de sonde ; coordonnées de capitales approximatives).

## Contenu du dossier

- `ecrans/` : tous les écrans du compagnon visuel (`*.html`), les captures réelles du globe (`*.jpg`, converties des PNG),
  les drapeaux utilisés (`*.svg`) et les prototypes de l'avion (`avion-socle.js`, `avion-papier.js`, `avion-cartoon.js`,
  `avion-origami.js`, three.js 0.186.1 par importmap depuis cdn.jsdelivr.net). Les pages appellent leurs ressources en
  `/files/<fichier>`.
- `contexte/` : `brief-interface.md` (contraintes dures, valeurs exactes de l'ancienne interface au commit 2d62fc2, dimensions,
  contradictions spec/code, API du globe qui manque, 17 questions) ; `lectures-contexte-interface.md` (les 5 rapports bruts) ;
  `synthese-drapeaux.md` (recherche sourcée : Seterra, JetPunk, apps, Noto, aire égale) ; `pins.json` ;
  `rapports-avion-3d.json` (socle : caméra et soleil du jeu recalés à ≤ 0,07 px ; rapports des trois avions et de leur revue).
- `fragments/` : les cinq directions de repères de l'accueil (G1 à G5 ; G5 retenue), fragments HTML préfixés `.dN`.
- `avion-bancs/` : bancs d'essai des avions (`/h/…` dans le serveur d'origine) et `socle.html` (vérification au pixel).
- `outils/` : scripts de capture et d'assemblage de la session (Playwright, sharp). **Chemins absolus du Mac** : à adapter.

## Rouvrir les écrans (session cloud ou nouvelle session)

Le compagnon de `superpowers:brainstorming` crée un dossier de session neuf à chaque démarrage : lancer
`start-server.sh --project-dir <dépôt>`, puis **copier `ecrans/*` dans le `content/` de la session** qu'il indique ; il sert le
`.html` le plus récent et les ressources en `/files/`. Pour un simple aperçu sans compagnon, un serveur statique qui sert
`ecrans/` à la fois en `/` et en `/files/` suffit (c'est ce qu'a vérifié le 05/10 l'export de `accueil-avion-3d.html` :
trois avions prêts, aucune erreur).

## Limites hors du Mac

- Les **patchs image** des pays (`web/public/data/patches/img/*.ktx2`, 394 fichiers) et les caches des pipelines sont hors
  dépôt : une session cloud ne peut pas refaire de captures fidèles du jeu (`npm ci`, puis `npm run geodata:fetch` avant
  `test:data`). Les captures déjà faites sont dans `ecrans/`.
- La CI de référence est **le Mac** (rendu GPU réel, références visuelles `-darwin`) : aucune suite e2e ne fait foi ailleurs.
- `.superpowers/` reste ignoré par git ; l'original non converti (PNG) et les brouillons des agents sont restés sur le Mac.
