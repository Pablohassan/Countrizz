import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nomPatch, verifierPatchs } from './patchs.mjs';

function jeu() {
  const dossier = mkdtempSync(join(tmpdir(), 'patchs-'));
  const index = { sizes: [2048, 1024], countries: {} };
  for (const cca3 of ['FRA', 'JPN']) {
    index.countries[cca3] = { levels: [{ files: {} }, { files: {} }] };
    for (const [niveau, lvl] of index.countries[cca3].levels.entries()) for (const taille of index.sizes) {
      const octets = randomBytes(taille === 1024 ? 100 : 300);
      writeFileSync(join(dossier, nomPatch(cca3, niveau, taille)), octets);
      lvl.files[String(taille)] = { bytes: octets.length, sha256: createHash('sha256').update(octets).digest('hex') };
    }
  }
  return { dossier, index };
}

test('un jeu conforme passe', () => {
  const { dossier, index } = jeu();
  assert.deepEqual(verifierPatchs(dossier, index), { attendus: 8, erreurs: [] });
  rmSync(dossier, { recursive: true });
});

test('fichier altéré, manquant ou en trop : chaque défaut est signalé', () => {
  const { dossier, index } = jeu();
  appendFileSync(join(dossier, 'fra-0-2048.ktx2'), 'x');
  rmSync(join(dossier, 'jpn-1-1024.ktx2'));
  writeFileSync(join(dossier, 'zzz-0-2048.ktx2'), '');
  writeFileSync(join(dossier, 'fra-2048.ktx2'), ''); // ancien nom, sans niveau
  const { erreurs } = verifierPatchs(dossier, index);
  assert.deepEqual(erreurs, ['fra-0-2048.ktx2 : 301 octets au lieu de 300', 'fra-0-2048.ktx2 : sha256 différent', 'jpn-1-1024.ktx2 : fichier manquant', 'fra-2048.ktx2 : fichier en trop', 'zzz-0-2048.ktx2 : fichier en trop']);
  rmSync(dossier, { recursive: true });
});

test('un pays sans fichier déclaré dans imagery.json est signalé', () => {
  const { dossier, index } = jeu();
  delete index.countries.JPN.levels[1].files['1024'];
  assert.ok(verifierPatchs(dossier, index).erreurs.includes('jpn-1-1024.ktx2 : absent de imagery.json'));
  rmSync(dossier, { recursive: true });
});
