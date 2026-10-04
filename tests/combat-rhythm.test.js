import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerCombat } from '../src/game/combat/PlayerCombat.js';
import { comboLifetime, combatHint } from '../src/game/combat/CombatRhythm.js';
import { WEAPONS } from '../src/game/data/weapons.js';

function fixture() {
  let pressed = false;
  const p = Object.assign(Object.create(PlayerCombat.prototype), {
    state: 'attack', game: { form: { active: false } }, weapon: WEAPONS.katana,
    move: { phase: .2, config: { cancelAt: .6 } }, execute: {},
    _weaponQueue: 0, _switchBoost: 0, _linkHitTimer: .8,
    _held: { warp: { active: true } },
    input: { consume: () => { const value = pressed; pressed = false; return value; } },
    setWeapon(id) { this.weapon = WEAPONS[id]; return true; },
    _toFree() { this.state = 'free'; },
  });
  return { p, press: () => { pressed = true; } };
}
test('single-katana switch input cannot cancel attacks or grant a switch boost', () => {
  const { p, press } = fixture(); press(); p._readWeaponSwitch();
  assert.equal(p.weapon.id, 'katana');
  p.move.phase = .65; p._readWeaponSwitch();
  assert.equal(p.weapon.id, 'katana'); assert.equal(p._switchBoost, 0);
  assert.equal(p.state, 'attack'); assert.equal(p._held.warp.active, true);
  assert.equal(p._weaponQueue, 0);
});
test('whiffed moves allow recovery switching without a reward; executions cannot be cancelled', () => {
  const { p, press } = fixture(); p._linkHitTimer = 0; p.move.phase = .7;
  press(); p._readWeaponSwitch(); assert.equal(p._switchBoost, 0);
  p.state = 'attack'; p.move = p.execute = { phase: .9, config: { cancelAt: .6 } };
  const previous = p.weapon; press(); p._readWeaponSwitch(); assert.equal(p.weapon, previous);
});
test('hurt, death, full transformation and cinematics discard queued switches', () => {
  for (const mode of ['hurt', 'dead', 'form', 'cinematic']) {
    const { p, press } = fixture();
    if (mode === 'form') p.game.form.active = true;
    else if (mode === 'cinematic') p.game.cinematic = true;
    else p.state = mode;
    p._weaponQueue = .5; press(); p._readWeaponSwitch();
    assert.equal(p._weaponQueue, 0); assert.equal(p.weapon.id, 'katana');
  }
});
test('successful hits extend a bounded rhythm window without shortening kill grace', () => {
  const p = Object.assign(Object.create(PlayerCombat.prototype), { hitCombo: 0, _hitComboTimer: 0, stats: { maxCombo: 0 } });
  p._recordHit(); assert.equal(p._hitComboTimer, 2.4);
  p._recordHit(20); assert.equal(p._hitComboTimer, 3.2);
  p._hitComboTimer = 3.4; p._recordHit(); assert.equal(p._hitComboTimer, 3.4);
  assert.equal(comboLifetime(10000), 3.2);
});
test('the hint prioritizes exhausted guard and suppresses human actions during transformation', () => {
  const p = { game: { form: { active: false } }, spirit: { calm: 100 }, weapon: WEAPONS.katana, counterWindow: 1, maxGuard: 100, guardMeter: 10, guarding: true };
  assert.match(combatHint(p), /守りが限界/);
  p.guarding = false; assert.match(combatHint(p), /反撃/);
  p.counterWindow = 0; assert.match(combatHint(p), /居合/);
  p.game.form.active = true; assert.equal(combatHint(p), '');
});
