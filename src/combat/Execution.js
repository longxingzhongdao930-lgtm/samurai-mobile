import { Vector3 } from 'three';

import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';
import { PhantomBlades } from '../vfx/PhantomBlades.js';

const _head = new Vector3();

/**
 * 処刑 (execution) and 飛燕 (hien) — the katana's two set pieces.
 *
 * **処刑** — a body whose stance is broken, or that is still reeling from a
 * parry, can be finished: the attack button (J / left click / 攻) near it
 * becomes an execution. The player closes on it with the slash hit, five
 * katanas of light stand up round it and circle, closing and speeding up, and
 * then all go in at once: the world freezes, a column of violet goes up, three
 * cuts of light cross the body and it falls apart. The idea is the reference's
 * Shadow Execution (a ring of blades that winds up, then one simultaneous
 * impact), rebuilt at a fraction of its layers so it runs on a phone: one
 * instanced mesh for the blades and the shared flash / miasma pools for the rest.
 *
 * **飛燕** — the reference's thrown cut (Sword Combo's opening beats): `B` (飛燕
 * on a phone) plays the slash and throws a crescent of edge across the ground
 * at the body in front, up to `range` metres off. The blow is dealt when the
 * crescent *arrives*, not when it is thrown, so it reads as a projectile.
 *
 * The app owns what a blow means; this class owns the timing and the look.
 */
export class Execution {
  /** @param {import('../core/App.js').App} app */
  constructor(app) {
    this.app = app;
    this.blades = new PhantomBlades(5);
    app.scene.add(this.blades.mesh);
    /** The execution running, or null. */
    this.active = null;
    /** Crescents in flight: { target, x, z, dirX, dirZ, at } */
    this._flying = [];
    this._hienReadyAt = 0;
    this._hienPending = null;

    // The prompt: 処刑 over the head of whoever can be finished.
    this.marker = document.createElement('div');
    this.marker.className = 'exec-marker';
    this.marker.textContent = '処刑';
    this.marker.hidden = true;
    document.body.appendChild(this.marker);
    /** Who the prompt is over this frame (and who an attack press would finish). */
    this.candidate = null;
  }

  /* ------------------------------------------------------------------ */
  /* 処刑                                                                */
  /* ------------------------------------------------------------------ */

  /** Whether `enemy` can be finished right now. */
  executable(enemy) {
    if (!enemy?.alive) return false;
    if (enemy.postureBroken) return true;
    return settings.execution.afterParry && this.app.elapsed < (enemy._parriedUntil ?? -1);
  }

  /** The nearest body in front that can be finished, or null. */
  findCandidate() {
    const cfg = settings.execution;
    const app = this.app;
    if (!cfg.enabled || this.active || app.pvp?.active || app.playerDown) return null;
    const p = app.character.position;
    const f = app.character.facing;
    const half = Math.cos((cfg.arc * Math.PI) / 360);
    let best = null;
    let bestD = cfg.range;
    for (const enemy of app.enemies.enemies) {
      if (!this.executable(enemy)) continue;
      const dx = enemy.position.x - p.x;
      const dz = enemy.position.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      if (d > 0.3 && (dx * Math.sin(f) + dz * Math.cos(f)) / d < half) continue;
      best = enemy;
      bestD = d;
    }
    return best;
  }

  /** Begin finishing `enemy`. */
  start(enemy) {
    const app = this.app;
    const cfg = settings.execution;
    if (!enemy || this.active) return false;
    const move = app.character.slashHit;
    this.active = { enemy, t: 0, struck: false, spin: Math.random() * Math.PI * 2 };
    // The body is held where it stands until the blades are done with it.
    enemy.staggerTime = Math.max(enemy.staggerTime, cfg.duration + 0.5);
    app._scripted = true;
    app._invuln = Math.max(app._invuln, cfg.duration + 0.3);
    const p = app.character.position;
    app.character.setFacing(Math.atan2(enemy.position.x - p.x, enemy.position.z - p.z));
    for (const other of app.character.moves ?? []) if (other !== move) other.release();
    move?.start(enemy);

    const e = enemy.position;
    const violet = getColor(cfg.color);
    app.fx.ring(e.x, e.y, e.z, violet, cfg.radius + 0.6, 0.6);
    app.fx.omen(e.x, e.y, e.z, violet, cfg.radius + 0.3, cfg.plungeAt);
    this.blades.setLook(cfg.color, cfg.core, cfg.intensity);
    app.audio.clang({ x: e.x, y: e.y + 1, z: e.z }, { bright: true, strength: 0.6 });
    app.toast.show('処刑', 900);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* 飛燕                                                                */
  /* ------------------------------------------------------------------ */

  /** Whether 飛燕 can be thrown now. */
  get hienReady() {
    const app = this.app;
    const cfg = settings.hien;
    if (!cfg.enabled || this.active || app.pvp?.active || app.playerDown) return false;
    if (app.elapsed < this._hienReadyAt) return false;
    if (app.character.flight?.active) return false;
    return !!app.character.slashHit?.canStart();
  }

  /** Throw it: the slash plays in place, and the crescent leaves on its swing. */
  hien() {
    const app = this.app;
    const cfg = settings.hien;
    if (!this.hienReady) return false;
    if (!app.defense.spend(cfg.staminaCost)) {
      app.toast.show('Too winded', 700);
      return false;
    }
    this._hienReadyAt = app.elapsed + cfg.cooldown;
    // Aim: the locked body, else the nearest in front within range.
    const p = app.character.position;
    let target = app.lockOn?.target?.alive ? app.lockOn.target : null;
    if (!target) {
      target = app.enemies.findTarget(p, app.character.facing, { range: cfg.range, cone: 90 });
    }
    if (target) app.character.setFacing(Math.atan2(target.position.x - p.x, target.position.z - p.z));
    this._hienPending = { target, at: app.elapsed + cfg.launchDelay };
    app.character.slashHit.start(null);
    return true;
  }

  _launch(target) {
    const app = this.app;
    const cfg = settings.hien;
    const p = app.character.position;
    const f = app.character.facing;
    const y = p.y + app.character.height * 0.55;
    let tx = p.x + Math.sin(f) * cfg.range;
    let tz = p.z + Math.cos(f) * cfg.range;
    if (target?.alive) {
      tx = target.position.x;
      tz = target.position.z;
    }
    const dist = Math.hypot(tx - p.x, tz - p.z);
    const time = Math.max(0.08, dist / cfg.speed);
    const ty = app.terrain.heightAt(tx, tz) + app.character.height * 0.55;
    app.fx.crescent(p.x, y, p.z, tx, ty, tz, getColor(cfg.color), cfg.radius, time, (Math.random() - 0.5) * 0.9);
    const dirX = (tx - p.x) / Math.max(dist, 1e-3);
    const dirZ = (tz - p.z) / Math.max(dist, 1e-3);
    this._flying.push({ target: target?.alive ? target : null, x: tx, z: tz, dirX, dirZ, at: app.elapsed + time });
  }

  /* ------------------------------------------------------------------ */

  update(dt) {
    const app = this.app;

    // 飛燕: the launch on its beat, then each crescent's arrival.
    if (this._hienPending && app.elapsed >= this._hienPending.at) {
      this._launch(this._hienPending.target);
      this._hienPending = null;
    }
    for (let i = this._flying.length - 1; i >= 0; i--) {
      const c = this._flying[i];
      if (app.elapsed < c.at) continue;
      this._flying.splice(i, 1);
      const cfg = settings.hien;
      const y = app.terrain.heightAt(c.x, c.z) + 1;
      app.fx.flare(c.x, y, c.z, getColor(cfg.color), 0.7, 0.22);
      if (c.target?.alive) app._hienHit(c.target, c.dirX, c.dirZ);
    }

    this._updateExecution(dt);
    this._updatePrompt();
  }

  _updateExecution(dt) {
    const run = this.active;
    if (!run) {
      this.blades.opacity = Math.max(0, this.blades.material.uniforms.uOpacity.value - dt * 4);
      return;
    }
    const app = this.app;
    const cfg = settings.execution;
    run.t += dt;
    const t = run.t;
    const enemy = run.enemy;
    const e = enemy.position;
    const cy = e.y + settings.enemies.height * 0.62;
    const n = this.blades.count;

    if (!run.struck) {
      // The ring: fading in, closing, turning faster and faster.
      const k = Math.min(1, t / cfg.plungeAt);
      const radius = cfg.radius + (cfg.closeRadius - cfg.radius) * k * k;
      run.spin += dt * cfg.spin * (0.3 + 1.7 * k * k);
      const lift = cfg.height * (0.6 + 0.4 * Math.min(1, t * 4));
      for (let i = 0; i < n; i++) {
        const a = run.spin + (i / n) * Math.PI * 2;
        const bx = e.x + Math.sin(a) * radius;
        const bz = e.z + Math.cos(a) * radius;
        const by = e.y + lift + 0.35;
        // Hilt out, point in at the chest, tipped a little down.
        this.blades.aim(i, bx, by, bz, e.x, cy, e.z, 1);
      }
      this.blades.opacity = Math.min(1, t * 5);
      // Its 妖気, thickening as the ring closes.
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        app.miasma.puff(e.x + Math.sin(a) * 0.4, e.y + 0.3, e.z + Math.cos(a) * 0.4, 0, 1.2, 0, getColor(cfg.color), 0.5, 0.9);
      }
      if (t >= cfg.plungeAt) this._plunge(run);
    } else {
      // In, held, and gone.
      const after = t - cfg.plungeAt;
      const inset = Math.min(1, after / 0.06);
      for (let i = 0; i < n; i++) {
        const a = run.spin + (i / n) * Math.PI * 2;
        const r = cfg.closeRadius * (1 - inset * 0.72);
        this.blades.aim(i, e.x + Math.sin(a) * r, cy + 0.2, e.z + Math.cos(a) * r, e.x, cy, e.z, 1);
      }
      this.blades.opacity = Math.max(0, 1 - Math.max(0, after - 0.2) * 3);
      if (t >= cfg.duration) this._finish();
    }
  }

  _plunge(run) {
    const app = this.app;
    const cfg = settings.execution;
    run.struck = true;
    const enemy = run.enemy;
    const e = enemy.position;
    const p = app.character.position;
    const cy = e.y + settings.enemies.height * 0.62;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const violet = getColor(cfg.color);
    const white = getColor(cfg.core);

    // Frozen on the moment, then the light.
    app._hitStop = Math.max(app._hitStop, cfg.hitStop);
    app._hitStopScale = 0.05;
    app._hitRelease = 0;
    app.rig.shake(0.35);
    app.rig.punch(dx / d, dz / d, 0.14, settings.combat.fovKick * 3, 0.02);
    app.fx.pillar(e.x, e.y, e.z, violet, 1.1, 6, 0.9);
    app.fx.flare(e.x, cy, e.z, white, 1.4, 0.35);
    app.fx.ring(e.x, e.y, e.z, violet, cfg.radius + 1.4, 0.55);
    const f = app.character.facing;
    for (const off of [-0.7, 0, 0.7]) app._iai(e, f + off, 1.1);
    app.meleeSparks.burst(e.x, cy, e.z, dx / d, 0.3, dz / d, settings.combat.sparks, 2);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.5;
      app.miasma.puff(e.x, cy, e.z, Math.sin(a) * s, 0.5 + Math.random(), Math.cos(a) * s, violet, 0.55, 0.8);
    }
    app.audio.clang({ x: e.x, y: cy, z: e.z }, { bright: true, strength: 1.5 });
    app.audio.impact({ x: e.x, y: cy, z: e.z }, { cut: true, strength: 1.4 });

    // The kill itself: parted, with the execution's own share of souls.
    app._executionKill = true;
    app.enemies.kill(enemy, dx / d, dz / d, { ...settings.slashHit, slices: true });
    app._executionKill = false;
    app.comboCounter.hit(true);
    app.musouGauge = Math.min(settings.musou.max, app.musouGauge + cfg.gaugeBonus);
  }

  _finish() {
    this.active = null;
    const app = this.app;
    app._scripted = false;
    // Hand the stick straight back rather than waiting a frame for it.
    app.controller.frozen = app.playerDown || !!(app.pvp?.active && app.pvp.frozen);
    app._wasScripted = false;
  }

  /** The 処刑 prompt over whoever can be finished, and the attack button's tell. */
  _updatePrompt() {
    const app = this.app;
    const candidate = this.findCandidate();
    this.candidate = candidate;
    app.mobileControls?.setExecute?.(!!candidate);
    if (!candidate) {
      this.marker.hidden = true;
      return;
    }
    _head.copy(candidate.position);
    _head.y += settings.enemies.height * 1.18;
    _head.project(app.camera);
    if (_head.z > 1) {
      this.marker.hidden = true;
      return;
    }
    this.marker.hidden = false;
    const x = (_head.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_head.y * 0.5 + 0.5) * window.innerHeight;
    this.marker.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  /** Drop everything — a retry, a duel. */
  reset() {
    if (this.active) this._finish();
    this._flying.length = 0;
    this._hienPending = null;
    this.blades.opacity = 0;
    this.marker.hidden = true;
  }

  dispose() {
    this.blades.dispose();
    this.marker.remove();
  }
}
