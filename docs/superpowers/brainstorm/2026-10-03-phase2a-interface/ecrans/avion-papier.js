/**
 * avion-papier.js — avion en papier 3D, style « papier réaliste », pour l'écran d'accueil G5 · Escales.
 *
 *   import { mount } from '/files/avion-papier.js';
 *   const h = mount(canvas, { t });   // t ∈ [0, 1] facultatif : fige le vol à cet instant (captures)
 *   h.dispose();                      // options : dpr, flight (surcharge de FLIGHT) ; h.info() : mesures
 *
 * Priorité de l'instant figé : option `t` > `data-t` du canvas > `?t=` de la page (lus par le socle) >
 * prefers-reduced-motion (pose fixe au MILIEU DU TRAJET, p = 0,5, soit t ≈ 0,427 = MID_T ; suit les changements de la
 * préférence). Sinon la boucle tourne (6,5 s, comme d5-fly) : apparition en fondu, garé au sol après le drapeau de
 * Paris, lancer, cloche d'altitude, virage doux avec roulis vers la caméra, arrondi et posé au sol avant la balise
 * d'Athènes, fondu ; la traînée de perles s'efface en vague. Garde au sol de la quille tenue à chaque instant.
 * Aucune variable globale : chaque appel crée son renderer, sa scène, ses textures ; dispose() libère géométries,
 * matériaux, textures et renderer (le contexte WebGL n'est pas forcé à « perdu » : le canvas reste réutilisable).
 *
 * ─── L'avion : une feuille réellement pliée ───────────────────────────────────────────────────────────────────────
 * Dard classique. Chaque demi-feuille = trois panneaux bâtis dans leurs coordonnées INTRINSÈQUES (longueurs vraies) :
 *   - dérive (quille) : triangle plan nez / haut de la queue / bas de la queue ; les deux dérives se rejoignent au pli
 *     central de la feuille (arête basse) et s'ouvrent en V vers le haut (fente de 2g à la queue) ;
 *   - aile : surface développable (cylindre) — dièdre + légère courbure, puis le pli arrondi de l'aileron relevé ;
 *   - rabat : la couche repliée sur le bord d'attaque (pli de l'étape 3), posée sur l'aile, son bord libre
 *     légèrement soulevé : c'est la ligne diagonale visible sur le dessus d'un vrai dard.
 * Chaque panneau est une dalle fermée d'épaisseur t (dessus, dessous, tranches) : l'épaisseur du papier se lit sur
 * les tranches (teinte plus grise) et aux plis, sans aucune face coplanaire (pas de z-fighting).
 * Les UV sont les coordonnées de la feuille DÉPLIÉE (dérive dépliée sur le pli central, aile sur la racine, rabat
 * réfléchi sur le bord d'attaque) : l'impression (bande violette, rond « C ») traverse les plis comme sur du vrai papier.
 *
 * ─── Matériau ──────────────────────────────────────────────────────────────────────────────────────────────────────
 * MeshPhysicalMaterial : carte couleur procédurale (crème #fff8e7, grain, encre : bande violette #6225e6, filet jaune
 * #f7dc6f, rond « C »), normalMap (ondulations basse fréquence de la feuille — elles survivent au mipmap à 40 px — et
 * fibres), roughnessMap (papier 0,86 / encre 0,55), sheen (duvet aux incidences rasantes), vertexColors (occlusion aux
 * plis rentrants, tranches de coupe plus grises que les plis). Ombre portée réelle sur le globe et auto-ombrage.
 * Fondu d'apparition sans « rayons X » : pré-passe de profondeur (même géométrie, colorWrite false), puis passe
 * couleur transparente — seule la surface la plus proche se mélange.
 *
 * ─── Portage WebGPU / TSL ──────────────────────────────────────────────────────────────────────────────────────────
 * MeshPhysicalMaterial → MeshPhysicalNodeMaterial (map, normalMap, roughnessMap, sheen, vertexColors : tous nodaux) ;
 * MeshStandardMaterial et MeshBasicMaterial idem ; InstancedMesh idem. Pas de ShaderMaterial ni d'onBeforeCompile.
 * Textures : CanvasTexture (OffscreenCanvas si présent) — utilisable telle quelle par WebGPURenderer.
 */
import * as THREE from 'three';
import { createStage } from './avion-socle.js';

const PARIS = [2.35, 48.86];
const ATHENES = [23.73, 37.98];
const DEG = Math.PI / 180;
const ROUTE_ARC = 0.32914; // angle Paris → Athènes (rad) = longueur de l'arc au sol sur la sphère unité

/** Forme du dard, en longueurs de fuselage (L = 1, nez en x = 1, queue en x = 0 ; y haut ; z droite). */
const DART = Object.freeze({
  D: 0.11,              // profondeur de la dérive à la queue
  g: 0.008,             // demi-ouverture de la fente à la queue (V de la dérive : g / D ≈ 4°)
  W: 0.50,              // largeur d'aile, perpendiculaire à la racine
  shoulder: 0.40,       // le bord d'attaque atteint toute la largeur à 40 % depuis la queue
  w: 0.10,              // largeur de l'aileron relevé
  dihedral: 10 * DEG,   // dièdre à la racine (V lisible vu d'en haut)
  curl: 6 * DEG,        // courbure supplémentaire jusqu'au pli de l'aileron (aile légèrement cintrée)
  winglet: 76 * DEG,    // pli de l'aileron (≈ vertical une fois ajouté au dièdre)
  band: 0.018,          // largeur du pli arrondi de l'aileron
  flapS0: 0.34,         // rabat : départ de son bord libre sur la racine (fraction de la racine)
  flapD: 0.62,          // rabat : arrivée de son bord libre sur le bord d'attaque (fraction de W)
  flapLift: 2 * DEG,    // rabat : soulèvement de son bord libre
  t: 0.0075,            // épaisseur du papier (exagérée ≈ ×20 pour que les tranches se lisent à 1 px)
  pivot: [0.46, -0.035, 0],
  scale: 0.1,           // L = 0,1 rayon terrestre : 46 à 55 px de long, 37 à 45 px d'envergure à l'écran (mesuré,
                        // selon le cap et le roulis)
});

/**
 * Vol : instants en fraction de boucle, altitudes et écarts en rayons terrestres (R).
 * Le PIVOT de l'avion ne va pas de Paris à Athènes : l'avion fait 0,1 R (≈ 55 px), le tiers de la route à l'écran. Il
 * décolle AU SOL la queue juste après Paris (le drapeau planté reste dégagé) et se pose AU SOL le nez au bord de la balise
 * d'Athènes (la balise de la prochaine question n'est jamais couverte). Mesuré au pixel sur 101 instants (relecture).
 */
const FLIGHT = Object.freeze({
  period: 6.5,
  fadeIn: [0, 0.07],            // apparition en fondu, posé au sol à côté du drapeau
  start: 0.05, end: 0.85,       // lâcher → posé
  fadeOut: [0.88, 0.95],        // courte pause au posé, puis fondu
  tailGap: 0.048,               // au lâcher : queue à 0,048 R (≈ 24 px) après Paris. Mesuré au pixel sur la boucle : à
                                // 0,024 la queue mordait l'anneau et l'aileron gauche l'ombre du drapeau (49 px) ; à
                                // 0,044, 2 px ; à 0,048, aucun contact
  noseGap: 0.046,               // au posé : nez à 0,046 R (≈ 23 px) d'Athènes : ni l'avion ni son ombre ne touchent la
                                // balise, arrondi compris (à 0,034 l'ombre du nez mordait l'anneau, 6 px ; à 0,042, 10 px
                                // pendant l'arrondi)
  launch: 0.5,                  // loi de Hermite : vitesse 0,5 au lâcher (lancer franc), 0 au posé (pas d'à-coup)
  aGround: 0.009,               // au sol : la quille effleure la surface (le pivot est à 0,0075 R au-dessus de son talon)
  aMax: 0.036, bellPow: 1.25,   // cloche d'altitude, pentes douces aux deux bouts
  climbExp: 1.3,                // cloche en sin(π·w^climbExp) : > 1 retarde la montée (rase le sol sous le drapeau)
  keelClear: 0.0008,            // garde au sol minimale du bas de la quille (R)
  climbPitch: 0.45,             // part de la pente de trajectoire reportée sur le tangage (sinon cabré de 18°)
  arc: -0.0045,                 // vol en courbe douce (s'écarte vers le nord puis revient : virage à droite continu,
                                // roulis ≈ 15° VERS la caméra : le dessus de l'avion, la bande et le « C » restent lisibles)
  weave: 0.0005,                // petit S superposé
  bankGain: 6,                  // roulis (rad) par unité d'accélération latérale (R / w², w = fraction du vol)
  bankMax: 30 * DEG,
  // first : 1re perle à 0,093 du trajet (≈ 14,5 px de Paris) : hors de l'anneau au sol de Paris (demi-axe ≈ 11 px le
  // long de la route) halo compris ; à 0,065 elle se posait sur son contour (relecture, mesure au pixel).
  trail: { first: 0.093, spacing: 0.0145, behind: 0.008, alt: 0.004, core: 0.0027, halo: 0.0046 },
});

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const easeOutBack = (x) => { const c = 1.6; const u = x - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

/* ════════════════════════════════════ géométrie ════════════════════════════════════ */

/** Profil d'aile : angle φ(d) par morceaux linéaires (dièdre + courbure, pli arrondi de l'aileron) et son intégrale. */
function wingProfile(f) {
  const d1 = f.W - f.w - f.band / 2, d2 = d1 + f.band;
  const k = f.curl / (f.W - f.w);
  const pieces = [
    { a: -Infinity, o: 0, b: d1, phi0: f.dihedral, slope: k },
    { a: d1, o: d1, b: d2, phi0: f.dihedral + k * d1, slope: k + f.winglet / f.band },
    { a: d2, o: d2, b: Infinity, phi0: f.dihedral + k * d2 + f.winglet, slope: k },
  ];
  // X(d) = ∫0^d cos φ, Y(d) = ∫0^d sin φ (exact par morceaux) ; d < 0 prolonge le premier morceau
  const integ = (d) => {
    let X = 0, Y = 0;
    for (const p of pieces) {
      const lo = p.o, hi = Math.min(d, p.b);
      if (p.a !== -Infinity && d <= p.a) break;
      const e0 = 0, e1 = hi - lo;
      const A = p.phi0 + p.slope * e0, B = p.phi0 + p.slope * e1;
      if (Math.abs(p.slope) < 1e-9) { X += e1 * Math.cos(A); Y += e1 * Math.sin(A); }
      else { X += (Math.sin(B) - Math.sin(A)) / p.slope; Y += (Math.cos(A) - Math.cos(B)) / p.slope; }
      if (d <= p.b) break;
    }
    return [X, Y];
  };
  return { integ, d1, d2 };
}

/** Accumulateur de maillage (positions, normales, UV de feuille, couleurs de sommet, indices). */
class MeshBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  vert(p, n, uv, shade) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(uv[0], uv[1]);
    this.col.push(shade, shade * 0.99, shade * 0.97);
    return this.pos.length / 3 - 1;
  }
  P(i) { return new THREE.Vector3(this.pos[3 * i], this.pos[3 * i + 1], this.pos[3 * i + 2]); }
  /** Triangle orienté pour que sa face avant regarde `ref` ; les triangles dégénérés sont omis. */
  tri(a, b, c, ref) {
    const pa = this.P(a), e1 = this.P(b).sub(pa), e2 = this.P(c).sub(pa);
    const n = e1.cross(e2);
    if (n.lengthSq() < 1e-16) return;
    if (n.dot(ref) >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
}

/**
 * Dalle de papier : grille (Ni+1)×(Nj+1) d'échantillons {p, n, uv} de la surface moyenne → dessus (+n·t/2),
 * dessous (−n·t/2) et tranches sur les quatre bords (arêtes nulles omises : pointe du nez, bout de rabat).
 */
function addSlab(B, grid, t, walls = [0.8, 0.8, 0.8, 0.8]) {
  const Ni = grid.length - 1, Nj = grid[0].length - 1;
  const top = [], bot = [];
  for (let i = 0; i <= Ni; i++) {
    top.push([]); bot.push([]);
    for (let j = 0; j <= Nj; j++) {
      const { p, n, uv, aoTop = 1, aoBot = 1 } = grid[i][j];
      top[i].push(B.vert(p.clone().addScaledVector(n, t / 2), n, uv, aoTop));
      bot[i].push(B.vert(p.clone().addScaledVector(n, -t / 2), n.clone().negate(), uv, aoBot));
    }
  }
  for (let i = 0; i < Ni; i++) for (let j = 0; j < Nj; j++) {
    const n = grid[i][j].n.clone().add(grid[i + 1][j + 1].n).add(grid[i + 1][j].n).add(grid[i][j + 1].n);
    const m = n.clone().negate();
    B.tri(top[i][j], top[i + 1][j], top[i + 1][j + 1], n); B.tri(top[i][j], top[i + 1][j + 1], top[i][j + 1], n);
    B.tri(bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], m); B.tri(bot[i][j], bot[i + 1][j + 1], bot[i][j + 1], m);
  }
  // Tranches : chaque bord, avec la direction « vers l'intérieur » pour orienter la normale vers l'extérieur.
  const borders = [
    { cells: Array.from({ length: Nj + 1 }, (_, j) => [0, j]), inward: (i, j) => [1, j] },
    { cells: Array.from({ length: Nj + 1 }, (_, j) => [Ni, j]), inward: (i, j) => [Ni - 1, j] },
    { cells: Array.from({ length: Ni + 1 }, (_, i) => [i, 0]), inward: (i, j) => [i, 1] },
    { cells: Array.from({ length: Ni + 1 }, (_, i) => [i, Nj]), inward: (i, j) => [i, Nj - 1] },
  ];
  for (const [bi, { cells, inward }] of borders.entries()) {
    const wallShade = walls[bi];
    for (let k = 0; k < cells.length - 1; k++) {
      const [ia, ja] = cells[k], [ib, jb] = cells[k + 1];
      const A = grid[ia][ja], Bq = grid[ib][jb];
      const edge = Bq.p.clone().sub(A.p);
      if (edge.lengthSq() < 1e-14) continue;
      const nAvg = A.n.clone().add(Bq.n).normalize();
      const wn = edge.clone().cross(nAvg).normalize();
      const [ii, jj] = inward(ia, ja), [ii2, jj2] = inward(ib, jb);
      const into = grid[ii][jj].p.clone().add(grid[ii2][jj2].p).multiplyScalar(0.5).sub(A.p.clone().add(Bq.p).multiplyScalar(0.5));
      if (wn.dot(into) > 0) wn.negate();
      const v = [
        B.vert(A.p.clone().addScaledVector(A.n, t / 2), wn, A.uv, wallShade),
        B.vert(Bq.p.clone().addScaledVector(Bq.n, t / 2), wn, Bq.uv, wallShade),
        B.vert(Bq.p.clone().addScaledVector(Bq.n, -t / 2), wn, Bq.uv, wallShade),
        B.vert(A.p.clone().addScaledVector(A.n, -t / 2), wn, A.uv, wallShade),
      ];
      B.tri(v[0], v[1], v[2], wn); B.tri(v[0], v[2], v[3], wn);
    }
  }
}

/** Échantillonne une surface paramétrée (s, d) → position ; normale par différences centrées (σ fixe le sens « dessus »). */
function sampleGrid(rows, map, uvOf, sigma, aoOf = () => [1, 1]) {
  const h = 1e-4;
  return rows.map(({ d, s }) => s.map((sv) => {
    const p = map(sv, d);
    const dd = map(sv, d + h).sub(map(sv, d - h));
    const ds = map(sv + h, d).sub(map(sv - h, d));
    const n = dd.cross(ds).normalize().multiplyScalar(sigma);
    const [aoTop, aoBot] = aoOf(sv, d);
    return { p, n, uv: uvOf(sv, d), aoTop, aoBot };
  }));
}

/** Construit le dard complet (deux demi-feuilles), UV en coordonnées de feuille (normalisées ensuite). */
function buildDart(f = DART) {
  const B = new MeshBuilder();
  const prof = wingProfile(f);
  const up = new THREE.Vector3(0, 1, 0);
  const bounds = { aMin: Infinity, aMax: -Infinity, bMin: Infinity, bMax: -Infinity };
  const track = (uv) => {
    bounds.aMin = Math.min(bounds.aMin, uv[0]); bounds.aMax = Math.max(bounds.aMax, uv[0]);
    bounds.bMin = Math.min(bounds.bMin, uv[1]); bounds.bMax = Math.max(bounds.bMax, uv[1]);
    return uv;
  };
  const meta = {};

  for (const sigma of [1, -1]) {
    const N = new THREE.Vector3(1, 0, 0);
    const T = new THREE.Vector3(0, 0, sigma * f.g);
    const Kb = new THREE.Vector3(0, -f.D, 0);

    // ── Feuille dépliée : pli central (arête basse de la dérive) sur l'axe a ; b > 0 côté droit.
    const ell = N.distanceTo(Kb), m = T.distanceTo(Kb), Lr = T.distanceTo(N);
    const aT = (m * m + ell * ell - Lr * Lr) / (2 * ell);
    const bT = sigma * Math.sqrt(Math.max(0, m * m - aT * aT));
    const sN = [ell, 0], sT = [aT, bT], sK = [0, 0];

    // ── Dérive : rangées de la racine (i = 0) à l'arête basse (i = Ni), colonnes de la queue (j = 0) au nez.
    const Ni = 2, Nj = 10;
    const keelN = new THREE.Vector3().subVectors(N, Kb).cross(new THREE.Vector3().subVectors(T, Kb)).normalize().multiplyScalar(sigma);
    const keel = [];
    for (let i = 0; i <= Ni; i++) {
      const Q = T.clone().lerp(Kb, i / Ni), sQ = [sT[0] + (sK[0] - sT[0]) * i / Ni, sT[1] + (sK[1] - sT[1]) * i / Ni];
      keel.push([]);
      for (let j = 0; j <= Nj; j++) {
        const u = j / Nj;
        keel[i].push({ p: Q.clone().lerp(N, u), n: keelN, uv: track([sQ[0] + (sN[0] - sQ[0]) * u, sQ[1] + (sN[1] - sQ[1]) * u]),
          aoTop: 0.78 + 0.22 * (i / Ni), aoBot: 0.5 });
      }
    }
    addSlab(B, keel, f.t, [0.95, 0.95, 0.72, 1]); // racine (pli), arête basse (pli), queue (coupe), nez (nul)

    // ── Aile : (s le long de la racine depuis la queue, d perpendiculaire vers l'extérieur).
    const eRoot = new THREE.Vector3().subVectors(N, T).normalize();
    const eOut = new THREE.Vector3().crossVectors(eRoot, up).normalize().multiplyScalar(sigma);
    const eUp = new THREE.Vector3().crossVectors(eOut, eRoot).normalize().multiplyScalar(sigma);
    const wingPos = (s, d) => { const [X, Y] = prof.integ(d); return T.clone().addScaledVector(eRoot, s).addScaledVector(eOut, X).addScaledVector(eUp, Y); };
    // Feuille : T' + ŝ'·s + d̂'·d, d̂' ⟂ ŝ' du côté des b croissants (en valeur absolue)
    const sh = [(sN[0] - sT[0]) / Lr, (sN[1] - sT[1]) / Lr];
    let dh = [-sh[1], sh[0]];
    if (Math.sign(dh[1]) !== sigma) dh = [sh[1], -sh[0]];
    const sheetWing = (s, d) => [sT[0] + sh[0] * s + dh[0] * d, sT[1] + sh[1] * s + dh[1] * d];
    const sLe = (d) => Lr * (1 - (1 - f.shoulder) * d / f.W);

    const dRows = [];
    const pushRange = (a, b, n) => { for (let k = 0; k < n; k++) dRows.push(a + (b - a) * k / n); };
    for (let k = 0; k < 14; k++) dRows.push(prof.d1 * Math.pow(k / 14, 1.6)); // serré près de la racine
    pushRange(prof.d1, prof.d2, 6); pushRange(prof.d2, f.W, 3); dRows.push(f.W);
    const NS = 20;
    const wingRows = dRows.map((d) => ({ d, s: Array.from({ length: NS + 1 }, (_, j) => sLe(d) * j / NS) }));
    const dW = f.W - f.w;
    const wingAO = (sv, d) => [
      1 - 0.2 * Math.exp(-d / 0.035) - 0.16 * Math.exp(-Math.abs(d - dW) / 0.028), // dessus : vallée de racine, coin de l'aileron
      1 - 0.22 * Math.exp(-d / 0.05),                                             // dessous : coin rentrant aile / dérive
    ];
    addSlab(B, sampleGrid(wingRows, wingPos, (sv, d) => track(sheetWing(sv, d)), sigma, wingAO), f.t, [0.95, 0.72, 0.72, 0.96]);
    // racine (pli), bout d'aileron (coupe), bord de fuite (coupe), bord d'attaque (pli)

    // ── Rabat : couche repliée sur le bord d'attaque, posée sur l'aile ; bord libre de (flapS0·Lr, 0) à (sLe(dF), dF).
    const dF = f.flapD * f.W, s0 = f.flapS0 * Lr, s1 = sLe(dF);
    const sFree = (d) => s0 + (s1 - s0) * d / dF;
    // distance (dans la feuille) au bord d'attaque, pour soulever le bord libre
    const le0 = [Lr, 0], le1 = [f.shoulder * Lr, f.W];
    const leDir = [le1[0] - le0[0], le1[1] - le0[1]], leLen = Math.hypot(leDir[0], leDir[1]);
    const leN = [-leDir[1] / leLen, leDir[0] / leLen]; // normale au bord d'attaque dans (s, d)
    const distLe = (s, d) => Math.abs((s - le0[0]) * leN[0] + (d - le0[1]) * leN[1]);
    const wingNormal = (s, d) => {
      const h = 1e-4;
      return wingPos(s, d + h).sub(wingPos(s, d - h)).cross(wingPos(s + h, d).sub(wingPos(s - h, d))).normalize().multiplyScalar(sigma);
    };
    const flapPos = (s, d) => wingPos(s, d).addScaledVector(wingNormal(s, d), f.t * 1.04 + Math.tan(f.flapLift) * distLe(s, d));
    // UV : réflexion de la feuille de l'aile sur la ligne du bord d'attaque (c'est la couche repliée)
    const L0 = sheetWing(Lr, 0), L1 = sheetWing(f.shoulder * Lr, f.W);
    const lx = L1[0] - L0[0], ly = L1[1] - L0[1], ll = lx * lx + ly * ly;
    const reflect = ([x, y]) => { const k = ((x - L0[0]) * lx + (y - L0[1]) * ly) / ll; const px = L0[0] + k * lx, py = L0[1] + k * ly; return [2 * px - x, 2 * py - y]; };
    // Le rabat part à d0 du pli central, pas de 0 : décalé le long de la normale de l'aile (penchée vers l'axe par le
    // dièdre) et soulevé jusqu'à tan(flapLift)·distLe, il franchirait le plan médian et croiserait le rabat opposé —
    // ligne d'intersection en tirets qui scintille (relecture, DPR 8). d0 garde la couche de son côté (jour < 0,3 px).
    const d0 = (f.t * 1.04 + f.t / 2 + Math.tan(f.flapLift) * distLe(s0, 0)) * Math.tan(f.dihedral) + 0.002;
    const flapRows = [];
    const NF = 8, NFS = 12;
    for (let k = 0; k <= NF; k++) {
      const d = d0 + (dF - d0) * k / NF;
      flapRows.push({ d, s: Array.from({ length: NFS + 1 }, (_, j) => sFree(d) + (sLe(d) - sFree(d)) * j / NFS) });
    }
    addSlab(B, sampleGrid(flapRows, flapPos, (sv, d) => track(reflect(sheetWing(sv, d))), sigma), f.t, [0.9, 1, 0.7, 0.96]);
    // le long de la racine, bout (nul), bord libre (coupe), bord d'attaque (pli)

    meta[sigma] = { sheetWing, Lr, sLe, aT, bT, sh };
  }

  // Normalise les UV (feuille → [0, 1]²) ; la texture est dessinée dans le même repère.
  const pad = 0.02;
  bounds.aMin -= pad; bounds.aMax += pad; bounds.bMin -= pad; bounds.bMax += pad;
  const aR = bounds.aMax - bounds.aMin, bR = bounds.bMax - bounds.bMin;
  for (let k = 0; k < B.uv.length; k += 2) {
    B.uv[k] = (B.uv[k] - bounds.aMin) / aR;
    B.uv[k + 1] = (B.uv[k + 1] - bounds.bMin) / bR;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
  geo.setIndex(B.idx);
  geo.translate(-f.pivot[0], -f.pivot[1], -f.pivot[2]);
  geo.scale(f.scale, f.scale, f.scale);
  geo.computeBoundingSphere();
  return { geo, bounds, meta };
}

/* ════════════════════════════════════ textures ════════════════════════════════════ */

function rng(seed) { // mulberry32 : textures identiques à chaque montage
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/** Carte couleur, normalMap et roughnessMap de la feuille, dessinées dans le repère de la feuille dépliée. */
function makePaperTextures({ bounds, meta }, maxAniso) {
  const aR = bounds.aMax - bounds.aMin, bR = bounds.bMax - bounds.bMin;
  const W = 512, H = Math.round(W * bR / aR), px = W / 1024; // px : échelle des motifs dessinés pour 1024
  const rand = rng(0xC0FFEE);
  // feuille (a, b) → pixels : x = (a − aMin)/aR·W, y = (bMax − b)/bR·H (flipY de la texture : v = (b − bMin)/bR)
  const toPx = (a, b) => [(a - bounds.aMin) / aR * W, (bounds.bMax - b) / bR * H];
  const sheetTransform = (ctx) => ctx.setTransform(W / aR, 0, 0, -H / bR, -bounds.aMin * W / aR, bounds.bMax * H / bR);

  // ── Relief (hauteur) : formation nuageuse + fibres + grain ; sert au grain de la couleur et à la normalMap.
  const hc = makeCanvas(W, H), hx = hc.getContext('2d');
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  for (let k = 0; k < 520; k++) { // flocons de formation
    const x = rand() * W, y = rand() * H, r = (8 + rand() * 46) * px, v = rand() < 0.5 ? 0 : 255;
    const g = hx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},${0.05 + rand() * 0.06})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    hx.fillStyle = g; hx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let k = 0; k < 26; k++) { // ondulations de la feuille (basse fréquence : restent visibles à 40 px)
    const x = rand() * W, y = rand() * H, r = (120 + rand() * 220) * px, v = rand() < 0.5 ? 0 : 255;
    const g = hx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},${0.22 + rand() * 0.18})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    hx.fillStyle = g; hx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  hx.lineCap = 'round';
  for (let k = 0; k < 4200 * px * px * 1.6; k++) { // fibres : courtes courbes, orientées surtout dans le sens machine (a)
    const x = rand() * W, y = rand() * H, len = (5 + rand() * 22) * px * 1.3;
    const ang = (rand() - 0.5) * 1.6 + (rand() < 0.3 ? Math.PI / 2 : 0);
    const bend = (rand() - 0.5) * len * 0.6;
    const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
    const v = rand() < 0.6 ? 255 : 0;
    hx.strokeStyle = `rgba(${v},${v},${v},${0.10 + rand() * 0.16})`;
    hx.lineWidth = (0.5 + rand() * 1.1) * Math.max(0.6, px);
    hx.beginPath(); hx.moveTo(x, y); hx.quadraticCurveTo(x + dx / 2 - Math.sin(ang) * bend, y + dy / 2 + Math.cos(ang) * bend, x + dx, y + dy); hx.stroke();
  }
  const hImg = hx.getImageData(0, 0, W, H), hd = hImg.data;
  for (let k = 0; k < hd.length; k += 4) { const n = (rand() - 0.5) * 22; hd[k] = hd[k + 1] = hd[k + 2] = Math.max(0, Math.min(255, hd[k] + n)); }
  hx.putImageData(hImg, 0, 0);

  // ── Couleur : crème uni + encre (bande violette, filet jaune, rond « C »), puis le grain module le tout
  //    (le papier transparaît sous l'encre : impression, pas autocollant). Moyenne du grain ≈ 1 : pas d'assombrissement.
  const cc = makeCanvas(W, H), cx = cc.getContext('2d');
  cx.fillStyle = '#fff8e7'; cx.fillRect(0, 0, W, H);

  const rc = makeCanvas(W, H), rx = rc.getContext('2d'); // roughness (canal vert)
  rx.fillStyle = 'rgb(0,219,0)'; rx.fillRect(0, 0, W, H);

  const ink = (ctx, fill) => {
    sheetTransform(ctx);
    // Bandes près du bord de fuite, parallèles à lui sur chaque aile (s = cte) et sur les dérives (a = cte) ;
    // elles se raccordent sur le pli de racine (s ↔ a le long de la racine).
    const strip = (s0, s1, style) => {
      ctx.fillStyle = style;
      for (const sg of [1, -1]) {
        const { sheetWing, aT, bT, sh } = meta[sg];
        const q = [sheetWing(s0, -0.004), sheetWing(s1, -0.004), sheetWing(s1, DART.W + 0.03), sheetWing(s0, DART.W + 0.03)];
        ctx.beginPath(); q.forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill();
        const a0 = aT + sh[0] * s0, a1 = aT + sh[0] * s1;
        ctx.fillRect(a0, Math.min(0, bT * 1.06), a1 - a0, Math.abs(bT) * 1.06);
      }
    };
    strip(0.034, 0.084, fill.band);   // bande violette
    strip(0.096, 0.106, fill.pin);    // filet jaune
    // Rond « C » sur le dessus de l'aile droite, ouverture vers le nez (+a)
    const { sheetWing, Lr } = meta[1];
    const [ca, cb] = sheetWing(0.25 * Lr, 0.47 * DART.W);
    const r = 0.06;
    ctx.beginPath(); ctx.arc(ca, cb, r + 0.009, 0, Math.PI * 2); ctx.fillStyle = fill.ring; ctx.fill();
    ctx.beginPath(); ctx.arc(ca, cb, r, 0, Math.PI * 2); ctx.fillStyle = fill.band; ctx.fill();
    ctx.beginPath(); ctx.arc(ca, cb, r * 0.56, 0.75, Math.PI * 2 - 0.75); ctx.lineWidth = r * 0.34; ctx.lineCap = 'round'; ctx.strokeStyle = fill.c; ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  ink(cx, { band: 'rgba(98,37,230,0.94)', pin: 'rgba(247,220,111,0.95)', ring: 'rgba(22,23,58,0.9)', c: 'rgba(255,248,231,0.97)' });
  ink(rx, { band: 'rgb(0,140,0)', pin: 'rgb(0,150,0)', ring: 'rgb(0,150,0)', c: 'rgb(0,200,0)' });
  const img = cx.getImageData(0, 0, W, H), cd = img.data;
  for (let k = 0; k < cd.length; k += 4) {
    const h = (hd[k] - 128) / 128; // −1..1
    const g = 1 + h * 0.04;
    cd[k] = Math.min(255, cd[k] * g); cd[k + 1] = Math.min(255, cd[k + 1] * g); cd[k + 2] = Math.min(255, cd[k + 2] * (g + h * 0.012));
  }
  cx.putImageData(img, 0, 0);

  // ── NormalMap depuis le relief (différences centrées, intensité modérée)
  const nc = makeCanvas(W, H), nx = nc.getContext('2d');
  const nImg = nx.createImageData(W, H), nd = nImg.data;
  const at = (x, y) => hd[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  const strength = 2.2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ddx = (at(x + 1, y) - at(x - 1, y)) * strength, ddy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(ddx, ddy, 1), k = (y * W + x) * 4;
    nd[k] = (-ddx / l * 0.5 + 0.5) * 255; nd[k + 1] = (ddy / l * 0.5 + 0.5) * 255; nd[k + 2] = (1 / l * 0.5 + 0.5) * 255; nd[k + 3] = 255;
  }
  nx.putImageData(nImg, 0, 0);

  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(8, maxAniso);
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { map: tex(cc, true), normalMap: tex(nc, false), roughnessMap: tex(rc, false), size: [W, H], toPx };
}

/* ════════════════════════════════════ vol ════════════════════════════════════ */

/** Distances du pivot à la queue et au nez (rayons terrestres), pour placer le lâcher et le posé. */
const TAIL = DART.pivot[0] * DART.scale, NOSE = (1 - DART.pivot[0]) * DART.scale;
/** Fractions du grand cercle occupées par le PIVOT au lâcher et au posé. */
const routeEnds = (F = FLIGHT) => [(TAIL + F.tailGap) / ROUTE_ARC, 1 - (NOSE + F.noseGap) / ROUTE_ARC];
/** Fraction du vol w ∈ [0, 1] à l'instant t : Hermite, vitesse `launch` au lâcher, nulle au posé. */
const flightW = (t, F = FLIGHT) => {
  const u = clamp01((t - F.start) / (F.end - F.start)), v0 = F.launch;
  return (v0 - 2) * u * u * u + (3 - 2 * v0) * u * u + v0 * u;
};
const routeP = (w, F = FLIGHT) => { const [a, b] = routeEnds(F); return a + (b - a) * w; };
const flightP = (t, F = FLIGHT) => routeP(flightW(t, F), F);
const altitude = (w, F = FLIGHT) => F.aGround + (F.aMax - F.aGround) * Math.pow(Math.sin(Math.PI * Math.pow(clamp01(w), F.climbExp)), F.bellPow);
/**
 * Bas de la quille (repère de la géométrie, rayons terrestres) : l'arête basse de la dérive, du talon (queue, le point le
 * plus bas) au nez, épaisseur du papier comprise. Sert à la garde au sol : le tangage fait tourner l'avion autour de son
 * pivot, et près du sol le talon de la quille s'enfoncerait (relecture : −0,0037 R à t = 0,1 avant cette garde).
 */
const KEEL_LOW = [0, 0.15, 0.3, 0.5].map((x) => new THREE.Vector3(
  (x - DART.pivot[0]) * DART.scale, (-DART.D * (1 - x) - DART.t / 2 - DART.pivot[1]) * DART.scale, 0));
const lateral = (w, F = FLIGHT) => F.arc * Math.sin(Math.PI * w) + F.weave * Math.sin(2 * Math.PI * w) * Math.sin(Math.PI * w);
const visibility = (t, F = FLIGHT) => smooth(F.fadeIn[0], F.fadeIn[1], t) * (1 - smooth(F.fadeOut[0], F.fadeOut[1], t));
/** Instant où le pivot est au milieu du trajet Paris → Athènes, p = 1/2 (pose de prefers-reduced-motion). */
const midT = (F = FLIGHT) => {
  const [a, b] = routeEnds(F), wMid = (0.5 - a) / (b - a);
  let lo = F.start, hi = F.end; // flightW est croissante : dichotomie
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (flightW(m, F) < wMid) lo = m; else hi = m; }
  return (lo + hi) / 2;
};
const MID_T = midT();
const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Z = new THREE.Vector3(0, 0, 1), _v = new THREE.Vector3();

/**
 * Pose de l'avion à l'instant t (fonction pure ; pathFrame = celui du socle) : position sur le grand cercle à l'altitude
 * en cloche + écart latéral ; nez dans la tangente du trajet (cap réel, courbe comprise ; la pente de montée/descente
 * n'est reportée qu'à `climbPitch`), haut selon la verticale locale ; roulis = accélération latérale (virage) +
 * frémissement ; tangage = incidence + phugoïde (en vol seulement) + arrondi au posé. Au sol : ni roulis ni frémissement.
 */
function planePose(t, pathFrame, F = FLIGHT) {
  const w = flightW(t, F), p = routeP(w, F), vis = visibility(t, F), alt = altitude(w, F);
  const posAt = (q) => { const fr = pathFrame(PARIS, ATHENES, routeP(q, F), altitude(q, F)); return fr.position.addScaledVector(fr.right, lateral(q, F)); };
  const position = posAt(w);
  const e = 1e-3, wa = Math.max(0, w - e), wb = Math.min(1, w + e);
  const tangent = posAt(wb).sub(posAt(wa)).normalize();
  const upL = position.clone().normalize();
  const climb = Math.asin(Math.max(-1, Math.min(1, tangent.dot(upL))));
  const fwdH = tangent.clone().addScaledVector(upL, -tangent.dot(upL)).normalize();
  // la pente de descente n'est plus reportée sur le tangage pendant l'arrondi : la cloche a une pente infinie en w = 1,
  // et l'avion se posait nez en bas (−7,3° à t = 0,82, −4,9° posé ; relecture)
  const g = F.climbPitch * climb * (1 - smooth(0.88, 0.99, w));
  const fwd = fwdH.multiplyScalar(Math.cos(g)).addScaledVector(upL, Math.sin(g));
  const right = new THREE.Vector3().crossVectors(fwd, upL).normalize();
  const upB = new THREE.Vector3().crossVectors(right, fwd);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, upB, right));
  const airborne = smooth(0, 0.08, w) * (1 - smooth(0.9, 1, w)); // 0 au sol, 1 en vol
  const h = 0.01, acc = (lateral(w + h, F) - 2 * lateral(w, F) + lateral(w - h, F)) / (h * h);
  const bank = (Math.max(-F.bankMax, Math.min(F.bankMax, F.bankGain * acc)) * smooth(0, 0.12, w) * (1 - smooth(0.88, 1, w))
    + 2.2 * DEG * Math.sin(2 * Math.PI * 4 * t + 0.7)) * airborne;
  const flare = 6 * DEG * smooth(0.8, 0.96, w) * (1 - smooth(0.985, 1, w)); // arrondi, puis l'avion se repose sur sa quille
  const pitch = (3 * DEG + 2 * DEG * Math.sin(2 * Math.PI * 3 * t + 1.3)) * airborne + flare;
  // tangage autour de l'axe droit, puis roulis autour du nez (le plus interne)
  quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Z, pitch)).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, bank));
  const scale = 0.9 + 0.1 * smooth(F.fadeIn[0], F.fadeIn[1], t);
  // Garde au sol : si le point le plus bas de la quille passe sous `keelClear`, l'avion est remonté le long de la
  // verticale locale (au décollage, il pivote ainsi sur son talon au lieu de s'enfoncer).
  let low = Infinity;
  for (const v of KEEL_LOW) low = Math.min(low, _v.copy(v).multiplyScalar(scale).applyQuaternion(quaternion).add(position).length() - 1);
  const lift = Math.max(0, F.keelClear - low);
  position.addScaledVector(upL, lift);
  return { t, w, p, vis, alt: alt + lift, bank, pitch, position, quaternion, scale };
}

/* ════════════════════════════════════ montage ════════════════════════════════════ */

export function mount(canvas, { t: tOpt, dpr, flight, exposure } = {}) {
  let F = flight ? { ...FLIGHT, ...flight } : FLIGHT;
  const stage = createStage(canvas, dpr ? { dpr } : {});
  const { renderer, scene } = stage;
  // Exposition 1,15 : à mi-vol le soleil arrive par l'arrière (N·L ≈ 0,55) et le dessus sortait à (211,207,196), 83 % du
  // crème de l'interface ; à 1,15 il revient vers le crème #fff8e7 sans délaver la bande violette (1,3 la pâlit).
  renderer.toneMappingExposure = Number.isFinite(exposure) ? exposure : 1.15;
  scene.add(stage.shadowCatcher, stage.globeOccluder);
  // Ombre : rayon 3 texels (≈ 0,6 px CSS de pénombre) ; normalBias 0,0015 (≈ 0,7 px) supprime le bruit d'auto-ombrage du
  // PCF (5 prises tournées par IGN) sur une feuille plus mince que le noyau — vérifié dans la même passe (var-planche1).
  stage.lights.sun.shadow.radius = 3;
  stage.lights.sun.shadow.normalBias = 0.0015;
  const SHADOW_OPACITY = 0.5;
  stage.shadowCatcher.material.color.set(0x0a1030); // ombre éclairée par le ciel : bleu nuit plutôt que noir
  const disposables = [stage.shadowCatcher.geometry, stage.shadowCatcher.material, stage.globeOccluder.geometry, stage.globeOccluder.material];

  // ── Avion
  const dart = buildDart();
  const tx = makePaperTextures(dart, renderer.capabilities.getMaxAnisotropy());
  const paper = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: tx.map, vertexColors: true,
    roughness: 1, roughnessMap: tx.roughnessMap, metalness: 0,
    normalMap: tx.normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
    sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffffff),
    transparent: true, opacity: 1, depthWrite: true,
  });
  const depthPre = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const plane = new THREE.Group();
  const body = new THREE.Mesh(dart.geo, paper);
  body.castShadow = true; body.receiveShadow = true; body.renderOrder = 3;
  const pre = new THREE.Mesh(dart.geo, depthPre);
  pre.renderOrder = 3;
  plane.add(pre, body);
  scene.add(plane);
  disposables.push(dart.geo, paper, depthPre, tx.map, tx.normalMap, tx.roughnessMap);

  // ── Traînée : perles crème cerclées de noir sur le grand cercle (InstancedMesh ×2 : perle + halo en coque inversée).
  //    Semées sur toute la route ; une perle ne paraît que lorsque la QUEUE de l'avion l'a dépassée (elle ne passe donc
  //    jamais sous l'avion posé, ni sous la balise).
  const T = F.trail;
  const beadP = [];
  for (let p = T.first; p <= 1 - T.first + 1e-9; p += T.spacing / ROUTE_ARC) beadP.push(p);
  const beadGeo = new THREE.SphereGeometry(1, 12, 8); // perle de 2,5 px : 12×8 facettes suffisent
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xfff8e7, roughness: 0.55, emissive: 0xfff8e7, emissiveIntensity: 0.3 });
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0.6, depthWrite: false });
  const cores = new THREE.InstancedMesh(beadGeo, coreMat, beadP.length);
  const halos = new THREE.InstancedMesh(beadGeo, haloMat, beadP.length);
  cores.castShadow = true; cores.receiveShadow = true;
  halos.renderOrder = 2;
  cores.frustumCulled = halos.frustumCulled = false;
  scene.add(cores, halos);
  disposables.push(beadGeo, coreMat, haloMat);
  const beadPos = beadP.map((p) => stage.slerpPath(PARIS, ATHENES, p, T.alt));
  const mtx = new THREE.Matrix4(), one = new THREE.Quaternion(), sc = new THREE.Vector3();

  // ── Pose de l'avion à l'instant t
  let state = { t: 0, w: 0, p: 0, vis: 0, alt: 0, bank: 0, pitch: 0 };

  const update = (t) => {
    const pose = planePose(t, stage.pathFrame, F);
    const { p, vis } = pose;
    state = { t, w: pose.w, p, vis, alt: pose.alt, bank: pose.bank, pitch: pose.pitch };
    plane.visible = vis > 0.002;
    plane.position.copy(pose.position); // pose tenue à jour même invisible : info() ne rend pas une boîte périmée
    plane.quaternion.copy(pose.quaternion);
    plane.scale.setScalar(pose.scale);
    paper.opacity = vis;
    stage.shadowCatcher.material.opacity = SHADOW_OPACITY * vis;

    // perles : paraissent quand la queue les a dépassées, s'effacent en vague (Paris → Athènes) à la fin de la boucle
    const tailP = p - (TAIL + T.behind) / ROUTE_ARC;
    const wipe = (k) => 1 - smooth(F.fadeOut[0] - 0.01 + 0.08 * k / beadP.length, F.fadeOut[0] + 0.02 + 0.08 * k / beadP.length, t);
    // les perles déjà derrière la queue de l'avion garé paraissent avec lui (sinon visibles à t = 0, avion invisible)
    const born = smooth(F.fadeIn[0], F.fadeIn[1], t);
    for (let k = 0; k < beadP.length; k++) {
      const grow = clamp01((tailP - beadP[k]) / 0.035);
      const s = grow > 0 ? easeOutBack(grow) * wipe(k) * born : 0;
      sc.setScalar(Math.max(1e-6, s * T.core));
      mtx.compose(beadPos[k], one, sc); cores.setMatrixAt(k, mtx);
      sc.setScalar(Math.max(1e-6, s * T.halo));
      mtx.compose(beadPos[k], one, sc); halos.setMatrixAt(k, mtx);
    }
    cores.instanceMatrix.needsUpdate = true; halos.instanceMatrix.needsUpdate = true;
  };

  // ── Instant : option t > data-t / ?t= (socle) > mouvement réduit (milieu) > boucle
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const fixedT = () => (Number.isFinite(tOpt) ? clamp01(tOpt) : stage.frozenT !== null ? stage.frozenT : mq?.matches ? midT(F) : null);
  let raf = 0, t0 = null;
  const frame = (now) => {
    t0 ??= now;
    update((((now - t0) / 1000) / F.period) % 1);
    stage.render();
    raf = requestAnimationFrame(frame);
  };
  const start = () => {
    cancelAnimationFrame(raf); raf = 0; t0 = null;
    const ft = fixedT();
    if (ft !== null) { update(ft); stage.render(); } else { update(0); raf = requestAnimationFrame(frame); } // info() juste dès le montage
  };
  const onMotion = () => start();
  mq?.addEventListener?.('change', onMotion);
  start();

  /** Mesures : boîte de l'avion à l'écran (px CSS), envergure/longueur projetées, coût de rendu. */
  const info = () => {
    const pos = dart.geo.attributes.position, v = new THREE.Vector3();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    plane.updateMatrixWorld(true);
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(plane.matrixWorld);
      const [x, y] = stage.project(v);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const ext = (axis, sgn) => { let best = -Infinity, k0 = 0; for (let k = 0; k < pos.count; k++) { const q = sgn * pos.getComponent(k, axis); if (q > best) { best = q; k0 = k; } } return new THREE.Vector3().fromBufferAttribute(pos, k0).applyMatrix4(plane.matrixWorld); };
    const tipR = ext(2, 1), tipL = ext(2, -1), nose = ext(0, 1), tail = ext(0, -1);
    const d = (a, b) => { const [ax, ay] = stage.project(a), [bx, by] = stage.project(b); return Math.hypot(ax - bx, ay - by); };
    return {
      state: { ...state }, bbox: [x0, y0, x1, y1].map((q) => +q.toFixed(1)), centre: stage.project(plane.position).map((q) => +q.toFixed(1)),
      envergurePx: +d(tipL, tipR).toFixed(1), longueurPx: +d(nose, tail).toFixed(1),
      triangles: dart.geo.index.count / 3, render: { ...renderer.info.render }, memory: { ...renderer.info.memory },
      beads: beadP.length,
    };
  };

  return {
    info, stage, update: (t) => { update(t); stage.render(); },
    /** Réglage à chaud de la loi de vol (essais) : surcharge de FLIGHT. */
    setFlight(over) { F = { ...FLIGHT, ...over }; },
    dispose() {
      cancelAnimationFrame(raf);
      mq?.removeEventListener?.('change', onMotion);
      scene.remove(plane, cores, halos, stage.shadowCatcher, stage.globeOccluder);
      cores.dispose(); halos.dispose();
      for (const d of disposables) d.dispose();
      renderer.setClearColor(0x000000, 0); renderer.clear(); // le canvas ne garde pas un avion figé
      renderer.dispose();
    },
  };
}

/** Pour les essais unitaires (Node) : géométrie et loi de vol, sans DOM ni renderer. */
export const __essai = Object.freeze({ buildDart, planePose, flightW, flightP, routeP, routeEnds, altitude, lateral, visibility, midT, MID_T, TAIL, NOSE, ROUTE_ARC, DART, FLIGHT, PARIS, ATHENES });
