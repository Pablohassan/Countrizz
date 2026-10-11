import * as THREE from 'three/webgpu';

/**
 * Caméra perspective dont l'axe optique tombe à `axisY` (NDC, > 0 au-dessus du centre) au lieu du centre de l'image :
 * le pays se centre dans la zone libre (spec 2A §5.1, D1) en restant vu d'aplomb. Pas de `setViewOffset` : le TRAA de three
 * le réécrit à chaque image (TRAANode.setViewOffset part de offsetX = offsetY = 0). Il rappelle `updateProjectionMatrix`,
 * où le décalage s'ajoute à sa gigue : élément 9 de la projection (b = (haut + bas) / (haut − bas), le point de l'axe sort à −b).
 */
export class OffsetCamera extends THREE.PerspectiveCamera {
  axisY = 0;

  override updateProjectionMatrix(): void {
    super.updateProjectionMatrix();
    // appelée aussi par le constructeur de PerspectiveCamera, avant l'initialisation de `axisY` (undefined)
    if (!this.axisY) return;
    this.projectionMatrix.elements[9] -= this.axisY;
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
