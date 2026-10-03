import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group, Vector3 } from 'three';
import { obstructionFraction, segmentCylinderHit, segmentSphereHit } from '../src/game/combat/FlightPath.js';
import { Stage } from '../src/game/world/Stage.js';
import { FlyingGauntlet } from '../src/game/combat/FlyingGauntlet.js';
import { SwordVolley } from '../src/game/ai/SwordVolley.js';
import { FloatingCaster } from '../src/game/ai/FloatingCaster.js';
import { Magic } from '../src/game/magic/Magic.js';

const point = (z, y = 1.1, x = 0) => new Vector3(x, y, z);
const street = [[-5, 5, -5, 40]];
const wall = [-5, 5, 4, 4.05, 0, 4.5];
const stageWith = (boxes = [wall]) => ({ projectileFraction: (a, b) => obstructionFraction(a, b, street, boxes) });
const noop = () => {};

test('continuous trace stops at thin walls and gaps even when both ends are walkable', () => {
  assert.equal(obstructionFraction(point(0), point(10), street, [wall]), .4);
  assert.equal(obstructionFraction(point(0), point(10), [[-5, 5, -5, 4], [-5, 5, 6, 20]]), .4);
  assert.equal(obstructionFraction(point(0), point(10), [[-5, 5, -5, 6], [-5, 5, 4, 20]]), 1);
  assert.equal(obstructionFraction(point(4.01), point(10), street, [wall]), 0);
  assert.equal(obstructionFraction(point(2), point(2), street, [wall]), 1);
  assert.equal(obstructionFraction(point(0, 1.1, 8), point(10), street), 0);
});
test('low scenery permits shots above it and actual stage barriers open immediately', () => {
  const bench = [-1, 1, 4, 5, 0, .5];
  assert.equal(obstructionFraction(point(0), point(10), street, [bench]), 1);
  assert.equal(obstructionFraction(point(0, .25), point(10, .25), street, [bench]), .4);
  const stage = new Stage({});
  stage.barriers.test = { active: true, rect: [-4, 4, 4, 5] };
  assert.equal(stage.projectileFraction(point(0), point(10)), .4);
  assert.equal(stage.projectileFraction(point(0, 5), point(10, 5)), 1);
  stage.barriers.test.active = false;
  assert.equal(stage.projectileFraction(point(0), point(10)), 1);
  // Left yard and street are separated by buildings away from the alley.
  assert.ok(stage.projectileFraction(point(30, 1, -16), point(30, 1, 0)) < 1);
});
test('swept hit volumes find first contact and reject misses above or behind the segment', () => {
  assert.equal(segmentSphereHit(point(5), 1, point(0), point(10)), .4);
  assert.equal(segmentSphereHit(point(-5), 1, point(0), point(10)), Infinity);
  assert.equal(segmentCylinderHit(point(5, 0), 1, 0, 2, point(0), point(10)), .4);
  assert.equal(segmentCylinderHit(point(5, 0), 1, 0, 2, point(0, 3), point(10, 3)), Infinity);
  assert.equal(segmentCylinderHit(point(5, 0), 1, 0, 2, point(5, 4), point(5, -2)), 1/3);
});

function fistFixture(stage, depths) {
  const pos = new Vector3(), hits = [];
  const enemies = depths.map(z => ({ alive: true, position: point(z, 0), agent: { radius: .4, type: { height: 2 }, state: 'engage' } }));
  const game = { stage, playerPosition: pos, app: { scene: new Group(), character: { position: pos, facing: 0, getBone: () => null } },
    player: { state: 'free', weapon: { id: 'gauntlet' }, onRangedHit: noop, air: {} }, form: { active: false },
    enemies: { enemies }, damageEnemy(e) { hits.push(e.position.z); return { damage: 10 }; } };
  const fist = new FlyingGauntlet(game, new Group());
  fist.launch({ damage: 10, posture: 0 }, enemies[0]);
  fist.update(.5);
  return { fist, hits };
}
test('hand stops at a thin wall, still hits an enemy before it, and chooses the nearest body', () => {
  const blocked = fistFixture(stageWith(), [8]);
  assert.deepEqual(blocked.hits, []); assert.ok(blocked.fist.flight.returning);
  assert.ok(Math.abs(blocked.fist.flight.pos.z - 4) < 1e-6);
  assert.deepEqual(fistFixture(stageWith(), [8, 2]).hits, [2]);
  assert.deepEqual(fistFixture(stageWith([]), [8, 2]).hits, [2]);
});
function swordFixture(stage, playerZ = 8) {
  const root = new Group(), bone = new Bone(); bone.position.y = 1.1; root.add(bone);root.updateMatrixWorld(true);
  let hits = 0, reflectedHits = 0;
  const enemy = { alive: true, position: new Vector3(), agent: { state: 'attack', type: { height: 2 }, radius: .4 } };
  enemy.agent.game = { stage, playerPosition: point(playerZ, 0), player: { receiveHit() { hits++; return 'hit'; } }, damageEnemy() { reflectedHits++; } };
  const volley = new SwordVolley(enemy, [bone]); volley.enqueue({ damage: 8 }); volley.update(.24);
  volley.beforeAnimate();root.updateMatrixWorld(true);volley.update(.7);
  return { volley, hits, reflectedHits: () => reflectedHits, root };
}
test('queen sword cannot hit through a wall, can hit before it, and blocked reflection does no damage', () => {
  const blocked = swordFixture(stageWith());
  assert.equal(blocked.hits, 0); assert.equal(blocked.volley.flight.state, 'return');
  assert.equal(swordFixture(stageWith(), 2).hits, 1);
  const f = blocked.volley.flight; f.state = 'reflected'; f.time = 0; f.pos.copy(point(8));
  blocked.volley.beforeAnimate(); blocked.root.updateMatrixWorld(true); blocked.volley.update(.7);
  assert.equal(blocked.reflectedHits(), 0); assert.equal(f.state, 'return');
});
test('mage laser uses the same clipped length for preview and damage, capped at 22m', () => {
  let hits = 0;
  const enemy = { root: new Group(), kind: 'mage', bones: new Map(), alive: true,
    agent: { state: 'attack', move: { phase: .55 }, moveSpec: { hits: [.8] }, game: { stage: stageWith(), playerPosition: point(8, 0), player: { receiveHit() { hits++; return 'hit'; } } } } };
  const caster = new FloatingCaster(enemy); caster.muzzlePosition = () => point(0);
  caster.aim.copy(point(8)); caster.hasAim = true; caster.update(0);
  assert.equal(caster.beam.scale.y, 4); caster.fire({ damage: 10 }); assert.equal(hits, 0);
  enemy.agent.game.stage = stageWith([]); caster.fire({ damage: 10 }); assert.equal(hits, 1);
  caster.aim.copy(point(30)); enemy.agent.game.playerPosition.z = 30;
  assert.equal(caster.beamEnd(point(0)).z, 22); caster.fire({ damage: 10 }); assert.equal(hits, 1);
  caster.dispose();
});
function magicFixture(stage, owner, targetZ) {
  const hits = [], enemy = { alive: true, position: point(targetZ, 0), agent: { radius: .4, type: { height: 2 } } };
  const fx = { glow: { move: noop, spawn: noop, free: noop }, shards: { move: noop, free: noop } };
  const game = { stage, fx, app: { terrain: { heightAt: () => 0 } }, enemies: { enemies: [enemy] },
    playerPosition: point(targetZ, 0), player: { receiveHit() { hits.push('player'); return 'hit'; } } };
  const magic = new Magic(game);magic._tickStatusVisuals = noop; magic._spellHit = () => hits.push('enemy');
  magic.projectiles.push({ owner, pos: point(0), vel: point(20, 0), life: 2, radius: .1, trailAcc: 0, spin: 0,
    shard: -1, color: '#ffffff', element: { id: 'thunder', color: '#ffffff' }, spell: {}, spec: { damage: 10, magicSequence: true }, agent: { enemy } });
  magic.update(.5);
  return { hits, magic };
}
test('magic and enemy bolts hit swept targets before walls but never bodies beyond them', () => {
  for (const owner of ['player', 'enemy']) {
    assert.equal(magicFixture(stageWith(), owner, 8).hits.length, 0);
    assert.equal(magicFixture(stageWith(), owner, 2).hits.length, 1);
    assert.equal(magicFixture(stageWith([]), owner, 8).hits.length, 1);
  }
});

test('camera stops before thin props, returns smoothly, and can look over low scenery', () => {
  const stage = new Stage({});
  stage.projectileBoxes.push([-1, 1, 2, 2.05, 0, 3]);
  const rig = { controls: { target: point(0) }, camera: { position: point(5) } };
  stage.cameraCollide(rig);
  assert.ok(rig.camera.position.z < 1.86);
  const compressed = stage._pull;
  stage.projectileBoxes.length = 0; rig.camera.position.copy(point(5));
  stage.cameraCollide(rig, 1/60);
  assert.ok(stage._pull > compressed && stage._pull < 1);
  stage._pull = 1; stage.projectileBoxes.push([-1, 1, 2, 2.05, 0, .5]);
  rig.camera.position.copy(point(5)); stage.cameraCollide(rig);
  assert.equal(rig.camera.position.z, 5);
});
