import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import type { FramePose } from '../camera/director';
import { sunDirection } from '../camera/sun';
import type { PatchMeta } from '../data/types';
import { createCountryLayer, STATE } from './countryLayer';
import { tangentFrame } from './patchFrame';

export type GlobeMode = 'mask' | 'game';
export type CountryState = keyof typeof STATE;

/** Apparence du pays visé à un instant donné (voir reveal.ts). */
export interface CountryLook { visible: boolean; reveal: number; state: CountryState; stateTime: number }

/**
 * Scène du globe sans React : la Terre (sphère unité), la couche pays, le soleil. `root` s'ajoute à une scène three
 * (page de sonde) ou à la scène de R3F (GlobeView).
 */
export class Globe {
  readonly root = new THREE.Group();
  readonly country = createCountryLayer(new THREE.Texture());
  readonly earthMaterial = new THREE.MeshStandardNodeMaterial();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private hasPatch = false;

  constructor(readonly mode: GlobeMode) {
    this.earthMaterial.colorNode = color(0x0b1d3a);
    this.earthMaterial.outputNode = this.country.outputNode;
    this.country.uniforms.maskMode.value = mode === 'mask' ? 1 : 0;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 512, 256), this.earthMaterial);
    this.root.add(earth, this.sun, new THREE.AmbientLight(0xffffff, 0.04));
  }

  /** Patch du pays visé ; `null` efface le remplissage (patch absent ou en échec). */
  setPatch(meta: PatchMeta | null, sdf: THREE.Texture | null): void {
    this.hasPatch = meta !== null && sdf !== null;
    if (!meta || !sdf) { this.country.uniforms.visible.value = 0; return; }
    const u = this.country.uniforms, f = tangentFrame(meta.center);
    u.center.value.set(...f.center);
    u.east.value.set(...f.east);
    u.north.value.set(...f.north);
    u.extentRad.value = meta.extentRad;
    u.rangeTexels.value = meta.rangeTexels;
    this.country.setTexture(sdf);
  }

  setLook(look: CountryLook): void {
    const u = this.country.uniforms;
    u.visible.value = look.visible && this.hasPatch ? 1 : 0;
    u.reveal.value = look.reveal;
    u.state.value = STATE[look.state];
    u.stateTime.value = look.stateTime;
  }

  /** Place la caméra (regard vers le centre, `up` en haut) et le soleil pour la pose de la frame. */
  applyPose(pose: FramePose, camera: THREE.PerspectiveCamera): void {
    const d = 1 + pose.altitude;
    camera.position.set(pose.dir[0] * d, pose.dir[1] * d, pose.dir[2] * d);
    camera.up.set(...pose.up);
    camera.lookAt(0, 0, 0);
    camera.near = Math.max(pose.altitude * 0.2, 1e-5);
    camera.far = d + 60;
    camera.updateProjectionMatrix();
    const s = sunDirection(pose);
    this.sun.position.set(s[0] * 10, s[1] * 10, s[2] * 10);
  }
}
