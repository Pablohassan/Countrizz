import { useState } from 'react';
import type { GameResult } from '../app/finish';
import type { ScoreBook } from '../game/scores';
import { MODES, type Mode } from '../game/types';
import type { Messages } from '../i18n';
import './screens.css';

interface Props { m: Messages; initialMode: Mode; book: ScoreBook; me: GameResult | null; onBack(): void; onReplay(mode: Mode): void }

/**
 * Scores S2 (D13) : top 10 local du mode en bandes inclinées, 1ᵉʳ en jaune, la partie du joueur en violet « · toi ». Une
 * partie jouée sans nom est enregistrée sans nom et montrée sous le nom par défaut de la langue.
 */
export function ScoresScreen({ m, initialMode, book, me, onBack, onReplay }: Props) {
  const [tab, setTab] = useState<Mode>(initialMode);
  const list = book.read(tab);
  return (
    <div className="ecran scores">
      <button type="button" className="ecran-retour" onClick={onBack}><span>{m.scores.back}</span></button>
      <h1 className="ecran-titre">{m.scores.title}</h1>
      <div className="scores-corps">
        <div className="onglets" role="tablist">
          {MODES.map((mode) => (
            <button key={mode} type="button" role="tab" aria-selected={tab === mode} className="onglet" onClick={() => setTab(mode)}><span>{m.modes[mode]}</span></button>
          ))}
        </div>
        {list.length === 0 ? <p className="scores-vide">{m.scores.empty}</p> : (
          <ol className="scores-liste">
            {list.map((e, i) => {
              const toi = !!me && me.mode === tab && me.entry.at === e.at && me.entry.name === e.name;
              // une partie sans nom : le nom par défaut de la langue (il peut dépasser les 12 caractères d'un nom saisi)
              const name = e.name || m.home.defaultName;
              return (
                <li key={`${e.at}-${i}`} className={`scores-ligne${toi ? ' scores-ligne--toi' : i === 0 ? ' scores-ligne--premier' : ''}`}>
                  <span className="scores-rang">{i + 1}</span>
                  <span className="scores-nom">{toi ? `${name} ${m.scores.you}` : name}</span>
                  <span className="scores-points">{e.score}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <button type="button" className="bouton-violet scores-rejouer" onClick={() => onReplay(tab)}><span>{m.scores.replay}</span></button>
    </div>
  );
}
