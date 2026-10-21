import { describe, expect, it } from 'vitest';
import { createRoute, PLANE } from './route';
import { createSchedule, type PlaneLook } from './schedule';

const route = createRoute();
const [eR, , , eA] = route.passages as [number, number, number, number];
/** Caméra fixe qui voit Rabat → Athènes et un peu autour (le téléphone du prototype). */
const phone = (e: number) => e >= eR - 0.03 && e <= eA + 0.03 || e >= 1 - 0.03 + eR;
const DT = 1 / 60;

/** Fait voler `seconds` s ; rend la suite des états (temps, progression, regard). */
function fly(s: ReturnType<typeof createSchedule>, onScreen: (e: number) => boolean, seconds: number) {
  const out: { t: number; e: number; look: PlaneLook; screen: boolean }[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const look = s.step(DT, onScreen);
    out.push({ t: t + DT, e: look.e, look, screen: onScreen(look.e) });
  }
  return out;
}

describe('horaire de l’avion de l’accueil, image par image (plan 2A-6, décisions 1 et 2)', () => {
  it('départ au milieu de la partie cachée : ni avion à l’écran, ni bulle, couleurs grecques', () => {
    const s = createSchedule(route);
    const look = s.start(phone);
    expect(phone(look.e)).toBe(false);
    expect(look.bubbles).toEqual([false, false, false, false]);
    expect(look.colors).toEqual({ from: 3, to: 3, f: 1 });
    expect(look.pearls.every((x) => x === 0)).toBe(true);
  });

  it('à l’écran, la vitesse du prototype (rad/s le long du sol) ; hors de l’écran, le tour en ≈ 2,4 s', () => {
    const s = createSchedule(route);
    s.start(phone);
    const run = fly(s, phone, 30);
    // entre Madrid et Paris : loin des bords de l'écran, sans élan
    const inMid = (r: { e: number }) => r.e > route.passages[1]! + 0.004 && r.e < route.passages[2]! - 0.004;
    // le premier passage seulement (30 s font plusieurs tours)
    const first = run.findIndex(inMid);
    const mid = run.slice(first, first + run.slice(first).findIndex((r) => !inMid(r)));
    const v = ((mid.at(-1)!.e - mid[0]!.e) * route.total) / (mid.at(-1)!.t - mid[0]!.t);
    expect(v).toBeGreaterThan(PLANE.vitesse * 0.99);
    expect(v).toBeLessThan(PLANE.vitesse * 1.01);
    // sortie après Athènes → retour à l'écran avant Rabat
    const out = run.findIndex((r, i) => i > 0 && run[i - 1]!.screen && !r.screen && r.look.bubbles[3]);
    const back = run.findIndex((r, i) => i > out && r.screen);
    const hidden = run[back]!.t - run[out]!.t;
    expect(hidden).toBeGreaterThan(2.0);
    expect(hidden).toBeLessThan(3.4);
  });

  it('escales franchies dans l’ordre : bulle allumée au passage, couleurs du pays passé', () => {
    const s = createSchedule(route);
    s.start(phone);
    const run = fly(s, phone, 30);
    const firstOn = [0, 1, 2, 3].map((i) => run.findIndex((r) => r.look.bubbles[i]));
    for (let i = 1; i < 4; i++) expect(firstOn[i]!).toBeGreaterThan(firstOn[i - 1]!);
    // au passage de Madrid : Maroc et Espagne allumées, pas encore la France
    expect(run[firstOn[1]!]!.look.bubbles).toEqual([true, true, false, false]);
    // couleurs : la France 0,6 s après son passage, gonflement pendant le changement seulement
    const fra = run[firstOn[2]! + Math.round(0.6 / DT)]!.look;
    expect(fra.colors).toEqual({ from: 1, to: 2, f: 1 });
    expect(fra.swell).toBe(0);
    expect(run[firstOn[2]! + Math.round(0.25 / DT)]!.look.swell).toBeGreaterThan(0.5);
  });

  it('bulles éteintes 0,25 s après la sortie de l’écran qui suit Athènes, rallumées au tour suivant', () => {
    const s = createSchedule(route);
    s.start(phone);
    const run = fly(s, phone, 40);
    const out = run.findIndex((r, i) => i > 0 && run[i - 1]!.screen && !r.screen && r.look.bubbles[3]);
    expect(run[out + Math.round(0.2 / DT)]!.look.bubbles[3]).toBe(true);
    expect(run[out + Math.round(0.3 / DT)]!.look.bubbles).toEqual([false, false, false, false]);
    expect(run.slice(out + Math.round(0.3 / DT)).some((r) => r.look.bubbles[0])).toBe(true);
  });

  it('perles : nées au passage de l’avion, pleines 0,8 s après, effacées après la sortie', () => {
    const s = createSchedule(route);
    s.start(phone);
    const run = fly(s, phone, 30);
    expect(s.pearlE.length).toBe(Math.floor(((eA - eR) * route.total) / PLANE.perles.pas) + 1);
    const atA = run.findIndex((r) => r.look.bubbles[3]);
    const done = run[atA + Math.round(0.85 / DT)]!.look.pearls;
    expect(done.at(-1)!).toBeGreaterThan(0.95);
    expect(done[0]!).toBeCloseTo(1, 6);
    const out = run.findIndex((r, i) => i > 0 && run[i - 1]!.screen && !r.screen && r.look.bubbles[3]);
    expect(run[out + Math.round(1.1 / DT)]!.look.pearls.every((x) => x < 1e-9)).toBe(true);
  });

  it('globe tourné ailleurs (rien à l’écran) : l’avion boucle caché, un tour en ≈ 2,4 s', () => {
    const s = createSchedule(route);
    s.start(() => false);
    // d'un passage par 0 au suivant
    let prev = s.step(DT, () => false).e, wraps = 0, t = 0;
    for (let k = 0; k < 1200 && wraps < 2; k++) {
      const e = s.step(DT, () => false).e;
      if (e < prev) wraps++;
      if (wraps === 1) t += DT;
      prev = e;
    }
    expect(t).toBeGreaterThan(PLANE.retour * 0.9);
    expect(t).toBeLessThan(PLANE.retour * 1.1);
  });

  it('état figé (mouvement réduit) : entre Paris et Athènes, trois bulles, couleurs de la France, perles jusqu’à lui', () => {
    const s = createSchedule(route);
    const look = s.still(s.reducedMotionE);
    expect(look.e).toBeGreaterThan(route.passages[2]!);
    expect(look.e).toBeLessThan(route.passages[3]!);
    expect(look.bubbles).toEqual([true, true, true, false]);
    expect(look.colors).toEqual({ from: 1, to: 2, f: 1 });
    expect(look.swell).toBe(0);
    s.pearlE.forEach((pe, k) => expect(look.pearls[k]).toBe(pe <= look.e ? 1 : 0));
  });
});
