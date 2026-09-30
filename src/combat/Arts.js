import { Vector3 } from 'three';

import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';

const _from = new Vector3();

/**
 * 秘剣 — the four sword arts: 雷切 (Raikiri), 影走り (Kagebashiri), 縮地
 * (Shukuchi) and 居合 (Iai, 飛燕's long press).
 *
 * All four are the same shape of thing: for a fraction of a second the body is
 * *moved by the art* rather than by the stick — the controller is held
 * (`busy`), the character is carried along a path, and the art decides where
 * each blow lands. The ability managers of the reference templates (one entry
 * per move in `config/abilities.js`, a state per id for the HUD, the key
 * handler calling into one owner) are kept; the moves themselves are built
 * light for phones out of what is already here:
 *
 *  - **縮地** (after living-superweapon's dash) — a blink of `distance` metres the
 *    way the stick points, untouchable on the way, an after-image left behind.
 *  - **影走り** (after katana-rush) — the nearest bodies taken one after another:
 *    the body vanishes into 妖気 and reappears past each in turn, cutting.
 *  - **雷切** (after the Storm Lance of LinearAbilityCasting) — lightning gathers
 *    on the blade, the body drives forward along a line, and every body on it
 *    is struck from the sky, the strike leaping on to its neighbours.
 *  - **居合** — hold 飛燕 to settle into the stance, let go to cross the ground in
 *    a blink and draw through the nearest body; the 飛燕 wave then leaves from
 *    where the cut ended. The body the draw cut is excluded from the wave, so no
 *    blow lands twice.
 *
 * Drawn with the shared pools (flashes, miasma, the trail), one draw call each.
 */
export class Arts {
  /** @param {import('../core/App.js').App} app */
  constructor(app) {
    this.app = app;
    /** The art carrying the body right now, or null. */
    this.run = null;
    /** Simulation time each art may next be used. */
    this.readyAt = { raikiri: 0, kagebashiri: 0, shukuchi: 0 };
    /** 飛燕's key: when it went down, and whether the hold has become a stance. */
    this._hienDownAt = null;
    this.stance = null;
  }

  /** The body is the art's: the controller holds still. */
  get busy() {
    return this.run !== null || this.stance !== null;
  }

  /** Whether an art can be started at all right now. */
  _free() {
    const app = this.app;
    return (
      !this.busy &&
      !app.execution?.active &&
      !app.playerDown &&
      !app.pvp?.active &&
      !app.inCharacterScreen &&
      !app.character.jump?.locked &&
      !app.character.hop?.locked
    );
  }

  /** HUD state for one art. */
  state(id) {
    if (this.run?.id === id) return 'active';
    if (id === 'hien' && this.stance) return 'active';
    const cfg = settings.arts[id];
    if (!cfg?.enabled || !this._free()) return 'off';
    return this.app.elapsed >= (this.readyAt[id] ?? 0) ? 'ready' : 'off';
  }

  _spend(id) {
    const app = this.app;
    const cfg = settings.arts[id];
    if (!cfg.enabled || !this._free()) return false;
    if (app.elapsed < this.readyAt[id]) return false;
    if (!app.defense.spend(cfg.stamina)) {
      app.toast.show('息が切れた', 700);
      return false;
    }
    this.readyAt[id] = app.elapsed + cfg.cooldown;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* 縮地                                                                */
  /* ------------------------------------------------------------------ */

  shukuchi() {
    const app = this.app;
    if (!this._spend('shukuchi')) return false;
    if (app.counters) app.counters.shukuchi++;
    const cfg = settings.arts.shukuchi;
    // The way the stick points, in the camera's frame; the facing if it is idle.
    const axis = app.input.axis;
    const az = app.rig.azimuth;
    let dx = axis.y * -Math.sin(az) + axis.x * Math.cos(az);
    let dz = axis.y * -Math.cos(az) + axis.x * -Math.sin(az);
    const len = Math.hypot(dx, dz);
    if (len < 0.1) {
      dx = Math.sin(app.character.facing);
      dz = Math.cos(app.character.facing);
    } else {
      dx /= len;
      dz /= len;
    }
    const p = app.character.position;
    this._afterimage(p, cfg.color);
    this.run = {
      id: 'shukuchi',
      t: 0,
      time: cfg.time,
      fromX: p.x,
      fromZ: p.z,
      toX: p.x + dx * cfg.distance,
      toZ: p.z + dz * cfg.distance
    };
    app.character.setFacing(Math.atan2(dx, dz));
    app._invuln = Math.max(app._invuln, cfg.time + cfg.invuln);
    app.rig.punch(dx, dz, 0.08, settings.combat.fovKick * 2, 0);
    app.audio.swing({ x: p.x, y: p.y + 1, z: p.z }, 0.8);
    const mid = cfg.distance * 0.5;
    app.fx.slash(p.x + dx * mid, p.y + 0.9, p.z + dz * mid, dx, 0, dz, getColor(cfg.color), cfg.distance, 0.1, 0.3);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* 影走り                                                              */
  /* ------------------------------------------------------------------ */

  kagebashiri() {
    const app = this.app;
    const cfg = settings.arts.kagebashiri;
    const targets = this._chain(cfg.count, cfg.range);
    if (!targets.length) {
      app.toast.show('斬り抜ける相手がいない', 700);
      return false;
    }
    if (!this._spend('kagebashiri')) return false;
    const p = app.character.position;
    this._afterimage(p, cfg.color);
    this.run = { id: 'kagebashiri', t: 0, targets, index: 0, next: 0 };
    app._invuln = Math.max(app._invuln, targets.length * cfg.interval + 0.4);
    app.toast.show('影走り', 700);
    return true;
  }

  /** Up to `count` living bodies within `range`, each the nearest to the last. */
  _chain(count, range) {
    const app = this.app;
    const pool = app.enemies.enemies.filter(
      (e) => e.alive && e.position.distanceTo(app.character.position) <= range
    );
    const out = [];
    let at = app.character.position;
    while (out.length < count && pool.length) {
      let best = 0;
      let bestD = Infinity;
      pool.forEach((e, i) => {
        const d = e.position.distanceTo(at);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const e = pool.splice(best, 1)[0];
      out.push(e);
      at = e.position;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 雷切                                                                */
  /* ------------------------------------------------------------------ */

  raikiri() {
    const app = this.app;
    if (!this._spend('raikiri')) return false;
    const cfg = settings.arts.raikiri;
    const p = app.character.position;
    // Aim at the locked body, else the nearest in front, else straight on.
    let target = app.lockOn?.target?.alive ? app.lockOn.target : null;
    if (!target) target = app.enemies.findTarget(p, app.character.facing, { range: cfg.distance + 2, cone: 90 });
    let dx = Math.sin(app.character.facing);
    let dz = Math.cos(app.character.facing);
    if (target) {
      const tx = target.position.x - p.x;
      const tz = target.position.z - p.z;
      const d = Math.hypot(tx, tz);
      if (d > 0.3) {
        dx = tx / d;
        dz = tz / d;
      }
    }
    app.character.setFacing(Math.atan2(dx, dz));
    this.run = {
      id: 'raikiri',
      t: 0,
      dx,
      dz,
      fromX: p.x,
      fromZ: p.z,
      toX: p.x + dx * cfg.distance,
      toZ: p.z + dz * cfg.distance,
      struck: new Set(),
      sparkAt: 0
    };
    app._invuln = Math.max(app._invuln, cfg.charge + cfg.time + 0.3);
    app.audio.clang({ x: p.x, y: p.y + 1, z: p.z }, { bright: true, strength: 0.5 });
    app.toast.show('雷切', 700);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* 飛燕 short press / 居合 long press                                    */
  /* ------------------------------------------------------------------ */

  hienDown() {
    if (this._hienDownAt !== null || this.busy) return;
    this._hienDownAt = this.app.elapsed;
  }

  hienUp() {
    if (this._hienDownAt === null) return;
    this._hienDownAt = null;
    if (this.stance) {
      this._releaseIai();
      return;
    }
    // A tap: the 飛燕 it has always been.
    this.app.execution?.hien();
  }

  _enterStance() {
    const app = this.app;
    const cfg = settings.arts.iai;
    // It spends what 飛燕 spends, and waits on the same cooldown.
    if (!app.execution?.hienReady || this.busy) {
      this._hienDownAt = null;
      return;
    }
    if (!app.defense.spend(cfg.stamina)) {
      app.toast.show('息が切れた', 700);
      this._hienDownAt = null;
      return;
    }
    this.stance = { t: 0, glintAt: 0 };
    app.toast.show('居合', 600);
  }

  _releaseIai() {
    const app = this.app;
    const cfg = settings.arts.iai;
    this.stance = null;
    const p = app.character.position;
    let target = app.lockOn?.target?.alive ? app.lockOn.target : null;
    if (!target) target = app.enemies.findTarget(p, app.character.facing, { range: cfg.reach, cone: 120 });
    let dx = Math.sin(app.character.facing);
    let dz = Math.cos(app.character.facing);
    let dist = cfg.emptyStep;
    if (target) {
      const tx = target.position.x - p.x;
      const tz = target.position.z - p.z;
      const d = Math.hypot(tx, tz);
      if (d > 0.3) {
        dx = tx / d;
        dz = tz / d;
      }
      // Stop just short of the body: the blade, not the chest, arrives there.
      dist = Math.max(0, d - cfg.standoff);
    }
    app.character.setFacing(Math.atan2(dx, dz));
    this._afterimage(p, cfg.color);
    this.run = {
      id: 'iai',
      t: 0,
      time: cfg.time,
      target,
      dx,
      dz,
      fromX: p.x,
      fromZ: p.z,
      toX: p.x + dx * dist,
      toZ: p.z + dz * dist
    };
    app._invuln = Math.max(app._invuln, cfg.time + 0.35);
    app.execution._hienReadyAt = app.elapsed + settings.hien.cooldown;
    app.audio.swing({ x: p.x, y: p.y + 1, z: p.z }, 1);
  }

  _cutIai(run) {
    const app = this.app;
    const cfg = settings.arts.iai;
    const p = app.character.position;
    // The draw: the slash plays with no target, so it deals nothing itself —
    // the art deals the blow, once.
    app.character.slashHit?.start(null);
    const target = run.target;
    if (target?.alive) {
      const e = target.position;
      const force = { ...settings.slashHit, unblockable: true, damage: cfg.damage, slices: true };
      const result = app.enemies.hit(target, run.dx, run.dz, app._counterForce(force));
      if (result) app._impact(target, run.dx, run.dz, force, result, true);
      app._iai(e, app.character.facing, 1.2);
    } else {
      app._iai({ x: p.x + run.dx, y: p.y, z: p.z + run.dz }, app.character.facing, 1);
    }
    app._hitStop = Math.max(app._hitStop, cfg.hitStop);
    app._hitStopScale = 0.06;
    app._hitRelease = 0;
    app.rig.shake(0.25);
    // …and the 飛燕 wave from where the cut ended, past the body it just cut.
    app.execution._launch(null, target ?? null, { dirX: run.dx, dirZ: run.dz });
  }

  /* ------------------------------------------------------------------ */

  /** Once a frame, before the controller: carry the body, land the blows. */
  update(dt) {
    const app = this.app;

    // 飛燕's key held past the tap: the stance.
    if (this._hienDownAt !== null && !this.stance && !this.run) {
      if (app.elapsed - this._hienDownAt >= settings.arts.iai.hold) this._enterStance();
    }
    if (this.stance) {
      const s = this.stance;
      s.t += dt;
      const cfg = settings.arts.iai;
      if (app.playerDown || app.pvp?.active) {
        this.stance = null;
        this._hienDownAt = null;
      } else {
        // Gathering: a glint along the scabbard, cold wisps at the feet.
        const p = app.character.position;
        if (s.t >= s.glintAt) {
          s.glintAt = s.t + 0.35;
          app.fx.glint(p.x, p.y + 0.9, p.z, getColor(cfg.color), 0.45, 0.35);
        }
        if (Math.random() < dt * 14) {
          const a = Math.random() * Math.PI * 2;
          app.miasma.puff(p.x + Math.sin(a) * 0.5, p.y + 0.1, p.z + Math.cos(a) * 0.5, 0, 0.8, 0, getColor(cfg.color), 0.3, 0.8);
        }
        if (s.t >= cfg.maxHold) this.hienUp();
      }
    }

    const run = this.run;
    if (!run) return;
    run.t += dt;
    if (run.id === 'shukuchi') this._stepLine(run, settings.arts.shukuchi.time, () => this._end());
    else if (run.id === 'iai') this._stepLine(run, run.time, () => {
      this._cutIai(run);
      this._end();
    });
    else if (run.id === 'kagebashiri') this._stepKage(run, dt);
    else if (run.id === 'raikiri') this._stepRaikiri(run, dt);
  }

  /** Carry the body along a straight line over `time`, then call `done`. */
  _stepLine(run, time, done) {
    const app = this.app;
    const k = Math.min(1, run.t / Math.max(1e-3, time));
    const e = 1 - (1 - k) * (1 - k);
    const p = app.character.position;
    p.x = run.fromX + (run.toX - run.fromX) * e;
    p.z = run.fromZ + (run.toZ - run.fromZ) * e;
    if (k >= 1) done();
  }

  _stepKage(run) {
    const app = this.app;
    const cfg = settings.arts.kagebashiri;
    if (run.t < run.next) return;
    const target = run.targets[run.index];
    if (!target) {
      this._end();
      return;
    }
    run.index++;
    run.next = run.t + cfg.interval;
    if (!target.alive) return;
    const p = app.character.position;
    _from.copy(p);
    // Gone into the dark here, out of it just past the body.
    this._afterimage(p, cfg.color);
    const dx = target.position.x - p.x;
    const dz = target.position.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    p.x = target.position.x + ux * cfg.past;
    p.z = target.position.z + uz * cfg.past;
    app.character.setFacing(Math.atan2(ux, uz));
    const force = { ...settings.slashHit, unblockable: true, damage: cfg.damage };
    const result = app.enemies.hit(target, ux, uz, app._counterForce(force));
    if (result) app._impact(target, ux, uz, force, result, true);
    const color = getColor(cfg.color);
    app.fx.slash(
      (_from.x + p.x) * 0.5,
      p.y + 1,
      (_from.z + p.z) * 0.5,
      ux,
      0,
      uz,
      color,
      d + cfg.past,
      0.12,
      0.35
    );
    app._iai(target.position, Math.atan2(ux, uz), 0.8);
    this._afterimage(p, cfg.color);
  }

  _stepRaikiri(run, dt) {
    const app = this.app;
    const cfg = settings.arts.raikiri;
    const blue = getColor(cfg.color);
    const p = app.character.position;
    if (run.t < cfg.charge) {
      // Lightning gathering on the blade: short arcs off it to the air nearby.
      if (run.t >= run.sparkAt) {
        run.sparkAt = run.t + 0.05;
        const a = Math.random() * Math.PI * 2;
        const hx = p.x + run.dx * 0.6;
        const hz = p.z + run.dz * 0.6;
        app.fx.bolt(hx, p.y + 1.1, hz, hx + Math.sin(a) * 0.9, p.y + 0.5 + Math.random() * 1.2, hz + Math.cos(a) * 0.9, blue, 0.25, 0.12);
      }
      return;
    }
    // The drive. Who is on the line is settled once, as it starts: the sky
    // takes those, and the chains only leap to bodies off it — so nobody is
    // struck by both, and nobody on the line is cheated of the full blow.
    if (!run.line) {
      run.line = new Set();
      for (const enemy of app.enemies.enemies) {
        if (!enemy.alive) continue;
        const rx = enemy.position.x - run.fromX;
        const rz = enemy.position.z - run.fromZ;
        const a = rx * run.dx + rz * run.dz;
        if (a >= 0 && a <= cfg.distance + 0.6 && Math.abs(rx * run.dz - rz * run.dx) <= cfg.width) run.line.add(enemy);
      }
    }
    const k = Math.min(1, (run.t - cfg.charge) / cfg.time);
    const e = 1 - (1 - k) * (1 - k);
    p.x = run.fromX + (run.toX - run.fromX) * e;
    p.z = run.fromZ + (run.toZ - run.fromZ) * e;
    // Everyone the line has passed, struck once.
    const along = cfg.distance * e;
    for (const enemy of run.line) {
      if (!enemy.alive || run.struck.has(enemy)) continue;
      const a = (enemy.position.x - run.fromX) * run.dx + (enemy.position.z - run.fromZ) * run.dz;
      if (a > along + 0.6) continue;
      run.struck.add(enemy);
      this._thunder(enemy, run.dx, run.dz, cfg.damage, true, run.struck, run.line);
    }
    if (k >= 1) {
      app._iai({ x: p.x, y: p.y, z: p.z }, app.character.facing, 1);
      this._end();
    }
  }

  /** The sky answers: a bolt down onto `enemy`, then leaping on to its neighbours. */
  _thunder(enemy, dx, dz, damage, chain, struck, line) {
    const app = this.app;
    const cfg = settings.arts.raikiri;
    const blue = getColor(cfg.color);
    const e = enemy.position;
    const top = e.y + cfg.skyHeight;
    app.fx.bolt(e.x + (Math.random() - 0.5), top, e.z + (Math.random() - 0.5), e.x, e.y + 0.4, e.z, blue, 0.9, 0.35);
    app.fx.bolt(e.x, top, e.z, e.x, e.y + 0.4, e.z, blue, 0.5, 0.25);
    app.fx.flare(e.x, e.y + 1, e.z, blue, 1.3, 0.3);
    app.fx.ring(e.x, e.y, e.z, blue, 2.2, 0.4);
    const force = { ...settings.slashHit, unblockable: true, damage };
    const result = app.enemies.hit(enemy, dx, dz, app._counterForce(force));
    if (result) app._impact(enemy, dx, dz, force, result, true);
    app._hitStop = Math.max(app._hitStop, cfg.hitStop);
    app._hitStopScale = 0.08;
    app._hitRelease = 0;
    app.rig.shake(0.3);
    app.audio.clang({ x: e.x, y: e.y + 1, z: e.z }, { bright: true, strength: 1.3 });
    if (!chain) return;
    // Arcs to the nearest bodies around it.
    let leaps = 0;
    for (const other of app.enemies.enemies) {
      if (leaps >= cfg.chains) break;
      if (!other.alive || struck.has(other) || line?.has(other)) continue;
      if (other.position.distanceTo(e) > cfg.chainRange) continue;
      struck.add(other);
      leaps++;
      app.fx.bolt(e.x, e.y + 1, e.z, other.position.x, other.position.y + 1, other.position.z, blue, 0.5, 0.3);
      const ux = other.position.x - e.x;
      const uz = other.position.z - e.z;
      const d = Math.hypot(ux, uz) || 1;
      const force2 = { ...settings.slashHit, unblockable: true, damage: cfg.chainDamage };
      const r2 = app.enemies.hit(other, ux / d, uz / d, app._counterForce(force2));
      if (r2) app._impact(other, ux / d, uz / d, force2, r2, false);
    }
  }

  /** A dark after-image where the body was: 影. */
  _afterimage(at, color) {
    const app = this.app;
    const c = getColor(color);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      app.miasma.puff(at.x + Math.sin(a) * 0.25, at.y + 0.3 + i * 0.25, at.z + Math.cos(a) * 0.25, 0, 0.4, 0, c, 0.45, 0.6);
    }
    app.fx.ring(at.x, at.y, at.z, c, 1.2, 0.3);
  }

  _end() {
    this.run = null;
    const app = this.app;
    app.controller.frozen = app.playerDown;
  }

  reset() {
    this.run = null;
    this.stance = null;
    this._hienDownAt = null;
  }
}
