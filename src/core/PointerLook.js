import { settings } from '../config/settings.js';

/**
 * PC mouse look: one click on the game takes the pointer, and from then on
 * moving the mouse turns the view — no drag. `Esc` gives the cursor back.
 *
 * The design is the reference third-person template's (`PointerLook` there):
 * while the pointer is captured the orbit drag is stood down
 * (`CameraRig#setPointerLocked`) and the mouse deltas go to `CameraRig#look`;
 * while it is free — any menu, the editor, the studio — the drag comes back,
 * so nothing is lost by pressing `Esc`.
 *
 * It matters more here than there: the left button is the attack, so with the
 * drag the only way to turn the camera with the left hand on the mouse was a
 * press that also swung the sword. Captured, turning and cutting are separate.
 *
 * The press that takes the pointer is spent on taking it (stopped in the
 * capture phase before the canvas's listeners see it) — it is not also a swing.
 * If the browser refuses the lock twice (an embedded frame, a policy), this
 * stands itself down for the session and the old drag + click behaviour stays.
 *
 * Desktop only: a phone never builds one.
 */
export class PointerLook {
  /**
   * @param {object} options
   * @param {HTMLElement} options.domElement
   * @param {import('./CameraRig.js').CameraRig} options.rig
   * @param {() => boolean} [options.blocked] something else wants the cursor now
   */
  constructor({ domElement, rig, blocked = () => false }) {
    this.domElement = domElement;
    this.rig = rig;
    this.blocked = blocked;
    this.locked = false;
    this._failures = 0;

    this.hint = document.createElement('p');
    this.hint.className = 'look-hint';
    this.hint.setAttribute('aria-hidden', 'true');
    this.hint.textContent = 'クリックで視点操作 · Esc でカーソル';
    document.body.appendChild(this.hint);
    this._hinted = null;

    this._onPointerDown = (event) => {
      if (this.locked || !this.active || event.target !== domElement) return;
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      event.stopPropagation();
      this.capture();
    };
    this._onPointerMove = (event) => {
      if (!this.locked) return;
      const k = settings.camera.sensitivity;
      this.rig.look(event.movementX * k, -event.movementY * k);
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === domElement;
      this.rig.setPointerLocked(this.locked);
    };
    this._onLockError = () => {
      this._failures++;
    };
    window.addEventListener('pointerdown', this._onPointerDown, true);
    window.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
  }

  /** Whether the pointer may be taken at all. */
  get active() {
    return (
      settings.camera.pointerLock &&
      this._failures < 2 &&
      typeof this.domElement.requestPointerLock === 'function' &&
      !this.blocked()
    );
  }

  capture() {
    if (this.locked || !this.active) return;
    try {
      const claim = this.domElement.requestPointerLock();
      claim?.catch?.(() => {
        this._failures++;
      });
    } catch {
      this._failures++;
    }
  }

  release() {
    if (document.pointerLockElement === this.domElement) document.exitPointerLock();
  }

  /** Once a frame: hand the cursor back to a menu that came up, and keep the hint honest. */
  update() {
    if (this.locked && !this.active) this.release();
    const wanted = this.active && !this.locked;
    if (wanted === this._hinted) return;
    this._hinted = wanted;
    this.hint.classList.toggle('is-live', wanted);
  }

  dispose() {
    this.release();
    window.removeEventListener('pointerdown', this._onPointerDown, true);
    window.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    this.hint.remove();
  }
}
