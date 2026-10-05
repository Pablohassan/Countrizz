# Phase 2A — section 5 : tests et erreurs (proposition du 05/10)

Complète le §8 du spec de refonte pour ce que la 2A ajoute (jeu, interface, i18n, PWA avancée en 2A). Règle inchangée :
**GitHub ne lance que `check`** (types + unitaires) ; **la suite complète du Mac fait foi** (`npm run check &&
npm run test:data && npm run e2e && npm run budget`) et barre la construction de l'image (décision du 03/10).
Tout se code test d'abord.

## Tests

### Unitaires (Vitest, `web/src/game/`, `web/src/i18n/`, `web/src/ui/`)

| Module | Ce qui est figé |
|---|---|
| `rules` | +10 par bonne réponse, 0 sinon ; fin à 60 s nettes ; la question en cours au moment du zéro n'est pas comptée ; « bonnes / total » |
| `draw` | 10 000 graines : aucun pays deux fois, jamais deux réponses identiques **dans la langue jouée**, difficulté progressive (monde → région après 3 bonnes d'affilée → sous-région ou voisins après 6) ; même graine = même partie |
| `clock` | chrono net : pause pendant le vol, la révélation (1,5 s), onglet caché et « Tourne ton téléphone » ; reprise exacte |
| `machine` | toutes les transitions accueil → mode → 3-2-1 (premier vol lancé pendant le décompte) → vol → question → révélation → fin → scores ; Quitter (sans confirmation), Rejouer (nouvelle graine), Changer de mode |
| `scores` | top 10 local par mode, égalité → le plus ancien d'abord, « Nouveau record ! » ; stockage indisponible (voir erreurs) |
| `i18n` | `fr.ts` et `en.ts` du même type (tsc) ; aucune chaîne vide ; langue du navigateur puis choix mémorisé |
| `ui` (logique) | taille du libellé (≥ 20 caractères → 2 lignes, plus petit) ; aire égale des drapeaux ; installation (invite disponible / iOS / déjà installée) ; partage (`navigator.share` / copie du lien) |

### Données (`npm run test:data`)

Les contrôles de la section 4 : libellés FR/EN complets et uniques, arbitrages `{ fr, en }` complets, noms FR
raccourcis appliqués, `capitalLngLat` dans le pays et dans le cadre de la caméra à l'arrivée.

### Bout en bout (Playwright, Mac de référence)

- **parcours complet** FR et EN : téléphone portrait (tactile) et bureau (clavier 1-4), pour chacun des trois modes ;
- **crédit EOX jamais recouvert** : `elementFromPoint` sur chaque écran qui montre le globe (accueil, mode, question,
  révélation, fin, scores, À propos) — exigence de la revue 1B ;
- **« Tourne ton téléphone »** : téléphone en paysage → écran et chrono en pause ; tablette et bureau en paysage → jeu ;
- **mouvement réduit** : avion, Terre de chargement, 3-2-1, tampon « Nouveau record ! » immobiles ;
- **erreurs simulées** (interception réseau, `simulateDeviceLost`, navigateur sans WebGL 2) → les écrans validés ;
- **PWA** : manifeste valide, service worker actif, **partie complète hors ligne** après une première visite ;
- **accueil et chargement** : l'avion A2 et la Terre cartoon se dessinent (`data-ready`), bulles des escales au passage ;
- **références visuelles `-darwin`** des nouveaux écrans (accueil, mode, question, révélation, fin, scores, À propos,
  chargement), WebGPU et `forceWebGL`.

### Budget (`npm run budget`)

Premier chargement mesuré comme en 1B (8 Mo), plus deux plafonds nouveaux : l'écran de chargement (module + carte
d'élévation, ≈ 60 Ko visés) et le précache du service worker.

## Erreurs

| Situation | Comportement en 2A |
|---|---|
| ni WebGPU ni WebGL 2 | écran « navigateur incompatible » (validé), sans bouton |
| textures ou frontières introuvables | carte « Le globe n'a pas pu se charger » + Réessayer (validée) |
| perte du GPU | **recréation du rendu et reprise de la partie** (spec §8) ; la carte d'erreur seulement si la recréation échoue |
| patch image absent ou lent | texture globale + contour ; une manche n'est jamais bloquée (spec) |
| hors ligne | service worker : jouable après la première visite ; patchs déjà vus en cache |
| stockage local indisponible (navigation privée, stockage bloqué) | **à trancher**, voir question 1 |
| invite d'installation absente | bouton remplacé par l'astuce iOS, ou masqué (déjà installé / navigateur sans PWA) |
| partage natif absent | copie du lien + « Lien copié ! » ; si la copie échoue aussi, le lien affiché à sélectionner |

Scores en ligne (API, file IndexedDB) : hors 2A (le chart ne déploie que `web`).

## Décisions de l'utilisateur (05/10)

1. **Stockage indisponible** : scores gardés le temps de la visite ; l'écran de fin affiche discrètement « Ton score ne
   peut pas être gardé sur cet appareil ».
2. **Haptique poussée** (demande : « simulation de pression quand on appuie sur un bouton et retour de force vibreur en
   cas de mauvaise réponse ») — module `ecrans/haptique.js`, essai `ecrans/haptique.html` :
   - **Android** (`navigator.vibrate`) : appui 9 ms (« clic » synchronisé avec l'enfoncement visuel du bouton dans
     son ombre), relâcher 4 ms, bonne réponse 14·60·22 ms (double tape), **mauvaise réponse
     70·25·(8·2)×4·25·140 ms** (choc, grondement haché, long retour de force, synchronisé avec la secousse rouge),
     3-2-1 18 ms par chiffre, « GO ! » 45 ms, « Nouveau record ! » 20·40·20·40·20·40·90 ms ;
   - **iPhone iOS 18+** : « tic » système (interrupteur `switch` caché basculé pendant le geste) à l'appui et aux
     réponses ; ni intensité ni vibration longue possibles sur le web ;
   - **ordinateur** : rien, effets visuels seuls ;
   - réglage « Vibrations » (oui par défaut, mémorisé) — à placer dans l'écran « À propos » ;
   - tests : module unitaire avec `navigator.vibrate` simulé (motifs par événement, réglage coupé, aucune erreur sans
     API) ; e2e avec un espion injecté (appui, réponses, 3-2-1) ; **ressenti vérifié à la main sur un vrai Android et
     un vrai iPhone** (aucun automate ne sent une vibration).
