/**
 * avion-origami.js — avion en papier 3D « origami détaillé et effets » pour l'écran d'accueil G5 · Escales.
 *
 *   import { mount } from '/files/avion-origami.js';
 *   const h = mount(canvas, { t });   // t ∈ [0, 1] facultatif : fige le vol (captures) ; sinon data-t / ?t= ; sinon boucle
 *   h.dispose();
 *
 * Dard origami bicolore (recto crème, revers violet #6225e6, comme une feuille d'origami) : ailes en V (dièdre),
 * winglets relevés sur toute la fin de l'aile, deux plis de nez superposés (le premier montre le revers : chevron
 * violet), quille sous l'emplanture. Arêtes encrées (tubes noirs ≈ 1,2 px CSS), facettes à normales plates (plis nets),
 * dégradé crème, ombre portée sur le globe. Effets : perles de route crème cerclées de noir posées au sol derrière
 * l'avion, deux filets de condensation aux bouts des winglets, étincelle jaune #f7dc6f laissée en l'air de temps en temps.
 *
 * Relecture du 04/10 (ce qui a changé et pourquoi, mesuré sur les captures du banc) :
 *  - planform affiné (demi-envergure 0,45 → 0,40) et winglets longs (bord d'attaque au bout 0,10 → 0,32) : vu de
 *    dessus, l'ancien dard se lisait comme un triangle plat ; la face intérieure du winglet gauche (ombrée) et la face
 *    extérieure violette du winglet droit donnent maintenant le volume, puisque le soleil, dans le dos de l'avion,
 *    éclaire les deux ailes presque pareil ;
 *  - altitude de croisière 0,05 → 0,03 : l'ombre était à ≈ 35 px de l'avion (détachée), elle est à ≈ 20 px, l'écart
 *    de l'ombre 2D de G5 ;
 *  - départ ≈ 24 px après Paris : la silhouette couvrait le drapeau français de t = 0,03 à 0,32 et le mât jusqu'à 0,16 ;
 *  - ruban jaune de queue retiré (il se lisait comme une traînée sale) ; étincelles laissées là où elles naissent (le
 *    code les collait au winglet, contrairement à son commentaire) ;
 *  - plus de papier translucide pendant l'apparition et l'atterrissage : l'opacité suit l'échelle (< 1 seulement sous
 *    30 % de la taille), le pliage dans la balise reste opaque ;
 *  - mouvement réduit : pose au milieu exact du trajet (u = 0,5), sans étincelle ;
 *  - remplissage hémisphérique réchauffé (rebond du papier) : la face ombrée du winglet sortait gris froid.
 *
 * Aucune variable globale : tout l'état vit dans mount() ; chaque instance a son canvas, son renderer, sa scène.
 * Matériaux : MeshStandard (papier recto/verso, perles), MeshBasic (encre, condensation, étoile), ShadowMaterial (socle)
 * — tous ont un équivalent nodal (three/webgpu). Pas de ShaderMaterial ni d'onBeforeCompile.
 *
 * Portage WebGPU/TSL : voir la note en fin de fichier.
 */
import * as THREE from 'three';
import { createStage } from './avion-socle.js';

const PARIS = [2.35, 48.86];
const ATHENES = [23.73, 37.98];
const PERIOD = 6.5; // s, comme d5-fly du fragment

const CREAM = '#fff8e7', CREAM_SHADE = '#f0e3c4', PURPLE = '#6225e6', YELLOW = '#f7dc6f';

// ─── Chronologie d'une boucle (t ∈ [0, 1)) ────────────────────────────────────────────────────────────────────────────
const TL = {
  pop: [0.0, 0.08],        // apparition près de Paris : se déplie depuis la queue (easeOutBack)
  fly: [0.03, 0.88],       // vol Paris → Athènes
  land: [0.875, 0.935],    // posé dans la balise : se replie par le nez
  beadsOut: [0.9, 0.985],  // les perles s'éteignent en vague, de Paris vers Athènes
};
const SPARKS = [           // étincelles : instant, durée, point de naissance (elles restent en l'air là où elles naissent)
  { t0: 0.40, dur: 0.16, at: 'tipR', size: 1.0 },
  { t0: 0.64, dur: 0.13, at: 'tipL', size: 0.75 },
  { t0: 0.86, dur: 0.12, at: 'target', size: 1.15 },
];
const T_MID = TL.fly[0] + 0.5 * (TL.fly[1] - TL.fly[0]); // instant où u = 0,5 (pose du mouvement réduit)

// ─── Dimensions ───────────────────────────────────────────────────────────────────────────────────────────────────────
const SCALE = 0.106;   // unités monde par unité locale : ≈ 52 px de long, ≈ 34 px d'un bout de winglet à l'autre
const ALT0 = 0.013;    // altitude aux extrémités du vol
const HMAX = 0.03;     // altitude de croisière, au milieu du trajet (ombre à ≈ 20 px, comme l'ombre 2D de G5)
const SWAY = 0.005;    // écart latéral max du S de vol (≈ 2,3 px), nul aux extrémités
const BANK = 12 * Math.PI / 180;
const START_GAP = 0.052; // ≈ 24 px CSS : la queue part après l'anneau de Paris, la silhouette ne couvre ni drapeau ni mât

// Planche — repère local : s = droite, h = haut, f = avant (0 = bord de fuite, 1 = nez) ; Vector3(s, h, −(f − F0)).
const NOSE_F = 0.9, F0 = 0.40, ROOT = 0.010;
const S_FOLD = 0.30, S_TIP = 0.40, F_TIP = 0.32;   // pli de winglet, bout d'aile, bord d'attaque au bout
const DIHEDRAL = 16 * Math.PI / 180;
const WINGLET = 78 * Math.PI / 180;                // angle absolu du winglet sur l'horizontale
const FLAP1 = { cf: 0.36, pf: 0.56, lift: 0.009 }; // pli de nez n°1 (rabattu : revers violet visible)
const FLAP2 = { cf: 0.50, pf: 0.68, lift: 0.018 }; // pli de nez n°2 (rabattu à nouveau : recto crème)
const KEEL = { backH: -0.14, backF: 0.03, frontH: -0.03, frontF: 0.72 };
const INK_R = 0.0118, FOLD_R = 0.0085, CREASE_R = 0.0058;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lin = (a, b, x) => clamp01((x - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const easeOutBack = (x, k = 1.7) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2);

const leadF = (s) => NOSE_F - (NOSE_F - F_TIP) * (s / S_TIP);   // bord d'attaque
const leadS = (f) => (NOSE_F - f) * S_TIP / (NOSE_F - F_TIP);
const rootS = (f) => ROOT * (1 - f / NOSE_F);                    // emplanture (bord de la fente de quille)
const wingH = (s) => Math.max(0, s - ROOT) * Math.tan(DIHEDRAL);
const L = (s, h, f) => new THREE.Vector3(s, h, -(f - F0));

/** Planche : faces orientées (recto = côté A, crème), arêtes encrées, plis. Repère local, côté droit puis miroir. */
function buildPaper() {
  const pos = [], col = [];
  const ink = [], folds = [], creases = [], outline = [];
  const cream = new THREE.Color(CREAM), shade = new THREE.Color(CREAM_SHADE), tmp = new THREE.Color();
  const tint = (p) => {
    // dégradé : crème au nez, plus chaud vers le bord de fuite et les bouts d'aile ; léger creux le long des plis
    const f = -p.z + F0, s = Math.abs(p.x);
    let k = 0.6 * (1 - f / NOSE_F) + 0.3 * Math.min(1, s / S_TIP);
    k += 0.35 * Math.max(0, 1 - Math.abs(s - S_FOLD) / 0.03) + 0.35 * Math.max(0, 1 - s / 0.04);
    return tmp.copy(cream).lerp(shade, Math.min(1, k));
  };
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const tri = (a, b, c, aSide) => {
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
    if (n.dot(aSide) < 0) [b, c] = [c, b];
    for (const p of [a, b, c]) { pos.push(p.x, p.y, p.z); const c3 = tint(p); col.push(c3.r, c3.g, c3.b); }
  };
  /** Polygone plan (concave permis) donné en (s, f), relevé en 3D par lift(s, f). */
  const panel = (sf, lift, aSide) => {
    const tris = THREE.ShapeUtils.triangulateShape(sf.map(([s, f]) => new THREE.Vector2(s, f)), []);
    const P = sf.map(([s, f]) => lift(s, f));
    for (const [i, j, k] of tris) tri(P[i], P[j], P[k], aSide);
    return P;
  };
  const DOWN = new THREE.Vector3(0, -1, 0);

  for (const sg of [1, -1]) {
    const M = (v) => new THREE.Vector3(v.x * sg, v.y, v.z);           // miroir gauche/droite
    const flat = (s, f, lift = 0) => M(L(s, wingH(s) + lift, f));
    const wingUp = M(new THREE.Vector3(-Math.sin(DIHEDRAL), Math.cos(DIHEDRAL), 0));

    // Aile principale (de l'emplanture au pli du winglet)
    const tailRoot = rootS(0);
    const [N, W1, W2, R] = panel([[0, NOSE_F], [S_FOLD, leadF(S_FOLD)], [S_FOLD, 0], [tailRoot, 0]], (s, f) => flat(s, f), wingUp);
    // Winglet : relevé autour de la ligne s = S_FOLD, du bord de fuite jusqu'au bord d'attaque
    const hF = wingH(S_FOLD);
    const wl = (s, f) => { const d = s - S_FOLD; return M(L(S_FOLD + d * Math.cos(WINGLET), hF + d * Math.sin(WINGLET), f)); };
    const wUp = M(new THREE.Vector3(-Math.sin(WINGLET), Math.cos(WINGLET), 0));
    const [, TLp, TBp] = panel([[S_FOLD, leadF(S_FOLD)], [S_TIP, F_TIP], [S_TIP, 0], [S_FOLD, 0]], wl, wUp);
    // Plis de nez : n°1 rabattu (côté A vers le bas → revers violet visible), n°2 par-dessus (recto crème)
    // les plis se rejoignent sur l'axe (s = 0) : pas de fente entre gauche et droite
    const C1 = flat(0, FLAP1.cf, FLAP1.lift), P1 = flat(leadS(FLAP1.pf), FLAP1.pf, FLAP1.lift);
    const C2 = flat(0, FLAP2.cf, FLAP2.lift), P2 = flat(leadS(FLAP2.pf), FLAP2.pf, FLAP2.lift);
    tri(flat(0, NOSE_F, FLAP1.lift), C1, P1, DOWN);
    tri(flat(0, NOSE_F, FLAP2.lift), C2, P2, wingUp);
    // Quille : panneau en V sous l'emplanture, recto (A) tourné vers l'intérieur, revers (violet) dehors
    const K2 = M(L(0.002, KEEL.backH, KEEL.backF)), K3 = M(L(0.001, KEEL.frontH, KEEL.frontF));
    const kIn = M(new THREE.Vector3(-1, 0, 0));
    tri(N, R, K2, kIn); tri(N, K2, K3, kIn);

    ink.push([N, W1], [W1, TLp], [TLp, TBp], [TBp, W2], [W2, R], [N, K3], [K3, K2], [K2, R]);
    folds.push([C1, P1], [C2, P2]);
    creases.push([W1, W2], [R, flat(rootS(FLAP1.cf), FLAP1.cf)]);
    if (sg === 1) creases.push([C1, flat(0, FLAP2.cf, FLAP1.lift)], [C2, flat(0, NOSE_F, FLAP2.lift)]); // couture centrale
    outline.push(N, W1, TLp, TBp, W2, R, K2, K3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals(); // géométrie non indexée → normales de facette : plis nets
  return { geo, ink, folds, creases, outline };
}

/** Tubes (cylindres + rotules sphériques) le long de segments, fusionnés en une géométrie (un seul appel de dessin). */
function buildTubes(segments, r) {
  const parts = [];
  const Y = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
  const joints = new Map();
  for (const [a, b] of segments) {
    d.subVectors(b, a); const len = d.length(); if (len < 1e-6) continue;
    q.setFromUnitVectors(Y, d.normalize());
    m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    parts.push(new THREE.CylinderGeometry(r, r, len, 8, 1, true).applyMatrix4(m));
    for (const p of [a, b]) joints.set(`${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`, p);
  }
  for (const p of joints.values()) parts.push(new THREE.SphereGeometry(r, 10, 6).translate(p.x, p.y, p.z));
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const g of parts) {
    const p = g.attributes.position, nn = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(nn.getX(i), nn.getY(i), nn.getZ(i)); }
    for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

/** Étoile à quatre branches du fragment (path « M0-5C.6-1.2 1.2-.6 5 0 … »), rayon 1, et son liseré décalé de `w`. */
function starShapes(w) {
  const pts = [];
  const seg = (p0, c1, c2, p1) => { for (let i = 0; i < 12; i++) { const t = i / 12, u = 1 - t;
    pts.push(new THREE.Vector2(u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p1[0],
      u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p1[1]).multiplyScalar(0.2)); } };
  seg([0, -5], [0.6, -1.2], [1.2, -0.6], [5, 0]); seg([5, 0], [1.2, 0.6], [0.6, 1.2], [0, 5]);
  seg([0, 5], [-0.6, 1.2], [-1.2, 0.6], [-5, 0]); seg([-5, 0], [-1.2, -0.6], [-0.6, -1.2], [0, -5]);
  const rim = pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const t = new THREE.Vector2().subVectors(b, a).normalize();
    const nrm = new THREE.Vector2(t.y, -t.x);
    if (nrm.dot(p) < 0) nrm.negate();
    return p.clone().addScaledVector(nrm, w);
  });
  return { star: new THREE.Shape(pts), rim: new THREE.Shape(rim) };
}

export function mount(canvas, { t: fixedT } = {}) {
  const stage = createStage(canvas, { toneMapping: 'neutral' });
  const { scene, camera, renderer, toVec, lights, project, sunDir } = stage;
  lights.sun.shadow.radius = 3;                 // pénombre un peu plus large que le socle
  // Exposition de CETTE scène (avion + perles) : même direction de soleil que le globe, mais un papier crème au soleil
  // doit sortir crème, pas gris ((206,198,176) à 1,0). L'étoile et la condensation sont en toneMapped:false.
  renderer.toneMappingExposure = 1.4;
  stage.shadowCatcher.material.opacity = 0.42;  // ombre lisible aussi sur la mer sombre
  // Remplissage : le dessous de l'hémisphère passe du bleu-gris du socle à un beige chaud — rebond du papier ensoleillé
  // sur les faces qui le regardent (face intérieure des winglets : (125,124,118) froid → (150,140,119) ; dessus 238 → 240).
  lights.hemi.groundColor.set('#c9b38a');
  lights.hemi.intensity = 1.1;
  scene.add(stage.shadowCatcher);

  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  // ─── Grand cercle Paris → Athènes ──────────────────────────────────────────────────────────────────────────────────
  const A = toVec(...PARIS), B = toVec(...ATHENES);
  const omega = Math.acos(A.dot(B)), sinO = Math.sin(omega);
  const lateral = new THREE.Vector3().crossVectors(A, B).normalize().negate(); // = right du repère de vol, constant
  const ground = (u, out) => out.copy(A).multiplyScalar(Math.sin((1 - u) * omega) / sinO).addScaledVector(B, Math.sin(u * omega) / sinO);

  const progress = (t) => { const s = lin(TL.fly[0], TL.fly[1], t); return s + 0.6 * (0.5 - 0.5 * Math.cos(Math.PI * s) - s); };
  const altitude = (u) => ALT0 + (HMAX - ALT0) * Math.sin(Math.PI * u);
  const sway = (u) => SWAY * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
  const swayAcc = (u) => { const h = 1e-3; return (sway(u + h) - 2 * sway(u) + sway(u - h)) / (h * h); };
  let accMax = 0; for (let i = 0; i <= 200; i++) accMax = Math.max(accMax, Math.abs(swayAcc(i / 200)));

  // Le centre de l'avion parcourt [U_C0, U_C1] : au départ la queue est START_GAP après Paris (le drapeau et l'anneau
  // restent dégagés), à l'arrivée le nez est sur la balise (l'avion ne couvre pas l'étiquette « Grèce »).
  const U_C0 = (F0 * SCALE + START_GAP) / omega, U_C1 = 1 - ((NOSE_F - F0) * SCALE) / omega;
  const _g = new THREE.Vector3();
  const flightPos = (u, out) => {
    ground(U_C0 + (U_C1 - U_C0) * u, _g).addScaledVector(lateral, sway(u)).normalize();
    return out.copy(_g).multiplyScalar(1 + altitude(u));
  };

  /** État de l'avion à l'instant t ; déterministe : sert aussi à l'historique de la condensation et aux étincelles. */
  const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _n = new THREE.Vector3(), _f2 = new THREE.Vector3(), _u2 = new THREE.Vector3();
  const state = (t, st) => {
    t = clamp01(t);
    const sec = t * PERIOD;
    const u = progress(t);
    const landing = lin(TL.land[0], TL.land[1], t);
    const pos = flightPos(u, st.pos);
    if (landing > 0) pos.normalize().multiplyScalar(1 + ALT0 * (1 - 0.6 * smooth(landing)));
    const du = 2e-3;
    flightPos(Math.min(1, u + du), _p1); flightPos(Math.max(0, u - du), _p0);
    const fwd = st.fwd.subVectors(_p1, _p0).normalize();          // nez dans la tangente (montée/descente comprises)
    _n.copy(pos).normalize();
    const up = st.up.copy(_n).addScaledVector(fwd, -_n.dot(fwd)).normalize();
    const right = st.right.crossVectors(fwd, up).normalize();
    // roulis : inclinaison vers l'intérieur des virages du S, plus un léger flottement ; tangage : phugoïde du planeur
    const env = Math.sin(Math.PI * u);
    const bank = BANK * (swayAcc(u) / accMax) + env * 0.05 * Math.sin(2 * Math.PI * 0.55 * sec + 1.1);
    const pitch = env * 0.055 * Math.sin(2 * Math.PI * 0.8 * sec);
    _f2.copy(fwd).multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch));
    _u2.copy(up).multiplyScalar(Math.cos(pitch)).addScaledVector(fwd, -Math.sin(pitch));
    st.fwd.copy(_f2);
    st.up.copy(_u2).multiplyScalar(Math.cos(bank)).addScaledVector(right, Math.sin(bank)).normalize();
    st.right.crossVectors(st.fwd, st.up).normalize();
    const grow = easeOutBack(lin(TL.pop[0], TL.pop[1], t) ** 1.6), shrink = 1 - smooth(landing) ** 1.5;
    st.scale = grow * shrink;
    // pivots : l'avion se déplie depuis sa queue et se replie dans la balise par le nez
    st.pos.addScaledVector(st.fwd, -F0 * SCALE * (1 - grow) + (NOSE_F - F0) * SCALE * (1 - shrink));
    // opacité liée à la taille : < 1 seulement tant que l'avion fait moins de 30 % de sa taille (≈ 15 px) ; au-dessus,
    // le papier reste opaque (un papier translucide montrait ses faces internes : « fantôme » à l'atterrissage)
    st.opacity = smooth(clamp01(st.scale / 0.3));
    st.trail = lin(TL.fly[0], TL.fly[0] + 0.05, t) * (1 - lin(TL.land[0], TL.land[0] + 0.03, t)); // poids d'un échantillon de condensation
    st.u = u; st.t = t;
    return st;
  };
  const newState = () => ({ pos: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3(), scale: 1, opacity: 1, trail: 0, u: 0, t: 0 });
  const toWorld = (st, l, out) => {
    const k = SCALE * st.scale;
    return out.copy(st.pos).addScaledVector(st.right, l.x * k).addScaledVector(st.up, l.y * k).addScaledVector(st.fwd, -l.z * k);
  };

  // ─── Avion ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const paper = buildPaper();
  keep(paper.geo);
  const front = keep(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.82, metalness: 0,
    side: THREE.FrontSide, shadowSide: THREE.DoubleSide, transparent: true,
  }));
  const back = keep(new THREE.MeshStandardMaterial({
    color: PURPLE, vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.BackSide, transparent: true,
  }));
  const inkMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true }));
  const creaseMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#5c4f37'), transparent: true }));

  const plane = new THREE.Group();
  plane.matrixAutoUpdate = false;
  const recto = new THREE.Mesh(paper.geo, front);
  recto.castShadow = true;               // pas d'auto-ombrage : papier sans épaisseur → acné (essai v1)
  const verso = new THREE.Mesh(paper.geo, back);
  const inkMesh = new THREE.Mesh(keep(buildTubes(paper.ink, INK_R)), inkMat);
  const foldMesh = new THREE.Mesh(keep(buildTubes(paper.folds, FOLD_R)), inkMat);
  const creaseMesh = new THREE.Mesh(keep(buildTubes(paper.creases, CREASE_R)), creaseMat);
  plane.add(recto, verso, inkMesh, foldMesh, creaseMesh);
  for (const o of plane.children) o.renderOrder = 2;
  scene.add(plane);

  // Ancrages locaux : queue (fin de la route), bouts de winglet (condensation, étincelles)
  const TIP_D = S_TIP - S_FOLD;
  const tipLocal = (sg) => L(sg * (S_FOLD + TIP_D * Math.cos(WINGLET)), wingH(S_FOLD) + TIP_D * Math.sin(WINGLET), 0.0);
  const ANCHOR = { tail: L(0, 0.004, 0.0), tipR: tipLocal(1), tipL: tipLocal(-1) };

  // ─── Perles de route au sol (crème cerclées de noir) ───────────────────────────────────────────────────────────────
  // Papier mat (comme les points plats de la route DOM Madrid → Paris), pas des billes brillantes.
  const BEAD_R = 0.0026, RING = 1.6;
  const nBeads = Math.max(8, Math.round(omega / 0.0142)); // ≈ 7 px CSS d'écart, comme stroke-dasharray 0 7
  const beadU = [];
  for (let i = 1; i < nBeads; i++) beadU.push(i / nBeads); // ni sur Paris (drapeau) ni sur Athènes (balise)
  const beadGeo = keep(new THREE.SphereGeometry(BEAD_R, 14, 10)); // ≈ 3 px CSS : 14×10 suffit, même en DPR 3
  const pearlMat = keep(new THREE.MeshStandardMaterial({ color: '#fbf3df', roughness: 0.9, metalness: 0 }));
  const ringMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
  const pearls = new THREE.InstancedMesh(beadGeo, pearlMat, beadU.length);
  const rings = new THREE.InstancedMesh(beadGeo, ringMat, beadU.length);
  pearls.castShadow = true;
  pearls.frustumCulled = rings.frustumCulled = false;
  scene.add(rings, pearls);
  const beadPos = beadU.map((u) => ground(u, new THREE.Vector3()).multiplyScalar(1 + BEAD_R * 0.8));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _tail = new THREE.Vector3(), _gp = new THREE.Vector3();
  /** Point du sol (u) dont la projection écran est la plus proche de la queue de l'avion : la route s'arrête là. */
  const trailHead = (st) => {
    const [tx, ty] = project(toWorld(st, ANCHOR.tail, _tail));
    const d2 = (u) => { const [x, y] = project(ground(u, _gp)); return (x - tx) ** 2 + (y - ty) ** 2; };
    let lo = 0, hi = 1; // toute la route : la distance écran à la queue y est unimodale
    for (let i = 0; i < 28; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (d2(a) < d2(b)) hi = b; else lo = a; }
    return (lo + hi) / 2;
  };

  // ─── Condensation : deux filets face caméra aux bouts des winglets (bandes dynamiques, alpha par sommet) ────────────
  const CON_N = 30, CON_DT = 0.116;            // 30 pas sur ≈ 0,75 s de vol
  const hist = Array.from({ length: CON_N + 1 }, newState);
  const conMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const strip = (n, color) => {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((n + 1) * 8), 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    const c = new THREE.Color(color), cols = g.attributes.color.array;
    for (let i = 0; i < cols.length; i += 4) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; cols[i + 3] = 0; }
    const m = new THREE.Mesh(g, conMat);
    m.frustumCulled = false;
    m.renderOrder = 3;
    scene.add(m);
    return m;
  };
  const conR = strip(CON_N, '#ffffff'), conL = strip(CON_N, '#ffffff');

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _v = new THREE.Vector3(), _side = new THREE.Vector3(), _tan = new THREE.Vector3();
  const writeStrip = (mesh, n, pointAt, widthAt, alphaAt) => {
    const P = mesh.geometry.attributes.position.array, C = mesh.geometry.attributes.color.array;
    for (let k = 0; k <= n; k++) {
      pointAt(k, _a);
      // face caméra : côté = tangente × direction de vue
      pointAt(Math.max(0, k - 1), _v); pointAt(Math.min(n, k + 1), _b);
      _tan.subVectors(_b, _v);
      if (_tan.lengthSq() < 1e-14) _tan.copy(hist[k].fwd);
      _side.crossVectors(_tan, _v.subVectors(camera.position, _a)).normalize();
      const w = widthAt(k) / 2;
      P.set([_a.x + _side.x * w, _a.y + _side.y * w, _a.z + _side.z * w, _a.x - _side.x * w, _a.y - _side.y * w, _a.z - _side.z * w], 6 * k);
      C[8 * k + 3] = C[8 * k + 7] = alphaAt(k);
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.color.needsUpdate = true;
  };

  // ─── Étincelles : étoile du fragment, jaune cerclée de noir, petit halo additif, toujours face caméra ─────────────
  const { star, rim } = starShapes(0.17);
  const starGeo = keep(new THREE.ShapeGeometry(star, 4)), rimGeo = keep(new THREE.ShapeGeometry(rim, 4));
  const glowTex = keep((() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,170,0.9)'); gr.addColorStop(0.35, 'rgba(247,220,111,0.35)'); gr.addColorStop(1, 'rgba(247,220,111,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  })());
  const glowGeo = keep(new THREE.PlaneGeometry(2, 2));
  const sparks = SPARKS.map(() => {
    const g = new THREE.Group();
    const mats = [
      keep(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
      keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false })),
      keep(new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, depthWrite: false, toneMapped: false })),
    ];
    const glow = new THREE.Mesh(glowGeo, mats[0]); glow.scale.setScalar(2.1); glow.renderOrder = 4;
    const r = new THREE.Mesh(rimGeo, mats[1]); r.renderOrder = 5;
    const s = new THREE.Mesh(starGeo, mats[2]); s.renderOrder = 6;
    g.add(glow, r, s);
    g.visible = false;
    scene.add(g);
    return { g, mats };
  });
  const SPARK_R = 0.0115; // rayon monde ≈ 6 px CSS (étoile de 12 px, comme .spark du fragment)
  const evState = newState(), target = toVec(...ATHENES).multiplyScalar(1 + 0.014);
  // point de naissance : bout du winglet à l'instant t0 (l'avion s'en éloigne ensuite), ou la balise
  const sparkHome = SPARKS.map((ev) => (ev.at === 'target' ? target.clone() : toWorld(state(ev.t0, evState), ANCHOR[ev.at], new THREE.Vector3())));
  let sparksOn = true;

  // ─── Une image ────────────────────────────────────────────────────────────────────────────────────────────────────
  const cur = newState();
  const update = (t) => {
    state(t, cur);
    const k = SCALE * Math.max(cur.scale, 1e-4);
    plane.matrix.makeBasis(cur.right, cur.up, _v.copy(cur.fwd).negate()).scale(_s.set(k, k, k)).setPosition(cur.pos);
    plane.matrixWorldNeedsUpdate = true;
    plane.visible = cur.scale > 1e-3 && cur.opacity > 1e-3;
    for (const m of [front, back, inkMat, creaseMat]) m.opacity = cur.opacity;

    // perles : la route se trace depuis Paris pendant l'apparition, s'allonge derrière la queue (vue écran), puis
    // s'éteint en vague
    const head = trailHead(cur) * smooth(lin(TL.pop[0], TL.fly[0] + 0.04, t));
    const out = lin(TL.beadsOut[0], TL.beadsOut[1], t);
    for (let i = 0; i < beadU.length; i++) {
      const born = easeOutBack(clamp01((head - beadU[i]) / 0.035), 2.2);
      const sc = born * (1 - smooth(clamp01(out * 1.6 - (i / beadU.length) * 0.6)));
      _m.compose(beadPos[i], _q.identity(), _s.set(sc, sc, sc));
      pearls.setMatrixAt(i, _m);
      _m.compose(beadPos[i], _q, _s.set(sc * RING, sc * RING, sc * RING));
      rings.setMatrixAt(i, _m);
    }
    pearls.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = true;

    // condensation : historique analytique des bouts de winglet
    for (let i = 0; i <= CON_N; i++) state(t - (i / CON_N) * CON_DT, hist[i]);
    for (const [mesh, key] of [[conR, 'tipR'], [conL, 'tipL']]) {
      writeStrip(mesh, CON_N,
        (i, o) => toWorld(hist[i], ANCHOR[key], o),
        () => 0.0021,
        (i) => 0.85 * cur.opacity * hist[i].trail * (1 - i / CON_N) ** 1.3 * smooth(Math.min(1, i / 2)));
    }

    // étincelles
    SPARKS.forEach((ev, j) => {
      const p = (t - ev.t0) / ev.dur, sp = sparks[j];
      sp.g.visible = sparksOn && p > 0 && p < 1;
      if (!sp.g.visible) return;
      const a = Math.sin(Math.PI * p) ** 0.7;
      const tw = 0.82 + 0.18 * Math.cos(2 * Math.PI * 3 * p); // scintillement
      sp.g.position.copy(sparkHome[j]);
      sp.g.quaternion.copy(camera.quaternion);
      sp.g.rotateZ(0.5 * p);
      sp.g.scale.setScalar(SPARK_R * ev.size * a * tw);
      sp.mats[0].opacity = 0.75 * a; sp.mats[1].opacity = a; sp.mats[2].opacity = a;
    });
  };

  // ─── Boucle, pose figée, mouvement réduit ──────────────────────────────────────────────────────────────────────────
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const frozen = Number.isFinite(fixedT) ? clamp01(fixedT) : stage.frozenT;
  let stop = () => {};
  const still = (t) => { stop(); stop = () => {}; update(t); stage.render(); };
  const start = () => {
    sparksOn = true;
    if (frozen !== null) return still(frozen);
    if (mq?.matches) { sparksOn = false; return still(T_MID); } // pose fixe au milieu exact du trajet, sans étincelle
    stop = stage.loop((t) => update(t), { period: PERIOD });
  };
  const onMotion = () => { stop(); start(); };
  mq?.addEventListener?.('change', onMotion);
  start();

  // Silhouettes écran (banc d'essai) : enveloppe convexe des sommets de contour de l'avion, et de leur ombre (chaque
  // sommet poussé le long de −soleil jusqu'à la sphère unité).
  const hull = (pts) => {
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  };
  const onGround = (q) => { const b = q.dot(sunDir), c = q.lengthSq() - 1; return q.clone().addScaledVector(sunDir, -(b - Math.sqrt(Math.max(0, b * b - c)))); };

  return {
    stage,
    /** Mesures pour le banc d'essai : position écran, silhouettes, coût du dernier rendu. */
    probe() {
      const info = renderer.info.render, w = new THREE.Vector3();
      const pts = cur.scale > 1e-3 ? paper.outline.map((l) => toWorld(cur, l, new THREE.Vector3())) : [];
      return { planeXY: project(cur.pos), u: cur.u, scale: cur.scale, opacity: cur.opacity, triangles: info.triangles, calls: info.calls,
        tips: [project(toWorld(cur, ANCHOR.tipL, w)), project(toWorld(cur, ANCHOR.tipR, w))],
        nose: project(toWorld(cur, L(0, 0, NOSE_F), w)), tail: project(toWorld(cur, ANCHOR.tail, w)),
        hull: pts.length ? hull(pts.map(project)) : [], shadowHull: pts.length ? hull(pts.map((p) => project(onGround(p)))) : [],
        sparks: sparks.filter((s) => s.g.visible).length };
    },
    renderAt(t) { update(t); stage.render(); },
    dispose() {
      stop(); stop = () => {};
      mq?.removeEventListener?.('change', onMotion);
      pearls.dispose(); rings.dispose();
      for (const d of disposables) d.dispose?.();
      stage.shadowCatcher.geometry.dispose(); stage.shadowCatcher.material.dispose();
      stage.globeOccluder.geometry.dispose(); stage.globeOccluder.material.dispose();
      lights.sun.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}

/*
 * ─── Portage dans le globe du jeu (WebGPURenderer + TSL) ───────────────────────────────────────────────────────────────
 * - Matériaux : MeshStandardMaterial → MeshStandardNodeMaterial, MeshBasicMaterial → MeshBasicNodeMaterial (automatique
 *   avec three/webgpu). Recto/verso = deux maillages sur la même géométrie (FrontSide crème, BackSide violet) : se porte
 *   tel quel ; en TSL on peut fusionner en un seul maillage DoubleSide avec colorNode = select(frontFacing, crème, violet).
 * - Ombre : le shadowCatcher disparaît, la Terre (earth.receiveShadow) reçoit l'ombre du DirectionalLight du Globe ;
 *   recto.castShadow + shadowSide DoubleSide (papier sans épaisseur), perles castShadow. Pas d'auto-ombrage du papier.
 * - Exposition : le jeu sort sans tone mapping (NoToneMapping + bloom sur l'émissif) ; l'exposition 1,4 de ce prototype
 *   se reporte en un léger emissiveNode crème sur le papier (ou un éclairage de remplissage propre à l'avion).
 * - Halo additif de l'étincelle : AdditiveBlending fonctionne ; dans le jeu, l'étoile peut porter un émissif jaune et
 *   laisser le bloom faire le halo (supprimer alors la texture de halo).
 * - Bandes dynamiques (condensation) : BufferAttribute DynamicDrawUsage + needsUpdate, couleur RGBA par sommet
 *   (vertexColors) : supporté par WebGPURenderer. Calcul CPU (31 états par image) ; portable en compute TSL si besoin.
 * - Tubes d'encre : géométrie statique fusionnée, aucun shader spécifique. Avec setViewOffset identique, project() reste juste.
 */
