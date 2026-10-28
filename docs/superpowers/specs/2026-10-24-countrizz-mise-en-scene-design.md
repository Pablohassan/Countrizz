# Countrizz — mise en scène des transitions · design

> Validé par l'utilisateur le 24/10/2026 (« ok pour tout ») sur le storyboard issu de l'analyse `mise-en-scene`
> (`.claude/skills/mise-en-scene/`, film au format Pixel 9, quatre analyses : ouverture, entrée en jeu, boucle et sortie,
> code des raccords). Ses trois choix : **le 3-2-1 est supprimé** (le vol en tient lieu), **le choix du mode se fond dans
> l'accueil**, **le ciel du globe prend le bleu nuit de la vidéo**.

## 0. Constat (film du 24/10)

- Deux transitions de trop et une scène de trop : (1) après le fondu vidéo → globe, une seconde entrée de l'accueil
  (titre recalé, repères qui surgissent, « Jouer » qui s'allume), et des commandes arrivées de quatre côtés pendant que
  la vidéo pose encore ses lettres (`home.css` : 0,8 / 1,1 / 1,4 / 1,7 s après le montage) ; (2) le 3-2-1 double le premier
  vol, chacun sur sa propre horloge (`useGame.ts:75` contre le vol de `useGame.ts:64`) ; (3) « Choisis ton mode », une
  scène entière pour un seul choix, qui retire d'un coup l'avion et les repères (`App.tsx:152`).
- Incohérences : le ciel passe du bleu nuit de la vidéo (21, 24, 65) au noir du globe (2, 1, 6) pendant le fondu ; la
  grille sort et rentre à chaque vol à la même place (`GameScreen.tsx:55`, `game.css:36`) ; l'entrée de l'accueil rejoue
  à chaque retour ; « Retour » depuis les scores ramène à la fin, qui se rejoue (`machine.ts:98`).

## 1. Storyboard cible

1. **Fin de la vidéo** : la Terre file dans le « o », les lettres se posent ; rien d'autre ne bouge (les commandes de
   l'accueil, montées à `ACCUEIL`, restent invisibles). Le titre de l'accueil se pose exactement sur celui de la vidéo
   (`oDuTitre`, `recalage`) et **n'en bouge plus** sur un téléphone ; il apparaît opaque d'un coup 0,35 s après le début du
   fondu, quand le titre de la vidéo est complet (plus de double titre pâli).
2. **Un seul fondu** (1,6 s) : la nuit de la vidéo devient le ciel du globe, **même couleur**. Nom, « Jouer », Scores /
   À propos montent ensemble depuis le bas avec le globe (un seul sens, 0,08 s d'écart) ; FR/EN apparaît sur place ; les
   repères apparaissent en fondu avec le globe ; « Jouer » est actif dès le fondu (le globe est prêt, c'est la condition
   du fondu), sans changement de teinte sec.
3. **« Jouer »** : sur place, en 0,3 s, le bloc nom / « Jouer » / Scores laisse sa place aux trois modes (Drapeau, Pays,
   Capitale, en pâte comme « Jouer », étoiles et records) et à « ‹ Retour ». Titre, globe, avion, repères restent.
4. **Choix du mode** : l'accueil sort (0,3 s : commandes vers le bas, titre et repères en fondu), le HUD descend, le vol
   part. **Plus de 3-2-1.**
5. **Arrivée** : la grille et la question montent (0,3 s) avec le contour du pays ; le chrono démarre ; vibration « go ».
6. **Entre deux questions** : la grille reste en place, estompée, libellés cachés, pendant le vol ; l'étiquette « Pays ·
   capitale » reste posée sur son pays et part avec lui (cachée derrière l'horizon) ; à l'arrivée, les nouveaux libellés
   s'allument.
7. **Fin → scores → « Retour »** : retour à l'accueil, sans rien rejouer. Tout retour à l'accueil (scores, À propos,
   Quitter, « Changer de mode ») montre l'accueil déjà en place, sans entrée.

## 2. Détails

- **Titre fixe** : sur un téléphone, l'écart entre le titre de la vidéo et celui de l'accueil est petit (Pixel 9 : × 1,08,
  12 px) ; le titre garde ce recalage. Au-delà de ± 15 % d'échelle ou de 24 px (tablette, bureau : la vidéo y est bien plus
  agrandie), il glisse à sa place en 0,8 s après le fondu (comportement de la 1.20).
- **Ciel** : le fond de la scène vaut la couleur qui, après la chaîne de l'image (balance des blancs de l'atmosphère
  physique, tone mapping Neutral, sRGB), donne `#16173a` à l'écran ; calculée par l'inverse de la chaîne (fonction pure,
  testée), pas réglée à l'œil. WebGPU et WebGL.
- **Choix du mode dans l'accueil** : l'état `mode` de la machine reste ; l'écran `ModeScreen` disparaît, l'accueil porte
  les deux panneaux (l'inactif `inert`). Classe `.mode-bouton` gardée.
- **Sans 3-2-1** : `CHOOSE_MODE` et `REPLAY` mènent à `flight` ; `ARRIVED` démarre le chrono s'il ne l'est pas ; l'état
  `countdown`, `COUNTDOWN_TICK`, `Countdown`, ses styles et le message `countdown.go` sont retirés ; la vibration « go »
  part à la première question.
- **Sortie de l'accueil** : gardé monté 0,3 s après le choix du mode (classe de sortie), repères compris ; l'avion part
  à la fin de la sortie.
- **Grille** : trois états — cachée (premier vol), en vol (estompée à 0,35, libellés et drapeaux cachés, inerte),
  active ; le passage en vol → active est une transition d'opacité de 0,25 s ; caché → active monte de 24 px en 0,3 s.
- **Retour des scores** : `BACK` depuis les scores mène toujours à l'accueil.
- **Entrées une seule fois** : la première apparition de l'accueil seule est animée (fondu depuis la vidéo, ou lettres
  qui surgissent à l'accueil direct) ; ensuite `deja`.
- **Mouvement réduit** : aucune translation ; fondus seuls.

## 3. Tests

- Unitaires : machine (plus de 3-2-1, `ARRIVED` démarre le chrono, scores → accueil), commandes du globe (vol à l'entrée
  en `flight`), couleur du ciel (inverse de la chaîne : la chaîne appliquée redonne `#16173a` à 1/255 près), états de la
  grille, recalage gardé ou relâché selon l'écart.
- e2e : ciel = `#16173a` au-dessus du globe (WebGPU et WebGL) ; titre posé sur celui de la vidéo et immobile après le
  fondu (Pixel 9) ; « Jouer » montre les modes sans quitter l'accueil (repères et avion toujours là) ; plus de 3-2-1 (la
  première question suit l'arrivée du vol) ; grille estompée en vol ; scores → « Retour » → accueil.
- Film `mise-en-scene` refait au format Pixel 9 et revu image par image avant toute mise en ligne.

## 4. Tâches

1. Machine sans 3-2-1, scores → accueil ; commandes du globe ; `useGame` (vibration « go ») ; `GameScreen` sans `Countdown`.
2. Grille à trois états ; étiquette qui part avec son pays.
3. Ciel bleu nuit (fond calculé, WebGPU et WebGL).
4. Accueil : panneaux accueil / modes, sortie animée, entrées une seule fois, commandes qui montent pendant le fondu,
   repères en fondu, titre posé d'un coup et gardé ; `ModeScreen` retiré.
5. e2e mis à jour et ajoutés ; `check` et `e2e:local` complets ; film revu ; HANDOFF ; commit ; GO pour la 1.21.
