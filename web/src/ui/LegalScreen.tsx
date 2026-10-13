import { useEffect, useState } from 'react';
import { eoxAttribution } from '../globe/credits';
import type { Messages } from '../i18n';
import './screens.css';

/** « Mentions et licences » (spec 2A §12, décision 8 du plan) : les attributions exigées, en liste brute. */
export function LegalScreen({ m, onBack }: { m: Messages; onBack(): void }) {
  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void Promise.all(['/data/credits.json', '/textures/credits.json'].map((u) => fetch(u).then((r) => r.text())))
      .then((t) => { if (alive) setFiles(t); }, () => {});
    return () => { alive = false; };
  }, []);
  return (
    <div className="ecran mentions">
      <button type="button" className="ecran-retour" onClick={onBack}><span>{m.about.back}</span></button>
      <h1 className="ecran-titre">{m.about.legal}</h1>
      <div className="mentions-panneau">
        <p>{eoxAttribution()}</p>
        {files.map((f, i) => <pre key={i}>{f}</pre>)}
      </div>
    </div>
  );
}
