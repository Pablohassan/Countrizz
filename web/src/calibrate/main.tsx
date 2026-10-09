import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FOV_Y_DEG, FRAMING } from '../camera/config';
import { frameAltitude, type FramingParams } from '../camera/framing';
import { loadCountries } from '../data/countries';
import type { CountryRecord } from '../data/types';
import { GlobeView, type GlobeHandle } from '../globe/GlobeView';

/** Réglages de départ : config.ts, surchargés par l'URL (`k`, `margin`, `floor`, `ctx` = θ_min) pour partager un réglage. */
function framingFromUrl(q: URLSearchParams): FramingParams {
  const read = (name: string, fallback: number) => (q.has(name) ? Number(q.get(name)) : fallback);
  return { ...FRAMING, k: read('k', FRAMING.k), margin: read('margin', FRAMING.margin), floor: read('floor', FRAMING.floor), minContextDeg: read('ctx', FRAMING.minContextDeg ?? 0) };
}

/** Pays de référence du spec §8 (cadrage), plus quelques formes et tailles variées. */
const REFERENCES = ['RUS', 'FRA', 'CHL', 'LUX', 'MLT', 'VAT', 'KIR', 'BRA', 'EGY', 'JPN', 'ITA', 'IDN'];

/**
 * Page de calibration (dev seulement) : choisir k, m et le plancher en regardant les pays de référence, en paysage
 * et en portrait (redimensionner la fenêtre ou passer en mode appareil). « Copier » donne la ligne de config.ts.
 * URL : `country`, `k`, `margin`, `floor`, `ctx` (θ_min) préréglent la page ; `nopanel` masque le panneau (captures).
 */
function Calibrate() {
  const globe = useRef<GlobeHandle>(null);
  const [countries, setCountries] = useState<CountryRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<CountryRecord | null>(null);
  const [framing, setFraming] = useState<FramingParams>(() => framingFromUrl(new URLSearchParams(location.search)));
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  useEffect(() => { void loadCountries('/').then(setCountries); }, []);
  useEffect(() => { const f = () => setSize({ width: innerWidth, height: innerHeight }); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  const refs = useMemo(() => REFERENCES.map((c) => countries.find((x) => x.cca3 === c)).filter((c): c is CountryRecord => !!c), [countries]);

  const go = (rec: CountryRecord) => { setCurrent(rec); void globe.current!.flyTo(rec).then(() => globe.current!.showQuestion()); };
  useEffect(() => { if (current) go(current); }, [framing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('country');
    const rec = countries.find((c) => c.cca3 === code);
    if (ready && rec) go(rec);
  }, [ready, countries]); // eslint-disable-line react-hooks/exhaustive-deps

  const slider = (key: 'k' | 'margin' | 'floor' | 'minContextDeg', min: number, max: number, step: number) => (
    <label style={{ display: 'block' }}>
      {key} = {framing[key] ?? 0}
      <input type="range" min={min} max={max} step={step} value={framing[key] ?? 0} onChange={(e) => setFraming({ ...framing, [key]: Number(e.target.value) })} />
    </label>
  );
  const line = `export const FRAMING: FramingParams = ${JSON.stringify(framing).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')};`;
  return (
    <>
      <GlobeView ref={globe} framing={framing} onReady={() => setReady(true)} />
      <div hidden={new URLSearchParams(location.search).has('nopanel')} style={{ position: 'absolute', top: 8, left: 8, padding: 8, background: '#16173acc', color: '#f7dc6f', maxWidth: 360, fontSize: 13 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {refs.map((c) => <button key={c.cca3} disabled={!ready} onClick={() => go(c)}>{c.cca3}</button>)}
        </div>
        {slider('k', 0.8, 2, 0.01)}
        {slider('margin', 1, 3, 0.05)}
        {slider('floor', 0.0001, 0.002, 0.0001)}
        {slider('minContextDeg', 0, 10, 0.25)}
        {current && <p>{current.name.fr} : θ = {current.cap.radiusDeg.toFixed(3)}°, altitude = {frameAltitude(current.cap.radiusDeg, { ...size, fovYDeg: FOV_Y_DEG }, framing).toFixed(4)} rayon</p>}
        <button onClick={() => void navigator.clipboard.writeText(line)}>Copier la ligne de config.ts</button>
        <code style={{ display: 'block', marginTop: 4, wordBreak: 'break-all' }}>{line}</code>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Calibrate /></StrictMode>);
