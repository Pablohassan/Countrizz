import type * as THREE from 'three/webgpu';
import { texture, uniform, vec2 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';

/** Effacement des nuages à l'arrivée sur un pays, et retour au vol suivant. */
export const CLOUD_FADE_MS = 800;
/** Dérive vers l'est, en tours par seconde (un tour en 30 min : perceptible au repos, imperceptible pendant une question). */
export const CLOUD_DRIFT_TURNS_PER_S = 1 / 1800;

export interface CloudFade { from: number; to: number; atMs: number }

/** Opacité à l'instant `nowMs` : de `from` à `to` en CLOUD_FADE_MS (courbe lissée), puis constante. */
export function cloudOpacity(f: CloudFade, nowMs: number): number {
  const t = Math.min(1, Math.max(0, (nowMs - f.atMs) / CLOUD_FADE_MS));
  return f.from + (f.to - f.from) * t * t * (3 - 2 * t);
}

/**
 * Nuages (spec §4.2) : couche séparée — leur texture, leur dérive, leur opacité — lue DANS le matériau de la Terre.
 * Une coque transparente au-dessus du globe écrasait la cible « émissif » du rendu multiple et éteignait le bloom des
 * villes (constaté le 03/10) ; à 25 km d'altitude, la parallaxe qu'elle apportait est invisible au cadrage du jeu.
 */
export function createClouds(tex: THREE.Texture) {
  const opacity = uniform(1), drift = uniform(0);
  return {
    /** Couverture (0 → 1) au point de coordonnées sphériques `u` ; la dérive décale la lecture vers l'ouest : le motif avance vers l'est. */
    coverageAt: (u: Node<'vec2'>) => texture(tex, u.sub(vec2(drift, 0))).r.mul(opacity),
    set(o: number, d: number) { opacity.value = o; drift.value = d; },
  };
}
