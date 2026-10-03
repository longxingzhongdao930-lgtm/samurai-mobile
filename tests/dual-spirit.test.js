import test from 'node:test';
import assert from 'node:assert/strict';
import { DualSpirit } from '../src/game/combat/DualSpirit.js';
function setup() {
  const player = { weapon: { id: 'katana' }, game: { form: { active: false } } };
  return { player, spirit: new DualSpirit(player) };
}
const hit = { source: 'melee', damage: 5, posture: 2 };
test('defence charge survives weapon changes and only empowers one katana heavy', () => {
  const { player, spirit: s } = setup();
  for (let i = 0; i < 3; i++) s.defend(true);
  assert.equal(s.calm, 100);
  const config = { damage: 20, posture: 10 };
  player.weapon.id = 'gauntlet';
  assert.equal(s.empowerMove(config, true), config);
  player.weapon.id = 'katana';
  assert.equal(s.empowerMove(config, false), config);
  assert.equal(s.empowerMove(config, true).damage, 32);
  assert.equal(s.empowerMove(config, true), config);
  assert.equal(config.damage, 20);
});
test('normal guards also charge, while death and full transformation cannot charge', () => {
  const { player, spirit: s } = setup();
  for (let i = 0; i < 9; i++) s.defend(false);
  assert.equal(s.calm, 100); s.reset();
  player.game.form.active = true; s.defend(true);
  s.landed(hit, { damage: 5 }, {});
  assert.equal(s.calm + s.dragon, 0);
  player.game.form.active = false; player.dead = true; s.defend(true);
  assert.equal(s.calm, 0);
});
test('direct hits charge once per interval; missed pulse is retained and successful pulse is consumed', () => {
  const { spirit: s } = setup();
  for (let i = 0; i < 10; i++) {
    s.landed(hit, { damage: 5 }, {});
    s.landed(hit, { damage: 5 }, {});
    s.update(.2);
  }
  assert.equal(s.dragon, 100);
  const pulse = s.prepareHit(hit);
  assert.equal(pulse.damage, 15); assert.equal(pulse.posture, 26);
  s.landed(pulse, { damage: 0, evaded: true }, {});
  assert.equal(s.dragon, 100);
  s.landed(pulse, { damage: 15 }, {});
  assert.equal(s.dragon, 0); assert.equal(s.pulse, .8);
  assert.equal(s.prepareHit(hit), hit);
  s.update(1); assert.equal(s.pulse, 0);
});
test('damage over time, executions and rejected hits do not generate charge; retry clears effects', () => {
  const { spirit: s } = setup();
  s.landed({ ...hit, source: 'burn' }, { damage: 5 }, {});
  s.landed({ ...hit, execute: true }, { damage: 5 }, {});
  s.landed(hit, null, {});
  assert.equal(s.dragon, 0);
  s.arm = { visible: true }; s.calm = 100; s.dragon = 100; s.pulse = .8;
  s.reset(); assert.equal(s.calm + s.dragon + s.pulse, 0); assert.equal(s.arm.visible, false);
});
