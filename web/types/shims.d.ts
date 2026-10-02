declare module '@mapbox/geojson-rewind' {
  import type { GeoJSON } from 'geojson';
  export default function rewind<T extends GeoJSON>(geojson: T, clockwise?: boolean): T;
}
