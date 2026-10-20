import { homePose } from '../camera/home';
import * as THREE from 'three/webgpu';
import { CameraDirector, type FramePose } from '../camera/director';
import { FLIGHT, FOV_Y_DEG, FRAMING } from '../camera/config';
import { loadCountries } from '../data/countries';
import type { CountryState } from '../globe/globe';
import type { LngLat } from '../data/types';
import { northUp, toLngLat, toVec } from '../geo/vec';
import { Globe } from '../globe/globe';
import { loadPatchTexture } from '../globe/patchTexture';
import { createRenderer } from '../globe/renderer';
import { loadGlobeTextures, loadReliefGrid } from '../globe/textures';
import { createImageSource, loadImageryIndex } from '../globe/imagePatch';
import { createPostProcessing, postOptions } from '../globe/postprocessing';
import { installPhysicalSky } from '../globe/physicalSky';
import { OffsetCamera } from '../globe/offsetCamera';
import { safeViewport } from '../camera/safeArea';
import { imagePatchUrl } from '../data/imagery';

/** API exposée aux contrôles Playwright (e2e/). */
export interface ProbeApi {
  backend: string;
  cca3: string | null;
  /** Pixel écran (coin haut gauche = 0,0) d'un point du globe, `null` derrière l'horizon. */
  project(points: LngLat[]): ([number, number] | null)[];
  /** Point du globe sous un pixel écran (coordonnées continues), `null` hors du globe. */
  unproject(pixels: [number, number][]): (LngLat | null)[];
  /** Fragment shader généré pour chaque objet dessiné de la scène (contrôle de l'uniformité des dérivées). */
  fragmentShaders(): Promise<{ name: string; code: string }[]>;
}
declare global { interface Window { __probe?: ProbeApi } }

/**
 * Page de sonde (dev seulement). Paramètres :
 * - `cca3` : pays cadré comme en jeu ; sinon `at=lng,lat` et `alt` : pose explicite ;
 * - `mode=game` : textures, halo, étoiles (sinon masque) ; `tier=haute` : textures 8K ; `sun=lng,lat` : soleil forcé ;
 * - `w`, `h` : taille ; `webgl` : repli WebGL 2 forcé ;
 * - `reveal`, `state`, `t` : apparence du pays (défaut : question, vague achevée) ;
 * - `borders` : frontières de vue d'ensemble ;
 * - `beacon=lng,lat` : balise ;
 * - `safe=top,bottom` : bandes occupées, px (zone libre de la Task 4 du plan 2A-4) ;
 * - `k`, `margin`, `ctx` (θ_min) : cadrage autre que celui du jeu (contrôles de précision à cadrage serré) ;
 * - `img` (avec `cca3`, mode jeu) : photo du pays, à la taille du niveau (`img`) ou forcée (`img=1024`) ; `level` : niveau de
 *   la chaîne, le plus fin par défaut ;
 * - `clouds=x` : opacité des nuages (0 par défaut), sans dérive ;
 * - `post` : post-traitement du niveau (`tier`), rendu sur `frames` images (16 par défaut : TRAA converge) ;
 * - `aa` : renderer antialiasé (canvas multi-échantillonné ; le jeu n'en a pas).
 */
const q = new URLSearchParams(location.search);
const num = (name: string, fallback: number) => (q.has(name) ? Number(q.get(name)) : fallback);
const framing = { ...FRAMING, k: num('k', FRAMING.k), margin: num('margin', FRAMING.margin), minContextDeg: num('ctx', FRAMING.minContextDeg ?? 0) };
const lngLat = (s: string | null): LngLat | null => (s ? (s.split(',').map(Number) as LngLat) : null);
const width = Number(q.get('w') ?? 960), height = Number(q.get('h') ?? 600);
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
// Sans antialias de canvas, comme le jeu (et des masques exacts au pixel) ; `aa` en force un : la passe du post-traitement ne
// doit pas hériter de ses échantillons (contrôle de post.spec).
const { renderer, backend } = await createRenderer(canvas, { forceWebGL: q.has('webgl'), antialias: q.has('aa') });
renderer.setPixelRatio(1);
renderer.setSize(width, height);

const mode = q.get('mode') === 'game' ? 'game' : 'mask';
const textures = mode === 'game' ? await loadGlobeTextures(renderer, q.get('tier') === 'haute' ? 'haute' : 'standard') : undefined;
const borders = q.has('borders') ? ((await (await fetch('/data/borders.json')).json()) as LngLat[][]) : undefined;
// atmosphère physique : WebGPU en mode jeu, sauf `atmo=approchee` (planches avant/après)
const sky = mode === 'game' && backend === 'webgpu' && q.get('atmo') !== 'approchee' ? installPhysicalSky(renderer) : null;
const globe = new Globe(mode, { textures, borders, relief: borders ? await loadReliefGrid('/') : null, sky });
const camera = new OffsetCamera(FOV_Y_DEG, width / height, 0.001, 100);

const rec = q.get('cca3') ? (await loadCountries('/')).find((c) => c.cca3 === q.get('cca3')) : undefined;
if (q.get('cca3') && !rec) throw new Error(`pays inconnu : ${q.get('cca3')}`);
let pose: FramePose;
if (rec) {
  globe.setPatch(rec.patch, await loadPatchTexture(`/data/${rec.patch.sdf}`));
  if (q.has('img') && mode === 'game') {
    const meta = (await loadImageryIndex())?.countries[rec.cca3];
    const source = createImageSource(renderer, q.get('tier') === 'haute' ? 'haute' : 'standard');
    const size = q.get('img') ? Number(q.get('img')) : source.size;
    // Photo absente (404) : on garde la texture globale, comme le jeu.
    const level = q.has('level') ? Number(q.get('level')) : (meta?.levels.length ?? 1) - 1;
    const tex = meta ? await source.load(imagePatchUrl('/', rec.cca3, level, size)).catch(() => null) : null;
    source.dispose();
    globe.setImageLevels(meta && tex ? { meta: { center: meta.center, extentRad: meta.levels[level]!.extentRad }, tex, opacity: 1 } : null, null);
  }
  globe.setLook({ visible: true, reveal: Number(q.get('reveal') ?? 1), state: (q.get('state') ?? 'question') as CountryState, stateTime: Number(q.get('t') ?? 0) });
  const director = new CameraDirector({
    viewport: { width, height, fovYDeg: FOV_Y_DEG }, framing, flight: FLIGHT, reducedMotion: true, start: rec.cap.center,
  });
  const safe = lngLat(q.get('safe'));
  if (safe) { const s = safeViewport({ width, height, fovYDeg: FOV_Y_DEG }, { top: safe[0], bottom: safe[1] }); director.setViewport(s.zone, s.axisY); }
  void director.flyTo(rec);
  pose = director.update(0);
} else if (q.has('home')) {
  // vue d'accueil « lever de Terre » (camera/home.ts)
  pose = { ...homePose({ width, height, fovYDeg: FOV_Y_DEG }), cut: false, axisY: 0 };
} else {
  const dir = toVec(lngLat(q.get('at')) ?? [0, 0]);
  pose = { dir, altitude: Number(q.get('alt') ?? 1.4), up: northUp(dir), cut: false, pitch: (Number(q.get('pitch') ?? 0) * Math.PI) / 180, axisY: 0 };
}
globe.applyPose(pose, camera);
globe.setBeacon(lngLat(q.get('beacon')));
globe.setClouds(Number(q.get('clouds') ?? 0), 0);
const sun = lngLat(q.get('sun'));
if (sun) globe.setSun(toVec(sun));
// planches de réglage (10/10) : `lever=x,y` place le soleil derrière ce pixel (lever derrière le limbe) ; `sat` : saturation
// du jour ; `bloom` : force de la lueur ; `tm=none|aces|agx|neutral` : tone mapping (le jeu : Neutral, dans le post-traitement) ; `exp` : exposition
const lever = lngLat(q.get('lever'));
if (lever) {
  camera.updateMatrixWorld(true);
  const r = new THREE.Vector3((lever[0] / width) * 2 - 1, 1 - (lever[1] / height) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
  globe.setSun([r.x, r.y, r.z]);
}
if (q.has('sat')) globe.setDaySaturation(Number(q.get('sat')));
const TONE: Record<string, THREE.ToneMapping> = { none: THREE.NoToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };
const tone = TONE[q.get('tm') ?? ''];
if (tone !== undefined) renderer.toneMapping = tone;   // sans `post`
if (q.has('exp')) renderer.toneMappingExposure = Number(q.get('exp'));
const scene = new THREE.Scene();
scene.add(globe.root);
// atmosphère physique : ses tables se calculent après le premier rendu qui les lit (physicalSky.ts) ; on les attend
if (sky) { renderer.render(scene, camera); await sky.ready(); }
if (q.has('post')) {
  const o = postOptions(q.get('tier') === 'haute' ? 'haute' : 'standard');
  if (q.has('bloom')) o.bloom = { ...o.bloom, strength: Number(q.get('bloom')) };
  if (tone !== undefined) o.toneMapping = tone;
  const post = createPostProcessing(renderer, scene, camera, o);
  for (let i = 0, n = Number(q.get('frames') ?? 16); i < n; i++) {
    post.render();
    await new Promise((r) => requestAnimationFrame(r));
  }
} else {
  renderer.render(scene, camera);
}

const ray = new THREE.Raycaster();
const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
const hit = new THREE.Vector3();
window.__probe = {
  backend,
  cca3: rec?.cca3 ?? null,
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
  fragmentShaders: async () => {
    const drawn: THREE.Object3D[] = [];
    scene.traverse((o) => { if ((o as THREE.Mesh).material) drawn.push(o); });
    return Promise.all(drawn.map(async (o) => ({
      name: `${o.type} ${(o as THREE.Mesh).geometry?.type ?? ''}`.trim(),
      code: (await renderer.debug.getShaderAsync(scene, camera, o)).fragmentShader ?? '',
    })));
  },
};
