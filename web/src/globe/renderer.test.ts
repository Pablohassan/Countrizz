import { describe, expect, it } from 'vitest';
import { qualityTier } from './renderer';

describe('niveau de qualité (spec §4.1)', () => {
  it('haute : WebGPU sur bureau, textures 8K possibles', () => {
    expect(qualityTier({ backend: 'webgpu', coarsePointer: false, maxTexture2D: 8192 })).toBe('haute');
  });
  it('standard : mobile, WebGL 2, ou limite de texture sous 8192', () => {
    expect(qualityTier({ backend: 'webgpu', coarsePointer: true, maxTexture2D: 8192 })).toBe('standard');
    expect(qualityTier({ backend: 'webgl2', coarsePointer: false, maxTexture2D: 16384 })).toBe('standard');
    expect(qualityTier({ backend: 'webgpu', coarsePointer: false, maxTexture2D: 4096 })).toBe('standard');
  });
});
