import { RASETSU } from './Rasetsu.js';
const clip = name => `Qishilong_${name}`;
export const DRAGON_APPEARANCE = {
  id: 'tarislandDragon', label: 'Tarisland Dragon', url: './models/bosses/tarisland-dragon.glb',
  facingBones: [['Bip001-Pelvis_04', 'Bip001-Head_011']],
  rootTracks: [{ name: 'Bip001_03.position', axes: [0, 1] }],
  boneAliases: { LeftHand: 'Bip001-Head_011', RightHand: 'Bip001-Head_011' },
  clips: { idle: clip('stand'), walk: clip('walk'), run: clip('walk'),
    attacks: [clip('attack01'), clip('attack02')], skills: [clip('skill02'), clip('skill05'), clip('skill07'), clip('skill08'), clip('skill11')],
    hits: [clip('down')], stuns: [clip('down01')], deaths: [clip('die')] },
  motionMap: { sweep: clip('attack01'), smash: clip('attack02'), charge: clip('skill07'), breaker: clip('skill08'),
    flameSlam: clip('skill05'), fireFan: clip('skill02'), frenzy: clip('attack01'), cataclysm: clip('skill11'), flight: clip('fly2') }
};
export const TARISLAND_DRAGON = {
  ...RASETSU, id: 'tarislandDragon', appearance: 'tarislandDragon', name: '黒雨の古竜',
  height: 5.2, radius: 1.6, hp: 1500, walk: 1.4, run: 3.5, ring: 4.2,
  gear: null, horns: null, ultimateName: '黒雨を裂く咆哮', phaseNames: ['竜炎覚醒', '終焉の翼'],
  attacks: RASETSU.attacks.map(spec => ({ ...spec, clip: spec.id, clipFrom: 0, clipTo: 1,
    timeScale: ['sweep', 'smash', 'frenzy', 'fireFan'].includes(spec.id) ? 1.8 : 1,
    windupTo: 0.2, windupScale: spec.ultimate ? 0.4 : 0.8, standoff: spec.projectile ? 99 : 3,
    maxWarp: Math.min(spec.maxWarp, 6), passThrough: 0,
    reach: Math.max(spec.reach, 4.6), range: Math.max(spec.range, 5),
    hits: spec.id === 'frenzy' ? [0.4, 0.62] : [spec.projectile ? 0.55 : 0.5],
    ...(spec.projectile ? { originBone: 'Bip001-Head_011' } : {})
  }))
};
