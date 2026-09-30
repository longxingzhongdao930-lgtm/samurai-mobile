import { MathUtils, PerspectiveCamera, Spherical, Vector3, MOUSE, TOUCH } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { settings } from '../config/settings.js';
import { clamp, damp } from '../utils/math.js';
import { LAYER } from './Layers.js';

const _dir = new Vector3();
const _spherical = new Spherical();
const _desiredTarget = new Vector3();
const _follow = new Vector3(); // how far the target moved this frame

/**
 * Third-person orbit rig.
 *
 * The distance always resolves back to `settings.camera.distance`, so framing
 * stays consistent no matter where the orbit target drifts. The wheel zooms by
 * writing that same setting rather than by moving the camera, which keeps the
 * settings file the single source of truth — set `distance` from anywhere and
 * the rig glides to it.
 */
export class CameraRig {
  constructor(domElement) {
    this.camera = new PerspectiveCamera(
      settings.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
    // Behind the character and slightly off axis, so the opening frame looks out
    // *into the moon* — which is the shot every backlit thing in this scene (the
    // haze's inscatter, the ground mist, the silver on the clouds) is built for.
    // Only the direction matters: the rig resolves the distance back to
    // `settings.camera.distance` on the first update.
    this.camera.position.set(1.7, 2.3, -5.4);
    this.camera.layers.enable(LAYER.VFX);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.enableZoom = false; // the wheel drives `settings.camera.distance` instead
    this.controls.minPolarAngle = settings.camera.minPolar;
    this.controls.maxPolarAngle = settings.camera.maxPolar;
    this.controls.rotateSpeed = 0.65;

    // Either button orbits: nothing here needs the left one for anything else.
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: null, RIGHT: MOUSE.ROTATE };
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE };

    /** The point the rig orbits around — the character's feet. */
    this.anchor = new Vector3(0, 0, 0);

    /**
     * Impact shake: how much is left of it, and where it put the lens last
     * frame.
     *
     * Held as an offset that is *taken back off* the camera at the top of the
     * next update rather than baked into the position. OrbitControls reads its
     * own orbit back out of `camera.position` every frame, so a shake left in
     * there would be mistaken for the user dragging and the whole rig would
     * walk away from its target.
     */
    this._shake = 0;
    this._shakeOffset = new Vector3();
    this._shakeSeed = Math.random() * 100;

    /**
     * The impact *punch*: the lens pushed along the blow and back, the field of
     * view closing a little, and a touch of roll — the direction a shake does
     * not have. `_punchT` counts up from the hit; the envelope is a fast rise
     * and an exponential return, so it reads as a knock rather than a drift.
     */
    this._punchDir = new Vector3();
    this._punchAmount = 0;
    this._punchT = 1;
    this._punchRoll = 0;
    this._punchFov = 0;

    /** Lock-on: the point to keep in frame, and when the player last dragged. */
    this._lock = null;
    this._manualAt = -Infinity;
    /** Mouse-look deltas since the last frame (`look`), and who owns the orbit. */
    this._lookYaw = 0;
    this._lookPitch = 0;
    this.pointerLocked = false;
    this.parked = false;
    this._onManual = (event) => {
      if (event.buttons || event.pointerType === 'touch') this._manualAt = performance.now();
    };
    domElement.addEventListener('pointermove', this._onManual);

    this.controls.target.set(0, settings.camera.targetHeight, 0);
    this.controls.update();

    // Actual distance, eased toward `settings.camera.distance` so a wheel flick
    // glides instead of snapping.
    this.distance = settings.camera.distance;

    this.domElement = domElement;
    this._onWheel = this._onWheel.bind(this);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });

    /**
     * Pinch zoom — the wheel's twin on a touch screen.
     *
     * OrbitControls' own dolly is switched off (it would move the camera, not
     * the setting), so two fingers are tracked here and their spread writes
     * `settings.camera.distance` the same way a wheel notch does. The controls
     * still see both fingers and turn the orbit by their midpoint, which is the
     * two-finger rotate every touch map does.
     *
     * @type {Map<number, {x: number, y: number}>}
     */
    this._touches = new Map();
    this._pinch = 0;
    this._onTouchDown = (event) => {
      if (event.pointerType !== 'touch') return;
      this._touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this._pinch = this._spread();
    };
    this._onTouchMove = (event) => {
      const touch = this._touches.get(event.pointerId);
      if (!touch) return;
      touch.x = event.clientX;
      touch.y = event.clientY;
      if (this._touches.size !== 2 || !this.controls.enabled) return;

      const spread = this._spread();
      if (this._pinch > 0 && spread > 0) {
        // Plain ratio, not the wheel's `zoomSpeed`: fingers spread twice as
        // far apart should bring the body twice as close, and no more.
        const cam = settings.camera;
        cam.distance = clamp(
          cam.distance * (this._pinch / spread),
          cam.minDistance,
          cam.maxDistance
        );
      }
      this._pinch = spread;
    };
    this._onTouchUp = (event) => {
      if (!this._touches.delete(event.pointerId)) return;
      this._pinch = this._spread();
    };
    domElement.addEventListener('pointerdown', this._onTouchDown);
    domElement.addEventListener('pointermove', this._onTouchMove);
    domElement.addEventListener('pointerup', this._onTouchUp);
    domElement.addEventListener('pointercancel', this._onTouchUp);

    /**
     * Let the run key coexist with the orbit.
     *
     * OrbitControls reads ctrl/meta/shift on pointer-down and turns a rotate
     * drag into a pan — but panning is off, so it bails and the drag does
     * nothing at all. Holding Shift to run would therefore lock the camera
     * until the button came back up. The modifier gesture has no use here, so
     * the flags are masked off on the way in. Capture on `window` runs before
     * the controls' own listener on the canvas; the mask is per-event, so the
     * real keyboard state the character reads is untouched.
     */
    this._onPointerDownCapture = (event) => {
      if (event.target !== domElement) return;
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) return;
      for (const flag of ['shiftKey', 'ctrlKey', 'metaKey']) {
        Object.defineProperty(event, flag, { value: false, configurable: true });
      }
    };
    window.addEventListener('pointerdown', this._onPointerDownCapture, true);
  }

  /** Wheel zoom. Multiplicative, so each notch feels the same at any distance. */
  _onWheel(event) {
    // The character screen parks this rig and takes the pointer; a wheel meant
    // for its own camera must not also dolly the one nobody is looking through.
    if (this.parked) return;
    event.preventDefault();

    const cam = settings.camera;
    // Firefox reports lines (deltaMode 1) and pages (2) rather than pixels.
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    const delta = (event.deltaY * scale) / 100;

    cam.distance = clamp(
      cam.distance * Math.exp(delta * 0.12 * cam.zoomSpeed),
      cam.minDistance,
      cam.maxDistance
    );
  }

  /** Pixels between the two fingers on the canvas, or 0 unless there are exactly two. */
  _spread() {
    if (this._touches.size !== 2) return 0;
    const [a, b] = this._touches.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Keep a point in frame (lock-on), or null to let the orbit be. */
  setLockTarget(point) {
    this._lock = point;
  }

  /** Point the rig should orbit around (character position). */
  setAnchor(x, y, z) {
    this.anchor.set(x, y, z);
  }

  /**
   * Where the camera sits around the target, radians from +Z.
   *
   * This is the frame movement input is resolved in: "forward" is away from the
   * camera, so orbiting the rig re-aims the controls.
   */
  get azimuth() {
    return this.controls.getAzimuthalAngle();
  }

  /**
   * Kick the lens, in metres. Takes the loudest of whatever is asked for in one
   * frame rather than summing — two impacts do not shake twice as hard.
   */
  shake(amount) {
    this._shake = Math.max(this._shake, amount);
  }

  /**
   * Push the lens along a blow: `(x, z)` is its direction on the ground,
   * `amount` metres at the peak. Takes the loudest, like `shake`.
   */
  punch(x, z, amount, fovKick = 0, roll = 0) {
    if (amount < this._punchAmount * this._punchEnvelope()) return;
    this._punchDir.set(x, -0.25, z).normalize();
    this._punchAmount = amount;
    this._punchFov = fovKick;
    // Rolled against the side the blow travels to, randomly signed when it is
    // dead ahead, so repeated hits do not all lean the same way.
    this._punchRoll = roll * (Math.random() < 0.5 ? -1 : 1);
    this._punchT = 0;
  }

  /** 0 → 1 in 35 ms, then back to 0 on a ~70 ms exponential. */
  _punchEnvelope() {
    const t = this._punchT;
    const rise = 0.035;
    return t < rise ? t / rise : Math.exp(-(t - rise) * 14);
  }

  /**
   * The shake itself: two frequencies per axis so it never reads as a wobble,
   * decaying to nothing in about a third of a second.
   */
  _applyShake(dt) {
    // Real time, so a hit-stop does not also freeze the shake it triggered —
    // the lens keeps moving while the world holds still, which is exactly the
    // effect the pair is going for.
    this._shake = Math.max(0, this._shake - this._shake * Math.min(1, dt * 9) - dt * 0.02);
    if (this._shake <= 1e-4) return this._shakeOffset.set(0, 0, 0);

    const t = (performance.now() * 0.001 + this._shakeSeed) * 42;
    this._shakeOffset.set(
      (Math.sin(t) + Math.sin(t * 1.7)) * 0.5,
      (Math.sin(t * 1.3 + 2.1) + Math.sin(t * 2.3)) * 0.5,
      (Math.sin(t * 0.9 + 4.2) + Math.sin(t * 1.9)) * 0.5
    );
    return this._shakeOffset.multiplyScalar(this._shake);
  }

  update(dt) {
    const cam = settings.camera;

    // Undo last frame's shake before the controls see the position.
    this.camera.position.sub(this._shakeOffset);

    // Real time, like the shake: the knock lands while the world is frozen.
    this._punchT += dt;
    const punch = this._punchEnvelope();
    const fov = cam.fov - this._punchFov * punch;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.minPolarAngle = cam.minPolar;
    this.controls.maxPolarAngle = cam.maxPolar;

    _desiredTarget.copy(this.anchor);
    _desiredTarget.y += cam.targetHeight;

    const target = this.controls.target;
    _follow.set(
      damp(target.x, _desiredTarget.x, cam.damping, dt) - target.x,
      damp(target.y, _desiredTarget.y, cam.damping, dt) - target.y,
      damp(target.z, _desiredTarget.z, cam.damping, dt) - target.z
    );
    target.add(_follow);

    /**
     * Carry the lens with the target, rather than letting the target slide out
     * from under it.
     *
     * OrbitControls re-derives its orbit from `camera.position` every frame: it
     * measures the offset against wherever the target is *now*, so moving the
     * target alone leaves the camera standing still in world space and quietly
     * rewrites the angles it is standing at. Run away from a top-down view and
     * the direction from target to camera swings toward the horizontal and
     * toward the back of the body — which the distance enforcement below then
     * pulls the lens along, ending in a chase shot nobody asked for.
     *
     * Translating the camera by the same delta keeps the offset vector
     * identical, so the azimuth, the pitch and the distance all survive the
     * follow and the only thing that ever changes them is the player's hand.
     */
    this.camera.position.add(_follow);

    // Lock-on: ease the orbit round until the camera sits behind the
    // character on the line from the locked body — unless the player has had
    // a hand on the lens in the last `manualHold` seconds.
    const lock = settings.lockOn;
    if (this._lock && performance.now() - this._manualAt > lock.manualHold * 1000) {
      const desired = Math.atan2(this.anchor.x - this._lock.x, this.anchor.z - this._lock.z);
      _dir.copy(this.camera.position).sub(target);
      const current = Math.atan2(_dir.x, _dir.z);
      const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
      const turn = delta * (1 - Math.exp(-lock.cameraRate * dt));
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const x = _dir.x * c + _dir.z * s;
      const z = -_dir.x * s + _dir.z * c;
      this.camera.position.set(target.x + x, this.camera.position.y, target.z + z);
    }

    this._applyLook(cam);
    this.controls.update();

    // Enforce the orbit distance (the wheel and any code writing the setting
    // both land here).
    this.distance = damp(this.distance, cam.distance, cam.zoomDamping, dt);
    _dir.copy(this.camera.position).sub(this.controls.target);
    const len = _dir.length() || 1;
    _dir.multiplyScalar(1 / len);
    this.camera.position.copy(this.controls.target).addScaledVector(_dir, this.distance);

    // The punch rides on the shake's offset, so it is taken back off the lens
    // at the top of the next frame by the same line and never walks the orbit.
    const offset = this._applyShake(dt);
    if (punch > 1e-3) {
      offset.addScaledVector(this._punchDir, this._punchAmount * punch);
      this.camera.position.add(offset);
      // After the controls have aimed the lens, so the next `update` re-aims it
      // and the roll never accumulates.
      this.camera.rotateZ(this._punchRoll * punch);
      return;
    }
    this.camera.position.add(offset);
  }

  /**
   * Turn the view by (yaw, pitch) radians — the captured mouse
   * (`core/PointerLook.js`). Buffered and spent once, in `update`, on the
   * same orbit the drag turns, so the two never disagree.
   */
  look(yaw, pitch) {
    this._lookYaw += yaw;
    this._lookPitch += pitch;
    if (yaw || pitch) this._manualAt = performance.now();
  }

  /** The mouse is captured: the orbit drag stands down while it lasts. */
  setPointerLocked(on) {
    this.pointerLocked = on;
    this._syncControls();
  }

  /** Another screen has the camera (the studio): no drag, no wheel. */
  setParked(on) {
    this.parked = on;
    this._syncControls();
  }

  _syncControls() {
    this.controls.enabled = !this.parked && !this.pointerLocked;
  }

  _applyLook(cam) {
    if (this._lookYaw === 0 && this._lookPitch === 0) return;
    _dir.copy(this.camera.position).sub(this.controls.target);
    _spherical.setFromVector3(_dir);
    // Right turns the heading down (headings are atan2(x, z)), as the drag does.
    _spherical.theta -= this._lookYaw;
    _spherical.phi = MathUtils.clamp(_spherical.phi + this._lookPitch, cam.minPolar, cam.maxPolar);
    _spherical.makeSafe();
    _dir.setFromSpherical(_spherical);
    this.camera.position.copy(this.controls.target).add(_dir);
    this._lookYaw = 0;
    this._lookPitch = 0;
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.domElement.removeEventListener('pointermove', this._onManual);
    this.domElement.removeEventListener('pointerdown', this._onTouchDown);
    this.domElement.removeEventListener('pointermove', this._onTouchMove);
    this.domElement.removeEventListener('pointerup', this._onTouchUp);
    this.domElement.removeEventListener('pointercancel', this._onTouchUp);
    window.removeEventListener('pointerdown', this._onPointerDownCapture, true);
    this.controls.dispose();
  }
}
