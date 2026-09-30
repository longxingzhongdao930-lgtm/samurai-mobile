import { settings } from '../config/settings.js';

const KEY = 'samurai.progress';

/**
 * What the player has earned: red souls in hand and the level of each upgrade.
 *
 * Kept in this browser's localStorage (per player, per device) and written on
 * every change. Nothing here touches a duel: PvP health and damage are the
 * server's, so an upgraded blade is exactly as sharp as a fresh one there.
 */
export class Progress {
  constructor() {
    this.souls = 0;
    /** @type {Record<string, number>} level per `settings.upgrades` entry, 1-based */
    this.levels = {};
    for (const id of Object.keys(settings.upgrades.tracks)) this.levels[id] = 1;
    this._load();
  }

  level(id) {
    return this.levels[id] ?? 1;
  }

  /** The number this upgrade gives at its current level. */
  value(id) {
    const track = settings.upgrades.tracks[id];
    return track.values[Math.min(track.values.length, this.level(id)) - 1];
  }

  /** Souls needed for the next level, or null at the top. */
  cost(id) {
    const track = settings.upgrades.tracks[id];
    const lv = this.level(id);
    return lv >= track.values.length ? null : track.costs[lv - 1];
  }

  addSouls(n) {
    this.souls += n;
    this._save();
  }

  /** Spend souls on the next level. Returns whether it happened. */
  buy(id) {
    const cost = this.cost(id);
    if (cost === null || this.souls < cost) return false;
    this.souls -= cost;
    this.levels[id] = this.level(id) + 1;
    this._save();
    return true;
  }

  reset() {
    this.souls = 0;
    for (const id of Object.keys(this.levels)) this.levels[id] = 1;
    this._save();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Number.isFinite(data.souls)) this.souls = Math.max(0, Math.floor(data.souls));
      for (const id of Object.keys(this.levels)) {
        const lv = data.levels?.[id];
        const max = settings.upgrades.tracks[id].values.length;
        if (Number.isFinite(lv)) this.levels[id] = Math.min(max, Math.max(1, Math.floor(lv)));
      }
    } catch {
      // No storage, or a stale shape: start fresh.
    }
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ souls: this.souls, levels: this.levels }));
    } catch {
      // Private mode: progress lasts the session.
    }
  }
}
