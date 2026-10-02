import type { ThreeToJSXElements } from '@react-three/fiber';
import type * as THREE from 'three/webgpu';

// Les éléments JSX de R3F sont ceux de three/webgpu (et non de three) : <primitive>, <mesh>… acceptent les NodeMaterial.
declare module '@react-three/fiber' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
