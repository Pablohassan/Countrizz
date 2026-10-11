import type { CSSProperties } from 'react';
import { LOGO_LETTRES, LOGO_TOUR_S } from '../intro/temps';

/**
 * Le titre C🌍untrizz (déroulé du 10/10) : une petite Terre en pâte tient la place du « o ». Elle tourne en stop motion
 * (24 images, un tour en 4 s) ; `angle` (rad) : celui où l'intro l'a laissée, pour que la relève ne saute pas.
 * Le glyphe « o » reste dans le texte, invisible : il donne l'espacement exact de la police.
 */
export function LogoTitle({ angle, visible }: { angle: number | null; visible: boolean }) {
  const delay = angle === null ? 0 : -(angle / (2 * Math.PI)) * LOGO_TOUR_S;
  return (
    <h1 className="accueil-titre logo-titre" aria-label="Countrizz">
      <span className="logo-l" aria-hidden="true" style={{ '--i': 0 } as CSSProperties}>{LOGO_LETTRES[0]}</span>
      <span className="logo-o" aria-hidden="true">o<i className="logo-terre" style={{ opacity: visible ? 1 : 0, animationDelay: `${delay}s` }} /></span>
      {LOGO_LETTRES.slice(1).map((l, i) => <span key={i} className="logo-l" aria-hidden="true" style={{ '--i': i + 1 } as CSSProperties}>{l}</span>)}
    </h1>
  );
}
