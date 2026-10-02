import type { FlightParams } from './flight';
import type { FramingParams } from './framing';

/** Champ vertical de la caméra : celui de l'ancien globe.gl (`new PerspectiveCamera()`, 50°). */
export const FOV_Y_DEG = 50;

/**
 * Cadrage retenu par l'utilisateur le 02/10/2026 (réglage « B » de la planche de calibration) : le pays occupe 1/3 du
 * demi-champ (m = 3), et l'on montre toujours au moins une calotte de 3° autour de lui (θ_min) pour le situer ;
 * k = 1 (le facteur du spec ajoutait une altitude fixe à tous les pays). Réglable sur calibrate.html.
 */
export const FRAMING: FramingParams = { k: 1, margin: 3, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 }, minContextDeg: 3 };

/** Vol : ρ de d3, durée naturelle de van Wijk bornée à [1500 ; 3500] ms (spec §5). */
export const FLIGHT: Omit<FlightParams, 'alphaRad' | 'reducedMotion'> = { rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500 };
