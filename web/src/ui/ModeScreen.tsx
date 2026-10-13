import { MODES, type Mode } from '../game/types';
import type { ScoreBook } from '../game/scores';
import type { Messages } from '../i18n';
import './screens.css';

/** Étoiles de difficulté (D9) : Drapeau 1, Pays 2, Capitale 3. */
const STARS: Record<Mode, number> = { flag: 1, country: 2, capital: 3 };

/** Meilleur score local de chaque mode ; `null` : jamais joué (« Nouveau »). */
export const bestScores = (book: ScoreBook): Record<Mode, number | null> =>
  Object.fromEntries(MODES.map((mode) => [mode, book.read(mode)[0]?.score ?? null])) as Record<Mode, number | null>;

interface Props { m: Messages; name: string; best: Record<Mode, number | null>; onChoose(mode: Mode): void; onBack(): void }

/** Choix du mode A (D9) : les boutons inclinés de « Jouer », empilés ; décor de l'accueil. */
export function ModeScreen({ m, name, best, onChoose, onBack }: Props) {
  return (
    <div className="ecran mode">
      <button type="button" className="ecran-retour" onClick={onBack}><span>{m.mode.back}</span></button>
      <p className="mode-joueur">{m.mode.player} <b>{name}</b></p>
      <h1 className="ecran-titre">{m.mode.choose}</h1>
      <div className="mode-liste">
        {MODES.map((mode) => (
          <button key={mode} type="button" className="mode-bouton" onClick={() => onChoose(mode)}>
            <span className="mode-nom">
              <span>{m.modes[mode]}</span>
              <span className="etoiles" aria-hidden="true">{'★'.repeat(STARS[mode])}<span className="etoiles-off">{'★'.repeat(3 - STARS[mode])}</span></span>
            </span>
            {best[mode] === null
              ? <span className="record record--nouveau">{m.mode.new}</span>
              : <span className="record"><small>{m.mode.record}</small> {best[mode]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
