import { useState } from 'react';
import type { Messages } from '../i18n';
import { promptInstall, useInstall } from '../pwa/install';
import type { Haptics } from './haptics';
import { browserShareEnv, SHARE_URL, shareGame, type ShareOutcome } from './share';
import './screens.css';

interface Props { m: Messages; haptics: Haptics; onVibrations(on: boolean): void; onBack(): void; onLegal(): void }

/**
 * À propos (D14) : « Installer l'appli » (invite du navigateur ; astuce iPhone/iPad ; masqué une fois installée),
 * « Partager le jeu », le lien GitHub, le réglage « Vibrations » (§7) et « Mentions et licences ».
 */
export function AboutScreen({ m, haptics, onVibrations, onBack, onLegal }: Props) {
  const install = useInstall();
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  const [vibrations, setVibrations] = useState(haptics.enabled);
  const canInstall = !install.standalone && (install.canPrompt || install.ios);
  return (
    <div className="ecran apropos">
      <button type="button" className="ecran-retour" onClick={onBack}><span>{m.about.back}</span></button>
      <h1 className="ecran-titre">{m.about.title}</h1>
      <div className="apropos-bloc">
        {canInstall && (
          <>
            <button type="button" className="bouton-violet apropos-cta" onClick={() => { if (install.canPrompt) void promptInstall(); }}><span>{m.about.install}</span></button>
            <p className="apropos-plus">{m.about.installText}</p>
            {install.ios && <p className="apropos-ios">{m.about.iosTip}</p>}
          </>
        )}
        <button type="button" className="bouton-violet apropos-cta apropos-cta--partage"
          onClick={async () => setShared(await shareGame(browserShareEnv(), 'Countrizz', m.about.shareText))}><span>{m.about.share}</span></button>
        <p className="apropos-plus" aria-live="polite">{shared === 'copied' ? m.about.linkCopied : shared === 'link' ? SHARE_URL : m.about.shareText}</p>
        <a className="apropos-github" href="https://github.com/Pablohassan" target="_blank" rel="noreferrer">github.com/Pablohassan</a>
        <label className="apropos-vibrations">
          <input type="checkbox" role="switch" checked={vibrations}
            onChange={(e) => { setVibrations(e.target.checked); haptics.setEnabled(e.target.checked); onVibrations(e.target.checked); }} />
          {m.about.vibrations}
        </label>
      </div>
      <button type="button" className="apropos-mentions" onClick={onLegal}>{m.about.legal}</button>
    </div>
  );
}
