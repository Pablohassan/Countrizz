import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vhostCountrizz } from './vhost.mjs';

// Copie exacte du vhost en place sur .60 (md5 70433c3d19c80ded0a52d10363158c3f, lu le 08/10/2026).
const ACTUEL = readFileSync(new URL('./fixtures/countrizz.fr.conf', import.meta.url), 'utf8');
const NOUVEAU = vhostCountrizz(ACTUEL);
const serveurHttps = (t) => t.slice(t.indexOf('listen 443'));

test('le bloc HTTPS ne force plus aucun cache : le Cache-Control du pod passe tel quel (option c)', () => {
  const https = serveurHttps(NOUVEAU);
  assert.doesNotMatch(https, /^\s*add_header/m); // directives seulement (un commentaire du gabarit cite le mot)
  assert.doesNotMatch(https, /expires\s+(7d|30d|365d)/);
  assert.doesNotMatch(https, /location ~\*/);
});

test('proxy_max_temp_file_size 0 dans le seul location / du bloc HTTPS', () => {
  const https = serveurHttps(NOUVEAU);
  assert.equal((NOUVEAU.match(/proxy_max_temp_file_size 0;/g) ?? []).length, 1);
  assert.match(https, /location \/ \{\n\s*proxy_pass http:\/\/192\.168\.1\.101;\n\s*include snippets\/proxy-params\.conf;\n\s*proxy_max_temp_file_size 0;/);
});

test('tout le reste est conservé à l octet près', () => {
  const avantHttps = (t) => t.slice(0, t.indexOf('listen 443'));
  assert.equal(avantHttps(NOUVEAU), avantHttps(ACTUEL)); // en-tête et redirection HTTP (acme compris)
  for (const ligne of [
    'ssl_certificate /etc/letsencrypt/live/countrizz.fr/fullchain.pem;',
    'include snippets/security-headers.conf;', 'include snippets/block-malicious.conf;', 'client_max_body_size 10M;',
    'proxy_pass http://192.168.1.102/api/;', 'location = /sw.js {', 'location = /registerSW.js {',
    'location = /manifest.webmanifest {', 'expires -1;',
  ]) assert.ok(NOUVEAU.includes(ligne), `perdu : ${ligne}`);
  assert.equal((NOUVEAU.match(/expires -1;/g) ?? []).length, 3);
});

test('idempotent : appliqué deux fois, même résultat', () => {
  assert.equal(vhostCountrizz(NOUVEAU), NOUVEAU);
});

test('un vhost inattendu est refusé plutôt que modifié à l aveugle', () => {
  assert.throws(() => vhostCountrizz(ACTUEL.replace('listen 443 ssl http2;', 'listen 8443 ssl;')));
  assert.throws(() => vhostCountrizz(ACTUEL.replace(/    location \/ \{\n        proxy_pass http:\/\/192\.168\.1\.101;/, '    location / {\n        proxy_pass http://192.168.1.99;')));
});
