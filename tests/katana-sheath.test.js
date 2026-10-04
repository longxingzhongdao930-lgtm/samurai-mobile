import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { loadRig } from './helpers/load-rig.js';
import { KatanaSheath } from '../src/game/hero/KatanaSheath.js';

test('real katana slides into the scabbard and restores the held blade on interruption', async () => {
  const { scene: source } = await loadRig(new URL('../public/models/weapons/sword.glb', import.meta.url));
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheath', t: 0 }, character: { position: new Vector3(), facing: 0, getBone: () => null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h);
  motion.update(); const start = motion.copy.position.clone();
  assert.equal(source.visible, false); assert.ok(motion.length > .5 && motion.length < 2);
  player.arts.t = .22; motion.update(); const aligned = motion.copy.position.clone();
  player.arts.t = .65; motion.update(); const inserted = motion.copy.position.clone();
  assert.ok(aligned.distanceTo(inserted) > .5, 'blade must visibly slide');
  assert.ok(start.distanceTo(aligned) > .1);
  player.arts.mode = 'sheathed'; motion.update();
  assert.ok(inserted.distanceTo(motion.copy.position) < 1e-6);
  const count = h.root.children.length;
  for (const mode of ['', 'charge', '', 'sheath', '']) { player.arts.mode = mode; motion.update(); }
  assert.equal(h.root.children.length, count, 'reuse the visual copy');
  assert.equal(source.visible, true); assert.equal(motion.copy.visible, false);
  assert.equal(source.parent, null, 'do not reparent the combat blade');
});

test('replacement blade is correctly sized, cover-free and fully enclosed after sheathing', async () => {
  const { scene: source } = await loadRig(new URL('../public/models/weapons/sword.glb', import.meta.url));
  let meshes = 0;
  source.traverse(node => { if (node.isMesh) { meshes++; assert.doesNotMatch(node.name, /cover/i); } });
  assert.equal(meshes, 4);
  const fireHull = new Mesh(new BoxGeometry(4, 4, 4), new MeshBasicMaterial());
  fireHull.userData.isFireVolume = true;
  source.add(fireHull);
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheathed', t: 1 }, character: { position: new Vector3(), facing: 0, getBone: () => null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  h.root.add(h.sheath);
  const motion = new KatanaSheath(h);
  motion.update(); h.root.updateMatrixWorld(true);
  assert.equal(fireHull.parent, source, 'the live fire effect stays intact');
  motion.copy.traverse(node => assert.equal(node.userData.isFireVolume, undefined));
  assert.ok(motion.length > .95 && motion.length < .99, 'guard-to-tip reach stays close to the old 0.966m blade');
  let bladeVertices = 0, handleVertices = 0;
  motion.copy.traverse(node => {
    const positions = node.geometry?.attributes.position;
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      const local = new Vector3().fromBufferAttribute(positions, i);
      assert.ok([local.x, local.y, local.z].every(Number.isFinite));
      if (local.z < -.05) { handleVertices++; continue; }
      if (local.z <= .02) continue;
      const inside = h.sheath.worldToLocal(local.clone().applyMatrix4(node.matrixWorld));
      assert.ok(Math.abs(inside.x) < .03 && Math.abs(inside.y) < .0325 && Math.abs(inside.z) < .41,
        'curved blade must fit inside the scabbard in the completed pose');
      bladeVertices++;
    }
  });
  assert.ok(bladeVertices > 100 && handleVertices > 100, 'both blade and visible hilt retained');
});
