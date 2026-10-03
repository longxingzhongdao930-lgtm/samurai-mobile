import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { GauntletAir, canLaunch } from '../src/game/combat/GauntletAir.js';
import { WEAPONS } from '../src/game/data/weapons.js';

function fixture() {
  const pending = new Set();
  const input = { held: { attack: false }, holdTime: { attack: 0 }, consume: id => pending.delete(id) };
  const hits = [], noop = () => {};
  const game = { app: { terrain: { heightAt: () => 0 } }, form: { active: false }, director: { releaseToken: noop },
    hud: { notice: noop }, audio: { play: noop }, hitStop: noop, rig: { shake: noop }, fx: { slam: noop, dust: noop },
    damageEnemy: (target, hit) => { hits.push(hit); return { damage: hit.damage }; }, stage: { collide: pos => { pos.x = Math.min(2, pos.x); } } };
  const player = { game, input, character: { position: new Vector3(), facing: 0 }, weapon: WEAPONS.gauntlet, state: 'attack', moves: [],
    dodgePose: { hold: noop, stop: noop }, _cancelPoses: noop, _faceToward: noop,
    _toFree() { this.state = 'free'; }, hitCombo: 0, stats: { maxCombo: 0 }, special: 0, mp: 0, maxMp: 100 };
  const enemy = { alive: true, position: new Vector3(0, 0, 1.2) };
  enemy.agent = { alive: true, type: { id: 'samurai' }, moves: [], velocity: { x: 0, z: 0 }, _knock: { x: 0, z: 0 }, kneel: { stop: noop }, fall: { stop: noop } };
  const air = new GauntletAir(player);
  const step = (seconds) => { for (let i = 0; i < Math.ceil(seconds * 120); i++) { air.update(1 / 120, input); player.character.position.y = player.character.airHeight; } };
  const press = () => pending.add('attack');
  return { air, enemy, player, pending, input, hits, step, press };
}

test('hand-to-hand chain has three strikes and a release-to-launch uppercut without dash-through', () => {
  assert.equal(WEAPONS.gauntlet.combo.length, 3);
  assert.ok(WEAPONS.gauntlet.heavy.airLauncher);
  assert.equal(WEAPONS.gauntlet.heavy.passThrough, 0);
  assert.ok(WEAPONS.gauntlet.combo.every(move => !move.launch && !move.slices));
});
test('one launch permits two aerial contacts and one slam, then returns both bodies to ground', () => {
  const f = fixture();
  assert.ok(f.air.launch(f.enemy)); f.step(.15); f.press(); f.step(.32);
  assert.ok(f.player.character.airHeight > 2);
  f.press(); f.step(.36); f.press(); f.step(.36); f.press(); f.step(1);
  assert.deepEqual(f.hits.map(h => h.damage), [8, 8, 24]);
  assert.equal(f.air.active, false); assert.equal(f.enemy.airHeight, 0);
  assert.equal(f.player.character.airHeight, 0); assert.equal(f.enemy.agent.airControlled, false);
  assert.equal(f.air.launch(f.enemy), false, 'no repeated juggle before recovery');
});
test('missed follow-up, dead target and air dodge all settle with no stranded bodies', () => {
  for (const mode of ['ignore', 'death', 'dodge']) {
    const f = fixture(); f.air.launch(f.enemy); f.step(.15);
    if (mode !== 'ignore') { f.press(); f.step(.35); }
    if (mode === 'death') f.enemy.alive = false;
    if (mode === 'dodge') f.pending.add('dodge');
    f.step(1.3);
    assert.equal(f.air.active, false, mode);
    assert.equal(f.player.character.airHeight, 0, mode); assert.equal(f.enemy.airHeight, 0, mode);
    assert.equal(f.hits.length, 0, mode);
  }
});
test('elites and bosses never lift, queen requires an opening, dead enemies cannot start a combo', () => {
  for (const type of [{ id: 'dragon', elite: true }, { id: 'gwyn', boss: true }, { id: 'queen' }]) assert.equal(canLaunch({ alive: true, type }), false);
  assert.ok(canLaunch({ alive: true, type: { id: 'queen' } }, true));
  assert.equal(canLaunch({ alive: false, type: { id: 'samurai' } }), false);
});
test('holding and releasing in the air can finish early; repeated frames never duplicate a hit', () => {
  const f = fixture(); f.air.launch(f.enemy); f.press(); f.step(.32);
  f.input.held.attack = true; f.input.holdTime.attack = .4; f.step(.02);
  f.input.held.attack = false; f.step(.6);
  assert.deepEqual(f.hits.map(h => h.damage), [24]); f.step(2);
  assert.equal(f.hits.length, 1);
});
