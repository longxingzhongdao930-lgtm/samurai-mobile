// Rebuild the game's lightweight assets from the sources in `assets-src/`.
//
//   npm run dev -- --port 5173            (in another terminal)
//   npm run optimize:assets
//
// The sources (FBX rigs and motions, the PNG-heavy material library, the 2K
// HDR, maximum-quality JPEGs) stay in `assets-src/`, out of the deployed
// `public/`; what the game loads is written to `public/`:
//
//   models/samurai.glb     the rig (meshopt-compressed when gltfpack runs)
//   models/enemy.glb       the enemies' body and idle
//   models/materials.glb   the material library, textures as JPEG/WebP
//   models/weapons, attachements  the gear, the same way
//   animations/*.glb       the motions, joints and clips only
//   textures/**.jpg        re-encoded (and the moon's PNGs as JPEG)
//   hdri/spruit_sunrise_1k.hdr
//
// Conversion runs in a browser (three's own loaders and exporters, the
// browser's image encoders), driven by Playwright; PW may point at the
// package. gltfpack (`npx gltfpack`) compresses the geometry if it is there.
import { createRequire } from 'module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const BASE = process.env.URL || 'http://127.0.0.1:5173/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = '/assets-src/';
const out = (p) => path.join(ROOT, 'public', p);

const ANIMATIONS = [
  ['animations/Idle.fbx', 'animations/idle.glb'],
  ['animations/Walk.fbx', 'animations/walk.glb'],
  ['animations/Run.fbx', 'animations/run.glb'],
  ['animations/BigJump.fbx', 'animations/big-jump.glb'],
  ['animations/Jump.fbx', 'animations/jump.glb'],
  ['animations/Crouch.fbx', 'animations/crouch.glb'],
  ['animations/fight animations/Kick.fbx', 'animations/kick.glb'],
  ['animations/fight animations/Slash.fbx', 'animations/slash.glb'],
  ['animations/fight animations/Crouchslash.fbx', 'animations/crouch-slash.glb']
];
const IMAGES = [
  ...['color', 'normal', 'roughness', 'ao'].map((n) => [`textures/terrain/${n}.jpg`, `textures/terrain/${n}.jpg`]),
  ...['color', 'normal', 'roughness', 'ao'].map((n) => [`textures/stone/${n}.jpg`, `textures/stone/${n}.jpg`]),
  ...['Color', 'NormalGL', 'Roughness', 'Opacity'].map((n) => [`textures/leafs/LeafSet024_1K-JPG_${n}.jpg`, `textures/leafs/LeafSet024_1K-JPG_${n}.jpg`]),
  ...['basecolor', 'normal', 'roughness', 'ambientOcclusion', 'height'].map((n) => [`textures/moon/Moon_002_${n}.png`, `textures/moon/Moon_002_${n}.jpg`])
];

const write = (rel, base64) => {
  fs.mkdirSync(path.dirname(out(rel)), { recursive: true });
  fs.writeFileSync(out(rel), Buffer.from(base64, 'base64'));
  console.log(`${rel}  ${(fs.statSync(out(rel)).size / 1024).toFixed(0)} KB`);
};

/** Meshopt-compress a GLB in place, keeping names, materials and extras. */
const pack = (rel) => {
  const file = out(rel);
  const tmp = `${file}.packed.glb`;
  try {
    execFileSync('npx', ['--yes', 'gltfpack', '-i', file, '-o', tmp, '-cc', '-noq', '-kn', '-km', '-ke', '-kv'], { stdio: 'pipe' });
    fs.renameSync(tmp, file);
    console.log(`${rel}  packed → ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    console.warn(`${rel}  gltfpack skipped (${String(e.message).split('\n')[0]})`);
  }
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await page.goto(`${BASE}tools/assets/index.html`);
await page.waitForFunction(() => window.labReady, null, { timeout: 120000 });
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);

if (want('rig')) {
  write('models/samurai.glb', await page.evaluate((u) => lab.fbxToGLB(u), `${SRC}models/tpose.fbx`));
  pack('models/samurai.glb');
}
if (want('enemy')) {
  write('models/enemy.glb', await page.evaluate((u) => lab.fbxToGLB(u), `${SRC}models/enemyidle.fbx`));
  pack('models/enemy.glb');
}
if (want('anims')) {
  for (const [src, dst] of ANIMATIONS) {
    write(dst, await page.evaluate((u) => lab.fbxToGLB(u, { clipOnly: true }), SRC + src));
  }
}
if (want('gear')) {
  for (const rel of ['models/weapons/sword.glb', 'models/attachements/Scabbard.glb', 'models/attachements/Potion.glb']) {
    write(rel, await page.evaluate((u) => lab.recompressGLB(u, { maxSize: 1024 }), SRC + rel));
  }
}
if (want('materials')) {
  write('models/materials.glb', await page.evaluate((u) => lab.recompressGLB(u, { maxSize: 1024 }), `${SRC}models/textures.glb`));
}
if (want('images')) {
  for (const [src, dst] of IMAGES) {
    write(dst, await page.evaluate((u) => lab.recompressImage(u, { quality: 0.86 }), SRC + src));
  }
}
if (want('hdr')) {
  write('hdri/spruit_sunrise_1k.hdr', await page.evaluate((u) => lab.shrinkHDR(u, 2), `${SRC}hdri/spruit_sunrise.hdr`));
}
await browser.close();
