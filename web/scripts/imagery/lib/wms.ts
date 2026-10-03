import type { WmsRequest } from './grid';

export interface WmsService { base: string; layer: string }

/** Nombre décimal court, sans notation exponentielle ni bruit flottant (9 décimales suffisent : 0,1 mm). */
const num = (v: number) => {
  const s = v.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
};

/** GetMap WMS 1.1.1 en EPSG:4326 : la boîte s'écrit ouest, sud, est, nord (documentation EOX, lue le 02/10/2026). */
export function getMapUrl(s: WmsService, r: WmsRequest): string {
  return `${s.base}?service=WMS&version=1.1.1&request=GetMap&layers=${s.layer}&styles=&srs=EPSG:4326`
    + `&bbox=${r.bbox.map(num).join(',')}&width=${r.width}&height=${r.height}&format=image/jpeg`;
}

/**
 * Le service répond parfois une erreur XML avec un code 200 : seule la signature de l'image fait foi. Il sert du PNG (RVBA)
 * au lieu du JPEG demandé dès qu'un bord est partiellement transparent (dernière colonne à 180°, alpha 241, couleur juste :
 * constaté le 02/10) ; l'alpha est ignoré.
 */
export const isImage = (b: Uint8Array): boolean =>
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47);
