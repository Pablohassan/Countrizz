import { describe, expect, it } from 'vitest';
import { derivativesInDivergentFlow } from './shaderUniformity';

// Extraits calqués sur le code que three r186 génère pour la Terre (03/10) : la couche pays compilée en `if ( dansLeCadre )`.
const GLSL_HEAD = `#version 300 es
layout( std140 ) uniform object {
	float nodeUniform36;
	float nodeUniform41;
	float nodeUniform45;
};
layout( std140 ) uniform render {
	vec3 cameraPosition;
};
uniform sampler2D nodeUniform42;
in vec3 v_positionWorld;
in vec2 nodeVarying7;
`;
const glsl = (body: string) => `${GLSL_HEAD}\nvoid main() {\n${body}\n}\n`;

const WGSL_HEAD = `diagnostic( off, derivative_uniformity );
@binding( 13 ) @group( 1 ) var nodeUniform35_sampler : sampler;
@binding( 14 ) @group( 1 ) var nodeUniform35 : texture_2d<f32>;
struct objectStruct {
	nodeUniform29 : f32,
	nodeUniform37 : f32
};
@binding( 2 ) @group( 1 )
var<uniform> object : objectStruct;
`;
const wgsl = (body: string) => `${WGSL_HEAD}\nfn main( @location( 1 ) v_positionWorld : vec3<f32>, @location( 4 ) nodeVarying7 : vec2<f32> ) -> OutputStruct {\n${body}\n}\n`;

describe('dérivées en flot de contrôle divergent (shader généré)', () => {
  it('GLSL : fwidth et texture() dans une branche qui dépend du pixel sont signalés', () => {
    const found = derivativesInDivergentFlow(glsl(`
	nodeVar213 = ( v_positionWorld.xy * vec2( 0.5 ) );
	nodeVar214 = ( ( nodeVar213.x >= 0.0 ) && ( nodeUniform41 > 0.5 ) );
	if ( nodeVar214 ) {
		nodeVar220 = texture( nodeUniform42, nodeVar213 );
		nodeVar221 = ( nodeVar220.y * nodeUniform45 );
		nodeVar222 = fwidth( nodeVar221 );
	} else {
		nodeVar207 = 0.0;
	}`));
    expect(found.map((f) => f.text)).toEqual(['nodeVar220 = texture( nodeUniform42, nodeVar213 );', 'nodeVar222 = fwidth( nodeVar221 );']);
    expect(found[0]!.line).toBeGreaterThan(0);
  });

  it('GLSL : la même chose dans une branche sur uniforme (et dans son else) passe', () => {
    expect(derivativesInDivergentFlow(glsl(`
	nodeVar202 = bool( nodeUniform41 );
	if ( ( nodeUniform36 > 0.5 ) ) {
		nodeVar204 = texture( nodeUniform42, nodeVarying7 );
	} else {
		if ( nodeVar202 ) {
			nodeVar222 = fwidth( v_positionWorld.x );
		}
		nodeVar223 = dFdx( cameraPosition.x );
	}`))).toEqual([]);
  });

  it('GLSL : le else d’une branche divergente, et une branche imbriquée dedans, sont divergents', () => {
    const found = derivativesInDivergentFlow(glsl(`
	if ( ( v_positionWorld.x > 0.0 ) ) {
		nodeVar1 = 1.0;
	} else {
		if ( ( nodeUniform36 > 0.5 ) ) {
			nodeVar2 = dFdy( nodeVarying7.x );
		}
	}`));
    expect(found.map((f) => f.text)).toEqual(['nodeVar2 = dFdy( nodeVarying7.x );']);
  });

  it('une variable assignée sous condition divergente rend divergente la branche qui la teste', () => {
    const found = derivativesInDivergentFlow(glsl(`
	if ( ( v_positionWorld.x > 0.0 ) ) {
		nodeVar5 = 1.0;
	} else {
		nodeVar5 = 0.0;
	}
	if ( ( nodeVar5 > 0.5 ) ) {
		nodeVar6 = fwidth( nodeVarying7.x );
	}`));
    expect(found).toHaveLength(1);
  });

  it('une dérivée dans la condition est évaluée avant la branche : signalée seulement si le bloc parent diverge', () => {
    const found = derivativesInDivergentFlow(glsl(`
	if ( ( fwidth( nodeVarying7.x ) > nodeUniform45 ) ) {
		nodeVar1 = 1.0;
		if ( ( dFdx( nodeVarying7.y ) > 0.0 ) ) {
			nodeVar2 = 1.0;
		}
	}`));
    expect(found.map((f) => f.text)).toEqual(['if ( ( dFdx( nodeVarying7.y ) > 0.0 ) ) {']);
  });

  it('les lectures à niveau de détail explicite ne sont pas des dérivées', () => {
    expect(derivativesInDivergentFlow(glsl(`
	if ( ( v_positionWorld.x > 0.0 ) ) {
		nodeVar1 = textureLod( nodeUniform42, nodeVarying7, 0.0 );
		nodeVar2 = texelFetch( nodeUniform42, ivec2( 0 ), 0 );
	}`))).toEqual([]);
  });

  it('un appel de fonction qui dérive compte comme une dérivée', () => {
    const src = glsl(`
	if ( ( v_positionWorld.x > 0.0 ) ) {
		nodeVar1 = edgeWidth( nodeVarying7.x );
	}`).replace('void main() {', 'float edgeWidth( float v ) {\n\treturn fwidth( v );\n}\nvoid main() {');
    expect(derivativesInDivergentFlow(src).map((f) => f.text)).toEqual(['nodeVar1 = edgeWidth( nodeVarying7.x );']);
  });

  it('WGSL : fwidth et textureSample dans une branche divergente sont signalés, pas textureSampleLevel', () => {
    const found = derivativesInDivergentFlow(wgsl(`
	nodeVar174 = ( ( nodeVarying7.x >= 0.0 ) && ( object.nodeUniform29 > 0.5 ) );
	if ( nodeVar174 ) {
		nodeVar176 = textureSample( nodeUniform35, nodeUniform35_sampler, nodeVarying7 );
		nodeVar177 = textureSampleLevel( nodeUniform35, nodeUniform35_sampler, nodeVarying7, 0.0 );
		nodeVar178 = fwidth( nodeVar176.x );
	}`));
    expect(found.map((f) => f.text)).toEqual(['nodeVar176 = textureSample( nodeUniform35, nodeUniform35_sampler, nodeVarying7 );', 'nodeVar178 = fwidth( nodeVar176.x );']);
  });

  it('WGSL : branche sur un membre d’uniforme (object.x) : rien à signaler', () => {
    expect(derivativesInDivergentFlow(wgsl(`
	if ( ( object.nodeUniform37 > 0.5 ) ) {
		nodeVar1 = dpdx( nodeVarying7.x );
	}`))).toEqual([]);
  });
});
