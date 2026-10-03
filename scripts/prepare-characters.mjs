/** Offline import: MODEL_TOOLS=/path/to/node_modules node scripts/prepare-characters.mjs sources.json
 * Tool dependencies: @gltf-transform/core@4.5.1, @gltf-transform/functions@4.5.1,
 * and their Sharp dependency. Source map: { id: '/absolute/path/to/file.glb|gltf' }.
 */
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { CREATURES, CAMP_CHARACTERS } from '../src/config/creatures.js';
const toolRoot = process.env.MODEL_TOOLS;
if (!toolRoot) throw new Error('Set MODEL_TOOLS to the offline tool node_modules directory.');
const { NodeIO } = await import(pathToFileURL(resolve(toolRoot, '@gltf-transform/core/dist/index.js')));
const { ALL_EXTENSIONS } = await import(pathToFileURL(resolve(toolRoot, '@gltf-transform/extensions/dist/index.js')));
const { prune, dedup, resample, textureCompress } = await import(pathToFileURL(resolve(toolRoot, '@gltf-transform/functions/dist/index.js')));
const requireTool = createRequire(resolve(toolRoot, '../package.json'));
const sharp = requireTool('sharp');
const sources = JSON.parse(await readFile(process.argv[2], 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const results = [];
for (const definition of [...CREATURES, ...CAMP_CHARACTERS]) {
  if (!sources[definition.id]) continue;
  const document = await io.read(sources[definition.id]);
  const root = document.getRoot();
  const originalClips = root.listAnimations().length;
  if (definition.id === 'samurai') {
    // The supplied presentation floor should not cover the game's terrain.
    for (const node of root.listNodes()) {
      if (!node.getSkin() && node.getName().startsWith('Floor_Floor_')) node.setMesh(null);
    }
  }
  // Achates ships 122 clips, including long raid phases and multi-part mechanics.
  // Keep the complete selected sequences for this small stage. Originals stay
  // in the supplied ZIP, not in the runtime download.
  if (definition.id === 'achates') {
    const keep = new Set(Object.values(definition.clips).flat(Infinity));
    for (const animation of root.listAnimations()) {
      if (!keep.has(animation.getName())) {
        for (const channel of animation.listChannels()) channel.dispose();
        for (const sampler of animation.listSamplers()) sampler.dispose();
        animation.dispose();
      }
    }
  }
  for (const animation of root.listAnimations()) {
    const samplers = animation.listSamplers();
    const start = Math.min(...samplers.map(s => s.getInput().getMin([Infinity])[0]));
    const shifted = new Map();
    for (const sampler of samplers) {
      const input = sampler.getInput();
      if (!shifted.has(input)) {
        shifted.set(input, input.clone().setArray(Float32Array.from(input.getArray(), t => t - start)));
      }
      sampler.setInput(shifted.get(input));
    }
  }
  await document.transform(
    resample({ tolerance: 0.00001 }),
    dedup(),
    textureCompress({ encoder: sharp, resize: [1024, 1024], targetFormat: 'webp', quality: 85 }),
    prune({ keepLeaves: true })
  );
  const target = resolve('public', definition.url.replace('./', ''));
  await mkdir(resolve(target, '..'), { recursive: true });
  await io.write(target, document);
  const result = { id: definition.id, originalClips, clips: root.listAnimations().map(a => a.getName()), bytes: (await stat(target)).size };
  results.push(result);
  console.log(JSON.stringify(result));
}
if (process.env.MODEL_IMPORT_REPORT) await writeFile(process.env.MODEL_IMPORT_REPORT, JSON.stringify(results, null, 2));
