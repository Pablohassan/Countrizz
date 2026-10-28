---
name: mise-en-scene
description: Analyse de la mise en scène d'une appli animée (Countrizz) — scènes, transitions, continuité, rythme — à partir d'un film image par image de l'appli réelle ; repère les incohérences et ce qui casse la fluidité, propose de couper, fusionner ou réordonner des scènes. À utiliser avant de toucher aux transitions entre écrans.
---

# Mise en scène — analyser les scènes et leurs raccords

Une appli qui enchaîne vidéo, globe 3D et écrans se monte comme un film : chaque écran est une **scène**, chaque
changement est un **raccord**. Ce qui casse la fluidité n'est presque jamais une image lente isolée : c'est un raccord
non motivé, un élément qui disparaît puis revient, deux mouvements qui se contredisent, une attente morte, ou une scène
de trop qui ne fait que répéter la précédente.

**On analyse l'appli réelle, filmée, jamais le code seul ni le souvenir.** Le code dit ce qui devrait se passer ; le film
dit ce qui se passe.

## 1. Matière (obligatoire avant toute conclusion)

1. **Film** : `node .claude/skills/mise-en-scene/scripts/film-complet.mjs http://localhost:5174/ <dossier>` (serveur de
   dev lancé). Format Pixel 9 (412 × 915), partie courte (`?partie=12000&graine=42`), toutes les images affichées
   (screencast), un **journal** horodaté des changements d'état (`journal.txt`), une **planche par raccord** (−0,6 s à
   +2,8 s autour de l'événement, `planches/NN-…jpg`) et un **storyboard** (une image toutes les 0,5 s).
   - Le globe n'apparaît à la capture qu'en rendu logiciel : la cadence du film est basse et les durées entre un clic et
     sa réaction sont gonflées. **Les positions sont justes à chaque image ; les à-coups ne se jugent pas sur ce film**
     (pour la fluidité au sens perf : mesure rAF au processeur ralenti, autre outil).
2. **Code des raccords** : ce que l'appli commande à chaque changement d'état (machine du jeu, commandes du globe,
   vols de caméra et leurs durées, animations CSS d'entrée et de sortie, délais).
3. **Intention** : la spec des écrans (`docs/superpowers/specs/`), les décisions du README de conception.

Chaque constat cite sa preuve : **planche et instant** (« 05, +300 ms ») ou **fichier:ligne**.

## 2. Grille de lecture

Pour chaque **scène** (un écran, ou un moment du globe) :
- **Foyer** : sur quoi l'œil doit être ; un seul foyer à la fois. Deux choses qui bougent fort en même temps = conflit.
- **Ce qui tient la scène** : le globe (position, cadrage, mouvement), le titre, le HUD, la grille, les repères.
- **Durée et rythme** : combien de temps elle dure, combien de temps on y attend sans rien à faire (temps mort).
- **Ce qu'elle apporte** : une information ou un choix nouveau ? Sinon, candidate à la coupe ou à la fusion.

Pour chaque **raccord** (scène A → scène B), répondre par oui/non, preuves à l'appui :
1. **Motivé** : déclenché par l'action du joueur ou par une fin naturelle (vol arrivé, vidéo finie) ? Un changement sans
   cause visible surprend.
2. **Continuité spatiale** : ce qui est dans les deux scènes (globe, titre, fond) reste-t-il à sa place, ou glisse-t-il
   d'un seul mouvement ? Un saut de position, de taille ou de cadrage d'un même objet = **faux raccord**.
3. **Continuité de direction** : les mouvements vont-ils dans le même sens (sortie à gauche, entrée par la droite) ?
   Deux mouvements opposés au même instant = contresens.
4. **Pas de doublon** : jamais deux exemplaires du même objet à l'écran (titre dédoublé, deux Terres), jamais un objet
   qui sort puis revient aussitôt (clignotement), jamais un écran vide ou noir entre deux scènes.
5. **Annonce et suite** : la sortie de A prépare-t-elle l'entrée de B (anticipation), et B prolonge-t-elle le geste
   (suite du mouvement) ? Une coupe sèche entre deux écrans au décor identique est acceptable ; entre deux décors
   différents, elle se voit.
6. **Durée** : le raccord est-il assez court pour ne pas faire attendre (≤ 0,5 s pour l'interface ; un vol de caméra
   peut durer davantage s'il porte du sens), assez long pour être lu (≥ 0,15 s) ?
7. **Économie** : ce raccord est-il nécessaire ? Deux raccords qui se suivent sans action du joueur entre eux, ou une
   scène qui ne fait que transiter, signalent **une transition de trop** : la fusionner avec sa voisine ou la couper.

## 3. Repérer la transition de trop

Lister les **temps** de l'enchaînement sous forme de chaîne (`vidéo → fondu → entrées de l'accueil → … → première
question`) et, pour chaque maillon : ce qu'il apporte, s'il attend le joueur, ce qui changerait si on le supprimait.
Candidats typiques :
- deux animations d'entrée successives du même écran (un fondu, puis des éléments qui arrivent encore) ;
- un écran intermédiaire qui ne porte qu'un seul choix (peut-il vivre dans l'écran précédent ?) ;
- un compte à rebours qui double un vol de caméra (les deux disent « ça commence ») ;
- un retour de caméra suivi d'un autre départ.

Pour chaque candidat : **couper**, **fusionner** (avec quoi, comment) ou **garder** (pourquoi), et ce que le joueur y
gagne en secondes et en clarté.

## 4. Rapport

1. **Chaîne des scènes** : un tableau `scène | foyer | ce qui tient | durée | apporte`.
2. **Raccords** : un tableau `A → B | type (coupe, fondu, glissé, vol) | durée | 1 à 7 : oui/non | preuve`.
3. **Incohérences**, de la plus visible à la moindre : ce qu'on voit, où (planche, instant), pourquoi ça casse.
4. **Transition(s) de trop** : la ou les propositions de coupe ou de fusion, avec le gain.
5. **Storyboard cible** : la chaîne réécrite, chaque raccord avec son type, sa durée et ce qui le motive — sans
   inventer d'écran : chaque élément vient de l'appli ou de la spec.

Ne pas conclure sur une impression : une incohérence sans planche ni fichier:ligne n'entre pas au rapport.
