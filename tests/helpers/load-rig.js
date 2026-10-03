import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Keep the actual geometry, skins and animations; skip image decoding for
// CPU-only animation tests. Rendering/textures are checked in the browser.
export async function loadRig(url) {
  const file = readFileSync(url);
  const length = file.readUInt32LE(12);
  const gltf = JSON.parse(file.subarray(20, 20 + length).toString());
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  delete gltf.images;
  delete gltf.textures;
  delete gltf.materials;
  delete gltf.extensionsUsed;
  delete gltf.extensionsRequired;
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = (json.length + 3) & ~3;
  const binaryChunk = file.subarray(20 + length);
  const packed = Buffer.alloc(20 + padded + binaryChunk.length, 0x20);
  packed.writeUInt32LE(0x46546c67, 0);
  packed.writeUInt32LE(2, 4);
  packed.writeUInt32LE(packed.length, 8);
  packed.writeUInt32LE(padded, 12);
  packed.writeUInt32LE(0x4e4f534a, 16);
  json.copy(packed, 20);
  binaryChunk.copy(packed, 20 + padded);
  return new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength), '');
}
