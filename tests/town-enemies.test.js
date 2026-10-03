import { TARISLAND_DRAGON, DRAGON_APPEARANCE } from '../src/game/boss/TarislandDragon.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { TOWN_CHARACTERS, TOWN_TYPES } from '../src/game/data/townCharacters.js';
import { TownEnemy } from '../src/game/ai/TownEnemy.js';
import { EnemyAgent } from '../src/game/ai/EnemyAgent.js';
import { loadRig } from './helpers/load-rig.js';

for (const def of [...TOWN_CHARACTERS, DRAGON_APPEARANCE]) test(`${def.id}: real rig moves, attacks, takes damage and completes death`, async () => {
  const gltf = await loadRig(new URL(`../public/${def.url.slice(2)}`, import.meta.url));
  const type = def.id === 'tarislandDragon' ? TARISLAND_DRAGON : TOWN_TYPES[def.id];
  const enemy = new TownEnemy(gltf, def, type, { heightAt: () => 0 });
  enemy.place(0, 0, 0);
  let hits = 0, shots = 0;
  const game = {
    playerPosition: new Vector3(0, 0, 1), playerTarget: { position: new Vector3(0, 0, 1), alive: true },
    player: { receiveHit: () => { hits++; return 'hit'; } },
    director: { releaseToken: () => {}, requestToken: () => true, separation: () => ({ x: 0, z: 0 }) },
    onEnemyWindup: () => {}, onEnemyGlint: () => {}, onEnemyBroken: () => {},
    magic: { enemyShot: () => shots++ }, fx: { slam: () => {} }
  };
  const agent = new EnemyAgent(game, enemy, type, enemy.clips);
  if (def.id === 'queen') { const original = enemy.caster.volley.enqueue.bind(enemy.caster.volley); enemy.caster.volley.enqueue = spec => { shots++; original(spec); }; }
  const ctx = { player: game.playerPosition, director: game.director, playerDown: false };
  for (const spec of type.attacks) {
    const before = def.id === 'queen' ? shots : hits + shots;
    agent._startAttack(spec);
    for (let frame = 0; frame < 1800 && agent.attacking; frame++) {
      agent.update(1 / 60, ctx); enemy.update(1 / 60);
    }
    assert.ok(!agent.attacking, 'attack must finish');
    assert.equal((def.id === 'queen' ? shots : hits + shots) - before, spec.hits.length, 'one contact or projectile per authored strike');
  }
  if (def.id === 'tarislandDragon') {
    assert.equal(gltf.animations.length, 27, 'all authored dragon clips retained');
    for (const clip of enemy.clips.values()) {
      assert.ok(clip.duration > 0 && clip.duration < 40, 'absolute timeline rebased');
      const track = clip.tracks.find(t => t.name === 'Bip001_03.position');
      if (track) for (let i = 3; i < track.values.length; i += 3) {
        assert.equal(track.values[i], track.values[0], 'horizontal root x fixed');
        assert.equal(track.values[i + 1], track.values[1], 'horizontal root y fixed');
      }
    }
  }
  if (def.id === 'dragon') {
    const pelvis = enemy.clips.get('attack0').tracks.find(t => t.name === 'Pelvis.position');
    for (let i = 3; i < pelvis.values.length; i += 3) {
      assert.equal(pelvis.values[i], pelvis.values[0]);
      assert.equal(pelvis.values[i + 1], pelvis.values[1]);
    }
    assert.ok(pelvis.values.some((v, i) => i % 3 === 2 && Math.abs(v - pelvis.values[2]) > 1), 'keep crouching height');
  }
  const idle = enemy.clips.get('idle'), walk = enemy.clips.get('walk');
  assert.ok(idle.duration > 0 && walk.duration > 0);
  assert.ok(walk.tracks.some(t => t.values.some((v, i) => Math.abs(v - t.values[i % t.getValueSize()]) > 0.001)), 'locomotion has changing bone transforms');
  if (def.id === 'samurai') {
    const move = enemy.clips.get('attack0');
    const original = gltf.animations[0];
    const handName = 'CATRigLArmPalm_025.quaternion';
    const actual = move.tracks.find(t => t.name === handName).createInterpolant().evaluate(move.duration * 0.26);
    const expected = original.tracks.find(t => t.name === handName).createInterpolant().evaluate(6.1);
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(actual[i] - expected[i]) < 0.002, 'authored blade glimpse retained');
    agent.state = 'engage'; agent.cooldown = 999; enemy.place(0, 3.5, 0);
    const before = enemy.position.clone();
    agent.update(0.1, ctx); assert.ok(enemy.position.distanceTo(before) < 0.001, 'no walking between steps');
    agent._startAttack(type.attacks[0]);
    for (let frame = 0; frame < 600 && !enemy.ronin.shifted; frame++) { agent.update(1/60, ctx); enemy.update(1/60); }
    assert.ok(enemy.ronin.shifted, 'shukuchi occurs after the glimpse');
    assert.ok(enemy.position.z < game.playerPosition.z, 'arrives behind a forward-facing player');
    agent.state = 'hurt'; const interrupted = enemy.position.clone();
    agent.update(0.01, ctx); assert.ok(enemy.position.distanceTo(interrupted) < 0.001, 'interruption stops stepping');
    agent.state = 'idle';
    game.stage = { collide: pos => { pos.z = Math.max(0, pos.z); } };
    enemy.place(0, 1, 0); enemy.ronin.step(new Vector3(0, 0, -3));
    assert.ok(enemy.position.z >= 0, 'shukuchi respects a blocking wall');
    delete game.stage;
  }
  if (['queen', 'mage'].includes(def.id)) {
    for (const track of walk.tracks.filter(t => /Thigh|Calf|Foot|Toe|thigh|calf|foot|ball/.test(t.name))) {
      assert.ok(track.values.every((v, i) => Math.abs(v - track.values[i % track.getValueSize()]) < 0.00001), 'floating legs do not walk');
    }
    enemy.update(0.1);
    assert.ok(enemy.model.position.y - enemy.baseModelY > 0.3, 'body hovers above collision ground');
    if (def.id === 'queen') assert.equal(enemy.caster.swords.length, 6);
    else {
      assert.equal(shots, 3, 'three bolts before the laser');
      const caster = enemy.caster, hand = enemy.bones.get('CC_Base_R_Hand_085');
      assert.ok(hand, 'actual right hand exists');
      assert.ok(caster.handPosition().distanceTo(hand.getWorldPosition(new Vector3())) < 0.00001);
      caster.aim.copy(game.playerPosition).y += 1.1; caster.hasAim = true;
      const before = hits;
      caster.fire(type.attacks[0]); assert.equal(hits, before + 1, 'beam hits its aimed target');
      game.playerPosition.x += 3;
      caster.fire(type.attacks[0]); assert.equal(hits, before + 1, 'sidestep escapes locked beam');
      agent.state = 'hurt'; enemy.update(0.3);
      assert.equal(caster.orb.visible, false, 'interruption cancels charge');
      assert.equal(caster.beam.visible, false, 'beam expires');
      assert.equal(caster.ringPivot.visible, false, 'interruption hides ring');
      agent._startAttack(type.attacks[0]);
      for (let frame = 0; frame < 300 && agent.move.phase < 0.6; frame++) { agent.update(1/60, ctx); enemy.update(1/60); }
      assert.equal(caster.ringPivot.visible, true);
      assert.ok(caster.ring.scale.x >= 0.14 && caster.ring.scale.x <= 0.18, 'palm-sized ring');
      assert.ok(caster.ringPivot.getWorldPosition(new Vector3()).distanceTo(caster.palmPosition()) < 0.1, 'ring stays just ahead of right palm');
      agent.state = 'idle';
    }
  }
  const result = agent.takeHit({ damage: 5, posture: 2, dirX: 0, dirZ: 1, source: 'magic' });
  assert.equal(result.damage, 5);
  assert.equal(agent.hp, type.hp - 5);
  enemy.die();
  assert.equal(enemy.alive, false);
  for (let frame = 0; frame < 2400 && !enemy.finished; frame++) enemy.update(1 / 60);
  assert.ok(enemy.finished);
  enemy.dispose();
});
