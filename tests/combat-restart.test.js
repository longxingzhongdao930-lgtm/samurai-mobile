import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerCombat } from '../src/game/combat/PlayerCombat.js';
import { AIDirector } from '../src/game/ai/AIDirector.js';
import { WEAPONS } from '../src/game/data/weapons.js';

function guardedPlayer(hp, guardMeter) {
  const events = [];
  const p = Object.assign(Object.create(PlayerCombat.prototype), {
    state: 'free', hp, guardMeter, maxGuard: 100, special: 0,
    character: { position: { x: 0, z: 0 }, facing: 0 },
    invulnerable: 0, guarding: true, guardTime: 99, weapon: WEAPONS.katana,
    stats: { damageTaken: 0 }, moves: [],
    guardPose: { stop() {} }, hurtPose: { play() {} }, _cancelPoses() {},
    game: { onPlayerDeath() { events.push('death'); }, onGuardBreak() { events.push('break'); }, onBlock() { events.push('block'); } },
    _stagger() { events.push('stagger'); this.state = 'hurt'; },
  });
  return { p, events };
}
test('lethal guard break preserves death and ignores subsequent hits', () => {
  const { p, events } = guardedPlayer(1, 1);
  const hit = { damage: 20, from: { x: 0, z: 1 } };
  assert.equal(p.receiveHit(hit), 'hit');
  assert.equal(p.hp, 0); assert.equal(p.state, 'dead');
  assert.equal(p.receiveHit(hit), 'ignored');
  assert.deepEqual(events, ['death']);
});
test('surviving guard break still staggers and emits its cue', () => {
  const { p, events } = guardedPlayer(100, 1);
  assert.equal(p.receiveHit({ damage: 20, from: { x: 0, z: 1 } }), 'break');
  assert.equal(p.hp, 90); assert.deepEqual(events, ['stagger', 'break']);
});
test('revive clears charge, dodge, counter and forced movement from the previous life', () => {
  const p = Object.assign(Object.create(PlayerCombat.prototype), {
    maxHp: 100, maxMp: 100, maxGuard: 100, moves: [], poses: [], body: { reset() {} },
    _knock: { x: 2, z: 3 }, _dodge: { active: true, perfect: true },
    _held: { warp: { active: true } }, _charging: true, _chargeTime: 2,
    counterTarget: {}, headingOverride: 1.2, comboIndex: 3,
  });
  p.revive();
  assert.equal(p.state, 'free'); assert.equal(p.hp, 100);
  assert.equal(p._charging, false); assert.equal(p._chargeTime, 0);
  assert.equal(p._dodge.active, false); assert.equal(p._held.warp.active, false);
  assert.equal(p.counterTarget, null); assert.equal(p.headingOverride, null);
  assert.equal(p.comboIndex, -1);
});
test('ranged attackers stagger their cues, retain capacity limits and reset on retry', () => {
  const d = new AIDirector({ enemies: { clear() {} }, quality: { aiSkip: 1 } });
  const a = { type: {} }, b = { type: {} }, c = { type: {} };
  assert.equal(d.requestToken(a, true), true);
  assert.equal(d.requestToken(a, true), true);
  assert.equal(d.requestToken(b, true), false);
  d.update(.56, {});
  assert.equal(d.requestToken(b, true), true);
  d.update(.56, {});
  assert.equal(d.requestToken(c, true), false);
  d.clear();
  assert.equal(d.requestToken(c, true), true);
});

test('midboss and shrine checkpoints restart the unfinished encounter', async () => {
  const { Flow } = await import('../src/game/Flow.js');
  for (const id of ['oni', 'shrineCourt']) {
    const noop = () => {};
    const game = {
      player: { maxHp: 120, special: .4, unlocked: [true, false, false] },
      blessings: { snapshot: () => [] }, stage: { setBarrier: noop },
      audio: { play: noop }, hud: { showBoss: noop }, rig: { shake: noop }, after: noop,
    };
    const f = new Flow(game);
    f._fight = noop; f._emerge = () => ({ position: {}, enemy: {} });
    f.beat = f.beats.findIndex(b => b.id === id);
    f.beats[f.beat].start();
    assert.equal(f.beats[f.checkpoint.beat].id, id);
    assert.equal(f.checkpoint.maxHp, 120);
    assert.equal(f.checkpoint.special, .4);
    game.player.unlocked[1] = true;
    assert.deepEqual(f.checkpoint.unlocked, [true, false, false]);
  }
});
