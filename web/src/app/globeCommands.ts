import type { GameState, Screen } from '../game/machine';

/**
 * Ce que le globe doit faire à un changement d'état de la machine (contrat 2A-3 : un vol à l'entrée en `countdown` et en
 * `flight` ; contrat 2A-4 : zone libre à l'entrée du 3-2-1, retirée en sortie). Pur : `useGame` exécute la liste.
 * - `enterGame` : rotation d'accueil arrêtée (la zone libre est posée par l'écran de jeu, qui la mesure) ;
 * - `fly` : vol vers le pays ; `ARRIVED { flight }` seulement si le ticket rend `true` ;
 * - `showQuestion` / `answer` : surbrillance du pays, puis vert ou rouge (R3) ;
 * - `leaveGame` : zone libre retirée, surbrillance effacée, vue d'accueil et rotation lente (décision 1 du plan).
 */
export type GlobeCommand =
  | { kind: 'enterGame' }
  | { kind: 'fly'; cca3: string; flight: number }
  | { kind: 'showQuestion' }
  | { kind: 'answer'; result: 'correct' | 'wrong' }
  | { kind: 'leaveGame' };

const IN_GAME: readonly Screen[] = ['countdown', 'flight', 'question', 'reveal'];
const inGame = (s: GameState) => IN_GAME.includes(s.screen);

export function globeCommands(prev: GameState, next: GameState): GlobeCommand[] {
  const out: GlobeCommand[] = [];
  if (!inGame(prev) && inGame(next)) out.push({ kind: 'enterGame' });
  if (next.flight !== prev.flight && next.question && (next.screen === 'countdown' || next.screen === 'flight')) {
    out.push({ kind: 'fly', cca3: next.question.cca3, flight: next.flight });
  }
  if (next.screen === 'question' && prev.screen !== 'question') out.push({ kind: 'showQuestion' });
  if (next.screen === 'reveal' && prev.screen !== 'reveal' && next.question && next.picked !== null) {
    out.push({ kind: 'answer', result: next.picked === next.question.answer ? 'correct' : 'wrong' });
  }
  if (inGame(prev) && !inGame(next)) out.push({ kind: 'leaveGame' });
  return out;
}
