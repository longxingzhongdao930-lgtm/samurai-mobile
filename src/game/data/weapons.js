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
 * The katana is authored; the others below are derived from it (see `derive`),
 * each with its own model in `public/models/weapons/`.
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
    glyph: '斬',
    verb: '攻撃',
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
  axe: { id: 'axe', name: '斧', available: false },
  staff: { id: 'staff', name: '杖', available: false },
  arcane: { id: 'arcane', name: '魔導武器', available: false }
};

/* ---------------------------------------------------------------------- */
/* The rest of the armoury, derived from the katana                        */
/* ---------------------------------------------------------------------- */

/**
 * The body only has the katana's clips, so every other weapon is the katana's
 * moveset re-timed and re-weighted: slower and longer for the great blade,
 * narrow and far for the spear, wide for the glaive, light and quick for the
 * fists. `scale` multiplies, `add` adds, `per` overrides single moves by id.
 */
function derive(base, { scale = {}, add = {}, set = {}, per = {} }) {
  const one = (m) => {
    const out = { ...m, ...set };
    for (const [k, f] of Object.entries(scale)) if (typeof m[k] === 'number') out[k] = m[k] * f;
    for (const [k, d] of Object.entries(add)) if (typeof m[k] === 'number') out[k] = m[k] + d;
    if (out.arc > 360) out.arc = 360;
    return per[m.id] ? { ...out, ...per[m.id] } : out;
  };
  return {
    combo: base.combo.map(one),
    heavy: one(base.heavy),
    counter: one(base.counter),
    execute: one(base.execute)
  };
}

const K = WEAPONS.katana;

/** 大太刀 — the great blade: every cut later, further and heavier. */
WEAPONS.odachi = {
  ...K,
  id: 'odachi',
  glyph: '斬',
  verb: '攻撃',
  name: '大太刀',
  model: 'odachi',
  trailColor: '#ffd6a0',
  ...derive(K, {
    scale: { timeScale: 0.8, damage: 1.45, posture: 1.5, hitStop: 1.3, shake: 1.3, knockback: 1.3 },
    add: { reach: 0.9, arc: 30, standoff: 0.7 },
    set: { backstep: 0.5 }
  }),
  dodge: { ...K.dodge, distance: 3.8, time: 0.46 },
  guard: { ...K.guard, chip: 0.08, moveScale: 0.36 }
};

/** 槍 — the spear: far and narrow, a lunge behind every thrust. */
WEAPONS.spear = {
  ...K,
  id: 'spear',
  glyph: '突',
  verb: '突き',
  name: '槍',
  model: 'spear',
  trailColor: '#e8e2ff',
  ...derive(K, {
    scale: { timeScale: 1.05, damage: 0.95 },
    add: { reach: 1.3, standoff: 1.6 },
    set: { backstep: 0.9 },
    per: { k1: { arc: 70 }, k2: { arc: 60 }, k4: { arc: 70 }, counter: { arc: 70 } }
  })
};

/** 薙刀 — the glaive: wide sweeps that clear a ring. */
WEAPONS.naginata = {
  ...K,
  id: 'naginata',
  glyph: '薙',
  verb: '薙ぎ',
  name: '薙刀',
  model: 'naginata',
  trailColor: '#ffc8e0',
  ...derive(K, {
    scale: { timeScale: 0.9, damage: 1.25, posture: 1.2 },
    add: { reach: 1.0, arc: 110, standoff: 1.2 },
    set: { backstep: 0.8 }
  })
};

/** 鎖鎌 — sickle and chain: quick short cuts, and a weight thrown far. */
WEAPONS.kusarigama = {
  ...K,
  id: 'kusarigama',
  glyph: '鎌',
  verb: '攻撃',
  name: '鎖鎌',
  model: 'kusarigama',
  trailColor: '#d0ffd8',
  ...derive(K, {
    scale: { timeScale: 1.2, damage: 0.95 },
    add: { reach: -0.2 },
    per: {
      // The weight swung round on its chain.
      k3: { reach: 5.0, arc: 360, damage: 9, posture: 12, knockback: 1.2, chain: true, sfx: 'slash', lunge: 0 },
      // Thrown at one body, from far off.
      heavy: {
        clip: 'slashHit', clipFrom: 0.07, clipTo: 0.38, timeScale: 1.3, hits: [0.62], reach: 7.5, arc: 34,
        lunge: 0, standoff: 99, maxWarp: 0, passThrough: 0, damage: 18, posture: 26, knockback: -2.2,
        launch: false, chain: true, trail: false, sfx: 'slash'
      }
    }
  })
};

/** 手甲 — the gauntlets: fast blows that break a guard rather than cut. */
WEAPONS.gauntlet = {
  ...K,
  id: 'gauntlet',
  glyph: '打',
  verb: '打撃',
  name: '手甲',
  model: 'gauntlet',
  mount: 'forearms',
  ...derive(K, {
    scale: { timeScale: 1.35, damage: 0.95, posture: 2.0 },
    add: { reach: -0.45 },
    set: { slices: false, trail: false, sfx: 'kick', arc: 110 },
    per: { k5: { arc: 360, sfx: 'slam' }, execute: { sfx: 'execute' } }
  })
};

// Hand-to-hand combat has a short ground chain and a deliberate release-to-launch uppercut.
WEAPONS.gauntlet.combo = WEAPONS.gauntlet.combo.slice(0, 3).map((spec, index) => ({
  ...spec, ...(index === 2 ? { clip: 'slashHit', clipFrom: 0.07, clipTo: 0.38, hits: [0.55] } : {}),
  launch: false, knockback: 0.3
}));
WEAPONS.gauntlet.heavy = { ...WEAPONS.gauntlet.heavy, clip: 'slashHit', clipFrom: 0.07, clipTo: 0.66,
  hits: [0.62], timeScale: 1.3, maxWarp: 1.8, passThrough: 0, lunge: 0.5, standoff: 1.1,
  gripPull: true, reach: 2.3, damage: 14, posture: 38, knockback: 0, launch: false, airLauncher: true };
WEAPONS.gauntlet.counter = { ...WEAPONS.gauntlet.counter, airLauncher: true, knockback: 0, launch: false };
for (const spec of [...WEAPONS.gauntlet.combo, WEAPONS.gauntlet.heavy, WEAPONS.gauntlet.counter]) {
  spec.maxWarp = 0; spec.lunge = 0; spec.passThrough = 0; spec.standoff = 99;
}
WEAPONS.gauntlet.glyph = '拳'; WEAPONS.gauntlet.verb = '飛拳';


/** 手裏剣 — throwing stars: the attack throws, from wherever you stand. */
const THROW = {
  clip: 'slashHit', clipFrom: 0.04, clipTo: 0.3, timeScale: 1.7, hits: [0.6], lunge: 0, standoff: 99,
  maxWarp: 0, passThrough: 0, cancelAt: 0.7, recoverAt: 0.92, trail: false, sfx: null, reach: 16, arc: 60,
  slices: false, launch: false, knockback: 0.3
};
WEAPONS.shuriken = {
  ...K,
  id: 'shuriken',
  glyph: '投',
  verb: '投擲',
  name: '手裏剣',
  model: 'shuriken',
  combo: [
    { ...K.combo[0], ...THROW, id: 's1', throw: { count: 1, spread: 0 }, damage: 7, posture: 3 },
    { ...K.combo[0], ...THROW, id: 's2', throw: { count: 1, spread: 0 }, damage: 7, posture: 3 },
    { ...K.combo[0], ...THROW, id: 's3', timeScale: 1.3, throw: { count: 3, spread: 0.2 }, damage: 6, posture: 4 }
  ],
  heavy: { ...K.combo[0], ...THROW, id: 'heavy', timeScale: 1.1, throw: { count: 5, spread: 0.18 }, damage: 9, posture: 6 },
  counter: { ...K.combo[0], ...THROW, id: 'counter', timeScale: 2.2, throw: { count: 3, spread: 0.12 }, damage: 12, posture: 14 },
  execute: K.execute
};

/** The order the weapon button cycles through. */
export const WEAPON_ORDER = ['katana', 'odachi', 'spear', 'naginata', 'kusarigama', 'gauntlet', 'shuriken'];
