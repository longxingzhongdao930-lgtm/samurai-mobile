import { RASETSU } from './Rasetsu.js';

export const GWYN_APPEARANCE = {
  id: 'gwyn', label: 'Gwyn, Lord of Cinder', url: './models/bosses/gwyn.glb',
  clip: 'Gwyn|Action', procedural: true, authoredIdle: true,
  boneAliases: { LeftHand: 'L_Hand_019', RightHand: 'R_Hand_054' },
  attackProfiles: [
    { name: 'sweep', duration: 1.6, hits: [0.55], style: 'sweep' },
    { name: 'smash', duration: 1.8, hits: [0.55], style: 'overhead' },
    { name: 'charge', duration: 1.4, hits: [0.6], style: 'thrust' },
    { name: 'breaker', duration: 1.2, hits: [0.55], style: 'kick' },
    { name: 'flameSlam', duration: 1.9, hits: [0.55], style: 'overhead' },
    { name: 'fireFan', duration: 1.6, hits: [0.65], style: 'cast' },
    { name: 'frenzy', duration: 2.8, hits: [0.28, 0.46, 0.64, 0.82], style: 'sweep' },
    { name: 'cataclysm', duration: 2.8, hits: [0.65], style: 'cast' }
  ]
};
export const GWYN = {
  ...RASETSU, id: 'gwyn', appearance: 'gwyn', name: '薪の王・グウィン',
  height: 2.65, radius: 0.8, hp: 1400, gear: null, horns: null,
  ultimateName: '最後の火', phaseNames: ['熾火の剣', '燃え尽きぬ意志'],
  attacks: RASETSU.attacks.map(spec => {
    const profile = GWYN_APPEARANCE.attackProfiles.find(p => p.name === spec.id);
    return { ...spec, clip: spec.id, clipFrom: 0, clipTo: 1,
      timeScale: 1, windupTo: 0.22, windupScale: spec.ultimate ? 0.4 : 0.65,
      hits: profile.hits, maxWarp: Math.min(spec.maxWarp, 8),
      ...(spec.id === 'charge' ? { warpAt: 0.6 } : {}) };
  })
};
