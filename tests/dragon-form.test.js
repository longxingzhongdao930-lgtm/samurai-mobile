import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationMixer, Vector3 } from 'three';
import { DragonForm, prepareDragonClips } from '../src/game/combat/DragonForm.js';
import { loadRig } from './helpers/load-rig.js';

async function fixture() {
  const gltf = await loadRig(new URL('../public/models/dragonkin.glb', import.meta.url));
  const game = { app: { character: { position: new Vector3(), facing: 0 }, controller: { speed: 5 } }, player: {}, enemies: { findTarget: () => null } };
  const form = new DragonForm(game);
  form.group.add(gltf.scene);
  form.mixer = new AnimationMixer(gltf.scene);
  form.actions = Object.fromEntries(prepareDragonClips(gltf.animations).map(clip => [clip.name.replace('Mon_BlackDragon31_', ''), form.mixer.clipAction(clip)]));
  form.active = true;
  return { form, model: gltf.scene, gltf };
}

test('actual transformation rig faces movement and keeps pelvis travel in place', async () => {
  const { form, model, gltf } = await fixture();
  const originals = gltf.animations.map(clip => Array.from(clip.tracks.find(t => t.name === 'Pelvis_02.position').values));
  for (const action of Object.values(form.actions)) {
    const track = action.getClip().tracks.find(t => t.name === 'Pelvis_02.position');
    for (let i = 3; i < track.values.length; i += 3) {
      assert.equal(track.values[i], track.values[0]);
      assert.equal(track.values[i + 1], track.values[1]);
    }
  }
  assert.deepEqual(gltf.animations.map(clip => Array.from(clip.tracks.find(t => t.name === 'Pelvis_02.position').values)), originals);
  for (const facing of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    form.character.facing = facing;
    form.update(0.3);
    const forward = model.getObjectByName('head_05').getWorldPosition(new Vector3()).sub(model.getObjectByName('Pelvis_02').getWorldPosition(new Vector3()));
    assert.ok(forward.dot(new Vector3(Math.sin(facing), 0, Math.cos(facing))) > 0, 'head must lean in the movement direction');
  }
});

test('rapid attack/skill transitions release the entire real skeleton to running', async () => {
  const { form, model } = await fixture();
  const fresh = await fixture();
  form._loop('Btl_Std01', 0);
  for (const clip of ['Btl_Atk01', 'Btl_Atk02', 'Btl_Skl01', 'Btl_Atk03', 'Btl_Atk04', 'Btl_Skl02', 'Btl_Skl03']) {
    form._oneShot({ clip, speed: 1.35, reach: 4 });
    form.update(0.06);
  }
  form.attack = null;
  form._loop('Btl_Run01');
  fresh.form._loop('Btl_Run01');
  for (let i = 0; i < 30; i++) { form.update(1 / 60); fresh.form.update(1 / 60); }
  for (const name of ['Pelvis_02', 'head_05', 'Wing_L02_029', 'Wing_R02_031', 'Foot_L_034', 'Foot_R_038']) {
    const a = model.getObjectByName(name), b = fresh.model.getObjectByName(name);
    assert.ok(a.position.distanceTo(b.position) < 1e-5, name);
    assert.ok(a.quaternion.clone().normalize().angleTo(b.quaternion.clone().normalize()) < 1e-5, name);
  }
  for (const [name, action] of Object.entries(form.actions)) {
    if (name !== 'Btl_Run01') assert.ok(!action.isRunning(), name);
  }
});

test('all four attacks and three skills hit once and release movement', async () => {
  const { form } = await fixture();
  form.game.player._hold = () => 'held';
  const pending = new Set();
  const input = { pending: name => pending.has(name), consume: name => pending.delete(name) };
  let hits = 0;
  form._strike = () => hits++;
  for (const [button, clip] of [
    ...[1, 2, 3, 4].map(i => ['attack', `Btl_Atk0${i}`]),
    ...[1, 2, 3].map(i => ['special', `Btl_Skl0${i}`])
  ]) {
    form.time = 16;
    form._skillCd = 0;
    pending.add(button);
    form._press(input);
    assert.equal(form.attack?.spec.clip, clip);
    const before = hits;
    for (let i = 0; i < 600 && form.attack; i++) {
      form.control(1 / 60, input);
      form.update(1 / 60);
    }
    assert.equal(form.attack, null, clip);
    assert.equal(hits - before, 1, clip);
    assert.equal(form._current, 'Btl_Run01');
  }
});
