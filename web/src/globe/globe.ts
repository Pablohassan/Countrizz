import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import type { FramePose } from '../camera/director';
import { sunDirection } from '../camera/sun';
import type { LngLat, PatchMeta } from '../data/types';
import { toVec, type Vec3 } from '../geo/vec';
import { createAtmosphere } from './atmosphere';
import { createBeacon } from './beacon';
import { createBorders } from './borders';
import { createClouds } from './clouds';
import { createCountryLayer, STATE } from './countryLayer';
import { createEarthMaterial } from './earth';
import type { createImageLayer } from './imageLayer';
import { tangentFrame } from './patchFrame';
import { createStars } from './stars';
import { createSunDisc } from './sunDisc';
import type { GlobeTextures } from './textures';

export type GlobeMode = 'mask' | 'game';
export type CountryState = keyof typeof STATE;

/** Habillage du mode jeu ; absent en mode masque. */
export interface GlobeParts { textures?: GlobeTextures; borders?: LngLat[][] }

/** Apparence du pays visé à un instant donné (voir reveal.ts). */
export interface CountryLook { visible: boolean; reveal: number; state: CountryState; stateTime: number }

/**
 * Scène du globe sans React : la Terre (sphère unité), la couche pays, le soleil. `root` s'ajoute à une scène three
 * (page de sonde) ou à la scène de R3F (GlobeView).
 */
export class Globe {
  readonly root = new THREE.Group();
  readonly country: ReturnType<typeof createCountryLayer>;
  readonly earthMaterial: THREE.MeshStandardNodeMaterial;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private readonly sunListeners: ((dir: Vec3) => void)[] = [];
  private readonly altitudeListeners: ((altitude: number) => void)[] = [];
  private readonly beacon = createBeacon();
  private beaconDir: Vec3 | null = null;
  private readonly cameraPosition = new THREE.Vector3(0, 0, 3);
  private hasPatch = false;
  /**
   * Texture vide de la couche pays. Un patch retiré est remplacé par la texture vide DE SA couche (`clear`) avant que le
   * cache ne le libère : libérée mais encore liée, three la réenverrait (SDF depuis un ImageBitmap fermé ; KTX2 recréé,
   * jamais libéré). Jamais un même objet Texture dans deux couches : partagé, il éteignait le remplissage du pays sous
   * SwiftShader (FRA → JPN → FJI, 03/10).
   */
  private readonly placeholder = new THREE.Texture();
  /** Patch image (mode jeu) ; `null` en mode masque. */
  readonly image: ReturnType<typeof createImageLayer> | null = null;
  private readonly clouds: ReturnType<typeof createClouds> | null = null;
  private imageTexture: THREE.Texture | null = null;
  private imageFade: { seconds: number; since: number | null } = { seconds: 0, since: null };

  constructor(readonly mode: GlobeMode, parts: GlobeParts = {}) {
    if (mode === 'game' && parts.textures) {
      this.clouds = parts.textures.clouds ? createClouds(parts.textures.clouds) : null;
      const earth = createEarthMaterial(parts.textures, this.clouds);
      this.earthMaterial = earth.material;
      this.image = earth.image;
      this.country = createCountryLayer(this.placeholder, earth.base);
      const atmosphere = createAtmosphere();
      const sunDisc = createSunDisc();
      this.sunListeners.push(earth.setSun, atmosphere.setSun, sunDisc.setDirection);
      this.root.add(atmosphere.mesh, createStars(), sunDisc.sprite, this.beacon.sprite);
      if (parts.borders) {
        const borders = createBorders(parts.borders);
        this.root.add(borders.object);
        this.altitudeListeners.push(borders.setAltitude);
      }
    } else {
      this.earthMaterial = new THREE.MeshStandardNodeMaterial();
      this.earthMaterial.colorNode = color(0x0b1d3a);
      this.country = createCountryLayer(this.placeholder);
    }
    this.earthMaterial.outputNode = this.country.outputNode;
    this.country.uniforms.maskMode.value = mode === 'mask' ? 1 : 0;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 512, 256), this.earthMaterial);
    this.root.add(earth, this.sun, new THREE.AmbientLight(0xffffff, 0.04));
  }

  /** Patch du pays visé ; `null` efface le remplissage (patch absent ou en échec). */
  setPatch(meta: PatchMeta | null, sdf: THREE.Texture | null): void {
    this.hasPatch = meta !== null && sdf !== null;
    if (!meta || !sdf) { this.country.uniforms.visible.value = 0; this.country.clear(); return; }
    const u = this.country.uniforms, f = tangentFrame(meta.center);
    u.center.value.set(...f.center);
    u.east.value.set(...f.east);
    u.north.value.set(...f.north);
    u.extentRad.value = meta.extentRad;
    u.rangeTexels.value = meta.rangeTexels;
    this.country.setTexture(sdf);
  }

  /**
   * Patch image du pays visé (Sentinel-2), fondu sur la texture globale ; `null` le retire (absent, en échec, autre pays).
   * Un nouveau patch apparaît en `fadeSeconds` (horloge de `setTime`) ; le même patch redonné ne relance pas le fondu.
   */
  setImagePatch(meta: { center: LngLat; extentRad: number } | null, tex: THREE.Texture | null, fadeSeconds = 0): void {
    const img = this.image;
    if (!img) return;
    if (!meta || !tex) { this.imageTexture = null; img.uniforms.opacity.value = 0; img.clear(); return; }
    if (tex === this.imageTexture) return;
    this.imageTexture = tex;
    const f = tangentFrame(meta.center);
    img.uniforms.center.value.set(...f.center);
    img.uniforms.east.value.set(...f.east);
    img.uniforms.north.value.set(...f.north);
    img.uniforms.extentRad.value = meta.extentRad;
    img.setTexture(tex);
    this.imageFade = { seconds: fadeSeconds, since: null };
    img.uniforms.opacity.value = fadeSeconds > 0 ? 0 : 1;
  }

  /** Nuages : opacité (0 → effacés) et dérive en fraction de tour ; sans texture de nuages, sans effet. */
  setClouds(opacity: number, driftTurns: number): void { this.clouds?.set(opacity, driftTurns % 1); }

  setLook(look: CountryLook): void {
    const u = this.country.uniforms;
    u.visible.value = look.visible && this.hasPatch ? 1 : 0;
    u.reveal.value = look.reveal;
    u.state.value = STATE[look.state];
    u.stateTime.value = look.stateTime;
  }

  /** Balise au pôle d'inaccessibilité du pays visé (micro-États, archipels, patch absent) ; `null` la retire. */
  setBeacon(point: LngLat | null): void {
    this.beacon.setPosition(point);
    this.beaconDir = point ? toVec(point) : null;
    this.updateBeaconVisibility();
  }

  /** Derrière l'horizon (P·C ≤ 1 sur la sphère unité), la balise se dessinerait à travers la Terre : on la cache. */
  private updateBeaconVisibility(): void {
    const d = this.beaconDir, c = this.cameraPosition;
    this.beacon.sprite.visible = d !== null && d[0] * c.x + d[1] * c.y + d[2] * c.z > 1;
  }

  /** Horloge des animations propres au globe (pulsation de la balise), en secondes. */
  setTime(seconds: number): void {
    this.beacon.setTime(seconds);
    const f = this.imageFade;
    if (this.image && this.imageTexture && f.seconds > 0) {
      f.since ??= seconds;
      this.image.uniforms.opacity.value = Math.min(1, (seconds - f.since) / f.seconds);
    }
  }

  /** Place la caméra (regard vers le centre, `up` en haut) et le soleil pour la pose de la frame. */
  applyPose(pose: FramePose, camera: THREE.PerspectiveCamera): void {
    const d = 1 + pose.altitude;
    camera.position.set(pose.dir[0] * d, pose.dir[1] * d, pose.dir[2] * d);
    camera.up.set(...pose.up);
    camera.lookAt(0, 0, 0);
    this.cameraPosition.copy(camera.position);
    this.updateBeaconVisibility();
    camera.near = Math.max(pose.altitude * 0.2, 1e-5);
    camera.far = d + 60;
    camera.updateProjectionMatrix();
    this.setSun(sunDirection(pose));
    for (const f of this.altitudeListeners) f(pose.altitude);
  }

  /**
   * Libère les géométries et matériaux créés par le globe, une fois chacun (les sprites partagent la géométrie statique de
   * three) ; les textures prêtées (GlobeParts, patchs) restent à l'appelant.
   */
  dispose(): void {
    const done = new Set<{ dispose(): void }>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      for (const r of [m.geometry, ...[m.material].flat()] as ({ dispose(): void } | undefined)[]) {
        if (r && !done.has(r)) { done.add(r); r.dispose(); }
      }
    });
    this.placeholder.dispose();
    this.image?.dispose();
  }

  /** Direction du soleil (unitaire) ; applyPose la place par rapport à la caméra, la sonde peut la forcer. */
  setSun(dir: Vec3): void {
    this.sun.position.set(dir[0] * 10, dir[1] * 10, dir[2] * 10);
    for (const f of this.sunListeners) f(dir);
  }
}
