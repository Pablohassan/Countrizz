import type { Messages } from './types';

export const fr: Messages = {
  modes: { flag: 'Drapeau', country: 'Pays', capital: 'Capitale' },
  prompts: { flag: 'Quel est son drapeau ?', country: 'Quel est ce pays ?', capital: 'Quelle est sa capitale ?' },
  home: { yourName: 'Ton nom :', defaultName: 'Globetrotteur', play: 'Jouer', scores: 'Scores', about: 'À propos', language: 'Langue' },
  mode: { back: '‹ Retour', player: 'Joueur :', choose: 'Choisis ton mode', record: 'Record', new: 'Nouveau' },
  countdown: { go: 'GO !' },
  hud: { quit: 'Quitter', score: 'Score', secondsLeft: { one: '{seconds} seconde restante', other: '{seconds} secondes restantes' }, paused: 'Partie en pause' },
  reveal: { label: '{country} · {capital}', correct: 'Bonne réponse : {answer}', wrong: 'Raté : c’était {answer}' },
  end: {
    timeUp: 'Temps écoulé !', modeLine: 'Mode {mode} · {name}', newRecord: 'Nouveau record !', points: { one: 'point', other: 'points' },
    correctOf: { one: '{correct} bonne réponse sur {total}', other: '{correct} bonnes réponses sur {total}' }, previousRecord: 'Ancien record : {score}', replay: 'Rejouer',
    changeMode: 'Changer de mode', scores: 'Scores', notSaved: 'Ton score ne peut pas être gardé sur cet appareil',
  },
  scores: { title: 'Top scores', you: '· toi', replay: 'Rejouer', back: '‹ Retour', empty: 'Pas encore de score dans ce mode' },
  about: {
    title: 'À propos', back: '‹ Retour', install: 'Installer l’appli',
    installText: 'Countrizz sur ton écran d’accueil, jouable même sans réseau.',
    iosTip: 'Sur iPhone et iPad : touche Partager ⬆︎ puis « Sur l’écran d’accueil ».',
    share: 'Partager le jeu', shareText: 'Envoie Countrizz à tes amis et à ta famille.', linkCopied: 'Lien copié !',
    legal: 'Mentions et licences', vibrations: 'Vibrations',
  },
  loading: { text: 'Préparation du globe…' },
  errors: {
    oops: 'Oups !', loadTitle: 'Le globe n’a pas pu se charger', loadText: 'Vérifie ta connexion, puis réessaie.', retry: 'Réessayer',
    loadHint: 'Si le problème continue, recharge la page.',
    ohNo: 'Oh non !', unsupportedTitle: 'Ton navigateur ne peut pas afficher le globe',
    unsupportedText: 'Le globe 3D est le cœur du jeu : il n’y a pas de version sans lui.',
    unsupportedHint: 'Countrizz a besoin de WebGPU ou de WebGL 2. Essaie avec un navigateur récent : Chrome, Edge, Firefox ou Safari à jour.',
  },
  rotate: { title: 'Tourne ton téléphone', text: 'Countrizz se joue en portrait.', paused: 'Partie en pause' },
};
