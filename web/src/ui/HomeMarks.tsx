import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { FramePose } from '../camera/director';
import type { Viewport } from '../camera/framing';
import type { CountryRecord } from '../data/types';
import type { Lang } from '../game/types';
import type { LngLat } from '../geo/vec';
import { inScreen } from './bubbles';
import type { MarkGeometry } from './marks';
import './marks.css';

/** Ce que la couche lit du globe à chaque image (GlobeHandle). */
export interface MarksSource {
  view(): { pose: FramePose; viewport: Viewport } | null;
  onFrame(cb: () => void): () => void;
}

/**
 * Ce qui arrive avec le code du globe (App.tsx, GlobeView le réexporte) : l'avion (ses bulles), ses escales et le calcul
 * des repères. Rien de cela n'est dans le code du démarrage : un morceau partagé de plus y retardait l'intro (Fast 4G de
 * 1112 à 1228 ms, 21/10).
 */
export interface HomeExtras {
  plane: { look(): { bubbles: boolean[] } | null };
  escales: readonly { cca3: string; lieu: LngLat }[];
  geometry(pose: FramePose, viewport: Viewport, at: LngLat): MarkGeometry | null;
}

/** Islande, près du bord (maquette G5). */
const ISLANDE: LngLat = [-21.94, 64.15];
/** Bulles « Pays · Capitale » : coin haut gauche par rapport à l'escale (px), relevé sur la maquette `accueil-avion-escales.html`. */
const BUBBLE_OFFSET: [number, number][] = [[-42, 10], [14, 7], [41, -52], [-50, 22]];

/**
 * Repères G5 « Escales » de l'accueil (spec 2A §3, décisions 7 et 8) en calque DOM projeté : épingles-drapeaux (Maroc,
 * Espagne, Islande), drapeau planté qui ondule à Paris, balise jaune à Athènes, bulles « Pays · Capitale » qui s'allument
 * au passage de l'avion. Recalés à chaque image du globe (`onFrame`) ; échelle et estompe selon l'orientation du sol.
 */
export function HomeMarks({ globe, extras, countries, lang }: { globe: MarksSource | null; extras: HomeExtras | null; countries: readonly CountryRecord[]; lang: Lang }) {
  const marks = useRef<(HTMLDivElement | null)[]>([]);
  const bubbles = useRef<(HTMLDivElement | null)[]>([]);
  const id = useId().replace(/:/g, '');
  const by = new Map(countries.map((c) => [c.cca3, c]));
  // tailles des bulles (texte selon la langue), mesurées après chaque rendu : lues dans la boucle sans forcer de mise en page
  const sizes = useRef<[number, number][]>([]);
  useLayoutEffect(() => { sizes.current = bubbles.current.map((el) => [el?.offsetWidth ?? 0, el?.offsetHeight ?? 0]); });

  useEffect(() => {
    if (!globe || !extras) return;
    const [rabat, madrid, paris, athenes] = extras.escales.map((e) => e.lieu) as [LngLat, LngLat, LngLat, LngLat];
    // épingles (Maroc, Espagne, Islande), drapeau planté (Paris), balise (Athènes) ; bulle i → repère MARK_OF[i]
    const places: LngLat[] = [rabat, madrid, ISLANDE, paris, athenes];
    const MARK_OF = [0, 1, 3, 4];
    return globe.onFrame(() => {
      const v = globe.view();
      if (!v) return;
      const g = places.map((at) => extras.geometry(v.pose, v.viewport, at));
      g.forEach((m, i) => {
        const el = marks.current[i];
        if (!el) return;
        el.style.transform = m ? `translate(${m.x}px, ${m.y}px)` : 'translate(-999px, -999px)';
        el.style.setProperty('--f', (m && m.visible ? m.f : 0).toFixed(3));
        el.style.setProperty('--n', `${(m?.n ?? 0).toFixed(1)}deg`);
        el.style.setProperty('--t', `${(m?.t ?? 0).toFixed(1)}deg`);
      });
      const on = extras.plane.look()?.bubbles ?? [];
      MARK_OF.forEach((k, i) => {
        const el = bubbles.current[i], m = g[k];
        if (!el) return;
        el.classList.toggle('on', !!on[i] && !!m?.visible);
        if (!m) return;
        const [w, h] = sizes.current[i] ?? [0, 0];
        const [x, y] = inScreen(m.x + BUBBLE_OFFSET[i]![0], m.y + BUBBLE_OFFSET[i]![1], w, h, v.viewport);
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
    });
  }, [globe, extras]);

  if (!extras) return null;
  const flag = (cca3: string) => `url('/data/flags/${cca3.toLowerCase()}.svg')`;
  const pins = [extras.escales[0]!.cca3, extras.escales[1]!.cca3, 'ISL'];
  return (
    <div className="reperes" aria-hidden="true">
      {pins.map((cca3, i) => (
        <div key={cca3} className="mk" ref={(el) => { marks.current[i] = el; }}>
          <div className="mk-sol" />
          <div className="mk-tige"><div className="mk-aiguille" /><div className="mk-tete" style={{ backgroundImage: flag(cca3) }} /></div>
        </div>
      ))}
      <div className="mk mk--paris" ref={(el) => { marks.current[3] = el; }}>
        <div className="mk-sol mk-sol--large" /><div className="mk-tache" />
        <div className="mk-tige">
          <div className="mk-mat" /><div className="mk-pommeau" />
          <svg className="mk-drapeau" viewBox="-3 -4 44 32">
            <defs>
              <clipPath id={`${id}-clip`}><path className="mk-ondule" d="M1 1C11 -2 22 4 33 1V23C22 26 11 20 1 23Z" /></clipPath>
              <linearGradient id={`${id}-pli`} x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".25" stopColor="#000" stopOpacity=".18" /><stop offset=".5" stopColor="#fff" stopOpacity=".28" /><stop offset=".75" stopColor="#000" stopOpacity=".18" /><stop offset="1" stopColor="#fff" stopOpacity=".28" /></linearGradient>
            </defs>
            <path className="mk-ondule" d="M1 1C11 -2 22 4 33 1V23C22 26 11 20 1 23Z" fill="#000" transform="translate(2.5 2.5)" stroke="#000" strokeWidth="6.5" strokeLinejoin="round" />
            <path className="mk-ondule" d="M1 1C11 -2 22 4 33 1V23C22 26 11 20 1 23Z" fill="none" stroke="#000" strokeWidth="6.5" strokeLinejoin="round" />
            <path className="mk-ondule" d="M1 1C11 -2 22 4 33 1V23C22 26 11 20 1 23Z" fill="#fff8e7" stroke="#fff8e7" strokeWidth="3.5" strokeLinejoin="round" />
            <g clipPath={`url(#${id}-clip)`}><image href={`/data/flags/${extras.escales[2]!.cca3.toLowerCase()}.svg`} x="1" y="-2" width="32" height="28" preserveAspectRatio="none" /><rect className="mk-pli" fill={`url(#${id}-pli)`} x="1" y="-3" width="66" height="30" /></g>
          </svg>
        </div>
        <span className="mk-etincelle" style={{ left: -11, top: -56 }} />
        <span className="mk-etincelle mk-etincelle--petite" style={{ left: -17, top: -28 }} />
      </div>
      <div className="mk mk--balise" ref={(el) => { marks.current[4] = el; }}><div className="mk-anneau mk-anneau--ping" /><div className="mk-anneau" /><div className="mk-coeur" /></div>
      {extras.escales.map((c, i) => {
        const r = by.get(c.cca3);
        return (
          <div key={c.cca3} className="escale" ref={(el) => { bubbles.current[i] = el; }}>
            <div className="escale-bulle"><b className="escale-point" />{r?.name[lang] ?? c.cca3}<span className="escale-sep">·</span><i>{r?.capital[lang] ?? ''}</i></div>
          </div>
        );
      })}
    </div>
  );
}
