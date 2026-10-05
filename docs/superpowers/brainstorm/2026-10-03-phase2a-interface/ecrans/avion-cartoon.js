/**
 * avion-cartoon.js — avion en papier 3D « cartoon premium » pour l'écran d'accueil G5 · Escales (Paris → Athènes).
 *
 *   import { mount } from '/files/avion-cartoon.js';
 *   const vol = mount(canvas, { t });   // t ∈ [0, 1] : instant figé (captures) ; sinon data-t / ?t= ; sinon animation
 *   vol.dispose();
 *
 * Parti pris : un avion plié dans un papier BICOLORE — recto crème #fff8e7 (dessus des ailes), verso violet #6225e6
 * (dessous des ailes et flancs de la quille : c'est la même face du papier, elle tourne autour de l'emplanture). Vu par
 * la caméra du globe et incliné dans son virage, il donne en volume l'icône 2D du fragment : aile crème, quille violette,
 * autre aile sombre. Ombrage en aplats (MeshToonMaterial, carte de dégradé à 3 marches) sous un soleil chaud + un
 * remplissage lavande : le ton haut rend exactement #fff8e7 / #6225e6, le ton bas une ombre violacée.
 * Contour noir en LIGNES ÉPAISSES posées sur les arêtes du papier (bords 2,3 px CSS, plis 1,25 px partant de mi-corde) :
 * une feuille n'a pas de volume, une coque inversée n'y dessine rien, alors que ses bords SONT sa silhouette.
 * Papier opaque : apparition et disparition par l'échelle seule. Ombre portée nette sur une calotte réceptrice, refusée
 * sur la balise d'Athènes (réserve de profondeur). Traînée : perles crème cerclées de noir (sphère + coque inversée).
 *
 * Vol : grand cercle Paris → Athènes, cloche d'altitude asymétrique (montée vive, descente longue), virage à gauche
 * stabilisé (décalage latéral 4e(1−e) ≤ 2 px, courbure constante) d'où un roulis « coordonné » de 40° — il montre la
 * quille à la caméra, qui voit l'avion de l'avant-droite à ≈ 50° au-dessus — déjà incliné quand il apparaît (relecture :
 * une mise en virage depuis 0° montrait l'aile proche par la tranche), en partie repris avant de se poser ; nez dans la tangente (montée ≤ 24°, descente ≤ 15°), oscillation de tangage ±1,2°.
 * Tout est fonction pure de t (boucle, captures, mouvement réduit : pose fixe au milieu, sans oscillation).
 *
 * Aucune variable globale ni état de module : tout vit dans la fermeture de mount() ; plusieurs instances coexistent.
 *
 * Portage WebGPU/TSL : MeshToonMaterial → MeshToonNodeMaterial (même lecture du canal r de gradientMap),
 * ShadowMaterial → ShadowNodeMaterial, MeshBasicMaterial (coque) → MeshBasicNodeMaterial, LineSegments2/LineMaterial →
 * three/addons/lines/webgpu/LineSegments2.js + Line2NodeMaterial. Les couleurs « cartoon » des lumières se portent par
 * material.lightsNode = lights([soleilChaud, remplissageLavande]) (même direction que le soleil du globe) ; l'ombre par
 * le DirectionalLight du Globe (castShadow sur l'avion, la Terre reçoit). Le biais de profondeur des contours est une
 * translation d'objet (majContour) : il se porte tel quel.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createStage, pathFrame, slerpPath, toVec } from './avion-socle.js';

const RAD = Math.PI / 180;
const PARIS = Object.freeze([2.35, 48.86]);
const ATHENES = Object.freeze([23.73, 37.98]);
const OMEGA = Math.acos(toVec(...PARIS).dot(toVec(...ATHENES))); // 0,3291 rad

/** Réglages (unités monde : Terre de rayon 1 ; sur le trajet, 0,01 ≈ 4,6 px CSS en travers, 4,7–5,5 px en long). */
export const REGLAGES = Object.freeze({
  periode: 6.5,             // s, comme d5-fly
  longueur: 0.09,           // nez → bord de fuite ; envergure 1,32 × longueur
  uDepart: 0.36,            // déjà incliné, l'aile proche (bout au bord de fuite) pointe vers Paris : départ assez loin
                            // pour qu'elle et son ombre laissent libres l'anneau, le mât et le drapeau (relecture, mesuré)
  uArrivee: 0.825,          // le nez se pose au bord de l'anneau de la balise d'Athènes (sans couvrir son centre)
  altSol: 0.02,             // altitude du repère avion aux deux bouts (la quille frôle le sol)
  altMax: 0.043,            // sommet de la cloche (montée ≤ 24°, descente ≤ 15°)
  virage: 0.004,            // décalage latéral maximal (à droite du grand cercle, au milieu) → virage à gauche continu
  inclinaisonMax: 40,       // degrés : la caméra (≈ 54° au-dessus du plan des ailes à plat) descend à ≈ 14°,
                            // la quille violette sort sous l'aile proche — la vue de profil de l'icône 2D
  arrondi: 3,               // degrés de nez relevé à l'atterrissage (au-delà, le dessus se montre de face : « éventail »)
  bandeau: false,           // ailes intérieures violettes sur le recto (essayé : se confond avec la quille)
  forme: { quille: 0.27, diedres: [6, 26], winglet: false }, // quille (× longueur), dièdres int./ext. (°), winglets
                            // dièdre extérieur 26° : incliné de 40°, l'aile proche montre son dessous (bande violette)
                            // au lieu d'être vue par la tranche (un bâton noir à 8/16°) ; winglets essayés : à 40 px,
                            // le winglet proche vu par la tranche fait un nœud de traits au talon
  perles: { u0: 0.08,  u1: 0.93, pas: 0.0146, rayon: 0.0029, cerne: 0.0017 },
  contour: { bord: 2.3, pli: 1.25, pliOpacite: 1 }, // px CSS
  ombre: { couleur: 0x120c33, opacite: 0.45 },
  balise: { rayon: 0.026, hauteur: 0.0004 }, // réserve sans ombre sur la balise d'Athènes (≈ 14 px : anneau 12 px + liseré)
});

// Chronologie d'une boucle (t ∈ [0, 1) sur `periode`).
const T_POP = [0.015, 0.075];    // apparition (échelle + fondu)
const T_VOL = [0.04, 0.96];      // vol : t = 0,5 ↔ milieu
const T_FIN = [0.93, 0.975];     // l'avion posé disparaît
const T_EFFACE = [0.95, 0.995];  // les perles s'effacent de Paris vers Athènes

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lin = (x, a, b) => clamp01((x - a) / (b - a));
const easeOutBack = (x) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const lisse = (x) => x * x * (3 - 2 * x);
/** Progression du vol : accélère au décollage, ralentit à l'atterrissage (vitesse résiduelle 45 % aux bouts). */
export const progression = (s) => s - 0.55 * Math.sin(2 * Math.PI * s) / (2 * Math.PI);

/**
 * Géométrie (repère local : x = nez, y = haut, z = droite ; longueur 1). Triangles orientés recto (normale côté recto),
 * rangés en deux groupes : 0 = recto crème, 1 = recto violet (bandeau et intérieur de quille).
 *   Plan large de planeur-flèche (flèche du bord d'attaque 57°) : à la taille d'un téléphone, une flèche étroite se lit
 *   comme un éventail dès qu'elle pointe vers la caméra. Coupe vue de l'arrière : quille en V très fermé sous l'axe ;
 *   aile intérieure (dièdre 6°), pli, aile extérieure (dièdre 26°) ; winglet relevé à 72° en option (forme.winglet).
 */
export function papier({ bandeau = false, forme = { quille: 0.27, diedres: [6, 26], winglet: false } } = {}) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const NEZ = V(0.5, 0, 0);
  const xF = -0.5;
  const fente = 0.004;                    // demi-écart des deux emplantures (pas de faces confondues)
  const zPli = 0.25, diedreInt = forme.diedres[0] * RAD;
  const zBout = 0.66, diedreExt = forme.diedres[1] * RAD;
  const zWing = forme.winglet === false ? zBout : 0.58, releve = 72 * RAD;
  const QUILLE = V(-0.44, -forme.quille, 0);
  const creme = [], violet = [], bords = [], plis = [], bouts = [];
  const vers = (a, b, f) => a.clone().lerp(b, f);
  for (const s of [-1, 1]) {
    const R = V(xF, 0, s * fente);
    const yC = (zPli - fente) * Math.tan(diedreInt);
    const C = V(xF, yC, s * zPli);
    const T = V(xF, yC + (zBout - zPli) * Math.tan(diedreExt), s * zBout);
    const E = vers(NEZ, T, zWing / zBout);
    const W = vers(C, T, (zWing - zPli) / (zBout - zPli));
    const axe = W.clone().sub(E).normalize();
    const a = T.clone().sub(E).applyAxisAngle(axe, releve).add(E);
    const b = T.clone().sub(E).applyAxisAngle(axe, -releve).add(E);
    const Tr = a.y > b.y ? a : b;
    bouts.push(W);
    const dessus = V(0, 1, 0), dedans = V(0, 0, -s);
    (bandeau ? violet : creme).push([NEZ, R, C, dessus]);
    if (forme.winglet !== false) creme.push([NEZ, C, W, dessus], [NEZ, W, E, dessus], [E, W, Tr, dedans]);
    else creme.push([NEZ, C, T, dessus]); // sans winglet : E = W = T, l'aile extérieure est un seul triangle
    violet.push([NEZ, R, QUILLE, dedans]);
    if (forme.winglet !== false) { bords.push([E, Tr], [Tr, W]); plis.push([E, W]); } // sinon E = W : pas d'arête nulle (le bout rond ferait un point)
    bords.push([NEZ, E], [W, C], [C, R], [R, QUILLE]);
    plis.push([vers(NEZ, C, 0.45), C], [vers(NEZ, R, 0.35), R]); // partent de mi-corde : pas de faisceau vers le nez
  }
  bords.push([QUILLE, NEZ]);
  const pos = [];
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const [A, B, C, ref] of [...creme, ...violet]) {
    n.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A));
    const [P, Q] = n.dot(ref) >= 0 ? [B, C] : [C, B];
    pos.push(A.x, A.y, A.z, P.x, P.y, P.z, Q.x, Q.y, Q.z);
  }
  const flat = (segs) => segs.flatMap(([A, B]) => [A.x, A.y, A.z, B.x, B.y, B.z]);
  return { positions: new Float32Array(pos), nCreme: creme.length, nViolet: violet.length, bords: flat(bords), plis: flat(plis),
    reperes: { nez: NEZ, queue: V(xF, 0, 0), bouts } };
}

// ── trajectoire (fonctions pures de e ∈ [0, 1], progression normalisée du vol) ──
const uDe = (e, R) => R.uDepart + (R.uArrivee - R.uDepart) * e;
// Cloche asymétrique, plate aux deux bouts : montée vive (sommet à e ≈ 0,38), longue descente plus plate — en descente le
// nez baisse vers la caméra et l'avion se montre de dessus (« éventail ») : on la veut douce.
const cloche = (e) => Math.sin(Math.PI * clamp01(e) ** 0.75) ** 1.4;
const altDe = (e, R) => R.altSol + (R.altMax - R.altSol) * cloche(e);
const latDe = (e, R) => R.virage * 4 * e * (1 - e); // courbure constante : virage stabilisé
function pointDe(e, R, out = new THREE.Vector3()) {
  const f = pathFrame(PARIS, ATHENES, uDe(e, R), 0);
  return out.copy(f.up).multiplyScalar(1 + altDe(e, R)).addScaledVector(f.right, latDe(e, R));
}
/** Position, vitesse et courbure latérale signée (> 0 : virage à droite), par différences finies. */
function cinematique(e, R) {
  const h = 1e-3;
  const a = pointDe(e - h, R), b = pointDe(e, R), c = pointDe(e + h, R);
  const vit = c.clone().sub(a);
  const acc = c.clone().sub(b).sub(b).add(a);
  const droite = new THREE.Vector3().crossVectors(vit, b).normalize();
  return { position: b, vitesse: vit, courbure: (acc.dot(droite) * 4) / vit.lengthSq() };
}
/** Gain de roulis : virage coordonné normalisé pour que l'inclinaison culmine à inclinaisonMax. */
export function gainRoulis(R = REGLAGES) {
  let kMax = 0;
  for (let i = 0; i <= 200; i++) kMax = Math.max(kMax, Math.abs(cinematique(i / 200, R).courbure));
  return kMax > 0 ? Math.tan(R.inclinaisonMax * RAD) / kMax : 0;
}

/**
 * Pose de l'avion à la progression e (et à l'horloge `sec` pour l'oscillation ; 0 = sans oscillation).
 * Nez dans la tangente de la trajectoire (montée/descente comprises), haut selon la verticale locale, roulis de virage
 * coordonné, arrondi d'atterrissage, oscillation de tangage ±1,2° (pas d'oscillation de roulis : elle ferait papilloter
 * les aplats des faces proches d'un seuil).
 */
export function pose(e, sec = 0, R = REGLAGES, gain = gainRoulis(R)) {
  const { position, vitesse, courbure } = cinematique(e, R);
  const fw = vitesse.normalize();
  const droite = new THREE.Vector3().crossVectors(fw, position.clone().normalize()).normalize();
  const haut = new THREE.Vector3().crossVectors(droite, fw);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fw, haut, droite));
  // Déjà en virage au départ (relecture) : une mise en virage depuis 0° faisait passer l'aile proche extérieure PAR LA
  // TRANCHE (0,5° à t = 0,15, < 9° de t ≈ 0,08 à 0,2) — un bâton noir pointé vers Paris qui touchait son anneau. Avec le
  // dièdre de 26°, l'aile proche n'est qu'à 5° de la tranche à roulis nul : la traversée est inévitable en vol, on la
  // supprime. Le « pop » d'apparition tient lieu d'entrée en virage. Sortie partielle avant de se poser (inchangée).
  const enveloppe = 1 - 0.3 * lisse(lin(e, 0.86, 1));
  const roulis = Math.atan(gain * courbure) * enveloppe;
  const tangage = R.arrondi * RAD * lisse(lin(e, 0.8, 1)) + 1.2 * RAD * Math.sin(sec * 2.9 + 0.7);
  q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(roulis, 0, tangage, 'XZY')));
  return { position, quaternion: q, roulis, tangage };
}

/**
 * Carte de dégradé toon : 3 marches en N·L (bas < 0,22 ≤ moyen < 0,41 ≤ haut). Canal r seul (WebGL comme TSL).
 * Seuils posés d'après les N·L mesurés face par face le long du vol (essai plages2.mjs, inclinaison 40°, dièdres 6/26°) :
 * au milieu, aile lointaine 0,50…0,67 (haut, crème), dessous de l'aile proche −0,28 (bas, violet sombre), flanc de quille
 * 0,44 (haut : #6225e6 plein ; l'aile proche intérieure, à 0,41 pile, n'est vue que par la tranche) — le schéma de l'icône 2D (aile crème, autre aile sombre, quille violette). Au décollage
 * la quille sort du ton bas en s'inclinant ; vers Athènes le soleil baisse (N·s = 0,61 au sol) : l'aile lointaine reste
 * haute. Chaque face bascule une ou deux fois par vol, au gré de l'inclinaison et du tangage ; pas d'oscillation de
 * roulis, donc pas de papillotement autour d'un seuil.
 */
export const SEUILS = Object.freeze([0.22, 0.41]);
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

/**
 * Lumières « cartoon » : DIRECTION du soleil du globe gardée (ombre cohérente avec la capture), couleurs choisies pour
 * que les trois tons tombent sur la palette. Multiplicateurs linéaires (Lambert = albédo/π) :
 *   bas = h (remplissage lavande) ; haut = h + S = (1, 1, 1) (le crème ressort #fff8e7, le violet #6225e6) ; moyen = h + S/2.
 */
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
  // Caméra d'ombre serrée sur le trajet (±0,24 → 0,23 millième d'unité par texel en 2048²) : bord net.
  const mid = slerpPath(PARIS, ATHENES, 0.5, 0);
  sun.target.position.copy(mid);
  sun.position.copy(mid).addScaledVector(stage.sunDir, 1);
  const sc = sun.shadow.camera;
  sc.left = -0.24; sc.right = 0.24; sc.top = 0.24; sc.bottom = -0.24; sc.near = 0.7; sc.far = 1.3;
  sc.updateProjectionMatrix();
  sun.shadow.radius = 1.5;
  sun.shadow.bias = -0.00005;
  sun.shadow.normalBias = 0;
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
}

/** Calotte réceptrice d'ombre (lng −9…35°, lat 28…57°, 1° par facette) : 2 552 triangles au lieu des 147 456 du socle. */
function calotteOmbre(R) {
  const L0 = -9, L1 = 35, B0 = 28, B1 = 57;
  // SphereGeometry : x = −cos φ sin θ, y = cos θ, z = sin φ sin θ ; toVec : φ = π + lng, θ = 90° − lat.
  const geo = new THREE.SphereGeometry(1, L1 - L0, B1 - B0, Math.PI + L0 * RAD, (L1 - L0) * RAD, (90 - B1) * RAD, (B1 - B0) * RAD);
  const mesh = new THREE.Mesh(geo, new THREE.ShadowMaterial({ color: R.ombre.couleur, opacity: R.ombre.opacite }));
  mesh.receiveShadow = true;
  mesh.name = 'calotteOmbre';
  return mesh;
}

/**
 * Monte l'avion sur `canvas` (transparent, posé sur le téléphone 390×844).
 * @param {HTMLCanvasElement} canvas
 * @param {{ t?: number, reglages?: object }} [options]  t ∈ [0, 1] fige l'instant (sinon data-t du canvas ou ?t=)
 * @returns {{ dispose(): void, stats(): object, cadre(): { boite: number[], envergure: number, longueur: number },
 *            ombre(): number[][], mesurer(n?: number, t?: number): number }}
 *          (stats, cadre, ombre et mesurer servent aux bancs d'essai ; le contrat est mount → { dispose }).
 */
export function mount(canvas, { t: tFige = undefined, reglages = {} } = {}) {
  const R = { ...REGLAGES, ...reglages };
  const stage = createStage(canvas, { toneMapping: 'none' });
  const { renderer, scene, camera } = stage;
  const fige = Number.isFinite(tFige) ? clamp01(tFige) : stage.frozenT;
  const gain = gainRoulis(R);
  eclairageCartoon(stage);
  const jetables = [];
  const garde = (x) => (jetables.push(x), x);

  // ── avion ──
  const p = papier(R);
  const geoPapier = garde(new THREE.BufferGeometry());
  geoPapier.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
  geoPapier.computeVertexNormals(); // non indexée → normale de face : aplats exacts
  geoPapier.addGroup(0, p.nCreme * 3, 0);
  geoPapier.addGroup(p.nCreme * 3, p.nViolet * 3, 1);
  const grad = garde(carteToon());
  // Papier OPAQUE (relecture) : en transparence, le fondu montrait la structure (faces et traits les uns à travers les
  // autres, un fantôme gris) ; l'apparition et la disparition passent par l'échelle seule.
  // polygonOffset (relecture) : vues presque par la tranche (aile proche à 8° de la tranche à mi-vol), les faces perçaient
  // le trait noir qui les borde en un pointillé violet régulier, malgré l'avance de 0,011 du contour ; le biais proportionnel
  // à la pente en profondeur les recule là où il faut. (WebGPU : depthBias / depthBiasSlopeScale du matériau.)
  const toon = (color, side) => garde(new THREE.MeshToonMaterial({ color, gradientMap: grad, side,
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
  const rectoCreme = toon(0xfff8e7, THREE.FrontSide), rectoViolet = toon(0x6225e6, THREE.FrontSide), verso = toon(0x6225e6, THREE.BackSide);
  const mVerso = new THREE.Mesh(geoPapier, verso);
  const mRecto = new THREE.Mesh(geoPapier, [rectoCreme, rectoViolet]);
  rectoCreme.shadowSide = rectoViolet.shadowSide = THREE.DoubleSide; // une feuille porte ombre par ses deux faces
  mRecto.castShadow = true;
  const avion = new THREE.Group();
  avion.add(mVerso, mRecto);

  const contour = new THREE.Group();
  const resolution = renderer.getSize(new THREE.Vector2()); // px CSS : linewidth en px CSS quel que soit le DPR
  const trait = (segments, largeur, couleur, opacite) => {
    const g = garde(new LineSegmentsGeometry());
    g.setPositions(segments);
    const m = garde(new LineMaterial({ color: couleur, linewidth: largeur, worldUnits: false, transparent: true, opacity: opacite, depthWrite: false, alphaToCoverage: true }));
    m.resolution.copy(resolution);
    const l = new LineSegments2(g, m);
    l.renderOrder = 3;
    l.userData = { largeur, opacite };
    return l;
  };
  const traits = [trait(p.plis, R.contour.pli, 0x000000, R.contour.pliOpacite), trait(p.bords, R.contour.bord, 0x000000, 1)];
  traits[1].renderOrder = 4;
  contour.add(...traits);
  avion.add(contour);
  scene.add(avion);

  // ── perles de la traînée ──
  const P = R.perles;
  const nPerles = Math.floor(((P.u1 - P.u0) * OMEGA) / P.pas) + 1;
  const uPerle = Array.from({ length: nPerles }, (_, i) => P.u0 + (i * P.pas) / OMEGA);
  const geoPerle = garde(new THREE.SphereGeometry(1, 12, 8));
  const perles = new THREE.InstancedMesh(geoPerle, garde(new THREE.MeshToonMaterial({ color: 0xfff8e7, gradientMap: grad })), nPerles);
  const cernes = new THREE.InstancedMesh(geoPerle, garde(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })), nPerles);
  perles.castShadow = true;
  perles.frustumCulled = cernes.frustumCulled = false;
  scene.add(perles, cernes);

  const calotte = calotteOmbre(R);
  garde(calotte.geometry); garde(calotte.material);
  scene.add(calotte);
  // Réserve de la balise d'Athènes (relecture) : à l'atterrissage, l'ombre portée en avant grisait le cœur lumineux de la
  // balise (jusqu'à 65 px² sur ≈ 95, t = 0,83 → 0,95) et son anneau. Dans le jeu, la balise DOM passe au-dessus de la
  // scène ; ici la toile est au-dessus du DOM. Un disque qui n'écrit que la profondeur, 0,4 millième au-dessus du sol et
  // dessiné en premier, refuse l'ombre sur la balise. L'avion et les perles, plus haut, n'en sont pas affectés.
  const reserve = new THREE.Mesh(garde(new THREE.CircleGeometry(R.balise.rayon, 48)),
    garde(new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })));
  reserve.position.copy(toVec(...ATHENES)).multiplyScalar(1 + R.balise.hauteur);
  reserve.lookAt(0, 0, 0);
  reserve.renderOrder = -1;
  reserve.name = 'reserveBalise';
  scene.add(reserve);

  const mat = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
  const placerPerles = (uVisible, t) => {
    for (let i = 0; i < nPerles; i++) {
      const naissance = clamp01((uVisible - uPerle[i]) / 0.035);
      const d = T_EFFACE[0] + 0.03 * (i / nPerles);
      const efface = t === null ? 0 : lin(t, d, d + 0.015);
      const s = naissance > 0 ? Math.max(0, easeOutBack(naissance)) * (1 - lisse(efface)) : 0;
      slerpPath(PARIS, ATHENES, uPerle[i], 0, pp).multiplyScalar(1 + P.rayon + P.cerne); // posée sur le sol
      perles.setMatrixAt(i, mat.compose(pp, q0, sc.setScalar(P.rayon * s)));
      cernes.setMatrixAt(i, mat.compose(pp, q0, sc.setScalar((P.rayon + P.cerne) * s)));
    }
    perles.instanceMatrix.needsUpdate = cernes.instanceMatrix.needsUpdate = true;
  };

  /** Biais de profondeur des contours : le groupe de traits avance de 0,011 longueur (≈ 1 millième d'unité) vers la
   * caméra ; il ne dispute plus la profondeur aux faces qu'il borde et reste caché par une face plus proche. */
  const camLocal = new THREE.Vector3();
  const majContour = (echelle) => {
    avion.updateMatrixWorld(true);
    avion.worldToLocal(camLocal.copy(camera.position));
    contour.position.copy(camLocal.normalize().multiplyScalar(0.011));
    for (const l of traits) l.material.linewidth = l.userData.largeur * Math.min(1, echelle);
  };

  /** État complet à l'instant t (fonction pure de t). */
  const etat = (t, sec, reduit) => {
    let e, echelle, uVisible, tEff = t;
    if (reduit) {
      e = 0.5; echelle = 1; tEff = null; sec = 0;
      uVisible = uDe(0.5, R);
    } else {
      e = progression(lin(t, T_VOL[0], T_VOL[1]));
      const apparition = lin(t, T_POP[0], T_POP[1]);
      const fin = lin(t, T_FIN[0], T_FIN[1]);
      echelle = Math.max(0, easeOutBack(apparition)) * (1 - lisse(fin)) * (1 + 0.12 * Math.sin(Math.PI * fin));
      uVisible = t < T_FIN[0] ? uDe(e, R) : uDe(1, R) + (P.u1 - uDe(1, R)) * lin(t, T_FIN[0], T_FIN[1]);
      if (t < T_POP[1]) uVisible = t < T_POP[0] ? -1 : P.u0 + (uVisible - P.u0) * apparition; // les perles sortent du drapeau
    }
    const ps = pose(e, sec, R, gain);
    avion.position.copy(ps.position);
    avion.quaternion.copy(ps.quaternion);
    avion.scale.setScalar(R.longueur * Math.max(echelle, 1e-4));
    avion.visible = echelle > 0.002;
    // L'ombre grandit et rapetisse avec l'avion ; son opacité suit en plus l'échelle, pour que le « pop » ne fasse pas
    // claquer une tache sombre à pleine opacité sous un avion encore minuscule.
    calotte.material.opacity = R.ombre.opacite * clamp01(echelle);
    majContour(echelle);
    placerPerles(uVisible, tEff);
  };

  // ── boucle ──
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
    if (media?.matches) { etat(0.5, 0, true); rendre(); return; }
    t0 = null;
    raf = requestAnimationFrame(image);
  };
  media?.addEventListener?.('change', demarrer);
  demarrer();

  const coin = new THREE.Vector3();
  const sommets = () => {
    avion.updateMatrixWorld(true);
    const pos = geoPapier.attributes.position, out = [];
    for (let i = 0; i < pos.count; i++) out.push(coin.fromBufferAttribute(pos, i).applyMatrix4(avion.matrixWorld).clone());
    return out;
  };
  return {
    /** Coût de la dernière image (renderer.info). */
    stats() {
      const i = renderer.info;
      return { triangles: i.render.triangles, appels: i.render.calls, geometries: i.memory.geometries, textures: i.memory.textures,
        perles: nPerles, dpr: renderer.getPixelRatio(), reduit: !!media?.matches, fige };
    },
    /** Boîte écran (px CSS) de l'avion [x0, y0, x1, y1], envergure et longueur vues à l'écran (px CSS). */
    cadre() {
      const xy = sommets().map((v) => stage.project(v));
      const ecran = (v) => stage.project(v.clone().applyMatrix4(avion.matrixWorld));
      const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const [g, dr] = p.reperes.bouts.map(ecran);
      return { boite: [Math.min(...xy.map((a) => a[0])), Math.min(...xy.map((a) => a[1])), Math.max(...xy.map((a) => a[0])), Math.max(...xy.map((a) => a[1]))],
        envergure: d(g, dr), longueur: d(ecran(p.reperes.nez), ecran(p.reperes.queue)) };
    },
    /** Aide aux essais : sommets projetés le long du soleil sur la sphère unité, en px CSS (ombre attendue). */
    ombre() {
      const s = stage.sunDir;
      return sommets().map((v) => {
        const b = v.dot(s), k = b - Math.sqrt(b * b - (v.lengthSq() - 1)); // v − k·s sur |x| = 1
        return stage.project(v.addScaledVector(s, -k));
      });
    },
    /** Temps moyen d'une image (ms) : n rendus de l'instant t, terminés par une lecture d'un pixel (synchronisation). */
    mesurer(n = 60, t = 0.5) {
      const gl = renderer.getContext(), px = new Uint8Array(4);
      etat(t, t * R.periode, false); rendre(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const a = performance.now();
      for (let i = 0; i < n; i++) { etat(t, t * R.periode + i / 60, false); renderer.render(scene, camera); }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return (performance.now() - a) / n;
    },
    /** Arrête la boucle, vide la toile (transparente) et libère géométries, matériaux, textures et cibles d'ombre. Pas de
     * forceContextLoss : Chrome peint une toile au contexte perdu en blanc opaque (essai multi.mjs) ; le contexte est rendu
     * au navigateur quand la toile quitte le DOM, et un nouveau mount() sur la même toile le réutilise. */
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
      stage.lights.sun.shadow.dispose(); // carte d'ombre 2048²
      renderer.dispose();
      delete canvas.dataset.ready;
    },
  };
}
