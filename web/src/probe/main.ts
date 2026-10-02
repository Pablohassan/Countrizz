import * as THREE from 'three/webgpu';
import { CameraDirector } from '../camera/director';
import { FLIGHT, FOV_Y_DEG, FRAMING } from '../camera/config';
import { loadCountries } from '../data/countries';
import type { LngLat } from '../data/types';
import { toLngLat, toVec } from '../geo/vec';
import { Globe } from '../globe/globe';
import { loadPatchTexture } from '../globe/patchTexture';
import { createRenderer } from '../globe/renderer';

/** API exposée aux contrôles Playwright (e2e/). */
export interface ProbeApi {
  backend: string;
  cca3: string;
  /** Pixel écran (coin haut gauche = 0,0) d'un point du globe, `null` derrière l'horizon. */
  project(points: LngLat[]): ([number, number] | null)[];
  /** Point du globe sous un pixel écran (coordonnées continues), `null` hors du globe. */
  unproject(pixels: [number, number][]): (LngLat | null)[];
}
declare global { interface Window { __probe?: ProbeApi } }

const q = new URLSearchParams(location.search);
const width = Number(q.get('w') ?? 960), height = Number(q.get('h') ?? 600);
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const { renderer, backend } = await createRenderer(canvas, { forceWebGL: q.has('webgl'), antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(width, height);

const countries = await loadCountries('/');
const rec = countries.find((c) => c.cca3 === q.get('cca3'));
if (!rec) throw new Error(`pays inconnu : ${q.get('cca3')}`);

const globe = new Globe(q.get('mode') === 'game' ? 'game' : 'mask');
globe.setPatch(rec.patch, await loadPatchTexture(`/data/${rec.patch.sdf}`));
globe.setLook({ visible: true, reveal: 1, state: 'question', stateTime: 0 });

const director = new CameraDirector({
  viewport: { width, height, fovYDeg: FOV_Y_DEG }, framing: FRAMING, flight: FLIGHT, reducedMotion: true, start: rec.cap.center,
});
const camera = new THREE.PerspectiveCamera(FOV_Y_DEG, width / height, 0.001, 100);
void director.flyTo(rec);
globe.applyPose(director.update(0), camera);
const scene = new THREE.Scene();
scene.add(globe.root);
renderer.render(scene, camera);

const ray = new THREE.Raycaster();
const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
const hit = new THREE.Vector3();
window.__probe = {
  backend,
  cca3: rec.cca3,
  project: (points) => points.map((p) => {
    const v = new THREE.Vector3(...toVec(p));
    if (v.dot(camera.position) <= 1) return null; // derrière l'horizon (sphère unité)
    v.project(camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
  }),
  unproject: (pixels) => pixels.map(([x, y]) => {
    ray.setFromCamera(new THREE.Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), camera);
    return ray.ray.intersectSphere(sphere, hit) ? toLngLat([hit.x, hit.y, hit.z]) : null;
  }),
};
