/**
 * Serve a built copy (`npm run build`) and the PvP socket on one port.
 *
 *   npm run build && npm run server        # http://<this PC>:8787
 *
 * For development `npm run dev -- --host` already carries the socket (see the
 * plugin in vite.config.js); this is for playing without Vite.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { attachPvp } from './attach.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT || 8787);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.fbx': 'application/octet-stream', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream',
  '.woff2': 'font/woff2', '.map': 'application/json'
};

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end('Not found — run `npm run build` first.');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

attachPvp(server);
server.listen(port, '0.0.0.0', () => {
  console.log(`[samurai] game + PvP on http://0.0.0.0:${port}  (socket at /pvp)`);
});
