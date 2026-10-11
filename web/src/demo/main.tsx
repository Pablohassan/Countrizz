import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { loadCountries } from '../data/countries';
import type { CountryRecord, LngLat } from '../data/types';
import { toVec } from '../geo/vec';
import { GlobeView, type GlobeHandle } from '../globe/GlobeView';
import type { ScreenPoint } from '../globe/project';

declare global {
  interface Window {
    __demo?: {
      arrived: string[]; done: boolean; ready: number; project(p: LngLat): ScreenPoint | null;
      /** signaux du globe : progression, pertes du GPU, erreurs ; `retry` : nouvel essai */
      loading: number[]; lost: number; errors: { reason: string; detail: string }[]; retry(): void;
    };
  }
}
window.__demo = { arrived: [], done: false, ready: 0, project: () => null, loading: [], lost: 0, errors: [], retry: () => {} };
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
  useEffect(() => {
    window.__demo!.project = (p) => globe.current?.project(p) ?? null;
    window.__demo!.retry = () => globe.current?.retry();
  }, []);

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

  // `?accessoire` : une bille magenta posée sur Paris (contrôle du montage, et de sa recréation après une perte du GPU)
  useEffect(() => {
    if (!ready || !q.has('accessoire')) return;
    return globe.current!.mount({
      create: () => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 8), new THREE.MeshBasicNodeMaterial({ color: 0xff00ff }));
        m.position.set(...toVec([2.35, 48.85]));
        return { object: m, dispose: () => { m.geometry.dispose(); m.material.dispose(); } };
      },
    });
  }, [ready]);

  const random = () => countries[Math.floor(Math.random() * countries.length)]!;
  return (
    <>
      <GlobeView ref={globe} onReady={() => { window.__demo!.ready++; setReady(true); }}
        onLoading={(p) => window.__demo!.loading.push(p)} onLost={() => window.__demo!.lost++} onError={(e) => window.__demo!.errors.push(e)}
        errorUi={!q.has('noerrorui')} credit={q.has('credit') ? { bottom: `${q.get('credit')}px` } : undefined} />
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
