import type { Mode } from '../game/types';

/** Tous les textes de l'interface ; `{nom}` = emplacement rempli par `fill`. Même type pour chaque langue (spec 2A §1). */
export interface Messages {
  modes: Record<Mode, string>;
  prompts: Record<Mode, string>;
  home: { yourName: string; defaultName: string; play: string; scores: string; about: string; language: string };
  mode: { back: string; player: string; choose: string; record: string; new: string };
  countdown: { go: string };
  hud: { quit: string; score: string; secondsLeft: string; paused: string };
  reveal: { label: string; correct: string; wrong: string };
  end: { timeUp: string; modeLine: string; newRecord: string; points: string; correctOf: string; previousRecord: string; replay: string; changeMode: string; scores: string; notSaved: string };
  scores: { title: string; you: string; replay: string; back: string; empty: string };
  about: { title: string; back: string; install: string; installText: string; iosTip: string; share: string; shareText: string; linkCopied: string; legal: string; vibrations: string };
  loading: { text: string };
  errors: { oops: string; loadTitle: string; loadText: string; retry: string; loadHint: string; ohNo: string; unsupportedTitle: string; unsupportedText: string };
  rotate: { title: string; text: string; paused: string };
}
