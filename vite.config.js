import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
const buildRevision=process.env.CF_PAGES_COMMIT_SHA?.slice(0,7)||(()=>{try{return execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim();}catch{return 'local';}})();

export default defineConfig({
  base: './',
  define:{__BUILD_REVISION__:JSON.stringify(buildRevision)},
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    target: 'es2022',
    rollupOptions: { input: { game: 'index.html', characters: 'characters.html', motions:'motions.html' } },
    sourcemap: true,
    chunkSizeWarningLimit: 2000
  },
  // Large binary assets (FBX / HDR) live in /public and are served untouched.
  assetsInclude: ['**/*.fbx', '**/*.hdr']
});
