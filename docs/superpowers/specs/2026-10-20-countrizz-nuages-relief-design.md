# Countrizz — nuages en relief (sous-projet 2b)

Date : 20/10/2026. Suite de `2026-10-20-countrizz-ocean-relief-design.md` (2a, en ligne en 1.12).

## Décisions

- Consignes de l'utilisateur : images toutes faites plutôt que calculs maison ; aucune micro-validation ; une image libre
  plus récente remplace l'ancienne ; relief exagéré × 10.
- Approche légère, tenable sur téléphone : nuages « 2,5 D » — une carte de couverture et une carte de **hauteur du
  sommet**, rendues dans le matériau de la Terre (pas de coque : elle éteignait le bloom des villes, constaté le 03/10).
  Le rendu volumique par marche du rayon (thèse Muth, TU Wien, 23/03/2026 : 2,25 ms sur RTX 5070 Ti en 1280 × 720,
  rien sur téléphone) reste hors champ.

## 1. Source : la météo réelle du 19/10/2026

- **GMGSI** (Global Mosaic of Geostationary Satellite Imagery, NOAA/NESDIS/OSPO), canal infrarouge long (≈ 11 µm),
  version v3r0 : mosaïque horaire de GOES-18, GOES-19, Himawari-9 et Meteosat, 4999 × 3000, 0,072°, latitudes
  Mercator entre −72,74° et +72,72°. Données publiques du programme NOAA Open Data (seau `noaa-gmgsi-pds`).
- Image retenue : **19/10/2026, 12 h UTC** (Europe et Afrique de jour, typhon dans le Pacifique ouest).
- Valeurs : comptes « mode A » sur 8 bits, convertis en kelvins (NOAA OSPO, *Conversion of GVAR Infrared Data*) :
  `T = 330 − X/2` pour X ≤ 176, `T = 418 − X` au-delà.
- **Sol sans nuages** : pour chaque pixel, la plus chaude des 14 images de 12 h UTC du 06 au 19/10/2026 (même heure :
  le cycle du jour sur les terres ne se lit pas comme un nuage).
- **Couverture** : écart `ΔT = T_sol − T` lissé (puissance 0,8) de 2 à 15 K en mer, de 4 à 40 K sur terre (la mer change
  peu de température : stratocumulus du Pérou, écart médian 7,5 K ; cirrus du Sahara, 16 K, gardés translucides) ; plus, hors glaces (T_sol > 255 K), un sommet
  froid (265 → 225 K) compte comme nuage à 90 % (nuages bas persistants mal vus par le sol de référence).
- **Hauteur du sommet** : `ΔT / 6,5 K·km⁻¹` (gradient de l'atmosphère standard), bornée à 16 km, codée 0 → 16 km.
- **Pôles** (au-delà de ±72,7°) : nuages de Blue Marble (l'ancienne texture), fondus de 66° à 72° ; hauteur 4 km.

## 2. Texture

- `clouds-4k.ktx2` : 4096 × 2048, ETC1S linéaire avec mipmaps ; RVB = couverture, alpha = hauteur du sommet
  (deux tranches ETC1S indépendantes). Raccord à l'antiméridien comme avant (`seamless`).

## 3. Rendu (`clouds.ts`, `earth.ts`)

Hauteur rendue = sommet × 10 (comme le relief), en rayons terrestres, multipliée par la part du soulèvement
(`liftFactor` : rien au cadrage serré).

1. **Parallaxe** : le nuage vu devant le sol P est lu là où la ligne de visée passe à son altitude :
   décalage `z · tan θ` dans la direction de la caméra (θ angle de visée, `cos θ ≥ 0,3`), deux itérations.
2. **Modelé** : normale du sommet tirée de la pente de `hauteur × couverture` (deux lectures au niveau de mipmap 2,
   gain 0,35 : lu à 4K, le grain froissait les nuages comme du papier) ; la lumière du soleil du matériau fait le reste.
3. **Ombre portée sur les nuages** : trois pas vers le soleil ; un sommet plus haut que le rayon assombrit.
4. **Ombre au sol** : même calcul que la parallaxe vers le soleil, avec la hauteur lue (au lieu de 22 km fixes).
5. Inchangé : dérive vers l'est, effacement à l'arrivée et au grossissement, voile des lumières de nuit.

## 4. Tests

- Unitaires (pipeline) : conversion des comptes, couverture et hauteur, ré-échantillonnage Mercator → équirectangulaire,
  fondu polaire.
- Unitaires (rendu) : décalage de parallaxe (nul à la verticale, borné en rasant), miroir CPU.
- E2E : références visuelles refaites ; suite complète ; budget.

## 5. Limites constatées

- L'infrarouge seul rend les cirrus plus opaques qu'au visible ; le canal visible de GMGSI n'aide pas : il manque le
  secteur Meteosat 0° (Europe, Afrique de l'Ouest) le 19/10 à 12 h UTC.
- Pixels de 8 km : les champs de stratocumulus se voient en petits blocs de près.

## 6. Hors champ

Liseré argenté et diffusion avant (sous-projet 3, lumière) ; nuages mis à jour chaque jour ; marche du rayon volumique.

## Sources

- NOAA OSPO, GMGSI : https://www.ospo.noaa.gov/Products/imagery/gmgsi/ ; seau https://noaa-gmgsi-pds.s3.amazonaws.com
- NOAA OSPO, *Conversion of GVAR Infrared Data to Scene Radiance or Temperature* (comptes mode A).
- W. Muth, *Real-Time Volumetric Rendering of Meteorological Cloud Data*, TU Wien, 23/03/2026.
- Lecteur HDF5 : h5wasm 0.10.3 (NIST), dépendance de construction seulement.
