/** Spec §9 : attribution EOX mot pour mot (https://cloudless.eox.at/license-non-commercial, lu le 02/10/2026), lien compris. */
const EOX_CREDIT = {
  before: 'EOxCloudless ',
  url: 'https://cloudless.eox.at',
  after: ' by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
} as const;

export const eoxAttribution = (): string => `${EOX_CREDIT.before}${EOX_CREDIT.url}${EOX_CREDIT.after}`;

/** Place du crédit (D2 : sur sa ligne sous la grille pendant les questions) ; défaut : en bas à droite. */
export interface CreditPlacement { top?: string; right?: string; bottom?: string; left?: string; textAlign?: 'left' | 'center' | 'right' }

/** Crédit de l'imagerie, toujours visible dans la vue du globe (la texture de jour est Sentinel-2 partout). */
export function ImageryCredit({ placement }: { placement?: CreditPlacement } = {}) {
  return (
    <footer
      role="contentinfo"
      aria-label="Crédits de l’imagerie"
      style={{
        position: 'absolute', right: 8, bottom: 'calc(4px + env(safe-area-inset-bottom, 0px))', maxWidth: 'calc(100% - 16px)',
        font: '10px/1.3 sans-serif', color: 'rgba(255, 255, 255, 0.7)', textAlign: 'right', textShadow: '0 0 2px #000', ...placement,
      }}
    >
      {EOX_CREDIT.before}
      <a href={EOX_CREDIT.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{EOX_CREDIT.url}</a>
      {EOX_CREDIT.after}
    </footer>
  );
}
