import { useLayoutEffect, useRef } from 'react';
import type { CountryRecord } from '../data/types';
import type { GameState } from '../game/machine';
import type { Lang } from '../game/types';
import type { GlobeHandle } from '../globe/GlobeView';
import { fill, type Messages } from '../i18n';
import { Answers, optionLabel, type GridState } from './Answers';
import type { Haptics } from './haptics';
import { Hud } from './Hud';
import { RevealLabel } from './RevealLabel';
import './game.css';

interface Props {
  m: Messages; lang: Lang; state: GameState; records: ReadonlyMap<string, CountryRecord>; globe: GlobeHandle | null; haptics: Haptics;
  onAnswer(index: number): void; onQuit(): void;
}

/** La grille : cachée au premier vol (`asked` = 1), en place mais estompée aux vols suivants, active sinon. */
export const gridState = (screen: GameState['screen'], asked: number): GridState =>
  screen !== 'flight' ? 'actif' : asked <= 1 ? 'cache' : 'vol';

/** Marge sous le HUD avant la zone libre (px). */
const HUD_GAP = 8;

/**
 * Une partie (vol, question, révélation) sur le globe plein écran : HUD en haut, question et grille en bas sur le
 * voile (D1). La zone libre entre les deux (contrat 2A-4) est mesurée et donnée au globe dès le premier vol, puis à chaque
 * changement de taille : le pays s'y cadre et s'y centre.
 */
export function GameScreen({ m, lang, state, records, globe, haptics, onAnswer, onQuit }: Props) {
  const hud = useRef<HTMLDivElement>(null);
  const bas = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!globe) return;
    const measure = () => {
      const h = hud.current?.getBoundingClientRect(), b = bas.current?.getBoundingClientRect();
      if (h && b) globe.setSafeArea({ top: h.bottom + HUD_GAP, bottom: innerHeight - b.top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [hud.current, bas.current]) if (el) ro.observe(el);
    addEventListener('resize', measure);
    return () => { ro.disconnect(); removeEventListener('resize', measure); };
  }, [globe, state.mode]);

  const q = state.question, mode = state.mode;
  const rec = q ? records.get(q.cca3) : undefined;
  const revealing = state.screen === 'reveal' && !!q && state.picked !== null;
  const ok = revealing && state.picked === q!.answer;
  const answer = q && mode ? records.get(q.options[q.answer]!) : undefined;
  // l'étiquette du pays révélé reste posée sur lui pendant le vol suivant : elle part avec lui (cachée derrière l'horizon)
  const quitte = state.screen === 'flight' && state.asked.length > 1 ? records.get(state.asked[state.asked.length - 2]!) : undefined;
  const etiquette = revealing ? rec : quitte;
  return (
    <div className={`jeu${mode === 'flag' ? ' jeu--drapeau' : ''}`}>
      <div className="jeu-voile" aria-hidden="true" />
      <Hud ref={hud} m={m} lang={lang} clock={state.clock} score={state.tally.score} plus={ok} onQuit={onQuit} />
      {q && mode && (
        <Answers ref={bas} m={m} lang={lang} mode={mode} question={q} records={records} picked={revealing ? state.picked : null}
          etat={gridState(state.screen, state.asked.length)} monte={state.asked.length === 1} onAnswer={onAnswer}
          onPress={() => haptics.play('press')} onRelease={() => haptics.play('release')} />
      )}
      {etiquette && <RevealLabel key={etiquette.cca3} globe={globe} rec={etiquette} lang={lang} />}
      <p className="sr" aria-live="polite">
        {revealing && answer && mode ? fill(ok ? m.reveal.correct : m.reveal.wrong, { answer: optionLabel(answer, mode, lang) }) : ''}
      </p>
    </div>
  );
}
