/**
 * avion-socle.js — socle commun des prototypes « avion en papier 3D » de l'écran d'accueil G5 · Escales.
 *
 * Recrée EXACTEMENT la caméra et le soleil avec lesquels `acc-16.jpg` a été rendue, pour qu'un objet 3D posé sur la
 * sphère tombe au pixel près sur la capture affichée dans le téléphone (fragment G5, `.d5 .globe` :
 * `background: url(acc-16.jpg) center 400px / 390px 844px`).
 *
 * Source de vérité : la page de sonde du jeu,
 *   probe.html?mode=game&w=780&h=1688&borders&post&at=10,20&alt=1.6&clouds=1
 * et le code qu'elle appelle (web/src/probe/main.ts, geo/vec.ts, camera/sun.ts, camera/config.ts, globe/globe.ts) :
 *   - Terre = sphère unité centrée à l'origine ; toVec : lng 0 → +X, lng +90 → −Z, pôle Nord → +Y (vec.ts) ;
 *   - pose explicite : dir = toVec(at), up = northUp(dir) (nord en haut, est à droite), altitude alt (rayons terrestres) ;
 *   - caméra : PerspectiveCamera(FOV_Y_DEG = 50, 780/1688), position dir·(1 + alt), lookAt(0,0,0),
 *     near = max(alt·0,2 ; 1e-5) = 0,32, far = 1 + alt + 60 (Globe.applyPose) ;
 *   - soleil : pas de `sun=` dans l'URL → sunDirection(pose, 55°) (sun.ts) : à 55° du point visé, vers le haut-gauche
 *     de l'image ; DirectionalLight(0xffffff, 3) en sun·10, AmbientLight 0,04 (globe.ts).
 *   - la capture (780×1688 px) est affichée à 390×844 px CSS et descendue de 400 px : la caméra reçoit
 *     setViewOffset(390, 844, 0, −400, 390, 844) sur une base CSS 390×844 (offsetY négatif = la vue montre ce qui est
 *     AU-DESSUS du haut de l'image : PerspectiveCamera.updateProjectionMatrix fait `top -= offsetY · height / fullHeight`).
 *
 * ─── API ──────────────────────────────────────────────────────────────────────────────────────────────────────────
 *   import { createStage } from '/files/avion-socle.js';   // importmap : three@0.186.1
 *
 *   const stage = createStage(canvas, { cssWidth = 390, cssHeight = 844, dpr = Math.min(3, devicePixelRatio),
 *                                       offsetY = 400, toneMapping = 'neutral', shadowMapSize = 2048 });
 *   → {
 *     THREE,                      // le module three utilisé (même instance que la scène)
 *     renderer,                   // WebGLRenderer alpha transparent (clear 0,0), sRGB, Neutral, ombres PCF
 *     scene, camera,              // caméra posée comme la sonde + décalage CSS
 *     sunDir,                     // Vector3 unitaire, monde, VERS le soleil
 *     lights: { sun, hemi },      // DirectionalLight (intensité 3, ombre serrée sur l'Europe) + HemisphereLight douce
 *     toVec(lng, lat, r = 1),     // → Vector3 (conventions du jeu)
 *     lngLat(vec3),               // → [lng, lat]
 *     slerpPath(a, b, t, altitude = 0),          // a, b : [lng, lat] (ou Vector3) → point du grand cercle à r = 1 + altitude
 *     pathFrame(a, b, t, altitude = 0),          // → { position, forward, up, right } : repère de vol (forward = sens a→b,
 *                                                //   up = verticale locale, right = forward × up)
 *     shadowCatcher,              // Mesh sphère r = 1, ShadowMaterial, receiveShadow — à ajouter (scene.add) ou non.
 *                                 //   Transparent, donc dessiné APRÈS les opaques : il ne cache rien.
 *     globeOccluder,              // Mesh sphère r = 0,9995, profondeur seule (colorWrite false, renderOrder −1) : cache ce
 *                                 //   qui passe derrière la Terre ou sous sa surface — à ajouter ou non
 *     project(vec3),              // → [x, y] px CSS dans le téléphone (mêmes coordonnées que pins.json / le fragment)
 *     visible(vec3),              // false si la Terre (sphère unité) cache le point
 *     frozenT,                    // instant figé (0..1) : data-t du canvas, sinon ?t= de la page hôte ; sinon null
 *     loop(update, { period = 6.5 }),   // boucle : update(t ∈ [0,1), secondes) puis rendu ; figée si frozenT ≠ null
 *     render(), resize({ cssWidth, cssHeight, dpr, offsetY }),
 *     capture: CAPTURE, pose: { dir, up, position },
 *   }
 *   Quand la première image est rendue, le canvas reçoit `data-ready="1"` (attente Playwright : `canvas[data-ready]`).
 *
 * ─── Portage vers le jeu (WebGPURenderer + TSL) ───────────────────────────────────────────────────────────────────
 *   - n'employer que des matériaux à équivalent nodal (MeshStandard/Physical/Toon/Basic, ShadowMaterial) : three/webgpu
 *     les convertit (MeshStandardNodeMaterial…). Pas d'onBeforeCompile ni de ShaderMaterial GLSL : ils ne se portent pas.
 *   - le jeu sort SANS tone mapping (postprocessing.ts : NoToneMapping, bloom sur l'émissif seulement) ; ici Neutral
 *     (Khronos) laisse les couleurs < 0,76 intactes : #6225e6 et le crème restent justes, seules les hautes lumières
 *     sont compressées. En jeu, l'avion serait dans la scène du globe : la Terre (earth.receiveShadow) remplacerait
 *     le shadowCatcher, et l'ombre passerait par le nœud d'ombre du DirectionalLight du Globe (même direction).
 *   - three r186 a retiré PCFSoftShadowMap (WebGLShadowMap le remplace par PCFShadowMap avec un avertissement) : on
 *     prend PCFShadowMap, dont `shadow.radius` règle le flou (disque de Vogel, 5 prises filtrées).
 *   - setViewOffset existe à l'identique sur la caméra du jeu ; near/far sont ceux de Globe.applyPose.
 */
import * as THREE from 'three';

/** Paramètres de la capture acc-16.jpg (sonde : at=10,20, alt=1.6, w=780, h=1688) et de son affichage dans le téléphone. */
export const CAPTURE = Object.freeze({
  file: 'acc-16.jpg',
  width: 780, height: 1688,          // pixels de la capture
  displayWidth: 390, displayHeight: 844, // taille CSS de l'image dans le fragment (background-size)
  offsetY: 400,                      // background-position: center 400px
  at: [10, 20], alt: 1.6,            // pose explicite de la sonde
  fovYDeg: 50,                       // camera/config.ts FOV_Y_DEG
  sunAngleDeg: 55,                   // camera/sun.ts sunDirection(pose, angleDeg = 55)
  sunIntensity: 3, ambientIntensity: 0.04, // globe.ts
});

/** Zone de l'ombre portée : calotte centrée sur l'Europe (Rabat → Helsinki → Le Caire), demi-largeur en unités monde. */
export const SHADOW_ZONE = Object.freeze({ center: [12, 45], halfSize: 0.45 });

const RAD = Math.PI / 180;

/** lng/lat (degrés) → Vector3 (vec.ts toVec) : lng 0 → +X, lng +90 → −Z, pôle Nord → +Y. */
export function toVec(lng, lat, r = 1, out = new THREE.Vector3()) {
  const l = lng * RAD, p = lat * RAD;
  return out.set(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l));
}

/** Vector3 → [lng, lat] (vec.ts toLngLat). */
export function lngLat(v) {
  const n = v.clone().normalize();
  return [Math.atan2(-n.z, n.x) / RAD, Math.asin(Math.max(-1, Math.min(1, n.y))) / RAD];
}

/** « Nord en haut » (vec.ts northUp) : l'axe des pôles projeté sur le plan tangent en `dir`. */
export function northUp(dir) {
  const u = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y);
  return u.length() < 1e-12 ? new THREE.Vector3(0, 0, -1) : u.normalize();
}

/** Soleil (sun.ts sunDirection) : à `angleDeg` du point visé, venant du haut à gauche de l'image. */
export function sunDirection(dir, up, angleDeg = CAPTURE.sunAngleDeg) {
  const right = new THREE.Vector3().crossVectors(up, dir); // droite de l'image (caméra en dir·(1+h) regardant l'origine)
  const towardUpLeft = up.clone().sub(right).normalize();
  const a = angleDeg * RAD;
  return dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(towardUpLeft, Math.sin(a)).normalize();
}

const asUnit = (p) => (p && p.isVector3 ? p.clone().normalize() : toVec(p[0], p[1]));

/** Point du grand cercle a→b (plus court chemin) à l'instant t ∈ [0, 1], au rayon 1 + altitude. */
export function slerpPath(a, b, t, altitude = 0, out = new THREE.Vector3()) {
  const A = asUnit(a), B = asUnit(b);
  const omega = Math.atan2(new THREE.Vector3().crossVectors(A, B).length(), A.dot(B));
  if (omega < 1e-12) return out.copy(A).multiplyScalar(1 + altitude);
  const s = Math.sin(omega);
  return out.copy(A).multiplyScalar(Math.sin((1 - t) * omega) / s)
    .addScaledVector(B, Math.sin(t * omega) / s)
    .multiplyScalar(1 + altitude);
}

/** Repère de vol sur le grand cercle : forward (sens a→b, tangent), up (verticale locale), right = forward × up. */
export function pathFrame(a, b, t, altitude = 0) {
  const A = asUnit(a), B = asUnit(b);
  const position = slerpPath(A, B, t, altitude);
  const up = position.clone().normalize();
  const axis = new THREE.Vector3().crossVectors(A, B);
  if (axis.lengthSq() < 1e-24) axis.crossVectors(A, Math.abs(A.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
  axis.normalize();
  const forward = new THREE.Vector3().crossVectors(axis, up).normalize(); // d/dt (rotation autour de A×B)
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  return { position, forward, up, right };
}

/** Caméra de la sonde (pose at/alt de CAPTURE) + décalage d'affichage ; utilisable sans renderer (tests). */
export function createCamera({ cssWidth = CAPTURE.displayWidth, cssHeight = CAPTURE.displayHeight, offsetY = CAPTURE.offsetY } = {}) {
  const dir = toVec(CAPTURE.at[0], CAPTURE.at[1]);
  const up = northUp(dir);
  const d = 1 + CAPTURE.alt;
  const camera = new THREE.PerspectiveCamera(CAPTURE.fovYDeg, CAPTURE.width / CAPTURE.height, Math.max(CAPTURE.alt * 0.2, 1e-5), d + 60);
  camera.position.copy(dir).multiplyScalar(d);
  camera.up.copy(up);
  camera.lookAt(0, 0, 0);
  const applyView = (w, h, oy) => {
    // Base CSS : l'image entière fait displayWidth × displayHeight ; le canvas (w × h) commence (displayWidth − w)/2 px à
    // gauche de l'image (centrée) et oy px au-dessus de son bord haut. aspect = 390/844 = 780/1688 (setViewOffset le pose).
    camera.setViewOffset(CAPTURE.displayWidth, CAPTURE.displayHeight, -(w - CAPTURE.displayWidth) / 2, -oy, w, h);
    camera.updateMatrixWorld(true);
  };
  applyView(cssWidth, cssHeight, offsetY);
  return { camera, dir, up, applyView };
}

/** Instant figé : data-t du canvas (le plus local), sinon ?t= de la page hôte ; null si absent ou invalide. */
function readFrozenT(canvas) {
  const raw = canvas?.dataset?.t ?? (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('t') : null);
  if (raw === null || raw === undefined || raw === '') return null;
  const t = Number(raw);
  return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : null;
}

const TONE = { neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping, none: THREE.NoToneMapping };

export function createStage(canvas, {
  cssWidth = CAPTURE.displayWidth,
  cssHeight = CAPTURE.displayHeight,
  dpr = Math.min(3, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1),
  offsetY = CAPTURE.offsetY,
  toneMapping = 'neutral',
  shadowMapSize = 2048,
} = {}) {
  const size = { cssWidth, cssHeight, dpr, offsetY };

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE[toneMapping] ?? THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap retiré en r186 ; flou via shadow.radius

  const scene = new THREE.Scene();
  const { camera, dir, up, applyView } = createCamera(size);
  const sunDir = sunDirection(dir, up);

  // Soleil : même direction et même intensité que la DirectionalLight du globe (3 ≈ π : un blanc face au soleil
  // ressort à ~95 % de son albédo, BRDF de Lambert = albédo/π). Ombre orthographique serrée autour de l'Europe.
  const sun = new THREE.DirectionalLight(0xffffff, CAPTURE.sunIntensity);
  const zoneCenter = toVec(SHADOW_ZONE.center[0], SHADOW_ZONE.center[1]);
  sun.target.position.copy(zoneCenter);
  sun.position.copy(zoneCenter).addScaledVector(sunDir, 2);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_ZONE.halfSize; sc.right = SHADOW_ZONE.halfSize;
  sc.top = SHADOW_ZONE.halfSize; sc.bottom = -SHADOW_ZONE.halfSize;
  sc.near = 1.2; sc.far = 2.8; // la calotte et 0,3 d'altitude tiennent dans ±0,8 autour du centre
  sc.updateProjectionMatrix();
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.0004;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  // Lumière d'ambiance douce : le globe n'a qu'une AmbientLight 0,04 (son côté jour est porté par le soleil et un voile
  // atmosphérique bleu). Pour un petit objet au-dessus de l'Europe, on prend une lumière hémisphérique : ciel blanc
  // bleuté au-dessus, renvoi de la Terre (bleu-gris, albédo terrestre) au-dessous ; zénith = verticale de la zone.
  // Remplissage ≈ intensité/π de l'albédo : 0,9 → ~29 % côté ombre.
  const hemi = new THREE.HemisphereLight(0xe3ecff, 0x8ea3c2, 0.9);
  hemi.position.copy(zoneCenter);
  scene.add(hemi);

  // Récepteur d'ombre : sphère unité transparente, n'affiche que l'ombre portée. Transparent → dessiné après les
  // opaques : il n'occulte rien (essai du 04/10 : les anneaux arrière traversaient le globe).
  const shadowCatcher = new THREE.Mesh(
    new THREE.SphereGeometry(1, 384, 192),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.38 }),
  );
  shadowCatcher.receiveShadow = true;
  shadowCatcher.name = 'shadowCatcher';

  // Occulteur : profondeur seule, dessiné en premier, juste sous la surface (0,9995 : la flèche des facettes, < 3e-4 à
  // 128×64, le garde sous le récepteur) — cache ce qui est derrière la Terre ou enfoncé dans le sol.
  const globeOccluder = new THREE.Mesh(
    new THREE.SphereGeometry(0.9995, 128, 64),
    new THREE.MeshBasicMaterial({ colorWrite: false }),
  );
  globeOccluder.renderOrder = -1;
  globeOccluder.name = 'globeOccluder';

  const resize = (next = {}) => {
    Object.assign(size, Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)));
    renderer.setPixelRatio(size.dpr);
    renderer.setSize(size.cssWidth, size.cssHeight); // fixe aussi le style CSS du canvas
    applyView(size.cssWidth, size.cssHeight, size.offsetY);
  };
  resize();

  const ndc = new THREE.Vector3();
  const project = (v) => {
    ndc.copy(v).project(camera);
    return [((ndc.x + 1) / 2) * size.cssWidth, ((1 - ndc.y) / 2) * size.cssHeight];
  };

  // Caché si le segment caméra → point traverse la sphère unité avant d'arriver au point.
  const seg = new THREE.Vector3();
  const visible = (v) => {
    const c = camera.position;
    seg.subVectors(v, c);
    const A = seg.dot(seg), B = 2 * c.dot(seg), C = c.dot(c) - 1;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) return true;
    const t0 = (-B - Math.sqrt(disc)) / (2 * A);
    return !(t0 > 0 && t0 < 1 - 1e-6);
  };

  const render = () => {
    renderer.render(scene, camera);
    if (!canvas.dataset.ready) canvas.dataset.ready = '1';
  };

  const frozenT = readFrozenT(canvas);
  const loop = (update, { period = 6.5 } = {}) => {
    if (frozenT !== null) { update(frozenT, frozenT * period); render(); return () => {}; }
    let raf = 0, t0 = null;
    const frame = (now) => {
      t0 ??= now; // origine à la première image : l'horodatage du rAF peut précéder performance.now() (t < 0 sinon)
      const s = (now - t0) / 1000;
      update((s / period) % 1, s);
      render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  };

  return {
    THREE, renderer, scene, camera, sunDir, lights: { sun, hemi },
    toVec: (lng, lat, r = 1) => toVec(lng, lat, r),
    lngLat, slerpPath, pathFrame, shadowCatcher, globeOccluder, project, visible, frozenT, loop, render, resize,
    capture: CAPTURE, pose: { dir, up, position: camera.position.clone() },
  };
}
