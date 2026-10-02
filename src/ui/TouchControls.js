/**
 * The touch overlay: a floating stick on the left, the action cluster on the
 * right, and the rest of the right half as a camera pad.
 *
 * It owns no game state — every touch is turned into a call on `GameInput`
 * (`press`/`release`/`addLook`, the stick axis, a tap point), so the combat
 * code reads a phone exactly as it reads a keyboard. Each finger is tracked by
 * its own pointer id, so moving, turning the camera and pressing a button can
 * all happen at once.
 */

const STICK_RADIUS = 58;

const LAYOUT = [
  { id: 'attack', glyph: '斬', label: '攻撃', cls: 'tc-btn--attack' },
  { id: 'dodge', glyph: '避', label: '回避', cls: 'tc-btn--dodge' },
  { id: 'guard', glyph: '守', label: 'ガード', cls: 'tc-btn--guard' },
  { id: 'magic', glyph: '術', label: '魔法', cls: 'tc-btn--magic' },
  { id: 'special', glyph: '奥義', label: '必殺', cls: 'tc-btn--special' },
  { id: 'lock', glyph: '◎', label: 'ロック', cls: 'tc-btn--lock' }
];

export class TouchControls {
  /** @param {import('../game/GameInput.js').GameInput} input */
  constructor(input, { visible = true } = {}) {
    this.input = input;
    this.root = document.createElement('div');
    this.root.className = 'tc';
    if (!visible) this.root.classList.add('tc--desktop');

    this.stickZone = div('tc-stick-zone', this.root);
    this.lookZone = div('tc-look-zone', this.root);
    this.base = div('tc-stick', this.root);
    this.knob = div('tc-stick__knob', this.base);

    this.cluster = div('tc-cluster', this.root);
    /** @type {Record<string, HTMLElement>} */
    this.buttons = {};
    for (const spec of LAYOUT) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tc-btn ${spec.cls}`;
      button.innerHTML = `<span class="tc-btn__glyph">${spec.glyph}</span><span class="tc-btn__label">${spec.label}</span>`;
      if (spec.id === 'special') {
        button.insertAdjacentHTML('afterbegin', '<svg class="tc-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/></svg>');
      }
      if (spec.id === 'magic') {
        button.insertAdjacentHTML('afterbegin', '<svg class="tc-ring tc-ring--mp" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/></svg>');
      }
      this.cluster.appendChild(button);
      this.buttons[spec.id] = button;
      this._bindButton(button, spec.id);
    }

    // The three elements, as small chips over the magic button.
    this.elements = div('tc-elements', this.cluster);
    this.chips = [];
    ['火', '雷', '氷'].forEach((glyph, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `tc-chip tc-chip--${index}`;
      chip.textContent = glyph;
      this.elements.appendChild(chip);
      this.chips.push(chip);
      this._bindButton(chip, `el${index}`);
    });

    this.pause = document.createElement('button');
    this.pause.type = 'button';
    this.pause.className = 'tc-pause';
    this.pause.innerHTML = '<i></i><i></i>';
    this.root.appendChild(this.pause);
    this._bindButton(this.pause, 'pause');

    this._stickId = null;
    this._stickOrigin = { x: 0, y: 0 };
    this._looks = new Map();
    this._bindStick();
    this._bindLook();

    document.body.appendChild(this.root);
  }

  _bindButton(element, name) {
    const down = (event) => {
      event.preventDefault();
      event.stopPropagation();
      element.setPointerCapture?.(event.pointerId);
      element.classList.add('is-down');
      this.input.press(name);
    };
    const up = (event) => {
      event.preventDefault();
      element.classList.remove('is-down');
      this.input.release(name);
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('lostpointercapture', () => {
      if (element.classList.contains('is-down')) up(new Event('pointerup'));
    });
    element.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  _bindStick() {
    const zone = this.stickZone;
    zone.addEventListener('pointerdown', (event) => {
      if (this._stickId !== null) return;
      event.preventDefault();
      zone.setPointerCapture?.(event.pointerId);
      this._stickId = event.pointerId;
      this._stickOrigin.x = event.clientX;
      this._stickOrigin.y = event.clientY;
      this.base.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      this.base.classList.add('is-active');
      this.knob.style.transform = 'translate(0px, 0px)';
      this.input.stick.active = true;
      this.input.stick.x = 0;
      this.input.stick.y = 0;
    });
    zone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this._stickId) return;
      let dx = event.clientX - this._stickOrigin.x;
      let dy = event.clientY - this._stickOrigin.y;
      const length = Math.hypot(dx, dy);
      // A thumb that drags past the rim pulls the base along behind it, so the
      // stick never needs re-centring mid-fight.
      if (length > STICK_RADIUS * 1.35) {
        const k = (length - STICK_RADIUS * 1.35) / length;
        this._stickOrigin.x += dx * k;
        this._stickOrigin.y += dy * k;
        this.base.style.transform = `translate(${this._stickOrigin.x}px, ${this._stickOrigin.y}px)`;
        dx = event.clientX - this._stickOrigin.x;
        dy = event.clientY - this._stickOrigin.y;
      }
      const clamped = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;
      this.knob.style.transform = `translate(${kx * STICK_RADIUS}px, ${ky * STICK_RADIUS}px)`;
      // A small dead zone, so a resting thumb does not creep.
      const live = clamped < 0.12 ? 0 : clamped;
      this.input.stick.x = live ? Math.cos(angle) * live : 0;
      this.input.stick.y = live ? -Math.sin(angle) * live : 0;
    });
    const end = (event) => {
      if (event.pointerId !== this._stickId) return;
      this._stickId = null;
      this.base.classList.remove('is-active');
      this.input.stick.active = false;
      this.input.stick.x = 0;
      this.input.stick.y = 0;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  _bindLook() {
    const zone = this.lookZone;
    zone.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      zone.setPointerCapture?.(event.pointerId);
      this._looks.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        sx: event.clientX,
        sy: event.clientY,
        t: performance.now()
      });
    });
    zone.addEventListener('pointermove', (event) => {
      const look = this._looks.get(event.pointerId);
      if (!look) return;
      this.input.addLook(event.clientX - look.x, event.clientY - look.y);
      look.x = event.clientX;
      look.y = event.clientY;
    });
    const end = (event) => {
      const look = this._looks.get(event.pointerId);
      if (!look) return;
      this._looks.delete(event.pointerId);
      const moved = Math.hypot(event.clientX - look.sx, event.clientY - look.sy);
      if (moved < 10 && performance.now() - look.t < 280) {
        this.input.tap = { x: event.clientX, y: event.clientY };
      }
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  /**
   * Reflect the game's state on the buttons: which element is up, how full
   * the gauges are, and what the attack button means right now.
   */
  sync(state) {
    const { element, special, mp, mpCost, execute, locked, guard, available } = state;
    this.chips.forEach((chip, index) => {
      chip.classList.toggle('is-selected', index === element);
      chip.classList.toggle('is-locked', !available?.[index]);
    });
    this.buttons.magic.dataset.element = String(element);
    this.buttons.magic.classList.toggle('is-off', mp < mpCost);
    setRing(this.buttons.magic, Math.min(1, mp / 100));
    setRing(this.buttons.special, special);
    this.buttons.special.classList.toggle('is-ready', special >= 1);
    this.buttons.attack.classList.toggle('is-execute', Boolean(execute));
    this.buttons.attack.querySelector('.tc-btn__glyph').textContent = execute ? '処' : '斬';
    this.buttons.attack.querySelector('.tc-btn__label').textContent = execute ? '処刑' : '攻撃';
    this.buttons.lock.classList.toggle('is-on', Boolean(locked));
    this.buttons.guard.classList.toggle('is-on', Boolean(guard));
  }

  setVisible(visible) {
    this.root.classList.toggle('is-hidden', !visible);
    if (!visible) {
      this.input.stick.active = false;
      this._stickId = null;
      this.base.classList.remove('is-active');
    }
  }

  dispose() {
    this.root.remove();
  }
}

function div(className, parent) {
  const element = document.createElement('div');
  element.className = className;
  parent.appendChild(element);
  return element;
}

function setRing(button, fraction) {
  const circle = button.querySelector('.tc-ring circle');
  if (!circle) return;
  const length = 289;
  const value = `${(length * Math.max(0, Math.min(1, fraction))).toFixed(1)} ${length}`;
  if (circle.dataset.v !== value) {
    circle.dataset.v = value;
    circle.style.strokeDasharray = value;
  }
}
