import { CREATURES, CAMP_CHARACTERS } from '../../config/creatures.js';
import { ENEMY_TYPES } from './enemies.js';

const roles = {
  samurai: ['黒雨の浪人', '縮地の居合使い', '歩かず縮地で接近し、背後へ回って一閃、納刀する。予備動作を見て回避し、納刀中を狙おう。', '城下町・入口', 'ashigaru'],
  queen: ['剣の女王', '浮遊する剣の支配者', '浮遊する剣を1本ずつこちらへ飛ばす。横回避かタイミングよくガード。3本返すと体幹を崩せる。', '城下町・大通り', 'shinobi'],
  mage: ['影の魔術師', '遠距離の術師', '右手の青い魔法陣から魔弾3発、その後に溜めレーザー。予告線から横へ避け、発射後を狙おう。', '大通り・城門への道', 'archer'],
  achates: ['白翼獣アカテス', '広場の中ボス', '巨体と翼を使って広場を制する。大きな攻撃の後を狙おう。', '城下町・最初の広場', 'oni'],
  dragon: ['銀竜の戦士', '百鬼夜行の強敵', '爪と竜技で周囲を薙ぐ。奥義で変身する銀竜と同じ種の戦士。', '城下町・百鬼夜行', 'oni'],
  infinian: ['異界の守護者', '神社の精鋭', '重い一撃と広い薙ぎ払いを使う守護者。体幹を崩して決着をつけよう。', '廃神社・境内', 'oni']
};
export const TOWN_CHARACTERS = [...CAMP_CHARACTERS, ...CREATURES].map(source => {
  const [name, role, description, location, base] = roles[source.id];
  return { ...source, name, role, description, location, base, procedural: !source.clips };
});
export const TOWN_TYPES = Object.fromEntries(TOWN_CHARACTERS.map(def => {
  const base = ENEMY_TYPES[def.base];
  const elite = !!base.elite;
  const count = def.clips ? Math.min(2, def.clips.attacks.length + 1) : base.attacks.length;
  const attacks = Array.from({ length: count }, (_, i) => ({
    ...base.attacks[i % base.attacks.length], id: `move${i}`, clip: `attack${i}`,
    clipFrom: 0, clipTo: 1, hits: [0.55], windupTo: 0.32, windupScale: 0.6,
    ...(def.id === 'samurai' ? { hits: [0.58], range: 3.6, reach: 2.3, cooldown: 2.6 } : {}),
    ...(def.id === 'queen' ? { flyingSword: true, hits: i === 1 ? [0.3, 0.55, 0.8] : [0.35], range: 18, reach: 18, lunge: 0, cooldown: 2.8 } : {}),
    timeScale: 1, maxWarp: ['samurai', 'queen'].includes(def.id) ? 0 : elite ? 0.8 : 1.4, passThrough: 0,
    ...(def.id === 'mage' ? { projectile: undefined, laser: true, magicSequence: true, hits: [0.18, 0.29, 0.4, 0.76], windupTo: 0.1, windupScale: 0.8, maxWarp: 0, lunge: 0, damage: 16, cooldown: 3.2 } : {})
  }));
  return [def.id, { ...base, id: def.id, name: def.name, appearance: def.id,
    height: elite ? Math.min(def.height, 3.1) : def.height,
    radius: elite ? 0.85 : 0.43, hp: elite ? (def.id === 'infinian' ? 260 : 220) : base.hp,
    ...(def.id === 'queen' ? { ranged: true, ring: 7 } : {}),
    attacks, gear: null, hat: null, horns: null }];
}));
