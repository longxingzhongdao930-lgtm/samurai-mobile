import { Vector3 } from 'three';

import { settings } from '../config/settings.js';

const _p = new Vector3();

/**
 * Lock-on: one body the camera keeps in frame, the character faces, and the
 * attacks go for first.
 *
 * `L` (the Lock button on a phone) is one key with two meanings, the same
 * shape knockback-arena gives its target key: a tap locks the nearest body in
 * front — or, already locked, moves to the next one — and a long press lets
 * go. A lock that loses its body (felled, or walked out past `breakRange`)
 * moves on to the next nearest by itself, and lets go when there is none.
 *
 * It never takes the camera away: `CameraRig#setLockTarget` only *eases* the
 * orbit round behind the character, and backs off for a moment whenever the
 * player drags.
 *
 * Candidates come from a function, so the same lock works on the PvE crowd
 * and on a single PvP opponent (`candidates()` returns whatever can be
 * locked, each with a `position` and `alive`).
 */
export class LockOn {
  /**
   * @param {object} options
   * @param {() => {position: Vector3, alive: boolean}[]} options.candidates
   * @param {() => Vector3} options.origin where the player stands
   * @param {() => number} options.facing the character's heading
   * @param {import('three').PerspectiveCamera} options.camera for the marker
   * @param {HTMLElement} [options.parent]
   */
  constructor({ candidates, origin, facing, camera, parent = document.body }) {
    this.candidates = candidates;
    this.origin = origin;
    this.facing = facing;
    this.camera = camera;
    /** @type {{position: Vector3, alive: boolean}|null} */
    this.target = null;

    // The marker: a small diamond over the locked body's head.
    this.marker = document.createElement('div');
    this.marker.className = 'lock-marker';
    this.marker.hidden = true;
    parent.appendChild(this.marker);
  }

  get active() {
    return this.target !== null;
  }

  /** Tap: lock the best body, or move to the next one. */
  cycle() {
    const list = this._ranked();
    if (!list.length) return this.release();
    if (!this.target) {
      this.target = list[0];
      return this.target;
    }
    // Next in turn, by bearing round the player — so repeated taps sweep
    // across the crowd rather than bouncing between the two nearest.
    const origin = this.origin();
    const bearing = (e) => Math.atan2(e.position.x - origin.x, e.position.z - origin.z);
    const sorted = list.slice().sort((a, b) => bearing(a) - bearing(b));
    const at = sorted.indexOf(this.target);
    this.target = sorted[(at + 1) % sorted.length] ?? sorted[0];
    return this.target;
  }

  release() {
    this.target = null;
    this.marker.hidden = true;
    return null;
  }

  /**
   * Keep the lock honest: a body that fell or walked out of range hands the
   * lock to the next nearest (or lets it go), and the marker follows the head.
   */
  update() {
    const config = settings.lockOn;
    if (this.target) {
      const origin = this.origin();
      const t = this.target;
      const far =
        Math.hypot(t.position.x - origin.x, t.position.z - origin.z) > config.breakRange;
      if (!t.alive || far) {
        const next = this._ranked()[0] ?? null;
        this.target = next;
      }
    }
    this._placeMarker();
    return this.target;
  }

  /**
   * Everything lockable within `range`, best first: near, and in front of
   * the character more than behind it.
   */
  _ranked() {
    const config = settings.lockOn;
    const origin = this.origin();
    const facing = this.facing();
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const out = [];
    for (const e of this.candidates()) {
      if (!e?.alive) continue;
      const dx = e.position.x - origin.x;
      const dz = e.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > config.range) continue;
      const along = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      out.push({ e, score: d * (1.6 - 0.6 * along) });
    }
    out.sort((a, b) => a.score - b.score);
    return out.map((o) => o.e);
  }

  _placeMarker() {
    const t = this.target;
    if (!t) {
      this.marker.hidden = true;
      return;
    }
    _p.copy(t.position);
    _p.y += (settings.enemies.height ?? 1.8) * 1.12;
    _p.project(this.camera);
    if (_p.z > 1) {
      this.marker.hidden = true;
      return;
    }
    const x = (_p.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_p.y * 0.5 + 0.5) * window.innerHeight;
    this.marker.hidden = false;
    this.marker.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  dispose() {
    this.marker.remove();
  }
}
