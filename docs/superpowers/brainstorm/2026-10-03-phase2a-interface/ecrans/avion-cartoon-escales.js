/**
 * avion-cartoon-escales.js — avion A2 (cartoon premium, dosage E2) de l'écran d'accueil G5 : le tour du monde en boucle.
 *
 *   import { mount } from '/files/avion-cartoon-escales.js';
 *   const vol = mount(canvas, { etiquettes: [elRabat, elMadrid, elParis, elAthenes], t });
 *   vol.dispose();
 *
 * Demandes de l'utilisateur (05/10, session cloud) :
 *   - A2 retenu, dosage E2 : à chaque escale, la quille prend la couleur principale du drapeau et une bande au bord de
 *     fuite la seconde (France : quille bleue, ailes crème, bande rouge) ; avion réduit de 30 %, vol ralenti de 30 % ;
 *   - aucun nom affiché au départ ; chaque fois que l'avion passe une escale, la bulle « Pays · Capitale » apparaît, avec
 *     un petit point vert discret (bonne réponse) ;
 *   - après la Grèce, l'avion continue vers la droite, fait le tour du globe par derrière et revient vers Rabat par la
 *     gauche : une boucle.
 *
 * Trajet : une courbe FERMÉE lisse sur la sphère (Catmull-Rom périodique sur les vecteurs unitaires, renormalisée) par
 * Rabat → Madrid → Paris → Athènes → Proche-Orient → Asie → Pacifique → Amériques → Atlantique → Rabat. Passages en
 * rase-mottes au-dessus des quatre escales, croisière un peu plus haut ailleurs. Vitesse : celle du vol précédent de Rabat
 * à Athènes ; il prend de l'élan en quittant la Grèce (et arrive vite par la gauche avant de ralentir sur Rabat) ; caché (derrière le globe ou hors du téléphone), il file pour revenir en ≈ 2,4 s. La boucle
 * commence au milieu de la partie cachée : à l'ouverture, ni avion ni nom, puis l'avion arrive par la gauche.
 * Couleurs : il revient de derrière aux couleurs grecques, prend celles du Maroc au-dessus de Rabat, puis de l'Espagne, de
 * la France et de la Grèce (≈ 0,4 s, léger gonflement). Les bulles et les perles de la traînée s'effacent quand l'avion
 * quitte l'écran.
 *
 * Le reste vient d'A2 (avion-cartoon.js) : papier bicolore, aplats toon à 3 tons et leurs seuils, éclairage cartoon,
 * contour en lignes épaisses, ombre portée, perles. L'occulteur du socle cache l'avion derrière la Terre.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createStage, toVec } from './avion-socle.js';
import { SEUILS } from './avion-cartoon.js';

const RAD = Math.PI / 180;
const ATHENES = [23.73, 37.98];

/** Escales : a = couleur principale (quille, dessous), b = seconde (bande au bord de fuite). */
export const ESCALES = Object.freeze([
  { cca3: 'MAR', lieu: [-6.84, 34.02], a: 0xc1272d, b: 0x006233 },
  { cca3: 'ESP', lieu: [-3.70, 40.42], a: 0xc60b1e, b: 0xffc400 },
  { cca3: 'FRA', lieu: [2.35, 48.86], a: 0x002395, b: 0xed2939 },
  { cca3: 'GRC', lieu: ATHENES, a: 0x0d5eaf, b: 0x0d5eaf },
]);
/** Tour du monde après Athènes (lng, lat) : vers l'est, par derrière le globe, retour par l'Atlantique. */
const TOUR = [[46, 36], [80, 32], [125, 26], [175, 20], [-130, 20], [-85, 25], [-48, 30], [-24, 33]];

export const REGLAGES = Object.freeze({
  vitesse: 0.043,           // rad/s à l'écran : celle du vol précédent (Rabat → Athènes, ≈ 0,57 rad en ≈ 13,2 s)
  retour: 2.4,              // s passées hors de l'écran
  elan: { gain: 2.2, sur: 0.12 }, // hors de Rabat → Athènes : jusqu'à × (1 + gain), atteint à `sur` rad de l'escale
                            // (près du bord du globe la perspective écrase le mouvement : sans élan, il s'y traîne)
  longueur: 0.0525,         // A2 (0,09) → 0,075 → réduit de 30 % : ≈ 27 px
  altCroisiere: 0.034,
  altPassage: 0.025,        // rase-mottes au-dessus des escales
  creux: 0.07,              // rad : demi-largeur du creux d'altitude autour d'une escale
  inclinaisonMax: 40,
  roulisBase: -25,          // degrés : montre la quille à la caméra
  bande: 0.8,               // la bande commence à 80 % de la corde
  morph: [-0.1, 0.4],       // s : fenêtre du changement de couleur autour du passage
  gonfle: 0.06,
  bulles: 0.25,             // s : les bulles s'effacent ce délai après la sortie de l'écran
  perles: { pas: 0.0146, rayon: 0.0029, cerne: 0.0017, efface: 1.0 },
  contour: { bord: 1.9, pli: 1.0 },
  ombre: { couleur: 0x120c33, opacite: 0.45 },
  balise: { rayon: 0.026, hauteur: 0.0004 },
});

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lin = (x, a, b) => clamp01((x - a) / (b - a));
const lisse = (x) => x * x * (3 - 2 * x);
const easeOutBack = (x) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const mod1 = (x) => x - Math.floor(x);

// ── trajet fermé ──────────────────────────────────────────────────────────────────────────────────────────────────
function trajet() {
  const P = [...ESCALES.map((c) => c.lieu), ...TOUR].map(([lng, lat]) => toVec(lng, lat));
  const n = P.length;
  const cr = (s, out) => {
    const i = Math.floor(s), u = s - i;
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => P[(((i + k) % n) + n) % n]);
    const u2 = u * u, u3 = u2 * u;
    out.set(0, 0, 0)
      .addScaledVector(p0, -0.5 * u3 + u2 - 0.5 * u)
      .addScaledVector(p1, 1.5 * u3 - 2.5 * u2 + 1)
      .addScaledVector(p2, -1.5 * u3 + 2 * u2 + 0.5 * u)
      .addScaledVector(p3, 0.5 * u3 - 0.5 * u2);
    return out.normalize();
  };
  const N = 4000, S = new Float64Array(N + 1), L = new Float64Array(N + 1);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  cr(0, a);
  for (let k = 1; k <= N; k++) {
    S[k] = (n * k) / N;
    cr(S[k], b);
    L[k] = L[k - 1] + a.distanceTo(b);
    a.copy(b);
  }
  const total = L[N];
  const sDe = (e) => {
    const l = mod1(e) * total;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < l) lo = m; else hi = m; }
    const f = L[hi] > L[lo] ? (l - L[lo]) / (L[hi] - L[lo]) : 0;
    return S[lo] + f * (S[hi] - S[lo]);
  };
  const eDe = (s) => L[Math.round((s / n) * N)] / total;
  return { sol: (e, out = new THREE.Vector3()) => cr(sDe(e), out), passages: [0, 1, 2, 3].map(eDe), total };
}

/** Altitude : croisière, avec un creux en rase-mottes au-dessus de chaque escale. */
function altitude(e, tr, R) {
  let creux = 0;
  for (const p of tr.passages) {
    let d = Math.abs(e - p); d = Math.min(d, 1 - d);
    creux = Math.max(creux, Math.exp(-(((d * tr.total) / R.creux) ** 2)));
  }
  return R.altCroisiere - (R.altCroisiere - R.altPassage) * creux;
}
const pointDe = (e, tr, R, out = new THREE.Vector3()) => tr.sol(mod1(e), out).multiplyScalar(1 + altitude(mod1(e), tr, R));
function cinematique(e, tr, R) {
  const h = 4e-4;
  const a = pointDe(e - h, tr, R), b = pointDe(e, tr, R), c = pointDe(e + h, tr, R);
  const vit = c.clone().sub(a);
  const acc = c.clone().sub(b).sub(b).add(a);
  const droite = new THREE.Vector3().crossVectors(vit, b).normalize();
  return { position: b, vitesse: vit, courbure: (acc.dot(droite) * 4) / vit.lengthSq() };
}
function pose(e, sec, tr, R, gain) {
  const { position, vitesse, courbure } = cinematique(e, tr, R);
  const fw = vitesse.normalize();
  const droite = new THREE.Vector3().crossVectors(fw, position.clone().normalize()).normalize();
  const haut = new THREE.Vector3().crossVectors(droite, fw);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fw, haut, droite));
  const roulis = Math.max(-55 * RAD, Math.min(55 * RAD, Math.atan(gain * courbure) + R.roulisBase * RAD));
  const tangage = 1.2 * RAD * Math.sin(sec * 2.9 * 0.7 + 0.7);
  q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(roulis, 0, tangage, 'XZY')));
  return { position, quaternion: q };
}

/**
 * Horaire : temps (s) ↔ progression e. Lent à l'écran (R.vitesse), rapide ailleurs, transition adoucie ; la boucle
 * démarre (temps 0) au milieu de la partie cachée.
 */
function horaire(tr, R, aLEcran, elan) {
  const N = 2000, vis = new Float64Array(N);
  for (let j = 0; j < N; j++) vis[j] = aLEcran(j / N) ? 1 : 0;
  // adoucit sur ±1,5 % du tour : l'avion accélère en quittant l'écran, ralentit avant d'y entrer
  const w = Math.round(N * 0.015), lis = new Float64Array(N);
  for (let j = 0; j < N; j++) { let s = 0; for (let k = -w; k <= w; k++) s += vis[(j + k + N) % N]; lis[j] = s / (2 * w + 1); }
  // longueur cachée → vitesse de retour
  let lCache = 0; for (let j = 0; j < N; j++) lCache += (1 - vis[j]) * tr.total / N;
  const vRetour = lCache / R.retour;
  // milieu de la partie cachée : la plus longue suite de « caché »
  let best = 0, bestStart = 0;
  for (let j = 0; j < N; j++) {
    if (vis[j] || !vis[(j - 1 + N) % N]) continue;
    let k = 0; while (k < N && !vis[(j + k) % N]) k++;
    if (k > best) { best = k; bestStart = j; }
  }
  const e0 = (bestStart + best / 2) / N;
  const T = new Float64Array(N + 1);
  for (let j = 0; j < N; j++) {
    const jj = (Math.floor(e0 * N) + j) % N;
    const v = R.vitesse * elan(jj / N) * lis[jj] + vRetour * (1 - lis[jj]);
    T[j + 1] = T[j] + (tr.total / N) / v;
  }
  const periode = T[N];
  const eAuTemps = (sec) => { // temps → e
    const x = (((sec % periode) + periode) % periode);
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] < x) lo = m; else hi = m; }
    return mod1(e0 + (lo + (x - T[lo]) / (T[hi] - T[lo])) / N);
  };
  const tempsDe = (e) => { // e → temps depuis le début de la boucle
    const j = mod1(e - e0) * N, k = Math.floor(j);
    return T[k] + (j - k) * (T[k + 1] - T[k]);
  };
  // sortie de l'écran après Athènes
  const jA = Math.floor(mod1(tr.passages[3] - e0) * N);
  let jS = jA; while (jS < N && vis[(Math.floor(e0 * N) + jS) % N]) jS++;
  return { periode, eAuTemps, tempsDe, sortie: T[jS] };
}

// ── papier (A2 + bande au bord de fuite) ──────────────────────────────────────────────────────────────────────────
/** Groupes : 0 = dessus crème, 1 = dessus de la bande, 2 = intérieur de quille. Face arrière : couleur principale. */
function papier(R) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const NEZ = V(0.5, 0, 0), xF = -0.5, fente = 0.004;
  const zPli = 0.25, zBout = 0.66, dInt = 6 * RAD, dExt = 26 * RAD;
  const QUILLE = V(-0.44, -0.27, 0);
  const creme = [], bande = [], quille = [], bords = [], plis = [];
  const vers = (a, b, f) => a.clone().lerp(b, f);
  for (const s of [-1, 1]) {
    const Rr = V(xF, 0, s * fente);
    const yC = (zPli - fente) * Math.tan(dInt);
    const C = V(xF, yC, s * zPli);
    const T = V(xF, yC + (zBout - zPli) * Math.tan(dExt), s * zBout);
    const dessus = V(0, 1, 0), dedans = V(0, 0, -s);
    const f = R.bande;
    const R2 = vers(NEZ, Rr, f), C2 = vers(NEZ, C, f), T2 = vers(NEZ, T, f);
    creme.push([NEZ, R2, C2, dessus], [NEZ, C2, T2, dessus]);
    bande.push([R2, Rr, C, dessus], [R2, C, C2, dessus], [C2, C, T, dessus], [C2, T, T2, dessus]);
    quille.push([NEZ, Rr, QUILLE, dedans]);
    bords.push([NEZ, T], [T, C], [C, Rr], [Rr, QUILLE]);
    plis.push([vers(NEZ, C, 0.45), C], [vers(NEZ, Rr, 0.35), Rr]);
  }
  bords.push([QUILLE, NEZ]);
  const pos = [];
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const [A, B, C, ref] of [...creme, ...bande, ...quille]) {
    n.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A));
    const [P, Q] = n.dot(ref) >= 0 ? [B, C] : [C, B];
    pos.push(A.x, A.y, A.z, P.x, P.y, P.z, Q.x, Q.y, Q.z);
  }
  const flat = (segs) => segs.flatMap(([A, B]) => [A.x, A.y, A.z, B.x, B.y, B.z]);
  return { positions: new Float32Array(pos), n: [creme.length, bande.length, quille.length], bords: flat(bords), plis: flat(plis) };
}

function carteToon() {
  const n = 64, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const ndl = ((i + 0.5) / n) * 2 - 1;
    const v = ndl < SEUILS[0] ? 0 : ndl < SEUILS[1] ? 0.5 : 1;
    data.set([Math.round(v * 255), 0, 0, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Éclairage cartoon d'A2 ; caméra d'ombre élargie à toute la partie visible du trajet. */
function eclairageCartoon(stage) {
  const { sun, hemi } = stage.lights;
  const h = [0.335, 0.262, 0.62];
  const S = h.map((v) => 1 - v);
  const mx = (v) => Math.max(...v);
  hemi.color.setRGB(h[0] / mx(h), h[1] / mx(h), h[2] / mx(h), THREE.LinearSRGBColorSpace);
  hemi.groundColor.copy(hemi.color);
  hemi.intensity = Math.PI * mx(h);
  sun.color.setRGB(S[0] / mx(S), S[1] / mx(S), S[2] / mx(S), THREE.LinearSRGBColorSpace);
  sun.intensity = Math.PI * mx(S);
  const mid = toVec(12, 36);
  sun.target.position.copy(mid);
  sun.position.copy(mid).addScaledVector(stage.sunDir, 1);
  const sc = sun.shadow.camera;
  sc.left = -0.62; sc.right = 0.62; sc.top = 0.62; sc.bottom = -0.62; sc.near = 0.3; sc.far = 1.7;
  sc.updateProjectionMatrix();
  sun.shadow.radius = 1.5;
  sun.shadow.bias = -0.00005;
  sun.shadow.normalBias = 0;
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
}

function calotteOmbre(R) {
  const L0 = -50, L1 = 75, B0 = 10, B1 = 62;
  const geo = new THREE.SphereGeometry(1, L1 - L0, B1 - B0, Math.PI + L0 * RAD, (L1 - L0) * RAD, (90 - B1) * RAD, (B1 - B0) * RAD);
  const mesh = new THREE.Mesh(geo, new THREE.ShadowMaterial({ color: R.ombre.couleur, opacity: R.ombre.opacite }));
  mesh.receiveShadow = true;
  return mesh;
}

export function mount(canvas, { etiquettes = [], t: tFige = undefined, reglages = {} } = {}) {
  const R = { ...REGLAGES, ...reglages };
  const stage = createStage(canvas, { toneMapping: 'none' });
  const { renderer, scene, camera } = stage;
  const fige = Number.isFinite(tFige) ? clamp01(tFige) : stage.frozenT;
  const tr = trajet();
  eclairageCartoon(stage);
  scene.add(stage.globeOccluder); // l'avion passe derrière la Terre
  const jetables = [];
  const garde = (x) => (jetables.push(x), x);

  // « à l'écran » : devant la Terre et dans le téléphone (marge de 30 px)
  const W = 390, H = 844, M = 10;
  const aLEcran = (e) => {
    const p = pointDe(e, tr, R);
    const [x, y] = stage.project(p);
    return stage.visible(p) && x > -M && x < W + M && y > -M && y < H + M;
  };
  // élan : vitesse normale de Rabat à Athènes, de plus en plus vive en s'en éloignant (sortie à droite, entrée à gauche)
  const [eR, eA] = [tr.passages[0], tr.passages[3]];
  const elan = (e) => {
    if (e >= eR && e <= eA) return 1;
    const d = Math.min(mod1(e - eA), mod1(eR - e)) * tr.total;
    return 1 + R.elan.gain * lisse(clamp01(d / R.elan.sur));
  };
  const hor = horaire(tr, R, aLEcran, elan);
  let kMax = 0;
  for (let i = 0; i < 1000; i++) if (aLEcran(i / 1000)) kMax = Math.max(kMax, Math.abs(cinematique(i / 1000, tr, R).courbure));
  const gain = kMax > 0 ? Math.tan(R.inclinaisonMax * RAD) / kMax : 0;
  const tPassage = tr.passages.map((e) => hor.tempsDe(e));

  // ── avion ──
  const p = papier(R);
  const geo = garde(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
  geo.computeVertexNormals();
  geo.addGroup(0, p.n[0] * 3, 0);
  geo.addGroup(p.n[0] * 3, p.n[1] * 3, 1);
  geo.addGroup((p.n[0] + p.n[1]) * 3, p.n[2] * 3, 2);
  const grad = garde(carteToon());
  const toon = (color, side) => garde(new THREE.MeshToonMaterial({ color, gradientMap: grad, side,
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
  const mCreme = toon(0xfff8e7, THREE.FrontSide), mBande = toon(0xfff8e7, THREE.FrontSide);
  const mQuille = toon(0x6225e6, THREE.FrontSide), mVerso = toon(0x6225e6, THREE.BackSide);
  for (const m of [mCreme, mBande, mQuille]) m.shadowSide = THREE.DoubleSide;
  const recto = new THREE.Mesh(geo, [mCreme, mBande, mQuille]);
  recto.castShadow = true;
  const avion = new THREE.Group();
  avion.add(new THREE.Mesh(geo, mVerso), recto);

  const contour = new THREE.Group();
  const resolution = renderer.getSize(new THREE.Vector2());
  const trait = (segments, largeur) => {
    const g = garde(new LineSegmentsGeometry());
    g.setPositions(segments);
    const m = garde(new LineMaterial({ color: 0x000000, linewidth: largeur, worldUnits: false, transparent: true, depthWrite: false, alphaToCoverage: true }));
    m.resolution.copy(resolution);
    const l = new LineSegments2(g, m);
    l.renderOrder = 3;
    return l;
  };
  const traits = [trait(p.plis, R.contour.pli), trait(p.bords, R.contour.bord)];
  traits[1].renderOrder = 4;
  contour.add(...traits);
  avion.add(contour);
  avion.scale.setScalar(R.longueur);
  scene.add(avion);

  // ── couleurs : de la Grèce (retour par derrière) au Maroc, puis Espagne, France, Grèce ──
  const couleurs = ESCALES.map((c) => ({ a: new THREE.Color(c.a), b: new THREE.Color(c.b) }));
  const ca = new THREE.Color(), cb = new THREE.Color();
  const teindre = (sec) => {
    let i = -1;
    for (let k = 0; k < 4; k++) if (sec >= tPassage[k] + R.morph[0]) i = k;
    if (i < 0) { ca.copy(couleurs[3].a); cb.copy(couleurs[3].b); }
    else {
      const f = lisse(lin(sec, tPassage[i] + R.morph[0], tPassage[i] + R.morph[1]));
      const avant = couleurs[(i + 3) % 4];
      ca.lerpColors(avant.a, couleurs[i].a, f);
      cb.lerpColors(avant.b, couleurs[i].b, f);
      mVerso.color.copy(ca); mQuille.color.copy(ca); mBande.color.copy(cb);
      return Math.sin(Math.PI * f);
    }
    mVerso.color.copy(ca); mQuille.color.copy(ca); mBande.color.copy(cb);
    return 0;
  };

  // ── perles : de Rabat à Athènes ──
  const P = R.perles;
  const eDebut = tr.passages[0], eFin = tr.passages[3];
  const nPerles = Math.floor(((eFin - eDebut) * tr.total) / P.pas) + 1;
  const ePerle = Array.from({ length: nPerles }, (_, i) => eDebut + (i * P.pas) / tr.total);
  const tPerle = ePerle.map((e) => hor.tempsDe(e));
  const geoPerle = garde(new THREE.SphereGeometry(1, 12, 8));
  const perles = new THREE.InstancedMesh(geoPerle, garde(new THREE.MeshToonMaterial({ color: 0xfff8e7, gradientMap: grad })), nPerles);
  const cernes = new THREE.InstancedMesh(geoPerle, garde(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })), nPerles);
  perles.castShadow = true;
  perles.frustumCulled = cernes.frustumCulled = false;
  scene.add(perles, cernes);

  const calotte = calotteOmbre(R);
  garde(calotte.geometry); garde(calotte.material);
  scene.add(calotte);
  const reserve = new THREE.Mesh(garde(new THREE.CircleGeometry(R.balise.rayon, 48)),
    garde(new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })));
  reserve.position.copy(toVec(...ATHENES)).multiplyScalar(1 + R.balise.hauteur);
  reserve.lookAt(0, 0, 0);
  reserve.renderOrder = -1;
  scene.add(reserve);

  const mat = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
  const tSortie = hor.sortie;
  const placerPerles = (sec) => {
    for (let i = 0; i < nPerles; i++) {
      const naissance = clamp01((sec - tPerle[i]) / 0.8);
      const d = tSortie + P.efface * 0.6 * (i / nPerles);
      const efface = lin(sec, d, d + 0.4 * P.efface);
      const s = naissance > 0 ? Math.max(0, easeOutBack(naissance)) * (1 - lisse(efface)) : 0;
      tr.sol(ePerle[i], pp).multiplyScalar(1 + P.rayon + P.cerne);
      perles.setMatrixAt(i, mat.compose(pp, q0, sc.setScalar(P.rayon * s)));
      cernes.setMatrixAt(i, mat.compose(pp, q0, sc.setScalar((P.rayon + P.cerne) * s)));
    }
    perles.instanceMatrix.needsUpdate = cernes.instanceMatrix.needsUpdate = true;
  };

  // ── bulles : « Pays · Capitale » au passage, effacées à la sortie de l'écran ──
  const majBulles = (sec) => etiquettes.forEach((el, i) => {
    if (!el) return;
    el.classList.toggle('on', sec >= tPassage[i] && sec < tSortie + R.bulles);
  });

  const camLocal = new THREE.Vector3();
  const majContour = () => {
    avion.updateMatrixWorld(true);
    avion.worldToLocal(camLocal.copy(camera.position));
    contour.position.copy(camLocal.normalize().multiplyScalar(0.011));
  };

  /** État à l'instant `sec` de la boucle (secondes depuis son début). */
  const etat = (sec, horloge) => {
    const e = hor.eAuTemps(sec);
    const gonfle = teindre(sec);
    const ps = pose(e, horloge, tr, R, gain);
    avion.position.copy(ps.position);
    avion.quaternion.copy(ps.quaternion);
    avion.scale.setScalar(R.longueur * (1 + R.gonfle * gonfle));
    majContour();
    placerPerles(sec);
    majBulles(sec);
  };

  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let raf = 0, t0 = null, detruit = false;
  const rendre = () => {
    renderer.render(scene, camera);
    if (!canvas.dataset.ready) canvas.dataset.ready = '1';
  };
  const image = (now) => {
    if (detruit) return;
    t0 ??= now;
    const s = (now - t0) / 1000;
    etat(s % hor.periode, s);
    rendre();
    raf = requestAnimationFrame(image);
  };
  const demarrer = () => {
    cancelAnimationFrame(raf);
    if (detruit) return;
    if (fige !== null) { etat(fige * hor.periode, fige * hor.periode); rendre(); return; }
    if (media?.matches) { etat((tPassage[2] + tPassage[3]) / 2, 0); rendre(); return; } // entre Paris et Athènes, figé
    t0 = null;
    raf = requestAnimationFrame(image);
  };
  media?.addEventListener?.('change', demarrer);
  demarrer();

  return {
    /** Durée de la boucle et instants (t ∈ [0, 1)) des passages et de la sortie : pour les captures. */
    horaire: () => ({ periode: hor.periode, passages: tPassage.map((s) => s / hor.periode), sortie: tSortie / hor.periode }),
    dispose() {
      detruit = true;
      cancelAnimationFrame(raf);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      media?.removeEventListener?.('change', demarrer);
      for (const x of jetables) x.dispose?.();
      perles.dispose(); cernes.dispose();
      stage.shadowCatcher.geometry.dispose(); stage.shadowCatcher.material.dispose();
      stage.globeOccluder.geometry.dispose(); stage.globeOccluder.material.dispose();
      stage.lights.sun.shadow.dispose();
      renderer.dispose();
      delete canvas.dataset.ready;
    },
  };
}
