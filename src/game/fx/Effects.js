import { Color, Group, PointLight, Vector3 } from 'three';
import { BladeImpact } from '../../vfx/BladeImpact.js';
import { DustBurst } from '../../vfx/DustBurst.js';
import { ShockRing } from '../../vfx/ShockRing.js';
import { settings } from '../../config/settings.js';
import { GlowPool } from './GlowPool.js';
import { SlashTrail } from './SlashTrail.js';
import { Shards } from './Shards.js';

const _p = new Vector3();
const _hand = new Vector3();

/**
 * The game's effects, in one place, built mostly out of the template's own:
 * the flight blades' impact shower for sparks, the judgement's shock ring and
 * dust for slams. Each pool shares its colours through uniforms, so a second
 * colour scheme is a second (cheap) instance rather than per-hit state.
 *
 * One point light is kept in the scene permanently at zero intensity and
 * flared on impacts — adding and removing lights would recompile every
 * material in the frame it happened.
 */
export class Effects {
  constructor(game) {
    this.game = game;
    this.group = new Group();
    this.group.name = 'GameFX';
    const terrain = game.app.terrain;

    this.trail = new SlashTrail();
    this.glow = new GlowPool(game.quality.name === 'low' ? 320 : 640);

    this.hitSparks = new BladeImpact(512);
    this.parrySparks = new BladeImpact(384);
    this.slamRing = new ShockRing({ terrain });
    this.dangerRing = new ShockRing({ terrain });
    this.coldRing = new ShockRing({ terrain });
    this.shards = new Shards(game.quality.name === 'low' ? 64 : 112);
    this.dustBurst = new DustBurst(game.quality.name === 'low' ? 512 : 1024);

    this.group.add(
      this.trail.mesh,
      this.glow.points,
      this.hitSparks.mesh,
      this.parrySparks.mesh,
      this.slamRing.mesh,
      this.dangerRing.mesh,
      this.coldRing.mesh,
      this.shards.mesh,
      this.dustBurst.mesh
    );

    this.light = new PointLight('#ffb070', 0, 9, 2);
    this.light.position.set(0, -50, 0);
    this.group.add(this.light);
    this._lightTime = 0;
    this._lightLife = 0;
    this._lightPeak = 0;

    const impact = settings.flight.blades.impact;
    this.hitConfig = { ...impact, color: '#ffd8a8', ringColor: '#ff6a1a', sparkColor: '#ff9a40', size: 0.75, sparks: 12, life: 0.22, intensity: 1.8, spikes: 5, sparkSpeed: 6, sparkStretch: 0.02, sparkSize: 0.035, sparkLife: 0.35 };
    this.heavyConfig = { ...this.hitConfig, size: 1.25, sparks: 24, life: 0.32, intensity: 2.6, spikes: 8, sparkSpeed: 9 };
    this.parryConfig = { ...impact, color: '#ffffff', ringColor: '#9fd8ff', sparkColor: '#ffe0a0', size: 1.9, sparks: 46, life: 0.45, intensity: 3.2, spikes: 9, spikeLength: 2.0, sparkSpeed: 11, sparkLife: 0.6, sparkStretch: 0.03, sparkSize: 0.04 };
    this.blockConfig = { ...this.parryConfig, size: 0.9, sparks: 24, life: 0.25, intensity: 2.2, spikes: 5 };
    const shock = settings.judgement.shock;
    this.slamConfig = { ...shock, color: '#ffb070', crackColor: '#ff6a20', radius: 3.3, life: 0.55, intensity: 2.2 };
    this.dangerConfig = { ...shock, color: '#ff3018', crackColor: '#ff2a10', radius: 3.6, life: 0.6, intensity: 2.6 };
    this.coldConfig = { ...shock, color: '#8fdcff', crackColor: '#d8f6ff', radius: 3.0, life: 0.55, intensity: 2.4 };
    this.dustConfig = { ...settings.judgement.dust, color: '#5d6470', shadeColor: '#1a1e26', soilColor: '#20242c', opacity: 0.6, puffs: 18, clods: 14 };

    this._afterimageAcc = 0;
    this._bladeBound = false;
  }

  /** Find the katana on the body, once it is equipped. */
  bindBlade() {
    const slot = this.game.app.characterScreen?.equipment.get('sword');
    if (!slot?.model) return false;
    const hand = this.game.app.character.getBone('RightHand');
    hand?.getWorldPosition(_hand);
    this.trail.bind(slot.model, _hand);
    this._bladeBound = true;
    return true;
  }

  /* ---- one-shots ---- */

  hit(point, dirX, dirZ, { heavy = false, color = null } = {}) {
    const config = heavy ? this.heavyConfig : this.hitConfig;
    this.hitSparks.burst(point.x, point.y, point.z, dirX, 0.15, dirZ, config, 1);
    this.glow.spawn(point, color ?? '#ff9a50', heavy ? 1.4 : 0.8, 0.14, { grow: 0.8, intensity: 2 });
    this.flare(point, heavy ? '#ffb070' : '#ff9050', heavy ? 26 : 12, 0.14);
  }

  parry(point, dirX, dirZ) {
    this.parrySparks.burst(point.x, point.y, point.z, dirX, 0.3, dirZ, this.parryConfig, 1);
    this.glow.spawn(point, '#ffffff', 2.4, 0.25, { grow: 1.5, star: true, intensity: 3 });
    this.glow.burst(point, '#ffe9b0', 26, { speed: 9, size: 0.06, life: 0.6, up: 2.5, gravity: -12 });
    this.flare(point, '#d8ecff', 60, 0.35);
  }

  block(point, dirX, dirZ) {
    this.parrySparks.burst(point.x, point.y, point.z, dirX, 0.2, dirZ, this.blockConfig, 1);
    this.flare(point, '#ffd8a0', 14, 0.12);
  }

  slam(position, radius, color = '#ffb070') {
    const danger = color === '#ff3a1a';
    const ring = danger ? this.dangerRing : this.slamRing;
    const config = danger ? this.dangerConfig : this.slamConfig;
    ring.burst(position.x, position.z, config, Math.max(0.3, radius / config.radius));
    this.dust(position, Math.min(2, radius / 2));
    _p.set(position.x, position.y + 0.3, position.z);
    this.flare(_p, color, 30, 0.3);
  }

  /** A blue-white ring on the ground — thunder strikes and ice. */
  coldBurst(position, radius) {
    this.coldRing.burst(position.x, position.z, this.coldConfig, Math.max(0.3, radius / this.coldConfig.radius));
  }

  /**
   * A fireball's end, or the 爆雷 reaction at full size: a white-hot core, a
   * ring along the ground, embers thrown up and smoke rolling out.
   */
  explosion(point, radius = 2, color = '#ff7a2a') {
    this.glow.spawn(point, '#fff0c8', radius * 0.7, 0.14, { grow: 1.4, intensity: 1.8 });
    this.glow.spawn(point, color, radius * 1.6, 0.4, { grow: 0.8, intensity: 2 });
    this.glow.burst(point, '#ffb040', Math.round(10 + radius * 6), { speed: 4 + radius * 2, size: 0.09, life: 0.8, up: 3, gravity: -7 });
    this.glow.burst(point, color, Math.round(6 + radius * 3), { speed: 2 + radius, size: 0.35, life: 0.6, up: 2.2, gravity: 1 });
    _p.set(point.x, Math.max(0, point.y - 1), point.z);
    this.slamRing.burst(_p.x, _p.z, this.slamConfig, Math.max(0.3, radius / this.slamConfig.radius));
    this.dust(_p, Math.min(2, radius / 2));
    this.flare(point, color, 14 + radius * 7, 0.35);
  }

  /** Ice breaking: splinters, a cold ring, a pale flash. */
  shatter(point, radius = 1.2, count = 12) {
    this.shards.burst(point, count, 4 + radius * 2);
    this.glow.spawn(point, '#d8fbff', radius * 1.3, 0.2, { grow: 1, intensity: 2.4 });
    this.glow.burst(point, '#9fefff', 10, { speed: 4, size: 0.06, life: 0.5, up: 2, gravity: -8 });
    _p.set(point.x, Math.max(0, point.y - 1), point.z);
    this.coldBurst(_p, radius);
    this.flare(point, '#9fe8ff', 18 + radius * 6, 0.3);
  }

  /** A column of fire standing out of the ground (the boss's burning floor). */
  firePillar(position, height = 3) {
    for (let i = 0; i < 6; i++) {
      _p.set(position.x + (Math.random() - 0.5) * 0.5, position.y + (i / 6) * height, position.z + (Math.random() - 0.5) * 0.5);
      this.glow.spawn(_p, i % 2 ? '#ff5a1a' : '#ffb040', 0.9 - i * 0.08, 0.7, { vy: 3.5, grow: -0.4, intensity: 2 });
    }
  }

  dust(position, strength = 1) {
    this.dustBurst.burst(position.x, position.y + 0.05, position.z, this.dustConfig, strength);
  }

  /** The tell before a blow: a star on the weapon. Red means don't block. */
  telegraph(point, danger = false) {
    this.glow.spawn(point, danger ? '#ff2a14' : '#ffd890', danger ? 1.6 : 1.0, danger ? 0.55 : 0.4, {
      star: true,
      grow: 0.6,
      intensity: danger ? 3 : 2.2
    });
  }

  /** Dark mist off the body while it is dodging. */
  afterimage(character, dt) {
    this._afterimageAcc += dt;
    if (this._afterimageAcc < 0.03) return;
    this._afterimageAcc = 0;
    const p = character.position;
    for (let i = 0; i < 2; i++) {
      _p.set(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.4 + Math.random() * 1.2, p.z + (Math.random() - 0.5) * 0.4);
      this.glow.spawn(_p, '#4a6aa8', 0.5, 0.35, { grow: 1.2, intensity: 0.5 });
    }
  }

  afterimageAt(enemy) {
    const p = enemy.position;
    for (let i = 0; i < 6; i++) {
      _p.set(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.3 + Math.random() * 1.3, p.z + (Math.random() - 0.5) * 0.5);
      this.glow.spawn(_p, '#8a50ff', 0.6, 0.4, { grow: 1, intensity: 0.6 });
    }
  }

  /** Flare the shared light at a point. */
  flare(point, color, intensity, life) {
    if (intensity < this._lightPeak * (1 - this._lightTime / Math.max(1e-3, this._lightLife))) return;
    this.light.color.set(color);
    this.light.position.set(point.x, point.y + 0.4, point.z);
    this._lightPeak = intensity;
    this._lightLife = life;
    this._lightTime = 0;
  }

  update(dt, elapsed) {
    if (!this._bladeBound) this.bindBlade();
    this.trail.update(dt);
    this.glow.update(dt, this.game.app.renderer.size.height * this.game.app.renderer.gl.getPixelRatio());
    this.hitSparks.sync(elapsed, this.hitConfig);
    this.parrySparks.sync(elapsed, this.parryConfig);
    this.slamRing.update(dt, this.slamConfig);
    this.dangerRing.update(dt, this.dangerConfig);
    this.coldRing.update(dt, this.coldConfig);
    this.shards.update(dt);
    this.dustBurst.sync(elapsed, this.dustConfig);

    this._lightTime += dt;
    const t = this._lightLife > 0 ? Math.min(1, this._lightTime / this._lightLife) : 1;
    this.light.intensity = this._lightPeak * (1 - t) * (1 - t);
  }

  clear() {
    this.glow.clear();
    this.hitSparks.clear();
    this.parrySparks.clear();
    this.slamRing.clear();
    this.dangerRing.clear();
    this.coldRing.clear();
    this.shards.clear();
    this.dustBurst.clear();
    this.trail.end();
  }

  dispose() {
    this.trail.dispose();
    this.glow.dispose();
    this.hitSparks.dispose();
    this.parrySparks.dispose();
    this.slamRing.dispose();
    this.dangerRing.dispose();
    this.coldRing.dispose();
    this.shards.dispose();
    this.dustBurst.dispose();
  }
}

export { Color };
