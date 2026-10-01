/**
 * 評価 — the clear's rank, from how the run went. Pure, so the numbers can be
 * checked without a page (`node --test`), and the clear screen can show the
 * breakdown it was made of.
 *
 *   時間   40 — full at two minutes, nothing at seven
 *   被害   30 — less for every point of health lost; each fall costs 12
 *   技     30 — parries ×3, executions ×4, 一閃 ×4, capped
 *   難易度 易 −10, 難 +8
 *
 * S ≥ 85 · A ≥ 70 · B ≥ 50 · otherwise C.
 */
export const RANKS = ['S', 'A', 'B', 'C'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} run
 * @param {number} run.secs seconds from the gate to the kill
 * @param {number} run.damage health lost
 * @param {number} run.downs times fallen
 * @param {number} run.parry
 * @param {number} run.execution
 * @param {number} run.issen
 * @param {'easy'|'normal'|'hard'} [run.difficulty]
 */
export function rankFor({ secs, damage = 0, downs = 0, parry = 0, execution = 0, issen = 0, difficulty = 'normal' }) {
  const time = Math.round(40 * clamp(1 - (secs - 120) / 300, 0, 1));
  const harm = Math.round(Math.max(0, 30 * clamp(1 - damage / 200, 0, 1) - 12 * downs));
  const skill = Math.min(30, parry * 3 + execution * 4 + issen * 4);
  const bonus = difficulty === 'easy' ? -10 : difficulty === 'hard' ? 8 : 0;
  const score = clamp(time + harm + skill + bonus, 0, 100);
  const rank = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : 'C';
  return { rank, score, time, harm, skill, bonus };
}

/** The better of two ranks (either may be missing). */
export function betterRank(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return RANKS.indexOf(a) <= RANKS.indexOf(b) ? a : b;
}
