/** Bounded framing keeps the player nearby while making room for tall enemies. */
export function lockFraming(player, target, aspect = 1.6) {
  if (!target?.alive) return { x: 0, y: 0, z: 0, distance: 0 };
  const dx = target.position.x - player.x, dz = target.position.z - player.z;
  const gap = Math.hypot(dx, dz);
  const height = target.height ?? target.agent?.type.height ?? 1.8;
  const large = Math.max(0, height - 1.8);
  const shift = Math.min(2, gap * 0.22);
  return {
    x: gap > 0 ? dx / gap * shift : 0,
    y: Math.min(1.1, large * 0.4),
    z: gap > 0 ? dz / gap * shift : 0,
    distance: Math.min(4.5, large * 1.2 + Math.max(0, gap - 4) * 0.18 + (aspect < 1 ? 0.8 : 0))
  };
}
