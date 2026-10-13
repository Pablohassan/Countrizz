import type { ReactNode } from 'react';
import type { GameResult } from '../app/finish';
import type { CountryRecord } from '../data/types';
import type { Round } from '../game/rules';
import type { Lang } from '../game/types';
import { fill, plural, type Messages } from '../i18n';
import './screens.css';

/** `fill`, les valeurs en gras (« <b>19</b> bonnes réponses sur <b>24</b> », maquette F1). */
export function fillBold(template: string, vars: Record<string, string | number>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    if (!k) return part;
    if (!(k in vars)) throw new Error(`fillBold : valeur manquante pour {${k}}`);
    return <b key={i}>{vars[k]}</b>;
  });
}

interface Props {
  m: Messages; lang: Lang; name: string; result: GameResult; rounds: Round[]; records: ReadonlyMap<string, CountryRecord>;
  onReplay(): void; onChangeMode(): void; onScores(): void;
}

/** Fin F1 (D12) : carte crème en haut (score, bonnes réponses, ancien record, tampon, drapeaux de la partie), globe en bas. */
export function EndScreen({ m, lang, name, result, rounds, records, onReplay, onChangeMode, onScores }: Props) {
  return (
    <div className="ecran fin">
      <div className="fin-haut">
        <div>
          <h1 className="fin-titre">{m.end.timeUp}</h1>
          <p className="fin-mode">{fill(m.end.modeLine, { mode: m.modes[result.mode], name })}</p>
        </div>
        <div className="fin-carte">
          {result.record && <span className="fin-tampon">{m.end.newRecord}</span>}
          <div className="fin-score">{result.score}</div>
          <div className="fin-points">{plural(lang, result.score, m.end.points)}</div>
          <p className="fin-bonnes">{fillBold(plural(lang, result.correct, m.end.correctOf), { correct: result.correct, total: result.total })}</p>
          {result.previousBest !== null && <p className="fin-ancien">{fill(m.end.previousRecord, { score: result.previousBest })}</p>}
          <div className="fin-escales">
            {rounds.map((r, i) => {
              const rec = records.get(r.cca3);
              return <span key={i} className={`fin-escale${r.ok ? '' : ' ko'}`} title={rec?.name[lang]} style={{ backgroundImage: rec ? `url(/data/${rec.flag})` : undefined }} />;
            })}
          </div>
          {!result.saved && <p className="fin-perdu">{m.end.notSaved}</p>}
        </div>
        <div className="fin-boutons">
          <button type="button" className="bouton-violet fin-rejouer" onClick={onReplay}><span>{m.end.replay}</span></button>
          <div className="fin-rang2">
            <button type="button" className="bouton-nuit" onClick={onChangeMode}><span>{m.end.changeMode}</span></button>
            <button type="button" className="bouton-nuit" onClick={onScores}><span>{m.end.scores}</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}
