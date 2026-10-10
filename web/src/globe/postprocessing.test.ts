import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { postOptions } from './postprocessing';

describe('post-traitement par niveau (spec §4.1)', () => {
  it('haute : bloom + TRAA, sans MSAA (TRAA l’exige)', () => {
    const o = postOptions('haute');
    expect([o.traa, o.msaa]).toEqual([true, 0]);
    expect(o.bloom.strength).toBeGreaterThan(0);
  });
  it('standard : effets allégés — bloom, MSAA 4× du pass, pas de TRAA', () => {
    const o = postOptions('standard');
    expect([o.traa, o.msaa]).toEqual([false, 4]);
    expect(o.bloom).toEqual(postOptions('haute').bloom);
  });
  it('sortie en tone mapping Neutral, bloom à 0,3 (planche du 10/10 : le jaune pays bouge à peine, AgX le délavait)', () => {
    for (const tier of ['haute', 'standard'] as const) {
      expect(postOptions(tier).toneMapping).toBe(THREE.NeutralToneMapping);
      expect(postOptions(tier).bloom.strength).toBe(0.3);
    }
  });
});
