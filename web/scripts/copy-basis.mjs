// Copie les transcodeurs basis de three (KTX2Loader) dans public/basis — non versionné, refait à chaque dev/build.
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(web, 'node_modules/three/examples/jsm/libs/basis');
const to = path.join(web, 'public/basis');
mkdirSync(to, { recursive: true });
for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) copyFileSync(path.join(from, f), path.join(to, f));
