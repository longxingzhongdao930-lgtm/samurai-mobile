/**
 * Weapons, as data.
 *
 * A weapon is its equipment model plus its moveset: the combo string, the
 * heavy, the counter that follows a parry, the execution, and the defensive
 * numbers. Every move names a retargeted clip (`clip`), the slice of it to play
 * (`clipFrom`/`clipTo`, fractions of the clip) and its timings as fractions of
 * that slice — the shape `animation/Attack.js` reads. `PlayerCombat` knows
 * nothing about katanas: adding the dual blades or a spear is a new entry here
 * plus whatever clips it names.
 *
 * Only the katana ships in the trial. The others are listed so the shape is
 * settled, and are skipped until they have a model and a moveset.
 */

/** Defaults every move inherits, so an entry only says what makes it itself. */
const MOVE = {
  enabled: true,
  timeScale: 1,
  clipFrom: 0,
  clipTo: 1,
  standoff: 1.35,
  maxWarp: 2.6,
  warpAt: 0.45,
  turnAt: 0.35,
  lunge: 0.45,
  passThrough: 0,
  reach: 2.6,
  arc: 140,
  recoverAt: 0.92,
  cancelAt: 0.6,
  blendIn: 0.07,
  blendOut: 0.16,
  damage: 10,
  posture: 6,
  knockback: 0.5,
  launch: false,
  hitStop: 0.055,
  hitStopScale: 0.08,
  shake: 0.07,
  slices: true,
  // Death throw, read by the ragdoll when this blow kills.
  impulse: 4.4,
  lift: 3.2,
  spin: 1.6,
  sfx: 'slash',
  trail: true
};

const move = (spec) => ({ ...MOVE, ...spec });

export const WEAPONS = {
  katana: {
    id: 'katana',
    name: '刀',
    equipment: 'sword',
    available: true,
    combo: [
      // 一の太刀 — the horizontal opening out of the slash clip.
      move({
        id: 'k1', clip: 'slashHit', clipFrom: 0.07, clipTo: 0.38, timeScale: 1.55,
        hits: [0.62], cancelAt: 0.66, recoverAt: 0.95, damage: 9, posture: 5, lunge: 0.6
      }),
      // 二の太刀 — the overhead that follows it in the same clip.
      move({
        id: 'k2', clip: 'slashHit', clipFrom: 0.36, clipTo: 0.66, timeScale: 1.6,
        hits: [0.45], cancelAt: 0.62, recoverAt: 0.95, damage: 10, posture: 6, lunge: 0.55,
        shake: 0.09
      }),
      // 三 — the spinning kick: a shove that opens the guard.
      move({
        id: 'k3', clip: 'kick', clipFrom: 0.14, clipTo: 0.7, timeScale: 1.45,
        hits: [0.5], cancelAt: 0.7, recoverAt: 0.95, damage: 8, posture: 14, knockback: 2.2,
        slices: false, sfx: 'kick', trail: false, reach: 2.4, arc: 160, impulse: 6.5, lift: 3.4
      }),
      // 四 — both cuts of the slash at once, faster: two hits in one move.
      move({
        id: 'k4', clip: 'slashHit', clipFrom: 0.07, clipTo: 0.66, timeScale: 2.15,
        hits: [0.36, 0.72], cancelAt: 0.78, recoverAt: 0.95, damage: 8, posture: 6, lunge: 0.8,
        shake: 0.1
      }),
      // 五 — 落雷斬: the landing slam, a leap that ends in the ground.
      move({
        id: 'k5', clip: 'land', clipFrom: 0.0, clipTo: 0.62, timeScale: 1.35,
        hits: [0.42], cancelAt: 0.9, recoverAt: 0.94, damage: 20, posture: 18, knockback: 3.2,
        launch: true, reach: 3.3, arc: 360, lunge: 1.2, standoff: 1.1, maxWarp: 3.4,
        hitStop: 0.11, hitStopScale: 0.04, shake: 0.32, sfx: 'slam', ring: true,
        impulse: 6.5, lift: 6.5, spin: 2.4
      })
    ],
    /** 居合 — the dash-through cut. Charged by holding attack. */
    heavy: move({
      id: 'heavy', clip: 'crouchSlash', clipFrom: 0.12, clipTo: 0.92, timeScale: 1.35,
      standoff: 1.55, maxWarp: 7, passThrough: 1.9, passAt: 0.9, warpAt: 0.62, turnAt: 0.3,
      hits: [0.66], cancelAt: 0.92, recoverAt: 0.95, lunge: 4.5, reach: 3.2, arc: 120,
      damage: 26, posture: 22, knockback: 2.5, launch: true, hitStop: 0.12,
      hitStopScale: 0.04, shake: 0.3, sfx: 'heavy', impulse: 5.8, lift: 4.2, spin: 2.1
    }),
    /** The riposte after a parry: fast, and it lands on a body that cannot answer. */
    counter: move({
      id: 'counter', clip: 'slashHit', clipFrom: 0.2, clipTo: 0.66, timeScale: 2.0,
      hits: [0.28, 0.66], cancelAt: 0.8, recoverAt: 0.92, damage: 16, posture: 20,
      lunge: 0.9, hitStop: 0.09, hitStopScale: 0.05, shake: 0.16
    }),
    /** 処刑 — on a broken body: the overhead, slowed, and it always kills. */
    execute: move({
      id: 'execute', clip: 'slashHit', clipFrom: 0.3, clipTo: 0.72, timeScale: 0.95,
      hits: [0.42], cancelAt: 1, recoverAt: 0.96, damage: 999, posture: 0, standoff: 1.15,
      maxWarp: 4, warpAt: 0.3, hitStop: 0.2, hitStopScale: 0.03, shake: 0.3, sfx: 'execute',
      impulse: 3.5, lift: 4.5, spin: 1.2
    }),
    dodge: { distance: 4.2, time: 0.44, iframes: 0.3, recovery: 0.1, cooldown: 0.08 },
    guard: {
      /** Seconds from the guard press in which a blow is parried rather than blocked. */
      parryWindow: 0.24,
      /** Fraction of damage that still gets through a block. */
      chip: 0.12,
      /** Posture the player loses per blocked hit, as a fraction of its damage. */
      breakScale: 1.4,
      moveScale: 0.42
    }
  },

  // Future weapons. Same shape; `available: false` until they ship.
  dualBlades: { id: 'dualBlades', name: '双剣', available: false },
  greatsword: { id: 'greatsword', name: '大剣', available: false },
  spear: { id: 'spear', name: '槍', available: false },
  bow: { id: 'bow', name: '弓', available: false },
  axe: { id: 'axe', name: '斧', available: false },
  kusarigama: { id: 'kusarigama', name: '鎖鎌', available: false },
  shuriken: { id: 'shuriken', name: '手裏剣', available: false },
  staff: { id: 'staff', name: '杖', available: false },
  arcane: { id: 'arcane', name: '魔導武器', available: false }
};
