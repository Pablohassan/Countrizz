import * as THREE from 'three/webgpu';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import type { LngLat } from '../data/types';
import { angleBetween, normalize, toVec, type Vec3 } from '../geo/vec';
import { BlendedLineMaterial } from './lines';
import { liftAt } from './relief';

/** Au-dessus des facettes du maillage 512×256 (flèche ≤ 1,9·10⁻⁵ rayon), sous la balise. */
export const BORDER_RADIUS = 1.0002;
/**
 * Relief soulevé (spec océan §2.4) : les frontières montent avec la surface. Segments découpés tous les 0,35° au plus
 * (la moitié du pas du maillage) pour ne pas couper sous une crête ; marge en plus sur les reliefs, où maillage et ligne
 * interpolent différemment entre leurs sommets (pas en mer : la ligne de côte resterait collée au sol).
 */
export const BORDER_STEP_RAD = (0.35 * Math.PI) / 180;
export const BORDER_LIFT_MARGIN = 0.0004;
const FULL = 0.55, FADE_FROM = 0.03, FADE_TO = 0.3;

/** Grille d'altitudes (public/textures/relief-512.png, ligne 0 au nord) pour soulever les frontières. */
export interface ReliefGrid { data: Uint8Array; width: number; height: number }

/** Spec §4.3 : frontières vectorielles estompées avec l'altitude ; de près, le canal G du patch prend le relais. */
export function borderOpacity(altitude: number): number {
  const t = Math.min(1, Math.max(0, (altitude - FADE_FROM) / (FADE_TO - FADE_FROM)));
  return FULL * t * t * (3 - 2 * t);
}

/** Points d'un segment de grand cercle, `a` exclu, `b` inclus, espacés de BORDER_STEP_RAD au plus. */
function along(a: Vec3, b: Vec3): Vec3[] {
  const n = Math.max(1, Math.ceil(angleBetween(a, b) / BORDER_STEP_RAD));
  const out: Vec3[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    out.push(normalize([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
  }
  return out;
}

/**
 * Rayon d'un point de frontière : au-dessus du sol plat, soulevé avec le relief pleinement. Là où le relief s'efface (caméra
 * sous 0,08, relief.ts), les frontières sont déjà presque transparentes (borderOpacity) et nulles sous 0,03.
 */
export function borderRadius(d: Vec3, relief: ReliefGrid | null): number {
  if (!relief) return BORDER_RADIUS;
  const h = liftAt(relief.data, relief.width, relief.height, d);
  return BORDER_RADIUS + h + BORDER_LIFT_MARGIN * Math.min(1, h / 0.001);
}

/** Positions des segments (x, y, z deux à deux), découpés et soulevés. */
export function borderPositions(lines: LngLat[][], relief: ReliefGrid | null): number[] {
  const positions: number[] = [];
  const put = (d: Vec3) => { const r = borderRadius(d, relief); positions.push(d[0] * r, d[1] * r, d[2] * r); };
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      let prev = toVec(line[i - 1]!);
      for (const p of along(prev, toVec(line[i]!))) { put(prev); put(p); prev = p; }
    }
  }
  return positions;
}

export function createBorders(lines: LngLat[][], relief: ReliefGrid | null = null): { object: LineSegments2; setAltitude(altitude: number): void } {
  // mélange par le GPU, sans la copie de l'écran de Line2NodeMaterial (lines.ts)
  const material = new BlendedLineMaterial({ color: 0x000000, linewidth: 1.5, worldUnits: false, alphaToCoverage: false });
  const object = new LineSegments2(new LineSegmentsGeometry().setPositions(borderPositions(lines, relief)), material);
  return {
    object,
    setAltitude(altitude) {
      material.opacity = borderOpacity(altitude);
      object.visible = material.opacity > 0;
    },
  };
}
