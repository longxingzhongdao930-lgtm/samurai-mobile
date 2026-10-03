export const BLESSINGS = Object.freeze([
  { id: 'flow', name: '流水の加護', detail: '弾き成功で霊力を12回復', glyph: '流' },
  { id: 'link', name: '連携の加護', detail: '持ち替え追撃の体幹ダメージ +8', glyph: '繋' },
  { id: 'blade', name: '刃の加護', detail: '斬撃と竜の爪の威力 +15%', glyph: '刃' },
  { id: 'step', name: '影の加護', detail: '回避の無敵時間 +0.06秒', glyph: '影' },
  { id: 'dragon', name: '竜の加護', detail: '奥義の竜化時間 +4秒', glyph: '竜' }
]);
export const SHRINES = ['road', 'sanctum'];

/** Per-run choices, included in checkpoints. No mutation of shared weapon data. */
export class Blessings {
  constructor() { this.choices = new Map(); }
  choose(shrine, id) {
    if (!SHRINES.includes(shrine) || this.choices.has(shrine) || !BLESSINGS.some(b => b.id === id)) return false;
    this.choices.set(shrine, id);
    return true;
  }
  count(id) { return [...this.choices.values()].filter(value => value === id).length; }
  get damageMultiplier() { return 1 + this.count('blade') * 0.15; }
  get dodgeBonus() { return this.count('step') * 0.06; }
  get parryMp() { return this.count('flow') * 12; }
  get linkBonus() { return this.count('link') * 8; }
  get dragonBonus() { return this.count('dragon') * 4; }
  snapshot() { return [...this.choices].map(pair => [...pair]); }
  restore(snapshot = []) {
    this.choices.clear();
    for (const [shrine, id] of snapshot) this.choose(shrine, id);
  }
}
