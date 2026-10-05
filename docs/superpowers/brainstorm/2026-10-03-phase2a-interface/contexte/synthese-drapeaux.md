# Synthèse de conception : quatre drapeaux sans tuile dans la grille 2×2 du mode Drapeau

**Légende des sources**
- **[V]** : je l'ai rouvert moi-même dans ce tour (WebFetch, navigateur sans interface à 390 px, ou lecture des fichiers).
- **[R1] à [R4]** : lu à la source par le rapport 1 (jeux), 2 (bibliothèques), 3 (taille perçue) ou 4 (interaction), mais pas revérifié par moi.
- **[D]** : déduction ou calcul de ma part.

**Ce que je recommande** : aucune tuile. Chaque case de la grille est un bouton invisible et le drapeau seul se voit. Il garde ses vraies proportions et prend une **aire égale, plafonnée** par la case. On l'habille comme un **autocollant** : liseré crème, trait noir, ombre noire nette, c'est-à-dire le langage des boutons Countrizz, sans le skew.

---

## 1. Comment font les autres

1. **Seterra (GeoGuessr) : le drapeau est le bouton, à hauteur commune.** [V] https://www.geoguessr.com/fl/2026 et /fr/fl/2026
   - La règle CSS lue dans la page est `.flag-question_flag__kJvjL { height: 4rem; width: auto; … }`.
   - Tailles mesurées : Inde 96×64, Népal 52×64, Sri Lanka 128×64, Bangladesh 107×64. Pas de bordure (`0px`), pas d'arrondi (`0px`), pas d'ombre (`none`), `alt=""`.
   - La capture montre deux colonnes de drapeaux nus sur un fond gris. On y voit aussi le défaut de la hauteur commune : le Sri Lanka écrase le Népal.
   - Retour de réponse, CSS lu : `.greyedOut img { opacity: 0.2; filter: grayscale(0.6) }`, une étiquette en `top: calc(100% + 0.5rem)` sous le drapeau, et un indice qui clignote avec `outline: 1rem solid var(--seterra-color-red)` toutes les 1,5 s.
   - J'ai testé un mauvais clic : sur « Bhoutan » alors que la question était « Pakistan », l'étiquette « Bhoutan » apparaît sous le drapeau (opacité 1 à 250 ms, 0 à 1 750 ms). Le drapeau lui-même ne change pas (opacité 1, filtre `none`) et la question reste « Pakistan ».

2. **JetPunk : même principe, la tuile existe mais on ne la voit pas.** [V] https://www.jetpunk.com/user-quizzes/331916/click-the-asian-flags
   - Les drapeaux font 54 px de haut et gardent leur largeur naturelle : 108×54, Népal 44×54, 138×54 pour le drapeau de ratio 2,55. Coins de 4 px, pas d'ombre.
   - Chaque drapeau est dans une bulle, mais la bulle a le fond et la bordure de 2 px `rgb(201, 212, 215)`, la même couleur que son conteneur `.answer-bubbles.mt-2`. La tuile est donc invisible.
   - Bonne réponse : `.answer-bubble.green .ac { transform: scale(0.8); filter: opacity(0%) blur(2px); transition … 1.5s }`. Pression : `scale(0.95)`.

3. **Les applications mobiles en 2×2 imposent une forme commune.** Pages lues [V] : https://apps.apple.com/us/app/flags-2-map-geography-quiz/id1494561154 (gedev) et https://apps.apple.com/us/app/game-of-flags-quiz/id6445855248 (QURAI, « four multiple-choice options »).
   - Sur les captures, téléchargées par R1 et regardées par moi, il n'y a pas de tuile.
   - Flags 2 : les quatre drapeaux ont la même boîte d'environ 4:3, des coins arrondis et une ombre douce. Le mauvais choix est délavé, avec une étiquette sombre « Colombia ».
   - Game of Flags : Brésil, Sri Lanka, Australie et Danemark sont dans des boîtes identiques, sans arrondi, sur fond beige. Le Sri Lanka, qui est en 2:1, est visiblement tassé.
   - Les tailles exactes (206×155 et 194×131) viennent de R1.

4. **Worldle : le contre-modèle, c'est-à-dire la tuile.** Capture de R1 regardée par moi ; je n'ai pas rejoué la manche (https://worldle.teuteuf.fr/).
   - Cases carrées blanches avec bordure, drapeau en `contain`, donc de grandes bandes vides (Bulgarie). Un mauvais choix donne un fond rose et une bordure rouge.
   - Flags of All World Countries fait la même chose avec des cases grises [R1, R4].

5. **Wikipédia : une boîte maximale et des exceptions réglées à la main.** [V]
   - Le modèle dit « currently 23×15 pixels maximally …, plus a one-pixel border » (Template:Flag_icon/doc, action=raw).
   - Country data Nepal : `| size flag alias = 24x20px` et `| border =` laissé vide. Country data Switzerland : `| size flag alias = 23x16px`.

6. **Les emoji : une seule forme pour les rectangles, une silhouette propre pour les cas à part.** [V]
   - Twemoji, SVG bruts : la Suisse occupe x 5→31 et y 5→31 (26×26). Le Qatar occupe 36×26 : il est redessiné à cette forme, avec ses 9 pointes recalculées. Le Népal occupe x 8→27,8 sur 26 de haut, sans coins arrondis.
   - Les emoji Apple suivent la même logique d'après le rendu local fait par [R2].

7. **Noto Color Emoji : la seule règle explicite trouvée.** [V] https://raw.githubusercontent.com/googlefonts/noto-emoji/main/waveflag.c
   - Code lu : `#define std_aspect (5./3.)`, puis `aspect = sqrt (aspect); // Discount the effect`, puis `if (.9 <= aspect && aspect <= 1.1) … aspect = 1.`.
   - Le contenu est redimensionné par `cairo_scale (cr, 256./w, 256./h)`, donc étiré pour remplir la forme.
   - Un liseré gris (`border_alpha = .2`, `0x42/255`, `CAIRO_OPERATOR_MULTIPLY`) n'est ajouté que si `!border_transparent`.
   - [D] Tout drapeau de proportion comprise entre 1,35 et 2,02 prend la forme standard. Le Népal et la Suisse sont élargis, donc déformés.

8. **Bibliothèques à forme commune.** [V]
   - Shopify : « All country's flags are SVGs, normalized to an aspect ratio of 4:3. »
   - Flagpack (Flag.scss) : taille L de 32×24 avec un rayon de 2px. Bordure par pseudo-élément, `1px solid rgba(0,0,0,.5)` en `mix-blend-mode: overlay`. Dégradés en overlay qui imitent l'ondulation. Image en `object-fit: cover`.
   - [R2] Le Népal y est posé sur un rectangle blanc (chez country-flag-icons, Flagpack et Shopify), ce qui revient à une tuile.

9. **La taille perçue se règle par l'aire, pas par la boîte.** [V]
   - Nick Sherman (https://nicksherman.com/size-by-area/) : la boîte max-width/max-height « makes wide or tall images appear small compared to more squarish images, since their surface areas are so different ». La taille à aire égale fait que les images « all occupy similar amounts of surface area in px² ». Réserve de l'auteur : le vide à l'intérieur du dessin n'est pas compté.
   - Dan Paquette : `(imageWidth / imageHeight) ** scaleFactor * widthBase`. 0 donne la même largeur, 1 la même hauteur, et l'auteur juge « 0.525 » le meilleur équilibre.
   - Material v1 (https://m1.material.io/style/icons.html) : carré de 152, cercle de Ø176, rectangles de 176×128, « consistent visual proportion ». [D] Ces trois formes ont presque la même aire.

10. **Un autre quiz de drapeaux pose le même cahier des charges.** [V] https://github.com/BenWassa/flag/issues/207
    - « preserve each flag's true aspect ratio and full artwork — no stretching, cropping or ratio normalisation ».
    - Changer de proportion ne doit pas déplacer le groupe de réponses.

**Rapportés mais pas revérifiés par moi** :
- L'effet d'élongation de Krider et al. (2001) : à aire égale, une forme allongée paraît plus grande [R3].
- L'ONU et les JO ramènent tous les drapeaux à 2:3, sauf la Suisse et le Népal [R3].
- Kahoot double chaque couleur d'une forme [R1, R4].

---

## 2. Familles de solutions sans tuile

Tailles calculées en Python [V] dans une case de **165×100**. Le chiffre entre parenthèses est l'aire rapportée à celle de la France.

| Famille | Règle | Népal 0,82 | Suisse 1 | France 1,5 | Qatar 2,55 |
|---|---|---|---|---|---|
| A. Boîte max « contain » (Wikipédia, flagcdn original) | `w=min(165,100r); h=w/r` | 82×100 (0,55) | 100×100 (0,67) | 150×100 | 165×65 (0,71) |
| B. Hauteur commune plafonnée (Seterra, JetPunk) | `h=min(72,165/r); w=h·r` | 59×72 (0,55) | 72×72 (0,67) | 108×72 | 165×65 (1,38) |
| B'. Hauteur commune stricte | `h=165/2,5455=64,8` | 53×65 (0,55) | 65×65 (0,67) | 97×65 | 165×65 (1,70) |
| C. Largeur commune (Lizardpoint [R1], démo MUI [R2]) | `w=min(120,100r)` | 82×100, borné (0,85) | 100×100 (1,04) | 120×80 | 120×47 (0,59) |
| **D. Aire égale bornée** | `w=min(165,100r,√(A·r)); h=w/r`, A=9600 | 82×100, borné (0,85) | 98×98 (1,00) | 120×80 | 156×61 (1,00) |
| D'. Exposant k=0,45 (Paquette, [R3]) | `w=min(165,100r,B·r^k)`, 3:2=120×80 | 82×100 (0,85) | 100×100 (1,04) | 120×80 | 152×60 (0,95) |
| E. Forme commune 3:2, recadrée ou redessinée (apps mobiles, Shopify et Flagpack en 4:3) | même boîte pour tous | sur rectangle blanc (= tuile) ou flottant | étirée ×1,5 ou redessinée | 150×100 | recadré : garde 59 % de sa largeur |
| F. Hybride Noto, à plat | forme standard 5:3 160×96 si √(r/1,667)∈[0,9 ; 1,1] | 112×96 (étiré ×1,43) | 124×96 (×1,29) | 160×96 (×1,11) | 160×78 (×0,81) |

**A. Boîte max.**
- Pour : rien à calculer.
- Contre : seule la forme de la case la remplit. La Suisse et le Népal paraissent 33 à 45 % plus petits, et Sherman dit explicitement que cette méthode fait paraître petits les formats larges ou hauts. Sans tuile, c'est l'état actuel moins le fond, et les différences de taille sautent aux yeux.

**B. Hauteur commune.**
- Pour : c'est ce que font les deux références web lues ; une ligne de base nette.
- Contre : du simple au triple en aire (Népal 0,55, Qatar 1,38 à 1,70). Dans une grille 2×2 où chaque drapeau est centré, la ligne de base n'apporte rien.

**C. Largeur commune.**
- Contre : c'est le défaut inverse ; le Qatar devient minuscule (0,59).

**D. Aire égale bornée (recommandée).**
- Pour : vraies proportions, aucune déformation, poids égal entre les quatre choix. C'est la règle d'aire égale de Sherman et Haywood, et l'exposant 0,5 de la formule de Paquette (k = 0,5 donne exactement l'aire égale) [D].
  - Avec A = 9600, seul le Népal touche une borne, ici la hauteur. Avec A = 10000, la Suisse arrive pile à 100×100, le Népal tombe à 0,82 et le Qatar fait 159,5×62,7.
  - Sur les 197 SVG, R3 compte deux drapeaux bornés (Népal et Qatar) dans 150×100.
- Contre : les bords ne s'alignent pas d'une case à l'autre, donc il faut centrer strictement. Le Népal reste le plus léger : 42 % de sa boîte est transparente, ce que je confirme en relançant `bords.py`.
- Réglage de A : A = 1,5 × h₃₂², où h₃₂ est la hauteur voulue pour un 3:2, environ 0,8 × la hauteur de la zone. Tant que A ≤ hauteur², la Suisse n'est pas bornée.
- Avec le décor « autocollant » (≈5,5 px de bord et 6 px d'ombre), la zone utile tombe à environ **150×88**, d'où A = 7776 : Népal 72×88, Suisse 88×88, France 108×72, 2:1 125×62, Qatar 141×55.
- **Piège d'implémentation [V]** : la proportion doit se lire dans les attributs `width`/`height` de la balise `<svg>`, pas dans le viewBox.
  - `qat.svg` déclare `width="1400" height="550" viewBox="0 0 75 18" preserveAspectRatio="none"`, soit 2,545 par les attributs mais 4,17 par le viewBox.
  - `fra.svg` n'a pas d'attributs `width`/`height` : on se rabat sur le viewBox (3:2).
  - `afg.svg` n'a pas de viewBox.
  - Le mieux est de précalculer w et h au build pour les 197 drapeaux.

**E. Forme commune.**
- Pour : grille parfaitement régulière ; c'est la norme des applications mobiles.
- Contre : elle fausse l'objet même du quiz. Un 2:1 recadré en 3:2 perd 25 % de sa largeur et le Qatar 41 % ; le Népal finit sur une tuile. Un cercle (circle-flags, FlagKit) fait pire.

**F. Hybride emoji.**
- Pour : rendu familier.
- Contre : Twemoji et Apple redessinent chaque drapeau. Pour obtenir la même chose à partir des SVG mledoze, il faudrait étirer (+43 % pour le Népal, +29 % pour la Suisse).

**G. Ondulation**, en couche sur D.
- Variante légère : un pseudo-élément avec un dégradé en `mix-blend-mode: overlay`, inspiré de Flagpack (valeurs à régler).
- Variante lourde : une vraie ondulation (maillage façon Noto, ou `feDisplacementMap`).
- Contre : l'ombrage modifie les couleurs perçues, ce qui est délicat pour des paires proches comme Tchad et Roumanie ; l'ondulation déforme les bords. À tester seulement en douceur, et éventuellement seulement à l'état « bonne réponse ».

**H. Le bord, une question indépendante de la taille.** J'ai relancé `bords.py` [V] :
- 60 drapeaux ont au moins 10 % de leur pourtour sous 1,5:1 contre le fond #16173a.
- 35 se confondent avec un trait **noir** seul (aus 88 %, deu 44 %, fra 40 %…).
- 45 se confondent avec du **blanc** (jpn, cyp, kor, vat à 100 %).
- Le noir ne contraste qu'à 1,22:1 avec #16173a.

Il faut donc un liseré clair **et** un trait noir, comme sur un autocollant. Sur les drapeaux à bord blanc, le liseré crème se fond dans le blanc et les agrandit de 3 px, ce qui reste acceptable pour un autocollant.

---

## 3. L'interaction sans tuile

**Structure et cible**
- La case entière est un `<button>` transparent d'environ 165×100. C'est elle qui reçoit le toucher ; le drapeau n'est que le dessin à l'intérieur.
- Sources [V] :
  - Material : « touch targets should be at least 48 x 48 px … a button may appear to be 48 x 36 px, but the padding … comprises the full 48 x 48 px touch target ».
  - WCAG 2.5.8 : au moins 24×24 px CSS, la cible étant la « Region of the display that will accept a pointer action ».
  - Apple : 44×44 pt par défaut, et « For elements without a bezel, about 24 points of padding works well around the element's visible edges ».

```css
.choix{display:grid;place-items:center;min-height:100px;padding:6px 12px 12px 6px;
  background:none;border:0;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
```

`-webkit-tap-highlight-color: transparent` évite qu'une surbrillance ne redessine la tuile au toucher [R4].

**Repos : l'autocollant, sans skew**
- Le skew transformerait le disque du Japon en ellipse [R4]. Une rotation de ±1,5° est possible, à juger sur maquette.

```css
.drapeau{width:var(--w);height:var(--h);border-radius:4px;
  box-shadow:0 0 0 3px #fff8e7, 0 0 0 5.5px #000, 6px 6px 0 5.5px #000;
  transition:transform .08s ease-out, box-shadow .08s ease-out}
```

- Pour le Népal, `box-shadow` dessinerait un rectangle. `drop-shadow()` suit l'alpha mais n'accepte ni `inset` ni `spread` [V, MDN]. Deux options : empiler des `drop-shadow` décalés (crème, puis noir, puis l'ombre 6px 6px), ou, mieux pour les performances, intégrer le trait dans un SVG dérivé au build.

**Pression : l'autocollant s'enfonce**, comme les boutons de Duolingo [R4] et cohérent avec l'ombre décalée des boutons Countrizz.

```css
.choix:active .drapeau{transform:translate(4px,4px);
  box-shadow:0 0 0 3px #fff8e7,0 0 0 5.5px #000,2px 2px 0 5.5px #000}
```

Ajouter une classe `.is-pressed` posée sur pointerdown par précaution ; je n'ai pas vérifié le comportement de `:active` au toucher sur iOS. Pas de vibration : Safari iOS ne la gère pas [R4].

**Bonne réponse : forme + texte, la couleur seulement en plus**
- Apple [V] : « Offer visual indicators, like distinct shapes or icons, in addition to color ».
- Un anneau vert s'insère entre le liseré et le trait : `0 0 0 3px #fff8e7, 0 0 0 7px #2fbf4a, 0 0 0 9.5px #000, 6px 6px 0 9.5px #000`. Le vert contraste à 7,12:1 avec le fond [V, calcul].
- Une pastille ✓ de 26 px, portée par un `span` (un `<img>` ne peut pas avoir de `::after`).
- Le nom du pays sous le drapeau (modèle Seterra).
- Les autres drapeaux s'estompent. Seterra utilise `opacity .2; grayscale(.6)`, mais sur un fond clair ; je propose environ 0,35 sur #16173a [D].

**Mauvaise réponse**
- Pastille ✗ rouge (#e8413a, 4,31:1 avec le fond [V]).
- Secousse d'environ 320 ms, supprimée sous `prefers-reduced-motion: reduce` [R4].
- Le nom du drapeau touché s'affiche, comme l'étiquette observée chez Seterra.
- Le bon drapeau reçoit l'état « bonne réponse ».
- Ne jamais teinter le drapeau lui-même en rouge ou en vert : cela fausse ses couleurs.

**Focus clavier**
- `.choix:focus-visible .drapeau{outline:3px solid #f7dc6f;outline-offset:8px}`.
- Le jaune contraste à 12,66:1 avec le fond et à 15,42:1 avec le noir, mais seulement à 1,36:1 avec le blanc [V]. Il faut donc garder le décalage et le trait noir entre le jaune et le drapeau.
- Pas de violet #6225e6 comme indicateur d'état : 2,40:1 avec le fond [V], sous les 3:1 demandés par WCAG 1.4.11 [R4].

**Accessibilité**
- Avant la réponse : `alt=""` (Seterra le fait, [V]) et `aria-label="Choix A"`, pour ne pas donner la réponse.
- Le résultat s'annonce par `role="status"` [R4].

---

## 4. Trois pistes à maquetter, classées

1. **Recommandée : autocollants à aire égale.**
   - Taille D (A = 7776 dans la zone 150×88, à régler à l'œil entre k = 0,45 et 0,5), précalculée au build à partir de `width`/`height` du SVG.
   - Décor H : liseré crème, trait noir, ombre 6 px. La case est le bouton.
   - Pourquoi :
     - C'est la seule famille qui garde à la fois la forme exacte (indice du quiz, exigence de BenWassa #207) et un poids égal entre les quatre choix (Sherman, Paquette, Material).
     - Le décor parle déjà la langue du jeu.
     - Les mesures de contour montrent qu'un trait noir seul ne suffit pas.
     - La grille ne bouge pas d'une question à l'autre.

2. **Témoin : la rangée Seterra.** Hauteur commune plafonnée (B, h = min(72, 165/r)) avec le même décor.
   - À maquetter à côté de la piste 1, avec la même question (par exemple Népal, Suisse, France, Qatar), pour juger à l'œil l'écart d'aire de 0,55 à 1,38.
   - C'est la solution des références web, et la plus simple à coder.

3. **Témoin à écarter : la carte uniforme 3:2.** Forme commune E, coins arrondis, ombre (Flags 2, Game of Flags).
   - À montrer seulement pour décider en connaissance de cause : c'est la norme des apps mobiles, mais elle recadre le Qatar de 41 % ou l'étire, et remet le Népal sur une tuile.
   - L'ondulation G se teste plutôt comme une couche optionnelle sur la piste 1.

**Désaccords entre les rapports**
- **Règle de taille.** R1, R2 et R3 recommandent l'aire égale ; R4 recommande la hauteur constante `h=min(72,148/r)`. Les chiffres du tableau donnent raison aux trois premiers sur le poids visuel. R4 apporte surtout le traitement de l'interaction, que je reprends.
- **Mauvais clic chez Seterra.** R1 dit n'avoir vu aucun changement ; R4 dit que le nom apparaît puis s'efface. Mon test confirme R4 : l'étiquette « Bhoutan » est à l'opacité 1 à 250 ms, puis 0 à 1 750 ms.
- **Couleur de l'étiquette Seterra.** R1 la dit jaune après une erreur ; R4 la dit blanche au premier essai et rouge après l'indice. Dans mon test, l'étiquette affichée après un mauvais clic avait la classe `label-flash_colorGreen`. Ce point n'est pas tranché, et il est secondaire.
- **Source de la proportion.** R2 propose de lire r dans le viewBox. C'est faux pour `qat.svg` (4,17 au lieu de 2,545) : il faut utiliser `width`/`height`.
- **Le bord.** R2 propose un liseré intérieur discret. R4 propose un autocollant (crème 3 px, noir 2,5 px, ombre 6 px), avec une variante sobre. R1 propose une pile de `drop-shadow` blancs. Les mesures que j'ai relancées (35 drapeaux invisibles contre du noir, 60 contre le fond) soutiennent l'autocollant de R4.
- **Valeur de k.** R3 propose environ 0,45, à cause de l'effet d'élongation ; Paquette prend 0,525 ; les autres rapports prennent 0,5. L'écart est de 2 à 3 px sur un 2:1 : à trancher à l'œil.
- **flag-icons.** R3 dit que le traitement de chaque drapeau n'est pas précisé ; R2 a lu les SVG et constate qu'ils sont redessinés (Qatar recalculé, Népal calé à gauche sur fond transparent). Je retiens R2.
- **Tailles de case différentes** selon les rapports (165×120, 150×105, 150×100). J'ai tout recalculé pour 165×100.
- **Deux applications portent le nom « Flags quiz – Guess the flag ».** Celle de l'App Store (id1447818338) a une grille 2×2 en 3:2 ; celle de Google Play (PrizePool) n'a pas de grille de drapeaux sur ses captures. Ce n'est pas un désaccord, juste deux applications différentes.

**Fichiers**
- `/private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad/synthese/verif.cjs` (mesures Seterra et JetPunk)
- `/private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad/synthese/seterra_click.cjs` (test du mauvais clic)
- `/private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad/synthese/seterra_wrong_250ms.png` (capture après le mauvais clic)