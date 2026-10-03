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
