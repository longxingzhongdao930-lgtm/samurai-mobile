import { MathUtils, Vector3 } from 'three';

import { Renderer } from './Renderer.js';
import { Time } from './Time.js';
import { CameraRig } from './CameraRig.js';
import { Input } from './Input.js';
import { frame } from './FrameUniforms.js';

import { Environment } from '../world/Environment.js';
import { Atmosphere } from '../world/Atmosphere.js';
import { Sky } from '../world/Sky.js';
import { Moon } from '../world/Moon.js';
import { Ground } from '../world/Ground.js';
import { Terrain } from '../world/Terrain.js';
import { Arena } from '../world/Arena.js';
import { GroundFog } from '../world/GroundFog.js';
import { Leaves } from '../world/Leaves.js';
import { ContactShadows } from '../world/ContactShadows.js';

import { AssetLoader } from '../loaders/AssetLoader.js';
import { CharacterController } from '../animation/CharacterController.js';
import { ThirdPersonController } from '../animation/ThirdPersonController.js';
import { EnemyManager } from '../combat/EnemyManager.js';

import { PostProcessing } from '../postprocessing/PostProcessing.js';
import { WeaponFire } from '../vfx/WeaponFire.js';
import { BloodBurst } from '../vfx/BloodBurst.js';
import { BladeImpact } from '../vfx/BladeImpact.js';
import { ShockRing } from '../vfx/ShockRing.js';
import { DustBurst } from '../vfx/DustBurst.js';
import { ComboCounter } from '../ui/ComboCounter.js';
import { PlayerHud } from '../ui/PlayerHud.js';
import { PlayerDefense } from '../combat/PlayerDefense.js';
import { LockOn } from '../combat/LockOn.js';
import { PvpMode } from '../net/PvpMode.js';
import { QuadFx } from '../vfx/QuadFx.js';
import { SwordTrail } from '../vfx/SwordTrail.js';
import { Souls, SOUL, SOUL_COLORS } from '../combat/Souls.js';
import { Progress } from '../combat/Progress.js';
import { UpgradeMenu } from '../ui/UpgradeMenu.js';
import { Execution } from '../combat/Execution.js';
import { Arts } from '../combat/Arts.js';
import { Stage } from '../world/Stage.js';
import { TitleScreen } from '../ui/TitleScreen.js';
import { PointerLook } from './PointerLook.js';
import { Projectiles } from '../combat/Projectiles.js';
import { makeEnemyProp } from '../combat/EnemyProps.js';
import { getColor } from '../utils/color.js';
import { CombatAudio } from '../audio/CombatAudio.js';
import { Music } from '../audio/Music.js';
import { Ambience } from '../audio/Ambience.js';
import { TargetRings } from '../vfx/TargetRings.js';
import { CharacterScreen } from '../screens/CharacterScreen.js';
import { LoadingScreen } from '../ui/LoadingScreen.js';
import { Toast } from '../ui/Toast.js';
import { Banner } from '../ui/Banner.js';
import { Stats } from '../ui/Stats.js';
import { ActionHUD } from '../ui/ActionHUD.js';
import { TargetHotkeys } from '../ui/TargetHotkeys.js';
import { MobileControls } from '../ui/MobileControls.js';
import { prefersTouchLayout, isDevMode } from '../utils/device.js';
import { save } from './SaveStore.js';
import { Haptics } from './Haptics.js';
import { GamepadInput } from './GamepadInput.js';

import { settings } from '../config/settings.js';

const HDR_URL = './hdri/spruit_sunrise_1k.hdr';

/** The axis the body falls over about when it goes down — see `_updateDown`. */
/** Keys a duel ignores: the arts, the studio, pause, upgrades. */
const PVP_BLOCKED = new Set(['KeyV', 'KeyC', 'KeyX', 'Tab', 'KeyP', 'KeyU', 'KeyB']);
const _bladeA = new Vector3();
const _bladeB = new Vector3();
const _chest = new Vector3();
/** Chime pitch per soul: red, yellow, blue. */
const SOUL_PITCH = [1, 1.26, 1.5];
/** Nobody to shove: a PvP blow's feedback is played without a PvE attacker. */
const PVP_NOBODY = { alive: false, staggerTime: 0, position: { x: 0, y: 0, z: 0 } };
const _fallAxis = new Vector3();
/** The settings screen's defaults — what a fresh save (or 「セーブ削除」) starts from. */
const DEFAULT_PREFS = { volume: 0.8, sfx: 1, music: 0.55, quality: 'auto', sensitivity: 1, difficulty: 'normal', vibration: true };
/**
 * 難易度: what each one scales — the blow an enemy lands, how long a parry
 * stays open, the gaps between swings and how many swing at once, the
 * wind-up, and 羅刹's health. Never in a duel (the server's numbers rule there).
 */
const DIFFICULTY = {
  easy: { damage: 0.6, parry: 1.6, cooldown: 1.35, attackers: -1, telegraph: 1.25, bossHp: 0.75 },
  normal: { damage: 1, parry: 1, cooldown: 1, attackers: 0, telegraph: 1, bossHp: 1 },
  hard: { damage: 1.5, parry: 0.75, cooldown: 0.75, attackers: 1, telegraph: 0.85, bossHp: 1.3 }
};

/**
 * The words the toasts use for a gesture and for the keys they name, so a line
 * written for a mouse and a keyboard still reads true under a thumb — where the
 * key is a button with the move's name on it and a click is a tap.
 */
const TOUCH = prefersTouchLayout();
/** `?dev=1`: the editor, the frame readout and the key hints for both. */
const DEV = isDevMode();

/**
 * Application root: owns every subsystem and the frame loop.
 *
 * The wiring is deliberately one-directional — App builds the systems and then
 * does nothing but order the per-frame updates. No subsystem reaches back into
 * App.
 *
 * What is on screen is a lit stage with a character standing on it: the key,
 * the rim, the air and the grade come from `config/settings.js`, and the body
 * loops its idle. Equipment goes on through the character screen (`Tab`), which is a second
 * scene the same body is moved into — see `screens/CharacterScreen.js`.
 *
 * There are therefore two modes, and exactly one thing switches between them:
 * `characterScreen.active` decides which scene the post pipeline draws, which
 * camera it draws it through, which grade block is in force, and which of the
 * two update paths runs. Neither mode knows about the other.
 */
export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = new Time();
    this.elapsed = 0;
    this.paused = false;
    this._raf = 0;

    /* ---- core ---- */
    this.renderer = new Renderer(canvas);
    this.rig = new CameraRig(canvas);
    this.camera = this.rig.camera;

    this.environment = new Environment(this.renderer, this.camera);
    this.scene = this.environment.scene;

    /* ---- world ---- */
    // The air comes first because almost everything else is shaded through it:
    // the ground and the sky both bind the same uniform block, which is what
    // keeps the horizon and the haze one colour instead of two.
    this.atmosphere = new Atmosphere();
    this.sky = new Sky(this.atmosphere);
    // The body in that sky. It hangs itself at the angles the sky resolves, so
    // it is only ever as right as the sky is — and it takes the sky's own disc
    // off the moment its maps are in (see `world/Moon.js`).
    this.moon = new Moon();
    // Then the terrain, because it is the surface everything else is placed on:
    // the floor mesh is displaced by it, and the character, camera and shadow
    // focus all read it on the CPU.
    this.terrain = new Terrain();
    this.ground = new Ground(this.environment, {
      terrain: this.terrain,
      atmosphere: this.atmosphere
    });
    // After the ground, because it reads the floor's own baked height field —
    // that shared texture is what lets a puff blowing across a hollow go down
    // into the hollow for the price of one fetch.
    this.groundFog = new GroundFog({
      terrain: this.terrain,
      cache: this.ground.cache,
      atmosphere: this.atmosphere
    });
    // What is actually lying on that floor. Both populations read the same
    // baked height field the floor is displaced by, so the litter lies flat on
    // the slope the ground is drawing rather than on a guess at it — and the
    // meshes themselves are not built until the sheet is in (`load`), so a
    // failed download costs a warning and nothing else.
    this.leaves = new Leaves({
      terrain: this.terrain,
      cache: this.ground.cache,
      environment: this.environment,
      atmosphere: this.atmosphere
    });
    this.contactShadows = new ContactShadows(this.renderer, {
      size: 2.6,
      height: 2.4,
      blur: 2.0,
      terrain: this.terrain
    });

    this.scene.add(
      this.sky.mesh,
      this.moon.mesh,
      this.ground.mesh,
      this.groundFog.mesh,
      this.leaves.group,
      this.contactShadows.group
    );

    // The 1v1 ground (`world/Arena.js`): put away until a duel — or the
    // practice switch (`settings.arena.enabled`, `?arena=1`) — puts it up.
    this.arena = new Arena({ atmosphere: this.atmosphere, environment: this.environment });
    this.scene.add(this.arena.group);
    /** Held up by a duel whatever the practice switch says (`net/PvpMode.js`). */
    this.arenaHeld = false;
    if (new URLSearchParams(location.search).has('arena')) settings.arena.enabled = true;

    /* ---- character ---- */
    this.character = new CharacterController(this.environment);
    this.scene.add(this.character.root);

    this.input = new Input();
    this.input.bindMouse(canvas);
    // Clicks meant for the studio's own camera are not swings.
    this.input.mouseDisabled = () => this.inCharacterScreen;
    this.controller = new ThirdPersonController(this.character, this.input, this.rig);
    // The guard (and later the parry and stamina) — see `combat/PlayerDefense.js`.
    this.defense = new PlayerDefense(this.character);
    /** 一閃 book-keeping: when the current swing began, and the chain so far. */
    this._swingStartedAt = -Infinity;
    this._wasSwinging = false;
    this._issenAt = -Infinity;
    this._issenChain = 0;
    /** When `L` went down (real ms) — a short press cycles, a long one releases. */
    this._lockDownAt = 0;

    /* ---- combat ---- */
    // What a body cut in half throws off. A pool with nothing in it until
    // something is cut, and it runs on the *simulation's* clock, so a burst is
    // held by the hit-stop of the blow that caused it.
    this.blood = new BloodBurst();
    this.scene.add(this.blood.mesh);

    // The bodies to kick. The rig they clone is loaded in `load()`; until then
    // this is an empty field, and everything that reads it copes with that.
    // A body decides nothing about how a cut *looks* — it only says where and
    // how hard it bleeds, and this draws it.
    this.enemies = new EnemyManager({
      terrain: this.terrain,
      effects: {
        onBlood: (point, direction, count, speed) =>
          this.blood.emit(point, direction, count, speed)
      }
    });
    this.scene.add(this.enemies.group);
    this.controller.setEnemies(this.enemies);

    // Who a press would actually go to, drawn on the ground. It is told what to
    // mark and works nothing out itself — the answer comes from the same call
    // the attacks lock their targets with (`_updateTargetRings`).
    this.targetRings = new TargetRings({ terrain: this.terrain });
    this.scene.add(this.targetRings.mesh);

    /**
     * Who each enabled attack has locked this frame: body → the config keys of
     * the moves that would take it. Rebuilt in place every frame, and the ring
     * and the key caps are both drawn straight off it.
     * @type {Map<object, string[]>}
     */
    this._locked = new Map();
    /** Which of those keys would fire right now, rather than merely aim. */
    this._readyMoves = new Set();
    /** Key lists handed back by dead entries, so a frame allocates nothing. */
    this._keyLists = [];

    /**
     * Seconds of hit-stop left to run.
     *
     * The oldest impact trick there is: on contact the whole simulation drops
     * to a crawl for a few dozen milliseconds, so the frame the foot lands is
     * held long enough to be *seen*. It is deliberately a scale on `dt` rather
     * than a pause — the animation, the ragdoll and the mist all slow together,
     * which is what makes it read as weight rather than as a dropped frame.
     *
     * The scale is taken from whichever move landed rather than read per frame:
     * a slash stops the world harder and for longer than a kick, and the
     * blow it belongs to is over by the time the freeze runs out.
     */
    this._hitStop = 0;
    this._hitStopScale = 1;
    /**
     * Seconds left of the world coming back up to speed once the freeze is
     * spent (`combat.hitStopRelease`). A freeze that ends on one frame reads as
     * a hitch; one the world *resumes* from reads as weight.
     */
    this._hitRelease = 0;

    // What comes off the steel at contact — the same sprite machine the halo's
    // blades land with, on its own pool and its own warmer look. On the
    // simulation's clock, so the sparks hang in the hit-stop with everything
    // else.
    this.meleeSparks = new BladeImpact(384);
    this.scene.add(this.meleeSparks.mesh);

    // The fight's own light (`vfx/QuadFx.js`, `vfx/SwordTrail.js`): flashes,
    // 居合 cuts, rings and tells in one pool, the enemies' 妖気 in another, and
    // the katana's afterimage. Three draw calls, sized down on a phone.
    const vfx = settings.vfx;
    this.fx = new QuadFx({ capacity: vfx.flashCapacity, intensity: vfx.flashIntensity, name: 'Flashes' });
    this.miasma = new QuadFx({ capacity: vfx.miasma.capacity, intensity: vfx.miasma.intensity, name: 'Miasma' });
    this.trail = new SwordTrail({ samples: vfx.trail.samples, subdivisions: vfx.trail.subdivisions });
    this.scene.add(this.fx.mesh, this.miasma.mesh, this.trail.mesh);

    // 魂: what the fallen give up, and what they buy (`combat/Souls.js`,
    // `combat/Progress.js`, `ui/UpgradeMenu.js`).
    this.souls = new Souls({ capacity: settings.souls.capacity });
    this.scene.add(this.souls.mesh);
    // Arrows and balls in the air (`combat/Projectiles.js`).
    this.projectiles = new Projectiles(16);
    this.scene.add(this.projectiles.mesh);
    this.progress = new Progress();
    /** What the player has done, counted — the lesson (`world/Tutorial.js`) reads it. */
    this.counters = { hits: 0, parry: 0, execution: 0, shukuchi: 0, issen: 0, damage: 0, downs: 0 };
    this._issenKill = false;
    this._chimeAt = 0;
    this._upgradePaused = false;
    // And what it sounds like. Silent until the page is first touched.
    this.audio = new CombatAudio(this.camera);
    // The score, on the same context — `_syncMusic` picks the piece each frame.
    this.music = new Music(this.audio);
    // And the night under it (`audio/Ambience.js`).
    this.ambience = new Ambience(this.audio);
    /** Metres walked since the last footfall, the player's and each heavy body's. */
    this._stepAcc = 0;
    this._stepFrom = new Vector3();

    // The Musou's ground: a ring that opens under the last blow and the earth
    // it throws up — the fist's own two effects, on their own instances. The
    // dust pool is smaller on a phone.
    this.musouShock = new ShockRing({ terrain: this.terrain });
    this.musouDust = new DustBurst(TOUCH ? 512 : 1024);
    this.scene.add(this.musouShock.mesh, this.musouDust.mesh);
    /** Musou gauge, 0 … `settings.musou.max`. */
    this.musouGauge = 0;
    /** Scratch for one sweep's victims, reused so a swing allocates nothing. */
    this._victims = [];

    /* ---- post ---- */
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);

    /* ---- UI ---- */
    this.loading = new LoadingScreen();
    this.toast = new Toast();
    this.banner = new Banner();
    // Hits in a row, and how many fell — the crowd fight's running score.
    this.comboCounter = new ComboCounter();
    // The red at the edges of the screen when an enemy's blow lands.
    this._hurtFlash = document.createElement('div');
    this._hurtFlash.className = 'hurt-flash';
    document.body.appendChild(this._hurtFlash);
    // And the white one when a parry lands.
    this._parryFlash = document.createElement('div');
    this._parryFlash.className = 'hurt-flash parry-flash';
    document.body.appendChild(this._parryFlash);

    /* ---- the player's health — `settings.combat.player` ---- */
    this.playerHp = settings.combat.player.maxHp;
    /** Seconds (real) the player cannot be struck — after a hit, and after a retry. */
    this._invuln = 0;
    /** True from the blow that empties the bar until Retry. */
    this.playerDown = false;
    /** Seconds since going down — what the fall is timed on. */
    this._downT = 0;
    this.playerHud = new PlayerHud({ onRetry: () => this._retry(), touch: TOUCH });
    // Lock-on. Its candidates are a function, so PvP can hand it the opponent.
    this.lockOn = new LockOn({
      candidates: () => this.lockCandidates(),
      origin: () => this.character.position,
      facing: () => this.character.facing,
      camera: this.camera
    });
    this.upgradeMenu = new UpgradeMenu({
      progress: this.progress,
      onClose: () => this._toggleUpgrade(false),
      onBuy: (id) => {
        this._applyUpgrades();
        this.toast.show(`${settings.upgrades.tracks[id].label} Lv ${this.progress.level(id)}`, 900);
        this.audio.chime(this.character.position, { pitch: 0.75, strength: 1 });
      }
    });
    this._applyUpgrades();
    this._baseEnemyCount = settings.enemies.count;
    this._baseShadowMap = settings.environment.shadowMapSize;
    this._baseSensitivity = settings.camera.sensitivity;
    this.save = save;
    this.haptics = new Haptics();
    // A pad, if one is plugged in: its buttons are keys, its sticks the stick
    // and the lens (`core/GamepadInput.js`).
    this.gamepad = new GamepadInput({
      input: this.input,
      rig: this.rig,
      sensitivity: () => this.prefs?.sensitivity ?? 1,
      onConnect: () => this.toast.show('ゲームパッド接続 — Aで攻撃 · Startで一時停止', 1800)
    });
    this._applyPrefs();
    this.playerHp = settings.combat.player.maxHp;
    this.playerHud.setHp(this.playerHp, settings.combat.player.maxHp);
    // Developer mode only (`?dev=1`). On a phone the readout and the editor
    // start put away even then: both would sit over the buttons. The Editor
    // button in the top bar brings the editor back.
    this.stats = DEV ? new Stats({ visible: !TOUCH }) : null;
    // The moves and their keys, along the bottom — one panel per category. Fed a
    // state per ability every frame from `_syncAbilities`; it decides nothing.
    this.actionHUD = new ActionHUD();
    // The same moves under the thumbs, on a touch screen. It is fed the same
    // states as the row above, and every button is its key — see the class.
    this.mobileControls = TOUCH ? new MobileControls({ input: this.input }) : null;
    // The same answer as the ring, over the head instead of under the feet: the
    // ring says which body, these say with which key. Fed from
    // `_updateTargetRings` — it resolves nothing of its own either.
    this.targetHotkeys = new TargetHotkeys({ camera: this.camera, domElement: this.canvas });
    // The editor (`?dev=1` only) is its own chunk: a player never downloads it.
    this.editor = null;
    this._editorLoad = !DEV
      ? null
      : import('../ui/Editor.js').then(({ Editor }) => {
          this.editor = new Editor({
            onToast: (message) => this.toast.show(message),
            // The fire is built later, with the loadout; the editor asks for it when
            // a control needs it rather than holding a reference that starts null.
            getWeaponFire: () => this.weaponFire,
            onRespawnEnemies: () => {
              this.enemies.respawnAll();
              this.toast.show('A fresh ring of them');
            },
            onFillMusou: () => {
              this.musouGauge = settings.musou.max;
            },
            onBossOmen: () => {
              const p = this.character.position;
              const f = this.character.facing;
              this.bossOmen(p.x + Math.sin(f) * 4, p.z + Math.cos(f) * 4);
            },
            onAddSouls: (n) => this.progress.addSouls(n),
            onResetProgress: () => {
              this.progress.reset();
              this._applyUpgrades();
            }
          });
        });
    if (TOUCH) this.editor?.toggle();
    // PC: click to take the mouse, move to look (`core/PointerLook.js`). Never
    // while something wants a cursor: a panel, the studio, the editor, the veil.
    this.pointerLook = TOUCH
      ? null
      : new PointerLook({
          domElement: this.canvas,
          rig: this.rig,
          blocked: () =>
            this.inCharacterScreen ||
            !!this.title?.visible ||
            this.playerDown ||
            !!this.upgradeMenu?.visible ||
            !!this.pvp?.menu?.visible ||
            (DEV && !!this.editor && !this.editor._hidden)
        });

    /**
     * The equipment studio. Built in `load()`, because it needs the rig's
     * skeleton and material palette — neither exists until the character is in.
     * @type {CharacterScreen|null}
     */
    this.characterScreen = null;

    /**
     * The katana's fire. Built with the studio, because it rides whatever the
     * equipment manager has on the body.
     * @type {WeaponFire|null}
     */
    this.weaponFire = null;

    this._bindEvents();
  }

  /** Whether the equipment studio is the thing on screen. */
  get inCharacterScreen() {
    return this.characterScreen?.active === true;
  }

  /* ------------------------------------------------------------------ */

  _bindEvents() {
    this.renderer.onResize((width, height, pixelRatio) => {
      this.rig.resize(width, height);
      this.post.setSize(width, height, pixelRatio);
      this.characterScreen?.resize(width, height, pixelRatio);
    });

    this._onKeyDown = (event) => {
      // Ignore keys typed into a panel's own fields — the equipment inspector
      // is full of number boxes, and most of these keys are characters in them.
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // The title is up: it takes the clicks, the game takes no keys — only the
      // developer's two (editor, frame readout, `?dev=1`).
      if (this.title?.visible) {
        // The pause menu closes on the key that opened it, and on Escape.
        if (this.title.mode === 'pause' && !event.repeat && (event.code === 'KeyP' || event.code === 'Escape')) {
          event.preventDefault();
          if (this.title.current === 'pause') this._closePause();
          else this.title.view('pause');
          return;
        }
        if (event.code !== 'KeyG' && event.code !== 'KeyF') return;
      }

      // Down: Enter retries once it is offered; only the window's own keys
      // (pause, editor, stats) still do anything.
      if (this.playerDown) {
        if (event.code === 'Enter' && this.playerHud.retryReady) this._retry();
        if (!['KeyP', 'KeyG', 'KeyF'].includes(event.code)) return;
      }

      // A duel is swords only: no arts, no studio — and no pause, because the
      // other side's clock does not stop.
      if (this.pvp?.active && PVP_BLOCKED.has(event.code)) {
        event.preventDefault();
        return;
      }

      switch (event.code) {
        case 'KeyP':
          if (!event.repeat) this._openPause();
          break;
        case 'KeyG':
          this.editor?.toggle();
          break;
        case 'KeyF':
          this.stats?.toggle();
          break;
        case 'Tab':
          // The browser would move focus into the editor's fields otherwise,
          // and the next press would be typed into a number box instead.
          event.preventDefault();
          this.toggleCharacterScreen();
          break;
        case 'KeyX': {
          // 縮地 (`combat/Arts.js`).
          if (this.inCharacterScreen || event.repeat) break;
          this.arts?.shukuchi();
          break;
        }
        case 'KeyV': {
          if (this.inCharacterScreen) break;
          // 影走り (`combat/Arts.js`).
          if (!event.repeat) this.arts?.kagebashiri();
          break;
        }
        case 'KeyC': {
          if (this.inCharacterScreen) break;
          // 雷切 (`combat/Arts.js`).
          if (!event.repeat) this.arts?.raikiri();
          break;
        }
        case 'KeyL':
          if (!event.repeat) this._lockDownAt = performance.now();
          break;
        case 'KeyU':
          if (!event.repeat) this._toggleUpgrade();
          break;
        case 'KeyB':
          // Decided on release: a tap is 飛燕, a hold is 居合 (`combat/Arts.js`).
          if (!event.repeat && !this.inCharacterScreen) this.arts?.hienDown();
          break;
        case 'Escape':
          if (this.upgradeMenu.visible) {
            this._toggleUpgrade(false);
            break;
          }
          // Escape with nothing else to close is the pause menu (a captured
          // mouse is let go by the browser first, so this is the second press).
          if (!this.lockOn.active && !this.inCharacterScreen && !event.repeat) {
            this._openPause();
            break;
          }
          if (this.lockOn.active && !this.inCharacterScreen) {
            this.lockOn.release();
            break;
          }
          if (this.inCharacterScreen) this.characterScreen.exit();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    // `L` is decided on release: short → lock / next, long → let go.
    this._onKeyUp = (event) => {
      if (event.code === 'KeyB') this.arts?.hienUp();
      if (event.code !== 'KeyL' || !this._lockDownAt) return;
      const held = (performance.now() - this._lockDownAt) / 1000;
      this._lockDownAt = 0;
      if (this.playerDown || this.inCharacterScreen || !settings.lockOn.enabled) return;
      if (held >= settings.lockOn.holdToRelease) this.lockOn.release();
      else if (!this.lockOn.cycle()) this.toast.show('ロックできる敵がいない', 700);
    };
    window.addEventListener('keyup', this._onKeyUp);
  }

  /* ------------------------------------------------------------------ */

  /**
   * Swap between the play stage and the equipment studio.
   *
   * Everything mode-dependent is resolved from `inCharacterScreen` in `frame()`,
   * so this only has to move the character, park the world's controls and say
   * which view the post stack draws.
   */
  toggleCharacterScreen() {
    const screen = this.characterScreen;
    if (!screen) return;

    // Leaving goes through the screen's own exit path, so the panel's close
    // button and this key land in exactly the same place (`_onScreenExit`).
    if (screen.active) {
      screen.exit();
      return;
    }

    screen.enter();
    this.targetRings.clear();
    this.targetHotkeys.clear();
    this.rig.setParked(true);
    this.post.setView(screen.stage.scene, screen.camera.camera);
    this.toast.show(
      TOUCH
        ? '装備画面 — ドラッグで回転 · ピンチで拡大'
        : '装備画面 — ドラッグで回転 · 右ドラッグで移動 · ホイールで拡大'
    );
  }

  /**
   * A blow landed on someone.
   *
   * Three things happen at once and they are all the same beat: the body is
   * handed to the ragdoll, the world nearly stops, and the lens takes a knock.
   * Any one of them alone reads as a bug; together they read as contact.
   *
   * All three are read off the move that landed, which is the whole difference
   * between the two attacks at the moment of impact — the kick's is a short,
   * flat shove, the slash's a longer freeze and a body in two pieces.
   *
   * @param {object} config the striking move's settings block
   */
  _onStrike(enemy, x, z, config) {
    // An execution's own swing: the blades deal the blow (`combat/Execution.js`).
    if (this._scripted) return;
    // The opponent is not ours to wound: the server judges the claim and
    // answers with the damage (`_pvpLandedHit`).
    if (enemy?.isOpponent) {
      this.pvp.claim(this._configKey(config));
      return;
    }
    const countering = this.defense.counter > 0;
    const result = this.enemies.hit(enemy, x, z, this._counterForce(config));
    if (!result) return;
    if (countering) this.defense.counter = 0;
    this._impact(enemy, x, z, config, countering && result === 'kill' ? 'finisher' : result, true);
    if (result === 'stagger' && enemy.postureBroken && !enemy._breakAnnounced) {
      enemy._breakAnnounced = true;
      this._postureBroke(enemy);
    }

    // The cleave: a sweep does not stop at the body it was aimed at. Everyone
    // else standing inside its reach and its arc is met by the same blade, on
    // the same frame, thrown outward from the player rather than all along
    // the one line. No second freeze — the first one is already this blow's.
    const reach = config.cleaveReach ?? 0;
    if (reach <= 0) return;
    const origin = this.character.position;
    const half = Math.cos(MathUtils.degToRad(Math.min(360, config.cleaveArc ?? 0)) * 0.5);
    for (const other of this.enemies.enemies) {
      if (other === enemy || !other.alive) continue;
      const dx = other.position.x - origin.x;
      const dz = other.position.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance > reach) continue;
      const ux = distance > 1e-3 ? dx / distance : x;
      const uz = distance > 1e-3 ? dz / distance : z;
      if ((config.cleaveArc ?? 0) < 360 && ux * x + uz * z < half) continue;
      const hit = this.enemies.hit(other, ux, uz, config);
      if (hit) this._impact(other, ux, uz, config, hit, false);
    }
  }

  /**
   * Sell one blow: the freeze, the lens, the sparks and the sound — each
   * scaled by what the blow *did*.
   *
   * A kill gets the move's full numbers. A stagger gets `staggerScale` of them,
   * because a body that is still standing should not stop the world as hard as
   * one that is going down. A finisher — a body felled while it was still
   * reeling from the last hit — gets `finisherBoost` more, which is the combo
   * paying off where the player can feel it.
   *
   * @param {'finisher'|'kill'|'stagger'} result
   * @param {boolean} primary the aimed body, as opposed to one the sweep also took
   */
  _impact(enemy, x, z, config, result, primary, crowd = 1, quiet = false) {
    const combat = settings.combat;
    const lethal = result !== 'stagger';
    const weight = result === 'finisher' ? combat.finisherBoost : lethal ? 1 : combat.staggerScale;
    this.comboCounter.hit(lethal);
    this._feedMusou(lethal);
    if (primary) this.counters.hits++;

    // Something big takes a blow heavier: a longer freeze, a harder knock.
    const big = (enemy.size ?? 1) > 1.3 ? 1.25 : 1;
    if (primary) {
      // A sweep through a crowd holds a little longer than one through a
      // single body — a tenth more per extra body, never more than half again.
      const many = 1 + Math.min(0.5, (crowd - 1) * 0.1);
      this._hitStop = Math.max(this._hitStop, config.hitStop * weight * many * big);
      this._hitStopScale = config.hitStopScale;
      this._hitRelease = 0;
      const shake = config.shake * weight * big;
      this.rig.shake(shake);
      this.rig.punch(x, z, shake * combat.punch, combat.fovKick * weight, shake * combat.roll);
      // The lens itself flinches on a kill: a split of colour at the edges.
      if (lethal) this.post.kick(result === 'finisher' ? 0.9 : 0.5);
    }

    // Contact is on the near side of the body at chest height, not at its feet.
    const p = enemy.position;
    const radius = settings.enemies.bodyRadius;
    const px = p.x - x * radius;
    const py = p.y + settings.enemies.height * 0.58;
    const pz = p.z - z * radius;
    const edge = config.slices === true;
    this.meleeSparks.burst(px, py, pz, x, 0.12, z, combat.sparks, (edge ? 1 : 0.55) * weight);
    if (primary && result === 'finisher') this._iai(p, Math.atan2(x, z), 0.75);
    else if (primary && edge) {
      // Every cut leaves its line in the air for a beat, across the blow.
      const tilt = (Math.random() - 0.5) * 0.9;
      this.fx.slash(px, py, pz, z, tilt, -x, getColor(settings.vfx.iai.color), 1.6, 0.05, 0.22);
    }
    if (!quiet) {
      this.audio.impact({ x: px, y: py, z: pz }, { cut: edge, strength: lethal ? weight : 0.6 });
      // Armour rings under the cut (the brute, 羅刹, a shield's bearer).
      if (enemy.kindCfg?.armor || big > 1) this.audio.clang({ x: px, y: py, z: pz }, { strength: 0.45 });
    }
  }

  /**
   * A step of the string (or of the Musou) landed: everyone in its sector.
   *
   * The sector is `areaRange` metres (plus a body's radius) and `areaArc`
   * degrees about where the character faces, taken at the contact frame. Each
   * body is met once, nearest first; the nearest gets the freeze and the punch
   * and everyone gets sparks, though only the first three get a sound of their
   * own — twelve impacts on one frame is noise, not weight.
   *
   * The throw goes *outward*: along the facing for a narrow cut, blended
   * toward straight away from the player the wider the sweep, and purely
   * radial all the way round — so a crowd scatters from a sweep rather than
   * all flying down one line.
   */
  _onArea(move) {
    if (this.pvp?.active) {
      this.pvp.areaHit(move);
      return;
    }
    const config = move.config;
    const origin = this.character.position;
    const yaw = this.character.facing;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const arc = Math.min(360, config.areaArc ?? 360);
    const half = Math.cos(MathUtils.degToRad(arc) * 0.5);
    const reach = (config.areaRange ?? 0) + settings.enemies.bodyRadius;
    const radial = arc >= 360 ? 1 : MathUtils.clamp(arc / 360, 0.25, 0.8);

    const victims = this._victims;
    victims.length = 0;
    for (const enemy of this.enemies.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - origin.x;
      const dz = enemy.position.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance > reach) continue;
      const ux = distance > 1e-3 ? dx / distance : fx;
      const uz = distance > 1e-3 ? dz / distance : fz;
      if (arc < 360 && distance > 0.3 && ux * fx + uz * fz < half) continue;
      victims.push({ enemy, ux, uz, distance });
    }
    victims.sort((a, b) => a.distance - b.distance);

    let landed = 0;
    for (const { enemy, ux, uz } of victims) {
      let bx = fx * (1 - radial) + ux * radial;
      let bz = fz * (1 - radial) + uz * radial;
      const length = Math.hypot(bx, bz) || 1;
      bx /= length;
      bz /= length;
      const countering = this.defense.counter > 0;
      const result = this.enemies.hit(enemy, bx, bz, this._counterForce(config));
      if (countering && result) this.defense.counter = 0;
      if (result === 'stagger' && enemy.postureBroken && !enemy._breakAnnounced) {
        enemy._breakAnnounced = true;
        this._postureBroke(enemy);
      }
      if (!result) continue;
      this._impact(enemy, bx, bz, config, result, landed === 0, victims.length, landed >= 3);
      landed++;
    }
    victims.length = 0;

    // The Musou's last blow opens the ground under it, hit or miss.
    if (config.shockwave) {
      const groundY = this.terrain.heightAt(origin.x, origin.z);
      this.musouShock.burst(origin.x, origin.z, settings.musou.shock, 1);
      this.musouDust.burst(origin.x, groundY, origin.z, settings.musou.dust, 1.2);
      this.rig.shake(config.shake);
      this.rig.punch(fx, fz, config.shake * settings.combat.punch, settings.combat.fovKick * 1.6, 0);
      this.audio.impact({ x: origin.x, y: groundY + 0.5, z: origin.z }, { cut: false, strength: 1.4 });
    }
  }

  /**
   * An enemy's blow landed on the player.
   *
   * There is no health to take yet, so this is only what being hit *feels*
   * like: the lens knocked back toward the camera, a short freeze, the edges
   * of the screen flaring red, a thump, and the body shoved back along the
   * blow.
   */
  _onPlayerHit(enemy, x, z) {
    if (this._tryIssen(enemy, x, z)) return;
    // The guard gets the first say: `x, z` is the blow's direction, so the
    // attacker is the other way.
    const outcome = this.defense.defend(-x, -z, this.elapsed);
    if (outcome.result === 'parry') return this._onParried(enemy, x, z);
    if (outcome.result === 'block') {
      // A heavy blow on the guard costs more of the arm than a light one.
      const heavy = enemy?.kindCfg?.guardCost ?? 1;
      if (heavy > 1) this.defense.spend(settings.defense.guardCost * (heavy - 1));
      return this._onBlocked(enemy, x, z, outcome);
    }
    if (outcome.result === 'break') {
      // Out of stamina: the guard is knocked open — a low clang, then the blow.
      const p = this.character.position;
      this.audio.clang({ x: p.x, y: p.y + 1, z: p.z }, { strength: 0.6 });
      this.toast.show('ガードが崩れた', 900);
    }
    this._takeHit(enemy, x, z, outcome.damageScale);
  }

  /**
   * 居合: a line of light through `at`, crossing the heading `facing`.
   * `scale` 1 is the Issen's; a finisher's is shorter.
   */
  _iai(at, facing, scale = 1) {
    const cfg = settings.vfx.iai;
    const tilt = (Math.random() - 0.5) * 0.5;
    const ax = Math.cos(facing);
    const az = -Math.sin(facing);
    const y = at.y + settings.enemies.height * 0.6;
    this.fx.slash(at.x, y, at.z, ax, tilt, az, getColor(cfg.color), cfg.length * scale, cfg.width * scale, cfg.life);
    this.fx.flare(at.x, y, at.z, getColor(cfg.color), 0.9 * scale, 0.25);
  }

  /** 飛燕 arrived on a body. */
  _hienHit(enemy, x, z) {
    const config = { ...settings.slashHit, damage: settings.hien.damage };
    const result = this.enemies.hit(enemy, x, z, this._counterForce(config));
    if (!result) return;
    if (this.defense.counter > 0) this.defense.counter = 0;
    this._impact(enemy, x, z, config, result, true);
  }

  /** 鬼気: while the Musou gauge is full the player smoulders red. */
  _updateOniAura(dt) {
    const cfg = settings.vfx.oniAura;
    if (!cfg.enabled || this.musouGauge < settings.musou.max || this.playerDown) return;
    this._oniAcc = (this._oniAcc ?? 0) + cfg.rate * dt;
    const p = this.character.position;
    const color = getColor(cfg.color);
    while (this._oniAcc >= 1) {
      this._oniAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.25;
      this.miasma.puff(p.x + Math.sin(a) * r, p.y + 0.2 + Math.random() * 1.2, p.z + Math.cos(a) * r, 0, 0.9, 0, color, 0.34, 1.1);
    }
  }

  /** A 弓 / 鉄砲 lets go: from its chest at where the player's chest is going to be. */
  _enemyFire(enemy, gun) {
    const cfg = settings.enemyKinds.archer;
    const e = enemy.position;
    const f = enemy.facing;
    const from = new Vector3(e.x + Math.sin(f) * 0.5, e.y + 1.35 * enemy.size, e.z + Math.cos(f) * 0.5);
    const p = this.character.position;
    const v = this.controller.velocity;
    const lead = gun ? 0.08 : 0.3;
    const to = new Vector3(p.x + v.x * lead, p.y + this.character.height * 0.6, p.z + v.y * lead);
    this.projectiles.fire(enemy, from, to, gun ? cfg.gunSpeed : cfg.arrowSpeed, gun);
    if (gun) {
      this.fx.flare(from.x, from.y, from.z, getColor('#ffd28a'), 0.6, 0.12);
      this.audio.impact(from, { cut: false, strength: 0.9 });
    } else {
      this.audio.swing(from, 0.5);
    }
  }

  /** A shot reached the player: the guard gets its say exactly as against a blade. */
  _onProjectile(owner, x, z, gun) {
    if (this.playerDown || this._invuln > 0 || this.pvp?.active) return;
    const outcome = this.defense.defend(-x, -z, this.elapsed);
    const p = this.character.position;
    if (outcome.result === 'parry') {
      // Turned aside: a bright ring off the blade, and nothing lands.
      const y = p.y + this.character.height * 0.6;
      this.fx.flare(p.x - x * 0.5, y, p.z - z * 0.5, getColor(settings.vfx.parry.color), 0.8, 0.25);
      this.audio.clang({ x: p.x, y, z: p.z }, { bright: true, strength: 1 });
      this.toast.show('弾き', 600);
      return;
    }
    if (outcome.result === 'block') return this._onBlocked(PVP_NOBODY, x, z, outcome);
    this._takeHit(owner, x, z, outcome.damageScale * (gun ? 1.2 : 0.8));
  }

  /** A blow met a 盾's shield: steel on lacquer, the arm jarred back, the stance worn. */
  _onShieldBlock(enemy, x, z) {
    const e = enemy.position;
    const y = e.y + settings.enemies.height * 0.6 * enemy.size;
    this.meleeSparks.burst(e.x - x * 0.5, y, e.z - z * 0.5, -x, 0.2, -z, settings.combat.sparks, 0.8);
    this.audio.shield({ x: e.x, y, z: e.z }, 1);
    this.controller.knock(-x, -z, 1.4);
    this._hitStop = Math.max(this._hitStop, 0.05);
    this._hitStopScale = 0.2;
    this._hitRelease = 0;
    this.rig.shake(0.06);
    if (enemy.takePosture?.(enemy.kindCfg?.blockPosture ?? 0)) this._postureBroke(enemy);
  }

  /** A body fell: its souls (not in a duel — there are no bodies there anyway). */
  _onEnemyKilled(enemy) {
    const cfg = settings.souls;
    if (!cfg.enabled || this.pvp?.active) return;
    const issen = this._issenKill;
    const kinds = [];
    const bonus =
      (issen ? cfg.issenBonus : this._executionKill ? settings.execution.soulBonus : 1) * (enemy.kindCfg?.souls ?? 1);
    const reds = Math.round(cfg.redPerKill * bonus);
    for (let i = 0; i < reds; i++) kinds.push(SOUL.RED);
    if (Math.random() < cfg.yellowChance) kinds.push(SOUL.YELLOW);
    if (issen || this._executionKill || Math.random() < cfg.blueChance) kinds.push(SOUL.BLUE);
    const p = enemy.position;
    this.souls.drop(p.x, p.y + settings.enemies.height * 0.55, p.z, kinds);
  }

  /** A soul reached the chest. */
  _onSoul(kind) {
    const cfg = settings.souls;
    if (kind === SOUL.RED) {
      this.progress.addSouls(cfg.redValue);
    } else if (kind === SOUL.YELLOW) {
      const max = settings.combat.player.maxHp;
      this.playerHp = Math.min(max, this.playerHp + cfg.yellowHeal);
      this.playerHud.setHp(this.playerHp, max);
    } else {
      this.musouGauge = Math.min(settings.musou.max, this.musouGauge + cfg.blueGauge);
    }
    const p = this.character.position;
    const color = SOUL_COLORS[kind];
    this.fx.flare(p.x, p.y + 1.1, p.z, color, 0.45, 0.22);
    if (kind !== SOUL.RED || Math.random() < 0.35) this.fx.ring(p.x, p.y, p.z, color, 1.1, 0.35);
    // One chime at a time: a stream of twenty souls is one run of notes, not a chord.
    const now = performance.now();
    if (now - this._chimeAt > 70) {
      this._chimeAt = now;
      this.audio.chime({ x: p.x, y: p.y + 1, z: p.z }, { pitch: SOUL_PITCH[kind] * (0.97 + Math.random() * 0.06), strength: 0.8 });
    }
  }

  /** An enemy began a blow: its 妖気 turns red, and its eye glints as the Issen window opens. */
  _onEnemyWindup(enemy) {
    // The glint as the Issen window opens: late in a long wind-up, early in a quick one.
    const k = enemy.kindCfg;
    const windup = k?.ranged ? (enemy._gun ? k.gunAim : k.aim) : settings.enemyAI.telegraphTime * (k?.telegraph ?? 1);
    const lead = windup - settings.issen.window + 0.05;
    enemy._glintAt = this.elapsed + Math.max(0, lead);
    // A big body's blow is marked on the ground where it will land.
    const kind = enemy.kindCfg;
    if ((enemy.size ?? 1) > 1.3) this.audio.windup({ x: enemy.position.x, y: enemy.position.y + 1.5, z: enemy.position.z }, enemy.kind === 'boss' ? 1.3 : 1);
    if (kind?.omenRadius) {
      const f = enemy.facing;
      const ahead = kind.omenAhead ?? 2;
      const x = enemy.position.x + Math.sin(f) * ahead;
      const z = enemy.position.z + Math.cos(f) * ahead;
      const time = settings.enemyAI.telegraphTime * (kind.telegraph ?? 1);
      this.fx.omen(x, this.terrain.heightAt(x, z), z, getColor(settings.vfx.omen.color), kind.omenRadius, time);
    }
    const omen = settings.vfx.omen;
    if (omen.allEnemies) {
      this.fx.omen(enemy.position.x, enemy.position.y, enemy.position.z, getColor(omen.color), omen.radius, settings.enemyAI.telegraphTime);
    }
  }

  /**
   * A boss's tell (`settings.vfx.omen`): a disc of `radius` that fills for
   * `time` seconds and flashes as the blow lands. Bosses call this; the
   * editor can fire one in front of the player to look at it.
   */
  bossOmen(x, z, radius = 3.2, time = 1.2) {
    const y = this.terrain.heightAt(x, z);
    this.fx.omen(x, y, z, getColor(settings.vfx.omen.color), radius, time);
    this.fx.glint(x, y + 2.2, z, getColor(settings.vfx.glint.color), 0.9, 0.45);
  }

  /** Enemies' 妖気, and the glints that were scheduled for this frame. */
  _updateMiasma(dt, position) {
    const cfg = settings.vfx.miasma;
    const glint = settings.vfx.glint;
    const range2 = cfg.range * cfg.range;
    const height = settings.enemies.height;
    for (const enemy of this.enemies.enemies) {
      if (!enemy.alive) continue;
      const p = enemy.position;
      if (enemy._glintAt !== undefined && this.elapsed >= enemy._glintAt) {
        enemy._glintAt = undefined;
        if (glint.enabled && enemy.attacking) {
          this.fx.glint(p.x, p.y + height * 0.92, p.z, getColor(glint.color), glint.size, 0.4);
        }
      }
      if (!cfg.enabled) continue;
      const dx = p.x - position.x;
      const dz = p.z - position.z;
      if (dx * dx + dz * dz > range2) continue;
      const winding = enemy.attacking;
      enemy._miasma = (enemy._miasma ?? Math.random()) + (winding ? cfg.windupRate : cfg.rate) * dt;
      const color = getColor(winding ? cfg.windupColor : cfg.color);
      while (enemy._miasma >= 1) {
        enemy._miasma -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = 0.15 + Math.random() * 0.25;
        this.miasma.puff(
          p.x + Math.sin(a) * r,
          p.y + 0.2 + Math.random() * height * 0.8,
          p.z + Math.cos(a) * r,
          0,
          cfg.rise * (0.7 + Math.random() * 0.6),
          0,
          color,
          cfg.size * (0.7 + Math.random() * 0.6),
          cfg.life * (0.8 + Math.random() * 0.4)
        );
      }
    }
  }

  /**
   * 設定: merge a change into the saved settings and put all of them in force —
   * the audio buses, the 画質 (pixel ratio, shadow map and its update rate,
   * how many bodies the open field keeps up) and the look sensitivity.
   */
  _applyPrefs(patch = null) {
    const prefs = { ...DEFAULT_PREFS, ...save.get('prefs'), ...(patch ?? {}) };
    if (patch) save.set('prefs', prefs);
    this.prefs = prefs;
    const audio = settings.audio;
    audio.volume = prefs.volume;
    audio.sfx = prefs.sfx;
    audio.music = prefs.music;
    this.audio.syncLevels();

    const q = prefs.quality;
    if (this.renderer.quality !== q) this.renderer.setQuality(q);
    const base = this._baseShadowMap;
    const shadowMap = q === 'light' ? Math.min(base, TOUCH ? 512 : 1024) : q === 'standard' ? Math.min(base, TOUCH ? 1024 : 2048) : base;
    this.environment.setShadowMapSize(shadowMap);
    this._shadowEvery = q === 'light' ? 2 : 1;
    settings.enemies.count = q === 'light' ? Math.min(this._baseEnemyCount, TOUCH ? 7 : 10) : this._baseEnemyCount;

    settings.camera.sensitivity = this._baseSensitivity * prefs.sensitivity;
    this.rig.controls.rotateSpeed = 0.65 * prefs.sensitivity;
    this.haptics.enabled = prefs.vibration !== false;
    this._applyDifficulty();
  }

  /** 難易度 into the numbers it scales — or the plain ones, in a duel. */
  _applyDifficulty() {
    if (!this._baseDifficulty) {
      const d = settings.defense;
      const ai = settings.enemyAI;
      this._baseDifficulty = {
        damage: settings.combat.player.damage,
        parryWindow: d.parryWindow,
        cooldownMin: ai.cooldownMin,
        cooldownMax: ai.cooldownMax,
        maxAttackers: ai.maxAttackers,
        telegraphTime: ai.telegraphTime
      };
    }
    const base = this._baseDifficulty;
    const id = this.pvp?.active ? 'normal' : this.prefs?.difficulty ?? 'normal';
    const k = DIFFICULTY[id] ?? DIFFICULTY.normal;
    this.difficulty = { id, ...k };
    settings.combat.player.damage = base.damage * k.damage;
    settings.defense.parryWindow = base.parryWindow * k.parry;
    settings.enemyAI.cooldownMin = base.cooldownMin * k.cooldown;
    settings.enemyAI.cooldownMax = base.cooldownMax * k.cooldown;
    settings.enemyAI.maxAttackers = Math.max(1, base.maxAttackers + k.attackers);
    settings.enemyAI.telegraphTime = base.telegraphTime * k.telegraph;
  }

  /* ---- 一時停止 — the pause menu (the title sheet in its pause mode) ---- */

  _openPause() {
    if (this.title?.visible || this.pvp?.active || this.playerDown || this.inCharacterScreen) return;
    if (this.upgradeMenu.visible) this._toggleUpgrade(false);
    const stage = this.stage;
    let where = '自由戦闘';
    let restart = null;
    if (stage?.active) {
      where = `一ノ章 · ${stage.objective.textContent.replace(/^目的 · /, '')}`;
      restart = stage.checkpoint === 'save' ? '鏡から再開' : '門からやり直す';
    }
    where += ` · ${{ easy: '易', normal: '普', hard: '難' }[this.difficulty?.id] ?? '普'}`;
    this.paused = true;
    this.pointerLook?.release();
    this.title.showPause({ where, restart });
  }

  _closePause() {
    if (!this.title?.visible || this.title.mode !== 'pause') return;
    this.title.hide();
    this.paused = false;
  }

  /** 鏡から再開: the last checkpoint, whole again (the gate, if no mirror yet). */
  _restartFromCheckpoint() {
    this._closePause();
    const stage = this.stage;
    if (!stage?.active) return;
    if (stage.checkpoint === 'save') {
      this.souls.clear();
      this.projectiles.clear();
      this.execution?.reset();
      this.arts?.reset();
      stage.retry();
      this.toast.show('鏡より再開', 1200);
    } else {
      stage.start({ tutorial: false });
    }
  }

  /** 「セーブ削除」: souls, upgrades, the stage record and the settings. */
  _eraseSave() {
    save.clear();
    this.progress.reset();
    this._applyUpgrades();
    this._applyPrefs({ ...DEFAULT_PREFS });
    this.toast.show('セーブを削除しました', 1200);
  }

  _openTitle() {
    this.title.show();
    this.music.play('title');
    this.paused = true;
    this.pointerLook?.release();
  }

  _closeTitle() {
    this.title.hide();
    this.paused = false;
    if (this._startHint) {
      this.toast.show(this._startHint);
      this._startHint = null;
    }
  }

  /** Open or close 強化; the world holds still while it is up. */
  _toggleUpgrade(open = !this.upgradeMenu.visible) {
    if (open === this.upgradeMenu.visible) return;
    if (open) {
      if (this.pvp?.active || this.playerDown || this.inCharacterScreen) return;
      this._upgradePaused = this.paused;
      this.paused = true;
      this.upgradeMenu.open();
    } else {
      this.upgradeMenu.hide();
      this.paused = this._upgradePaused;
    }
  }

  /** The body upgrade is the health ceiling: raise it, and what is left with it. */
  _applyUpgrades() {
    const hp = settings.combat.player;
    const max = this.progress.value('body');
    if (max !== hp.maxHp) {
      this.playerHp = Math.max(1, this.playerHp + (max - hp.maxHp));
      hp.maxHp = max;
      this.playerHud.setHp(this.playerHp, max);
    }
  }

  /**
   * 一閃: the blow arrives while a swing of the player's own began no more than
   * `issen.window` seconds ago, at a body in front and in reach. The enemy falls
   * to one stroke and the blow never lands.
   */
  _tryIssen(enemy, x, z) {
    const cfg = settings.issen;
    if (!cfg.enabled || this.playerDown || !enemy?.alive) return false;
    if (this.elapsed - this._swingStartedAt > cfg.window) return false;
    if (!(this.character.moves ?? []).some((move) => move.locked)) return false;
    const p = this.character.position;
    const dx = enemy.position.x - p.x;
    const dz = enemy.position.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > cfg.reach) return false;
    const f = this.character.facing;
    const along = d > 1e-3 ? (dx * Math.sin(f) + dz * Math.cos(f)) / d : 1;
    if (along < Math.cos((cfg.arc * Math.PI) / 360)) return false;

    // Chain.
    this._issenChain = this.elapsed - this._issenAt <= cfg.chainTime ? this._issenChain + 1 : 1;
    this._issenAt = this.elapsed;

    const ux = -x;
    const uz = -z;
    const force = { ...settings.kick, damage: 1e6, slices: true, ...{ hitStop: cfg.hitStop, hitStopScale: cfg.hitStopScale, shake: cfg.shake } };
    this._issenKill = true;
    const result = this.enemies.hit(enemy, ux, uz, force);
    this._issenKill = false;
    this._impact(enemy, ux, uz, force, result ?? 'finisher', true);
    // 居合: a line of light straight through the body, across the cut.
    this._iai(enemy.position, f, 1.25);
    this.meleeSparks.burst(enemy.position.x, p.y + 1.1, enemy.position.z, ux, 0.2, uz, settings.combat.sparks, 1.6);
    this._hitStop = Math.max(this._hitStop, cfg.hitStop);
    this._hitStopScale = cfg.hitStopScale;
    this._hitRelease = 0;
    this.musouGauge = Math.min(settings.musou.max, this.musouGauge + cfg.gaugeBonus * this._issenChain);
    this.audio.clang({ x: enemy.position.x, y: p.y + 1, z: enemy.position.z }, { bright: true, strength: 1.4 });
    this.rig.punch(ux, uz, 0.1, settings.combat.fovKick * 2, 0);
    const flash = this._parryFlash;
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
    this.toast.show(this._issenChain > 1 ? `一閃 ×${this._issenChain}` : '一閃', 1100);
    this.counters.issen++;
    this.haptics.pulse([25, 30, 25]);
    this._invuln = Math.max(this._invuln, 0.3);
    return true;
  }

  /**
   * A blow caught on the guard: steel on steel, sparks off the front of the
   * body, a small shove back — and no red, because nothing got through.
   */
  _onBlocked(enemy, x, z, outcome) {
    const p = this.character.position;
    const y = p.y + this.character.height * 0.6;
    const px = p.x - x * 0.45;
    const pz = p.z - z * 0.45;
    this.meleeSparks.burst(px, y, pz, -x, 0.2, -z, settings.combat.sparks, 0.7);
    this.audio.clang({ x: px, y, z: pz }, { strength: 0.9 });
    this.rig.shake(settings.enemyAI.hitShake * 0.4);
    this.controller.knock(x, z, settings.defense.blockPush);
    this._hitStop = Math.max(this._hitStop, 0.04);
    this._hitStopScale = 0.25;
    this._hitRelease = 0;
    const chip = settings.combat.player.damage * outcome.damageScale;
    if (chip > 0) {
      this.playerHp = Math.max(0, this.playerHp - chip);
      this.playerHud.setHp(this.playerHp, settings.combat.player.maxHp);
      if (this.playerHp <= 0) this._down(x, z);
    }
    this._invuln = Math.max(this._invuln, 0.25);
  }

  /**
   * The guard went up just in time: the blow is turned aside. Nothing gets
   * through, the attacker is thrown back off balance, and for
   * `counterWindow` seconds the player's next blow lands harder.
   *
   * Sold louder than a block on every channel: a brighter, longer ring,
   * twice the sparks, a small shock ring on the ground, the edges of the
   * screen flashing white, and a short freeze on the moment itself.
   */
  _onParried(enemy, x, z) {
    const d = settings.defense;
    const p = this.character.position;
    const y = p.y + this.character.height * 0.6;
    const px = p.x - x * 0.5;
    const pz = p.z - z * 0.5;
    // The attacker: shoved away from the player, and left reeling long enough
    // to be punished.
    enemy.shove?.(-x, -z, 3.5, 0.6);
    if (enemy.alive) enemy.staggerTime = Math.max(enemy.staggerTime, d.parryStagger);
    // Reeling from the parry: open to an execution for as long as it reels.
    if (enemy.alive) enemy._parriedUntil = this.elapsed + d.parryStagger;
    this.counters.parry++;
    this.haptics.pulse([30]);
    if (enemy.takePosture?.(settings.posture.parryDamage * (enemy.kindCfg?.parryPosture ?? 1))) this._postureBroke(enemy);
    this.meleeSparks.burst(px, y, pz, -x, 0.3, -z, settings.combat.sparks, 1.5);
    const parryColor = getColor(settings.vfx.parry.color);
    this.fx.flare(px, y, pz, parryColor, settings.vfx.parry.size, 0.3);
    this.fx.ring(p.x, p.y, p.z, parryColor, 1.9, 0.38);
    this.musouShock.burst(px, pz, settings.musou.shock, 0.25);
    this.audio.parry({ x: px, y, z: pz });
    this.rig.shake(0.12);
    this.rig.punch(-x, -z, 0.08, settings.combat.fovKick, 0);
    this._hitStop = Math.max(this._hitStop, 0.09);
    this._hitStopScale = 0.12;
    this._hitRelease = 0;
    this._invuln = Math.max(this._invuln, 0.3);
    const flash = this._parryFlash;
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
    this.toast.show('パリィ — 反撃！', 900);
  }

  /** A stance just gave way: announce it on the body and on the screen. */
  _postureBroke(enemy) {
    const p = enemy.position;
    const y = p.y + settings.enemies.height * 0.7;
    this.meleeSparks.burst(p.x, y, p.z, 0, 1, 0, settings.combat.sparks, 1.2);
    this.audio.clang({ x: p.x, y, z: p.z }, { strength: 1.3 });
    this.toast.show('体勢崩し — 処刑せよ', 1100);
  }

  /**
   * The counter: a blow thrown while the parry's window is open does
   * `counterDamage` more, and the window is spent by the first one that lands.
   */
  _counterForce(config) {
    // The blade's upgrade (never in a duel: the server's numbers are the numbers).
    const blade = this.pvp?.active ? 1 : this.progress.value('blade');
    const counter = this.defense.counter > 0 ? settings.defense.counterDamage : 0;
    if (blade === 1 && !counter) return config;
    return {
      ...config,
      damage: (config.damage ?? 1) * blade + counter,
      postureDamage: (config.postureDamage ?? settings.posture.hitDamage) * blade
    };
  }

  /** A blow that got through, scaled by what the guard took off it. */
  _takeHit(enemy, x, z, scale = 1) {
    const ai = settings.enemyAI;
    this.rig.shake(ai.hitShake);
    this.rig.punch(-x, -z, ai.hitShake * 0.6, 0, ai.hitShake * settings.combat.roll);
    this._hitStop = Math.max(this._hitStop, ai.hitStop);
    this._hitStopScale = ai.hitStopScale;
    this._hitRelease = 0;
    // A big body hits harder and throws you further (`settings.enemyKinds`).
    const kind = enemy?.kindCfg;
    this.controller.knock(x, z, ai.knockback * (kind?.knockback ?? 1));
    const p = this.character.position;
    this.audio.impact({ x: p.x, y: p.y + 1, z: p.z }, { cut: false, strength: 0.7 });
    const flash = this._hurtFlash;
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');

    // And now it costs something.
    const hp = settings.combat.player;
    const lost = Math.min(this.playerHp, hp.damage * scale * (kind?.damage ?? 1));
    this.playerHp -= lost;
    this.counters.damage += lost;
    this.haptics.pulse(this.playerHp <= 0 ? [80, 40, 120] : [55]);
    this._invuln = hp.invulnerable;
    this.playerHud.setHp(this.playerHp, hp.maxHp);
    if (this.playerHp <= 0) this._down(x, z);
  }

  /**
   * The bar is empty: the body goes over backward along the blow, every
   * control stops, nothing new may hit or be started, and Retry comes up once
   * the fall has been seen. Whatever the body was doing is let go.
   */
  _down() {
    if (this.playerDown) return;
    this.playerDown = true;
    this.counters.downs++;
    this._downT = 0;
    this.controller.frozen = true;
    this.character.jump?.cancel();
    this.character.hop?.cancel();
    for (const move of this.character.moves ?? []) move.release();
    this.targetRings.clear();
    this.targetHotkeys.clear();
    this.playerHud.showDown(settings.combat.player.retryDelay);
  }

  /**
   * The fall itself, laid on the body's `tilt` group so it pivots at the feet
   * and never touches the heading on the root: over backward on a quadratic,
   * one small bounce, and lying there.
   */
  _updateDown(dt) {
    this._downT += dt;
    const t = this._downT;
    const fall = 0.55;
    let angle = 1.5 * Math.min(1, (t / fall) ** 2);
    if (t > fall) angle -= 0.08 * Math.sin((t - fall) * 14) * Math.exp(-(t - fall) * 6);
    const forward = this.character._forwardYaw ?? 0;
    _fallAxis.set(-Math.cos(forward), 0, Math.sin(forward));
    this.character.tilt.quaternion.setFromAxisAngle(_fallAxis, angle);
    this.character.tilt.position.y = 0.12 * Math.min(1, angle / 1.5);
  }

  /** Back on the feet: full health, a fresh ring of bodies, a moment's cover. */
  _retry() {
    if (!this.playerDown) return;
    const hp = settings.combat.player;
    this.playerDown = false;
    this.controller.frozen = false;
    this.playerHp = hp.maxHp;
    this._invuln = hp.retryInvulnerable;
    this.playerHud.setHp(this.playerHp, hp.maxHp);
    this.playerHud.hideDown();
    this.character.tilt.quaternion.identity();
    this.character.tilt.position.set(0, 0, 0);
    this.musouGauge = 0;
    this.defense.reset();
    this.souls.clear();
    this.projectiles.clear();
    this.execution?.reset();
    this.arts?.reset();
    // In the stage, back to the last checkpoint; out of it, a fresh ring.
    if (this.stage?.active) this.stage.retry();
    else this.enemies.respawnAll();
    this.toast.show('再起', 900);
  }

  /** What the lock can take: the standing crowd (PvP hands it the opponent instead). */
  lockCandidates() {
    if (this.pvp?.active) return this.pvp.opponent.alive ? [this.pvp.opponent] : [];
    return this.enemies.enemies;
  }

  /** A move's settings block back to its key — what a hit claim names. */
  _configKey(config) {
    if (!this._configKeys) {
      this._configKeys = new Map(Object.entries(settings).map(([key, value]) => [value, key]));
    }
    return this._configKeys.get(config) ?? 'kick';
  }

  /* ---- the duel (`net/PvpMode.js` calls these) ---- */

  /** Into a room: the arena up, the crowd away, the body on its feet. */
  _pvpEnter() {
    this.stage?.leave(false);
    this._applyDifficulty();
    this.arenaHeld = true;
    this.souls.clear();
    this.execution?.reset();
    this.arts?.reset();
    this._toggleUpgrade(false);
    this.lockOn.release();
    this._pvpRevive();
  }

  /** Out of it: the practice world back exactly as it was. */
  _pvpExit() {
    this.arenaHeld = false;
    // The duel is over: back to the chosen 難易度 (`pvp.active` is still set
    // while this runs, so the numbers are put back a beat later).
    setTimeout(() => this._applyDifficulty(), 0);
    this.lockOn.release();
    this._pvpRevive();
    const hp = settings.combat.player;
    this.playerHp = hp.maxHp;
    this.playerHud.setHp(this.playerHp, hp.maxHp);
    this.defense.reset();
    this.musouGauge = 0;
  }

  _pvpPlace(x, z, facing) {
    this._teleport(x, z, facing);
  }

  /** A new round: on the mark, on the feet, fresh stamina, empty gauge. */
  _pvpRoundReset(x, z, facing) {
    this._pvpRevive();
    for (const move of this.character.moves ?? []) move.release();
    this._teleport(x, z, facing);
    this.defense.reset();
    this.musouGauge = 0;
    this._invuln = 0;
    this.lockOn.release();
  }

  _pvpRevive() {
    this.controller.frozen = false;
    if (!this.playerDown) return;
    this.playerDown = false;
    this.playerHud.hideDown();
    this.character.tilt.quaternion.identity();
    this.character.tilt.position.set(0, 0, 0);
  }

  /** Lost the round: over backward, as in PvE — but no Retry, the server decides. */
  _pvpFall() {
    if (this.playerDown) return;
    this.playerDown = true;
    this._downT = 0;
    this.controller.frozen = true;
    this.character.jump?.cancel();
    this.character.hop?.cancel();
    for (const move of this.character.moves ?? []) move.release();
  }

  /**
   * The server says the opponent's blow reached me, and what my guard made of
   * it. Health is already the server's (`PvpMode#_syncHp`); this is the feel,
   * the same as a PvE blow, and the guard's local book-keeping.
   */
  _pvpTakeHit(result, x, z) {
    const d = settings.defense;
    if (result === 'parry') {
      this.defense.stamina = Math.min(d.staminaMax, this.defense.stamina + (d.parryRefund ?? 0));
      this.defense.counter = d.counterWindow;
      this._onParried(PVP_NOBODY, x, z);
      return;
    }
    if (result === 'block') {
      this.defense.spend(d.guardCost);
      this._onBlocked(PVP_NOBODY, x, z, { damageScale: 0 });
      return;
    }
    if (result === 'break') {
      this.defense.stamina = 0;
      this.defense.broken = d.breakTime;
      this.defense.guarding = false;
      this.toast.show('ガードが崩れた', 900);
    }
    // `_takeHit` without the arithmetic: the number is the server's.
    const ai = settings.enemyAI;
    this.rig.shake(ai.hitShake);
    this.rig.punch(-x, -z, ai.hitShake * 0.6, 0, ai.hitShake * settings.combat.roll);
    this._hitStop = Math.max(this._hitStop, ai.hitStop);
    this._hitStopScale = ai.hitStopScale;
    this._hitRelease = 0;
    this.controller.knock(x, z, ai.knockback);
    const p = this.character.position;
    this.audio.impact({ x: p.x, y: p.y + 1, z: p.z }, { cut: false, strength: 0.7 });
    const flash = this._hurtFlash;
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
  }

  /** The server confirmed my blow on the opponent: sell it like a PvE hit. */
  _pvpLandedHit(opponent, result, x, z, move, counter) {
    const config = settings[move] ?? settings.kick;
    if (result === 'hit' || result === 'break') {
      this._impact(opponent, x, z, config, counter ? 'kill' : 'stagger', true);
      if (counter) this.toast.show('反撃！', 700);
      return;
    }
    // Blocked or parried: steel on steel at the opponent's guard.
    const p = opponent.position;
    const y = p.y + this.character.height * 0.6;
    this.meleeSparks.burst(p.x - x * 0.4, y, p.z - z * 0.4, -x, 0.2, -z, settings.combat.sparks, 0.8);
    if (result === 'parry') this.audio.parry({ x: p.x, y, z: p.z });
    else this.audio.clang({ x: p.x, y, z: p.z }, { strength: 0.8 });
    this._hitStop = Math.max(this._hitStop, result === 'parry' ? 0.09 : 0.04);
    this._hitStopScale = 0.2;
    this._hitRelease = 0;
    if (result === 'parry') this.toast.show('弾いた！', 800);
  }

  /** Put the arena up (the player to the first mark) or take it down. */
  _setArena(on) {
    if (!on) {
      this.arena.leave();
      return;
    }
    this.arena.enter();
    const spawn = this.arena.spawns[0];
    this._teleport(spawn.x, spawn.z, spawn.facing);
    // The crowd was standing round wherever the player was.
    if (!this.arenaHeld) this.enemies.respawnAll();
  }

  /** Stand the body on a mark, facing `facing` — the arena, a new round. */
  _teleport(x, z, facing) {
    const c = this.character;
    c.position.set(x, this.terrain.heightAt(x, z), z);
    c.setFacing(facing);
    settings.character.facing = facing;
  }

  /** Blows and bodies fill the gauge — but not the Musou's own. */
  _feedMusou(lethal) {
    const config = settings.musou;
    if (this.character.musou?.some((move) => move.locked)) return;
    const spirit = this.pvp?.active ? 1 : this.progress.value('spirit');
    this.musouGauge = Math.min(config.max, this.musouGauge + (config.perHit + (lethal ? config.perKill : 0)) * spirit);
  }

  /**
   * The press that spends the gauge, on the frame its first blow starts.
   *
   * Everything the opening has to say happens here, together: the world drops
   * to a crawl, the lens pulls in, and everyone standing too close is shoved
   * out to the edge of a ring — so the first sweep has room to be a sweep.
   */
  _startMusou() {
    const config = settings.musou;
    this.musouGauge = 0;
    this._hitStop = Math.max(this._hitStop, config.introTime);
    this._hitStopScale = config.introScale;
    this._hitRelease = 0;

    const origin = this.character.position;
    const yaw = this.character.facing;
    this.rig.punch(Math.sin(yaw), Math.cos(yaw), 0.2, settings.combat.fovKick * 2, 0);
    for (const enemy of this.enemies.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - origin.x;
      const dz = enemy.position.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance > config.auraRadius) continue;
      const k = distance > 1e-3 ? 1 / distance : 0;
      enemy.shove(dx * k || 1, dz * k, config.auraPush * (1 - distance / config.auraRadius) + 1.5);
    }
    this.audio.impact(
      { x: origin.x, y: origin.y + 1, z: origin.z },
      { cut: true, strength: 1.2 }
    );
    this.toast.show('無双 — 旋風陣');
    this.pvp?.musou();
  }

  /** The whoosh, a beat before contact — hit or miss. */
  _onSwing(move) {
    const p = this.character.position;
    const at = { x: p.x, y: p.y + this.character.height * 0.6, z: p.z };
    this.audio.swing(at, move.config.slices ? 1 : 0.25);
  }

  /**
   * Light a ring under whoever a press would land on, and say which press.
   *
   * The question is asked one move at a time, and it is the move's *own*
   * question: `findTarget` with that move's range and cone, which is the exact
   * call `ThirdPersonController` makes on the press. So a body wears a ring
   * because a key would take it — not because it happens to be standing inside
   * some cone alongside three others the swing will never reach. Two rings can
   * still come up, and when they do they are telling the truth: the kick and
   * the slash have locked different bodies, and the caps over each head say
   * which key goes where.
   *
   * Every *enabled* attack is asked, rather than only the ones that could start
   * this instant: the moves lock each other out for the length of a swing (see
   * `Attack#canStart`), and a ring that blinked off for the half second the
   * body was busy would read as the target being lost. `ready` carries that
   * difference instead, and only dims the cap.
   *
   * That `ready` set is the single answer to "would this key do anything right
   * now", and three things are drawn off it: the cap over the head, the plate
   * along the bottom (`_syncAbilities`) and the press itself, which the
   * controller refuses on the same `findTarget` call. One answer, so a plate
   * cannot come up over a body no key would reach.
   *
   * @param {number} dt
   * @param {import('three').Vector3} position
   */
  _updateTargetRings(dt, position) {
    const locked = this._locked;
    const ready = this._readyMoves;

    // Every list back to the pool before the map is emptied — the map is the
    // only thing holding them.
    for (const keys of locked.values()) {
      keys.length = 0;
      this._keyLists.push(keys);
    }
    locked.clear();
    ready.clear();

    const facing = this.character.facing;
    for (const move of this.character.attacks ?? []) {
      if (!move.available || !move.config.enabled) continue;

      const enemy = this.enemies.findTarget(position, facing, move.config);
      if (!enemy) continue;

      // Mid-swing counts as ready: the cap should be lit on the move the body
      // is committed to, not dimmed the instant the key does its job.
      if (move.locked || move.canStart()) ready.add(move.configKey);

      let keys = locked.get(enemy);
      if (!keys) {
        keys = this._keyLists.pop() ?? [];
        locked.set(enemy, keys);
      }
      keys.push(move.configKey);
    }

    this.targetRings.update(dt, locked, this.elapsed);
    this.targetHotkeys.update(dt, locked, ready);
  }

  /**
   * Footfalls: the player's by distance walked on the ground (a stride at a
   * walk, a longer one at a run), and the heavy bodies' — brute and boss —
   * the same way, so something large coming is heard before it is seen.
   */
  _footsteps(position) {
    const c = this.character;
    const cfg = settings.audio;
    const airborne = c.jump?.locked || c.hop?.locked;
    const moved = Math.hypot(position.x - this._stepFrom.x, position.z - this._stepFrom.z);
    this._stepFrom.copy(position);
    if (!airborne && moved < 2) {
      this._stepAcc += moved;
      const speed = this.controller.speed;
      const stride = speed > settings.locomotion.walkSpeed * 1.2 ? cfg.stepRun : cfg.stepWalk;
      if (this._stepAcc >= stride) {
        this._stepAcc = 0;
        this.audio.footstep(position, speed > settings.locomotion.walkSpeed * 1.2 ? 0.8 : 0.35);
      }
    }
    for (const e of this.enemies.enemies) {
      if (!e.alive || (e.kind !== 'brute' && e.kind !== 'boss')) continue;
      const p = e.position;
      if (e._stepFrom) {
        const d = Math.hypot(p.x - e._stepFrom.x, p.z - e._stepFrom.z);
        if (d < 2) e._stepAcc = (e._stepAcc ?? 0) + d;
        if (e._stepAcc > (e.kind === 'boss' ? 1.9 : 1.6)) {
          e._stepAcc = 0;
          this.audio.footstep(p, e.kind === 'boss' ? 2.6 : 2);
        }
        e._stepFrom.set(p.x, p.z);
      } else {
        e._stepFrom = { x: p.x, z: p.z, set(x, z) { this.x = x; this.z = z; } };
      }
    }
  }

  /**
   * The score follows the game: the title's calm, the field (as hard as the
   * fight around the player), the boss (by phase), the clear. Ducked while
   * down or paused. Everything here only changes something when it differs.
   */
  _syncMusic() {
    const music = this.music;
    const stage = this.stage;
    const boss = stage?.boss;
    let piece = 'field';
    if (this.title?.atTitle) piece = 'title';
    else if (stage?.step === 'clear') piece = 'clear';
    else if (stage?.step === 'boss' && boss && !boss.defeated) piece = 'boss';
    music.play(piece);
    if (boss) music.setPhase(boss.phase);
    // How hard the field plays: bodies close and awake around the player.
    let near = 0;
    if (this.pvp?.active) near = 3;
    else {
      const p = this.character.position;
      for (const e of this.enemies.enemies) {
        if (!e.alive || e._passive) continue;
        const dx = e.position.x - p.x;
        const dz = e.position.z - p.z;
        if (dx * dx + dz * dz < 196) near += e.kind === 'brute' ? 2 : 1;
      }
    }
    music.intensity = Math.min(1, near / 3);
    this.ambience.calm = 1 - music.intensity;
    this.ambience.boss = piece === 'boss';
    // Nearly done: the heart, louder the lower it goes.
    const hpFrac = this.playerHp / Math.max(1, settings.combat.player.maxHp);
    if (!this.playerDown && !this.paused && hpFrac < 0.3 && !this.pvp?.active) {
      if (this.elapsed >= (this._beatAt ?? 0)) {
        this._beatAt = this.elapsed + 0.75 + hpFrac * 1.2;
        this.audio.heartbeat(1.2 - hpFrac * 2);
      }
    }
    const duck = this.playerDown ? 0.35 : this.paused && !this.title?.atTitle ? 0.5 : 1;
    if (duck !== this._musicDuck) {
      this._musicDuck = duck;
      music.duck(duck);
    }
  }

  /**
   * Say which moves the player can reach right now.
   *
   * Every answer is asked of the thing that owns it — the moves' own
   * `canStart()`, the summons' own `active` — rather than re-derived here, so
   * the row cannot claim a key will work when the press would be swallowed.
   * The attacks report `off` while another one has the body, which is exactly
   * what a press would do.
   *
   * For the techniques that is only half the question: a move also needs
   * someone inside its range and its cone, or the controller spends the press
   * and walks on (`ThirdPersonController#update`). That half is not re-asked
   * here — `_readyMoves` was filled from the same `findTarget` call the press
   * itself makes, one pass earlier in this frame, and is already "in reach
   * *and* able to start". Asking it twice is how the plate and the key drift
   * into disagreeing about the frame a body crosses the edge of the cone.
   */
  _syncAbilities() {
    const jump = this.character.jump;
    const hop = this.character.hop;
    const state = {
      leap:
        jump?.locked || hop?.locked
            ? 'active'
            : jump?.canStart(this.controller.speed, this.input.running) || hop?.canStart()
              ? 'ready'
              : 'off',
      // Always open, and never `active`: the studio hides this row while it is
      // up (`body.cs-open .hud`), so the only state it can be seen in is ready.
      customize: 'ready',
      // Lit from the moment `V` arms the mark, not from the moment the pair
      // steps out: the key has been spent either way, and the chip is what says
      // the next press means something else.
      raikiri: this.arts?.state('raikiri') ?? 'off',
      kagebashiri: this.arts?.state('kagebashiri') ?? 'off',
      shukuchi: this.arts?.state('shukuchi') ?? 'off'
    };

    for (const move of this.character.attacks ?? []) {
      state[move.configKey] = move.locked
        ? 'active'
        : this._readyMoves.has(move.configKey)
          ? 'ready'
          : 'off';
    }

    // The string is always there on the ground; the Musou is lit only when its
    // gauge is full, and otherwise *charging* — dimmed, with the gauge showing.
    const inCombo = this.character.combo?.some((move) => move.locked);
    const inMusou = this.character.musou?.some((move) => move.locked);
    state.combo = !settings.combo.enabled ? 'off' : inCombo ? 'active' : 'ready';
    state.guard = this.defense.guarding
      ? 'active'
      : this.playerDown || !settings.defense.enabled || this.defense.broken > 0
        ? 'off'
        : 'ready';
    state.hien = this.arts?.stance ? 'active' : this.execution?.hienReady ? 'ready' : 'off';
    const full = this.musouGauge >= settings.musou.max;
    state.musou = inMusou
      ? 'active'
      : !settings.musou.enabled
        ? 'off'
        : full
          ? 'ready'
          : 'charging';
    const gauge = this.musouGauge / Math.max(1, settings.musou.max);
    this.actionHUD.setGauge('musou', gauge);
    this.mobileControls?.setGauge('musou', gauge);

    this.actionHUD.update(state);
    this.mobileControls?.update(state);
  }

  /** However the screen was closed, the play stage comes back here. */
  _onScreenExit() {
    this.rig.setParked(false);
    this.post.setView(this.scene, this.camera);
    this.toast.show('戦場へ戻る');
  }

  /* ------------------------------------------------------------------ */

  /** Load assets, warm the shader cache, then start the loop. */
  async load() {
    await this._editorLoad;
    const assets = new AssetLoader();

    this.loading.setProgress(0.05, '夜を描いている…');
    const hdr = await assets.loadHDR(HDR_URL);
    await this.environment.loadEnvironment(hdr);
    frame.uEnvMap.value = this.environment.equirect;

    this.loading.setProgress(0.3, '大地を敷いている…');
    await this.ground.loadTextures(assets);
    // And what is lying on it. Before the shader warm-up below, so the two leaf
    // materials are compiled with everything else rather than on the first frame
    // a leaf is in shot.
    await this.leaves.load(assets, this.renderer);

    // Before the shader warm-up below, so the moon is compiled with the rest and
    // the first frame has a body in it rather than a disc that swaps a moment
    // later. If the maps fail the sky keeps its own disc and nothing else knows.
    await this.moon.load(assets);

    // One build before the first frame, so the ground is shaped when the
    // loading screen lifts rather than settling a frame into it. The floor
    // follows, because it is what re-bakes the height field the terrain has just
    // described (see `world/TerrainCache.js`) — and it has to happen before the
    // shader compile below, not on the first frame after it.
    this.terrain.update();
    this.ground.update(0, 0, 0);

    this.loading.setProgress(0.55, '侍を呼んでいる…');
    await this.character.load(assets);

    this.loading.setProgress(0.72, '鬼を起こしている…');
    await this.enemies.load(assets);
    // An attack knows the frame the blow lands and nothing else; what being hit
    // means is decided here. Each hands over its own settings block, so the
    // impact is the one the move was tuned with.
    for (const move of this.character.attacks) {
      move.onHit = (enemy, x, z) => this._onStrike(enemy, x, z, move.config);
      move.onSwing = () => this._onSwing(move);
    }
    // The string and the Musou land on a sector, not on a body.
    for (const move of [...this.character.combo, ...this.character.musou]) {
      move.onArea = () => this._onArea(move);
      move.onSwing = () => this._onSwing(move);
    }
    this.controller.musouReady = () => this.musouGauge >= settings.musou.max;
    this.controller.onMusouStart = () => this._startMusou();
    // The bodies walk and swing with the player's own clips, rebuilt for their
    // rig — before the first of them stands up, so every one has them.
    const clips = this.character.clips;
    this.enemies.setMotions({
      walk: clips.get('walk'),
      attacks: { kick: clips.get('kick'), slashHit: clips.get('slashHit') }
    });
    this.enemies.onPlayerHit = (enemy, x, z) => this._onPlayerHit(enemy, x, z);
    this.enemies.onKill = (enemy) => this._onEnemyKilled(enemy);
    // The kinds (`settings.enemyKinds`): what each carries, the 弓 / 鉄砲's shots,
    // and a 盾's shield taking a blow.
    this.enemies.makeProp = makeEnemyProp;
    this.enemies.onFire = (enemy, gun) => this._enemyFire(enemy, gun);
    this.enemies.onBlocked = (enemy, x, z) => this._onShieldBlock(enemy, x, z);
    this.enemies.onWindup = (enemy) => this._onEnemyWindup(enemy);
    this.defense.bind();
    // The duel: its button, its room panel, the opponent's body. After the
    // character has loaded, because the opponent is a clone of it.
    this.pvp = new PvpMode(this);
    // 処刑 and 飛燕 (`combat/Execution.js`): they swing the character's own slash.
    this.execution = new Execution(this);
    // 秘剣: 雷切, 影走り, 縮地 and 居合 (`combat/Arts.js`).
    this.arts = new Arts(this);
    // 一ノ章: the stage — gate, plaza, save point, boss (`world/Stage.js`).
    this.stage = new Stage(this);
    // 題: the first screen (`ui/TitleScreen.js`). The world holds still under it.
    this.title = new TitleScreen({
      onStage: (options) => {
        this._closeTitle();
        this.stage.start(options);
      },
      onFree: () => this._closeTitle(),
      onPvp: () => {
        this._closeTitle();
        this.pvp.open();
      },
      onUpgrade: () => this._toggleUpgrade(true),
      record: () => this.stage.record,
      prefs: () => this.prefs,
      onPrefs: (patch) => this._applyPrefs(patch),
      onErase: () => this._eraseSave(),
      onSound: () => this.audio.ui(),
      onResume: () => this._closePause(),
      onRestart: () => this._restartFromCheckpoint(),
      onQuit: () => {
        this._closePause();
        if (this.stage?.active) this.stage.leave();
        else this._openTitle();
      }
    });
    this.stage.onTitle = () => this._openTitle();
    const query = new URLSearchParams(location.search);
    if (query.has('stage')) this.stage.start();
    else if (!query.has('notitle')) this._openTitle();

    this.controller.spendLeap = () => {
      const ok = this.defense.spend(settings.defense.leapCost);
      if (!ok) this.toast.show('息が切れて跳べない', 700);
      return ok;
    };
    // Not in the air, and not while the Musou is running — it is the player's
    // moment, and a blow landing in the middle of it would take it back.
    this.enemies.canHitPlayer = () =>
      !this.playerDown &&
      this._invuln <= 0 &&
      !this.character.musou?.some((move) => move.locked);
    // Stood up now rather than on the first frame, so their materials are in
    // the scene for the shader warm-up below.
    this.enemies.respawnAll();

    this.loading.setProgress(0.8, '装備を整えている…');
    // The set and its rig cost nothing until they are drawn, and building them
    // now means `C` is instant. The equipment models themselves stay on disk
    // until the screen is opened — see `EquipmentLibrary`.
    this.characterScreen = new CharacterScreen({
      renderer: this.renderer,
      canvas: this.canvas,
      character: this.character,
      worldScene: this.scene,
      envMap: this.environment.envMap,
      onToast: (message) => this.toast.show(message),
      onExit: () => this._onScreenExit()
    });

    this.loading.setProgress(0.83, '刀を佩いている…');
    // The starting loadout — whatever was last dialled in on the set, or the
    // catalog's defaults on a first run. Gear hangs off the skeleton rather than
    // off either stage, so equipping here puts it on the body for the play scene
    // too, and a placement tuned in the screen is the one the world shows.
    await this.characterScreen.equipment.restoreOrDefaults();

    // The fire rides whatever the manager has equipped, so it is built once the
    // loadout is on. It binds itself on the first frame it is updated.
    this.weaponFire = new WeaponFire({ equipment: this.characterScreen.equipment });
    this.characterScreen.setWeaponFire(this.weaponFire);

    this.loading.setProgress(0.85, '陰影を練っている…');
    // Compile everything up front so the first frame never stutters — both
    // stages, so opening the character screen is not its own first frame. The
    // fire's light is walked through both scenes on the way, because adding a
    // light to a scene is what invalidates every material program in it.
    this.weaponFire.attachTo(this.characterScreen.stage.scene);
    await this.renderer.gl.compileAsync(
      this.characterScreen.stage.scene,
      this.characterScreen.camera.camera
    );
    this.weaponFire.attachTo(this.scene);
    await this.renderer.gl.compileAsync(this.scene, this.camera);

    // Every texture has decoded by now, so the blobs the character's embedded
    // images were served from can go.
    await assets.settled();
    assets.dispose();

    this.loading.setProgress(1, '出陣');
    this.loading.hide();
    // The moves are named by the row along the bottom, so this only has to
    // cover what the row does not: the stick, and where to look for the rest.
    // Said once the title is out of the way (at once with `?notitle`).
    this._startHint = TOUCH
      ? '左スティックで移動 · 画面ドラッグで視点 · ピンチで拡大'
      : 'WASDで移動 · Shiftで走る · 技は画面下に';
    if (!this.title.visible) this._closeTitle();

    this.start();
  }

  start() {
    this.time.reset();
    this.stats?.reset();
    let skip = 0;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      // Under the title nothing moves: draw every other frame and let the GPU
      // (and a phone's battery) rest. The clock accumulates across the skip.
      if (this.title?.visible && ++skip % 2) return;
      this.frame();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this._raf);
  }

  /* ------------------------------------------------------------------ */

  frame() {
    const gl = this.renderer.gl;
    // The counters still standing are the ones the *previous* frame ran up, and
    // they are about to be cleared — so the readout is fed here, where a frame
    // ends for certain, rather than at each of the several places one can end.
    this.stats?.sample(gl.info.render);
    gl.info.reset();

    const raw = this.time.tick();
    this.gamepad.update(raw);
    // The impact freeze, spent in *real* time so it lasts as long on any frame
    // rate, and applied as a scale so everything slows together (see `_hitStop`).
    let scale = settings.global.timeScale;
    if (this._hitStop > 0) {
      this._hitStop = Math.max(0, this._hitStop - raw);
      scale *= this._hitStopScale;
      if (this._hitStop === 0) this._hitRelease = settings.combat.hitStopRelease;
    } else if (this._hitRelease > 0) {
      // Eased back up rather than let go: smoothstep from the freeze's scale to 1.
      this._hitRelease = Math.max(0, this._hitRelease - raw);
      const t = 1 - this._hitRelease / Math.max(1e-3, settings.combat.hitStopRelease);
      scale *= this._hitStopScale + (1 - this._hitStopScale) * t * t * (3 - 2 * t);
    }
    const dt = this.paused ? 0 : raw * scale;
    this.elapsed += dt;

    /* ---- shared uniforms ---- */
    frame.uTime.value = this.elapsed;
    frame.uDelta.value = dt;
    frame.uCameraNear.value = this.camera.near;
    frame.uCameraFar.value = this.camera.far;

    // Which grade is in force. Everything downstream reads this one object.
    const look = this.inCharacterScreen ? this.characterScreen.postLook : settings.post;

    /* ---- simulation ---- */
    this.renderer.syncSettings(look);

    if (this.inCharacterScreen) {
      // The play stage is not simulated while the studio is up: its lights,
      // floor and mist are not on screen, and the body is not standing on it.
      this.characterScreen.update(dt, raw);
      // After the body, so the flame is born off the pose that is about to be
      // drawn rather than off the last one.
      this.weaponFire?.update(dt, this.characterScreen.stage.scene);

      gl.shadowMap.needsUpdate = true;
      this.post.sync(this.elapsed, look);
      this.post.render();
      return;
    }

    // The arena goes up or comes down on the frame its switch flips. Before the
    // terrain, because putting it up flattens the ground.
    const wantArena = settings.arena.enabled || this.arenaHeld;
    if (wantArena !== this.arena.active) this._setArena(wantArena);

    // Any terrain slider moved this frame lands here, before anything reads a
    // height — so the floor and the body both see the same landscape.
    this.terrain.update();
    // The air and the sky are one look, so they are re-read together. The sky
    // drops its own disc for as long as there is a body to draw instead, and the
    // body comes second because it hangs itself on the light direction the sky
    // has just resolved.
    this.atmosphere.update();
    this.sky.discEnabled = !this.moon.active;
    this.sky.update(this.elapsed);
    this.moon.update();

    // Movement first: it sets the heading and the speed the blend animates to.
    // It only ever touches XZ; which is the whole reason the body can be dropped
    // onto the ground here without the controller knowing the ground exists.
    // Before the controller: a blow lands inside it, and its sparks must be
    // stamped with this frame's clock.
    this.meleeSparks.sync(this.elapsed, settings.combat.sparks);
    this.fx.sync(this.elapsed, settings.vfx.flashIntensity);
    this.miasma.sync(this.elapsed, settings.vfx.miasma.intensity);
    this.musouDust.sync(this.elapsed, settings.musou.dust);
    this.musouShock.update(dt, settings.musou.shock);
    this.comboCounter.update(raw);
    this.banner.update(raw);
    {
      const c = this.character;
      const free =
        !this.playerDown &&
        !this.inCharacterScreen &&
        !c.jump?.locked &&
        !c.hop?.locked &&
        !(c.moves ?? []).some((move) => move.locked);
      {
      // The moment a swing begins — the start of 一閃's window.
      const swinging = (c.moves ?? []).some((move) => move.locked);
      if (swinging && !this._wasSwinging) this._swingStartedAt = this.elapsed;
      this._wasSwinging = swinging;
    }
    this.defense.update(dt, this.elapsed, this.input.guardHeld, free);
      this.controller.guarding = this.defense.guarding;
      this.playerHud.setStamina(this.defense.stamina, settings.defense.staminaMax);
      const locked = settings.lockOn.enabled && !this.playerDown ? this.lockOn.update() : this.lockOn.release();
      this.controller.lockTarget = locked;
      this.rig.setLockTarget(locked ? locked.position : null);
      // A big lock pulls the lens back and up so the whole body stays in frame.
      const big = Math.max(0, (locked?.size ?? 1) - 1);
      this.rig.setFraming(big * 2.4, big * 0.7);
      this.mobileControls?.setLocked(!!locked);
    }
    this._invuln = Math.max(0, this._invuln - raw);
    if (this.playerDown) this._updateDown(dt);
    // In a duel the server says when anyone may move: not before the count,
    // not after the round, and not for a beat after a blow was parried.
    if (this.pvp?.active) this.controller.frozen = this.playerDown || this.pvp.frozen || this.pvp.stunned;
    // 処刑: an attack press next to a body that can be finished is the execution.
    if (this.execution && !this.execution.active && this.input._attacks.combo) {
      const candidate = this.execution.findCandidate();
      if (candidate && this.input.consumeAttack('combo')) this.execution.start(candidate);
    }
    this.arts?.update(dt);
    // Held still for the length of it; handed back after.
    const scripted = !!this.execution?.active || !!this.arts?.busy;
    if (scripted) this.controller.frozen = true;
    else if (this._wasScripted) this.controller.frozen = this.playerDown;
    this._wasScripted = scripted;
    this.controller.update(dt);
    // Inside the fence, while there is one.
    this.arena.clamp(this.character.position, settings.arena.margin);
    // Stand the character on the surface. The jump's arc lives inside the model
    // (it is the clip's own hips translation), so this stays the body's *ground*
    // height throughout and a leap over a valley still lands on the far side.
    const position = this.character.position;
    const groundY = this.terrain.heightAt(position.x, position.z);
    position.y = groundY;
    this.character.update(dt);

    // Before the bodies, not after: a blow landing this frame emits into this,
    // and a droplet has to be stamped with a clock the shader has already been
    // given or it is born a frame in the past.
    this.blood.sync(this.elapsed);

    // The bodies: their idles, their ragdolls and the ring they stand in. After
    // the character, because where the player is standing is what they watch,
    // what they are spawned around, and what the kick's reach was measured
    // against this frame.
    // No new swings while the Musou runs or the body is in the air.
    this.enemies.aiPaused =
      this.playerDown ||
      !!this.character.musou?.some((move) => move.locked);
    this.enemies.update(dt, position);
    this._footsteps(position);
    this.pvp?.update(dt);
    if (this.pvp?.active) this.arena.clamp(this.pvp.opponent.position, settings.arena.margin);
    if (this.arena.active) {
      for (const enemy of this.enemies.enemies) {
        if (enemy.alive) this.arena.clamp(enemy.position, settings.enemies.bodyRadius);
      }
    }
    // After them, so a body that has just been felled or has just walked out of
    // the cone loses its ring on the same frame it stops being a target.
    this._updateTargetRings(dt, position);
    this._updateMiasma(dt, position);
    this._updateOniAura(dt);
    this.execution?.update(dt);
    this.stage?.update(dt);
    _chest.set(position.x, position.y + this.character.height * 0.6, position.z);
    // After a clear the spoils come in by themselves, from anywhere on the field.
    const gather = this.stage?.step === 'clear';
    if (gather && this._gatherSouls?.base !== settings.souls) {
      this._gatherSouls = { ...settings.souls, pullRadius: 40, base: settings.souls };
    }
    this.souls.update(
      dt,
      _chest,
      gather || this.input.pressed.has('KeyZ'),
      gather ? this._gatherSouls : settings.souls,
      (kind) => this._onSoul(kind),
      !this.playerDown && !this.pvp?.active
    );
    this.playerHud.setSouls(this.progress.souls);
    this.projectiles.update(
      dt,
      _chest,
      (owner, x, z, gun) => this._onProjectile(owner, x, z, gun),
      (x, z) => this.terrain.heightAt(x, z)
    );

    this.environment.setFocus(position.x, position.z, groundY);
    this.environment.update();
    // Gear rides the skeleton, so this is only the mounts' scale against a rig
    // the editor may have just re-normalised.
    this.characterScreen?.equipment.update();
    this.weaponFire?.update(dt, this.scene);
    {
      // 残光: after the gear has its final pose for the frame.
      const c = this.character;
      const blade = this.weaponFire?.bladeSegment(_bladeA, _bladeB);
      const swinging = (c.moves ?? []).some((move) => move.locked);
      this.trail.update(dt, this.elapsed, swinging, blade ? _bladeA : null, blade ? _bladeB : null, settings.vfx.trail);
    }
    // After everything that could have taken the body, so a chip lights on the
    // frame the move it names actually starts.
    this._syncAbilities();
    this._syncMusic();

    this.ground.update(this.elapsed, position.x, position.z);
    // After the floor, because the puffs stand on the height field the bake it
    // just refreshed describes.
    this.groundFog.update(this.elapsed, position);
    // And the leaves, for the same reason — they lie on that bake, and the
    // window of them follows the body that has just finished moving. The
    // velocity is what scatters them: it goes in raw, so a walk stirs the litter
    // and a sprint throws it, and standing still disturbs nothing.
    this.leaves.update(dt, this.elapsed, position, this.controller.velocity);

    /* ---- camera ---- */
    // The rig runs on *real* time so orbiting stays responsive while paused.
    this.rig.setAnchor(position.x, groundY, position.z);
    this.pointerLook?.update();
    this.rig.update(raw);

    this.contactShadows.setPosition(position.x, position.z, groundY);
    this.contactShadows.render(this.scene);

    /* ---- render ---- */
    // At most one shadow map update per frame (see Renderer); 軽量 redraws it
    // every other frame — the light and the bodies move little in 16 ms.
    this._shadowFrame = (this._shadowFrame ?? 0) + 1;
    gl.shadowMap.needsUpdate = this._shadowEvery <= 1 || this._shadowFrame % this._shadowEvery === 0;
    this.post.sync(this.elapsed, look);
    this.post.render();
    if (!this.paused) this.renderer.measure(raw);
  }

  /* ------------------------------------------------------------------ */

  dispose() {
    this.stop();
    window.removeEventListener('keydown', this._onKeyDown);
    this.input.dispose();
    this.mobileControls?.dispose();
    this.targetRings.dispose();
    this.targetHotkeys.dispose();
    this.enemies.dispose();
    this.blood.dispose();
    this.meleeSparks.dispose();
    this.music.dispose();
    this.ambience.dispose();
    this.gamepad.dispose();
    this.audio.dispose();
    this.musouShock.dispose();
    this.musouDust.dispose();
    this.comboCounter.dispose();
    this._hurtFlash.remove();
    this._parryFlash.remove();
    this.lockOn.dispose();
    this.pvp?.dispose();
    this.fx.dispose();
    this.miasma.dispose();
    this.trail.dispose();
    this.souls.dispose();
    this.upgradeMenu.dispose();
    this.execution?.dispose();
    this.pointerLook?.dispose();
    window.removeEventListener('keyup', this._onKeyUp);
    this.playerHud.dispose();
    this.weaponFire?.dispose();
    this.characterScreen?.dispose();
    this.character.dispose();
    this.sky.dispose();
    this.moon.dispose();
    this.ground.dispose();
    this.groundFog.dispose();
    this.leaves.dispose();
    this.terrain.dispose();
    this.contactShadows.dispose();
    this.post.dispose();
    this.environment.dispose();
    this.editor?.dispose();
    this.toast.dispose();
    this.banner.dispose();
    this.stats?.dispose();
    this.actionHUD.dispose();
    this.rig.dispose();
    this.renderer.dispose();
  }
}
