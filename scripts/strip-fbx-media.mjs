#!/usr/bin/env node
/**
 * Replace the images embedded in a binary FBX with a 1×1 PNG.
 *
 * The character's materials come from `models/textures.glb` (see
 * `loaders/MaterialLibrary.js`), so the ~20 MB of textures Blender embedded in
 * `tpose.fbx` are downloaded, decoded and thrown away. This rewrites the file
 * with every `Video > Content` blob swapped for a tiny placeholder — the node
 * tree, names and connections are untouched, so the loader sees the same
 * scene. Offsets are recomputed on the way out.
 *
 *   node scripts/strip-fbx-media.mjs in.fbx out.fbx
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: strip-fbx-media.mjs in.fbx out.fbx');
  process.exit(1);
}

// A valid 1×1 transparent PNG.
const PLACEHOLDER = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex'
);

const src = readFileSync(input);
if (src.toString('latin1', 0, 18) !== 'Kaydara FBX Binary') throw new Error('not a binary FBX');
const version = src.readUInt32LE(23);
const wide = version >= 7500;
const HEADER = 27;
const NULL_LEN = wide ? 25 : 13;

function readU(offset) {
  return wide ? Number(src.readBigUInt64LE(offset)) : src.readUInt32LE(offset);
}

/** Parse one node record at `offset`. Returns null for the null record. */
function parseNode(offset) {
  const end = readU(offset);
  const count = readU(offset + (wide ? 8 : 4));
  const listLen = readU(offset + (wide ? 16 : 8));
  const nameLen = src.readUInt8(offset + (wide ? 24 : 12));
  if (end === 0) return { node: null, next: offset + NULL_LEN };
  const nameStart = offset + (wide ? 25 : 13);
  const name = src.toString('latin1', nameStart, nameStart + nameLen);
  const propStart = nameStart + nameLen;
  const props = src.subarray(propStart, propStart + listLen);
  const children = [];
  let cursor = propStart + listLen;
  while (cursor < end) {
    const { node, next } = parseNode(cursor);
    cursor = next;
    if (!node) break;
    children.push(node);
  }
  return { node: { name, count, props, children }, next: end };
}

const nodes = [];
let cursor = HEADER;
let footerStart = 0;
while (cursor < src.length) {
  const { node, next } = parseNode(cursor);
  if (!node) {
    footerStart = next;
    break;
  }
  nodes.push(node);
  cursor = next;
}
const footer = src.subarray(footerStart);

let replaced = 0;
let saved = 0;
function strip(node, parent) {
  if (node.name === 'Content' && parent?.name === 'Video' && node.props[0] === 0x52 /* 'R' */) {
    const old = node.props.readUInt32LE(1);
    const props = Buffer.alloc(5 + PLACEHOLDER.length);
    props[0] = 0x52;
    props.writeUInt32LE(PLACEHOLDER.length, 1);
    PLACEHOLDER.copy(props, 5);
    node.props = props;
    replaced++;
    saved += old - PLACEHOLDER.length;
  }
  for (const child of node.children) strip(child, node);
}
for (const node of nodes) strip(node, null);

/* ---- write ---- */
const chunks = [];
let position = 0;
function push(buffer) {
  chunks.push(buffer);
  position += buffer.length;
}
function u(value) {
  const b = Buffer.alloc(wide ? 8 : 4);
  if (wide) b.writeBigUInt64LE(BigInt(value));
  else b.writeUInt32LE(value);
  return b;
}
function size(node) {
  let n = (wide ? 25 : 13) + node.name.length + node.props.length;
  if (node.children.length) {
    for (const child of node.children) n += size(child);
    n += NULL_LEN;
  }
  return n;
}
function write(node) {
  const end = position + size(node);
  push(u(end));
  push(u(node.count));
  push(u(node.props.length));
  push(Buffer.from([node.name.length]));
  push(Buffer.from(node.name, 'latin1'));
  push(node.props);
  if (node.children.length) {
    for (const child of node.children) write(child);
    push(Buffer.alloc(NULL_LEN));
  }
}
push(src.subarray(0, HEADER));
for (const node of nodes) write(node);
push(Buffer.alloc(NULL_LEN));
push(footer);
writeFileSync(output, Buffer.concat(chunks));
console.log(`${replaced} images replaced, ${(saved / 1048576).toFixed(1)} MB saved → ${output}`);
