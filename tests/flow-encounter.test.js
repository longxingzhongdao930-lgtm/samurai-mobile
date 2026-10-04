import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Flow } from '../src/game/Flow.js';

// Use the real street beat: it adds four optional enemies outside its queue.
function street(budget = 12) {
  const agents = [], barriers = new Map();
  const spawn = (type, x, z) => {
    const agent = { type, alive: true, position: new Vector3(x, 0, z) };
    agents.push(agent);
    return agent;
  };
  const game = {
    director: { agents, spawn, get aliveCount() { return agents.filter(a => a.alive).length; } },
    budget: { maxEnemies: budget },
    stage: { spots: {}, setBarrier: (id, active) => barriers.set(id, active) },
    audio: { setCombat() {} }, hud: { setObjective() {} }, after() {},
  };
  const flow = new Flow(game);
  flow._pickup = () => {};
  flow._emerge = spawn;
  flow.beats.find(b => b.id === 'street').start();
  return { flow, game, optional: [...agents], barriers };
}

test('street encounter starts and completes while all four optional enemies remain alive', () => {
  const { flow, game, optional } = street();
  for (let i = 0; i < 4; i++) flow._updateEncounter(.4);
  assert.equal(flow.encounter.agents.length, 4, 'main road must have enemies without clearing side yards');
  assert.equal(flow.fightOver, false);
  for (const a of flow.encounter.agents) a.alive = false;
  assert.equal(flow.fightOver, true);
  assert.equal(game.director.aliveCount, 4);
  assert.ok(optional.every(a => a.alive));
});

test('minimum mobile budget still advances the required queue without exceeding six living enemies', () => {
  const { flow, game, optional } = street(6);
  const encountered = new Set();
  for (let i = 0; i < 12 && flow.encounter; i++) {
    flow._updateEncounter(.4);
    assert.ok(game.director.aliveCount <= 6);
    for (const a of flow.encounter.agents) { encountered.add(a); a.alive = false; }
    void flow.fightOver;
  }
  assert.equal(encountered.size, 4);
  assert.equal(flow.encounter, null);
  assert.ok(optional.every(a => a.alive));
});

test('encounter cap and device budget independently limit reinforcements, including a budget reduction', () => {
  const { flow, game } = street(6);
  for (let i = 0; i < 20; i++) flow._updateEncounter(.4);
  assert.equal(game.director.aliveCount, 6);
  assert.equal(flow.encounter.agents.length, 2);
  game.budget.maxEnemies = 12;
  for (let i = 0; i < 20; i++) flow._updateEncounter(.4);
  assert.equal(flow.encounter.agents.length, 4);
  flow.encounter.queue.push(['ashigaru', 0, 66]);
  flow._updateEncounter(.4);
  assert.equal(flow.encounter.agents.length, 4, 'encounter cap still applies');
  game.budget.maxEnemies = 6;
  flow.encounter.agents[0].alive = false;
  flow._updateEncounter(.4);
  assert.equal(flow.encounter.queue.length, 1, 'wait until total population falls below the new device budget');
});
