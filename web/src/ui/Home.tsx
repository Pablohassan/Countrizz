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
}

/**
 * Accueil (maquette H3 « lever de Terre », planche « Countrizz jouable », écran 1) : le globe se lève en bas de l'écran ;
 * titre, FR/EN, nom, « Jouer », Scores, À propos flottent au-dessus. Les éléments entrent l'un après l'autre, avec
 * élan (comme l'intro de l'ancien jeu). « Jouer » ouvre la démo des vols jusqu'aux écrans du jeu (plan 2A-5).
 */
export function Home({ lang, m, name, onLang, onName, logo }: Props) {
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
          <span>{m.home.yourName}</span>
          <input value={draft} placeholder={m.home.defaultName} maxLength={NAME_MAX * 4} autoComplete="nickname" spellCheck={false}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </label>
        <a className="accueil-jouer" href="/demo.html">
          <span>{m.home.play}</span>
          <svg viewBox="0 0 66 43" aria-hidden="true"><path fill="#fff" d="M40 0l26 21.5L40 43H30l26-21.5L30 0z" /><path fill="#fff" opacity=".8" d="M20 0l26 21.5L20 43H10l26-21.5L10 0z" /><path fill="#f7dc6f" d="M0 0l26 21.5L0 43h0l16-21.5L0 0z" /></svg>
        </a>
        <div className="accueil-rang2">
          <button type="button" className="accueil-sec" aria-disabled="true" title={m.home.soon}><span>{m.home.scores}</span><small>{m.home.soon}</small></button>
          <button type="button" className="accueil-sec" aria-disabled="true" title={m.home.soon}><span>{m.home.about}</span><small>{m.home.soon}</small></button>
        </div>
        <InstallOffer m={m} />
      </div>
    </div>
  );
}
