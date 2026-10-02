import type { FlightParams } from './flight';
import type { FramingParams } from './framing';

/** Champ vertical de la caméra : celui de l'ancien globe.gl (`new PerspectiveCamera()`, 50°). */
export const FOV_Y_DEG = 50;

/** Cadrage par défaut ; `k` et `margin` sont calibrés avec l'utilisateur (Task 13 du plan de la phase 1A). */
export const FRAMING: FramingParams = { k: 1, margin: 1.6, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 } };

/** Vol : ρ de d3, durée naturelle de van Wijk bornée à [1500 ; 3500] ms (spec §5). */
export const FLIGHT: Omit<FlightParams, 'alphaRad' | 'reducedMotion'> = { rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500 };
