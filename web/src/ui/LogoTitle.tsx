import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { recalage, type RondTitre } from '../intro/lecteur';
import { INTRO, LOGO_LETTRES, LOGO_TOUR_S } from '../intro/temps';

/**
 * Entrée du titre : `pop`, ses lettres surgissent une à une (accueil direct) ; `fondu`, il vient de la vidéo de l'intro,
 * qui le montre en pâte : invisible jusqu'au fondu, il apparaît pendant qu'elle s'efface, au même rythme (D5).
 */
export type EntreeTitre = 'pop' | 'fondu';

/**
 * Une lettre en pâte. `data-l` porte le glyphe pour le calque de la face (home.css `.logo-l::after`, le dégradé des lettres
 * de la vidéo). Le « i » : la vidéo remplace son point par une boule (scene.py, POINT_I_*) ; on écrit donc « ı » (U+0131,
 * sans point, même avance et même fût dans Chango) et la boule, enfant de la lettre pour surgir avec elle. Elle est posée
 * avant le glyphe, ancre de largeur nulle en début de ligne : sa place ne dépend ni de letter-spacing ni de l'arrondi de
 * la ligne de base (home.css `.logo-point`).
 */
function Lettre({ l, rang }: { l: string; rang: number }) {
  const i = l === 'i', glyphe = i ? '\u0131' : l;
  return (
    <span className={i ? 'logo-l logo-i' : 'logo-l'} data-l={glyphe} aria-hidden="true" style={{ '--i': rang } as CSSProperties}>
      {i && <i className="logo-point" />}{glyphe}
    </span>
  );
}

/**
 * Le titre C🌍untrizz (déroulé du 10/10) : une petite Terre en pâte tient la place du « o ». Elle tourne en stop motion
 * (96 images, un tour en 4 s ; home.css `.logo-terre-ligne`) ; `angle` (rad) : celui de la Terre de la vidéo quand elle devient visible, pour que la
 * relève ne saute pas. Elle est remontée (`key`) à ce moment : un nouvel `animation-delay` sur un élément déjà animé ne
 * relance pas l'animation (constaté dans Chromium le 11/10). Le glyphe « o » reste dans le texte, invisible : il donne
 * l'espacement exact de la police.
 *
 * `sur` : le « o » du titre de fin de la vidéo à l'écran (lecteur.ts `oDuTitre`), pendant le fondu. Le titre s'y pose par un
 * seul transform (`recalage`), sans transition : un seul titre à l'écran, quelle que soit la taille de la vidéo agrandie
 * (sur le Pixel 9, deux « C » et deux Terres décalés, 24/10). `null` ensuite : il glisse à sa place en 0,8 s.
 */
export function LogoTitle({ angle, visible, entree, sur = null }: { angle: number | null; visible: boolean; entree: EntreeTitre; sur?: RondTitre | null }) {
  const delay = angle === null ? 0 : -(angle / (2 * Math.PI)) * LOGO_TOUR_S;
  const titre = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const h = titre.current, o = h?.querySelector('.logo-terre');
    if (!h || !o) return;
    if (!sur) {
      if (h.style.transform) { h.style.transition = 'transform .8s ease-in-out'; h.style.transform = ''; }
      return;
    }
    h.style.transition = 'none';
    h.style.transform = '';
    const a = o.getBoundingClientRect(), b = h.getBoundingClientRect();
    const centre = { x: a.left + a.width / 2, y: a.top + a.height / 2, r: a.width / 2 };
    const k = recalage(centre, sur);
    h.style.transformOrigin = `${centre.x - b.left}px ${centre.y - b.top}px`;
    h.style.transform = `translate(${k.x}px, ${k.y}px) scale(${k.k})`;
  }, [sur]);
  return (
    <h1 ref={titre} className={`accueil-titre logo-titre logo-titre--${entree}${visible ? ' logo-titre--visible' : ''}`} aria-label="Countrizz"
      style={{ '--fondu': `${(INTRO.FIN - INTRO.FONDU).toFixed(2)}s` } as CSSProperties}>
      <Lettre l={LOGO_LETTRES[0]} rang={0} />
      <span className="logo-o" aria-hidden="true">o<i key={visible ? `terre${delay}` : 'cachee'} className="logo-terre" style={{ opacity: visible ? 1 : 0, '--delai': `${delay}s` } as CSSProperties}><i className="logo-terre-ligne" /></i></span>
      {LOGO_LETTRES.slice(1).map((l, i) => <Lettre key={i} l={l} rang={i + 1} />)}
    </h1>
  );
}
