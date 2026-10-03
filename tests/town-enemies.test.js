import { GWYN, GWYN_APPEARANCE } from '../src/game/boss/Gwyn.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { TOWN_CHARACTERS, TOWN_TYPES } from '../src/game/data/townCharacters.js';
import { TownEnemy } from '../src/game/ai/TownEnemy.js';
import { EnemyAgent } from '../src/game/ai/EnemyAgent.js';
import { loadRig } from './helpers/load-rig.js';

for (const def of [...TOWN_CHARACTERS, GWYN_APPEARANCE]) test(`${def.id}: real rig moves, attacks, takes damage and completes death`, async () => {
  const gltf = await loadRig(new URL(`../public/${def.url.slice(2)}`, import.meta.url));
  const type = def.id === 'gwyn' ? GWYN : TOWN_TYPES[def.id];
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
  const ctx = { player: game.playerPosition, director: game.director, playerDown: false };
  for (const spec of type.attacks) {
    const before = hits + shots;
    agent._startAttack(spec);
    for (let frame = 0; frame < 1800 && agent.attacking; frame++) {
      agent.update(1 / 60, ctx); enemy.update(1 / 60);
    }
    assert.ok(!agent.attacking, 'attack must finish');
    assert.equal(hits + shots - before, spec.hits.length, 'one contact or projectile per authored strike');
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
  const result = agent.takeHit({ damage: 5, posture: 2, dirX: 0, dirZ: 1, source: 'magic' });
  assert.equal(result.damage, 5);
  assert.equal(agent.hp, type.hp - 5);
  enemy.die();
  assert.equal(enemy.alive, false);
  for (let frame = 0; frame < 2400 && !enemy.finished; frame++) enemy.update(1 / 60);
  assert.ok(enemy.finished);
  enemy.dispose();
});
