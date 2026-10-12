import type { Messages } from '../i18n';

/**
 * Carte d'erreur « le globe n'a pas pu se charger » avec « Réessayer » (spec §10) : chargement en échec, recréation après
 * une perte du GPU (GlobeView), ou code du globe introuvable (App, D15 du plan de l'intro vidéo).
 */
export function LoadErrorCard({ texts, detail, onRetry }: { texts: Messages['errors']; detail: string; onRetry(): void }) {
  return (
    <div role="alert" title={detail} style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', gap: 12, color: '#f7dc6f', background: '#16173a', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <p>{texts.loadTitle}</p>
      <p>{texts.loadText}</p>
      <button onClick={onRetry}>{texts.retry}</button>
    </div>
  );
}
