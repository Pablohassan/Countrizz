import * as THREE from 'three/webgpu';
import { abs, clamp, exp, float, fwidth, length, max, mix, select, sin, smoothstep, texture, uniform, vec3, vec4, output } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { exactSpherePoint, frameXY } from './frameNodes';

/** Repère tangent du centre du patch : C (centre), E (est), N (nord) — voir le contrat de PatchMeta. */
export interface TangentFrame { center: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3 }

export const STATE = { question: 0, correct: 1, wrong: 2 } as const;

function makeUniforms() {
  return {
    center: uniform(new THREE.Vector3(1, 0, 0)),
    east: uniform(new THREE.Vector3(0, 0, -1)),
    north: uniform(new THREE.Vector3(0, 1, 0)),
    extentRad: uniform(0.1),
    rangeTexels: uniform(32),
    /** 0 = aucun pays affiché. */
    visible: uniform(0),
    /** Progression de la vague de révélation, 0 → 1. */
    reveal: uniform(0),
    state: uniform(0),
    /** Secondes depuis le dernier changement d'état. */
    stateTime: uniform(0),
    /** 1 = masque noir et blanc pour les contrôles headless. */
    maskMode: uniform(0),
  };
}
export type CountryUniforms = ReturnType<typeof makeUniforms>;

/**
 * Couche pays lue dans le patch SDF (contrat de PatchMeta, src/data/types.ts). Renvoie le nœud de sortie à
 * poser sur `material.outputNode` : la couleur éclairée de la Terre, recouverte du pays.
 */
export function createCountryLayer(placeholder: THREE.Texture, base: Node<'vec4'> = output) {
  const u = makeUniforms();
  const sdfNode = texture(placeholder);

  const uv = frameXY(exactSpherePoint(), u).add(1).mul(0.5);
  const inFrame = uv.x.greaterThanEqual(0).and(uv.x.lessThanEqual(1)).and(uv.y.greaterThanEqual(0)).and(uv.y.lessThanEqual(1));
  const shown = inFrame.and(u.visible.greaterThan(0.5));
  // Facteur 0/1, et non `select(shown, calcul, 0)` : TSL compilerait le calcul dans un `if (shown)`, et la lecture du patch et
  // fwidth y seraient indéfinis sur les blocs de 2×2 pixels coupés par le bord du cadre — le liseré traçait alors des traits
  // droits le long de ce bord (03/10 : Japon, Irlande au bord du cadre de la France ; GPU réel comme SwiftShader, WebGL 2
  // comme WebGPU). Hors du cadre, la lecture est bornée au bord du patch (ClampToEdge), donc continue : dérivée sage.
  const shownF = select(shown, float(1), float(0));

  const sample = sdfNode.sample(uv);
  const sd = sample.r.mul(255).sub(128).div(127).mul(u.rangeTexels); // texels, > 0 dedans
  const gd = sample.g.mul(u.rangeTexels); // texels jusqu'à la ligne voisine la plus proche
  // Distance au bord en pixels d'écran (anticrénelage). Une empreinte de pixel (fwidth) de plus de rangeTexels texels ne
  // dit plus rien (le champ sature à rangeTexels : patch minuscule à l'écran) : le bord devient net.
  const toPx = (v: Node<'float'>) => {
    const fw = fwidth(v);
    return select(fw.greaterThan(u.rangeTexels), v.mul(1e3), v.div(max(fw, 1e-4)));
  };
  const sdPx = toPx(sd);
  const gdPx = toPx(gd);

  // vague depuis le centre du patch : rayon en unités de demi-cadre, 0 → √2
  const radial = length(uv.sub(0.5)).mul(2);
  const wave = smoothstep(u.reveal.mul(1.5).sub(0.08), u.reveal.mul(1.5), radial).oneMinus();

  const inside = clamp(sdPx.add(0.5), 0, 1);
  const edge = smoothstep(float(1.5), float(0), abs(sdPx)); // liseré d'environ 1,5 px
  const glow = exp(max(sd, 0).negate().div(6)).mul(0.35); // lueur intérieure près du bord
  const neighbor = smoothstep(float(2), float(0.5), gdPx); // lignes des autres frontières, ~1,5 px

  const t = u.stateTime;
  const isCorrect = u.state.equal(STATE.correct), isWrong = u.state.equal(STATE.wrong);
  const yellow = vec3(1.0, 0.933, 0.012), green = vec3(0.18, 0.8, 0.44), red = vec3(0.91, 0.3, 0.24);
  const color = select(isCorrect, green, select(isWrong, red, yellow));
  const pulse = select(isWrong, sin(t.mul(Math.PI * 4)).mul(0.25).add(0.75), float(1));
  const flash = select(isCorrect, exp(t.mul(-3)), float(0));

  const fillA = inside.mul(wave).mul(float(0.63).add(glow)).mul(pulse);
  const edgeA = edge.mul(wave).mul(float(0.85).add(flash.mul(0.15)));
  const lineA = neighbor.mul(wave).mul(0.8);

  const lit = base.rgb;
  const withLines = mix(lit, vec3(0.03, 0.03, 0.05), lineA.mul(shownF));
  const withFill = mix(withLines, color, fillA.mul(shownF));
  const withEdge = mix(withFill, mix(color, vec3(1, 1, 1), flash), edgeA.mul(shownF));

  // Masque binaire (instrument des contrôles) : allumé si et seulement si la distance signée est positive. Une couverture
  // anticrénelée y serait faussée par l'encodage sRGB de sortie (0,5 linéaire → 188 sur 255), qui déplace le seuil
  // « allumé » d'environ 0,3 pixel vers l'extérieur (constaté au cadrage « B », 7 à 16 texels par pixel).
  const mask = select(shown.and(sd.greaterThan(0)), float(1), float(0));
  const outputNode = select(u.maskMode.greaterThan(0.5), vec4(mask, mask, mask, 1), vec4(withEdge, base.a));

  return {
    uniforms: u,
    outputNode,
    setTexture(t: THREE.Texture) { sdfNode.value = t; },
  };
}
