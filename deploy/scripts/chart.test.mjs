// Contrôle du rendu du chart countrizz, sur le modèle de politika/tests/helmAffinity.test.ts (dette 5 du cluster) :
// un `NotIn` sur un nœud inexistant ne produit ni erreur, ni avertissement, ni événement — il passe et n'exclut rien.
// Lecture du texte de `helm template`, sans dépendance de parsing (un test d'infrastructure tourne sans paquet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Nœuds réels du cluster (kubectl get nodes, 07/10/2026). Un renommage de nœud DOIT passer par cette liste.
const NOEUDS_REELS = new Set([
  'raspberrypi0', 'raspberrypi1', 'raspberrypi2', 'raspberrypi3', 'raspberrypi4',
  'raspberrypi5', 'raspberrypi7', 'raspberrypi8', 'rpi6-4b',
]);
const CHART = fileURLToPath(new URL('../helm/countrizz', import.meta.url));
const rendre = (...args) => execFileSync('helm', ['template', 'countrizz', CHART, '--namespace', 'countrizz', ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const rendu = rendre('--set', 'image.tag=controle');
const documents = rendu.split(/^---$/m).filter((d) => /^kind:/m.test(d));

/** Hostnames d'un `NotIn` sur kubernetes.io/hostname, en ligne `[a, b]` ou en liste YAML (même lecture que Politika). */
function nomsExclus(texte) {
  const noms = [];
  const re = /key:\s*kubernetes\.io\/hostname\s*\n\s*operator:\s*NotIn\s*\n\s*values:\s*(\[[^\]]*\]|(?:\n\s*-\s*[^\n]+)+)/g;
  for (const m of texte.matchAll(re)) {
    const bloc = m[1];
    const bruts = bloc.startsWith('[') ? bloc.slice(1, -1).split(',') : bloc.split('\n').map((l) => l.replace(/^\s*-\s*/, ''));
    for (const b of bruts) { const n = b.trim().replace(/^["']|["']$/g, ''); if (n) noms.push(n); }
  }
  return noms;
}

test('aucun nœud fantôme dans un NotIn', () => {
  const fantomes = [...new Set(nomsExclus(rendu))].filter((n) => !NOEUDS_REELS.has(n));
  assert.deepEqual(fantomes, [], `NotIn pointant un nœud inexistant : ${fantomes.join(', ')}`);
});

test('raspberrypi0 (4 Go, instable) et rpi6-4b (proxy de secours) sont exclus', () => {
  const exclus = nomsExclus(rendu);
  assert.ok(exclus.includes('raspberrypi0'), 'raspberrypi0 non exclu');
  assert.ok(exclus.includes('rpi6-4b'), 'rpi6-4b non exclu');
});

test('le chart ne crée pas son namespace (comme toutes les releases du parc)', () => {
  assert.equal(documents.filter((d) => /^kind:\s*Namespace\s*$/m.test(d)).length, 0);
});

test('chaque ressource vit dans le namespace countrizz', () => {
  for (const d of documents) {
    const kind = d.match(/^kind:\s*(\S+)/m)[1];
    assert.match(d, /^\s*namespace:\s*countrizz\s*$/m, `${kind} sans namespace countrizz`);
  }
});

test('pod conforme à « restricted » sans racine en lecture seule (aucun front du parc ne la pose)', () => {
  assert.match(rendu, /runAsNonRoot: true/);
  assert.match(rendu, /type: RuntimeDefault/);
  assert.match(rendu, /allowPrivilegeEscalation: false/);
  assert.match(rendu, /drop: \[ALL\]|- ALL/);
  assert.doesNotMatch(rendu, /readOnlyRootFilesystem/);
});

test('le rendu échoue sans étiquette d image (tag immuable obligatoire)', () => {
  assert.throws(() => rendre());
});
