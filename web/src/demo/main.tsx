import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadCountries } from '../data/countries';
import type { CountryRecord, LngLat } from '../data/types';
import { GlobeView, type GlobeHandle } from '../globe/GlobeView';
import type { ScreenPoint } from '../globe/project';

declare global {
  interface Window { __demo?: { arrived: string[]; done: boolean; ready: number; project(p: LngLat): ScreenPoint | null } }
}
window.__demo = { arrived: [], done: false, ready: 0, project: () => null };
const q = new URLSearchParams(location.search);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Démonstration de la phase 1A, en attendant le jeu (phase 2) : vols, question, réponse. `?demo=FRA,JPN,FJI` enchaîne
 * ces pays tout seul (contrôle Playwright) ; sinon, un bouton « pays suivant ».
 */
function Demo() {
  const globe = useRef<GlobeHandle>(null);
  const [countries, setCountries] = useState<CountryRecord[]>([]);
  const [current, setCurrent] = useState<CountryRecord | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { void loadCountries('/').then(setCountries); }, []);
  useEffect(() => { window.__demo!.project = (p) => globe.current?.project(p) ?? null; }, []);

  async function visit(rec: CountryRecord, next?: CountryRecord) {
    setCurrent(rec);
    if (next) globe.current!.prefetch(next);
    await globe.current!.flyTo(rec).arrived;
    window.__demo!.arrived.push(rec.cca3);
    globe.current!.showQuestion();
  }

  useEffect(() => {
    const list = new URLSearchParams(location.search).get('demo');
    if (!ready || !countries.length) return;
    if (!list) return;
    const codes = list.split(',');
    void (async () => {
      for (let i = 0; i < codes.length; i++) {
        const rec = countries.find((c) => c.cca3 === codes[i])!;
        await visit(rec, countries.find((c) => c.cca3 === codes[i + 1]));
        await wait(700);
        globe.current!.answer('correct');
        await wait(600);
      }
      window.__demo!.done = true;
    })();
  }, [ready, countries]);

  // `?spin=6` : rotation lente au repos (contrôle du mouvement réduit à chaud)
  useEffect(() => { if (ready && q.has('spin')) globe.current!.setIdleSpin(Number(q.get('spin'))); }, [ready]);
  // `?safe=80,300` : bandes occupées (HUD, grille) — le pays se centre dans la zone libre
  useEffect(() => {
    if (ready && q.has('safe')) { const [top, bottom] = q.get('safe')!.split(',').map(Number); globe.current!.setSafeArea({ top: top!, bottom: bottom! }); }
  }, [ready]);

  const random = () => countries[Math.floor(Math.random() * countries.length)]!;
  return (
    <>
      <GlobeView ref={globe} onReady={() => { window.__demo!.ready++; setReady(true); }} />
      <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 8, fontFamily: 'sans-serif' }}>
        <button disabled={!ready} onClick={() => void visit(random())}>Pays suivant</button>
        <button disabled={!current} onClick={() => globe.current!.answer('correct')}>Bonne réponse</button>
        <button disabled={!current} onClick={() => globe.current!.answer('wrong')}>Mauvaise réponse</button>
        <span style={{ color: '#f7dc6f' }}>{current?.name.fr}</span>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
