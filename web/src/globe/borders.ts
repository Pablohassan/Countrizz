import * as THREE from 'three/webgpu';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import type { LngLat } from '../data/types';
import { toVec } from '../geo/vec';

/** Au-dessus des facettes du maillage 512×256 (flèche ≤ 1,9·10⁻⁵ rayon), sous la balise. */
export const BORDER_RADIUS = 1.0002;
const FULL = 0.55, FADE_FROM = 0.03, FADE_TO = 0.3;

/** Spec §4.3 : frontières vectorielles estompées avec l'altitude ; de près, le canal G du patch prend le relais. */
export function borderOpacity(altitude: number): number {
  const t = Math.min(1, Math.max(0, (altitude - FADE_FROM) / (FADE_TO - FADE_FROM)));
  return FULL * t * t * (3 - 2 * t);
}

export function createBorders(lines: LngLat[][]): { object: LineSegments2; setAltitude(altitude: number): void } {
  const positions: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = toVec(line[i - 1]!), b = toVec(line[i]!);
      positions.push(a[0] * BORDER_RADIUS, a[1] * BORDER_RADIUS, a[2] * BORDER_RADIUS, b[0] * BORDER_RADIUS, b[1] * BORDER_RADIUS, b[2] * BORDER_RADIUS);
    }
  }
  const material = new THREE.Line2NodeMaterial({ color: 0x000000, linewidth: 1.5, worldUnits: false, alphaToCoverage: false });
  material.transparent = true;
  const object = new LineSegments2(new LineSegmentsGeometry().setPositions(positions), material);
  return {
    object,
    setAltitude(altitude) {
      material.opacity = borderOpacity(altitude);
      object.visible = material.opacity > 0;
    },
  };
}
