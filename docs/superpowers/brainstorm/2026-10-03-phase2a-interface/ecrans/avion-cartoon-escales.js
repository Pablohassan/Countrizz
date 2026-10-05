/**
 * avion-cartoon-escales.js — variante « Escales » de l'avion A2 (cartoon premium) pour l'écran d'accueil G5.
 *
 *   import { mount } from '/files/avion-cartoon-escales.js';
 *   const vol = mount(canvas, { variante: 'bande1' | 'bande', t });   // t ∈ [0, 1] fige l'instant (captures)
 *   vol.dispose();
 *
 * Demande de l'utilisateur (05/10, session cloud) : A2 retenu ; le trajet part de Rabat et va jusqu'en Grèce, et l'avion
 * prend discrètement les couleurs du drapeau du pays à chaque escale.
 *
 * Trajet : Rabat → Madrid → Paris → Athènes, une seule courbe lisse sur la sphère (Catmull-Rom sur les vecteurs unitaires,
 * renormalisée), parcourue à vitesse d'arc constante modulée par un départ et une arrivée en douceur. Les escales
 * intermédiaires sont des passages en rase-mottes (Rabat → Madrid fait ≈ 64 px à l'écran pour un avion de ≈ 38 px : un
 * vrai atterrissage n'y tiendrait pas) ; seul Athènes est un atterrissage, au bord de la balise comme dans A2.
 * Roulis permanent de −25° (en plus du virage) : sans lui l'avion se montre de dessus et sa quille ne se voit pas.
 * Couleurs : au décollage, Maroc ; en passant au-dessus de Madrid, Espagne ; de Paris, France ; posé à Athènes, Grèce.
 * Le changement dure ≈ 0,4 s, avec un léger gonflement (+6 %) : on le remarque sans qu'il crie.
 *   - variante « bande1 » : la quille garde le violet du jeu ; une bande au bord de fuite du dessus prend la couleur
 *     principale du drapeau (essai « quille seule » écarté : vu de la caméra, le dessus crème masque presque tout) ;
 *   - variante « bande » : en plus, une bande le long du bord de fuite du dessus prend la seconde couleur (France : quille
 *     bleue, ailes crème, bande rouge).
 *
 * Tout le reste vient d'A2 (avion-cartoon.js) : géométrie du papier bicolore, aplats toon à 3 tons et leurs seuils,
 * éclairage cartoon, contour en lignes épaisses, ombre portée, perles de traînée, réserve de la balise d'Athènes.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createStage, slerpPath, toVec } from './avion-socle.js';
import { SEUILS } from './avion-cartoon.js';

const RAD = Math.PI / 180;
const RABAT = [-6.84, 34.02], MADRID = [-3.70, 40.42], PARIS = [2.35, 48.86], ATHENES = [23.73, 37.98];

/** Couleurs de chaque escale : a = couleur principale (face violette du papier), b = seconde (bande, variante « bande »). */
export const ESCALES = Object.freeze([
  { cca3: 'MAR', lieu: RABAT, a: 0xc1272d, b: 0x006233 },
  { cca3: 'ESP', lieu: MADRID, a: 0xc60b1e, b: 0xffc400 },
  { cca3: 'FRA', lieu: PARIS, a: 0x002395, b: 0xed2939 },
  { cca3: 'GRC', lieu: ATHENES, a: 0x0d5eaf, b: 0x0d5eaf },
]);

export const REGLAGES = Object.freeze({
  periode: 15.7,            // s : 11 s ralenties de 30 % (vitesse × 0,7) à la demande de l'utilisateur : rester discret
  longueur: 0.0525,         // 0,075 réduit de 30 % à la demande de l'utilisateur (≈ 27 px à l'écran) : rester discret
  uArrivee: 0.857,          // nez au bord de l'anneau de la balise d'Athènes (A2 : 0,825 pour un avion de 0,09)
  altSol: 0.02,             // départ et arrivée
  altPassage: 0.027,        // rase-mottes au-dessus de Madrid et de Paris
  bosse: { k: 0.075, max: 0.022 }, // hauteur de la bosse d'une étape = k × longueur de l'étape (rad), plafonnée
  inclinaisonMax: 40,
  roulisBase: -25,          // degrés : inclinaison permanente qui montre la quille à la caméra (comme le virage d'A2)
  arrondi: 3,
  bande: 0.8,               // la bande commence à 80 % de la corde (nez → bord de fuite)
  morph: [-0.012, 0.022],   // fenêtre du changement de couleur autour du passage (en progression e)
  gonfle: 0.06,
  perles: { pas: 0.0146, rayon: 0.0029, cerne: 0.0017 },
  contour: { bord: 1.9, pli: 1.0 }, // px CSS, affinés avec l'avion (2,3 / 1,25 dans A2)
  ombre: { couleur: 0x120c33, opacite: 0.45 },
  balise: { rayon: 0.026, hauteur: 0.0004 },
});

const T_POP = [0.012, 0.05];
const T_VOL = [0.03, 0.87];      // puis ≈ 0,7 s posé à Athènes, aux couleurs grecques
const T_FIN = [0.935, 0.975];
const T_EFFACE = [0.955, 0.995];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lin = (x, a, b) => clamp01((x - a) / (b - a));
const lisse = (x) => x * x * (3 - 2 * x);
const easeOutBack = (x) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const progression = (s) => s - 0.55 * Math.sin(2 * Math.PI * s) / (2 * Math.PI);

// ── trajet ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Courbe lisse sur la sphère par les points de passage ; paramétrée par l'abscisse curviligne normalisée e ∈ [0, 1]. */
function trajet(R) {
  const W = [toVec(...RABAT), toVec(...MADRID), toVec(...PARIS), slerpPath(PARIS, ATHENES, R.uArrivee, 0)];
  const ext = (a, b) => a.clone().multiplyScalar(2).sub(b); // points fantômes : prolongent la courbe aux bouts
  const P = [ext(W[0], W[1]), ...W, ext(W[3], W[2])];
  const cr = (s, out) => {
    const i = Math.min(2, Math.floor(s)), u = s - i;
    const [p0, p1, p2, p3] = [P[i], P[i + 1], P[i + 2], P[i + 3]];
    const u2 = u * u, u3 = u2 * u;
    out.set(0, 0, 0)
      .addScaledVector(p0, -0.5 * u3 + u2 - 0.5 * u)
      .addScaledVector(p1, 1.5 * u3 - 2.5 * u2 + 1)
      .addScaledVector(p2, -1.5 * u3 + 2 * u2 + 0.5 * u)
      .addScaledVector(p3, 0.5 * u3 - 0.5 * u2);
    return out.normalize();
  };
  const N = 900, S = new Float64Array(N + 1), L = new Float64Array(N + 1);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  cr(0, a);
  for (let k = 1; k <= N; k++) {
    S[k] = (3 * k) / N;
    cr(S[k], b);
    L[k] = L[k - 1] + a.distanceTo(b);
    a.copy(b);
  }
  const total = L[N];
  const sDe = (e) => { // e (fraction d'arc) → paramètre s
    const l = clamp01(e) * total;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < l) lo = m; else hi = m; }
    const f = L[hi] > L[lo] ? (l - L[lo]) / (L[hi] - L[lo]) : 0;
    return S[lo] + f * (S[hi] - S[lo]);
  };
  const eDe = (s) => { const k = Math.round((s / 3) * N); return L[k] / total; };
  const passages = [0, eDe(1), eDe(2), 1]; // e des quatre escales
  const sol = (e, out = new THREE.Vector3()) => cr(sDe(e), out);
  return { sol, passages, total };
}

/** Altitude : bas aux escales, une bosse par étape proportionnelle à sa longueur. */
function altitude(e, tr, R) {
  const pp = tr.passages;
  const i = e >= pp[2] ? 2 : e >= pp[1] ? 1 : 0;
  const x = clamp01((e - pp[i]) / (pp[i + 1] - pp[i]));
  const bas = [R.altSol, R.altPassage, R.altPassage, R.altSol];
  const h = Math.min(R.bosse.max, R.bosse.k * (pp[i + 1] - pp[i]) * tr.total);
  // bosse asymétrique comme A2 : montée vive, descente longue
  return bas[i] + (bas[i + 1] - bas[i]) * lisse(x) + h * Math.sin(Math.PI * x ** 0.75) ** 1.4;
}

function pointDe(e, tr, R, out = new THREE.Vector3()) {
  return tr.sol(e, out).multiplyScalar(1 + altitude(e, tr, R));
}
function cinematique(e, tr, R) {
  const h = 1e-3;
  const a = pointDe(e - h, tr, R), b = pointDe(e, tr, R), c = pointDe(e + h, tr, R);
  const vit = c.clone().sub(a);
  const acc = c.clone().sub(b).sub(b).add(a);
  const droite = new THREE.Vector3().crossVectors(vit, b).normalize();
  return { position: b, vitesse: vit, courbure: (acc.dot(droite) * 4) / vit.lengthSq() };
}
function gainRoulis(tr, R) {
  let kMax = 0;
  for (let i = 1; i < 400; i++) kMax = Math.max(kMax, Math.abs(cinematique(i / 400, tr, R).courbure));
  return kMax > 0 ? Math.tan(R.inclinaisonMax * RAD) / kMax : 0;
}
function pose(e, sec, tr, R, gain) {
  const { position, vitesse, courbure } = cinematique(e, tr, R);
  const fw = vitesse.normalize();
  const droite = new THREE.Vector3().crossVectors(fw, position.clone().normalize()).normalize();
  const haut = new THREE.Vector3().crossVectors(droite, fw);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fw, haut, droite));
  const enveloppe = 1 - 0.3 * lisse(lin(e, 0.9, 1));
  const roulis = (Math.atan(gain * courbure) + R.roulisBase * RAD) * enveloppe;
  const tangage = R.arrondi * RAD * lisse(lin(e, 0.88, 1)) + 1.2 * RAD * Math.sin(sec * 2.9 * 0.7 + 0.7);
  q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(roulis, 0, tangage, 'XZY')));
  return { position, quaternion: q };
}

// ── papier (A2 + bande optionnelle au bord de fuite) ──────────────────────────────────────────────────────────────
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

/** Éclairage cartoon d'A2 ; caméra d'ombre recentrée sur tout le trajet (Rabat → Athènes). */
function eclairageCartoon(stage, tr) {
  const { sun, hemi } = stage.lights;
  const h = [0.335, 0.262, 0.62];
  const S = h.map((v) => 1 - v);
  const mx = (v) => Math.max(...v);
  hemi.color.setRGB(h[0] / mx(h), h[1] / mx(h), h[2] / mx(h), THREE.LinearSRGBColorSpace);
  hemi.groundColor.copy(hemi.color);
  hemi.intensity = Math.PI * mx(h);
  sun.color.setRGB(S[0] / mx(S), S[1] / mx(S), S[2] / mx(S), THREE.LinearSRGBColorSpace);
  sun.intensity = Math.PI * mx(S);
  const mid = tr.sol(0.5);
  sun.target.position.copy(mid);
  sun.position.copy(mid).addScaledVector(stage.sunDir, 1);
  const sc = sun.shadow.camera;
  sc.left = -0.3; sc.right = 0.3; sc.top = 0.3; sc.bottom = -0.3; sc.near = 0.6; sc.far = 1.4;
  sc.updateProjectionMatrix();
  sun.shadow.radius = 1.5;
  sun.shadow.bias = -0.00005;
  sun.shadow.normalBias = 0;
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
}

function calotteOmbre(R) {
  const L0 = -12, L1 = 35, B0 = 28, B1 = 57;
  const geo = new THREE.SphereGeometry(1, L1 - L0, B1 - B0, Math.PI + L0 * RAD, (L1 - L0) * RAD, (90 - B1) * RAD, (B1 - B0) * RAD);
  const mesh = new THREE.Mesh(geo, new THREE.ShadowMaterial({ color: R.ombre.couleur, opacity: R.ombre.opacite }));
  mesh.receiveShadow = true;
  return mesh;
}

export function mount(canvas, { variante = 'bande', t: tFige = undefined, reglages = {} } = {}) {
  const R = { ...REGLAGES, ...reglages };
  const deuxCouleurs = variante === 'bande';
  const stage = createStage(canvas, { toneMapping: 'none' });
  const { renderer, scene, camera } = stage;
  const fige = Number.isFinite(tFige) ? clamp01(tFige) : stage.frozenT;
  const tr = trajet(R);
  const gain = gainRoulis(tr, R);
  eclairageCartoon(stage, tr);
  const jetables = [];
  const garde = (x) => (jetables.push(x), x);

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
  const mCreme = toon(0xfff8e7, THREE.FrontSide);
  const mBande = toon(0xfff8e7, THREE.FrontSide);
  const mQuille = toon(0x6225e6, THREE.FrontSide);
  const mVerso = toon(0x6225e6, THREE.BackSide);
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
    l.userData.largeur = largeur;
    return l;
  };
  const traits = [trait(p.plis, R.contour.pli), trait(p.bords, R.contour.bord)];
  traits[1].renderOrder = 4;
  contour.add(...traits);
  avion.add(contour);
  scene.add(avion);

  // Couleurs (en espace linéaire : le mélange reste propre entre deux teintes éloignées)
  // « bande » : quille = a, bande = b. « bande1 » : quille violette du jeu, bande = a (une seule couleur, la principale).
  const violet = new THREE.Color(0x6225e6);
  const couleurs = ESCALES.map((c) => deuxCouleurs
    ? { a: new THREE.Color(c.a), b: new THREE.Color(c.b) }
    : { a: violet, b: new THREE.Color(c.a) });
  const ca = new THREE.Color(), cb = new THREE.Color();
  /** Indice fractionnaire de la palette à la progression e (2,4 = 40 % du chemin de la France vers la Grèce). */
  const palette = (e) => {
    let k = 0;
    for (let i = 1; i < 3; i++) k += lisse(lin(e, tr.passages[i] + R.morph[0], tr.passages[i] + R.morph[1]));
    k += lisse(lin(e, 0.94, 0.985)); // Athènes : en finale, avant le toucher des roues
    return k;
  };
  const teindre = (k) => {
    const i = Math.min(2, Math.floor(k)), f = k - i;
    ca.lerpColors(couleurs[i].a, couleurs[i + 1].a, f);
    cb.lerpColors(couleurs[i].b, couleurs[i + 1].b, f);
    mVerso.color.copy(ca); mQuille.color.copy(ca); mBande.color.copy(cb);
    return Math.sin(Math.PI * (k - Math.floor(k))); // 0 hors changement, 1 au milieu : sert au gonflement
  };

  // ── perles : le long de la courbe, du départ à l'atterrissage ──
  const P = R.perles;
  const nPerles = Math.floor((tr.total * 0.97) / P.pas);
  const ePerle = Array.from({ length: nPerles }, (_, i) => 0.03 + (i * P.pas) / tr.total);
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
  const placerPerles = (eVisible, t) => {
    for (let i = 0; i < nPerles; i++) {
      const naissance = clamp01(((eVisible - ePerle[i]) * tr.total) / 0.012);
      const d = T_EFFACE[0] + 0.03 * (i / nPerles);
      const efface = t === null ? 0 : lin(t, d, d + 0.015);
      const s = naissance > 0 ? Math.max(0, easeOutBack(naissance)) * (1 - lisse(efface)) : 0;
      tr.sol(ePerle[i], pp).multiplyScalar(1 + P.rayon + P.cerne);
      perles.setMatrixAt(i, mat.compose(pp, q0, sc.setScalar(P.rayon * s)));
      cernes.setMatrixAt(i, mat.compose(pp, q0, sc.setScalar((P.rayon + P.cerne) * s)));
    }
    perles.instanceMatrix.needsUpdate = cernes.instanceMatrix.needsUpdate = true;
  };

  const camLocal = new THREE.Vector3();
  const majContour = (echelle) => {
    avion.updateMatrixWorld(true);
    avion.worldToLocal(camLocal.copy(camera.position));
    contour.position.copy(camLocal.normalize().multiplyScalar(0.011));
    for (const l of traits) l.material.linewidth = l.userData.largeur * Math.min(1, echelle);
  };

  const etat = (t, sec, reduit) => {
    let e, echelle, eVisible, tEff = t;
    if (reduit) {
      e = (tr.passages[2] + tr.passages[3]) / 2; echelle = 1; tEff = null; sec = 0; eVisible = e;
    } else {
      e = progression(lin(t, T_VOL[0], T_VOL[1]));
      const apparition = lin(t, T_POP[0], T_POP[1]);
      const fin = lin(t, T_FIN[0], T_FIN[1]);
      echelle = Math.max(0, easeOutBack(apparition)) * (1 - lisse(fin)) * (1 + 0.12 * Math.sin(Math.PI * fin));
      eVisible = t < T_POP[0] ? -1 : e;
    }
    const bosse = teindre(palette(e));
    const ps = pose(e, sec, tr, R, gain);
    avion.position.copy(ps.position);
    avion.quaternion.copy(ps.quaternion);
    avion.scale.setScalar(R.longueur * Math.max(echelle * (1 + R.gonfle * bosse), 1e-4));
    avion.visible = echelle > 0.002;
    calotte.material.opacity = R.ombre.opacite * clamp01(echelle);
    majContour(echelle);
    placerPerles(eVisible, tEff);
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
    const sec = (now - t0) / 1000;
    etat((sec / R.periode) % 1, sec, false);
    rendre();
    raf = requestAnimationFrame(image);
  };
  const demarrer = () => {
    cancelAnimationFrame(raf);
    if (detruit) return;
    if (fige !== null) { etat(fige, fige * R.periode, false); rendre(); return; }
    if (media?.matches) { etat(0, 0, true); rendre(); return; }
    t0 = null;
    raf = requestAnimationFrame(image);
  };
  media?.addEventListener?.('change', demarrer);
  demarrer();

  return {
    /** Instants (t de la boucle) où l'avion passe chaque escale : pour les captures. */
    passages() {
      const inv = (eCible) => { let lo = 0, hi = 1; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (progression(m) < eCible) lo = m; else hi = m; } return T_VOL[0] + lo * (T_VOL[1] - T_VOL[0]); };
      return tr.passages.map(inv);
    },
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
