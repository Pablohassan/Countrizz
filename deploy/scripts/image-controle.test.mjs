import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateformes } from './image-controle.mjs';

test('image seule (une plateforme) : forme réelle de mecapilot-front:1.10', () => {
  assert.deepEqual(plateformes({ created: '2026-07-16T13:35:30Z', architecture: 'arm64', os: 'linux', config: {} }), ['linux/arm64']);
});

test('index (image + attestation de buildx) : la plateforme de chaque image', () => {
  assert.deepEqual(plateformes({ 'linux/arm64': { architecture: 'arm64', os: 'linux' } }), ['linux/arm64']);
  assert.deepEqual(plateformes({ 'linux/amd64': { architecture: 'amd64', os: 'linux' } }), ['linux/amd64']);
});

test('rien d exploitable : aucune plateforme (le contrôle échouera)', () => {
  assert.deepEqual(plateformes({}), []);
  assert.deepEqual(plateformes(null), []);
});
