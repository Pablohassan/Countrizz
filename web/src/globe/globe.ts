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
import { OffsetCamera } from './offsetCamera';
import type { createImageLayer } from './imageLayer';
import { tangentFrame } from './patchFrame';
import { createStars } from './stars';
import { createSunDisc } from './sunDisc';
import type { GlobeTextures } from './textures';

export type GlobeMode = 'mask' | 'game';
export type CountryState = keyof typeof STATE;

/** Habillage du mode jeu ; absent en mode masque. */
export interface GlobeParts { textures?: GlobeTextures; borders?: LngLat[][] }

/** Une photo posée dans un emplacement : son cadre, sa texture, son opacité propre (fondu du relais). */
export interface ImageSlot { meta: { center: LngLat; extentRad: number }; tex: THREE.Texture; opacity: number }

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
  private setSaturation: (s: number) => void = () => {};
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
  /** Emplacements des photos emboîtées (mode jeu) : 0 le niveau courant, 1 le suivant, plus fin ; vide en mode masque. */
  readonly images: ReturnType<typeof createImageLayer>[] = [];
  private readonly clouds: ReturnType<typeof createClouds> | null = null;
  private readonly slotTex: (THREE.Texture | null)[] = [null, null];
  private readonly slotOpacity = [0, 0];
  private imageFade: { seconds: number; since: number | null; progress: number } = { seconds: 0, since: null, progress: 1 };
  private setDayNightTex: ((day: THREE.Texture, night: THREE.Texture) => void) | null = null;
  private dayNightTex: [THREE.Texture, THREE.Texture] | null = null;

  constructor(readonly mode: GlobeMode, parts: GlobeParts = {}) {
    if (mode === 'game' && parts.textures) {
      this.clouds = parts.textures.clouds ? createClouds(parts.textures.clouds) : null;
      const earth = createEarthMaterial(parts.textures, this.clouds);
      this.earthMaterial = earth.material;
      this.images = [...earth.images];
      this.setDayNightTex = earth.setDayNight;
      this.dayNightTex = [parts.textures.day, parts.textures.night];
      this.country = createCountryLayer(this.placeholder, earth.base);
      const atmosphere = createAtmosphere();
      const sunDisc = createSunDisc();
      this.sunListeners.push(earth.setSun, atmosphere.setSun, sunDisc.setDirection);
      this.setSaturation = earth.setSaturation;
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
   * Photos emboîtées du pays visé (spec zoom §4.3) : `coarse` couvre la vue, `fine` (plus serré) se pose dessus à son
   * opacité ; `null` vide l'emplacement (sa couche reprend sa texture vide avant que le cache ne libère la photo). La
   * première photo d'un pays (emplacements vides avant) entre en `fadeSeconds` ; un relais de niveau, non.
   */
  setImageLevels(coarse: ImageSlot | null, fine: ImageSlot | null, fadeSeconds = 0): void {
    if (!this.images.length) return;
    const wasEmpty = this.slotTex.every((t) => t === null);
    if (wasEmpty && (coarse || fine)) this.imageFade = { seconds: fadeSeconds, since: null, progress: fadeSeconds > 0 ? 0 : 1 };
    [coarse, fine].forEach((s, i) => this.setSlot(i, s));
  }

  private setSlot(i: number, s: ImageSlot | null): void {
    const img = this.images[i]!;
    if (!s) { this.slotTex[i] = null; this.slotOpacity[i] = 0; img.uniforms.opacity.value = 0; img.clear(); return; }
    if (s.tex !== this.slotTex[i]) {
      const f = tangentFrame(s.meta.center);
      img.uniforms.center.value.set(...f.center);
      img.uniforms.east.value.set(...f.east);
      img.uniforms.north.value.set(...f.north);
      img.uniforms.extentRad.value = s.meta.extentRad;
      img.setTexture(s.tex);
      this.slotTex[i] = s.tex;
    }
    this.slotOpacity[i] = s.opacity;
    img.uniforms.opacity.value = s.opacity * this.imageFade.progress;
  }

  /** Textures de jour et de nuit (repli de qualité en cours de partie, spec zoom §5 bis) ; l'appelant libère les anciennes. */
  setDayNight(day: THREE.Texture, night: THREE.Texture): void {
    this.setDayNightTex?.(day, night);
    this.dayNightTex = [day, night];
  }

  /** Textures de jour et de nuit liées au matériau (contrôles). */
  get dayNight(): [THREE.Texture, THREE.Texture] | null { return this.dayNightTex; }

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

  /** La balise est-elle dessinée (contrôles e2e) ? */
  get beaconShown(): boolean { return this.beacon.sprite.visible; }

  /** Derrière l'horizon (P·C ≤ 1 sur la sphère unité), la balise se dessinerait à travers la Terre : on la cache. */
  private updateBeaconVisibility(): void {
    const d = this.beaconDir, c = this.cameraPosition;
    this.beacon.sprite.visible = d !== null && d[0] * c.x + d[1] * c.y + d[2] * c.z > 1;
  }

  /** Horloge des animations propres au globe (pulsation de la balise, fondu de la première photo), en secondes. */
  setTime(seconds: number): void {
    this.beacon.setTime(seconds);
    const f = this.imageFade;
    if (f.progress < 1 && f.seconds > 0 && this.slotTex.some((t) => t !== null)) {
      f.since ??= seconds;
      f.progress = Math.min(1, (seconds - f.since) / f.seconds);
      this.images.forEach((img, i) => { img.uniforms.opacity.value = this.slotOpacity[i]! * f.progress; });
    }
  }

  /** Place la caméra (regard vers le centre, `up` en haut, puis tangage) et le soleil pour la pose de la frame. */
  applyPose(pose: FramePose, camera: THREE.PerspectiveCamera): void {
    const d = 1 + pose.altitude;
    camera.position.set(pose.dir[0] * d, pose.dir[1] * d, pose.dir[2] * d);
    camera.up.set(...pose.up);
    camera.lookAt(0, 0, 0);
    // tangage (vue d'accueil « lever de Terre ») : le regard monte autour de la droite de l'image, la Terre descend
    if (pose.pitch) camera.rotateX(pose.pitch);
    this.cameraPosition.copy(camera.position);
    this.updateBeaconVisibility();
    camera.near = Math.max(pose.altitude * 0.2, 1e-5);
    camera.far = d + 60;
    // zone libre (D1) : l'axe optique au milieu de la zone, pays vu d'aplomb
    if (camera instanceof OffsetCamera) camera.axisY = pose.axisY;
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
    for (const img of this.images) img.dispose();
  }

  /** Saturation de la texture de jour (1 = telle quelle) : planches de réglage. */
  setDaySaturation(s: number): void { this.setSaturation(s); }

  /** Direction du soleil (unitaire) ; applyPose la place par rapport à la caméra, la sonde peut la forcer. */
  setSun(dir: Vec3): void {
    this.sun.position.set(dir[0] * 10, dir[1] * 10, dir[2] * 10);
    for (const f of this.sunListeners) f(dir);
  }
}
