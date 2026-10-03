import { CREATURES, CAMP_CHARACTERS } from '../../config/creatures.js';
import { ENEMY_TYPES } from './enemies.js';

const roles = {
  samurai: ['黒雨の浪人', '城下町の前衛', '間合いを詰めて刀を振るう。光る予備動作を見て、ガードか回避で応じよう。', '城下町・入口', 'ashigaru'],
  queen: ['剣の女王', '連撃の剣士', '鋭い斬撃を重ねる剣士。連撃の終わりが反撃の好機。', '城下町・大通り', 'shinobi'],
  mage: ['影の魔術師', '遠距離の術師', '距離を保ちながら紫の魔弾を放つ。横へ避けてから懐に入ろう。', '大通り・城門への道', 'archer'],
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
    ...(def.id === 'queen' && i === 1 ? { hits: [0.42, 0.72] } : {}),
    timeScale: 1, maxWarp: elite ? 0.8 : 1.4, passThrough: 0,
    ...(def.id === 'mage' ? { projectile: { speed: 16, radius: 0.28, color: '#bb8aff' }, damage: 12 } : {})
  }));
  return [def.id, { ...base, id: def.id, name: def.name, appearance: def.id,
    height: elite ? Math.min(def.height, 3.1) : def.height,
    radius: elite ? 0.85 : 0.43, hp: elite ? (def.id === 'infinian' ? 260 : 220) : base.hp,
    attacks, gear: null, hat: null, horns: null }];
}));
