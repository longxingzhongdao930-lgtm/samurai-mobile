import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';
import { SOUL } from './Souls.js';

/**
 * 鬼武将 羅刹 — the boss.
 *
 * The body is an enemy of kind `boss` (armour, a deep stance, heavy
 * telegraphed swings — `settings.enemyKinds.boss`); this class is the state
 * machine on top of it, after the references: phases by health threshold
 * (BossBattle's amused → irritated → grrr), each quicker and meaner than the
 * last (veilspire's enrage), with its big moves chosen per phase and every one
 * of them announced before it lands.
 *
 *  - **一 (100–66%)** — the heavy swings only.
 *  - **二 (66–33%)** — adds 地割り (slam): a warning disc under the player,
 *    then the ground goes up there. Not guardable; step out of it.
 *  - **三 (<33%)** — quicker still; adds 雷雨 (three strikes walking after the
 *    player, each warned) and 百矢 (a fan of arrows, guard or parry them), and
 *    calls two retainers the moment the phase begins.
 *
 * Each phase change is a roar: a shockwave shoves the player off, the stance
 * refills, and the speed and wind-ups change. Felled, it bursts into souls.
 *
 * The entrance is its own beat (`INTRO` seconds): the lens locks onto it and
 * pulls back to take in its size, the name comes up, it roars once, and only
 * then does it move — the player is never struck while being introduced.
 */
const INTRO = 3.4;
export class Boss {
  /**
   * @param {import('../core/App.js').App} app
   * @param {import('./Enemy.js').Enemy} enemy a body already set to kind 'boss'
   * @param {{onDefeated?: () => void}} [hooks]
   */
  constructor(app, enemy, hooks = {}) {
    this.app = app;
    this.enemy = enemy;
    this.hooks = hooks;
    // Its own copy of the numbers, so the phases can change them.
    enemy.kindCfg = { ...settings.enemyKinds.boss };
    this.base = settings.enemyKinds.boss;
    this.phase = 1;
    this.special = null;
    this.nextSpecial = 6;
    this.t = 0;
    this.defeated = false;
    this.adds = [];

    // The bar: name, health with the phase marks, and the stance under it.
    this.hud = document.createElement('div');
    this.hud.className = 'boss-hud';
    this.hud.innerHTML =
      '<p class="boss-hud__name">鬼武将 · 羅刹</p>' +
      '<div class="boss-hud__track"><i class="boss-hud__fill"></i><b style="left:33.3%"></b><b style="left:66.6%"></b></div>' +
      '<div class="boss-hud__stance"><i></i></div>';
    document.body.appendChild(this.hud);
    this.fill = this.hud.querySelector('.boss-hud__fill');
    this.stance = this.hud.querySelector('.boss-hud__stance i');

    // 難易度 scales its health (`App#_applyDifficulty`).
    const hpScale = app.difficulty?.bossHp ?? 1;
    enemy.maxHealth = enemy.health = Math.max(1, Math.round(enemy.maxHealth * hpScale));

    // The entrance.
    this.intro = INTRO;
    this._roared = false;
    this.hud.classList.add('is-intro');
    app.lockOn.lock(enemy);
    app.music?.setPhase(1);
  }

  get fraction() {
    return Math.max(0, this.enemy.health) / this.enemy.maxHealth;
  }

  update(dt) {
    if (this.defeated) return;
    const app = this.app;
    const e = this.enemy;
    this.t += dt;
    this.fill.style.transform = `scaleX(${this.fraction.toFixed(3)})`;
    this.stance.style.transform = `scaleX(${(e.posture / e.postureMax).toFixed(3)})`;

    if (!e.alive) {
      this._defeat();
      return;
    }

    // The entrance: held, locked, one roar, then the fight.
    if (this.intro > 0) {
      this.intro -= dt;
      e._ai.state = 'recover';
      e._ai.wait = Math.max(e._ai.wait, 0.3);
      if (!this._roared && this.intro < INTRO - 0.5) {
        this._roared = true;
        const p = e.position;
        app.audio.roar({ x: p.x, y: p.y + 2, z: p.z }, 1.5);
        app.haptics?.pulse([120, 60, 160]);
        app.rig.shake(0.35);
        app.fx.ring(p.x, p.y, p.z, getColor(settings.vfx.omen.color), 5, 0.7);
        if (!app.lockOn.active) app.lockOn.lock(e);
      }
      if (this.intro <= 0) this.hud.classList.remove('is-intro');
      return;
    }

    // Phases, by what is left of it.
    const f = this.fraction;
    if (this.phase === 1 && f <= 2 / 3) this._enter(2);
    else if (this.phase === 2 && f <= 1 / 3) this._enter(3);

    // A big move in progress: its warning, then the blow.
    if (this.special) {
      const s = this.special;
      s.t += dt;
      // Held in place for the big move: no swings over the top of it.
      if (!e.attacking) {
        e._ai.state = 'recover';
        e._ai.wait = Math.max(e._ai.wait, 0.2);
      }
      e._telegraph = 1;
      s.step(s);
      if (s.done) {
        this.special = null;
        e._telegraph = 0;
      }
      return;
    }

    // Choose one when it is free to: not reeling, not mid-swing.
    this.nextSpecial -= dt;
    if (this.phase >= 2 && this.nextSpecial <= 0 && !e.attacking && e.staggerTime <= 0 && !app.playerDown) {
      const moves = this.phase === 3 ? ['slam', 'thunder', 'volley'] : ['slam'];
      this._begin(moves[Math.floor(Math.random() * moves.length)]);
      this.nextSpecial = this.phase === 3 ? 5 : 7;
    }
  }

  _enter(phase) {
    const app = this.app;
    const e = this.enemy;
    const cfg = e.kindCfg;
    this.phase = phase;
    // Quicker, shorter tells, more often.
    cfg.speed = this.base.speed * (phase === 2 ? 1.25 : 1.5);
    cfg.telegraph = this.base.telegraph * (phase === 2 ? 0.9 : 0.8);
    cfg.cooldown = this.base.cooldown * (phase === 2 ? 0.8 : 0.6);
    e.posture = e.postureMax;
    this.nextSpecial = 2.5;
    // The roar: a ring that throws the player off, the screen shaking.
    const p = e.position;
    const red = getColor(settings.vfx.omen.color);
    app.fx.ring(p.x, p.y, p.z, red, 6, 0.6);
    app.fx.pillar(p.x, p.y, p.z, red, 1.6, 7, 0.9);
    app.rig.shake(0.4);
    app.audio.roar({ x: p.x, y: p.y + 2, z: p.z }, 1.3);
    app.haptics?.pulse([100, 50, 140]);
    // The world catches its breath with it, and the edges of the screen go red.
    app._hitStop = Math.max(app._hitStop, 0.35);
    app._hitStopScale = 0.25;
    app._hitRelease = 0;
    const flash = app._hurtFlash;
    if (flash) {
      flash.classList.remove('is-on');
      void flash.offsetWidth;
      flash.classList.add('is-on');
    }
    app.music?.setPhase(phase);
    this.hud.dataset.phase = String(phase);
    const c = app.character.position;
    const dx = c.x - p.x;
    const dz = c.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 6) app.controller.knock(dx / d, dz / d, 5);
    app.toast.show(phase === 2 ? '羅刹 — 怒り' : '羅刹 — 狂乱', 1400);
    if (phase === 3) {
      // Two retainers answer the roar.
      for (const [side, kind] of [[-1, 'ninja'], [1, 'grunt']]) {
        const add = app.enemies.spawnAt(p.x + side * 3, p.z - 1, kind, e.facing);
        if (add) this.adds.push(add);
      }
    }
  }

  _begin(kind) {
    const app = this.app;
    const e = this.enemy;
    const c = app.character.position;
    const red = getColor(settings.vfx.omen.color);
    app.toast.show({ slam: '大技 — 地割り', thunder: '大技 — 雷雨', volley: '大技 — 百矢' }[kind], 900);
    if (kind === 'slam') {
      // Where the player stands now, warned for a second, then the ground goes up.
      const x = c.x;
      const z = c.z;
      const r = 3.2;
      app.fx.omen(x, app.terrain.heightAt(x, z), z, red, r, 1.1);
      this.special = {
        t: 0,
        step: (s) => {
          if (s.t < 1.1 || s.done) return;
          s.done = true;
          this._blast(x, z, r, 1.4);
        }
      };
    } else if (kind === 'thunder') {
      // Three strikes walking after the player, each warned.
      this.special = {
        t: 0,
        n: 0,
        next: 0,
        pending: [],
        step: (s) => {
          if (s.n < 3 && s.t >= s.next) {
            const p = app.character.position;
            const x = p.x + (Math.random() - 0.5) * 1.5;
            const z = p.z + (Math.random() - 0.5) * 1.5;
            app.fx.omen(x, app.terrain.heightAt(x, z), z, getColor('#8fd4ff'), 2.2, 0.8);
            s.pending.push({ x, z, at: s.t + 0.8 });
            s.n++;
            s.next = s.t + 0.55;
          }
          for (const strike of s.pending) {
            if (strike.done || s.t < strike.at) continue;
            strike.done = true;
            const y = app.terrain.heightAt(strike.x, strike.z);
            app.fx.bolt(strike.x, y + 10, strike.z, strike.x, y, strike.z, getColor('#8fd4ff'), 1, 0.35);
            this._blast(strike.x, strike.z, 2.2, 1);
          }
          if (s.n >= 3 && s.pending.every((x) => x.done)) s.done = true;
        }
      };
    } else {
      // A fan of five arrows from the boss, after a drawn-out aim.
      this.special = {
        t: 0,
        step: (s) => {
          if (s.t < 0.9 || s.done) return;
          s.done = true;
          const p = app.character.position;
          const from = e.position.clone();
          from.y += 2.6;
          const base = Math.atan2(p.x - from.x, p.z - from.z);
          const d = Math.hypot(p.x - from.x, p.z - from.z);
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.12;
            const to = from.clone();
            to.x += Math.sin(a) * d;
            to.z += Math.cos(a) * d;
            to.y = p.y + app.character.height * 0.6;
            app.projectiles.fire(e, from, to, 22, false);
          }
          app.audio.swing(from, 1);
        }
      };
    }
  }

  /** The ground goes up at (x, z): unguardable, for anyone standing in it. */
  _blast(x, z, radius, scale) {
    const app = this.app;
    const y = app.terrain.heightAt(x, z);
    const red = getColor(settings.vfx.omen.color);
    app.fx.ring(x, y, z, red, radius * 1.3, 0.45);
    app.fx.pillar(x, y, z, red, radius * 0.5, 3, 0.5);
    app.musouShock?.burst(x, z, settings.musou.shock, 0.6);
    app.rig.shake(0.3);
    app.audio.impact({ x, y: y + 1, z }, { cut: false, strength: 1.3 });
    const p = app.character.position;
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.hypot(dx, dz);
    if (d > radius || app._invuln > 0 || app.playerDown) return;
    const k = d > 1e-3 ? 1 / d : 0;
    app._takeHit(this.enemy, dx * k || 0, dz * k || 1, scale);
  }

  _defeat() {
    if (this.defeated) return;
    this.defeated = true;
    const app = this.app;
    const p = this.enemy.position;
    // A storm of souls.
    for (let i = 0; i < 5; i++) {
      const kinds = Array(8).fill(SOUL.RED);
      kinds.push(SOUL.YELLOW, SOUL.BLUE);
      app.souls.drop(p.x + (Math.random() - 0.5) * 2, p.y + 1.5, p.z + (Math.random() - 0.5) * 2, kinds);
    }
    app.fx.pillar(p.x, p.y, p.z, getColor('#ffd28a'), 2, 9, 1.4);
    app.fx.ring(p.x, p.y, p.z, getColor('#ffd28a'), 8, 0.8);
    app._hitStop = Math.max(app._hitStop, 0.6);
    app._hitStopScale = 0.05;
    app._hitRelease = 0;
    app.toast.show('鬼武将 羅刹 — 討伐', 2000);
    // The retainers go with it.
    for (const add of this.adds) if (add.alive) app.enemies.kill(add, 0, 1, settings.kick);
    this.hud.classList.add('is-gone');
    app.lockOn.release();
    this.hooks.onDefeated?.();
  }

  dispose() {
    this.hud.remove();
  }
}
