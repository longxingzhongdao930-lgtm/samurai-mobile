import { ABILITIES } from '../config/abilities.js';
import { createIcon } from './icons.js';
import { isDevMode } from '../utils/device.js';

/**
 * The touch layout: a stick under the left thumb, the moves under the right.
 *
 * It adds no second way of doing anything. Every button *is* its key — a press
 * dispatches the same `keydown`/`keyup` pair on `window` that the keyboard
 * would, so `core/Input.js` buffers it and `core/App.js` handles it exactly as
 * it handles the real key, refusals and toasts included. The one thing that is
 * not a key is the stick, which is analog and goes straight into
 * `Input#setStick`.
 *
 * The buttons are drawn from `config/abilities.js`, like the desktop row: a
 * move added there gets a button here with no edit to this file. The category
 * decides where it goes and what shape it is, on the same terms `ActionHUD`
 * uses — the leap is the big round button under the thumb, the techniques are
 * lacquer plates on an arc around it, the abilities are seals on a wider arc
 * behind them, and the studio key sits with the window's own keys up top.
 *
 * The camera is left alone. A drag on the open canvas already orbits it (three's
 * OrbitControls speaks touch), a pinch zooms it (`CameraRig`), and a tap on a
 * body marks it (`TargetMarking`) — so the right side of the screen is the
 * stage, and only the buttons themselves take the pointer.
 */

/**
 * Ability id → where its button goes. Anything unlisted goes by category.
 * The big button under the thumb is the normal string — the one pressed most,
 * by far, in a crowd. The leap takes a place on the techniques' arc.
 */
const PRIMARY = 'combo';
/** The button that turns into the loose while the body is in the air. */
const LEAP = 'leap';
const TOP_BAR = new Set(['customize']);

/** The window's own keys — not moves, so not in `config/abilities.js`. */
const UTILITIES = [
  { id: 'pause', label: 'Pause', code: 'KeyP', glyph: '‖' },
  // The editor exists in developer mode only (`?dev=1`).
  ...(isDevMode() ? [{ id: 'editor', label: 'Editor', code: 'KeyG', glyph: '⚙' }] : []),
  // Tap: lock / next. Hold: let go (decided by the app on release).
  { id: 'lock', label: 'Lock', code: 'KeyL', glyph: '◎' }
];

/**
 * The stick. Pushes shorter than `DEAD` are a resting thumb; the walk reaches
 * full pace at `WALK_FULL`, and past `RUN` the body runs.
 */
const DEAD = 0.14;
const WALK_FULL = 0.68;
const RUN = 0.9;

/**
 * Arcs the moves are laid on, in degrees counter-clockwise from the thumb's
 * right: 180 is straight left of the leap, 90 straight above it.
 */
const ARCS = {
  technique: { from: 194, to: 76 },
  ability: { from: 176, to: 92 }
};

export class MobileControls {
  /**
   * @param {object} options
   * @param {import('../core/Input.js').Input} options.input
   * @param {HTMLElement} [options.parent]
   */
  constructor({ input, parent = document.body }) {
    this.input = input;

    this.element = document.createElement('div');
    this.element.className = 'mc';

    /** @type {Map<string, HTMLButtonElement>} ability id → button */
    this.buttons = new Map();
    /** Last state written per id, so an unchanged frame touches no DOM. */
    this._state = new Map();
    this._airborne = null;
    /** Keys a button is holding down right now, so a lost pointer can let go. */
    this._held = new Set();

    this._buildStick();
    this._buildActions();
    this._buildBar();

    parent.appendChild(this.element);
    document.documentElement.classList.add('touch-ui');

    // A long press would otherwise open the system menu over the stage, and a
    // two-finger gesture would zoom the page instead of the camera.
    this._onContextMenu = (event) => event.preventDefault();
    this._onGesture = (event) => event.preventDefault();
    this._onReset = () => this.reset();
    this._onVisibility = () => {
      if (document.hidden) this.reset();
    };
    this.element.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('gesturestart', this._onGesture, { passive: false });
    window.addEventListener('blur', this._onReset);
    window.addEventListener('orientationchange', this._onReset);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  /* ------------------------------------------------------------------ */
  /* build                                                               */
  /* ------------------------------------------------------------------ */

  _buildStick() {
    const zone = el('div', 'mc-stick');
    const base = el('div', 'mc-stick__base');
    const knob = el('div', 'mc-stick__knob');
    base.appendChild(knob);
    zone.appendChild(base);
    this.element.appendChild(zone);

    this.stick = { zone, base, knob, id: null, ox: 0, oy: 0 };

    zone.addEventListener('pointerdown', (event) => {
      if (this.stick.id !== null) return;
      event.preventDefault();
      this.stick.id = event.pointerId;
      capture(zone, event.pointerId);

      // A floating stick: it comes to the thumb rather than asking the thumb
      // to find it. Clamped so the ring never hangs off the edge of the zone.
      const box = zone.getBoundingClientRect();
      const half = base.offsetWidth / 2;
      const x = clampTo(event.clientX, box.left + half, box.right - half);
      const y = clampTo(event.clientY, box.top + half, box.bottom - half);
      this.stick.ox = x;
      this.stick.oy = y;
      base.style.left = `${x - box.left - half}px`;
      base.style.top = `${y - box.top - half}px`;
      base.style.bottom = 'auto';
      base.classList.add('is-active');
      this._moveStick(event.clientX, event.clientY);
    });

    zone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stick.id) return;
      event.preventDefault();
      this._moveStick(event.clientX, event.clientY);
    });

    const end = (event) => {
      if (event.pointerId !== this.stick.id) return;
      this._releaseStick();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  _moveStick(clientX, clientY) {
    const { base, knob } = this.stick;
    const radius = base.offsetWidth * 0.42;
    let dx = clientX - this.stick.ox;
    let dy = clientY - this.stick.oy;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx *= radius / length;
      dy *= radius / length;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;

    // Raw push, 0..1, and the pace it asks for. The walk is rescaled past the
    // dead zone so it starts from a crawl rather than jumping in at 14%.
    const push = Math.min(1, length / radius);
    const pace = push < DEAD ? 0 : Math.min(1, (push - DEAD) / (WALK_FULL - DEAD));
    const run = push >= RUN;
    base.classList.toggle('is-running', run);

    if (pace === 0) {
      this.input.setStick(0, 0, false);
      return;
    }
    // Screen y grows downward; the controller's y is forward.
    const nx = dx / (Math.hypot(dx, dy) || 1);
    const ny = dy / (Math.hypot(dx, dy) || 1);
    this.input.setStick(nx * pace, -ny * pace, run);
  }

  _releaseStick() {
    const { base, knob } = this.stick;
    this.stick.id = null;
    knob.style.transform = '';
    base.style.left = '';
    base.style.top = '';
    base.style.bottom = '';
    base.classList.remove('is-active', 'is-running');
    this.input.setStick(0, 0, false);
  }

  _buildActions() {
    const cluster = el('div', 'mc-actions');
    this.element.appendChild(cluster);

    const byCategory = { technique: [], ability: [] };
    for (const ability of ABILITIES) {
      if (TOP_BAR.has(ability.id)) continue;
      if (ability.id === PRIMARY) {
        const button = this._button(ability, 'mc-leap');
        cluster.appendChild(button);
        continue;
      }
      (byCategory[ability.category] ?? byCategory.technique).push(ability);
    }

    for (const [category, list] of Object.entries(byCategory)) {
      const arc = ARCS[category];
      list.forEach((ability, index) => {
        const button = this._button(ability, category === 'ability' ? 'mc-seal' : 'mc-plate');
        const t = list.length > 1 ? index / (list.length - 1) : 0.5;
        const angle = ((arc.from + (arc.to - arc.from) * t) * Math.PI) / 180;
        // Unitless, so the stylesheet can scale the arc per screen size with
        // one radius and every button follows.
        button.style.setProperty('--cx', Math.cos(angle).toFixed(4));
        button.style.setProperty('--cy', (-Math.sin(angle)).toFixed(4));
        cluster.appendChild(button);
      });
    }
  }

  _buildBar() {
    const bar = el('div', 'mc-bar');
    for (const ability of ABILITIES) {
      if (TOP_BAR.has(ability.id)) bar.appendChild(this._button(ability, 'mc-util'));
    }
    for (const utility of UTILITIES) {
      const button = this._keyButton(utility.code, 'mc-util', utility.label);
      button.dataset.util = utility.id;
      const glyph = el('span', 'mc-util__glyph');
      glyph.textContent = utility.glyph;
      button.append(glyph, text('mc-util__name', utility.label));
      bar.appendChild(button);
    }
    this.element.appendChild(bar);
  }

  /** A button for a move: its icon over its name, pressing its key. */
  _button(ability, className) {
    const button = this._keyButton(ability.code, className, ability.label);
    button.dataset.id = ability.id;
    const name = text('mc-name', ability.label);
    button.append(createIcon(ability.id, 'mc-icon'), name);
    button._name = name;
    this.buttons.set(ability.id, button);
    return button;
  }

  /** A bare button that is a key: down on touch, up on release. */
  _keyButton(code, className, label) {
    const button = document.createElement('button');
    button.type = 'button';
    /** When a finger last pressed it — the click that follows is the same press. */
    let pressedAt = -Infinity;
    button.className = `mc-btn ${className}`;
    button.setAttribute('aria-label', label);

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      // Not the canvas's: a press on a button is not an orbit, and not a tap
      // on whatever body happens to be standing behind it.
      event.stopPropagation();
      capture(button, event.pointerId);
      pressedAt = performance.now();
      button.classList.add('is-down');
      this._key('keydown', code);
      navigator.vibrate?.(8);
    });
    const up = () => {
      if (!button.classList.contains('is-down')) return;
      button.classList.remove('is-down');
      this._key('keyup', code);
    };
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
    // Keyboard and switch access: a click with no pointer behind it. A tap
    // also ends in a click, and some browsers report it with `detail` 0 too,
    // so one that trails a press is that press and is not sent twice.
    button.addEventListener('click', (event) => {
      if (event.detail !== 0 || performance.now() - pressedAt < 1000) return;
      this._key('keydown', code);
      this._key('keyup', code);
    });
    return button;
  }

  /** The key itself, on `window` — where both `Input` and `App` listen. */
  _key(type, code) {
    if (type === 'keydown') this._held.add(code);
    else this._held.delete(code);
    window.dispatchEvent(
      new KeyboardEvent(type, { code, key: KEY_NAMES[code] ?? code, bubbles: true, cancelable: true })
    );
  }

  /* ------------------------------------------------------------------ */
  /* per frame                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * The same states the desktop row is given (`App#_syncAbilities`), so the
   * buttons light and dim on exactly the frames the plates do.
   *
   * @param {Record<string, 'ready'|'active'|'off'>} state
   * @param {boolean} airborne in the air the leap button is the loose, and
   *   says so — the key underneath it is the same Space either way
   */
  update(state, airborne = false) {
    if (airborne !== this._airborne) {
      this._airborne = airborne;
      const leap = this.buttons.get(LEAP);
      if (leap) {
        leap._name.textContent = airborne ? 'Loose' : 'Leap';
        leap.setAttribute('aria-label', airborne ? 'Loose the blades' : 'Leap');
      }
    }

    for (const [id, button] of this.buttons) {
      let next = state[id] ?? 'off';
      if (id === LEAP && airborne) next = 'ready';
      if (this._state.get(id) === next) continue;
      this._state.set(id, next);
      button.classList.toggle('is-active', next === 'active');
      button.classList.toggle('is-off', next === 'off');
      button.classList.toggle('is-charging', next === 'charging');
    }
  }

  /** Light the Lock button while a lock is held. */
  setLocked(locked) {
    if (locked === this._locked) return;
    this._locked = locked;
    this.element.querySelector('.mc-util[data-util="lock"]')?.classList.toggle('is-active', locked);
  }

  /** A gauge round one button, 0..1 — the Musou's. Same contract as `ActionHUD#setGauge`. */
  setGauge(id, value) {
    const button = this.buttons.get(id);
    if (!button) return;
    const v = Math.round(Math.max(0, Math.min(1, value)) * 200) / 200;
    if (button._gauge === v) return;
    button._gauge = v;
    button.classList.add('has-gauge');
    button.style.setProperty('--gauge', String(v));
    button.classList.toggle('is-full', v >= 1);
  }

  /** Let go of everything: the stick, and any key a lost finger was holding. */
  reset() {
    this._releaseStick();
    for (const code of [...this._held]) this._key('keyup', code);
    for (const button of this.element.querySelectorAll('.is-down')) {
      button.classList.remove('is-down');
    }
  }

  dispose() {
    this.reset();
    this.element.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('gesturestart', this._onGesture);
    window.removeEventListener('blur', this._onReset);
    window.removeEventListener('orientationchange', this._onReset);
    document.removeEventListener('visibilitychange', this._onVisibility);
    document.documentElement.classList.remove('touch-ui');
    this.buttons.clear();
    this._state.clear();
    this.element.remove();
  }
}

/** `KeyboardEvent.key` for the codes a button can send — some listeners read it. */
const KEY_NAMES = { Space: ' ', Tab: 'Tab', Escape: 'Escape' };

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function text(className, value) {
  const node = el('span', className);
  node.textContent = value;
  return node;
}

function clampTo(value, min, max) {
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value));
}

/** Keep the finger's events on this element even when it slides off it. */
function capture(node, pointerId) {
  try {
    node.setPointerCapture?.(pointerId);
  } catch {
    // Some embedded WebViews report a pointer that can no longer be captured.
    // The element still gets its events while the finger stays over it.
  }
}
