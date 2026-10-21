import { PLANE, type PlaneSettings, type Route } from './route';

/** Ce que l'avion montre à un instant : progression, couleurs, gonflement, bulles des escales, perles de la traînée. */
export interface PlaneLook {
  /** Progression sur le trajet (0 → 1). */
  e: number;
  /** Couleurs : de l'escale `from` à l'escale `to` (indices d'ESCALES), mêlées à `f`. */
  colors: { from: number; to: number; f: number };
  /** Gonflement du changement de couleur (0 → 1 → 0). */
  swell: number;
  /** Bulles « Pays · Capitale » allumées, par escale. */
  bubbles: boolean[];
  /** Taille de chaque perle (0 → 1, rebond à la naissance). */
  pearls: number[];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lin = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const smooth = (x: number) => x * x * (3 - 2 * x);
const easeOutBack = (x: number) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const mod1 = (x: number) => x - Math.floor(x);
/** `x` est-il franchi en allant de `a` à `b` (sens du vol, pas d'un demi-tour au plus) ? */
const crossed = (a: number, b: number, x: number) => { const step = mod1(b - a), d = mod1(x - a); return step < 0.5 && d > 0 && d <= step; };

/** Échantillons de la visibilité « à l'écran » le long du trajet, recalculés à chaque image (aux progressions j / SAMPLES). */
export const SAMPLES = 400;
const N = SAMPLES;

/**
 * Horaire de l'avion de l'accueil (plan 2A-6, décisions 1 et 2), calculé image par image : le globe tourne à l'accueil et
 * l'écran varie, la visibilité ne se précalcule pas. Vitesse du prototype : lente à l'écran (`vitesse` × élan), rapide
 * ailleurs (la longueur cachée en `retour` s), transition lissée sur ± 1,5 % du tour ; couleurs, bulles et perles
 * déclenchées au franchissement des escales et des perles.
 */
export function createSchedule(route: Route, p: PlaneSettings = PLANE) {
  const [eR, , , eA] = route.passages as [number, number, number, number];
  const nPearls = Math.floor(((eA - eR) * route.total) / p.perles.pas) + 1;
  const pearlE = Array.from({ length: nPearls }, (_, i) => eR + (i * p.perles.pas) / route.total);
  // élan : vitesse normale de Rabat à Athènes, de plus en plus vive en s'en éloignant (sortie à droite, entrée à gauche)
  const elan = (e: number) => {
    if (e >= eR && e <= eA) return 1;
    const d = Math.min(mod1(e - eA), mod1(eR - e)) * route.total;
    return 1 + p.elan.gain * smooth(clamp01(d / p.elan.sur));
  };
  const elanAt = Array.from({ length: N }, (_, j) => elan(j / N));

  let e = 0, now = 0;
  let passedAt: (number | null)[] = [null, null, null, null];
  let last = -1;            // dernière escale franchie (couleurs)
  let exitAt: number | null = null;
  let births: (number | null)[] = pearlE.map(() => null);

  const mask = (onScreen: (e: number) => boolean) => Array.from({ length: N }, (_, j) => (onScreen(j / N) ? 1 : 0));
  /** Vitesse le long du sol (rad/s) en chaque échantillon, pour la visibilité de cette image. */
  const speeds = (vis: number[]) => {
    const w = Math.round(N * 0.015);
    let hidden = 0;
    for (const v of vis) hidden += 1 - v;
    const back = hidden > 0 ? (hidden * route.total) / N / p.retour : p.vitesse;
    return vis.map((_, j) => {
      let s = 0;
      for (let k = -w; k <= w; k++) s += vis[(j + k + N) % N]!;
      const seen = s / (2 * w + 1);
      return p.vitesse * elanAt[j]! * seen + back * (1 - seen);
    });
  };

  const look = (): PlaneLook => {
    const colors = last < 0 ? { from: 3, to: 3, f: 1 } : { from: (last + 3) % 4, to: last, f: smooth(lin(now - passedAt[last]!, 0, p.morph)) };
    const swell = colors.f < 1 && last >= 0 ? Math.sin(Math.PI * colors.f) : 0;
    const bubbles = passedAt.map((t) => t !== null && (exitAt === null || now < exitAt + p.bulles));
    const pearls = births.map((b, k) => {
      if (b === null) return 0;
      const born = Math.max(0, easeOutBack(clamp01((now - b) / 0.8)));
      if (exitAt === null) return born;
      const d = exitAt + p.perles.efface * 0.6 * (k / nPearls);
      return born * (1 - smooth(lin(now, d, d + 0.4 * p.perles.efface)));
    });
    return { e, colors, swell, bubbles, pearls };
  };

  /** Franchissements de `a` à `b` à l'instant courant. */
  const cross = (a: number, b: number) => {
    if (crossed(a, b, eR)) { passedAt = [now, null, null, null]; last = 0; exitAt = null; births = births.map(() => null); }
    for (let i = 1; i < 4; i++) if (crossed(a, b, route.passages[i]!)) { passedAt[i] = now; last = i; }
    pearlE.forEach((pe, k) => { if (births[k] === null && crossed(a, b, pe)) births[k] = now; });
    // un franchissement pile sur Rabat (départ du tour) fait naître la première perle avec lui
    if (passedAt[0] === now && births[0] === null) births[0] = now;
  };

  return {
    pearlE,
    /** Progression de l'état figé (mouvement réduit) : entre Paris et Athènes, comme le prototype. */
    reducedMotionE: (route.passages[2]! + route.passages[3]!) / 2,
    /** Départ au milieu de la plus longue partie cachée : à l'ouverture, ni avion ni nom. */
    start(onScreen: (e: number) => boolean): PlaneLook {
      const vis = mask(onScreen);
      let best = 0, bestStart = -1;
      for (let j = 0; j < N; j++) {
        if (vis[j] || !vis[(j - 1 + N) % N]) continue;
        let k = 0; while (k < N && !vis[(j + k) % N]) k++;
        if (k > best) { best = k; bestStart = j; }
      }
      e = bestStart >= 0 ? mod1((bestStart + best / 2) / N) : mod1((eA + 1) / 2);
      now = 0; passedAt = [null, null, null, null]; last = -1; exitAt = null; births = births.map(() => null);
      return look();
    },
    /** Avance de `dt` s (pas de 1/60 s au plus) avec la visibilité de cette image. */
    step(dt: number, onScreen: (e: number) => boolean): PlaneLook {
      const v = speeds(mask(onScreen));
      let left = Math.min(dt, 0.25);
      while (left > 1e-9) {
        const h = Math.min(left, 1 / 60);
        const a = e;
        e = mod1(e + (v[Math.floor(e * N) % N]! * h) / route.total);
        now += h;
        cross(a, e);
        left -= h;
      }
      if (passedAt[3] !== null && exitAt === null && !onScreen(e)) exitAt = now;
      return look();
    },
    /** État figé à la progression `at` (mouvement réduit, sonde) : escales et perles passées depuis Rabat, sans fondu. */
    still(at: number): PlaneLook {
      e = mod1(at); now = 1e6; exitAt = null; last = -1;
      passedAt = route.passages.map((q, i) => { if (q <= e) { last = i; return now - p.morph; } return null; });
      births = pearlE.map((pe) => (pe <= e ? now - 10 : null));
      return look();
    },
  };
}
