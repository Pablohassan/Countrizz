import type { Mode } from '../game/types';

/** Formes du pluriel, choisies par `plural` (Intl.PluralRules : en français, 0 et 1 au singulier). */
export interface Plural { one: string; other: string }

/** Tous les textes de l'interface ; `{nom}` = emplacement rempli par `fill`. Même type pour chaque langue (spec 2A §1). */
export interface Messages {
  modes: Record<Mode, string>;
  prompts: Record<Mode, string>;
  home: { yourName: string; defaultName: string; play: string; scores: string; about: string; language: string };
  mode: { back: string; player: string; choose: string; record: string; new: string };
  countdown: { go: string };
  hud: { quit: string; score: string; secondsLeft: Plural; paused: string };
  reveal: { label: string; correct: string; wrong: string };
  end: { timeUp: string; modeLine: string; newRecord: string; points: Plural; correctOf: Plural; previousRecord: string; replay: string; changeMode: string; scores: string; notSaved: string };
  scores: { title: string; you: string; replay: string; back: string; empty: string };
  about: { title: string; back: string; install: string; installText: string; iosTip: string; share: string; shareText: string; linkCopied: string; legal: string; vibrations: string };
  loading: { text: string };
  errors: { oops: string; loadTitle: string; loadText: string; retry: string; loadHint: string; ohNo: string; unsupportedTitle: string; unsupportedText: string; unsupportedHint: string };
  rotate: { title: string; text: string; paused: string };
}
