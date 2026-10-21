# Countrizz 2A-6 — avion de l'accueil et partie hors ligne : plan

> Exécution : dans la session (pas d'agents, consigne de l'utilisateur), test d'abord, sans validation intermédiaire.

**But.** Finir la 2A : l'avion A2 de l'accueil en boucle avec ses escales (spec 2A §4, décision 8 du README de
conception) et la partie complète hors ligne (spec 2A §8, §10).

**Spec.** `docs/superpowers/specs/2026-10-05-countrizz-phase2a-design.md` §3 (Accueil), §4, §5.3, §8, §10, §11.
Prototype de référence : `docs/superpowers/brainstorm/2026-10-03-phase2a-interface/ecrans/avion-cartoon-escales.js`
(WebGL, socle `avion-socle.js`, seuils `avion-cartoon.js`), maquette `accueil-avion-escales.html` (bulles).

**Hors de ce plan.** L'écran de chargement « Terre cartoon » (D15) : remplacé par l'intro
(`docs/superpowers/specs/2026-10-10-countrizz-intro-pate-accueil-design.md` §10, ligne 168).

## Décisions (portage du prototype vers le jeu)

1. **Horaire calculé à chaque image, pas une fois.** Le prototype précalcule son horaire pour une caméra fixe (la sonde
   390 × 844) ; à l'accueil du jeu, le globe tourne (1,5 °/s, `HOME_SPIN_DEG_PER_S`) et l'écran varie. La progression
   avance à chaque image avec la vitesse du prototype : lente à l'écran (`vitesse` × élan), rapide hors de l'écran
   (longueur cachée / 2,4 s), transition lissée sur ± 1,5 % du tour ; la visibilité « à l'écran » (devant la Terre, dans
   le cadre à 10 px près) est recalculée par projection (`projectOnScreen`). Mêmes vitesses que le prototype quand la
   caméra est fixe.
2. **Passages par franchissement.** Couleurs, bulles et perles se déclenchent quand la progression franchit une escale ou
   une perle (le prototype lisait des instants précalculés). Changement de couleur sur 0,5 s à partir du passage (au lieu
   de −0,1 → 0,4 s). Bulles éteintes 0,25 s après la sortie de l'écran qui suit Athènes, perles effacées comme dans le
   prototype ; tout repart au passage suivant à Rabat.
3. **Éclairage toon calculé dans le matériau.** Les lumières de la scène éclairent aussi la Terre (`earth.ts` lit
   `output`) : l'avion n'en ajoute pas. Son matériau (`MeshBasicNodeMaterial`) reproduit le calcul de `MeshToonMaterial`
   du prototype : albédo × mix(h, 1, g), h = (0,335 ; 0,262 ; 0,62), g ∈ {0 ; 0,5 ; 1} selon n·L et les seuils
   (0,22 ; 0,41), L = soleil du globe à l'image.
4. **Ombre portée par projection.** Pas de carte d'ombre (elle demanderait une lumière dans la scène, voir 3) : l'ombre
   est l'enveloppe convexe de l'avion projeté le long du soleil sur le plan tangent sous lui (aplat #120c33 à 0,45, nette
   comme le veut la décision 8), sans test de profondeur pour passer au-dessus du relief soulevé, cachée derrière la Terre.
5. **Pas de voile sur l'avion** : son canal « pays » vaut 1 (`setKeep`) ; l'avion reste en aplats nets sous l'atmosphère
   physique.
6. **Perles à 0,008 d'altitude** (0,0046 dans le prototype, sans relief soulevé) : au-dessus des Alpes × 10.
7. **Le code de l'avion arrive avec celui du globe** : `App` le charge par `import()` à l'accueil (démarrage D15 du plan de
   l'intro vidéo : la page ne charge d'emblée ni three ni le globe).
8. **Hors ligne.** L'appli installée télécharge d'avance les 197 drapeaux avec ses autres fichiers lourds (`heavyUrls`).
   Un drapeau introuvable (visiteur non installé, hors ligne, pays jamais vu) affiche le nom du pays dans son autocollant,
   jamais une case vide. Les contours SDF (51 Mo) ne sont pas téléchargés d'avance : un pays jamais vu prend la balise
   (`controller.ts`, `patchFailed`, spec §10).

## Fichiers

| Fichier | Rôle |
|---|---|
| `web/src/globe/plane/route.ts` (+ test) | trajet fermé (Catmull-Rom sphérique), altitude, repère de vol, roulis |
| `web/src/globe/plane/schedule.ts` (+ test) | progression image par image, élan, passages, couleurs, bulles, perles, état figé |
| `web/src/globe/plane/paper.ts` (+ test) | géométrie du papier (A2 + bande), toon, ombre projetée (enveloppe) |
| `web/src/globe/plane/plane.ts` | accessoire three (avion, contours, perles, ombre), `createHomePlane` |
| `web/src/globe/accessories.ts` | `AccessoryFrame.viewport` (taille de la vue) |
| `web/src/ui/PlaneBubbles.tsx`, `home.css` | bulles « Pays · Capitale » en calque DOM projeté |
| `web/src/app/App.tsx` | montage de l'avion à l'accueil |
| `web/src/probe/main.ts` | `avion=<e>` : avion figé à la progression e (contrôles) |
| `web/src/pwa/cache.ts`, `web/src/ui/Answers.tsx` | drapeaux d'avance (installée), repli du drapeau |
| e2e : `home-plane.spec.ts`, `visual.spec.ts`, `pwa.spec.ts` | avion dessiné, bulles, mouvement réduit, référence ; partie hors ligne |

## Tâches

1. **Trajet** — tests : passage exact par les 4 escales, boucle fermée et continue, altitude de rase-mottes aux escales
   et de croisière loin d'elles, repère orthonormé tangent, roulis de base −25° en ligne droite.
2. **Horaire** — tests : à caméra fixe, vitesse à l'écran = `vitesse` (rad/s), tour caché en ≈ 2,4 s ; départ au milieu
   de la partie cachée ; passages franchis dans l'ordre Rabat → Athènes ; couleurs de la Grèce au départ puis du pays
   passé ; bulles allumées au passage, éteintes après la sortie ; perles nées au passage et effacées ; état figé du
   mouvement réduit (entre Paris et Athènes, trois bulles, couleurs de la France).
3. **Papier, toon, ombre** — tests : 3 groupes de faces (crème, bande, quille), normales vers l'extérieur, seuils toon,
   enveloppe convexe et projection sur le plan tangent.
4. **Accessoire et accueil** — `createHomePlane`, `AccessoryFrame.viewport`, bulles, montage dans `App`, sonde `avion=` ;
   e2e : avion dessiné (contour noir et papier crème à sa position projetée), bulle « Maroc · Rabat » apparue à son
   passage, mouvement réduit figé avec trois bulles, référence visuelle `accueil-avion` WebGPU et WebGL 2.
5. **Hors ligne** — tests : `heavyUrls` contient les 197 drapeaux ; e2e (nginx) : après une visite, hors ligne, une partie
   en mode Drapeau va jusqu'à la fin, chaque autocollant montre un drapeau ou un nom.
6. **Fin** — `check`, `e2e:local` complète, `pwa.spec` et budget sous le nginx de l'image, HANDOFF, commit ; GO pour la
   1.16.

## Décisions d'exécution (21/10)

9. **Repères G5 dans l'accueil** (spec 2A §3 : « repères G5 en calque DOM projeté ») : la maquette `accueil-avion-escales.html`
   les garde à côté de l'avion — épingles-drapeaux (Maroc, Espagne, Islande), drapeau planté qui ondule à Paris (deux
   étincelles), balise jaune à Athènes ; l'avion 2D et le tracé SVG de la maquette sont remplacés par l'avion 3D et ses
   perles. Inclinaison et estompe calculées de la pose (`web/src/ui/marks.ts` : à la vue d'accueil 390 × 844, f à 0,01 près
   de la maquette, n à 10 % près) ; tige à 60 % de l'angle du sol, relevé sur la maquette.
10. **Bulles gardées dans l'écran** (`inScreen`) : la rotation de l'accueil (1,5 °/s) déplace les escales, la bulle de
    Paris sortait par la droite.
11. **La rotation de l'accueil reste** : l'Europe dérive de 30° par tour de l'avion (≈ 20 s) ; au bout d'environ une
    minute elle passe au bord, l'avion boucle alors caché (2,4 s par tour) jusqu'à son retour. À trancher avec
    l'utilisateur : garder, ou un balancement qui garde l'Europe en vue.
12. **Défaut trouvé et corrigé (en ligne depuis la 1.12)** : le ménage des caches au démarrage (`purgeStale`) retirait tout
    fichier absent de la table d'empreintes, donc les index de données (`borders.json`, `imagery.json`, `countries.json`)
    à chaque ouverture : hors ligne, le globe affichait « Oups ! ». Il ne touche plus qu'aux fichiers que la table suit
    (motifs lourds et pays) ; le cache des données est renommé quand elles changent. Le test « l'accueil s'ouvre hors
    ligne » ne regardait que le titre.
13. **Index de données repassés par le service worker pour tout visiteur** (`OFFLINE_URLS`) : `countries.json` est demandé
    avant que le service worker ne contrôle la première visite.
14. **Démarrage** : la table d'empreintes n'est plus écrite qu'une fois (`web/src/pwa/empreintes.ts`, Vite la recopiait à
    chaque usage) ; l'avion et les repères sont livrés avec le code du globe (`GlobeView.tsx` les réexporte) : par un
    `import()` à part, les modules partagés avec le globe (lignes, atmosphère, `route`) sortaient en morceaux chargés
    pendant l'intro et la retardaient (Fast 4G de 1112 à 1228–1259 ms, mesuré contre la 1.15 reconstruite dans les mêmes
    conditions). Après : 993 ms. L'avion reçoit `unveil` de l'hôte des accessoires au lieu d'importer `physicalSky`.
