/**
 * globe-chargement.js — petite Terre cartoon 3D de l'écran de chargement (demande de l'utilisateur, 05/10, session cloud) :
 * « une Terre représentée en 3D en mode cartoon, avec des reliefs exagérés et des points surdimensionnés par rapport à
 * l'échelle, qui tourne pendant le chargement ».
 *
 *   import { mount } from '/files/globe-chargement.js';
 *   const g = await mount(canvas, { relief: '/files/relief-360.png' });
 *   g.dispose();
 *
 * Doit s'afficher AVANT le vrai globe : donc léger et autonome. Une carte de 360 × 180 px (49 Ko) porte l'élévation (R)
 * et le masque d'eau (G) ; tout le reste est procédural. Icosaèdre subdivisé, sommets déplacés selon l'élévation (× 20
 * environ : l'Himalaya monte à 24 % du rayon), aplats toon à 3 tons en facettes, contour noir par coque inversée (comme
 * l'avion A2), épingles géantes sur quelques capitales, trois nuages en boules qui tournent autour.
 * Données : earth-topology.png et earth-water.png du paquet npm three-globe (MIT), dérivés de NASA Blue Marble
 * (domaine public).
 */
import * as THREE from 'three';

const RAD = Math.PI / 180;
const toVec = (lng, lat, r = 1) => new THREE.Vector3(
  r * Math.cos(lat * RAD) * Math.cos(lng * RAD), r * Math.sin(lat * RAD), -r * Math.cos(lat * RAD) * Math.sin(lng * RAD));

export const REGLAGES = Object.freeze({
  detail: 6,                 // icosaèdre : 81 920 facettes
  exageration: 0.24,         // hauteur du plus haut sommet (rayon = 1)
  socle: 0.016,              // les terres basses dépassent un peu de l'océan
  vitesse: 0.32,             // rad/s
  inclinaison: 23.4,
  epingles: [                // [lng, lat, couleur de la tête]
    [2.35, 48.86, 0xf7dc6f], [-6.84, 34.02, 0xe8413a], [-3.7, 40.42, 0x6225e6], [23.73, 37.98, 0x2fbf4a],
    [139.69, 35.69, 0xe8413a], [-47.88, -15.79, 0x2fbf4a], [36.82, -1.29, 0xf7dc6f], [-77.04, 38.9, 0x6225e6],
    [116.4, 39.9, 0xf7dc6f], [149.13, -35.28, 0x6225e6], [-99.13, 19.43, 0xe8413a], [31.24, 30.04, 0x2fbf4a],
  ],
});

/** Couleurs par altitude (sRGB) : océan, plage, plaine, colline, montagne, neige. */
const C = {
  ocean: 0x2f7fe0, plage: 0xf2d98a, plaine: 0x6cc85a, colline: 0x3f9e4a, montagne: 0xa77a4f, roche: 0x8a6a4c, neige: 0xfff8e7,
};

function lireRelief(url) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      ok({ w: img.width, h: img.height, data: g.getImageData(0, 0, img.width, img.height).data });
    };
    img.onerror = ko;
    img.src = url;
  });
}

/** Échantillon bilinéaire du canal `ch` (0 = élévation, 1 = eau) en lng/lat. */
function echantillon(r, lng, lat, ch) {
  const x = ((lng + 180) / 360) * r.w - 0.5, y = ((90 - lat) / 180) * r.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.max(0, Math.min(r.h - 1, Math.floor(y)));
  const y1 = Math.min(r.h - 1, y0 + 1), fx = x - x0, fy = Math.max(0, Math.min(1, y - y0));
  const px = (xx, yy) => r.data[(yy * r.w + (((xx % r.w) + r.w) % r.w)) * 4 + ch] / 255;
  const a = px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx;
  const b = px(x0, y1) * (1 - fx) + px(x0 + 1, y1) * fx;
  return a * (1 - fy) + b * fy;
}

function carteToon() {
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export async function mount(canvas, { relief, reglages = {} } = {}) {
  const R = { ...REGLAGES, ...reglages };
  const rel = await lireRelief(relief);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0.35, 5.2);
  camera.lookAt(0, 0, 0);
  const jetables = [];
  const garde = (x) => (jetables.push(x), x);

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3060, 1.1));
  const soleil = new THREE.DirectionalLight(0xfff4e0, 2.4);
  soleil.position.set(-3, 2.5, 4);
  scene.add(soleil);
  const grad = garde(carteToon());

  // ── Terre ──
  const geo = garde(new THREE.IcosahedronGeometry(1, R.detail));
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3(), m = new THREE.Vector3(), c = new THREE.Color();
  const tons = Object.fromEntries(Object.entries(C).map(([k, x]) => [k, new THREE.Color(x)]));
  const lngLat = (p) => [Math.atan2(-p.z, p.x) / RAD, Math.asin(Math.max(-1, Math.min(1, p.y))) / RAD];
  // Couleur PAR FACETTE (au centre de la face) : aplats nets, pas de dégradé entre sommets.
  for (let f = 0; f < pos.count; f += 3) {
    m.set(0, 0, 0);
    for (let k = 0; k < 3; k++) m.add(v.fromBufferAttribute(pos, f + k));
    const [lng, lat] = lngLat(m.normalize());
    const eau = echantillon(rel, lng, lat, 1) > 0.5, e = echantillon(rel, lng, lat, 0);
    if (eau) c.copy(tons.ocean);
    else c.copy(Math.abs(lat) > 62 || e > 0.5 ? tons.neige : e > 0.32 ? tons.roche : e > 0.17 ? tons.montagne : e > 0.06 ? tons.colline : e > 0.01 ? tons.plaine : tons.plage);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
  }
  // Hauteur PAR SOMMET (même échantillon pour un sommet partagé : pas de fissure entre facettes).
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const [lng, lat] = lngLat(v);
    const eau = echantillon(rel, lng, lat, 1) > 0.5;
    const h = eau ? 0 : R.socle + Math.pow(echantillon(rel, lng, lat, 0), 1.1) * R.exageration;
    v.multiplyScalar(1 + h);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const terre = new THREE.Mesh(geo, garde(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad, flatShading: true })));
  const contour = new THREE.Mesh(geo, garde(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })));
  contour.scale.setScalar(1.018);
  // halo bleu derrière le contour : sur le fond noir de l'espace, le trait noir ne se verrait pas sans lui
  const halo = new THREE.Mesh(garde(new THREE.SphereGeometry(1, 64, 32)),
    garde(new THREE.MeshBasicMaterial({ color: 0x9fd6ff, side: THREE.BackSide, transparent: true, opacity: 0.85 })));
  halo.scale.setScalar(1.075);
  scene.add(halo);

  const monde = new THREE.Group();
  monde.add(terre, contour);

  // ── épingles géantes ──
  const geoAiguille = garde(new THREE.CylinderGeometry(0.012, 0.012, 1, 8));
  geoAiguille.translate(0, 0.5, 0);
  const geoTete = garde(new THREE.SphereGeometry(1, 20, 14));
  const matAiguille = garde(new THREE.MeshToonMaterial({ color: 0xfff8e7, gradientMap: grad }));
  const matNoir = garde(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
  const haut = new THREE.Vector3(0, 1, 0);
  for (const [lng, lat, couleur] of R.epingles) {
    const dir = toVec(lng, lat).normalize();
    const e = rel ? echantillon(rel, lng, lat, 0) : 0;
    const sol = 1 + R.socle + Math.pow(e, 1.1) * R.exageration;
    const epingle = new THREE.Group();
    const longueur = 0.26, rayon = 0.055;
    const aiguille = new THREE.Mesh(geoAiguille, matAiguille);
    aiguille.scale.set(1, longueur, 1);
    const aiguilleC = new THREE.Mesh(geoAiguille, matNoir);
    aiguilleC.scale.set(1.9, longueur, 1.9);
    const tete = new THREE.Mesh(geoTete, garde(new THREE.MeshToonMaterial({ color: couleur, gradientMap: grad })));
    tete.position.y = longueur; tete.scale.setScalar(rayon);
    const teteC = new THREE.Mesh(geoTete, matNoir);
    teteC.position.y = longueur; teteC.scale.setScalar(rayon * 1.16);
    const reflet = new THREE.Mesh(geoTete, garde(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })));
    reflet.position.set(-0.018, longueur + 0.025, 0.03); reflet.scale.setScalar(0.014);
    epingle.add(aiguille, aiguilleC, tete, teteC, reflet);
    epingle.position.copy(dir).multiplyScalar(sol - 0.01);
    epingle.quaternion.setFromUnitVectors(haut, dir);
    monde.add(epingle);
  }

  // ── nuages en boules ──
  const matNuage = garde(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad }));
  const nuages = [];
  for (const [lng, lat, s] of [[-30, 25, 1], [70, -10, 0.8], [160, 45, 0.9], [-120, -30, 0.75]]) {
    const n = new THREE.Group();
    for (const [x, y, z, r] of [[0, 0, 0, 0.09], [0.09, -0.01, 0.01, 0.065], [-0.09, -0.015, 0, 0.06], [0.03, 0.05, 0, 0.06]]) {
      const b = new THREE.Mesh(geoTete, matNuage); b.position.set(x, y, z); b.scale.setScalar(r);
      const bc = new THREE.Mesh(geoTete, matNoir); bc.position.set(x, y, z); bc.scale.setScalar(r * 1.12);
      n.add(b, bc);
    }
    const dir = toVec(lng, lat).normalize();
    n.position.copy(dir).multiplyScalar(1.32);
    n.quaternion.setFromUnitVectors(haut, dir);
    n.scale.setScalar(s);
    const pivot = new THREE.Group(); pivot.add(n);
    nuages.push(pivot);
    monde.add(pivot);
  }

  const axe = new THREE.Group();
  axe.rotation.z = -R.inclinaison * RAD;
  axe.add(monde);
  scene.add(axe);

  const taille = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  taille();
  const ro = new ResizeObserver(taille); ro.observe(canvas);

  const reduit = matchMedia('(prefers-reduced-motion: reduce)');
  let raf = 0, t0 = null, fini = false;
  const image = (now) => {
    if (fini) return;
    t0 ??= now;
    const s = reduit.matches ? 0 : (now - t0) / 1000;
    monde.rotation.y = -1.83 + s * R.vitesse; // départ : lng 15° face à la caméra (θ = −90° − 15°)
    nuages.forEach((p, i) => { p.rotation.y = s * (0.12 + i * 0.03); });
    renderer.render(scene, camera);
    if (!canvas.dataset.ready) canvas.dataset.ready = '1';
    raf = requestAnimationFrame(image);
  };
  raf = requestAnimationFrame(image);

  return {
    dispose() {
      fini = true; cancelAnimationFrame(raf); ro.disconnect();
      for (const x of jetables) x.dispose?.();
      renderer.dispose();
    },
  };
}
