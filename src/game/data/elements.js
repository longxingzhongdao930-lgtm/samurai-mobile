/**
 * Elements, spells and the reactions between them — as data.
 *
 * The trial ships three elements (fire, thunder, ice), one spell each. A body
 * hit by a spell carries that element as a *mark* for a few seconds; a second
 * element landing on a marked body triggers the reaction keyed by the pair.
 * Adding an element is an entry in `ELEMENTS`, a spell in `SPELLS`, and
 * whichever pairs in `REACTIONS` it should answer to — `game/magic/Magic.js`
 * reads nothing else.
 */

export const ELEMENTS = {
  fire: { id: 'fire', name: '火', color: '#ff6a1f', glow: '#ffb050', available: true },
  thunder: { id: 'thunder', name: '雷', color: '#8fb8ff', glow: '#e8f0ff', available: true },
  ice: { id: 'ice', name: '氷', color: '#7fe6ff', glow: '#d8fbff', available: true },
  // Reserved for the full game. Same shape, no spell yet.
  wind: { id: 'wind', name: '風', color: '#9fe8a0', glow: '#e0ffe0', available: false },
  water: { id: 'water', name: '水', color: '#3f8cff', glow: '#a8d0ff', available: false },
  earth: { id: 'earth', name: '土', color: '#b08850', glow: '#e8c890', available: false },
  light: { id: 'light', name: '光', color: '#fff2b0', glow: '#ffffff', available: false },
  dark: { id: 'dark', name: '闇', color: '#8a50c8', glow: '#d0a0ff', available: false }
};

/** The order the three chips sit in on screen. */
export const SPELL_ORDER = ['fire', 'thunder', 'ice'];

export const SPELLS = {
  fire: {
    id: 'fireball', element: 'fire', name: '火球', cost: 22,
    kind: 'projectile', speed: 17, radius: 0.32, life: 1.6, homing: 2.4,
    damage: 16, posture: 4, splash: 2.0, splashDamage: 8, mark: 5,
    burn: { dps: 4, time: 3 }, castTime: 0.28, sfx: 'fire'
  },
  thunder: {
    id: 'thunderbolt', element: 'thunder', name: '雷撃', cost: 26,
    kind: 'strike', range: 14, delay: 0.32, radius: 1.8, chain: 2, chainRange: 5,
    damage: 20, posture: 12, mark: 5, stun: 0.6, castTime: 0.3, sfx: 'thunder'
  },
  ice: {
    id: 'iceshard', element: 'ice', name: '氷弾', cost: 20,
    kind: 'projectile', speed: 24, radius: 0.26, life: 1.2, homing: 3.2, count: 3, spread: 0.16,
    damage: 7, posture: 5, mark: 5, slow: { factor: 0.45, time: 3 }, castTime: 0.22, sfx: 'ice'
  }
};

/**
 * Element pair → reaction. The key is the two ids sorted, joined with `+`.
 * `damage` is flat, `radius` makes it an area, `stagger` breaks posture.
 */
export const REACTIONS = {
  'fire+thunder': {
    id: 'blast', name: '爆雷', color: '#ffb040', radius: 3.6, damage: 34, posture: 30,
    knockback: 3.5, launch: true, sfx: 'explosion', shake: 0.35
  },
  'ice+thunder': {
    id: 'frozenShock', name: '凍雷', color: '#9fe8ff', radius: 2.6, damage: 18, posture: 26,
    freeze: 2.4, sfx: 'shatter', shake: 0.18
  },
  'fire+ice': {
    id: 'steam', name: '蒸破', color: '#e8eef4', radius: 3.0, damage: 14, posture: 40,
    stagger: 1.4, sfx: 'steam', shake: 0.14
  }
};

export function reactionKey(a, b) {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}
