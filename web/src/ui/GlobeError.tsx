import type { Messages } from '../i18n';
import './screens.css';

/**
 * Erreurs D16 : chargement raté ou recréation ratée après une perte du GPU (globe grisé, bulle, « Réessayer ») ;
 * navigateur incompatible (bulle sans bouton : réessayer ne changerait rien).
 */
export function GlobeErrorScreen({ m, kind, onRetry }: { m: Messages; kind: 'load' | 'unsupported'; onRetry(): void }) {
  const e = m.errors;
  const load = kind === 'load';
  return (
    <div className={`ecran erreur erreur--${kind}`}>
      <h1 className="ecran-titre">{load ? e.oops : e.ohNo}</h1>
      <div className="erreur-bloc">
        <p className="bulle"><b>{load ? e.loadTitle : e.unsupportedTitle}</b>{load ? e.loadText : e.unsupportedHint}</p>
        {load && <button type="button" className="bouton-violet erreur-cta" onClick={onRetry}><span>{e.retry}</span></button>}
        <p className="erreur-petit">{load ? e.loadHint : e.unsupportedText}</p>
      </div>
    </div>
  );
}
