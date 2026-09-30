/**
 * What a guard does to a blow — pure, so the same rule decides it on a
 * phone in single player and on the PvP server (`server/room.js`).
 *
 * Nothing here knows about three.js, the scene or the clock. It is handed the
 * defender's state at the moment the blow lands and the numbers from
 * `settings.defense`, and it answers with one of four results:
 *
 *  - **hit**   — no guard up, or the blow came from outside the guard's arc
 *                (the side or behind). Full damage.
 *  - **parry** — the guard went up no more than `parryWindow` seconds before
 *                the blow. Nothing gets through, and the attacker is thrown
 *                off balance; the caller decides what that means.
 *  - **block** — an ordinary guard. `guardChip` of the damage gets through,
 *                and it costs `guardCost` stamina.
 *  - **break** — a guard with too little stamina left to hold it. The guard
 *                is knocked open: `breakDamage` of the blow lands and the
 *                defender is left staggered.
 *
 * `guardAge` is how long the guard has been up, in seconds. Too early (a
 * guard held long before the blow) is simply a block; too late (raised after
 * the blow landed) never reaches here, because the guard was not up.
 */

/**
 * @param {object} state the defender, at contact
 * @param {boolean} state.guarding
 * @param {number} state.guardAge seconds the guard has been up
 * @param {number} state.stamina what is left (Infinity when stamina is off)
 * @param {number} state.facing radians about +Y, 0 facing +Z
 * @param {number} state.toAttackerX unit vector from defender to attacker
 * @param {number} state.toAttackerZ
 * @param {object} config `settings.defense`
 * @returns {{result: 'hit'|'parry'|'block'|'break', damageScale: number, staminaCost: number}}
 */
export function resolveDefense(state, config) {
  if (!state.guarding) return { result: 'hit', damageScale: 1, staminaCost: 0 };

  // The guard only covers the front: `guardArc` degrees, centred on facing.
  const fx = Math.sin(state.facing);
  const fz = Math.cos(state.facing);
  const along = fx * state.toAttackerX + fz * state.toAttackerZ;
  const half = Math.cos(((config.guardArc ?? 150) * Math.PI) / 360);
  if (along < half) return { result: 'hit', damageScale: 1, staminaCost: 0 };

  if (state.guardAge <= (config.parryWindow ?? 0)) {
    return { result: 'parry', damageScale: 0, staminaCost: -(config.parryRefund ?? 0) };
  }

  const cost = config.guardCost ?? 0;
  if (Number.isFinite(state.stamina) && state.stamina < cost) {
    return { result: 'break', damageScale: config.breakDamage ?? 0.5, staminaCost: state.stamina };
  }

  return { result: 'block', damageScale: config.guardChip ?? 0, staminaCost: cost };
}
