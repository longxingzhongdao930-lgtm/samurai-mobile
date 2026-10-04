import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
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
