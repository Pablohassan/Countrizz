/**
 * Instrument des contrôles e2e : trouve, dans un fragment shader généré par three (GLSL ou WGSL), les dérivées d'écran
 * (fwidth, dFdx/dFdy, dpdx/dpdy) et les lectures de texture à niveau de détail implicite (texture, textureSample) placées
 * dans une branche dont la condition dépend du pixel. Leur résultat y est indéfini : sur un bloc de 2×2 pixels coupé par la
 * condition, le voisin inactif rend n'importe quoi. TSL compile `select(cond, calcul, 0)` en `if (cond) { calcul }` ; avec
 * `cond` = « dans le cadre du patch », le liseré du pays traçait des traits droits le long du bord du cadre (03/10, GPU réel
 * comme SwiftShader, WebGL 2 comme WebGPU ; three désactive en WGSL le diagnostic `derivative_uniformity`).
 *
 * Analyse ligne à ligne, à la mesure du code de three (une instruction par ligne, `if ( … ) {` / `} else {` sur leur ligne) :
 * une condition est uniforme si elle ne lit que des uniformes, des littéraux et des variables assignées uniformément.
 */
export interface DivergentDerivative { line: number; text: string }

const DERIVATIVE = /\b(fwidth|fwidthCoarse|fwidthFine|dFdx|dFdy|dpdx|dpdy|dpdxCoarse|dpdyCoarse|dpdxFine|dpdyFine|texture|textureSample|textureSampleBias|textureSampleCompare)\s*\(/;

export function derivativesInDivergentFlow(source: string): DivergentDerivative[] {
  const lines = source.split('\n');
  const uniform = new Set<string>();
  const assigned = new Map<string, boolean>();

  // Uniformes : blocs std140 et `uniform T nom;` (GLSL), `var<uniform>` et liaisons de texture/échantillonneur (WGSL).
  let inBlock = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (/^layout\s*\(.*\)\s*uniform\s+\w+\s*\{$/.test(t) || /^uniform\s+\w+\s*\{$/.test(t)) { inBlock = true; continue; }
    if (inBlock) { if (t.startsWith('}')) inBlock = false; else { const m = /(\w+)\s*(\[[^\]]*\])?\s*;$/.exec(t); if (m) uniform.add(m[1]!); } continue; }
    let m = /^uniform\s+(?:\w+\s+)+(\w+)\s*(\[[^\]]*\])?\s*;$/.exec(t);
    if (m) uniform.add(m[1]!);
    m = /^var<uniform>\s+(\w+)/.exec(t) ?? /@group\s*\(\s*\d+\s*\)\s*var\s+(\w+)\s*:/.exec(t);
    if (m) uniform.add(m[1]!);
  }

  // Fonctions dont le corps dérive : leurs appels comptent comme des dérivées.
  const deriving = new Set<string>();
  let current: string | null = null, depth = 0;
  for (const raw of lines) {
    const t = raw.trim();
    if (depth === 0) { const m = /^(?:fn\s+(\w+)\s*\(|\w+\s+(\w+)\s*\([^;]*\)\s*\{?$)/.exec(t); if (m) current = m[1] ?? m[2] ?? null; }
    if (current && current !== 'main' && DERIVATIVE.test(t)) deriving.add(current);
    for (const ch of t) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) current = null; } }
  }
  const callsDeriving = (t: string) => [...deriving].some((f) => new RegExp(`\\b${f}\\s*\\(`).test(t));

  const isUniform = (expr: string) => {
    const cleaned = expr
      .replace(/\b\d+\.?\d*(?:e[+-]?\d+)?[fu]?\b|\.\d+(?:e[+-]?\d+)?\b/gi, ' ')
      .replace(/\.\s*\w+/g, ' ') // membres et composantes : c'est la base qui décide
      .replace(/<[\w\s,<>]*>/g, ' '); // paramètres de type WGSL : vec3<f32>
    for (const m of cleaned.matchAll(/\b([A-Za-z_]\w*)\b(\s*\()?/g)) {
      if (m[2]) continue; // appel de fonction ou constructeur de type
      const id = m[1]!;
      if (id === 'true' || id === 'false' || uniform.has(id) || assigned.get(id) === true) continue;
      return false;
    }
    return true;
  };

  const found: DivergentDerivative[] = [];
  const stack: boolean[] = []; // uniformité de chaque bloc ouvert
  const here = () => stack.every(Boolean);
  lines.forEach((raw, i) => {
    const t = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^\}\s*else\s+if\s*\((.*)\)\s*\{$/.exec(t))) { const prev = stack.pop() ?? true; stack.push(prev && isUniform(m[1]!)); return; }
    if (/^\}\s*else\s*\{$/.test(t)) { const prev = stack.pop() ?? true; stack.push(prev); return; }
    if ((m = /^(?:if|while)\s*\((.*)\)\s*\{$/.exec(t))) {
      // la condition s'évalue avant de brancher : dans le flot du bloc parent
      if (!here() && (DERIVATIVE.test(m[1]!) || callsDeriving(m[1]!))) found.push({ line: i + 1, text: t });
      stack.push(isUniform(m[1]!));
      return;
    }
    if (here() === false && (DERIVATIVE.test(t) || callsDeriving(t))) found.push({ line: i + 1, text: t });
    if ((m = /^(?:(?:var|let)\s+)?(\w+)(?:\s*:\s*[\w<>, ]+)?\s*(?:[-+*/]?=)(?!=)\s*(.*);$/.exec(t)) && !/^(return|const|uniform|layout)\b/.test(t)) {
      const name = m[1]!, value = here() && isUniform(m[2]!) && assigned.get(name) !== false;
      assigned.set(name, value);
    }
    for (const ch of t) { if (ch === '{') stack.push(here()); else if (ch === '}') stack.pop(); }
  });
  return found;
}
