import { settings } from '../config/settings.js';
import { PvpMenu } from '../ui/PvpMenu.js';
import { PvpClient } from './PvpClient.js';
import { RemoteAvatar } from './RemoteAvatar.js';

/** States sent per second. */
const SEND_HZ = 15;
/**
 * How far behind the server clock the opponent is drawn, ms. Enough to hold
 * two 15 Hz states and some jitter; hits are rewound to exactly this.
 */
export const INTERP_DELAY = 120;

const ERRORS = { 'no-room': 'No room with that code.', full: 'That room is full.' };

/**
 * One-on-one over the network: the glue between the game and `server/room.js`.
 *
 * The game already has everything a duel needs — the moves, the guard, the
 * parry, the Musou, the arena. This adds the other player and the rules:
 *
 *  - **In a room** the arena is up, the PvE crowd is put away, the opponent's
 *    body stands in (`RemoteAvatar`), and the player's attacks are aimed at
 *    it (`targets` replaces the enemy manager for the controller).
 *  - **Out** it all goes back exactly as it was.
 *
 * Authority is split the way the server is: this side sends where the body is
 * and what it is doing, and *claims* hits its own swings made; the server
 * answers with the one true health, and with what the guard did.
 */
export class PvpMode {
  /** @param {import('../core/App.js').App} app */
  constructor(app) {
    this.app = app;
    this.client = null;
    this.room = null;
    this.you = -1;
    this.phase = 'off';
    this.max = 100;
    this.hp = [100, 100];
    this.score = [0, 0];
    this.round = 0;
    this.startsAt = 0;
    this.stats = null;
    this.frozen = false;
    this._stunUntil = 0;
    this._pending = null;
    this._sendAcc = 0;
    this._inDuel = false;
    this._saved = null;
    this._bannerUntil = 0;
    this.rejected = 0;

    this.opponent = new RemoteAvatar(app.character);
    /** What the controller aims at in a duel — the opponent, and nothing else. */
    this.targets = {
      findTarget: (origin, facing, config) => this._findTarget(origin, facing, config),
      enemies: [],
      pushOut: (position, radius) => this._pushOut(position, radius)
    };

    this.menu = new PvpMenu({
      onOpen: () => this.open(),
      onClose: () => this.menu.hide(),
      onCreate: (name) => this._act(name, { type: 'create' }),
      onJoin: (code, name) => {
        if (!/^[A-Z0-9]{4}$/.test(code)) return this.menu.setError('A room code is 4 letters.');
        this._act(name, { type: 'join', code });
      },
      onReady: () => {
        const me = this.room?.players?.[this.you];
        this.client?.send({ type: 'ready', ready: !me?.ready });
      },
      onLeave: () => this.leave(),
      onRematch: () => this.client?.send({ type: 'rematch' })
    });

    // A reload in the middle of a match: this tab still holds its seat's
    // token, so go straight back and let the server put the body back.
    if (hasSeat()) this._connect();
  }

  /** In a room — arena up, crowd away. */
  get active() {
    return !!this.room;
  }

  /** My blow was parried: frozen for a beat (read by the app each frame). */
  get stunned() {
    return performance.now() < this._stunUntil;
  }

  /** The fight itself is on: hits may be claimed. */
  get fighting() {
    return this.phase === 'fight';
  }

  /* ------------------------------------------------------------------ */
  /* menu actions                                                        */
  /* ------------------------------------------------------------------ */

  open() {
    this.menu.setError('');
    this.menu.setRoom(this.room);
    this.menu.open();
    this._connect();
  }

  _connect() {
    if (this.client) return;
    this.client = new PvpClient({
      onMessage: (msg) => this._message(msg),
      onStatus: (status) => this._status(status)
    });
    this.client.connect(this.menu.name.value || 'Samurai');
  }

  /** Do `msg` as soon as the server knows who this is. */
  _act(name, msg) {
    msg = { ...msg, name };
    this.menu.setError('');
    if (this.client) this.client.name = name;
    if (this.client?.status === 'online' && this.client.send(msg)) return;
    this._pending = msg;
    if (!this.client) this.open();
  }

  leave() {
    this.client?.send({ type: 'leave' });
    this.room = null;
    this.phase = 'off';
    this._exitDuel();
    this.menu.setRoom(null);
    this.menu.setResult('');
  }

  /* ------------------------------------------------------------------ */
  /* the wire                                                            */
  /* ------------------------------------------------------------------ */

  _status(status) {
    const text = {
      connecting: 'Connecting…',
      online: 'Online',
      reconnecting: 'Connection lost — reconnecting…',
      offline: 'Offline'
    }[status];
    this.menu.setStatus(text);
    if (status === 'reconnecting' && this._inDuel) this.menu.setBanner('Reconnecting…');
    if (status === 'online' && this.menu.banner.textContent === 'Reconnecting…') this.menu.setBanner('');
    if (status === 'offline' && this.room) this.leave();
  }

  _message(msg) {
    const app = this.app;
    switch (msg.type) {
      case 'welcome':
        this.stats = msg.stats;
        this.menu.setStats(msg.stats);
        if (this._pending) {
          this.client.send(this._pending);
          this._pending = null;
        }
        break;

      case 'error':
        this.menu.setError(ERRORS[msg.reason] ?? msg.reason);
        break;

      case 'room':
      case 'snapshot':
        this._room(msg);
        break;

      case 'round':
        this._roundStart(msg);
        break;

      case 'fight':
        this.phase = 'fight';
        this.frozen = false;
        this._flash('始め — Fight!', 900);
        break;

      case 'peer':
        this.opponent.push(msg);
        break;

      case 'peerMusou':
        app.toast.show('Opponent — Musou!', 1000);
        break;

      case 'damage':
        this._damage(msg);
        break;

      case 'hitRejected':
        this.rejected++;
        break;

      case 'roundEnd': {
        this.phase = 'roundEnd';
        this.frozen = true;
        this.score = msg.score;
        this.hp = msg.hp;
        this._syncHp();
        const won = msg.winner === this.you;
        if (!won) app._pvpFall();
        else this.opponent.down = true;
        this._flash(won ? 'Round won' : 'Round lost', 2000);
        this.menu.setScore(this.score, this.you, this.round);
        break;
      }

      case 'matchEnd': {
        this.phase = 'matchEnd';
        this.frozen = true;
        this.score = msg.score;
        this.stats = msg.stats ?? this.stats;
        this.menu.setStats(this.stats);
        const won = msg.winner === this.you;
        this.menu.setResult(`${won ? '勝利 Victory' : '敗北 Defeat'}  ${msg.score[this.you]} – ${msg.score[1 - this.you]}`);
        this._flash(won ? '勝利 Victory' : '敗北 Defeat', 2500);
        this.menu.open();
        break;
      }

      default:
        break;
    }
  }

  _room(msg) {
    const entering = !this.room;
    this.room = msg;
    this.you = msg.you;
    this.phase = msg.phase;
    this.score = msg.score;
    this.round = msg.round;
    if (msg.hp) this.hp = msg.hp;
    this.menu.setRoom(msg);
    if (entering) this._enterDuel();
    this.menu.setScore(this.score, this.you, this.round);
    this._syncHp();

    const opp = msg.players?.[1 - this.you];
    this._opponentName = opp?.name ?? 'Opponent';

    // A lobby or a finished match wants the panel; a fight wants it out of the way.
    if (msg.phase === 'lobby' || msg.phase === 'matchEnd') this.menu.open();
    else this.menu.hide();
    this.frozen = msg.phase !== 'fight';
    if (msg.phase === 'paused') this._flash('Opponent reconnecting…', 60000);
    else if (this.menu.banner.textContent === 'Opponent reconnecting…') this.menu.setBanner('');

    // A snapshot after a reconnect: put both bodies back where they were.
    if (msg.type === 'snapshot') {
      const spawn = msg.spawns?.[this.you];
      const self = msg.self ?? spawn;
      if (self) this.app._pvpPlace(self.x, self.z, self.facing ?? spawn?.facing ?? 0);
      const peer = msg.peer ?? msg.spawns?.[1 - this.you];
      if (peer) this.opponent.place(peer.x, peer.z, peer.facing ?? 0);
      if (msg.phase === 'countdown') this.startsAt = msg.startsAt;
    }
  }

  _roundStart(msg) {
    this.phase = 'countdown';
    this.frozen = true;
    this.round = msg.round;
    this.hp = msg.hp;
    this.score = msg.score;
    this.startsAt = msg.startsAt;
    this.menu.hide();
    this.menu.setResult('');
    const mine = msg.spawns[this.you];
    const theirs = msg.spawns[1 - this.you];
    this.app._pvpRoundReset(mine.x, mine.z, mine.facing);
    this.opponent.place(theirs.x, theirs.z, theirs.facing);
    this.menu.setScore(this.score, this.you, this.round);
    this._syncHp();
  }

  _damage(msg) {
    const app = this.app;
    this.hp = msg.hp;
    this._syncHp();
    if (msg.target === this.you) {
      app._pvpTakeHit(msg.result, msg.dirX, msg.dirZ, msg.damage);
    } else {
      app._pvpLandedHit(this.opponent, msg.result, msg.dirX, msg.dirZ, msg.move, msg.counter);
      if (msg.result === 'parry') {
        // My blow was turned aside: I reel.
        this._stunUntil = performance.now() + settings.defense.parryStagger * 600;
      }
    }
  }

  _syncHp() {
    const app = this.app;
    if (this.you < 0) return;
    app.playerHp = this.hp[this.you];
    app.playerHud.setHp(app.playerHp, this.max);
    this.menu.setOpponent(this._opponentName, this.hp[1 - this.you], this.max);
  }

  _flash(text, ms) {
    this.menu.setBanner(text);
    this._bannerUntil = performance.now() + ms;
  }

  /* ------------------------------------------------------------------ */
  /* entering and leaving                                                */
  /* ------------------------------------------------------------------ */

  _enterDuel() {
    if (this._inDuel) return;
    this._inDuel = true;
    const app = this.app;
    this._saved = { enemies: settings.enemies.enabled };
    settings.enemies.enabled = false;
    app._pvpEnter();
    this.opponent.build();
    app.scene.add(this.opponent.pivot);
    app.controller.setEnemies(this.targets);
    this.menu.showHud(true);
  }

  _exitDuel() {
    if (!this._inDuel) return;
    this._inDuel = false;
    const app = this.app;
    settings.enemies.enabled = this._saved?.enemies ?? true;
    this.opponent.pivot.removeFromParent();
    app.controller.setEnemies(app.enemies);
    app._pvpExit();
    this.frozen = false;
    this.menu.showHud(false);
    this.menu.setBanner('');
  }

  /* ------------------------------------------------------------------ */
  /* per frame                                                           */
  /* ------------------------------------------------------------------ */

  update(dt) {
    const client = this.client;
    if (!client) return;
    this.menu.setNet(client.rtt, client.status);
    if (!this.active) return;
    const app = this.app;

    this.opponent.update(dt, client.now() - INTERP_DELAY, (x, z) => app.terrain.heightAt(x, z));

    if (this.phase === 'countdown') {
      const left = Math.ceil((this.startsAt - client.now()) / 1000);
      this.menu.setBanner(left > 0 ? String(left) : '');
    } else if (this._bannerUntil && performance.now() > this._bannerUntil) {
      this._bannerUntil = 0;
      this.menu.setBanner('');
    }

    this._sendAcc += dt;
    if (this._sendAcc >= 1 / SEND_HZ && this.phase !== 'lobby' && this.phase !== 'off') {
      this._sendAcc = 0;
      const c = app.character;
      const move = (c.moves ?? []).find((m) => m.locked) ?? null;
      const d = app.defense;
      client.send({
        type: 'state',
        x: c.position.x,
        z: c.position.z,
        facing: c.facing,
        speed: app.controller.speed,
        move: move?.configKey ?? null,
        phase: move ? move.phase : 0,
        guarding: d.guarding,
        guardAge: d.guarding ? app.elapsed - d.guardSince : 0,
        stamina: d.stamina,
        gauge: app.musouGauge,
        down: app.playerDown,
        latency: client.rtt
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* hits                                                                */
  /* ------------------------------------------------------------------ */

  /** A swing of mine reached the opponent on my screen: claim it. */
  claim(move) {
    if (!this.fighting || !this.opponent.alive) return false;
    return this.client.send({
      type: 'hit',
      move,
      renderTime: this.client.now() - INTERP_DELAY
    });
  }

  /** The string's (or the Musou's) sweep: is the opponent in its sector? */
  areaHit(move) {
    const config = move.config;
    const p = this.app.character.position;
    const o = this.opponent.position;
    const dx = o.x - p.x;
    const dz = o.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > (config.areaRange ?? 0) + settings.enemies.bodyRadius) return false;
    const arc = Math.min(360, config.areaArc ?? 360);
    if (arc < 360 && d > 0.3) {
      const f = this.app.character.facing;
      const along = (dx * Math.sin(f) + dz * Math.cos(f)) / d;
      if (along < Math.cos((arc * Math.PI) / 360)) return false;
    }
    return this.claim(move.configKey);
  }

  musou() {
    if (this.fighting) this.client.send({ type: 'musou' });
  }

  _findTarget(origin, facing, config) {
    const o = this.opponent;
    if (!o.alive || !this.active) return null;
    const dx = o.position.x - origin.x;
    const dz = o.position.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > config.range) return null;
    if (d < 1e-3) return o;
    const half = Math.cos(((config.cone ?? 360) * Math.PI) / 360);
    return (dx * Math.sin(facing) + dz * Math.cos(facing)) / d >= half ? o : null;
  }

  /** Keep the player out of the opponent's body, like the enemies do. */
  _pushOut(position, radius) {
    const o = this.opponent.position;
    const dx = position.x - o.x;
    const dz = position.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= radius || d < 1e-4) return;
    const k = (radius - d) / d;
    position.x += dx * k;
    position.z += dz * k;
  }

  dispose() {
    this.client?.close();
    this.opponent.dispose();
    this.menu.dispose();
  }
}

function hasSeat() {
  try {
    return !!sessionStorage.getItem('samurai.token');
  } catch {
    return false;
  }
}
