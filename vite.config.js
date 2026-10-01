import { defineConfig } from 'vite';

import { attachPvp } from './server/attach.js';
import { pwa } from './build/pwa.js';

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
  plugins: [
    pvp(),
    pwa({
      name: '侍 SAMURAI — 一ノ章',
      shortName: '侍',
      description: '鬼武将 羅刹を討つ、和風剣戟アクション。',
      themeColor: '#0b0808',
      backgroundColor: '#070505'
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // three on its own: the biggest piece, and the one that changes least,
        // so a game update does not make a returning player fetch it again.
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('node_modules/lil-gui')) return 'gui';
          return undefined;
        }
      }
    }
  },
  // Large binary assets (FBX / HDR) live in /public and are served untouched.
  assetsInclude: ['**/*.fbx', '**/*.hdr']
});
