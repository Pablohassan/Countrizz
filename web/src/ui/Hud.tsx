import { useEffect, useState, type Ref } from 'react';
import { isRunning, remainingMs, type Clock } from '../game/clock';
import type { Lang } from '../game/types';
import { fill, plural, type Messages } from '../i18n';

/** 10 dernières secondes : jauge et chiffres rouges qui clignotent (D10), seulement quand le chrono tourne. */
export const URGENT_S = 10;

/** Secondes affichées (arrondies au-dessus : « 1 » jusqu'au zéro) et part restante de la jauge. */
export function hudTime(clock: Clock, now: number): { seconds: number; fraction: number } {
  const ms = remainingMs(clock, Math.max(now, clock.runningSince ?? now));
  return { seconds: Math.ceil(ms / 1000), fraction: clock.durationMs > 0 ? ms / clock.durationMs : 0 };
}

/** L'heure de la page à chaque image, tant que le chrono tourne (la jauge se vide en continu). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let id = requestAnimationFrame(function frame(t) { setNow(t); id = requestAnimationFrame(frame); });
    return () => cancelAnimationFrame(id);
  }, [active]);
  return now;
}

interface Props { ref?: Ref<HTMLDivElement>; m: Messages; lang: Lang; clock: Clock; score: number; plus: boolean; onQuit(): void }

/** HUD H2 (D10) : ✕ Quitter, secondes, score ; jauge pleine largeur ; pause = hachures et « ❚❚ » ; « +10 » à la révélation. */
export function Hud({ ref, m, lang, clock, score, plus, onQuit }: Props) {
  const running = isRunning(clock);
  const { seconds, fraction } = hudTime(clock, useNow(running));
  const mod = running ? (seconds <= URGENT_S ? 'urgent' : '') : 'pause';
  return (
    <div ref={ref} className="hud">
      <div className="hud-l1">
        <button type="button" className="hud-quitter" aria-label={m.hud.quit} onClick={onQuit}>✕</button>
        <span className={`hud-sec${mod ? ` hud-sec--${mod}` : ''}`} role="timer"
          aria-label={running ? fill(plural(lang, seconds, m.hud.secondsLeft), { seconds }) : m.hud.paused}>
          {running ? seconds : `❚❚ ${seconds}`}
        </span>
        <div className="hud-score" aria-label={`${m.hud.score} ${score}`}>
          <span>★ {score}</span>
          {plus && <span className="hud-plus" aria-hidden="true">+10</span>}
        </div>
      </div>
      <div className={`hud-jauge${mod ? ` hud-jauge--${mod}` : ''}`} aria-hidden="true"><i style={{ width: `${(fraction * 100).toFixed(2)}%` }} /></div>
    </div>
  );
}
