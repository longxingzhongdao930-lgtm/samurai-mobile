// The clear's rank (`src/world/rank.js`): node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import { rankFor, betterRank } from '../src/world/rank.js';

test('a fast, clean, stylish run is S', () => {
  const r = rankFor({ secs: 110, damage: 0, parry: 6, execution: 3 });
  assert.equal(r.rank, 'S');
  assert.equal(r.score, 100);
});

test('slow and hurt is C', () => {
  assert.equal(rankFor({ secs: 500, damage: 180, downs: 1 }).rank, 'C');
});

test('a fall costs, and 難易度 shifts the score', () => {
  const run = { secs: 200, damage: 60, parry: 3, execution: 2 };
  const normal = rankFor(run);
  assert.equal(rankFor({ ...run, downs: 1 }).score, normal.score - 12);
  assert.equal(rankFor({ ...run, difficulty: 'easy' }).score, normal.score - 10);
  assert.equal(rankFor({ ...run, difficulty: 'hard' }).score, normal.score + 8);
});

test('thresholds', () => {
  // time 40 (≤120 s) + harm 30 (no damage) + skill from parries
  assert.equal(rankFor({ secs: 120, parry: 5 }).rank, 'S'); // 85
  assert.equal(rankFor({ secs: 120, parry: 0 }).rank, 'A'); // 70
  assert.equal(rankFor({ secs: 300, damage: 100 }).rank, 'C'); // 16 + 15
});

test('betterRank keeps the best', () => {
  assert.equal(betterRank(null, 'B'), 'B');
  assert.equal(betterRank('A', 'B'), 'A');
  assert.equal(betterRank('B', 'S'), 'S');
});
