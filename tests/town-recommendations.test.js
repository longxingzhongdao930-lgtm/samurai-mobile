import test from 'node:test';
import assert from 'node:assert/strict';
import { Blessings } from '../src/game/progression/Blessings.js';
import { lockFraming } from '../src/game/LockFraming.js';
import { beginEntrance, updateEntrance } from '../src/game/ai/EnemyEntrance.js';

test('shrine rewards stack across two shrines, survive checkpoint restore and cannot be farmed', () => {
  const b = new Blessings();
  assert.equal(b.choose('road', 'blade'), true);
  assert.equal(b.choose('road', 'dragon'), false);
  assert.equal(b.choose('sanctum', 'blade'), true);
  assert.equal(b.damageMultiplier, 1.3);
  const checkpoint = b.snapshot();
  b.restore(checkpoint);
  checkpoint[0][1] = 'dragon';
  assert.equal(b.damageMultiplier, 1.3);
  assert.equal(b.choose('other', 'blade'), false);
  b.restore();
  assert.equal(b.damageMultiplier, 1);
  b.choose('road', 'step'); b.choose('sanctum', 'dragon');
  assert.equal(b.dodgeBonus, 0.06);
  assert.equal(b.dragonBonus, 4);
});

test('large lock targets gain room without shifting the camera anchor too far; unlocking restores framing', () => {
  const p = { x: 0, y: 0, z: 0 };
  const target = { alive: true, height: 3.7, position: { x: 0, z: 8 } };
  const frame = lockFraming(p, target);
  assert.ok(frame.y > 0 && frame.distance > 2);
  assert.ok(frame.z <= 2);
  const close = lockFraming(p, { ...target, position: p });
  assert.ok(Object.values(close).every(Number.isFinite));
  assert.ok(lockFraming(p, target, 0.6).distance > frame.distance);
  assert.deepEqual(lockFraming(p, { ...target, alive: false }), { x: 0, y: 0, z: 0, distance: 0 });
});

test('elite entrances settle precisely onto the floor and finish once', () => {
  let landings = 0;
  const game = { hud: { areaCard() {} }, audio: { play() {} }, fx: { slam() {}, glow: { burst() {} }, dust() { landings++; } }, rig: { shake() {} } };
  for (const id of ['achates', 'dragon', 'infinian']) {
    const agent = { game, type: { id, name: id, radius: 1 }, enemy: { position: {}, model: { position: { y: 0.75 } } }, cooldown: 0 };
    beginEntrance(game, agent);
    assert.notEqual(agent.enemy.model.position.y, 0.75);
    assert.equal(updateEntrance(agent, 0.7), true);
    assert.ok(agent.entrance.remaining > 0);
    updateEntrance(agent, 0.8);
    assert.equal(agent.enemy.model.position.y, 0.75);
    assert.equal(updateEntrance(agent, 1), false);
  }
  assert.equal(landings, 3);
});
