import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { settings } from '../config/settings.js';
import { Boss } from '../combat/Boss.js';
import { Tutorial } from './Tutorial.js';

const SAVE_KEY = 'samurai.stage1';

/**
 * 一ノ章 — one short stage, start to finish:
 *
 *   門 (gate) → 広場戦 (the plaza fight) → 門開放 (the far gate opens) →
 *   鏡 (the save point) → 鬼武将 (the boss) → 討伐 (clear)
 *
 * The flow is the references' one: a small table of steps (the missions
 * list) and one piece of state that only ever moves forward (the reducer's
 * start → playing → won / lost), with a checkpoint to fall back to. The world
 * is laid out along +Z on flattened ground; which part of it may be walked is
 * decided by the step (the gates are closed barriers until the step opens
 * them), and the bodies are placed by the stage rather than by the free-roam
 * ring (`EnemyManager#manual`).
 *
 * Built light: every prop that shares a material is one merged mesh, the
 * barriers are three additive planes, and nothing is allocated per frame.
 */

const GATE1 = 8;
const PLAZA = { x: 0, z: 22, r: 10.5 };
const GATE2 = 33.5;
const SAVE = { x: 0, z: 42 };
const GATE3 = 50;
const ARENA = { x: 0, z: 64, r: 12.5 };
const LANE = 2.6;

/** The steps, in order, and what the objective line says during each. */
const STEPS = {
  tutorial: '修練',
  approach: '門へ進め',
  plaza: '広場の敵を討て',
  onward: '門が開いた — 先へ',
  boss: '鬼武将 羅刹を討て',
  clear: '討伐完了'
};

const BARRIER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const BARRIER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float streak = 0.55 + 0.45 * sin(vUv.x * 40.0 + uTime * 3.0) * sin(vUv.y * 6.0 - uTime * 2.0);
    float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    float fade = (1.0 - vUv.y) * (1.0 - uOpen);
    float a = streak * edge * fade * 0.55;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * 1.6, a);
  }
`;

export class Stage {
  /** @param {import('../core/App.js').App} app */
  constructor(app) {
    this.app = app;
    this.active = false;
    this.step = null;
    this.group = new Group();
    this.group.name = 'Stage';
    this.group.visible = false;
    this.barriers = {};
    this.boss = null;
    this.wave = [];
    this.checkpoint = 'start';
    this._saved = null;
    this._build();
    app.scene.add(this.group);

    // The objective line, and the clear screen.
    this.objective = document.createElement('p');
    this.objective.className = 'stage-objective';
    this.objective.hidden = true;
    this.clearScreen = document.createElement('div');
    this.clearScreen.className = 'stage-clear';
    this.clearScreen.hidden = true;
    this.clearScreen.innerHTML =
      '<p class="stage-clear__kanji">討伐</p><p class="stage-clear__title">一ノ章 · 完</p><p class="stage-clear__stats"></p>' +
      '<div class="stage-clear__row"><button type="button" data-act="again">もう一度</button><button type="button" data-act="leave">戻る</button></div>';
    this.clearScreen.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.clearScreen.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (act === 'again') this.start();
      if (act === 'leave') this.leave();
    });
    // The way in, next to the duel's button.
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'stage-open';
    this.button.textContent = '≡ タイトル';
    this.button.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.button.addEventListener('click', () => {
      if (this.active) this.leave();
      else this.onTitle?.();
    });
    this.tutorial = new Tutorial(app, { onDone: () => this._tutorialDone() });
    document.body.append(this.objective, this.clearScreen, this.button);
  }

  /* ------------------------------------------------------------------ */
  /* the set                                                              */
  /* ------------------------------------------------------------------ */

  _build() {
    const mat = (color, emissive = '#000000') => {
      const m = new MeshStandardMaterial({ color: new Color(color), emissive: new Color(emissive), roughness: 0.9 });
      this.app.atmosphere?.patch(m);
      this.app.environment?.excludeFromKeyLights?.(m);
      return m;
    };
    const stone = [];
    const wood = [];
    const red = [];
    const put = (geo, x, y, z, ry = 0) => {
      geo.rotateY(ry);
      geo.translate(x, y, z);
      return geo;
    };
    // Paving: the two lanes, the plaza and the arena.
    stone.push(put(new BoxGeometry(LANE * 2, 0.04, 16).translate(0, 0, 0), 0, 0.02, 6));
    stone.push(put(new CircleGeometry(PLAZA.r + 0.5, 40).rotateX(-Math.PI / 2), PLAZA.x, 0.025, PLAZA.z));
    stone.push(put(new BoxGeometry(LANE * 2, 0.04, 20), 0, 0.02, 42));
    stone.push(put(new CircleGeometry(ARENA.r + 0.5, 48).rotateX(-Math.PI / 2), ARENA.x, 0.025, ARENA.z));
    // Fence posts round the plaza and the arena.
    for (const area of [PLAZA, ARENA]) {
      const n = Math.round(area.r * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        // Leave the gates open in the fence.
        if (Math.abs(Math.sin(a)) < 0.2) continue;
        wood.push(put(new BoxGeometry(0.16, 1, 0.16), area.x + Math.sin(a) * (area.r + 0.6), 0.5, area.z + Math.cos(a) * (area.r + 0.6), a));
      }
    }
    // Lanterns along the lanes.
    for (const z of [2, 12, 38, 46]) {
      for (const x of [-LANE - 0.8, LANE + 0.8]) {
        stone.push(put(new BoxGeometry(0.4, 0.12, 0.4), x, 0.06, z));
        stone.push(put(new CylinderGeometry(0.09, 0.11, 0.8, 6), x, 0.5, z));
        stone.push(put(new BoxGeometry(0.36, 0.3, 0.36), x, 1.05, z));
      }
    }
    // The three torii.
    for (const z of [GATE1, GATE2, GATE3]) {
      for (const x of [-LANE, LANE]) red.push(put(new CylinderGeometry(0.16, 0.19, 3.6, 8), x, 1.8, z));
      red.push(put(new BoxGeometry(LANE * 2 + 1.4, 0.2, 0.3), 0, 3.3, z));
      red.push(put(new BoxGeometry(LANE * 2 + 0.6, 0.14, 0.22), 0, 2.8, z));
    }
    // The save point: a stone pedestal; the mirror is its own glowing disc.
    stone.push(put(new CylinderGeometry(0.45, 0.6, 0.9, 8), SAVE.x + LANE - 0.6, 0.45, SAVE.z));
    for (const [list, material] of [
      [stone, mat('#6d6a64')],
      [wood, mat('#4a3322')],
      [red, mat('#9e2a1b', '#2a0604')]
    ]) {
      const mesh = new Mesh(mergeGeometries(list), material);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.mirror = new Mesh(
      new CircleGeometry(0.42, 24),
      new MeshStandardMaterial({ color: '#9ec8ff', emissive: '#4a8cff', emissiveIntensity: 1.2, side: DoubleSide })
    );
    this.mirror.position.set(SAVE.x + LANE - 0.6, 1.45, SAVE.z);
    this.mirror.rotation.y = -Math.PI / 2;
    this.group.add(this.mirror);
    this.mirrorRing = new Mesh(
      new RingGeometry(0.9, 1.3, 32).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ color: '#4a8cff', emissive: '#4a8cff', emissiveIntensity: 0.8, transparent: true, opacity: 0.5 })
    );
    this.mirrorRing.position.set(SAVE.x + LANE - 0.6, 0.05, SAVE.z);
    this.group.add(this.mirrorRing);

    // Barriers across the three gates.
    for (const [name, z] of [['g1', GATE1], ['g2', GATE2], ['g3', GATE3]]) {
      const material = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uColor: { value: new Color('#ff3a5a') } },
        vertexShader: BARRIER_VERTEX,
        fragmentShader: BARRIER_FRAGMENT
      });
      const plane = new Mesh(new PlaneGeometry(LANE * 2, 3.4), material);
      plane.position.set(0, 1.7, z);
      this.group.add(plane);
      this.barriers[name] = { plane, material, open: false, z };
    }
  }

  /* ------------------------------------------------------------------ */
  /* flow                                                                 */
  /* ------------------------------------------------------------------ */

  /* ---- the save: cleared, best time, checkpoint, lesson done ---- */

  get record() {
    try {
      return { cleared: false, best: null, checkpoint: 'start', tutorialDone: false, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
    } catch {
      return { cleared: false, best: null, checkpoint: 'start', tutorialDone: false };
    }
  }

  _save(patch) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.record, ...patch }));
    } catch {
      // Private mode: the record lasts the session.
    }
  }

  /**
   * @param {{resume?: boolean, tutorial?: boolean}} [options] resume from the
   *   saved mirror; run the lesson first (the default until it has been done once)
   */
  start(options = {}) {
    const app = this.app;
    if (app.pvp?.active) return;
    if (!this.active) {
      this._saved = { amplitude: settings.terrain.amplitude, arena: settings.arena.enabled };
      settings.terrain.amplitude = 0;
      settings.arena.enabled = false;
    }
    this.active = true;
    this.group.visible = true;
    this.objective.hidden = false;
    this.clearScreen.hidden = true;
    this.button.textContent = '退出';
    const record = this.record;
    this.checkpoint = options.resume && record.checkpoint === 'save' ? 'save' : 'start';
    this.startedAt = app.elapsed;
    // Only a run from the gate counts toward the best time.
    this._fullRun = this.checkpoint === 'start';
    this.soulsAtStart = app.progress.souls;
    app.enemies.manual = true;
    app.enemies.clear();
    this._resetBoss();
    this.tutorial.cancel();
    this._mirrorLit(this.checkpoint === 'save');
    if (this.checkpoint === 'save') {
      // 続きから: at the mirror, the plaza behind already won.
      this.retry();
      app.toast.show('一ノ章 — 鏡より再開', 1400);
      return;
    }
    for (const b of Object.values(this.barriers)) this._setBarrier(b, false);
    this._restore();
    const lesson = options.tutorial ?? !record.tutorialDone;
    if (lesson) {
      this._go('tutorial');
      this.tutorial.begin();
    } else {
      this._go('approach');
    }
    app.toast.show('一ノ章 — 出陣', 1400);
  }

  _tutorialDone() {
    this._save({ tutorialDone: true });
    if (this.step === 'tutorial') this._go('approach');
  }

  _mirrorLit(on) {
    this.mirror.material.emissive.set(on ? '#ffd28a' : '#4a8cff');
    this.mirrorRing.material.color.set(on ? '#ffd28a' : '#4a8cff');
  }

  leave() {
    const app = this.app;
    if (!this.active) return;
    this.active = false;
    this.step = null;
    this.group.visible = false;
    this.objective.hidden = true;
    this.clearScreen.hidden = true;
    this.button.textContent = '≡ タイトル';
    this.tutorial.cancel();
    this._resetBoss();
    if (this._saved) {
      settings.terrain.amplitude = this._saved.amplitude;
      settings.arena.enabled = this._saved.arena;
    }
    app.enemies.manual = false;
    app.enemies.respawnAll();
    this.onTitle?.();
  }

  /** Back on its feet after a fall: the last checkpoint, the fight there reset. */
  retry() {
    const app = this.app;
    app.enemies.clear();
    this._resetBoss();
    this._restore();
    if (this.checkpoint === 'save') {
      this._setBarrier(this.barriers.g1, true);
      this._setBarrier(this.barriers.g2, true);
      this._setBarrier(this.barriers.g3, false);
      this._go('onward');
    } else {
      for (const b of Object.values(this.barriers)) this._setBarrier(b, false);
      this._go('approach');
    }
  }

  /** Stand the player where the checkpoint is, whole again. */
  _restore() {
    const app = this.app;
    if (this.checkpoint === 'save') app._teleport(SAVE.x, SAVE.z - 1.5, 0);
    else app._teleport(0, -1, 0);
    this._heal();
  }

  _heal() {
    const app = this.app;
    const hp = settings.combat.player;
    app.playerHp = hp.maxHp;
    app.playerHud.setHp(app.playerHp, hp.maxHp);
    app.defense.reset();
  }

  _go(step) {
    this.step = step;
    this.objective.textContent = `目的 · ${STEPS[step]}`;
  }

  _spawnWave() {
    const app = this.app;
    const kinds = ['grunt', 'grunt', 'shield', 'ninja', 'archer', 'brute'];
    this.wave = kinds.map((kind, i) => {
      const a = (i / kinds.length) * Math.PI * 2 + 0.4;
      const r = kind === 'archer' ? PLAZA.r - 1.5 : 5 + (i % 2);
      return app.enemies.spawnAt(PLAZA.x + Math.sin(a) * r, PLAZA.z + Math.cos(a) * r, kind, a + Math.PI);
    }).filter(Boolean);
  }

  _resetBoss() {
    this.boss?.dispose();
    this.boss = null;
  }

  _setBarrier(b, open) {
    b.open = open;
  }

  /* ------------------------------------------------------------------ */

  update(dt) {
    if (!this.active) return;
    const app = this.app;
    const p = app.character.position;
    const time = app.elapsed;
    for (const b of Object.values(this.barriers)) {
      const u = b.material.uniforms;
      u.uTime.value = time;
      u.uOpen.value += ((b.open ? 1 : 0) - u.uOpen.value) * Math.min(1, dt * 3);
      b.plane.visible = u.uOpen.value < 0.99;
    }
    this.mirror.rotation.z += dt * 0.6;
    this.mirrorRing.material.opacity = 0.35 + 0.2 * Math.sin(time * 3);

    switch (this.step) {
      case 'tutorial':
        this.tutorial.update();
        break;
      case 'approach':
        // The first gate opens as you come to it.
        if (!this.barriers.g1.open && p.z > GATE1 - 4) {
          this._setBarrier(this.barriers.g1, true);
          app.toast.show('門が開く', 900);
        }
        if (p.z > GATE1 + 3) {
          // In: the way back shuts, the plaza's enemies stand up.
          this._setBarrier(this.barriers.g1, false);
          this._spawnWave();
          this._go('plaza');
          app.toast.show('広場戦', 1000);
        }
        break;
      case 'plaza': {
        const left = this.wave.filter((e) => e.alive).length;
        this.objective.textContent = `目的 · ${STEPS.plaza} (${this.wave.length - left}/${this.wave.length})`;
        if (left === 0) {
          this._setBarrier(this.barriers.g2, true);
          this._go('onward');
          app.toast.show('門開放', 1200);
        }
        break;
      }
      case 'onward':
        // The mirror: touch it to set the checkpoint and be made whole.
        if (this.checkpoint !== 'save' && Math.hypot(p.x - (SAVE.x + LANE - 0.6), p.z - SAVE.z) < 2) {
          this.checkpoint = 'save';
          this._heal();
          this._mirrorLit(true);
          // Kept: 続きから on the title starts here.
          this._save({ checkpoint: 'save' });
          app.toast.show('鏡 — 記録しました', 1400);
          this._setBarrier(this.barriers.g3, true);
        }
        if (p.z > GATE3 + 3) {
          this._setBarrier(this.barriers.g3, false);
          const e = app.enemies.spawnAt(ARENA.x, ARENA.z + 5, 'boss', Math.PI);
          if (e) this.boss = new Boss(app, e, { onDefeated: () => this._win() });
          this._go('boss');
          app.toast.show('鬼武将 羅刹', 1600);
        }
        break;
      case 'boss':
        this.boss?.update(dt);
        break;
      default:
        break;
    }
    this.clamp(p, settings.arena.margin);
    for (const e of app.enemies.enemies) if (e.alive) this.clamp(e.position, settings.enemies.bodyRadius * e.size);
  }

  _win() {
    const app = this.app;
    this._go('clear');
    const secs = Math.round(app.elapsed - this.startedAt);
    const souls = app.progress.souls - this.soulsAtStart;
    const record = this.record;
    // Cleared: the record, and the next run starts from the gate again.
    const best = !this._fullRun ? record.best : record.best == null ? secs : Math.min(record.best, secs);
    this._save({ cleared: true, best, checkpoint: 'start' });
    // A moment for the souls to be taken in, then the screen.
    setTimeout(() => {
      if (!this.active || this.step !== 'clear') return;
      this.clearScreen.querySelector('.stage-clear__stats').textContent =
        `時間 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · 魂 +${Math.max(0, app.progress.souls - this.soulsAtStart, souls)}`;
      this.clearScreen.hidden = false;
    }, 2500);
  }

  /**
   * Hold a point inside the walkable part of the stage for the current step:
   * the lanes and circles open so far, the closed gates as walls.
   */
  clamp(pos, margin = 0.5) {
    if (!this.active) return;
    const areas = [];
    const lane = (z0, z1) => areas.push({ box: true, x0: -LANE + margin, x1: LANE - margin, z0, z1 });
    const circle = (c) => areas.push({ x: c.x, z: c.z, r: c.r - margin });
    const g1 = this.barriers.g1.open;
    const g2 = this.barriers.g2.open;
    const g3 = this.barriers.g3.open;
    switch (this.step) {
      case 'tutorial':
      case 'approach':
        lane(-2, g1 ? PLAZA.z : GATE1 - margin);
        if (g1) circle(PLAZA);
        break;
      case 'plaza':
        circle(PLAZA);
        break;
      case 'onward':
        circle(PLAZA);
        lane(GATE2 - 3, g3 ? ARENA.z : GATE3 - margin);
        if (g3) circle(ARENA);
        break;
      default:
        circle(ARENA);
        break;
    }
    let best = null;
    let bestD = Infinity;
    for (const a of areas) {
      let x = pos.x;
      let z = pos.z;
      if (a.box) {
        x = Math.min(a.x1, Math.max(a.x0, x));
        z = Math.min(a.z1, Math.max(a.z0, z));
      } else {
        const dx = x - a.x;
        const dz = z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > a.r) {
          x = a.x + (dx / d) * a.r;
          z = a.z + (dz / d) * a.r;
        }
      }
      const d = (x - pos.x) ** 2 + (z - pos.z) ** 2;
      if (d === 0) return;
      if (d < bestD) {
        bestD = d;
        best = [x, z];
      }
    }
    if (best) {
      pos.x = best[0];
      pos.z = best[1];
    }
  }
}
