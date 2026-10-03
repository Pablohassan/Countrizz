/**
 * EOxCloudless (EOX IT Services GmbH), choisi par l'utilisateur le 02/10/2026 : millésime 2025, mondial et sans défaut
 * visible (2016, seul CC BY mondial, a des bandes nuageuses ; 2017 ne couvre que l'Europe). Conditions lues le 02/10 sur
 * https://cloudless.eox.at/license-non-commercial et /documentation/license : usage non commercial sous CC BY-NC-SA 4.0,
 * attribution visible près de l'image, requêtes de 4096 px au plus (assemblage permis), service sans clé.
 */
export const EOX = {
  service: { base: 'https://tiles.maps.eox.at/wms', layer: 's2cloudless-2025' },
  year: 2025,
  maxPx: 4096,
  license: 'CC BY-NC-SA 4.0',
  attribution: 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
} as const;

/**
 * Patchs image (spec §4.3, amendé le 02/10) : emprise = vue d'arrivée (lib/patchImage.ts), 2048 texels en « haute »,
 * 1024 en « standard » (réduction du 2048) ; ETC1S sRGB, alpha = masque d'eau ; fichiers HORS dépôt.
 */
export const IMAGE_PATCH = { sizes: [2048, 1024] as const, viewFactor: 2.2, maxExtentDeg: 30, qlevel: 192 } as const;
