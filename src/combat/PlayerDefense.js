import { LoopRepeat } from 'three';

import { settings } from '../config/settings.js';
import { damp } from '../utils/math.js';
import { resolveDefense } from './defense.js';

/**
 * The player's guard, parry and stamina — everything about *not* being hit.
 *
 * Held rather than toggled: the guard is up while the key (or the Guard
 * button) is down, and only when the body is free — not mid-swing, not in the
 * air, not down, not broken open. The moment it goes up is remembered
 * (`guardSince`), because that is what a parry is: a guard raised just before
 * the blow (`settings.defense.parryWindow`).
 *
 * There is no guard clip in the project, so the pose is the crouch clip laid
 * over the gait at `poseWeight` — a lowered, braced stance — faded in and out
 * with the guard.
 *
 * What a blow *does* against the guard is decided by `defense.js`, the same
 * pure rule the PvP server uses. This class only holds the state that rule
 * reads and applies what it returns.
 */
export class PlayerDefense {
  /** @param {import('../animation/CharacterController.js').CharacterController} character */
  constructor(character) {
    this.character = character;
    /** Whether the guard is up this frame. */
    this.guarding = false;
    /** Simulation time the guard went up. */
    this.guardSince = -Infinity;
    /** Stamina left, 0 … `settings.defense.staminaMax`. */
    this.stamina = settings.defense.staminaMax;
    /** Seconds since stamina was last spent — regeneration waits for `regenDelay`. */
    this._sinceSpent = Infinity;
    /** Seconds left of the counter window a parry opened. */
    this.counter = 0;
    /** Seconds left of being knocked open by a guard break. */
    this.broken = 0;
    this._pose = 0;
    this._action = null;
  }

  /** Build the guard pose once the character's clips are in. */
  bind() {
    const clip = this.character.clips?.get('crouch');
    if (!clip || !this.character.mixer) return;
    this._action = this.character.mixer.clipAction(clip.clone());
    this._action.setLoop(LoopRepeat, Infinity);
    this._action.setEffectiveWeight(0);
    this._action.play();
  }

  /** Seconds the guard has been up, at simulation time `now`. */
  guardAge(now) {
    return this.guarding ? now - this.guardSince : Infinity;
  }

  /**
   * @param {number} dt simulation seconds
   * @param {number} now simulation time
   * @param {boolean} held the guard input
   * @param {boolean} free whether the body may guard at all right now
   */
  update(dt, now, held, free) {
    const config = settings.defense;
    const want = held && free && this.broken <= 0 && config.enabled;
    if (want && !this.guarding) this.guardSince = now;
    this.guarding = want;

    this.broken = Math.max(0, this.broken - dt);
    this.counter = Math.max(0, this.counter - dt);

    // Stamina comes back on its own, after a pause, and not while it is being
    // leaned on — a guard held up does not recover.
    this._sinceSpent += dt;
    if (config.staminaEnabled && !this.guarding && this._sinceSpent >= config.regenDelay) {
      this.stamina = Math.min(config.staminaMax, this.stamina + config.regenRate * dt);
    }
    if (!config.staminaEnabled) this.stamina = config.staminaMax;

    this._pose = damp(this._pose, this.guarding ? 1 : 0, 1e-6, dt);
    this._action?.setEffectiveWeight(this._pose * config.poseWeight);
  }

  /** Spend stamina (a guard, a leap). Returns false if there was not enough. */
  spend(amount) {
    const config = settings.defense;
    if (!config.staminaEnabled || amount <= 0) return true;
    if (this.stamina < amount) return false;
    this.stamina -= amount;
    this._sinceSpent = 0;
    return true;
  }

  /**
   * A blow is landing. Decide it, apply its cost, and say what happened.
   *
   * @param {number} toAttackerX unit vector from the player toward the attacker
   * @param {number} toAttackerZ
   * @param {number} now simulation time
   * @returns {{result: 'hit'|'parry'|'block'|'break', damageScale: number, staminaCost: number}}
   */
  defend(toAttackerX, toAttackerZ, now) {
    const config = settings.defense;
    const outcome = resolveDefense(
      {
        guarding: this.guarding,
        guardAge: this.guardAge(now),
        stamina: config.staminaEnabled ? this.stamina : Infinity,
        facing: this.character.facing,
        toAttackerX,
        toAttackerZ
      },
      config
    );

    if (outcome.staminaCost !== 0 && config.staminaEnabled) {
      this.stamina = Math.min(config.staminaMax, Math.max(0, this.stamina - outcome.staminaCost));
      if (outcome.staminaCost > 0) this._sinceSpent = 0;
    }
    if (outcome.result === 'parry') this.counter = config.counterWindow;
    if (outcome.result === 'break') {
      this.broken = config.breakTime;
      this.guarding = false;
    }
    return outcome;
  }

  /** Back to a fresh start — a retry, a new round. */
  reset() {
    this.guarding = false;
    this.guardSince = -Infinity;
    this.stamina = settings.defense.staminaMax;
    this._sinceSpent = Infinity;
    this.counter = 0;
    this.broken = 0;
  }
}
