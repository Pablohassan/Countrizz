# Countrizz — pilote des monuments (08/11/2026)

## Demande et décisions de l'utilisateur

- « Pour chaque pays, un élément symbolique, modélisé, pour le côté ludique » (08/11).
- Liste des 197 validée le 08/11 : « prends les variantes libres, puis lance le pilote ». L'élément retenu est la variante
  quand le principal est protégé et qu'elle est libre ou naturelle (`retenir`, `scripts/monuments/lib/statut.ts`).
  Quatre éléments retenus restent protégés, faute de variante libre : Côte d'Ivoire, Koweït, Lettonie, Qatar.
- Le monument apparaît **à la révélation**, en récompense. L'élément de contexte propre à chaque mode viendra après.
- Pilote sur une dizaine de pays, pour juger le style au format téléphone avant de faire le reste.

## Pays du pilote

France (tour Eiffel), États-Unis (statue de la Liberté), Chine (Grande Muraille), Égypte (pyramides de Gizeh), Inde (Taj
Mahal), Brésil (Pain de Sucre, variante libre du Christ Rédempteur), Japon (mont Fuji), Italie (Colisée), Royaume-Uni (Big
Ben), Russie (Saint-Basile). Les quatre derniers ajoutent des formes différentes : montagne, arène, tour d'horloge, coupoles.

## Style

- **Maquettes en papier**, de la famille de l'avion de l'accueil : facettes pleines, aplats toon (les mêmes trois marches,
  `TOON` de `plane/paper.ts`), contours noirs de 1,6 px sur les plis de plus de 20°.
- Faites **en code** (`globe/monuments/catalogue.ts`) à partir de trois pièces : tour à profil (n côtés), boîte, anneau.
  C'est cohérent avec l'avion, léger (moins de 3 000 triangles par maquette) et sans modèle tiers à licencier.
- Couleurs de papier par pièce (sRGB).

## Mise en scène

- À l'arrivée, la caméra regarde le pays **à la verticale** : une maquette debout ne montrerait que son toit. Elle se
  **déplie comme un livre animé** : charnière à sa base, de couchée vers la caméra à dressée vers le haut de l'écran.
  Elle s'arrête à 70° pour garder du relief, de trois quarts (tournée de 30°).
- Elle fait **face à la caméra** même près du limbe (Moscou), pas à la verticale du lieu.
- **Taille fixe à l'écran** : son encombrement (sa plus grande dimension) vaut 16 % de la hauteur de la vue, ≈ 146 px CSS
  sur le Pixel 9.
- Déploiement : 0,6 s avec un ressort. Repli : 0,3 s au départ du vol suivant. En mouvement réduit, elle apparaît déjà
  dépliée.
- **Recadrage** : la maquette reste dans la zone libre (sous le HUD, au-dessus des réponses, à 12 px des bords) et laisse
  libre l'étiquette « Pays · capitale ». Sinon, sa base glisse à l'écran du plus petit déplacement, puis redescend sur le
  sol (`recadrage`, `solSous`). Elle peut donc s'écarter un peu de sa vraie position.
- Socle posé au-dessus du relief soulevé maximal : la caméra est à la verticale, ce décalage ne se voit pas.

## Branchement

- Derrière **`?monuments`** pendant le pilote : sans ce paramètre, le site ne change pas.
- `useMonument` (`src/app/useMonument.ts`) monte la maquette (`createMonument`, dans le code du globe) à la révélation.
- Les accessoires reçoivent la zone libre (`AccessoryFrame.safe`) et le rectangle de l'étiquette (`evite`, déclaré par
  `RevealLabel` via `GlobeHandle.eviter`).
- Positions : `src/globe/monuments/lieux.json`, écrit par `npm run monuments` (l'élément retenu de chaque pays).

## Vérification

- Unitaires : géométrie (fermeture, volume orienté, encombrement), catalogue, pose, recadrage, pixel → sol.
- Sonde : `probe.html?cca3=FRA&mode=game&img&post&safe=80,300&state=correct&t=2&monument` (format du Pixel 9 :
  `w=412&h=915`).
- Vrai jeu : `/?monuments&graine=7&revelation=8000`. `?revelation=` allonge la révélation (crochet de test : sous
  SwiftShader, une capture prend plus que les 1,5 s de la révélation).

## Hors pilote

Les 187 autres maquettes, l'élément de contexte par mode, une ombre portée, le choix pour les quatre protégés restants et le
moaï du Chili (hors du cadre d'arrivée).
