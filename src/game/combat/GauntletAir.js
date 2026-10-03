export function canLaunch(agent, opening = false) {
  return !!agent?.alive && !agent.type.elite && !agent.type.boss && !(agent.airRecovery > 0)
    && (agent.type.id !== 'queen' || opening);
}

/** One bounded air exchange. Ground coordinates stay under the collision controller. */
export class GauntletAir {
  constructor(player) { this.player = player; this.game = player.game; this.state = 'idle'; this.reset(); }
  get active() { return this.state !== 'idle'; }
  get airborne() { return this.active && this.state !== 'window'; }
  get phase() { return Math.min(1, this.t / 0.32); }
  launch(enemy, opening = false) {
    if (this.active || !canLaunch(enemy.agent, opening)) return false;
    this.target = enemy;
    this.state = 'window'; this.t = 0; this.total = 0; this.hits = 0;
    const agent = enemy.agent;
    for (const move of agent.moves) move.cancel();
    agent.move = null; agent.airControlled = true;
    agent.velocity.x = agent.velocity.z = 0;
    agent._knock.x = agent._knock.z = 0;
    agent.kneel.stop(); agent.fall.stop();
    this.game.director.releaseToken(agent);
    this.game.hud.notice('攻撃で空中追撃', 0.9);
    return true;
  }
  _begin(state) {
    this.state = state; this.t = 0; this.struck = false;
    this.fromHeight = this.player.character.airHeight ?? 0;
    this.enemyFromHeight = this.target?.airHeight ?? 0;
  }
  _height(playerHeight, enemyHeight) {
    this.player.character.airHeight = Math.max(0, playerHeight);
    if (this.target) {
      this.target.airHeight = Math.max(0, enemyHeight);
      const p = this.target.position;
      p.y = (this.game.app.terrain.heightAt(p.x, p.z) ?? 0) + this.target.airHeight;
    }
  }
  _follow() {
    for (const move of this.player.moves) move.cancel();
    this.player._cancelPoses(); this.player.move = null; this.player.state = 'air';
    this.player._gauntletCharged = false;
    this._begin('rise');
    this.player.dodgePose.hold(0.35); // tuck the knees while the hands are driven by WeaponMotion
    this.game.audio.play('dodge', { pitch: 1.2 });
  }
  _hit(slam = false) {
    const target = this.target, p = this.player, origin = p.character.position;
    if (!target?.alive) return;
    const dx = target.position.x - origin.x, dz = target.position.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > 3 || (!slam && Math.abs((target.airHeight ?? 0) - (origin.y - this.game.app.terrain.heightAt(origin.x, origin.z))) > 1.7)) return;
    const result = this.game.damageEnemy(target, { damage: slam ? 24 : 8, posture: slam ? 28 : 7,
      dirX: dx / (d || 1), dirZ: dz / (d || 1), knockback: 0, heavy: slam, source: 'melee',
      force: { slices: false, impulse: 1, lift: 0, spin: 0.2 }, launch: false });
    if (result?.damage > 0) {
      p.hitCombo++; p.stats.maxCombo = Math.max(p.stats.maxCombo, p.hitCombo); p._hitComboTimer = 2.4;
      p.special = Math.min(1, p.special + 0.025); p.mp = Math.min(p.maxMp, p.mp + 1.6);
      this.game.audio.play(slam ? 'slam' : 'kick'); this.game.hitStop(slam ? 0.09 : 0.035, 0.1);
      this.game.rig.shake(slam ? 0.16 : 0.04);
    }
  }
  update(dt, input) {
    if (!this.active) return false;
    this.t += dt; this.total += dt;
    if (this.player.dead || this.player.weapon.id !== 'gauntlet' || this.game.form.active) { this.reset(); return false; }
    if (this.state === 'window') {
      this._height(0, Math.sin(Math.min(1, this.t / 0.8) * Math.PI) * 2.2);
      if (this.target?.alive && input.consume('attack')) this._follow();
      else if (this.t >= 0.8 || !this.target?.alive) this._begin('land');
      return this.airborne;
    }
    if ((this.total > 2.8 || !this.target?.alive || ['hurt', 'down'].includes(this.player.state)) && !['land', 'slam'].includes(this.state)) this._begin('land');
    if (input.consume('dodge') && !['land', 'slam'].includes(this.state)) {
      this.escape = true; this.player.invulnerable = Math.max(this.player.invulnerable, 0.25); this._begin('land');
    }
    for (const name of ['special', 'magic', 'guard', 'weapon']) input.consume(name);
    if (this.state === 'rise') {
      const u = Math.min(1, this.t / 0.28), eased = 1 - (1 - u) ** 2;
      this._height(2.1 * eased, this.enemyFromHeight + (2.25 - this.enemyFromHeight) * eased);
      const pos = this.player.character.position, to = this.target.position;
      const dx = to.x - pos.x, dz = to.z - pos.z, d = Math.hypot(dx, dz);
      const step = Math.min(Math.max(0, d - 1.2), dt * 6);
      if (d > 0.01) { pos.x += dx / d * step; pos.z += dz / d * step; this.player._faceToward(to.x, to.z); }
      this.game.stage?.collide(pos, 0.38);
      if (u === 1) this._begin('ready');
    } else if (this.state === 'ready') {
      this._height(2.1, 2.25);
      if (input.held.attack && input.holdTime.attack >= 0.3) this.charged = true;
      if (this.charged && !input.held.attack) { this.charged = false; this._begin('slam'); }
      else if (this.hits < 2 && input.consume('attack')) { this.pose = this.hits === 0 ? 'air1' : 'air2'; this._begin('punch'); }
      else if (this.t > (this.hits >= 2 ? 0.4 : 0.65)) this._begin(this.hits >= 2 ? 'slam' : 'land');
    } else if (this.state === 'punch') {
      this._height(2.1, 2.25);
      if (input.held.attack && input.holdTime.attack >= 0.3) this.charged = true;
      if (!this.struck && this.t >= 0.16) { this.struck = true; this.hits++; this._hit(); }
      if (this.t >= 0.32) this._begin('ready');
    } else {
      const slam = this.state === 'slam', duration = slam ? 0.32 : 0.38;
      const u = Math.min(1, this.t / duration);
      this.pose = slam ? 'airSlam' : null;
      this._height(this.fromHeight * (1 - u * u), this.enemyFromHeight * (1 - u * u));
      if (this.escape) {
        const pos = this.player.character.position;
        pos.x -= Math.sin(this.player.character.facing) * dt * 3;
        pos.z -= Math.cos(this.player.character.facing) * dt * 3;
        this.game.stage?.collide(pos, 0.38);
      }
      if (u === 1) {
        if (slam) { this._hit(true); this.game.fx.slam(this.player.character.position, 2.2, '#e8cb96'); }
        this.game.fx.dust(this.player.character.position, slam ? 1.2 : 0.5);
        this.reset();
      }
    }
    return true;
  }
  reset() {
    if (this.target) {
      this.target.airHeight = 0;
      const pos = this.target.position;
      pos.y = this.game.app.terrain.heightAt(pos.x, pos.z);
      const agent = this.target.agent;
      if (agent) {
        agent.airControlled = false; agent.airRecovery = 1.4;
        if (agent.alive && agent.state !== 'broken') { agent.state = 'down'; agent.stateTime = 0; agent.timer = 0.8; agent.cooldown = 1.4; }
      }
    }
    this.player.character.airHeight = 0;
    if (this.player.state === 'air') this.player._toFree();
    this.player.dodgePose?.stop();
    if (this.active) this.player.input?.consume('attack');
    this.target = null; this.state = 'idle'; this.pose = null; this.t = 0; this.total = 0;
    this.hits = 0; this.escape = false; this.charged = false;
  }
}
