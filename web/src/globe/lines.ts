import * as THREE from 'three/webgpu';
import type { NodeBuilder } from 'three/webgpu';

/**
 * Ligne épaisse transparente mélangée par le GPU. `Line2NodeMaterial` (three r186) se déclare sans mélange (`NoBlending`)
 * et, transparente, émule le mélange en relisant une copie de l'écran pleine résolution, mipmaps comprises, à CHAQUE image
 * (`setupDiffuseColor`, `viewportOpaqueMipTexture`) : 11 passes de mipmaps et une scène coupée en deux à l'accueil
 * (frontières, contours de l'avion ; analyse du manque de fluidité sur téléphone, 23/10). Ici la couleur se construit comme
 * pour une ligne sans mélange (opacité et anticrénelage dans l'alpha, sans alpha forcé à 1 : `isOpaque` faux), et le mélange
 * normal du GPU fait le reste : même image, sans la copie.
 */
export class BlendedLineMaterial extends THREE.Line2NodeMaterial {
  constructor(parameters?: ConstructorParameters<typeof THREE.Line2NodeMaterial>[0]) {
    super(parameters);
    this.transparent = true;
    this.blending = THREE.NormalBlending;
  }

  override setupDiffuseColor(builder: NodeBuilder): void {
    const { transparent, blending } = this;
    this.transparent = false;
    this.blending = THREE.NoBlending;
    try { super.setupDiffuseColor(builder); } finally { this.transparent = transparent; this.blending = blending; }
  }
}
