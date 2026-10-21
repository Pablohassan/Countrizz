import * as THREE from 'three/webgpu';
import { color, dot, float, mix, normalWorld, select, uniform, vec3 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { projectOnScreen } from '../../camera/home';
import { normalize, type Vec3 } from '../../geo/vec';
import type { Accessory, AccessoryContext, AccessoryFrame, AccessoryInstance } from '../accessories';
import { paperGeometry, shadowOutline, TOON } from './paper';
import { createRoute, ESCALES, PLANE, rollRad } from './route';
import { createSchedule, SAMPLES, type PlaneLook } from './schedule';

/** Livrés avec l'avion, à l'accueil seulement (App.tsx, HomeMarks) : escales et projection des repères G5. */
export { ESCALES } from './route';
export { markGeometry } from '../../ui/marks';

const RAD = Math.PI / 180;
const CREAM = 0xfff8e7;
/** Ordre de dessin (liste des transparents) : l'ombre, sans test de profondeur, avant l'avion, puis ses contours. */
const ORDER = { shadow: 10, paper: 11, folds: 12, edges: 13 } as const;

/** L'avion de l'accueil, monté sur le globe (`GlobeHandle.mount`) ; ce qu'il montre se lit à chaque image (bulles, e2e). */
export interface HomePlane extends Accessory {
  /** État de la dernière image ; `null` avant la première. */
  look(): PlaneLook | null;
  /** Position écran de l'avion à la dernière image (px CSS), `null` s'il est caché (derrière la Terre, hors du cadre). */
  screen(): [number, number] | null;
}

export interface HomePlaneOptions {
  /** Mouvement réduit (relu à chaque image) : l'avion se fige entre Paris et Athènes. */
  reducedMotion?(): boolean;
  /** Avion figé à cette progression (sonde, références visuelles). */
  still?: number;
}

/** Le segment caméra → point traverse-t-il la sphère unité avant d'arriver au point ? */
function hiddenByEarth(c: Vec3, p: Vec3): boolean {
  const s: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const A = s[0] * s[0] + s[1] * s[1] + s[2] * s[2], B = 2 * (c[0] * s[0] + c[1] * s[1] + c[2] * s[2]);
  const C = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - 1;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return false;
  const t0 = (-B - Math.sqrt(disc)) / (2 * A);
  return t0 > 0 && t0 < 1 - 1e-6;
}

/** Ombrage toon calculé dans le matériau (plan 2A-6, décision 3) : albédo × mix(ambiance, 1, marche(n·L)). */
function toon(albedo: Node<'vec3'>, sun: Node<'vec3'>): Node<'vec3'> {
  const ndl = dot(normalWorld, sun);
  const step = select(ndl.lessThan(TOON.thresholds[0]), float(0), select(ndl.lessThan(TOON.thresholds[1]), float(0.5), float(1)));
  return albedo.mul(mix(vec3(...TOON.ambient), vec3(1, 1, 1), step)) as Node<'vec3'>;
}

/**
 * Avion A2 de l'accueil (spec 2A §4, décision 8) : papier bicolore en aplats toon, contours noirs, perles de la traînée
 * de Rabat à Athènes, ombre portée nette ; aux couleurs du pays de chaque escale. Porté du prototype WebGL du 05/10
 * (`ecrans/avion-cartoon-escales.js`) ; écarts : plan 2A-6, décisions 1 à 6.
 */
export function createHomePlane(options: HomePlaneOptions = {}): HomePlane {
  const route = createRoute();
  const samples = Array.from({ length: SAMPLES }, (_, j) => route.point(j / SAMPLES));
  let last: PlaneLook | null = null;
  let lastScreen: [number, number] | null = null;

  const create = (ctx: AccessoryContext): AccessoryInstance => {
    const schedule = createSchedule(route);
    const sun = uniform(new THREE.Vector3(0, 1, 0));
    const colA = uniform(new THREE.Color(ESCALES[3].a)), colB = uniform(new THREE.Color(ESCALES[3].b));
    const palette = ESCALES.map((c) => ({ a: new THREE.Color(c.a), b: new THREE.Color(c.b) }));
    const disposables: { dispose(): void }[] = [];
    const keep = <M extends THREE.Material>(m: M): M => { ctx.unveil(m); disposables.push(m); return m; };
    const paperMat = (albedo: Node<'vec3'>, side: THREE.Side) => {
      const m = new THREE.MeshBasicNodeMaterial({ side, transparent: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
      m.colorNode = toon(albedo, sun);
      return keep(m);
    };

    // ── avion ──
    const paper = paperGeometry(PLANE.bande);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(paper.positions, 3));
    geo.computeVertexNormals();
    const [nCream, nStripe, nKeel] = paper.groups;
    geo.addGroup(0, nCream * 3, 0);
    geo.addGroup(nCream * 3, nStripe * 3, 1);
    geo.addGroup((nCream + nStripe) * 3, nKeel * 3, 2);
    disposables.push(geo);
    const cream = color(CREAM) as unknown as Node<'vec3'>;
    const recto = new THREE.Mesh(geo, [paperMat(cream, THREE.FrontSide), paperMat(colB as unknown as Node<'vec3'>, THREE.FrontSide), paperMat(colA as unknown as Node<'vec3'>, THREE.FrontSide)]);
    const verso = new THREE.Mesh(geo, paperMat(colA as unknown as Node<'vec3'>, THREE.BackSide));
    recto.renderOrder = verso.renderOrder = ORDER.paper;
    const plane = new THREE.Group();
    plane.add(verso, recto);
    const contour = new THREE.Group();
    const line = (segments: number[], width: number, order: number) => {
      const m = keep(new THREE.Line2NodeMaterial({ color: 0x000000, linewidth: width, worldUnits: false, alphaToCoverage: false }));
      m.transparent = true;
      m.depthWrite = false;
      const g = new LineSegmentsGeometry().setPositions(segments);
      disposables.push(g);
      const l = new LineSegments2(g, m);
      l.renderOrder = order;
      return l;
    };
    contour.add(line(paper.folds, PLANE.contour.pli, ORDER.folds), line(paper.edges, PLANE.contour.bord, ORDER.edges));
    plane.add(contour);

    // ── perles : de Rabat à Athènes, au-dessus du relief soulevé ──
    const P = PLANE.perles;
    const nPearls = schedule.pearlE.length;
    const ball = new THREE.SphereGeometry(1, 12, 8);
    disposables.push(ball);
    const pearlMat = keep(new THREE.MeshBasicNodeMaterial());
    pearlMat.colorNode = toon(cream, sun);
    const rimMat = keep(new THREE.MeshBasicNodeMaterial({ color: 0x000000, side: THREE.BackSide }));
    const pearls = new THREE.InstancedMesh(ball, pearlMat, nPearls), rims = new THREE.InstancedMesh(ball, rimMat, nPearls);
    pearls.frustumCulled = rims.frustumCulled = false;
    const pearlAt = schedule.pearlE.map((e) => { const g = route.ground(e), r = 1 + P.hauteur + P.rayon + P.cerne; return new THREE.Vector3(g[0] * r, g[1] * r, g[2] * r); });
    const shown = new Float64Array(nPearls).fill(-1);

    // ── ombre portée : enveloppe de l'avion projetée le long du soleil ──
    const shadowGeo = new THREE.BufferGeometry();
    const fan = new Float32Array((paper.outline.length - 2) * 9);
    shadowGeo.setAttribute('position', new THREE.BufferAttribute(fan, 3));
    disposables.push(shadowGeo);
    const shadowMat = new THREE.MeshBasicNodeMaterial({ color: PLANE.ombre.couleur, transparent: true, opacity: PLANE.ombre.opacite, depthTest: false, depthWrite: false });
    disposables.push(shadowMat);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.renderOrder = ORDER.shadow;
    shadow.frustumCulled = false;

    const root = new THREE.Group();
    root.add(shadow, plane, pearls, rims);

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qr = new THREE.Quaternion(), euler = new THREE.Euler();
    const vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3(), cam = new THREE.Vector3(), tmp = new THREE.Vector3();
    const unit = new THREE.Quaternion(), scl = new THREE.Vector3();
    let mode: 'still' | 'reduced' | 'live' | null = null;
    let lastMs = 0;

    const update = (f: AccessoryFrame) => {
      const c: Vec3 = [f.pose.dir[0] * (1 + f.pose.altitude), f.pose.dir[1] * (1 + f.pose.altitude), f.pose.dir[2] * (1 + f.pose.altitude)];
      const visible = (p: Vec3) => {
        const s = projectOnScreen(f.pose, f.viewport, p);
        if (!s) return false;
        const m = PLANE.marge;
        return s[0] >= -m && s[0] <= f.viewport.width + m && s[1] >= -m && s[1] <= f.viewport.height + m && !hiddenByEarth(c, p);
      };
      const onScreen = (e: number) => { const j = Math.round(e * SAMPLES); return visible(Math.abs(e * SAMPLES - j) < 1e-9 && j < SAMPLES ? samples[j]! : route.point(e)); };
      const want = options.still !== undefined ? 'still' : options.reducedMotion?.() ? 'reduced' : 'live';
      let look: PlaneLook;
      if (want === 'still') look = mode === 'still' && last ? last : schedule.still(options.still!);
      else if (want === 'reduced') look = mode === 'reduced' && last ? last : schedule.still(schedule.reducedMotionE);
      else look = mode === 'live' ? schedule.step((f.nowMs - lastMs) / 1000, onScreen) : schedule.start(onScreen);
      mode = want;
      lastMs = f.nowMs;
      last = look;
      sun.value.set(...f.sun);

      // pose : repère de vol, roulis du virage, léger tangage qui respire (figé hors du mode « live »)
      const fr = route.frame(look.e);
      m4.makeBasis(vx.set(...fr.forward), vy.set(...fr.up), vz.set(...fr.right));
      const clock = want === 'live' ? f.nowMs / 1000 : 0;
      q.setFromRotationMatrix(m4).multiply(qr.setFromEuler(euler.set(rollRad(fr.curvature, route.bankGain), 0, 1.2 * RAD * Math.sin(clock * 2.9 * 0.7 + 0.7), 'XZY')));
      plane.position.set(...fr.position);
      plane.quaternion.copy(q);
      plane.scale.setScalar(PLANE.longueur * (1 + PLANE.gonfle * look.swell));
      plane.updateMatrixWorld(true);
      // contours poussés vers la caméra : ils passent devant le papier
      plane.worldToLocal(cam.set(...c));
      contour.position.copy(cam.normalize().multiplyScalar(0.011));
      const { from, to, f: k } = look.colors;
      colA.value.lerpColors(palette[from]!.a, palette[to]!.a, k);
      colB.value.lerpColors(palette[from]!.b, palette[to]!.b, k);

      look.pearls.forEach((s, i) => {
        if (s === shown[i]) return;
        shown[i] = s;
        pearls.setMatrixAt(i, m4.compose(pearlAt[i]!, unit, scl.setScalar(P.rayon * s)));
        rims.setMatrixAt(i, m4.compose(pearlAt[i]!, unit, scl.setScalar((P.rayon + P.cerne) * s)));
        pearls.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = true;
      });

      const ground = normalize(fr.position);
      const outline = c[0] * ground[0] + c[1] * ground[1] + c[2] * ground[2] > 1
        ? shadowOutline(paper.outline.map((p) => { tmp.set(...p).applyMatrix4(plane.matrixWorld); return [tmp.x, tmp.y, tmp.z] as Vec3; }), ground, 0.0005, f.sun)
        : null;
      shadow.visible = outline !== null && outline.length >= 3;
      if (outline && outline.length >= 3) {
        const n = Math.min(outline.length, paper.outline.length);
        for (let i = 1; i < n - 1; i++) fan.set([...outline[0]!, ...outline[i]!, ...outline[i + 1]!], (i - 1) * 9);
        shadowGeo.setDrawRange(0, (n - 2) * 3);
        shadowGeo.attributes.position!.needsUpdate = true;
      }

      const s = visible(fr.position) ? projectOnScreen(f.pose, f.viewport, fr.position) : null;
      lastScreen = s ? [s[0], s[1]] : null;
    };

    return {
      object: root,
      update,
      dispose() {
        pearls.dispose(); rims.dispose();
        for (const d of disposables) d.dispose();
      },
    };
  };

  return { create, look: () => last, screen: () => lastScreen };
}
