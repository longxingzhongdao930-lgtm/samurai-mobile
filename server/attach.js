/**
 * Put the PvP server on an existing HTTP server, at `/pvp`.
 *
 * Used twice: by the Vite plugin in `vite.config.js`, so `npm run dev --
 * --host` serves the game *and* the PvP socket from one port (the phone only
 * needs one address), and by `server/index.js` for a built copy.
 */
import { WebSocketServer } from 'ws';

import { PvpServer } from './room.js';
import { fileStats } from './stats.js';

export function attachPvp(httpServer, { statsFile } = {}) {
  const pvp = new PvpServer({ stats: fileStats(statsFile) });
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const path = (request.url || '').split('?')[0];
    if (path !== '/pvp') return; // Vite's own HMR socket lives on the same server
    wss.handleUpgrade(request, socket, head, (ws) => {
      const conn = pvp.connect(
        (msg) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
        },
        () => ws.close()
      );
      ws.on('message', (data) => conn.message(String(data)));
      ws.on('close', () => conn.closed());
      ws.on('error', () => conn.closed());
    });
  });

  const timer = setInterval(() => pvp.tick(), 100);
  httpServer.on('close', () => clearInterval(timer));
  return pvp;
}
