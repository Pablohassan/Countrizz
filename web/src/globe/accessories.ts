import type * as THREE from 'three/webgpu';
import type { FramePose } from '../camera/director';
import type { Vec3 } from '../geo/vec';

/** Données d'une image pour un accessoire : horloge, pose de la caméra, direction du soleil (ombre portée). */
export interface AccessoryFrame { nowMs: number; pose: FramePose; sun: Vec3 }
export interface AccessoryInstance { object: THREE.Object3D; update?(f: AccessoryFrame): void; dispose(): void }
/**
 * Objet de scène ajouté au globe (avion de l'accueil, plan 2A-6 ; spec 2A §5.3). `create` est rappelé à chaque renderer :
 * après une perte du GPU, la scène est neuve et l'accessoire recréé.
 */
export interface Accessory { create(): AccessoryInstance }
export interface SceneLike { add(o: THREE.Object3D): unknown; remove(o: THREE.Object3D): unknown }

/**
 * Monte dans une scène les accessoires demandés. Un accessoire qui lève à la création est ignoré, à la mise à jour il est
 * retiré, à la libération l'erreur est journalisée : le globe continue (une exception dans la boucle de rendu le figerait).
 */
export function createAccessoryHost(scene: SceneLike) {
  const live = new Map<Accessory, AccessoryInstance>();
  const unmount = (a: Accessory, inst: AccessoryInstance) => {
    live.delete(a);
    scene.remove(inst.object);
    try { inst.dispose(); } catch (e) { console.error(e); }
  };
  const sync = (list: Iterable<Accessory>) => {
    const want = new Set(list);
    for (const [a, inst] of live) if (!want.has(a)) unmount(a, inst);
    for (const a of want) {
      if (live.has(a)) continue;
      try {
        const inst = a.create();
        scene.add(inst.object);
        live.set(a, inst);
      } catch (e) { console.error(e); }
    }
  };
  return {
    sync,
    update(f: AccessoryFrame): void {
      for (const [a, inst] of live) {
        try { inst.update?.(f); } catch (e) { console.error(e); unmount(a, inst); }
      }
    },
    dispose(): void { sync([]); },
  };
}
