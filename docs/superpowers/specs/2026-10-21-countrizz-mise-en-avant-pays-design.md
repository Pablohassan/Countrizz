# Countrizz — mise en avant du pays et éclairage par plan

Date : 21/10/2026. Choix de l'utilisateur (21/10) : « pièce en pâte » avec l'éclairage du « projecteur », estompage
cartographique, mise en scène à l'arrivée ; et l'éclairage par plan (C). La netteté sur téléphone (A) est faite à part
(`b8bc933`).

## Constat (captures du 21/10, partie réelle, format téléphone, GPU du Mac)

- Le remplissage jaune recouvre la photo du pays, sa partie la plus nette.
- Plans ternes : imagerie Sentinel-2 sombre sur les forêts (luminance linéaire des terres : médiane 0,053 sur les 182
  photos qui ont des terres, Suriname 0,02, Bahamas 0,011), soleil à 55° du pays.

## 1. Le pays, pièce de pâte sous un projecteur (`countryLayer.ts`)

- **Plus de remplissage jaune** : la photo du pays reste visible, plus éclairée (exposition du §2, saturation × 1,15) et
  estompée (relief).
- **Estompage cartographique** : ombrage tiré du canal d'altitude de la surface, lumière du nord-ouest (azimut 315°,
  hauteur 45°, la convention des cartes), sur le pays seul ; effacé au fort grossissement comme le relief.
- **Les voisins s'assombrissent** (× 0,55) et se désaturent de moitié : le projecteur.
- **Pièce soulevée** : biseau clair sur les bords tournés vers le nord-ouest, sombre à l'opposé (pente de la distance
  signée du patch), ombre portée vers le sud-est sur les voisins.
- **Liseré** de la couleur de la marque (#f7dc6f) avec une lueur ; vert ou rouge à la réponse.

## 2. Éclairage par plan

- **Soleil plus haut au cadrage d'un pays** : 35° du point visé (55° avant), toujours du haut à gauche de l'image ; 55° en
  vue d'ensemble (terminateur au limbe), avec un passage progressif selon l'altitude, de 0,6 à 1,4 rayon (1,4 : vue
  d'ensemble en paysage). Vues d'ensemble (1,4 et 2,2) et accueil (1,6) inchangés. Altitudes d'arrivée des 197 pays : au
  bureau (1440 × 900) 159 à 35°, 27 entre 35 et 45°, 11 entre 45 et 55° ; sur téléphone (390 × 844) 117, 25, 25, et 30 à
  55° (grands pays vus presque en entier, jusqu'à 3,18 rayons pour la Russie : l'exposition par pays compense). Un premier
  réglage de 1,2 à 3 laissait la vue d'ensemble en paysage à 35,7° (constaté sur la référence visuelle « accueil »).
- **Exposition par pays** tirée de sa photo : couleur moyenne locale (niveau 5 de mipmap, 64 texels de la photo de 2048
  autour du point) et part de mer (alpha) ; luminance des terres ramenée vers 0,06, gain de 1 à 2. La moyenne de toute la
  photo (dernier niveau, essayée d'abord) mêlait le pays à ses voisins : le Bhoutan restait noir sous le plateau tibétain
  clair.
- Le voile de l'atmosphère ne touche pas l'intérieur du pays (canal « pays », déjà en place).

## 3. Mise en scène (temps depuis la question)

- 0 → 0,4 s : les voisins s'assombrissent ;
- 0,15 → 0,75 s : le liseré se dessine autour du pays (balayage angulaire depuis le nord) ;
- 0,35 → 0,8 s : la pièce se soulève avec un rebond (≈ 1,12 puis 1), comme les boutons de l'interface ;
- 0,55 → 1,05 s : un reflet traverse le pays en diagonale ;
- ensuite : le liseré respire (période 2,4 s).
- À la réponse : liseré vert (éclair) ou rouge (pulsation), teinte légère de la même couleur sur le pays.

## 4. Tests

- Unitaires : courbes de la mise en scène (bornes, rebond, monotonie), angle du soleil selon l'altitude, gain
  d'exposition.
- E2E : la couleur mesurée du pays n'est plus le jaune ; le liseré est tracé ; références visuelles refaites ; suite
  complète ; masque des contrôles (`mode=mask`) inchangé.
