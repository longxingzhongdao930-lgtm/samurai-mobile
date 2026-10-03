import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREATURES, CAMP_CHARACTERS } from '../src/config/creatures.js';

for (const definition of [...CREATURES, ...CAMP_CHARACTERS]) {
  test(`${definition.label}: embedded model and mapped clips are deployable`, () => {
    const bytes = readFileSync(new URL(`../public/${definition.url.slice(2)}`, import.meta.url));
    assert.ok(bytes.length < 25 * 1024 * 1024, 'individual asset fits Cloudflare Pages limit');
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const animations = new Map(gltf.animations.map(a => [a.name, a]));
    const names = definition.clips ? Object.values(definition.clips).flat(Infinity) : [definition.clip];
    for (const name of names) {
      const animation = animations.get(name);
      assert.ok(animation, name);
      const inputs = animation.samplers.map(s => gltf.accessors[s.input]);
      assert.equal(Math.min(...inputs.map(a => a.min[0])), 0, `${name}: zero start`);
      assert.ok(Math.max(...inputs.map(a => a.max[0])) < 21, `${name}: trimmed duration`);
    }
    assert.ok(gltf.skins.length);
    for (const image of gltf.images) {
      assert.equal(image.uri, undefined, 'no external texture URL');
      assert.equal(typeof image.bufferView, 'number');
    }
  });
}
