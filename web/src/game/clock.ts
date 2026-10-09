/** Causes de pause du chrono net (spec 2A §2) : vol, révélation, onglet caché, « Tourne ton téléphone ». */
export type PauseReason = 'flight' | 'reveal' | 'hidden' | 'rotate';

/** Chrono net : il ne tourne que démarré et sans aucune cause de pause ; `usedMs` = temps déjà consommé. */
export interface Clock {
  durationMs: number;
  usedMs: number;
  runningSince: number | null;
  started: boolean;
  reasons: PauseReason[];
}

export const createClock = (durationMs: number, reasons: PauseReason[] = []): Clock =>
  ({ durationMs, usedMs: 0, runningSince: null, started: false, reasons: [...new Set(reasons)] });

const used = (c: Clock, now: number) => c.usedMs + (c.runningSince === null ? 0 : now - c.runningSince);

export function startClock(c: Clock, now: number): Clock {
  if (c.started) return c;
  return { ...c, started: true, runningSince: c.reasons.length === 0 ? now : null };
}

export function pauseClock(c: Clock, reason: PauseReason, now: number): Clock {
  if (c.reasons.includes(reason)) return c;
  return { ...c, usedMs: used(c, now), runningSince: null, reasons: [...c.reasons, reason] };
}

export function resumeClock(c: Clock, reason: PauseReason, now: number): Clock {
  if (!c.reasons.includes(reason)) return c;
  const reasons = c.reasons.filter((r) => r !== reason);
  return { ...c, reasons, runningSince: c.started && reasons.length === 0 ? now : null };
}

export const remainingMs = (c: Clock, now: number): number => Math.max(0, c.durationMs - used(c, now));
export const isRunning = (c: Clock): boolean => c.runningSince !== null;
