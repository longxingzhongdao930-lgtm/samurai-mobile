/** Small, bounded assists; none adds an input or a new movement warp. */
export function comboLifetime(hits) {
  return 2.4 + Math.min(0.8, Math.max(0, hits - 1) * 0.1);
}

export function canSwitchInRecovery(player) {
  return player.state === 'attack' && player.move && player.move !== player.execute
    && player.move.phase >= Math.max(0.6, player.move.config.cancelAt);
}

export function combatHint(player) {
  if (player.dead || player.game.form?.active || player.game.cinematic) return '';
  if (player.guarding && player.guardMeter / player.maxGuard < 0.25) return '守りが限界 — ガードを解くか回避';
  if (player.counterWindow > 0) return '反撃の好機 — 攻撃';
  if (player._switchBoost > 0) return '連携準備 — 次の武器攻撃で体幹を崩す';
  if (player.spirit.calm >= 100 && player.weapon.id === 'katana') return '静の居合 — 攻撃を長押し';
  if (player.spirit.dragon >= 100) return '竜爪準備 — 次の命中で発動';
  return '';
}
