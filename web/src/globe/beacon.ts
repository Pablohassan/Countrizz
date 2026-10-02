import * as THREE from 'three/webgpu';
import { abs, float, fract, max, mix, smoothstep, step, uniform, uv, vec3 } from 'three/tsl';
import { frameAltitude, type FramingParams, type Viewport } from '../camera/framing';
import type { LngLat } from '../data/types';
import { toVec } from '../geo/vec';

const EARTH_RADIUS_KM = 6371.0088;
/** Sous ≈ 20 × 20 px de terre à l'écran, le pays n'est plus lisible : la balise prend le relais (mesuré le 02/10 :
 *  TUV 8, MHL 11, FSM 12, MDV 34, SYC 44, PLW 153, TON 207 px² ; le suivant, KIR, 995). */
export const BEACON_MAX_SCREEN_PX2 = 400;
export const BEACON_SIZE_PX = 56;

/** Surface (px²) qu'occupent `areaKm2` au centre de l'image, à l'altitude donnée (approximation plane). */
export function screenAreaPx(areaKm2: number, altitude: number, v: Viewport): number {
  const kmPerPx = (2 * Math.tan((v.fovYDeg * Math.PI) / 360) * altitude * EARTH_RADIUS_KM) / v.height;
  return areaKm2 / kmPerPx ** 2;
}

export function needsBeacon(rec: { areaKm2: number; cap: { radiusDeg: number } }, v: Viewport, framing: FramingParams): boolean {
  const altitude = frameAltitude(rec.cap.radiusDeg, v, framing);
  return altitude <= framing.floor || screenAreaPx(rec.areaKm2, altitude, v) < BEACON_MAX_SCREEN_PX2;
}

/** Balise en pixels d'écran : cœur blanc, anneau jaune qui pulse, trait vertical au-dessus (spec §4.3). */
export function createBeacon(): { sprite: THREE.Sprite; setPosition(p: LngLat | null): void; setTime(seconds: number): void } {
  const time = uniform(0);
  const m = new THREE.PointsNodeMaterial({ sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false });
  m.sizeNode = float(BEACON_SIZE_PX);
  // Sur un Sprite unique, sans positionNode, les sommets du quad (±0,5 en unités monde) seraient projetés
  // puis décalés une seconde fois : rien n'apparaîtrait (constaté au prototype).
  m.positionNode = vec3(0, 0, 0);
  const p = uv().sub(0.5); // −0,5 … 0,5, y vers le haut
  const d = p.length();
  const pulse = fract(time.mul(0.8));
  const ring = smoothstep(float(0.035), float(0), abs(d.sub(mix(float(0.08), float(0.3), pulse)))).mul(pulse.oneMinus());
  const core = smoothstep(float(0.07), float(0.045), d);
  const beam = smoothstep(float(0.02), float(0), abs(p.x)).mul(step(float(0.06), p.y)).mul(p.y.mul(2).oneMinus());
  m.colorNode = mix(vec3(1.0, 0.933, 0.012), vec3(1, 1, 1), max(core, beam));
  m.opacityNode = max(max(ring, core), beam.mul(0.8));
  const sprite = new THREE.Sprite(m);
  sprite.renderOrder = 10;
  sprite.visible = false;
  return {
    sprite,
    setPosition(ll) {
      sprite.visible = ll !== null;
      if (ll) sprite.position.set(...toVec(ll)).multiplyScalar(1.0005);
    },
    setTime(seconds) { time.value = seconds; },
  };
}
