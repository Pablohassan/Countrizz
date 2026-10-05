// Petit serveur statique local (lecture seule) pour les prototypes de l'avion : /files/ → contenu du compagnon, /h/ → bancs d'essai.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOTS = {
  '/files/': '/Users/rusmirsadikovic/projetsperso/countriz/countrizz/.superpowers/brainstorm/85431-1791060294/content',
  '/h/': '/private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad/avion/h',
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const prefix = Object.keys(ROOTS).find((p) => url.startsWith(p));
  if (!prefix) { res.writeHead(404); return res.end('404'); }
  const rel = normalize(url.slice(prefix.length));
  if (rel.startsWith('..')) { res.writeHead(403); return res.end('403'); }
  try {
    const body = await readFile(join(ROOTS[prefix], rel));
    res.writeHead(200, { 'Content-Type': MIME[extname(rel).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
}).listen(5199, '127.0.0.1', () => console.log('serveur prêt : http://localhost:5199/files/ et /h/'));
