import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { effectiveTier, formatName, isUncompressed, maxDegradation, measureLines, nextDegradation } from './fallback';

describe('repli en cours de partie (spec zoom §5 bis)', () => {
  it('6 fenêtres au plancher et lentes : qualité standard', () => {
    expect(nextDegradation('aucune', 5)).toBe('aucune');
    expect(nextDegradation('aucune', 6)).toBe('standard');
  });
  it('jamais de retour en arrière', () => {
    expect(nextDegradation('standard', 0)).toBe('standard');
    expect(maxDegradation('standard', 'aucune')).toBe('standard');
    expect(maxDegradation('aucune', 'standard')).toBe('standard');
  });
  it('niveau effectif : standard reste standard ; haute descend avec le repli (une recréation du renderer garde le repli)', () => {
    expect(effectiveTier('standard', 'aucune')).toBe('standard');
    expect(effectiveTier('haute', 'aucune')).toBe('haute');
    expect(effectiveTier('haute', 'standard')).toBe('standard');
  });
  it('format transcodé : RGBA non compressé reconnu, noms lisibles', () => {
    const t = new THREE.Texture();
    t.format = THREE.RGBAFormat;
    expect(isUncompressed(t)).toBe(true);
    t.format = THREE.RGBA_ETC2_EAC_Format;
    expect(isUncompressed(t)).toBe(false);
    expect(formatName(THREE.RGBA_ETC2_EAC_Format)).toBe('ETC2 RGBA');
    expect(formatName(THREE.RGBA_ASTC_4x4_Format)).toBe('ASTC 4×4');
    expect(formatName(THREE.RGBA_BPTC_Format)).toBe('BC7');
    expect(formatName(THREE.RGBAFormat)).toBe('RGBA (non compressé)');
  });
  it('encart : une ligne par mesure, en français', () => {
    expect(measureLines({ backend: 'webgpu', tier: 'haute', degradation: 'standard', maxTexture2D: 16384, format: THREE.RGBA_ETC2_EAC_Format, dpr: 1.25, medianMs: 18.34, events: [{ step: 'standard', atS: 42.4, reason: 'lenteur' }] }))
      .toEqual(['Moteur : WebGPU', 'Qualité : standard (repli)', 'Textures max : 16384', 'Format : ETC2 RGBA', 'Densité : 1,25', 'Image : 18,3 ms (médiane)', 'Replis : standard à 42 s (lenteur)']);
  });
});
