export const DRAGON_CLIPS = Object.freeze({
  idle: 'Btl_Std01', walk: 'Btl_Walk01', run: 'Btl_Run01',
  attacks: ['Btl_Atk01', 'Btl_Atk02', 'Btl_Atk03', 'Btl_Atk04'],
  skills: Array.from({ length: 8 }, (_, i) => `Btl_Skl0${i + 1}`),
  hits: ['Dmg_Hit01', 'Dmg_Hit02'],
  deaths: ['Dmg_Die01', 'Dmg_Die02', 'Dmg_Die03'],
  stuns: ['Dmg_Stu01', 'Dmg_Stu02', 'Dmg_Stu03']
});
const inf = (name) => `Mon_Infinian_001_${name}`;

/** Multipart actions play in order before handing control back to idle. */
export const CREATURES = Object.freeze([
  {
    id: 'dragon', label: 'Silver Dragon', url: './models/dragon/silver-dragon.glb',
    clips: DRAGON_CLIPS,
    rootTracks: [{ name: 'Root.position', axes: [0, 2] }],
    facingBones: [['Foot_L', 'ball_l'], ['Foot_R', 'ball_r']],
    height: 4.2, bodyRadius: 1.0, hitsToDefeat: 4,
    walkSpeed: 1.2, runSpeed: 3.6, attackRange: 2.7, attackCooldown: 3.2
  },
  {
    id: 'achates', label: 'Achates', url: './models/creatures/achates.glb',
    clips: {
      idle: 'idle_battle_1', walk: 'walk_normal_1', run: 'run_battle_1',
      attacks: ['att_battle_1_01', ['att_battle_2_01', 'att_battle_2_02'],
        ['att_battle_3_01', 'att_battle_3_02', 'att_battle_3_03', 'att_battle_3_04']],
      skills: ['att_battle_4_01', 'att_battle_7_01', 'att_battle_10_01'],
      hits: [['dmg_critical_start_1', 'dmg_critical_end_1']],
      deaths: ['dead_1'], stuns: [['abn_groggy_start_1', 'abn_groggy_loop_1', 'abn_groggy_end_1']]
    },
    // These source rigs retain Z-up bone-local coordinates under a rotated root.
    rootTracks: [{ name: 'b_root_01.position', axes: [0, 1] }, { name: 'bip001_03.position', axes: [0, 1] }],
    facingBones: [['bip001-pelvis_04', 'bip001-head_010']],
    height: 3.1, bodyRadius: 1.2, hitsToDefeat: 5,
    walkSpeed: 1.5, runSpeed: 4.2, attackRange: 3.0, attackCooldown: 4
  },
  {
    id: 'infinian', label: 'Infinian', url: './models/creatures/infinian.glb',
    clips: {
      idle: inf('CombatIdle'), walk: inf('Walk'), run: inf('Run'),
      attacks: [inf('NormalAttcak01')],
      skills: [inf('Skill01'), inf('Skill02'), [inf('Skill03_Up'), inf('Skill03_Down')], inf('Skill04'), inf('Skill05'), inf('Skill06')],
      hits: [], deaths: [inf('Die')], stuns: []
    },
    rootTracks: [{ name: 'ROOT_02.position', axes: [0, 1] }, { name: 'Bip001_03.position', axes: [0, 1] }],
    facingBones: [['Bip001-L-Foot_0111', 'Bip001-L-Toe0_0112'], ['Bip001-R-Foot_0115', 'Bip001-R-Toe0_0116']],
    height: 3.8, bodyRadius: 1.0, hitsToDefeat: 6,
    walkSpeed: 1.0, runSpeed: 3.0, attackRange: 2.8, attackCooldown: 4.5
  }
]);

export const CAMP_CHARACTERS = Object.freeze([
  { id: 'queen', label: 'Queen of Swords', role: 'Camp guardian', url: './models/characters/queen.glb', clip: 'human|humanAction', height: 1.9, x: -7, z: -3 },
  { id: 'samurai', label: 'Samurai', role: 'Training companion', url: './models/characters/samurai.glb', clip: 'Take 001', height: 1.85, x: -10, z: 1 },
  { id: 'mage', label: 'Shadowkin Mage', role: 'Ritual keeper', url: './models/characters/mage.glb', clip: 'Armature|ActionPose', height: 1.95, x: -7, z: 5 }
]);
