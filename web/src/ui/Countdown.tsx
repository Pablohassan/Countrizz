import type { Messages } from '../i18n';

/** 3-2-1 C1 (D11) : un chiffre géant par seconde, puis « GO ! » dans le pavé violet ; la clé relance l'animation. */
export function Countdown({ value, m }: { value: number; m: Messages }) {
  return (
    <div className="decompte" aria-live="assertive">
      {value > 0 ? <span key={value} className="decompte-n">{value}</span> : <span key="go" className="decompte-go">{m.countdown.go}</span>}
    </div>
  );
}
