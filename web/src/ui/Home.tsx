import { useState, type CSSProperties } from 'react';
import type { Lang, Mode } from '../game/types';
import { MODES } from '../game/types';
import { NAME_MAX, normalizeName } from '../game/prefs';
import type { ScoreBook } from '../game/scores';
import type { Messages } from '../i18n';
import { InstallOffer } from './InstallOffer';
import type { RondTitre } from '../intro/lecteur';
import { LogoTitle } from './LogoTitle';
import './home.css';
import './screens.css';

/**
 * Apparition de l'accueil (mise en scène du 24/10) : `fondu`, la première, depuis la vidéo (les commandes montent pendant
 * le fondu) ; `pop`, la première, sans vidéo (accueil direct : les lettres du titre surgissent) ; `deja`, tout retour
 * (après une partie, les scores, À propos) : l'accueil est déjà en place, rien ne rejoue.
 */
export type EntreeAccueil = 'fondu' | 'pop' | 'deja';

/** Étoiles de difficulté (D9) : Drapeau 1, Pays 2, Capitale 3. */
const STARS: Record<Mode, number> = { flag: 1, country: 2, capital: 3 };

/** Meilleur score local de chaque mode ; `null` : jamais joué (« Nouveau »). */
export const bestScores = (book: ScoreBook): Record<Mode, number | null> =>
  Object.fromEntries(MODES.map((mode) => [mode, book.read(mode)[0]?.score ?? null])) as Record<Mode, number | null>;

interface Props {
  lang: Lang;
  m: Messages;
  name: string;
  onLang(lang: Lang): void;
  onName(name: string): void;
  /**
   * Le titre : `visible` quand le fondu commence (ou à l'accueil direct) ; la petite Terre part alors de `angle`, celui de
   * la Terre de la vidéo ; `sur` : le « o » du titre de la vidéo à cet écran (posé dessus pendant le `fondu`, et gardé
   * ensuite sur un téléphone, LogoTitle).
   */
  logo: { angle: number | null; visible: boolean; sur: RondTitre | null; fondu: boolean };
  /** Lue au montage seulement : un accueil monté ne change pas d'entrée en cours de route. */
  entree: EntreeAccueil;
  /** « Jouer » actif : globe prêt, pays chargés (dès le fondu : il n'a lieu que le globe prêt). */
  canPlay: boolean;
  onPlay(): void;
  onScores(): void;
  onAbout(): void;
  /** Choix du mode (écran `mode` de la machine) : sur place, les commandes laissent la place aux trois modes (D9). */
  choix: boolean;
  best: Record<Mode, number | null>;
  onChoose(mode: Mode): void;
  onBack(): void;
  /** Le mode choisi, l'accueil sort (0,3 s) pendant que le vol part. */
  sortie: boolean;
}

/**
 * Accueil (maquette H3 « lever de Terre ») et choix du mode, sur le même décor : le globe se lève en bas ; titre, FR/EN, nom,
 * « Jouer », Scores, À propos au-dessus. « Jouer » ne change pas d'écran (mise en scène du 24/10 : un écran entier pour un
 * seul choix retirait l'avion et les repères d'un coup) : les commandes glissent, les trois modes arrivent à leur place,
 * « ‹ Retour » les referme. Commandes en relief de pâte, comme le titre (retouche du 20/10).
 */
export function Home({ lang, m, name, onLang, onName, logo, entree, canPlay, onPlay, onScores, onAbout, choix, best, onChoose, onBack, sortie }: Props) {
  const [draft, setDraft] = useState(name);
  const [apparition] = useState(entree);
  const commit = () => { const n = normalizeName(draft, ''); setDraft(n); onName(n); };
  const cls = `accueil accueil--${apparition}${logo.visible ? ' accueil--visible' : ''}${choix ? ' accueil--choix' : ''}${sortie ? ' accueil--sortie' : ''}`;
  return (
    <div className={cls}>
      <div className="accueil-lang" role="group" aria-label={m.home.language} inert={choix || sortie}>
        {(['fr', 'en'] as const).map((l) => (
          <button key={l} type="button" aria-pressed={lang === l} onClick={() => onLang(l)}>{l.toUpperCase()}</button>
        ))}
      </div>
      <button type="button" className="ecran-retour accueil-retour" inert={!choix || sortie} onClick={onBack}><span>{m.mode.back}</span></button>
      <LogoTitle angle={logo.angle} visible={logo.visible} entree={apparition === 'fondu' ? 'fondu' : apparition === 'pop' ? 'pop' : 'deja'} sur={logo.sur} fondu={logo.fondu} />
      <div className="accueil-commandes" inert={choix || sortie}>
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
      <div className="accueil-modes" inert={!choix || sortie}>
        {MODES.map((mode, k) => (
          <button key={mode} type="button" className="mode-bouton" style={{ '--k': k } as CSSProperties} onClick={() => onChoose(mode)}>
            <span className="mode-nom">
              <span>{m.modes[mode]}</span>
              <span className="etoiles" aria-hidden="true">{'★'.repeat(STARS[mode])}<span className="etoiles-off">{'★'.repeat(3 - STARS[mode])}</span></span>
            </span>
            {best[mode] === null
              ? <span className="record record--nouveau">{m.mode.new}</span>
              : <span className="record"><small>{m.mode.record}</small> {best[mode]}</span>}
          </button>
        ))}
      </div>
      <InstallOffer m={m} />
    </div>
  );
}
