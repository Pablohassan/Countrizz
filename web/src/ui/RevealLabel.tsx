import { useEffect, useRef } from 'react';
import type { CountryRecord } from '../data/types';
import type { Lang } from '../game/types';
import type { GlobeHandle } from '../globe/GlobeView';

/**
 * R3 : l'étiquette autocollant « Pays · capitale » posée sur le pays, sa pointe sur la balise (`beacon` : le pôle
 * d'inaccessibilité, qui montre aussi les micro-États) ; recalée à chaque image du globe, cachée derrière l'horizon.
 */
export function RevealLabel({ globe, rec, lang }: { globe: GlobeHandle | null; rec: CountryRecord; lang: Lang }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!globe) return;
    const place = () => {
      const p = globe.project(rec.beacon);
      const d = el.current;
      if (!d) return;
      d.style.visibility = p?.visible ? 'visible' : 'hidden';
      if (p) d.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, calc(-100% - 16px)) rotate(-3deg)`;
    };
    place();
    return globe.onFrame(place);
  }, [globe, rec]);
  return <div ref={el} className="etiquette" aria-hidden="true" style={{ visibility: 'hidden' }}>{rec.name[lang]} · <small>{rec.capital[lang]}</small></div>;
}
