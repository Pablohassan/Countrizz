# Phase 2A — conception de l'interface (section 3) : décisions et pièces

Sessions du 03 au 05/10/2026 (brainstorming architectural, skill `superpowers:brainstorming`, compagnon visuel).
**Rien de tout ceci n'est encore écrit dans le spec de la 2A** : ce dossier en est la matière. Il a été versionné le 05/10
pour qu'une session cloud reprenne au même endroit (avant, tout vivait hors du dépôt : `.superpowers/`, scratchpad, mémoire).

## Où on en est, exactement

**Avion de l'accueil réglé** (05/10, session cloud ; décision 8) : A2 · cartoon, dosage **E2**, réduit de 30 %, tour du monde en boucle avec bulles « Pays · Capitale » aux escales.
Section 3 presque close (décisions 9 à 16). **Questions en attente** : validation des écrans « À propos » et « Chargement » revus (`ecrans/a-propos-chargement.html`) et du nom à afficher comme auteur ; la PWA (installation) passe-t-elle de la 2B à la 2A ; confirmation du premier vol pendant le décompte (décision 11). Ensuite : section 4 (données bilingues).

Dans l'ordre : ~~choix du mode~~ → ~~HUD et chrono~~ → ~~3-2-1~~ → ~~fin de partie~~ → ~~scores~~ → crédits → erreurs et chargement →
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
| 8 | Avion 3D | **A2 · cartoon premium** (aplats à 3 tons, contour noir épais, ombre nette). L'avion fait le tour **Rabat → Madrid → Paris → Athènes** sur une courbe lisse (Catmull-Rom sphérique) : passages en rase-mottes à Madrid et Paris (étapes trop courtes à l'écran pour atterrir), atterrissage à Athènes ; **il prend les couleurs du pays à chaque escale** (≈ 0,4 s, gonflement de 6 %) ; roulis permanent de −25° pour montrer la quille. Dosage **E2** retenu : quille = couleur principale du drapeau, bande au bord de fuite = seconde (France : bleu, crème, rouge). **Discret** : avion réduit de 30 % (longueur 0,0525, ≈ 27 px), vol ralenti de 30 % (boucle de 15,7 s), contours affinés (1,9 / 1,0 px). **Boucle** : aucun nom au départ ; à chaque escale, bulle « Pays · Capitale » avec un petit point vert #2fbf4a (bonne réponse ; remplace les ✓ des épingles et la bulle « Grèce · ? ») ; après Athènes, l'avion file vers la droite (élan), fait le tour du globe par derrière (≈ 2,4 s) et revient vers Rabat par la gauche ; bulles et traînée s'effacent à la sortie de l'écran ; boucle ≈ 20 s | accueil-avion-escales.html |
| 9 | Choix du mode | **A · boutons inclinés empilés** : Drapeau / Pays / Capitale, les mêmes boutons violets que « Jouer » ; étoiles de difficulté discrètes (1 à 3) sous le nom, record en pastille jaune à droite (« Nouveau » sombre pour un mode jamais joué) ; « ‹ Retour » en haut à gauche, nom du joueur en haut à droite ; décor de l'accueil (lever de Terre, crédit EOX en bas) | mode.html |
| 10 | HUD et chrono | **H2 · barre + jauge pleine largeur** : ✕ Quitter à gauche, secondes, score en pastille inclinée à droite ; dessous, une jauge jaune #f7dc6f de 12 px (bord noir) qui se vide sur 60 s nettes. Pause (vol, onglet caché) = jauge hachurée et « ❚❚ » devant les secondes ; 10 dernières secondes = jauge et chiffres rouges #e8413a qui clignotent (pas en mouvement réduit) ; « +10 » vert près du score à la révélation | hud.html |
| 11 | Compte à rebours | **C1 · chiffres géants jaunes** : 3, 2, 1 (une seconde chacun) en Chango #f7dc6f cerné de noir, ombre du titre ; chaque chiffre surgit puis s'envole en grossissant ; « GO ! » dans un pavé violet incliné (le bouton « Jouer »). HUD H2 déjà affiché, jauge pleine en pause. Mouvement réduit : chiffres sans animation. *Proposé, à confirmer* : le premier vol part pendant le décompte | compte-a-rebours.html |
| 12 | Fin de partie | **F1 · carte en haut, globe en bas** (la mise en page de l'accueil et du choix du mode) : « Temps écoulé ! », mode et nom du joueur ; carte crème avec le score en grand, « 19 bonnes réponses sur 24 », ancien record ; tampon jaune « Nouveau record ! » (pas d'animation en mouvement réduit) ; rangée des drapeaux de la partie (erreurs grisées avec ✗ rouge) ; Rejouer (violet), Changer de mode et Scores (bleu nuit) ; le globe repasse en vue d'ensemble et tourne, crédit EOX à sa place | fin.html |
| 13 | Scores | **S2 · cartes inclinées** : top 10 local du mode, une bande inclinée bleu nuit par joueur (rang, nom, score en jaune), le 1ᵉʳ en jaune, la ligne du joueur en violet, décalée et suivie de « · toi » ; onglets Drapeau / Pays / Capitale inclinés (actif en jaune) ; « ‹ Retour » et « Rejouer » ; décor de l'accueil, globe plus bas | scores.html |
| 14 | Crédits → « À propos » | **Pas de page de crédits détaillée** (accessoire pour l'utilisateur) : un écran « À propos » qui dit **qui a fait le jeu** et propose **« Installer l'appli »** (PWA : invite du navigateur ; sur iPhone/iPad, astuce « Partager → Sur l'écran d'accueil » ; bouton masqué si déjà installée). Proposé : un petit lien « Mentions et licences » en bas, liste brute, car ODbL / CC BY / CC BY-NC-SA exigent une attribution accessible. Bouton de l'accueil « Crédits » → « À propos » (à confirmer) | a-propos-chargement.html (derniers-ecrans.html : version écartée) |
| 15 | Chargement | Jauge jaune + **petite Terre cartoon 3D qui tourne** (demande de l'utilisateur) : relief très exagéré (× ≈ 20), facettes toon nettes (2 000 : icosaèdre de niveau 9), **réduite de 30 %** et **0,384 rad/s** (réglages du 05/10 : −30 % de taille, ×2 polygones, +20 % de vitesse), contour noir sur halo bleu, épingles géantes sur 12 capitales, nuages en boules, **avion rouge à hélice en orbite** (rayon 1,4, 0,25 rad/s soit un tour en ≈ 25 s ; formes simples, même style toon + contour, hélice qui tourne ; pas de modèle importé : ni fichier ni chargeur en plus) ; module autonome WebGL `ecrans/globe-chargement.js`, données 49 Ko (`relief-360.png`, élévation + eau, tirées de three-globe MIT / NASA) ; affiché si le globe n'est pas prêt après ≈ 300 ms ; immobile en mouvement réduit | a-propos-chargement.html |
| 16 | Erreurs, « Tourne ton téléphone » | **Validés tels que maquettés** : erreur de chargement (globe grisé, bulle crème, « Réessayer » ; même carte pour la perte du GPU), navigateur incompatible (bulle sans bouton), « Tourne ton téléphone » (téléphone jaune qui pivote, « ❚❚ Partie en pause », téléphones seulement). Messages dans l'interface, traduits | derniers-ecrans.html |

Le portrait imposé, les repères G5 et la révélation R3 demandent des **coordonnées de capitales**, que les données n'ont pas
encore (à traiter en section 4). Les positions utilisées par les maquettes sont dans `contexte/pins.json` (projection exacte
de la page de sonde ; coordonnées de capitales approximatives).

## Contenu du dossier

- `ecrans/` : tous les écrans du compagnon visuel (`*.html`), les captures réelles du globe (`*.jpg`, converties des PNG),
  les drapeaux utilisés (`*.svg`) et les prototypes de l'avion (`avion-socle.js`, `avion-papier.js`, `avion-cartoon.js`,
  `avion-origami.js`, `avion-cartoon-escales.js`, three.js 0.186.1 par importmap depuis cdn.jsdelivr.net). Les pages appellent leurs ressources en
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
