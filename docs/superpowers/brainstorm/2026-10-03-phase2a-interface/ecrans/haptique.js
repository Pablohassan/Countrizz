/**
 * haptique.js — retours haptiques du jeu (demande de l'utilisateur, 05/10 : « intégration haptique poussée, simulation
 * de pression quand on appuie sur un bouton et retour de force vibreur en cas de mauvaise réponse »).
 *
 *   import { haptique } from '/files/haptique.js';
 *   haptique.appui();       // le doigt se pose sur un bouton
 *   haptique.relache();     // le doigt se lève (le bouton remonte)
 *   haptique.bonne();       // bonne réponse
 *   haptique.mauvaise();    // mauvaise réponse : retour de force
 *   haptique.decompte();    // 3, 2, 1 ; haptique.go() pour « GO ! »
 *   haptique.record();      // « Nouveau record ! »
 *   haptique.actif = false; // réglage du joueur (mémorisé par le jeu)
 *
 * Moteurs, du plus riche au plus pauvre :
 *   - Android (Chrome, Edge, Firefox, Samsung Internet) : navigator.vibrate(motif). Le web ne règle pas l'intensité ;
 *     on la simule par la durée et par des impulsions hachées (2 ms de pause entre des impulsions de 8 ms paraissent
 *     plus « molles » qu'une vibration continue).
 *   - iPhone, iOS 18 et plus (Safari n'a pas navigator.vibrate) : basculer un <input type="checkbox" switch> caché
 *     déclenche le « tic » haptique du système. Seulement pendant un geste de l'utilisateur ; une seule intensité.
 *   - ailleurs (ordinateur, vieux iPhone) : rien ; les effets visuels (enfoncement, secousse) restent.
 * Les appels sont sans effet hors d'un geste quand le navigateur l'exige : jamais d'erreur.
 */
const vib = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? (m) => navigator.vibrate(m) : null;

let interrupteur = null;
function ticIOS() {
  if (typeof document === 'undefined') return false;
  if (!interrupteur) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.append(input);
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9px;top:-9px';
    document.body.append(label);
    interrupteur = label;
  }
  interrupteur.click();
  return true;
}
const estIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent) && !vib;

/** Motifs (ms : vibration, pause, vibration…). */
export const MOTIFS = Object.freeze({
  appui: [9],                                   // le « clic » de la pression
  relache: [4],                                 // la remontée, plus légère
  bonne: [14, 60, 22],                          // double tape, la seconde plus franche
  mauvaise: [70, 25, 8, 2, 8, 2, 8, 2, 8, 25, 140], // choc, grondement haché (plus « sourd »), long retour de force
  decompte: [18],
  go: [45],
  record: [20, 40, 20, 40, 20, 40, 90],
});

function jouer(nom) {
  if (!haptique.actif) return 'coupé';
  const m = MOTIFS[nom];
  if (vib) { vib(m); return 'vibration'; }
  if (estIOS) {
    // une seule intensité : on garde le rythme avec des tics (le premier dans le geste, les suivants peuvent être ignorés)
    ticIOS();
    if (nom === 'mauvaise' || nom === 'record' || nom === 'bonne') {
      const n = nom === 'bonne' ? 1 : 2;
      for (let i = 1; i <= n; i++) setTimeout(ticIOS, 90 * i);
    }
    return 'tic iOS';
  }
  return 'aucun';
}

export const haptique = {
  actif: true,
  moteur: vib ? 'vibration (Android)' : estIOS ? 'tic système (iOS 18+)' : 'aucun (visuel seul)',
  appui: () => jouer('appui'),
  relache: () => jouer('relache'),
  bonne: () => jouer('bonne'),
  mauvaise: () => jouer('mauvaise'),
  decompte: () => jouer('decompte'),
  go: () => jouer('go'),
  record: () => jouer('record'),
};
