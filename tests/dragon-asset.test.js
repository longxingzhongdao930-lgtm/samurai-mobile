import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DRAGON_CLIPS } from '../src/animation/CreatureMotion.js';

const buffer = readFileSync(new URL('../public/models/dragon/silver-dragon.glb', import.meta.url));
const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());

test('GLB retains the supplied 37 clips and all required gameplay actions', () => {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  assert.equal(gltf.animations.length, 37);
  const names = new Set(gltf.animations.map(a => a.name));
  for (const name of Object.values(DRAGON_CLIPS).flat()) assert.ok(names.has(name), name);
  assert.equal(gltf.skins[0].joints.length, 58);
});

test('clips start at zero and end at their own duration rather than the source timeline', () => {
  for (const animation of gltf.animations) {
    const inputs = animation.samplers.map(s => gltf.accessors[s.input]);
    assert.equal(Math.min(...inputs.map(a => a.min[0])), 0, animation.name);
    assert.ok(Math.max(...inputs.map(a => a.max[0])) < 21, animation.name);
  }
  const walk = gltf.animations.find(a => a.name === DRAGON_CLIPS.walk);
  assert.ok(walk);
  assert.equal(Math.max(...walk.samplers.map(s => gltf.accessors[s.input].max[0])), 2);
});

test('both dragon materials have embedded diffuse and normal textures', () => {
  assert.equal(gltf.materials.length, 2);
  for (const m of gltf.materials) {
    assert.ok(m.pbrMetallicRoughness.baseColorTexture);
    assert.ok(m.normalTexture);
  }
  for (const image of gltf.images) {
    assert.equal(image.uri, undefined);
    assert.equal(typeof image.bufferView, 'number');
  }
});
