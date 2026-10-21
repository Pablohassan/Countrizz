import * as THREE from 'three/webgpu';
import { abs, atan, clamp, dot, exp, float, fract, fwidth, length, max, mix, normalize, select, sin, smoothstep, texture, uniform, vec2, vec3, vec4, output } from 'three/tsl';
import { ARRIVAL, arrivalNodes, breathNode } from './spotlight';
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

/** Réglages de la mise en avant (spec mise en avant §1) : pénombre des voisins, ombre portée, biseau, reflet, lueur, teinte. */
export const SPOT = { dim: 0.45, desaturate: 0.5, shadowPx: 9, shadow: 0.6, bevelPx: 5, bevelLight: 0.35, bevelDark: 0.4, gleam: 0.22, glowPx: 2.5, glow: 0.18, answerTint: 0.18 } as const;

/** Éclairage du pays visé fourni par le matériau de la Terre (earth.ts) ; par défaut neutre. */
export interface SpotLook { exposure: Node<'float'>; hillshade: Node<'float'> }

/**
 * Couche pays lue dans le patch SDF (contrat de PatchMeta, src/data/types.ts) au point `point` du globe (sphère exacte par
 * défaut ; le point dessiné quand le relief est soulevé, earth.ts). Renvoie le nœud de sortie à poser sur
 * `material.outputNode` : la couleur éclairée de la Terre et le pays mis en avant (photo éclairée, voisins dans la pénombre,
 * pièce soulevée, liseré).
 */
export function createCountryLayer(placeholder: THREE.Texture, base: Node<'vec4'> = output, point: Node<'vec3'> = exactSpherePoint(), look: SpotLook = { exposure: float(1), hillshade: float(1) }) {
  const u = makeUniforms();
  const sdfNode = texture(placeholder);

  const uv = frameXY(point, u).add(1).mul(0.5);
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
  // Distance au bord en pixels d'écran (anticrénelage). Pas de garde sur les grandes empreintes : là où le champ sature,
  // il est constant et fwidth vaut 0 (aucun liseré) ; une garde « fw > rangeTexels → bord net » (Task 7, diagnostic MSAA
  // invalidé le 03/10) rendait en escalier le bord des petits pays à l'arrivée.
  const toPx = (v: Node<'float'>) => v.div(max(fwidth(v), 1e-4));
  const sdPx = toPx(sd);
  const gdPx = toPx(gd);

  const t = u.stateTime;
  const isQuestion = u.state.equal(STATE.question), isCorrect = u.state.equal(STATE.correct), isWrong = u.state.equal(STATE.wrong);
  // Mise en scène (spec mise en avant §3) : tout en place dès la réponse (le temps y repart de 0).
  const arr = arrivalNodes(t);
  const settled = select(isQuestion, float(0), float(1));
  const dim = max(arr.dim, settled), draw = max(arr.draw, settled), lift = max(arr.lift, settled);
  const sweep = select(isQuestion, arr.sweep, float(1));
  const spot = u.visible.mul(u.reveal);

  const inside = clamp(sdPx.add(0.5), 0, 1).mul(shownF);
  const edge = smoothstep(float(1.6), float(0), abs(sdPx)).mul(shownF);   // liseré d'environ 1,6 px
  const neighbor = smoothstep(float(2), float(0.5), gdPx).mul(shownF);    // lignes des autres frontières
  const lum = (c: Node<'vec3'>) => dot(c, vec3(0.2126, 0.7152, 0.0722));

  // Le pays : sa photo, éclairée (exposition, estompage), un peu plus vive.
  const lit = base.rgb;
  const exposed = lit.mul(spot.mul(look.exposure.mul(look.hillshade).sub(1)).add(1));
  const vivid = mix(vec3(lum(exposed)), exposed, float(1).add(spot.mul(0.15)));
  // Les voisins : le projecteur les laisse dans la pénombre.
  const dimK = dim.mul(spot);
  const around = mix(lit, vec3(lum(lit)), dimK.mul(SPOT.desaturate)).mul(dimK.mul(SPOT.dim).oneMinus());

  // Pièce soulevée : ombre portée vers le sud-est (y du cadre vers le sud), biseau clair au nord-ouest, sombre au sud-est.
  const uvPerPx = length(fwidth(uv)).mul(Math.SQRT1_2);
  const sdAt = (o: Node<'vec2'>) => sdfNode.sample(uv.add(o)).r.mul(255).sub(128).div(127).mul(u.rangeTexels);
  const shadowAt = sdAt(vec2(-1, -1).mul(Math.SQRT1_2 * SPOT.shadowPx).mul(uvPerPx).mul(lift));
  const shadow = smoothstep(float(-6), float(3), shadowAt.div(max(fwidth(sd), 1e-4))).mul(inside.oneMinus()).mul(lift).mul(spot).mul(SPOT.shadow);
  const texel = vec2(1).div(vec2(sdfNode.size(float(0)) as unknown as Node<'ivec2'>));
  const grad = vec2(sdAt(vec2(texel.x, 0)).sub(sdAt(vec2(texel.x.negate(), 0))), sdAt(vec2(0, texel.y)).sub(sdAt(vec2(0, texel.y.negate()))));
  const facing = dot(normalize(grad.negate().add(vec2(1e-6, 0))), vec2(-1, -1).mul(Math.SQRT1_2));   // bord tourné vers le nord-ouest : > 0
  const band = smoothstep(float(SPOT.bevelPx), float(0), sdPx).mul(inside).mul(lift).mul(spot);
  const bevelLight = band.mul(max(facing, 0)).mul(SPOT.bevelLight), bevelDark = band.mul(max(facing.negate(), 0)).mul(SPOT.bevelDark);
  // Reflet qui traverse le pays une fois, du nord-ouest au sud-est.
  const along = dot(uv.sub(0.5), vec2(Math.SQRT1_2, Math.SQRT1_2));
  const gleamOn = select(sweep.greaterThan(0).and(sweep.lessThan(1)), float(1), float(0));
  const gleam = vec3(1, 0.95, 0.82).mul(exp(along.sub(mix(float(-0.75), float(0.75), sweep)).div(0.035).pow(2).negate()).mul(inside).mul(gleamOn).mul(spot).mul(SPOT.gleam));

  // Liseré : se dessine depuis le nord dans le sens des aiguilles d'une montre, puis respire ; vert ou rouge à la réponse.
  const rel = uv.sub(0.5);
  const turn = fract(atan(rel.x, rel.y.negate()).div(2 * Math.PI).add(1));
  const drawn = smoothstep(turn.sub(0.02), turn, draw.mul(1.02));
  const gold = vec3(0.969, 0.863, 0.435), green = vec3(0.18, 0.8, 0.44), red = vec3(0.91, 0.3, 0.24);
  const rimColor = select(isCorrect, green, select(isWrong, red, gold));
  const pulse = select(isWrong, sin(t.mul(Math.PI * 4)).mul(0.25).add(0.75), float(1));
  const flash = select(isCorrect, exp(t.mul(-3)), float(0));
  const breathing = select(isQuestion.and(t.greaterThan(ARRIVAL.lift.to + 0.4)), breathNode(t), float(1));
  const rimA = edge.mul(drawn).mul(spot).mul(pulse).mul(float(0.75).add(breathing.mul(0.25)));
  const glow = exp(max(sdPx.negate(), 0).div(-SPOT.glowPx)).mul(inside.oneMinus()).mul(shownF).mul(drawn).mul(spot).mul(breathing.mul(0.5).add(0.5).mul(SPOT.glow));
  const tint = select(isQuestion, float(0), float(SPOT.answerTint)).mul(inside).mul(spot);

  let col: Node<'vec3'> = mix(around, vivid, inside);
  col = col.mul(shadow.oneMinus());
  col = col.mul(bevelDark.oneMinus()).add(bevelLight).add(gleam);
  col = mix(col, rimColor, tint);
  col = col.add(rimColor.mul(glow));
  col = mix(col, vec3(0.03, 0.03, 0.05), neighbor.mul(0.5).mul(spot));
  const withEdge = mix(col, mix(rimColor, vec3(1, 1, 1), flash), rimA);

  // Masque binaire (instrument des contrôles) : allumé si et seulement si la distance signée est positive. Une couverture
  // anticrénelée y serait faussée par l'encodage sRGB de sortie (0,5 linéaire → 188 sur 255), qui déplace le seuil
  // « allumé » d'environ 0,3 pixel vers l'extérieur (constaté au cadrage « B », 7 à 16 texels par pixel).
  const mask = select(shown.and(sd.greaterThan(0)), float(1), float(0));
  const outputNode = select(u.maskMode.greaterThan(0.5), vec4(mask, mask, mask, 1), vec4(withEdge, base.a));

  // Couverture : le pays et son liseré, que l'atmosphère physique ne voile pas (spec atmosphère §2.3).
  const coverage = clamp(max(inside.mul(spot), rimA), 0, 1);

  return {
    uniforms: u,
    outputNode,
    coverage: coverage as Node<'float'>,
    setTexture(t: THREE.Texture) { sdfNode.value = t; },
    /** Revient à la texture vide de la couche (patch retiré, avant que le cache ne le libère). */
    clear() { sdfNode.value = placeholder; },
    /** Texture liée au matériau. */
    get texture() { return sdfNode.value as THREE.Texture; },
  };
}
