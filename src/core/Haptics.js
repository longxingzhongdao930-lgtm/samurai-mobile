/**
 * 振動 — a short buzz on the blows that matter (a parry, a hit taken, an
 * execution, a roar), on phones that can (`navigator.vibrate`: Android
 * browsers; iOS Safari has none, and it is simply silent there).
 *
 * Patterns are milliseconds, on/off alternating. A new pulse within a short
 * gap of the last is dropped, so a crowd's blows do not become one long rattle.
 */
export class Haptics {
  constructor() {
    this.enabled = true;
    this.supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    this._last = 0;
    /** Every pattern asked for, newest last — for the tests. */
    this.log = [];
  }

  /** @param {number|number[]} pattern */
  pulse(pattern) {
    if (!this.enabled) return false;
    const now = performance.now();
    if (now - this._last < 90) return false;
    this._last = now;
    this.log.push(pattern);
    if (this.log.length > 20) this.log.shift();
    if (!this.supported) return false;
    try {
      return navigator.vibrate(pattern);
    } catch {
      return false;
    }
  }
}
