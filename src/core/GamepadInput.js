/**
 * ゲームパッド — a standard-layout pad (Xbox / PlayStation / Switch Pro in a
 * browser) driving the game through the same doors the keyboard does.
 *
 * Every button is a key: a press dispatches the `keydown` that key would, and
 * the release its `keyup`, so holding (guard, 居合, absorb) and tapping (lock,
 * the arts) mean exactly what they do on a keyboard, and nothing in the game
 * has a pad branch — the same contract the touch buttons keep. The left stick
 * is the touch stick's analog input (`Input#setStick`), pushed to the rim it
 * runs; the right stick turns the camera.
 *
 * Over a menu (title, pause, clear, defeat, upgrades) the pad drives the menu
 * instead: up/down (pad or stick) moves the focus through the visible buttons
 * and sliders, left/right moves a slider, A presses, B goes back.
 *
 *   A attack (J) · B leap (Space) · X kick (E) · Y 飛燕/居合 (B)
 *   LB lock (L) · RB guard (K) · LT absorb (Z) · RT 無双 (Q)
 *   ↑ 雷切 (C) · ← 影走り (V) · → slash hit (R) · ↓ slide cut (T)
 *   R3 縮地 (X) · Back 強化 (U) · Start pause (P)
 */
const BUTTON_KEYS = {
  0: 'KeyJ',
  1: 'Space',
  2: 'KeyE',
  3: 'KeyB',
  4: 'KeyL',
  5: 'KeyK',
  6: 'KeyZ',
  7: 'KeyQ',
  8: 'KeyU',
  9: 'KeyP',
  11: 'KeyX',
  12: 'KeyC',
  13: 'KeyT',
  14: 'KeyV',
  15: 'KeyR'
};
const DEAD = 0.18;
const MENUS = '.upg:not([hidden]), .title:not([hidden]), .stage-clear:not([hidden]), .down:not([hidden])';

const dead = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class GamepadInput {
  /**
   * @param {object} options
   * @param {import('./Input.js').Input} options.input
   * @param {import('./CameraRig.js').CameraRig} options.rig
   * @param {() => number} options.sensitivity look multiplier
   * @param {(message: string) => void} [options.onConnect]
   */
  constructor({ input, rig, sensitivity, onConnect }) {
    this.input = input;
    this.rig = rig;
    this.sensitivity = sensitivity;
    this.held = new Map();
    this._stickOn = false;
    this._navAt = 0;
    this.connected = false;
    this._onConnect = (e) => {
      this.connected = true;
      onConnect?.(e.gamepad?.id ?? '');
    };
    this._onDisconnect = () => {
      this.connected = [...(navigator.getGamepads?.() ?? [])].some(Boolean);
      this._releaseAll();
    };
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
  }

  _pad() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  _key(code, down) {
    const was = this.held.get(code) === true;
    if (was === down) return;
    this.held.set(code, down);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  }

  _releaseAll() {
    for (const [code, down] of this.held) if (down) this._key(code, false);
    if (this._stickOn) this.input.setStick(0, 0);
    this._stickOn = false;
  }

  /** Once a frame, on real time. */
  update(raw) {
    if (!this.connected) return;
    const pad = this._pad();
    if (!pad) return;
    const pressed = (i) => !!pad.buttons[i]?.pressed;
    const menu = document.querySelector(MENUS);
    if (menu) {
      this._releaseAll();
      // Buttons already down when a menu opens (Start, say) are not presses in it.
      if (!this._menuHeld) this._menuHeld = { a: pressed(0), b: pressed(1), start: pressed(9) };
      this._menu(menu, pad, pressed);
      return;
    }
    if (this._menuHeld) {
      // Leaving a menu: whatever is still held (the A that pressed 再開) is
      // not a press in the game until it has been let go.
      this._suppress = new Set(Object.keys(BUTTON_KEYS).filter((i) => pressed(+i)));
      this._menuHeld = null;
    }
    for (const [i, code] of Object.entries(BUTTON_KEYS)) {
      const on = pressed(+i);
      if (this._suppress?.has(i)) {
        if (on) continue;
        this._suppress.delete(i);
      }
      this._key(code, on);
    }
    // A key just opened a menu (Start → pause): what is held now is not a
    // press in it, and anything pressed from here on is.
    if (document.querySelector(MENUS)) {
      this._menuHeld = { a: pressed(0), b: pressed(1), start: pressed(9) };
      this._releaseAll();
      return;
    }

    // Left stick: the analog walk; at the rim, the run (as the thumb stick).
    const lx = dead(pad.axes[0] ?? 0);
    const ly = dead(pad.axes[1] ?? 0);
    const m = Math.hypot(lx, ly);
    if (m > 0) {
      this.input.setStick(lx, -ly, m > 0.92 || pressed(10));
      this._stickOn = true;
    } else if (this._stickOn) {
      this.input.setStick(0, 0);
      this._stickOn = false;
    }

    // Right stick: the camera.
    const rx = dead(pad.axes[2] ?? 0);
    const ry = dead(pad.axes[3] ?? 0);
    if (rx || ry) {
      const k = 2.6 * raw * this.sensitivity();
      this.rig.look(-rx * k, -ry * k * 0.7);
    }
  }

  /** Menu navigation: focus, slide, press, back. */
  _menu(menu, pad, pressed) {
    const items = [...menu.querySelectorAll('button, input')].filter(
      (el) => !el.disabled && el.offsetParent !== null && !el.closest('[hidden]')
    );
    if (!items.length) return;
    const now = performance.now();
    const y = pressed(12) ? -1 : pressed(13) ? 1 : Math.abs(pad.axes[1] ?? 0) > 0.6 ? Math.sign(pad.axes[1]) : 0;
    const x = pressed(14) ? -1 : pressed(15) ? 1 : Math.abs(pad.axes[0] ?? 0) > 0.6 ? Math.sign(pad.axes[0]) : 0;
    let at = items.indexOf(document.activeElement);
    const edge = (name, on) => {
      const was = this._menuHeld?.[name];
      this._menuHeld = { ...this._menuHeld, [name]: on };
      return on && !was;
    };
    if ((y || x) && now - this._navAt > 170) {
      this._navAt = now;
      const el = items[at];
      if (x && el?.type === 'range') {
        el.value = String(Number(el.value) + x * Number(el.step || 0.1));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const step = y || x;
        at = at < 0 ? 0 : (at + step + items.length) % items.length;
        items[at].focus({ preventScroll: false });
      }
    }
    if (!y && !x) this._navAt = 0;
    if (edge('a', pressed(0))) {
      const el = at >= 0 ? items[at] : items[0];
      if (el.type === 'checkbox') {
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else el.click();
    }
    if (edge('b', pressed(1))) {
      const back = items.find((el) => el.dataset.act === 'back' || el.dataset.act === 'resume-game');
      if (back) back.click();
      else window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    }
    if (edge('start', pressed(9))) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p', bubbles: true }));
  }

  dispose() {
    this._releaseAll();
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
  }
}
