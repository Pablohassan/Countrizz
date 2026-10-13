import type { Messages } from '../i18n';
import './screens.css';

/** « Tourne ton téléphone » (D5, D16) : téléphone jaune qui pivote ; « ❚❚ Partie en pause » pendant une partie. */
export function RotateScreen({ m, inGame }: { m: Messages; inGame: boolean }) {
  return (
    <div className="tourne" role="alertdialog" aria-labelledby="tourne-titre">
      <div className="tourne-tel" aria-hidden="true" />
      <div>
        <h1 id="tourne-titre" className="tourne-titre">{m.rotate.title}</h1>
        <p>{m.rotate.text}</p>
        {inGame && <span className="tourne-pause">❚❚ {m.rotate.paused}</span>}
      </div>
    </div>
  );
}
