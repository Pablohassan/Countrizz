import { describe, expect, it } from 'vitest';
import { qualityTier } from './renderer';

describe('niveau de qualité (spec zoom §5)', () => {
  it('haute : WebGPU avec des textures de 8192, téléphone compris', () => {
    expect(qualityTier({ backend: 'webgpu', maxTexture2D: 8192 })).toBe('haute');
    expect(qualityTier({ backend: 'webgpu', maxTexture2D: 16384 })).toBe('haute');
  });
  it('standard : le repli — WebGL 2, ou WebGPU limité sous 8192', () => {
    expect(qualityTier({ backend: 'webgl2', maxTexture2D: 16384 })).toBe('standard');
    expect(qualityTier({ backend: 'webgpu', maxTexture2D: 4096 })).toBe('standard');
  });
});
