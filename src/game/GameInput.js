/**
 * The game's input: keyboard + mouse on desktop, a touch overlay on phones.
 *
 * It keeps the shape `ThirdPersonController` already reads (`sample()`,
 * `running`, `consumeJump`, `consumeAttack`), so movement goes through the
 * existing controller untouched, and adds the action buttons the combat layer
 * asks for by name. Buttons are held as state plus buffered edges — the same
 * contract as `core/Input.js`: a press between two frames is never lost, and a
 * press that is not consumed within `BUFFER` seconds expires instead of firing
 * a move the player asked for long ago.
 */

/** Seconds an unconsumed press stays valid. Generous enough to chain a combo. */
const BUFFER = 0.32;

export const BUTTONS = ['attack', 'dodge', 'guard', 'magic', 'special', 'lock', 'el0', 'el1', 'el2', 'weapon', 'sheath', 'kick', 'pause'];

const KEY_BUTTONS = {
  KeyC: 'sheath',
  KeyV: 'kick',
  KeyJ: 'attack',
  Space: 'dodge',
  KeyL: 'guard',
  KeyK: 'guard',
  KeyQ: 'magic',
  KeyU: 'magic',
  KeyR: 'special',
  KeyI: 'special',
  Tab: 'lock',
  Digit1: 'el0',
  Digit2: 'el1',
  Digit3: 'el2',
  KeyE: 'weapon',
  KeyF: 'weapon',
  Escape: 'pause',
  KeyP: 'pause'
};

const MOVE_KEYS = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0]
};

export class GameInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.axis = { x: 0, y: 0 };
    this.running = false;
    /** Raw stick from the touch overlay, -1..1. */
    this.stick = { x: 0, y: 0, active: false };
    this.keys = new Set();
    this.held = Object.fromEntries(BUTTONS.map((b) => [b, false]));
    /** Seconds since each buffered press; < 0 means none pending. */
    this._edges = Object.fromEntries(BUTTONS.map((b) => [b, -1]));
    this._released = Object.fromEntries(BUTTONS.map((b) => [b, false]));
    /** How long each button has been held, seconds. */
    this.holdTime = Object.fromEntries(BUTTONS.map((b) => [b, 0]));
    /** Camera drag accumulated since the last frame, in pixels. */
    this.look = { x: 0, y: 0 };
    /** A tap on the world (screen px) for lock-on, or null. */
    this.tap = null;
    /** Seconds since the camera was last steered by hand. */
    this.lookIdle = 99;
    this.enabled = true;

    this._onKeyDown = (event) => {
      if (isTyping(event.target)) return;
      const code = event.code;
      if (MOVE_KEYS[code] || code === 'Space' || code === 'Tab') event.preventDefault();
      if (event.repeat) return;
      this.keys.add(code);
      const button = KEY_BUTTONS[code];
      if (button) this.press(button);
    };
    this._onKeyUp = (event) => {
      this.keys.delete(event.code);
      const button = KEY_BUTTONS[event.code];
      if (button) this.release(button);
    };
    this._onBlur = () => {
      this.reset();
      this.onSuspend?.();
    };
    this._onVisibility = () => {
      if (document.hidden) this._onBlur();
    };

    // Mouse, the way a PC action game plays: the camera follows the mouse
    // (no button needed), the left button attacks (held, it charges the dash
    // cut) and the right button guards. A click also captures the pointer
    // where the browser allows it, so the cursor cannot leave the window
    // mid-turn; where it is refused, the camera follows the cursor anyway.
    this.pointerLocked = false;
    this.lockRefused = false;
    /** Set by the game: whether the mouse is steering right now (playing). */
    this.canLock = () => false;
    this._onPointerDown = (event) => {
      if (event.pointerType === 'touch') return;
      if (!this.canLock()) return;
      if (!this.pointerLocked && !this.lockRefused && canvas.requestPointerLock) {
        try {
          const request = canvas.requestPointerLock();
          if (request?.catch) request.catch(() => (this.lockRefused = true));
        } catch {
          this.lockRefused = true;
        }
      }
      if (event.button === 0) this.press('attack');
      else if (event.button === 2) this.press('guard');
      else if (event.button === 1) {
        event.preventDefault();
        this.press('lock');
        this.release('lock');
      }
    };
    this._onPointerUp = (event) => {
      if (event.pointerType === 'touch') return;
      if (event.button === 0) this.release('attack');
      else if (event.button === 2) this.release('guard');
    };
    this._onMouseMove = (event) => {
      if (event.pointerType === 'touch' || !this.canLock()) return;
      this.addLook(event.movementX || 0, event.movementY || 0);
    };
    this._onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      if (this.pointerLocked && !locked) this.onUnlock?.();
      this.pointerLocked = locked;
    };
    this._onLockError = () => {
      this.lockRefused = true;
    };
    this._onContext = (event) => event.preventDefault();
    // The wheel turns through the weapons; one notch, one weapon.
    this._wheelAt = 0;
    this._onWheel = (event) => {
      if (!this.canLock()) return;
      const now = performance.now();
      if (now - this._wheelAt < 220) return;
      this._wheelAt = now;
      this.press('weapon');
      this.release('weapon');
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibility);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
    canvas.addEventListener('contextmenu', this._onContext);
  }

  /** Give the pointer back (pause, menus). */
  unlockPointer() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  /* ---- fed by keyboard, mouse and the touch overlay ---- */

  press(button) {
    if (!this.enabled && button !== 'pause') return;
    if (!this.held[button]) this.holdTime[button] = 0;
    this.held[button] = true;
    this._edges[button] = 0;
  }

  release(button) {
    if (!this.held[button]) return;
    this.held[button] = false;
    this._released[button] = true;
  }

  addLook(dx, dy) {
    this.look.x += dx;
    this.look.y += dy;
    this.lookIdle = 0;
  }

  /* ---- read by the game ---- */

  /** Take a buffered press. */
  consume(button) {
    if (this._edges[button] < 0) return false;
    this._edges[button] = -1;
    return true;
  }

  /** Peek without taking it — for "is a press waiting to chain". */
  pending(button) {
    return this._edges[button] >= 0;
  }

  /** Take a release edge (for hold-to-charge moves). */
  consumeRelease(button) {
    const value = this._released[button];
    this._released[button] = false;
    return value;
  }

  consumeLook(out) {
    out.x = this.look.x;
    out.y = this.look.y;
    this.look.x = 0;
    this.look.y = 0;
    return out;
  }

  consumeTap() {
    const tap = this.tap;
    this.tap = null;
    return tap;
  }

  /** Once per frame, before anything reads the buttons. */
  tick(dt) {
    for (const button of BUTTONS) {
      if (this.held[button]) this.holdTime[button] += dt;
      if (this._edges[button] >= 0) {
        this._edges[button] += dt;
        if (this._edges[button] > BUFFER) this._edges[button] = -1;
      }
    }
    this.lookIdle += dt;
  }

  /**
   * Movement, camera-relative, as the controller expects it.
   *
   * The stick is analogue: a light push walks, past ~55% it runs at full
   * pace. On the keyboard the body runs by default and Shift walks — an action
   * game spends almost all of its time at a run.
   */
  sample() {
    let x = 0;
    let y = 0;
    if (this.enabled) {
      if (this.stick.active) {
        x = this.stick.x;
        y = this.stick.y;
      } else if (this.padAxis && ![...this.keys].some(code => MOVE_KEYS[code])) {
        x=this.padAxis.x;y=this.padAxis.y;
      } else {
        for (const code of this.keys) {
          const move = MOVE_KEYS[code];
          if (!move) continue;
          x += move[0];
          y += move[1];
        }
      }
    }

    const length = Math.hypot(x, y);
    if (this.stick.active) {
      this.running = length > 0.55;
      if (this.running && length > 0) {
        x /= length;
        y /= length;
      } else if (length > 0) {
        // Below the run threshold the stick is a walk whose pace follows the
        // push, never less than a third of it so a nudge still moves the body.
        const k = Math.min(1, Math.max(0.35, length / 0.55)) / length;
        x *= k;
        y *= k;
      }
    } else {
      if (length > 1) {
        x /= length;
        y /= length;
      }
      this.running = length > 0 && !(this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    }

    this.axis.x = x;
    this.axis.y = y;
    return this.axis;
  }

  get moving() {
    return this.axis.x !== 0 || this.axis.y !== 0;
  }

  /** The controller's jump/attack edges are not used in the game. */
  consumeJump() {
    return false;
  }

  consumeAttack() {
    return false;
  }

  reset() {
    this.tap = null;
    this.padAxis = null;
    this.axis.x = 0;
    this.axis.y = 0;
    this.running = false;
    this.keys.clear();
    for (const button of BUTTONS) {
      this.held[button] = false;
      this._edges[button] = -1;
      this._released[button] = false;
      this.holdTime[button] = 0;
    }
    this.stick.x = 0;
    this.stick.y = 0;
    this.stick.active = false;
    this.look.x = 0;
    this.look.y = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    this.canvas.removeEventListener('contextmenu', this._onContext);
  }
}

function isTyping(node) {
  return (
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement ||
    node instanceof HTMLSelectElement
  );
}
