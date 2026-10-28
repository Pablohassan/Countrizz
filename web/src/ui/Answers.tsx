import { useState, type CSSProperties, type Ref } from 'react';
import ratios from '../data/flagRatios.json';
import type { CountryRecord } from '../data/types';
import type { Lang, Mode, Question } from '../game/types';
import type { Messages } from '../i18n';
import { isLongLabel } from './answerLabel';
import { flagSize, SHAPED_FLAGS } from './flagSize';

export type AnswerState = 'idle' | 'ok' | 'ko' | 'dim';
/**
 * La grille (mise en scène du 24/10) : `cache` au premier vol (elle monte à l'arrivée), `vol` entre deux questions (en
 * place, estompée, inerte, sans les libellés de la manche suivante : le chrono est arrêté), `actif` le reste du temps.
 */
export type GridState = 'cache' | 'vol' | 'actif';
const CLASS: Record<AnswerState, string> = { idle: '', ok: 'ok', ko: 'ko', dim: 'estompe' };

/** R3 : pendant la question tout est « idle » ; à la révélation, le bon en vert, le choix faux en rouge, les autres estompés. */
export function answerStates(q: Question, picked: number | null): AnswerState[] {
  return q.options.map((_, i) => (picked === null ? 'idle' : i === q.answer ? 'ok' : i === picked ? 'ko' : 'dim'));
}

/** Libellé d'une réponse : la capitale en mode Capitale, le nom du pays sinon (le mode Drapeau le montre à la révélation). */
export const optionLabel = (rec: CountryRecord, mode: Mode, lang: Lang): string => (mode === 'capital' ? rec.capital[lang] : rec.name[lang]);

interface Props {
  ref?: Ref<HTMLDivElement>;
  m: Messages; lang: Lang; mode: Mode; question: Question; records: ReadonlyMap<string, CountryRecord>;
  /** Réponse choisie pendant la révélation, sinon `null`. */
  picked: number | null;
  /** Question et grille gardent toujours leur place (la zone libre se mesure) ; voir `GridState`. */
  etat: GridState;
  /** Première question de la partie : la grille monte (elle était cachée pendant le premier vol). */
  monte?: boolean;
  onAnswer(index: number): void; onPress(): void; onRelease(): void;
}

function Badge({ state }: { state: AnswerState }) {
  if (state === 'ok') return <span className="reponse-badge reponse-badge--v" aria-hidden="true">✓</span>;
  if (state === 'ko') return <span className="reponse-badge reponse-badge--x" aria-hidden="true">✗</span>;
  return null;
}

/**
 * Autocollant d'un drapeau ; drapeau introuvable (hors ligne, pays jamais vu : plan 2A-6, décision 8) : le nom du pays sur
 * un autocollant crème, jamais une case vide. Le nom de la révélation n'est montré que sous un vrai drapeau.
 */
function FlagSticker({ src, w, h, shaped, name, revealed }: { src: string; w: number; h: number; shaped: boolean; name: string; revealed: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="reponse-drapeau-sans" style={{ width: w, height: h }}>{name}</span>;
  return (<>
    <img src={src} alt="" draggable={false} style={{ width: w, height: h }} className={shaped ? 'forme' : undefined} onError={() => setFailed(true)} />
    {revealed && <span className="reponse-nom">{name}</span>}
  </>);
}

/** La question juste au-dessus de la grille 2×2 (D1), boutons violets inclinés (D2) ou drapeaux autocollants (D3). */
export function Answers({ ref, m, lang, mode, question, records, picked, etat, monte = false, onAnswer, onPress, onRelease }: Props) {
  const states = answerStates(question, picked);
  const recs = question.options.map((c) => records.get(c)!);
  const locked = picked !== null || etat !== 'actif';
  const vol = etat === 'vol';
  const press = { onPointerDown: onPress, onPointerUp: onRelease };
  return (
    <div ref={ref} className={`jeu-bas${etat === 'cache' ? ' jeu-bas--cache' : vol ? ' jeu-bas--vol' : monte ? ' jeu-bas--monte' : ''}`}>
      <h2 className="jeu-question">{m.prompts[mode]}</h2>
      {mode === 'flag' ? (
        <div className="reponses reponses--drapeaux">
          {recs.map((r, i) => {
            const s = flagSize((ratios as Record<string, number>)[r.cca3] ?? 1.5);
            const w = Math.round(s.width * 10) / 10, h = Math.round(s.height * 10) / 10;
            const st = states[i]!;
            return (
              <button key={r.cca3} type="button" disabled={locked} aria-label={`${m.modes.flag} ${i + 1}`}
                className={`reponse-drapeau${st !== 'idle' ? ` reponse-drapeau--${CLASS[st]}` : ''}`}
                style={{ '--w': `${w}px`, '--h': `${h}px` } as CSSProperties} {...press} onClick={() => onAnswer(i)}>
                {!vol && <FlagSticker src={`/data/${r.flag}`} w={w} h={h} shaped={SHAPED_FLAGS.has(r.cca3)} name={r.name[lang]} revealed={st === 'ok' || st === 'ko'} />}
                <span className="reponse-touche" aria-hidden="true">{i + 1}</span>
                <Badge state={st} />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="reponses">
          {recs.map((r, i) => {
            const label = vol ? '\u00a0' : optionLabel(r, mode, lang);
            const st = states[i]!;
            return (
              <button key={r.cca3} type="button" disabled={locked} {...press} onClick={() => onAnswer(i)}
                className={`reponse${isLongLabel(label) ? ' reponse--long' : ''}${st !== 'idle' ? ` reponse--${CLASS[st]}` : ''}`}>
                <span className="reponse-touche" aria-hidden="true">{i + 1}</span>
                <span>{label}</span>
                <Badge state={st} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
