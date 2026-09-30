import { defineConfig } from 'vite';

import { attachPvp } from './server/attach.js';

/**
 * The PvP socket (`/pvp`) on the same port as the game, so `npm run dev --
 * --host` is all two phones need: one address for both.
 */
const pvp = () => ({
  name: 'samurai-pvp',
  configureServer(server) {
    if (server.httpServer) attachPvp(server.httpServer);
  },
  configurePreviewServer(server) {
    if (server.httpServer) attachPvp(server.httpServer);
  }
});

export default defineConfig({
  base: './',
  plugins: [pvp()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000
  },
  // Large binary assets (FBX / HDR) live in /public and are served untouched.
  assetsInclude: ['**/*.fbx', '**/*.hdr']
});
