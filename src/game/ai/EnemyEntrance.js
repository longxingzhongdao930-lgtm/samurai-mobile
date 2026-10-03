const STYLES = {
  achates: { color: '#d6eeff', title: '白翼、降り立つ', lift: 1.8 },
  dragon: { color: '#95d5ff', title: '銀竜、黒雨を裂く', lift: 0.8 },
  infinian: { color: '#b690ff', title: '異界の門が開く', lift: -1.1 }
};

export function beginEntrance(game, agent) {
  const style = STYLES[agent.type.id];
  if (!style) return;
  const enemy = agent.enemy;
  agent.entrance = { remaining: 1.4, duration: 1.4, baseY: enemy.model.position.y, ...style };
  enemy.model.position.y += style.lift;
  agent.cooldown = Math.max(agent.cooldown, 1.8);
  game.hud.areaCard(agent.type.name, style.title, 2.2);
  game.audio.play(agent.type.id === 'infinian' ? 'bell' : 'roar', { pos: enemy.position, volume: 0.65 });
  game.fx.slam(enemy.position, agent.type.radius * 2.5, style.color);
  game.fx.glow.burst(enemy.position, style.color, 20, { speed: 2.8, size: 0.15, life: 1.3, up: 1.8, gravity: -1 });
}

/** Returns true while this enemy's entrance owns its body (never the player). */
export function updateEntrance(agent, dt) {
  const entry = agent.entrance;
  if (!entry) return false;
  entry.remaining = Math.max(0, entry.remaining - dt);
  const t = entry.remaining / entry.duration;
  agent.enemy.model.position.y = entry.baseY + entry.lift * t * t;
  if (entry.remaining === 0) {
    agent.entrance = null;
    agent.game.fx.dust(agent.position, 1.2);
    agent.game.rig.shake(0.12);
  }
  return true;
}
