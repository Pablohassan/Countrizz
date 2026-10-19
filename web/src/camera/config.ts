import type { FlightParams } from './flight';
import type { FramingParams } from './framing';

/** Champ vertical de la caméra : celui de l'ancien globe.gl (`new PerspectiveCamera()`, 50°). */
export const FOV_Y_DEG = 50;

/**
 * Cadrage retenu par l'utilisateur le 02/10/2026 (réglage « B » de la planche de calibration) : le pays occupe 1/3 du
 * demi-champ (m = 3), et l'on montre toujours au moins une calotte de 3° autour de lui (θ_min) pour le situer ;
 * k = 1. Depuis le 15/10 (spec zoom §2), B n'est plus que la référence du zoom : à l'arrivée, le pays occupe entre 10 % et
 * 80 % du petit côté, B × 1,1 pour le plus grand pays à B × 3 pour le plus petit. Réglable sur calibrate.html.
 */
export const FRAMING: FramingParams = {
  k: 1, margin: 3, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 }, minContextDeg: 3,
  arrival: { share: { min: 0.1, max: 0.8 }, sizeFactor: { large: 1.1, small: 3 }, areaRange: { maxKm2: 16859281.08, minKm2: 0.51 } },
};

/**
 * Vol : ρ de d3, durée naturelle de van Wijk bornée à [1500 ; 3500] ms (spec §5), multipliée par le facteur de zoom (1 à
 * ×1,1, 3 à ×3, spec zoom §3), plafonnée à 6 s (option A de l'utilisateur, 15/10).
 */
export const FLIGHT: Omit<FlightParams, 'alphaRad' | 'reducedMotion' | 'zoom'> = {
  rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500, zoomRef: { from: 1.1, to: 3 }, capMs: 6000,
};
