import { useEffect, useState } from 'react';
import { measureLines, type MeasureState } from './fallback';

/**
 * Encart `?mesure` (spec zoom §5 bis) : pour les essais de l'utilisateur sur ses téléphones. Coin bas gauche, au-dessus du
 * jeu, sans capter le doigt (les réponses restent jouables) ; relu deux fois par seconde ; rien n'est envoyé nulle part.
 */
export function MeasureOverlay({ read }: { read(): MeasureState | null }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const id = setInterval(() => { const m = read(); setLines(m ? measureLines(m) : []); }, 500);
    return () => clearInterval(id);
  }, [read]);
  if (!lines.length) return null;
  return (
    <div className="mesure" aria-hidden="true" style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 50, pointerEvents: 'none', padding: '6px 8px', background: '#000000b3', color: '#e8f0ff', font: '11px/1.35 ui-monospace, monospace', borderRadius: 6, whiteSpace: 'pre' }}>
      {lines.join('\n')}
    </div>
  );
}
