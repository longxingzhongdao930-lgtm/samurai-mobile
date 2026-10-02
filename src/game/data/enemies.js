/**
 * The bodies the trial throws at the player, as data.
 *
 * Every type is the same rig (`models/enemyidle.fbx`) driven by the player's
 * own motion, retargeted — what makes one a 足軽妖 and another a 赤鬼 is its
 * size, its colours, what it holds and the numbers below. Attacks use the
 * `Attack` shape with two additions the AI reads: `windupTo`/`windupScale`
 * (the slowed anticipation that telegraphs the blow) and `range` (how close
 * it wants to be to start it). `unblockable` attacks are announced in red.
 */

const ATTACK = {
  enabled: true,
  clipFrom: 0,
  clipTo: 1,
  timeScale: 1,
  windupTo: 0.3,
  windupScale: 0.45,
  standoff: 1.25,
  maxWarp: 1.6,
  warpAt: 0.45,
  turnAt: 0.3,
  lunge: 0.3,
  passThrough: 0,
  recoverAt: 0.95,
  cancelAt: 1,
  blendIn: 0.12,
  blendOut: 0.22,
  reach: 2.1,
  arc: 110,
  damage: 10,
  posture: 8,
  knockback: 0.8,
  knockdown: false,
  unblockable: false,
  range: 2.4,
  cooldown: 1.6
};

const attack = (spec) => ({ ...ATTACK, ...spec });

export const ENEMY_TYPES = {
  ashigaru: {
    id: 'ashigaru',
    name: '足軽妖',
    height: 1.8,
    radius: 0.42,
    hp: 46,
    posture: 34,
    walk: 1.5,
    run: 3.4,
    sight: 16,
    ring: 3.2,
    aggression: 0.55,
    superArmor: false,
    gear: 'blade',
    look: {
      color: '#1c1f28', roughness: 0.78, metalness: 0.15, rimColor: '#ff5a1e', rimPower: 2.6,
      rimEmissive: 1.4, edgeColor: '#ff8a3c', edgeEmissive: 6.0, edgeWidth: 0.12,
      dissolveDetail: 9.0, dissolveRise: 0.45
    },
    attacks: [
      attack({ id: 'cut', clip: 'slashHit', clipFrom: 0.05, clipTo: 0.42, timeScale: 1.2, windupTo: 0.38, windupScale: 0.42, hits: [0.6], damage: 11, range: 2.3 }),
      attack({ id: 'double', clip: 'slashHit', clipFrom: 0.05, clipTo: 0.7, timeScale: 1.3, windupTo: 0.22, windupScale: 0.45, hits: [0.36, 0.7], damage: 8, range: 2.4, cooldown: 2.2 })
    ],
    score: 100
  },
  shinobi: {
    id: 'shinobi',
    name: '忍妖',
    height: 1.7,
    radius: 0.38,
    hp: 34,
    posture: 26,
    walk: 2.2,
    run: 5.2,
    sight: 18,
    ring: 4.4,
    aggression: 0.8,
    evasion: 0.4,
    superArmor: false,
    gear: 'tanto',
    look: {
      color: '#161322', roughness: 0.6, metalness: 0.2, rimColor: '#b45cff', rimPower: 2.2,
      rimEmissive: 1.7, edgeColor: '#c890ff', edgeEmissive: 6.0, edgeWidth: 0.12,
      dissolveDetail: 9.0, dissolveRise: 0.45
    },
    attacks: [
      attack({ id: 'dash', clip: 'crouchSlash', clipFrom: 0.2, clipTo: 0.9, timeScale: 1.5, windupTo: 0.3, windupScale: 0.5, hits: [0.66], standoff: 1.0, maxWarp: 6, passThrough: 1.6, passAt: 0.9, warpAt: 0.62, damage: 12, range: 6.5, cooldown: 2.4 }),
      attack({ id: 'flurry', clip: 'slashHit', clipFrom: 0.07, clipTo: 0.66, timeScale: 1.9, windupTo: 0.2, windupScale: 0.5, hits: [0.36, 0.7], damage: 7, range: 2.2, cooldown: 1.5 })
    ],
    score: 140
  },
  archer: {
    id: 'archer',
    name: '弓妖',
    height: 1.75,
    radius: 0.4,
    hp: 30,
    posture: 22,
    walk: 1.5,
    run: 3.6,
    sight: 26,
    ring: 11,
    aggression: 0.5,
    ranged: true,
    superArmor: false,
    gear: 'bow',
    look: {
      color: '#18211d', roughness: 0.75, metalness: 0.1, rimColor: '#7dff8a', rimPower: 2.4,
      rimEmissive: 1.3, edgeColor: '#a8ff9e', edgeEmissive: 6.0, edgeWidth: 0.12,
      dissolveDetail: 9.0, dissolveRise: 0.45
    },
    attacks: [
      attack({ id: 'shot', clip: 'slashHit', clipFrom: 0.02, clipTo: 0.3, timeScale: 1.0, windupTo: 0.55, windupScale: 0.16, hits: [0.72], lunge: 0, maxWarp: 0, standoff: 99, damage: 10, range: 20, cooldown: 2.8, projectile: { speed: 21, radius: 0.22, color: '#9dff9a' } })
    ],
    score: 120
  },
  oni: {
    id: 'oni',
    name: '赤鬼',
    height: 2.55,
    radius: 0.72,
    hp: 300,
    posture: 140,
    walk: 1.3,
    run: 2.8,
    sight: 20,
    ring: 3.4,
    aggression: 0.75,
    superArmor: true,
    elite: true,
    gear: 'kanabo',
    look: {
      color: '#3a0e0c', roughness: 0.62, metalness: 0.1, rimColor: '#ff2a12', rimPower: 1.9,
      rimEmissive: 2.2, edgeColor: '#ff6a2c', edgeEmissive: 6.0, edgeWidth: 0.12,
      dissolveDetail: 7.0, dissolveRise: 0.45
    },
    attacks: [
      attack({ id: 'smash', clip: 'slashHit', clipFrom: 0.3, clipTo: 0.72, timeScale: 0.95, windupTo: 0.4, windupScale: 0.3, hits: [0.5], damage: 22, posture: 20, reach: 3.2, arc: 80, range: 3.0, knockdown: true, knockback: 2.4, cooldown: 2.4, ring: 2.6 }),
      attack({ id: 'sweep', clip: 'kick', clipFrom: 0.1, clipTo: 0.72, timeScale: 1.0, windupTo: 0.35, windupScale: 0.4, hits: [0.52], damage: 16, reach: 3.4, arc: 200, range: 3.2, knockback: 2.0, cooldown: 2.0 }),
      attack({ id: 'crush', clip: 'land', clipFrom: 0.0, clipTo: 0.6, timeScale: 0.85, windupTo: 0.3, windupScale: 0.35, hits: [0.45], damage: 28, reach: 3.8, arc: 360, range: 3.4, unblockable: true, knockdown: true, knockback: 3.0, cooldown: 3.4, lunge: 1.4, maxWarp: 3.5, ring: 3.8 })
    ],
    score: 600
  }
};
