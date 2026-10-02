import { Vector3 } from 'three';
import { settings } from '../config/settings.js';
import { Rasetsu, RASETSU } from './boss/Rasetsu.js';

const _v = new Vector3();

/**
 * The trial's script: where the fights are, what each one throws, where the
 * story beats and pickups sit, and where a retry puts you back.
 *
 * A list of beats walked in order. Each beat waits for its trigger (usually
 * the player crossing a line), runs, and reports done; encounters drip their
 * bodies in as the crowd thins so the cap set by the device is never broken.
 * Checkpoints snapshot the beat index and what the player has learned.
 */

const TIPS = [
  '刃が光った瞬間に「守」で弾ける。弾いた直後の「斬」は反撃になる。',
  '赤い「危」の攻撃はガードできない。「避」で躱すか、弾きで凌げ。',
  '体幹ゲージを削り切ると敵が崩れる。崩れた敵は「処刑」できる。',
  '火と雷で「爆雷」、氷と雷で「凍雷」、火と氷で「蒸破」。属性を重ねよ。',
  '「斬」を長押しすると踏み込みの居合になる。離れた敵へ一気に届く。',
  '攻撃の直前に避けると「見切り」。時が緩み、奥義ゲージが溜まる。',
  '奥義ゲージが満ちたら「奥義」。天からの拳が周囲を薙ぎ払う。'
];

export class Flow {
  constructor(game) {
    this.game = game;
    this.beat = 0;
    this.beats = this._script();
    this.encounter = null;
    this.pickups = [];
    this.checkpoint = { beat: 0, position: new Vector3(0, 0, 0), facing: 0, unlocked: [true, false, false] };
    this._tutorial = new Set();
    this._tipIndex = 0;
  }

  get stage() {
    return this.game.stage;
  }

  get player() {
    return this.game.player;
  }

  /* ------------------------------------------------------------------ */
  /* lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  /** Behind the title: the body at the start, the camera down the street. */
  preview() {
    this._place(new Vector3(0, 0, 0), 0);
    this.game.audio.setCombat(0);
  }

  start() {
    this.beat = 0;
    this._tutorial.clear();
    this.checkpoint = { beat: 0, position: new Vector3(0, 0, 0), facing: 0, unlocked: [true, false, false] };
    this._reset();
    this._enter();
  }

  restartFromCheckpoint() {
    const cp = this.checkpoint;
    this.beat = cp.beat;
    this._reset();
    this.player.unlocked = [...cp.unlocked];
    this._place(cp.position, cp.facing);
    this._enter();
  }

  _reset() {
    const game = this.game;
    game.director.clear();
    game.magic.clear();
    game.weapons?.clear();
    this.stage.clearBarriers();
    for (const pickup of this.pickups) game.fx.glow.free(pickup.glow);
    this.pickups.length = 0;
    this.encounter = null;
    game.boss = null;
    game.hud.showBoss('', false);
    game.cinematic = false;
    game.director.maxMelee = 2;
    settings.camera.distance = 5.2;
    this.player.revive();
    this.player.unlocked = [...this.checkpoint.unlocked];
    if (this.player.elementIndex > 0 && !this.player.unlocked[this.player.elementIndex]) this.player.elementIndex = 0;
    game.audio.setCombat(0);
    if (this.beat === 0) this._place(new Vector3(0, 0, 0), 0);
  }

  _place(position, facing) {
    const app = this.game.app;
    app.controller.reset();
    app.character.position.copy(position);
    settings.character.facing = facing;
    app.character.setFacing(facing);
    // Camera straight behind.
    const rig = app.rig;
    rig.controls.target.set(position.x, position.y + settings.camera.targetHeight, position.z);
    rig.camera.position.set(position.x - Math.sin(facing) * 5, position.y + 2.8, position.z - Math.cos(facing) * 5);
    rig.controls.update();
  }

  _setCheckpoint(position, facing = 0) {
    this.checkpoint = {
      beat: this.beat + 1,
      position: position.clone(),
      facing,
      unlocked: [...this.player.unlocked]
    };
  }

  /* ------------------------------------------------------------------ */
  /* per frame                                                           */
  /* ------------------------------------------------------------------ */

  update(dt, raw) {
    if (this.game.state !== 'playing') return;
    this._updateEncounter(dt);
    this._updatePickups(dt);

    const beat = this.beats[this.beat];
    if (!beat) return;
    if (!beat.started) {
      if (beat.trigger && !beat.trigger(this.game.playerPosition)) return;
      beat.started = true;
      beat.start?.();
    }
    if (beat.done ? beat.done(dt) : true) {
      beat.finish?.();
      this.beat++;
      this._enter();
    }
  }

  _enter() {
    for (let i = 0; i < this.beats.length; i++) {
      if (i >= this.beat) this.beats[i].started = false;
    }
    const beat = this.beats[this.beat];
    if (beat?.objective) this.game.hud.setObjective(beat.objective);
  }

  onKill(agent) {
    if (this.encounter) this.encounter.killed++;
    // The fallen sometimes leave a spark of spirit that heals.
    const chance = agent.type.elite ? 1 : 0.16;
    if (Math.random() < chance && agent !== this.game.boss?.agent) {
      this._pickup('soul', agent.position.clone(), { auto: true });
    }
  }

  tip() {
    this._tipIndex = (this._tipIndex + 1) % TIPS.length;
    return TIPS[this._tipIndex];
  }

  /* ------------------------------------------------------------------ */
  /* encounters                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * @param {Array<[string, number, number]>} list type, x, z — in spawn order
   * @param {{cap?: number, onDone?: Function, barriers?: string[], combat?: number}} options
   */
  _fight(list, { cap = 8, barriers = [], combat = 1, alert = true } = {}) {
    for (const id of barriers) this.stage.setBarrier(id, true);
    this.encounter = { queue: [...list], cap, killed: 0, total: list.length, timer: 0, barriers, alert, agents: [] };
    this.game.audio.setCombat(combat);
  }

  _updateEncounter(dt) {
    const e = this.encounter;
    if (!e) return;
    e.timer -= dt;
    const alive = this.game.director.aliveCount;
    const cap = Math.min(e.cap, this.game.budget.maxEnemies);
    if (e.queue.length && alive < cap && e.timer <= 0) {
      const [type, x, z] = e.queue.shift();
      const agent = this._emerge(type, x, z, e.alert);
      if (agent) e.agents.push(agent);
      e.timer = 0.35;
    }
    const remaining = e.queue.length + e.agents.filter((a) => a.alive).length;
    if (e.total >= 8) this.game.hud.setObjective(`妖を退けよ　残り ${remaining}`);
  }

  get fightOver() {
    const e = this.encounter;
    if (!e) return true;
    if (e.queue.length || e.agents.some((a) => a.alive)) return false;
    for (const id of e.barriers) this.stage.setBarrier(id, false);
    this.encounter = null;
    this.game.audio.setCombat(0);
    return true;
  }

  /** A body rising out of red mist. */
  _emerge(type, x, z, alert = true) {
    const game = this.game;
    const p = game.playerPosition;
    const yaw = Math.atan2(p.x - x, p.z - z);
    const agent = game.director.spawn(type, x, z, yaw, { alert });
    _v.set(x, 0.6, z);
    game.fx.glow.spawn(_v, '#ff3a1a', 2.2, 0.6, { grow: 0.6, intensity: 1.6 });
    game.fx.glow.burst(_v, '#3a0a14', 10, { speed: 2, size: 0.5, life: 0.9, up: 1.5, gravity: 0 });
    game.fx.dust(_v, 0.6);
    return agent;
  }

  /* ------------------------------------------------------------------ */
  /* pickups                                                             */
  /* ------------------------------------------------------------------ */

  _pickup(kind, position, { auto = false, onTake = null } = {}) {
    const colors = { potion: '#7aff9a', soul: '#ffb070', spirit: '#ffe8a0', thunder: '#cfe0ff', ice: '#9fefff' };
    const glow = this.game.fx.glow.hold(colors[kind] ?? '#ffffff', kind === 'soul' ? 0.45 : 0.9, { intensity: 2.2, star: kind !== 'soul' });
    const pickup = { kind, position: position.clone().setY(position.y + 1.0), glow, auto, onTake, t: Math.random() * 6, color: colors[kind] };
    this.pickups.push(pickup);
    return pickup;
  }

  _updatePickups(dt) {
    const game = this.game;
    const p = game.playerPosition;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.t += dt;
      const dx = p.x - pickup.position.x;
      const dz = p.z - pickup.position.z;
      const d = Math.hypot(dx, dz);
      if (pickup.auto && d < 4) {
        // Souls drift to the body.
        pickup.position.x += (dx / (d || 1)) * dt * 7;
        pickup.position.z += (dz / (d || 1)) * dt * 7;
      }
      const bob = Math.sin(pickup.t * 2.4) * 0.12;
      game.fx.glow.move(pickup.glow, pickup.position.x, pickup.position.y + bob, pickup.position.z);
      if (Math.random() < dt * 10) {
        _v.set(pickup.position.x + (Math.random() - 0.5) * 0.4, pickup.position.y - 0.3, pickup.position.z + (Math.random() - 0.5) * 0.4);
        game.fx.glow.spawn(_v, pickup.color, 0.12, 0.8, { vy: 0.8, intensity: 1.5 });
      }
      if (d > 1.3) continue;
      game.fx.glow.free(pickup.glow);
      this.pickups.splice(i, 1);
      this._take(pickup);
    }
  }

  _take(pickup) {
    const game = this.game;
    const player = this.player;
    game.fx.glow.burst(pickup.position, pickup.color, 20, { speed: 4, size: 0.1, life: 0.6, up: 2, gravity: -2 });
    switch (pickup.kind) {
      case 'soul':
        player.heal(10);
        player.mp = Math.min(player.maxMp, player.mp + 10);
        game.audio.play('select', { pitch: 1.5 });
        break;
      case 'potion':
        player.heal(50);
        game.audio.play('pickup');
        game.hud.notice('霊薬 — 体力回復');
        break;
      case 'spirit':
        player.maxHp += 20;
        player.heal(999);
        player.special = 1;
        game.audio.play('pickup');
        game.hud.notice('魂玉 — 体力上限上昇・奥義満ちる', 2.4);
        break;
      default:
        game.audio.play('pickup');
        break;
    }
    pickup.onTake?.();
  }

  /* ------------------------------------------------------------------ */
  /* the script                                                          */
  /* ------------------------------------------------------------------ */

  _script() {
    const game = this.game;
    const stage = () => this.stage;
    const hud = () => game.hud;
    const touch = () => document.body.classList.contains('game') && game.touch.root && !game.touch.root.classList.contains('tc--desktop');
    const wait = (seconds) => {
      let t = 0;
      return (dt) => (t += dt) >= seconds;
    };
    const crossed = (z) => (p) => p.z > z;

    return [
      {
        id: 'intro',
        objective: '城下町を進め',
        start: () => {
          hud().areaCard('壱 · 城下町', '黒雨の夜');
          game.audio.play('bell', { volume: 0.5 });
          game.after(2.6, () => hud().notice(touch() ? '左で移動 · 右をなぞってカメラ' : 'WASDで移動 · マウスで視点', 3));
        },
        done: () => true
      },
      {
        id: 'first',
        trigger: crossed(16),
        objective: '妖を斬り伏せよ',
        start: () => {
          this._fight([['ashigaru', -2, 30], ['ashigaru', 2.5, 31], ['ashigaru', 0, 34]], { cap: 3 });
          // The first fight is a lesson: one blade at a time.
          game.director.maxMelee = 1;
          hud().notice(touch() ? '「斬」で攻撃 · 連打で五連撃' : '左クリックで攻撃 · 連打で五連撃', 3.2);
          this._lesson = 0;
        },
        done: (dt) => {
          // Teach the parry the first time a blade flashes.
          this._lesson += dt;
          if (this._lesson > 5 && !this._tutorial.has('parry')) {
            this._tutorial.add('parry');
            hud().notice('刃が光ったら「守」— 直前なら弾き返す', 3.6);
          }
          return this.fightOver;
        },
        finish: () => {
          game.director.maxMelee = 2;
          hud().notice('脇道に何かが光っている…', 2.5);
        }
      },
      {
        id: 'street',
        trigger: crossed(48),
        objective: '大通りを抜けよ',
        start: () => {
          this._fight([['ashigaru', -2, 60], ['shinobi', 2, 63], ['ashigaru', 1, 66], ['archer', 0, 80]], { cap: 4 });
          // The side yards: optional, rewarded.
          this._pickup('potion', stage().spots.courtyard);
          game.director.spawn('ashigaru', -18, 36, Math.PI / 2);
          game.director.spawn('ashigaru', -15, 44, Math.PI / 2);
          this._pickup('spirit', stage().spots.yard);
          game.director.spawn('archer', 22, 64, -Math.PI / 2);
          game.director.spawn('shinobi', 16, 76, -Math.PI / 2);
          game.after(1.8, () => hud().notice(touch() ? '「避」で回避 · 攻撃直前なら見切り' : 'Spaceで回避 · 攻撃直前なら見切り', 3));
        },
        done: () => this.encounter ? this.fightOver : true
      },
      {
        id: 'oni',
        trigger: crossed(89),
        objective: '赤鬼を討て',
        start: () => {
          this._setCheckpoint(new Vector3(0, 0, 80), 0);
          stage().setBarrier('plazaA', true);
          stage().setBarrier('gateAB', true);
          const oni = this._emerge('oni', 0, 101, true);
          this._oni = oni;
          this._fight([['ashigaru', -6, 98], ['ashigaru', 6, 98]], { cap: 4, barriers: [], combat: 1.4 });
          game.audio.play('roar', { pos: oni.position, volume: 0.8 });
          hud().showBoss('赤鬼', true);
          game.boss = oni.enemy;
          game.rig.shake(0.3);
          game.after(1.5, () => hud().notice('赤い「危」は防げない — 避けよ', 3));
        },
        done: () => !this._oni.alive && this.fightOver,
        finish: () => {
          hud().showBoss('', false);
          game.boss = null;
          stage().setBarrier('plazaA', false);
          hud().bigText('撃破', '#ffd890', 1.4);
        }
      },
      {
        id: 'thunder',
        objective: '雷の霊火を取れ',
        start: () => {
          const at = stage().spots.plazaA.clone();
          this._gotThunder = false;
          this._pickup('thunder', at, {
            onTake: () => {
              this.player.unlocked[1] = true;
              this.player.elementIndex = 1;
              hud().areaCard('雷の術', '会得 — 火と雷を重ねれば「爆雷」');
              game.hud.flash('rgba(200,220,255,0.4)', 0.3);
              this._gotThunder = true;
            }
          });
        },
        done: () => this._gotThunder,
        finish: () => {
          stage().setBarrier('gateAB', false);
          this._setCheckpoint(new Vector3(0, 0, 106), 0);
        }
      },
      {
        id: 'horde',
        trigger: crossed(116),
        objective: '妖を退けよ',
        start: () => {
          const list = [];
          const ring = (type, n, r, z) => {
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
              list.push([type, Math.sin(a) * r, z + Math.cos(a) * r * 0.8]);
            }
          };
          ring('ashigaru', 6, 9, 128);
          ring('shinobi', 3, 10, 130);
          ring('ashigaru', 4, 10, 128);
          list.push(['archer', -12, 138], ['archer', 12, 138]);
          ring('ashigaru', 4, 9, 126);
          ring('shinobi', 3, 9, 130);
          list.push(['oni', 0, 136]);
          ring('ashigaru', 3, 8, 128);
          this._fight(list, { cap: 14, barriers: ['plazaBIn', 'plazaBOut'], combat: 1.4 });
          hud().areaCard('百鬼夜行', '退けよ');
          game.audio.play('roar', { volume: 0.5 });
        },
        done: () => this.fightOver,
        finish: () => {
          hud().bigText('退けた', '#ffd890', 1.4);
          this._setCheckpoint(new Vector3(0, 0, 139), 0);
          hud().setObjective('廃神社へ');
        }
      },
      {
        id: 'shrineRoad',
        trigger: crossed(146),
        objective: '鳥居の道を進め',
        start: () => {
          hud().areaCard('弐 · 廃神社', '千本鳥居');
          this._pickup('potion', stage().spots.hokora);
          this._ambush = false;
        },
        done: () => {
          if (!this._ambush && game.playerPosition.z > 158) {
            this._ambush = true;
            const z = game.playerPosition.z;
            this._fight([['shinobi', -2, z + 7], ['shinobi', 2, z + 8], ['shinobi', 0, z - 6]], { cap: 3 });
            hud().notice('忍妖 — 竹林から！', 2);
          }
          return this._ambush && this.fightOver;
        }
      },
      {
        id: 'shrineCourt',
        trigger: crossed(192),
        objective: '境内の妖を祓え',
        start: () => {
          this._setCheckpoint(new Vector3(0, 0, 184), 0);
          this._fight(
            [['archer', -11, 210], ['archer', 11, 210], ['ashigaru', -4, 200], ['ashigaru', 4, 200], ['shinobi', 0, 205], ['ashigaru', -7, 196], ['shinobi', 7, 196], ['oni', 0, 206]],
            { cap: 7, barriers: ['shrineIn', 'shrineOut'], combat: 1.3 }
          );
        },
        done: () => this.fightOver
      },
      {
        id: 'ice',
        objective: '社に供えられた霊火を取れ',
        start: () => {
          this._gotIce = false;
          this._pickup('ice', stage().spots.shrine, {
            onTake: () => {
              this.player.unlocked[2] = true;
              this.player.elementIndex = 2;
              hud().areaCard('氷の術', '会得 — 氷と雷「凍雷」 · 火と氷「蒸破」');
              this._gotIce = true;
              game.audio.play('bell', { volume: 0.7 });
            }
          });
        },
        done: () => this._gotIce,
        finish: () => this._setCheckpoint(new Vector3(0, 0, 210), 0)
      },
      {
        id: 'approach',
        trigger: crossed(218),
        objective: '城門へ',
        start: () => {
          hud().areaCard('参 · 城門', '黒角鬼の座');
          this._fight([['ashigaru', -1.5, 230], ['ashigaru', 1.5, 231], ['archer', -2, 238], ['archer', 2, 238]], { cap: 4 });
        },
        done: () => this.fightOver,
        finish: () => this._setCheckpoint(new Vector3(0, 0, 236), 0)
      },
      {
        id: 'boss',
        trigger: crossed(246),
        objective: '黒角鬼・羅刹を討て',
        start: () => this._startBoss(),
        done: () => this._bossDone === true
      },
      {
        id: 'end',
        start: () => {
          hud().setObjective('');
          game.after(3.8, () => game.finish());
        },
        done: () => false
      }
    ];
  }

  _startBoss() {
    const game = this.game;
    this._bossDone = false;
    this.stage.setBarrier('bossIn', true);
    game.director.registerType(RASETSU);
    const agent = game.director.spawn(RASETSU, 0, 274, Math.PI, { alert: false, Agent: Rasetsu });
    agent.onDefeated = () => {
      this._bossDone = true;
    };
    game.boss = agent.enemy;
    agent.intro();
  }
}
