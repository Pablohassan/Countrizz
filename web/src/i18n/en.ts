import type { Messages } from './types';

export const en: Messages = {
  modes: { flag: 'Flag', country: 'Country', capital: 'Capital' },
  prompts: { flag: 'Which is its flag?', country: 'Which country is this?', capital: 'What is its capital?' },
  home: { yourName: 'Your name:', defaultName: 'Globetrotter', play: 'Play', scores: 'Scores', about: 'About', language: 'Language' },
  mode: { back: '‹ Back', player: 'Player:', choose: 'Pick your mode', record: 'Best', new: 'New' },
  countdown: { go: 'GO!' },
  hud: { quit: 'Quit', score: 'Score', secondsLeft: '{seconds} seconds left', paused: 'Game paused' },
  reveal: { label: '{country} · {capital}', correct: 'Right: {answer}', wrong: 'Missed: it was {answer}' },
  end: {
    timeUp: 'Time’s up!', modeLine: '{mode} mode · {name}', newRecord: 'New record!', points: 'points',
    correctOf: '{correct} right answers out of {total}', previousRecord: 'Previous best: {score}', replay: 'Play again',
    changeMode: 'Change mode', scores: 'Scores', notSaved: 'Your score can’t be saved on this device',
  },
  scores: { title: 'Top scores', you: '· you', replay: 'Play again', back: '‹ Back', empty: 'No score yet in this mode' },
  about: {
    title: 'About', back: '‹ Back', install: 'Install the app',
    installText: 'Countrizz on your home screen, playable even offline.',
    iosTip: 'On iPhone and iPad: tap Share ⬆︎ then “Add to Home Screen”.',
    share: 'Share the game', shareText: 'Send Countrizz to your friends and family.', linkCopied: 'Link copied!',
    legal: 'Notices and licences', vibrations: 'Vibrations',
  },
  loading: { text: 'Getting the globe ready…' },
  errors: {
    oops: 'Oops!', loadTitle: 'The globe couldn’t load', loadText: 'Check your connection, then try again.', retry: 'Try again',
    loadHint: 'If it keeps happening, reload the page.',
    ohNo: 'Oh no!', unsupportedTitle: 'Your browser can’t show the globe',
    unsupportedText: 'The 3D globe is the heart of the game: there’s no version without it.',
  },
  rotate: { title: 'Turn your phone', text: 'Countrizz is played in portrait.', paused: 'Game paused' },
};
