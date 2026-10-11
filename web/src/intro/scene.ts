import * as THREE from 'three/webgpu';
import { abs, asin, atan, bumpMap, clamp, dFdx, dFdy, fract, min, mix, normalize, positionLocal, select, smoothstep, texture, vec2 } from 'three/tsl';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toVec } from '../geo/vec';
import { INTRO_EUROPE } from './boxes';
import { MAT_HM, PARIS, POINT_RP, REPERE_ECHELLE, type IntroFrame, type Viewport } from './timeline-v1';

/**
 * Scène de la Terre en pâte à modeler (spec intro §3) : `three/webgpu` (repli WebGL 2), son propre canvas, détruite après
 * le fondu. La Terre est la sphère unité fixe ; `render(frame)` place la caméra de la chronologie (timeline.ts).
 */
export interface IntroScene {
  /** Dessine une image ; rend la position écran (px CSS) du haut du mât, pour la vignette. */
  render(f: IntroFrame, t: number, vp: Viewport, stopMotion: boolean): [number, number] | null;
  resize(vp: Viewport, pixelRatio: number): void;
  dispose(): void;
}

const RAD = Math.PI / 180;
/** Intensité du relief fin (bump de three : par pixel d'écran). */
const RELIEF_FIN = 4;

interface Raster { w: number; h: number; d: Uint8ClampedArray }
async function lireImage(url: string): Promise<Raster> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
}
function echantillon(r: Raster, lng: number, lat: number, ch: number): number {
  const x = ((lng + 180) / 360) * r.w - 0.5, y = ((90 - lat) / 180) * r.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.max(0, Math.min(r.h - 1, Math.floor(y))), y1 = Math.min(r.h - 1, y0 + 1);
  const fx = x - x0, fy = Math.max(0, Math.min(1, y - y0));
  const p = (xx: number, yy: number) => r.d[(yy * r.w + (((xx % r.w) + r.w) % r.w)) * 4 + ch]! / 255;
  return (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x0 + 1, y1) * fx) * fy;
}
function bruit3(seed: number) {
  const h = (x: number, y: number, z: number) => { let n = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const s = (t: number) => t * t * (3 - 2 * t), l = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = s(x - xi), yf = s(y - yi), zf = s(z - zi);
    return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), xf), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
             l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf), zf) * 2 - 1;
  };
}
const vec = (lng: number, lat: number, r = 1) => new THREE.Vector3(...toVec([lng, lat])).multiplyScalar(r);

export async function createIntroScene(canvas: HTMLCanvasElement, base = '/', opts: { shadowSize?: number } = {}): Promise<IntroScene> {
  const dbg = import.meta.env.DEV ? new URLSearchParams(location.search).getAll('introDbg') : [];
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
  await renderer.init();
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !dbg.includes('sansOmbre');
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (!dbg.includes('sansEnv')) scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;   // le renderer est initialisé : synchrone
  scene.environmentIntensity = 0.32;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(20, 1, 0.01, 60);

  scene.add(new THREE.HemisphereLight(0xd6e4ff, 0x2a2350, 0.6));
  const cle = new THREE.DirectionalLight(0xffe9cc, 2.7);
  cle.castShadow = true;
  cle.shadow.mapSize.set(opts.shadowSize ?? 4096, opts.shadowSize ?? 4096);
  cle.shadow.bias = -0.0004;
  cle.shadow.normalBias = 0.002;
  Object.assign(cle.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 2.6, far: 7.5 });
  const contre = new THREE.DirectionalLight(0x9cc8ff, 1.5);
  scene.add(cle, contre);
  const dirCle = new THREE.Vector3(-0.55, 0.62, 0.78).normalize(), dirContre = new THREE.Vector3(3, 1.4, -4).normalize();

  // ---------- chargement ----------
  const loader = new THREE.TextureLoader();
  const [monde, europe, reliefFin, rel, france] = await Promise.all([
    loader.loadAsync(`${base}intro/monde.jpg`), loader.loadAsync(`${base}intro/europe.jpg`), loader.loadAsync(`${base}intro/relief-fin.jpg`),
    lireImage(`${base}intro/relief.jpg`), fetch(`${base}intro/france.json`).then((r) => { if (!r.ok) throw new Error(`france.json : HTTP ${r.status}`); return r.json() as Promise<[number, number][]>; }),
  ]);
  monde.colorSpace = THREE.SRGBColorSpace; monde.wrapS = THREE.RepeatWrapping; monde.anisotropy = 8;
  europe.colorSpace = THREE.SRGBColorSpace; europe.anisotropy = 8;
  reliefFin.colorSpace = THREE.NoColorSpace;

  // ---------- la Terre : icosphère déplacée par le relief caricaturé ----------
  const hauteur = (lng: number, lat: number) => {
    const terre = THREE.MathUtils.smoothstep(echantillon(rel, lng, lat, 1), 0.3, 0.72);
    return terre * (0.0045 + 0.09 * Math.pow(Math.sqrt(echantillon(rel, lng, lat, 0)), 2.4));
  };
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 150);
  geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-6);
  const pos = geo.attributes.position as THREE.BufferAttribute, n = pos.count;
  const baseP = new Float32Array(n * 3), v = new THREE.Vector3(), bosse = bruit3(7);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const lng = Math.atan2(-v.z, v.x) / RAD, lat = Math.asin(v.y) / RAD;
    v.multiplyScalar(1 + hauteur(lng, lat) + 0.0022 * bosse(v.x * 7, v.y * 7, v.z * 7));   // roulée à la main
    baseP.set([v.x, v.y, v.z], i * 3);
  }
  // trois états de la pâte : à chaque image on en prend un autre (le frémissement du stop motion)
  const variantes = [0, 1, 2].map((k) => {
    const b = bruit3(100 + k), q = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { v.fromArray(baseP, i * 3); const d = 1 + 0.0016 * b(v.x * 11, v.y * 11, v.z * 11); q.set([v.x * d, v.y * d, v.z * d], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(q, 3)); g.setIndex(geo.index); g.computeVertexNormals();
    const nrm = (g.attributes.normal as THREE.BufferAttribute).array as Float32Array;
    g.dispose();
    return { q, nrm };
  });
  pos.array.set(variantes[0]!.q);
  geo.computeVertexNormals();

  const pate = (o: THREE.MeshPhysicalNodeMaterialParameters = {}) =>
    new THREE.MeshPhysicalNodeMaterial({ roughness: 0.62, sheen: 0.45, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff), ...o });
  const matTerre = pate();
  {
    // texture équirectangulaire lue depuis la position : sans UV, et sans couture au 180ᵉ méridien (dérivées choisies)
    const p = normalize(positionLocal);
    const lon = atan(p.z.negate(), p.x), la = asin(clamp(p.y, -1, 1));
    const uvE = vec2(lon.div(2 * Math.PI).add(0.5), la.div(Math.PI).add(0.5));
    const uvB = vec2(fract(uvE.x.add(0.5)), uvE.y);
    const dxE = dFdx(uvE), dyE = dFdy(uvE), dxB = dFdx(uvB), dyB = dFdy(uvB);
    const couture = abs(dxB.x).add(abs(dyB.x)).lessThan(abs(dxE.x).add(abs(dyE.x)));
    const couleurMonde = texture(monde, uvE).grad(select(couture, dxB, dxE), select(couture, dyB, dyE));
    // sur l'Europe, la peinture fine prend le relais, fondu de 3° sur les bords
    const E = INTRO_EUROPE;
    const lngD = lon.mul(180 / Math.PI), latD = la.mul(180 / Math.PI);
    const uvD = vec2(lngD.sub(E.lng0).div(E.lng1 - E.lng0), latD.sub(E.lat0).div(E.lat1 - E.lat0));
    const bord = min(uvD, uvD.oneMinus()).mul(vec2(E.lng1 - E.lng0, E.lat1 - E.lat0));
    const poids = smoothstep(0, 3, min(bord.x, bord.y));
    matTerre.colorNode = mix(couleurMonde.rgb, texture(europe, uvD).rgb, poids);
    // relief fin de l'Europe (ce que le maillage ne porte pas) : bump par dérivées, nul hors de la boîte
    if (!dbg.includes('sansNormale')) matTerre.normalNode = bumpMap(texture(reliefFin, uvD), poids.mul(RELIEF_FIN));
  }
  const terre = new THREE.Mesh(geo, matTerre);
  terre.castShadow = terre.receiveShadow = true;
  const monde3 = new THREE.Group();   // la Terre et ce qui est posé dessus ; sa matrice porte l'écrasement de l'impact
  monde3.matrixAutoUpdate = false;
  monde3.add(terre);
  scene.add(monde3);

  // ---------- nuages en boules de pâte ----------
  const boule = new THREE.SphereGeometry(1, 40, 28), matNuage = pate({ color: 0xffffff, roughness: 0.75 });
  const nuages = new THREE.Group(); monde3.add(nuages);
  for (const [lng, lat, s] of [[-35, 22, 1], [75, -12, 0.85], [160, 42, 0.9], [-120, -32, 0.8], [30, -45, 0.7], [-80, 52, 0.75], [110, 10, 0.8]] as const) {
    const g = new THREE.Group();
    for (const [x, y, z, r] of [[0, 0, 0, 0.07], [0.075, -0.01, 0.01, 0.052], [-0.075, -0.012, 0, 0.048], [0.025, 0.04, 0, 0.05]] as const) {
      const b = new THREE.Mesh(boule, matNuage); b.position.set(x, y, z); b.scale.set(r * 1.15, r * 0.9, r); b.castShadow = true; g.add(b);
    }
    const dir = vec(lng, lat).normalize();
    g.position.copy(dir).multiplyScalar(1.24); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.scale.setScalar(s);
    nuages.add(g);
  }

  // ---------- Paris : le point de pâte rouge, le drapeau ----------
  const dirParis = vec(...PARIS).normalize();
  const repere = new THREE.Group();
  repere.position.copy(dirParis).multiplyScalar(1 + hauteur(...PARIS));
  repere.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirParis);
  repere.scale.setScalar(REPERE_ECHELLE);
  monde3.add(repere);
  const point = new THREE.Mesh(boule, pate({ color: 0xe8413a, roughness: 0.5 })); point.castShadow = true; repere.add(point);
  const drapeau = new THREE.Group(); repere.add(drapeau);
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0034, MAT_HM, 16), pate({ color: 0xfff8ec })); mat.position.y = MAT_HM / 2; mat.castShadow = true; drapeau.add(mat);
  const tete = new THREE.Mesh(boule, pate({ color: 0xf7dc6f })); tete.position.y = MAT_HM + 0.002; tete.scale.setScalar(0.0062); tete.castShadow = true; drapeau.add(tete);
  const L = 0.088, HD = 0.058;
  const toileGeo = new THREE.BoxGeometry(L, HD, 0.0042, 28, 4, 1); toileGeo.translate(L / 2 + 0.003, 0, 0);
  const tp = toileGeo.attributes.position as THREE.BufferAttribute;
  const tx = Float32Array.from({ length: tp.count }, (_, i) => tp.getX(i)), ty = Float32Array.from({ length: tp.count }, (_, i) => tp.getY(i)), tz = Float32Array.from({ length: tp.count }, (_, i) => tp.getZ(i));
  const tc = new Float32Array(tp.count * 3), bleu = new THREE.Color(0x2b55c9), blanc = new THREE.Color(0xfff8ec), rouge = new THREE.Color(0xe8413a);
  for (let i = 0; i < tp.count; i++) { const u = (tx[i]! - 0.003) / L; const c = u < 1 / 3 ? bleu : u < 2 / 3 ? blanc : rouge; tc.set([c.r, c.g, c.b], i * 3); }
  toileGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const toile = new THREE.Mesh(toileGeo, pate({ vertexColors: true, side: THREE.DoubleSide })); toile.position.y = MAT_HM - HD / 2 - 0.004; toile.castShadow = true; drapeau.add(toile);

  // ---------- la frontière : un boudin de pâte jaune qui se déroule depuis le nord ----------
  let depart = 0; france.forEach(([, la], i) => { if (la > france[depart]![1]) depart = i; });
  const anneau = [...france.slice(depart), ...france.slice(0, depart)];
  const courbe = new THREE.CatmullRomCurve3(anneau.map(([lng, lat]) => vec(lng, lat, 1 + hauteur(lng, lat) + 0.0034)), true, 'centripetal');
  const SEG = 2600, RS = 10;
  const boudinGeo = new THREE.TubeGeometry(courbe, SEG, 0.0026, RS, true);
  const boudin = new THREE.Mesh(boudinGeo, pate({ color: 0xf7dc6f, roughness: 0.5 })); boudin.castShadow = true; monde3.add(boudin);
  const perle = new THREE.Mesh(boule, pate({ color: 0xf7dc6f, roughness: 0.5 })); perle.scale.setScalar(0.0049); perle.castShadow = true; monde3.add(perle);

  // ---------- rendu d'une image ----------
  let variante = 0;
  const qCam = new THREE.Quaternion(), right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  const B = new THREE.Matrix4(), S = new THREE.Matrix4(), loc = new THREE.Vector3(), haut = new THREE.Vector3();
  let vpCourant: Viewport = { width: 1, height: 1 };

  return {
    resize(vp, pixelRatio) {
      vpCourant = vp;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(vp.width, vp.height, false);
    },
    render(f, t, vp, stopMotion) {
      if (vp.width !== vpCourant.width || vp.height !== vpCourant.height) { vpCourant = vp; renderer.setSize(vp.width, vp.height, false); }
      if (stopMotion) {
        variante = (variante + 1 + Math.floor(Math.random() * 2)) % 3;
        pos.array.set(variantes[variante]!.q); pos.needsUpdate = true;
        const nr = geo.attributes.normal as THREE.BufferAttribute;
        (nr.array as Float32Array).set(variantes[variante]!.nrm); nr.needsUpdate = true;
        cle.intensity = 2.7 * (0.97 + Math.random() * 0.06);
      }
      // caméra de la chronologie, plus le tremblé du stop motion (≈ 0,6 px)
      camera.fov = f.camera.fov;
      camera.aspect = vp.width / vp.height;
      camera.position.fromArray(f.camera.position);
      camera.quaternion.fromArray(f.camera.quaternion);
      const dist = camera.position.length();
      camera.near = Math.max(0.01, (dist - 1.3) * 0.5);
      camera.far = dist + 3;
      camera.updateProjectionMatrix();
      qCam.copy(camera.quaternion);
      right.set(1, 0, 0).applyQuaternion(qCam); up.set(0, 1, 0).applyQuaternion(qCam); back.set(0, 0, 1).applyQuaternion(qCam);
      if (stopMotion) {
        const px = (dist * Math.tan((camera.fov * RAD) / 2)) / (vp.height / 2) * 0.6;
        camera.position.addScaledVector(right, (Math.random() - 0.5) * px).addScaledVector(up, (Math.random() - 0.5) * px);
      }
      camera.updateMatrixWorld(true);
      // écrasement de l'impact, le long de l'axe vertical de l'image
      B.makeBasis(right, up, back);
      S.makeScale(f.squash.sx, f.squash.sy, f.squash.sx);
      monde3.matrix.copy(B).multiply(S).multiply(B.clone().transpose());
      monde3.matrixWorldNeedsUpdate = true;
      // lumières : la clé en haut à gauche de l'image, le contre-jour derrière
      cle.position.copy(dirCle).applyQuaternion(qCam).multiplyScalar(5);
      cle.target.position.set(0, 0, 0);
      contre.position.copy(dirContre).applyQuaternion(qCam).multiplyScalar(5);
      // nuages
      nuages.rotation.y = f.clouds.spin;
      nuages.scale.setScalar(f.clouds.scale);
      nuages.visible = f.clouds.scale > 0.001;
      scene.updateMatrixWorld(true);
      // le point, le drapeau tourné vers nous
      repere.worldToLocal(loc.copy(camera.position));
      const cap = Math.atan2(loc.x, loc.z);
      point.visible = f.point.visible;
      if (f.point.visible) { point.position.y = f.point.y; point.scale.set(f.point.sxz, f.point.sy, f.point.sxz); }
      drapeau.visible = f.flag.visible;
      if (f.flag.visible) {
        drapeau.scale.set(f.flag.sx, f.flag.sy, f.flag.sx);
        drapeau.position.y = f.flag.y;
        drapeau.rotation.set(-22 * RAD, cap, 0, 'YXZ');
        for (let i = 0; i < tp.count; i++) { const u = (tx[i]! - 0.003) / L; tp.setZ(i, tz[i]! + 0.009 * u * Math.sin(u * 6.5 - t * 6.5)); tp.setY(i, ty[i]! - 0.004 * u * u); }
        tp.needsUpdate = true; toileGeo.computeVertexNormals();
      }
      // la frontière
      const nf = Math.floor(f.border * SEG);
      boudin.visible = nf > 0;
      boudinGeo.setDrawRange(0, nf * RS * 6);
      perle.visible = f.bead !== null;
      if (f.bead !== null) perle.position.copy(courbe.getPointAt(Math.min(0.9999, f.bead)));
      renderer.render(scene, camera);
      if (!f.flag.visible) return null;
      scene.updateMatrixWorld(true);
      haut.set(0, f.flag.y + MAT_HM * f.flag.sy, 0).applyMatrix4(repere.matrixWorld).project(camera);
      return [(haut.x * 0.5 + 0.5) * vp.width, (-haut.y * 0.5 + 0.5) * vp.height];
    },
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose();
      });
      for (const tex of [monde, europe, reliefFin]) tex.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
