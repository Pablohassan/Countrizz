import { useState } from 'react';
import type { Lang } from '../game/types';
import { NAME_MAX, normalizeName } from '../game/prefs';
import type { Messages } from '../i18n';
import { InstallOffer } from './InstallOffer';
import { LogoTitle, type EntreeTitre } from './LogoTitle';
import './home.css';

interface Props {
  lang: Lang;
  m: Messages;
  name: string;
  onLang(lang: Lang): void;
  onName(name: string): void;
  /**
   * Le titre : `visible` quand le fondu commence (ou à l'accueil direct) ; la petite Terre part alors de `angle`, celui de
   * la Terre de la vidéo ; `entree` : en fondu depuis la vidéo, ou lettres qui surgissent (LogoTitle).
   */
  logo: { angle: number | null; visible: boolean; entree: EntreeTitre };
  /** « Jouer » actif : intro finie, globe prêt, pays chargés. */
  canPlay: boolean;
  onPlay(): void;
  onScores(): void;
  onAbout(): void;
}

/**
 * Accueil (maquette H3 « lever de Terre », planche « Countrizz jouable », écran 1) : le globe se lève en bas de l'écran ;
 * titre, FR/EN, nom, « Jouer », Scores, À propos flottent au-dessus. Les éléments entrent l'un après l'autre, avec
 * élan (comme l'intro de l'ancien jeu). Boutons et champ du nom en relief de pâte, comme le titre (retouche du 20/10) ;
 * l'invitation à installer en bas de l'écran, juste au-dessus des crédits. « Jouer » ouvre le choix du mode ; Scores et À propos leurs écrans (plan 2A-5).
 */
export function Home({ lang, m, name, onLang, onName, logo, canPlay, onPlay, onScores, onAbout }: Props) {
  const [draft, setDraft] = useState(name);
  const commit = () => { const n = normalizeName(draft, ''); setDraft(n); onName(n); };
  return (
    <div className="accueil">
      <div className="accueil-lang" role="group" aria-label={m.home.language}>
        {(['fr', 'en'] as const).map((l) => (
          <button key={l} type="button" aria-pressed={lang === l} onClick={() => onLang(l)}>{l.toUpperCase()}</button>
        ))}
      </div>
      <LogoTitle angle={logo.angle} visible={logo.visible} entree={logo.entree} />
      <div className="accueil-commandes">
        <label className="accueil-nom">
          <span className="accueil-nom-etiquette">{m.home.yourName}</span>
          <span className="accueil-nom-puits">
            <input value={draft} placeholder={m.home.defaultName} maxLength={NAME_MAX * 4} autoComplete="nickname" spellCheck={false}
              onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            <svg className="accueil-nom-crayon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25z" fill="currentColor" /><path d="M20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" opacity=".7" /></svg>
          </span>
        </label>
        <button type="button" className="accueil-jouer" disabled={!canPlay} onClick={onPlay}>
          <span className="accueil-jouer-3d"><span className="accueil-jouer-face">
            <span className="accueil-jouer-texte">{m.home.play}</span>
            <svg viewBox="0 0 66 43" aria-hidden="true"><path className="chevron chevron-3" fill="#fff" d="M40 0l26 21.5L40 43H30l26-21.5L30 0z" /><path className="chevron chevron-2" fill="#fff" opacity=".8" d="M20 0l26 21.5L20 43H10l26-21.5L10 0z" /><path className="chevron chevron-1" fill="#f7dc6f" d="M0 0l26 21.5L0 43h0l16-21.5L0 0z" /></svg>
          </span></span>
        </button>
        <div className="accueil-rang2">
          <button type="button" className="accueil-sec" onClick={onScores}><span>{m.home.scores}</span></button>
          <button type="button" className="accueil-sec" onClick={onAbout}><span>{m.home.about}</span></button>
        </div>
      </div>
      <InstallOffer m={m} />
    </div>
  );
}
