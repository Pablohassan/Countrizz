import * as THREE from 'three/webgpu';
import { attribute, dot, float, mix, normalWorld, select, uniform, vec3 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { projectOnScreen } from '../../camera/home';
import { normalize, toVec, type Vec3 } from '../../geo/vec';
import type { Accessory, AccessoryContext, AccessoryFrame, AccessoryInstance } from '../accessories';
import { BlendedLineMaterial } from '../lines';
import { TOON } from '../plane/paper';
import { LIFT_MAX, liftFactor } from '../relief';
import { MAQUETTES } from './catalogue';
import lieux from './lieux.json';
import { construire } from './papier';
import { deploiement, MONUMENT, recadrage, repere, solSous, tailleMonde } from './pose';

/** Monument monté sur le globe à la révélation (pilote du 08/11) ; `fermer` le replie, avant son retrait. */
export interface Monument extends Accessory {
  /** Nom de l'élément (lieux.json). */
  nom: string;
  /** Replie la maquette ; rend la durée du repli (ms), après laquelle la retirer. */
  fermer(): number;
}

export interface MonumentOptions {
  /** Déployé et figé à cet angle (rad ; sonde, planches). */
  still?: number;
}

/** px : contours de la maquette (l'avion : 1,9 aux bords). */
const CONTOUR = 1.6;
/** Angle (degrés) au-delà duquel deux faces voisines tracent un pli. */
const PLI = 20;

/** Ombrage toon de l'avion (plan 2A-6) : albédo × mix(ambiance, 1, marche(n·L)). */
function toon(albedo: Node<'vec3'>, sun: Node<'vec3'>): Node<'vec3'> {
  const ndl = dot(normalWorld, sun);
  const step = select(ndl.lessThan(TOON.thresholds[0]), float(0), select(ndl.lessThan(TOON.thresholds[1]), float(0.5), float(1)));
  return albedo.mul(mix(vec3(...TOON.ambient), vec3(1, 1, 1), step)) as Node<'vec3'>;
}

/** Les pays qui ont une maquette (pilote). */
export const PAYS_MAQUETTES = Object.keys(MAQUETTES);

/**
 * Maquette en papier du monument de `cca3` (catalogue.ts), à sa position (lieux.json) ; `null` sans maquette. Elle se déplie
 * à sa première image (pose.ts), garde une taille fixe à l'écran, et se replie sur `fermer()`.
 */
export function createMonument(cca3: string, options: MonumentOptions = {}): Monument | null {
  const pieces = MAQUETTES[cca3], lieu = (lieux as Record<string, { nom: string; coord: number[] | null }>)[cca3];
  if (!pieces || !lieu?.coord) return null;
  const g = toVec([lieu.coord[0]!, lieu.coord[1]!]);
  let depuis: number | null = null, repli: number | null = null, dernier = 0;

  const create = (ctx: AccessoryContext): AccessoryInstance => {
    const m = construire(pieces());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    const col = new Float32Array(m.positions.length), c = new THREE.Color();
    m.couleurs.forEach((hex, i) => { c.set(hex); for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], i * 9 + j * 3); });
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // trois quarts, puis la charnière au bord arrière de l'emprise : penchée, la maquette ne passe pas sous le sol
    geo.rotateY(MONUMENT.tourne);
    geo.computeBoundingBox();
    geo.translate(0, 0, -geo.boundingBox!.min.z);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const sun = uniform(new THREE.Vector3(0, 1, 0));
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = toon(attribute('color', 'vec3') as unknown as Node<'vec3'>, sun);
    ctx.unveil(mat);
    const mesh = new THREE.Mesh(geo, mat);

    const edges = new THREE.EdgesGeometry(geo, PLI);
    const lineGeo = new LineSegmentsGeometry().setPositions(edges.attributes.position!.array as Float32Array);
    edges.dispose();
    const lineMat = new BlendedLineMaterial({ color: 0x000000, linewidth: CONTOUR, worldUnits: false, alphaToCoverage: false });
    lineMat.depthWrite = false;
    ctx.unveil(lineMat);
    const lines = new LineSegments2(lineGeo, lineMat);
    const contour = new THREE.Group();
    contour.add(lines);

    const root = new THREE.Group();
    root.add(mesh, contour);
    root.visible = false;
    const basis = new THREE.Matrix4(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3(), cam = new THREE.Vector3();

    const update = (f: AccessoryFrame) => {
      const t = f.nowMs / 1000;
      depuis ??= t;
      dernier = t;
      const angle = options.still ?? deploiement(t - depuis, repli === null ? null : repli - depuis);
      const ouvert = Math.min(1, (t - depuis) / MONUMENT.apparition);
      sun.value.set(...f.sun);
      const lift = 1 + LIFT_MAX * liftFactor(f.pose.altitude);
      const c: Vec3 = [f.pose.dir[0] * (1 + f.pose.altitude), f.pose.dir[1] * (1 + f.pose.altitude), f.pose.dir[2] * (1 + f.pose.altitude)];
      // monument au bord de l'écran ou sous l'interface : la base glisse à l'écran jusqu'à ce que la maquette dépliée tienne
      // dans la zone libre (recadrage), puis redescend sur le sol (près du limbe, un glissement dans le plan du sol raccourcit)
      let s = g;
      const base = projectOnScreen(f.pose, f.viewport, [g[0] * lift, g[1] * lift, g[2] * lift]);
      if (base) {
        const S = MONUMENT.part * f.viewport.height, fin = MONUMENT.inclinaison;
        const [dx, dy] = recadrage([base[0], base[1]], { gauche: -bb.min.x * S, droite: bb.max.x * S, haut: Math.sin(fin) * bb.max.y * S, bas: Math.cos(fin) * bb.max.z * S }, f.viewport, f.safe ?? null, f.evite ?? null);
        if (dx !== 0 || dy !== 0) s = solSous(f.pose, f.viewport, [base[0] + dx, base[1] + dy], lift) ?? g;
      }
      const p: Vec3 = [s[0] * lift, s[1] * lift, s[2] * lift];
      const r = repere(normalize([c[0] - p[0], c[1] - p[1], c[2] - p[2]]), f.pose.up, angle);
      basis.makeBasis(vx.set(...r.x), vy.set(...r.y), vz.set(...r.z));
      root.quaternion.setFromRotationMatrix(basis);
      root.position.set(...p);
      root.scale.setScalar(tailleMonde(Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]), f.viewport) * (options.still === undefined ? ouvert : 1));
      // derrière la Terre (pays au limbe) ou replié : caché
      root.visible = c[0] * g[0] + c[1] * g[1] + c[2] * g[2] > 1 && angle > 0.01;
      root.updateMatrixWorld(true);
      // contours poussés vers la caméra : ils passent devant le papier (comme l'avion)
      mesh.worldToLocal(cam.set(...c));
      contour.position.copy(cam.normalize().multiplyScalar(0.01));
    };

    return {
      object: root,
      update,
      dispose() { geo.dispose(); mat.dispose(); lineGeo.dispose(); lineMat.dispose(); },
    };
  };

  return { create, nom: lieu.nom, fermer: () => { repli ??= dernier; return MONUMENT.replie * 1000; } };
}
