/**
 * The PvP server's logic — rooms, rounds and the one authority over health.
 *
 * Pure: no sockets and no clock of its own. `server/attach.js` hands it
 * connections (a `send` function and a `close` function each) and calls
 * `tick()`; tests hand it fakes and a fake clock (`server/test.mjs`). The
 * design follows the room-with-authoritative-state shape Colyseus uses and the
 * lobby → ready → countdown → match flow of web-moba-arena; none of either's
 * code is used.
 *
 * ## What the server decides
 *
 * Health, rounds, the score, the winner, and whether a blow landed. A client
 * *claims* a hit (its own swing reached, on its own screen); the server checks
 * it against where the target really was at the moment the attacker was
 * looking — the target's position history, rewound by at most
 * `maxRewindMs` (the lag compensation instagib-arena uses for shots, capped
 * much tighter here because this is melee) — and then resolves the target's
 * guard with the same `resolveDefense` rule single player uses.
 *
 * ## What it trusts
 *
 * Movement, facing, animation and stamina are the client's. They are relayed
 * to the other side for display and kept in a short history for the rewind.
 */
import { resolveDefense } from '../src/combat/defense.js';
import { settings } from '../src/config/settings.js';

export const PVP = {
  maxHp: Number(process.env.PVP_MAX_HP) || 100,
  winsNeeded: 2,
  /** Seconds of countdown before each round, and the pause after one ends. */
  countdown: 3,
  roundEndTime: 2.5,
  /** Seconds a dropped player's slot is held before the match is forfeited. */
  reconnectGrace: 20,
  /** Lag compensation: how far back a hit may rewind the target, and extra reach allowed. */
  maxRewindMs: 200,
  reachSlack: 0.9,
  /** How much extra a parry window is widened for the defender's own latency, at most. */
  parryLagTolerance: 0.06,
  /** Flood limits on hit claims. */
  hitCooldownMs: 160,
  maxHitsPerSec: 8,
  /** Damage per move — the server's table, not the client's. */
  damage: {
    combo1: 7, combo2: 7, combo3: 8, combo4: 11, combo5: 15,
    kick: 9, slashHit: 13, crouchSlash: 15,
    musou1: 12, musou2: 12, musou3: 22
  },
  /** Reach per move, metres from attacker to target centre (before `reachSlack`). */
  reach: { default: 3.2, combo5: 4.2, crouchSlash: 4.2, musou1: 4.8, musou2: 4.4, musou3: 8.2 },
  /** A blow thrown in the counter window a parry opened lands this much harder. */
  counterBonus: 1.5,
  /** Seconds a Musou's blows are accepted after it starts, and between two. */
  musouTime: 5,
  musouCooldown: 12,
  /** The two marks the fighters start each round on. */
  spawns: [
    { x: 0, z: -4.5, facing: 0 },
    { x: 0, z: 4.5, facing: Math.PI }
  ]
};

const HISTORY_MS = 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class PvpServer {
  /**
   * @param {object} [options]
   * @param {() => number} [options.now] milliseconds
   * @param {{get: (id: string) => object, record: (id: string, result: 'win'|'loss') => object}} [options.stats]
   */
  constructor({ now = () => Date.now(), stats = memoryStats() } = {}) {
    this.now = now;
    this.stats = stats;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** token → session, so a dropped phone finds its seat again. */
    this.sessions = new Map();
  }

  /**
   * A socket connected.
   * @param {(msg: object) => void} send
   * @param {() => void} close
   * @returns {{message: (raw: string|object) => void, closed: () => void}}
   */
  connect(send, close) {
    const conn = { send, close, session: null };
    return {
      message: (raw) => {
        let msg = raw;
        if (typeof raw === 'string') {
          try {
            msg = JSON.parse(raw);
          } catch {
            return;
          }
        }
        if (msg && typeof msg.type === 'string') this._handle(conn, msg);
      },
      closed: () => this._dropped(conn)
    };
  }

  /** Advance every room's timers. Call a few times a second. */
  tick() {
    const now = this.now();
    for (const room of this.rooms.values()) room.tick(now);
    for (const [code, room] of this.rooms) if (room.empty) this.rooms.delete(code);
  }

  /* ------------------------------------------------------------------ */

  _handle(conn, msg) {
    const now = this.now();
    if (msg.type === 'ping') {
      conn.send({ type: 'pong', c: msg.c, s: now });
      return;
    }
    if (msg.type === 'hello') return this._hello(conn, msg);

    const session = conn.session;
    if (!session) return;
    const room = session.room;

    // Create and join carry the name typed in the panel, which may be newer
    // than the one the socket said hello with.
    if ((msg.type === 'create' || msg.type === 'join') && typeof msg.name === 'string' && msg.name.trim()) {
      session.name = msg.name.trim().slice(0, 16);
    }

    switch (msg.type) {
      case 'create': {
        if (room) room.leave(session);
        const created = new Room(this._code(), this);
        this.rooms.set(created.code, created);
        created.join(session);
        break;
      }
      case 'join': {
        const code = String(msg.code || '').toUpperCase().trim();
        const target = this.rooms.get(code);
        if (!target) return conn.send({ type: 'error', reason: 'no-room' });
        if (target === room) return target.broadcastRoom();
        if (target.full) return conn.send({ type: 'error', reason: 'full' });
        if (room) room.leave(session);
        target.join(session);
        break;
      }
      case 'leave':
        room?.leave(session);
        break;
      case 'ready':
        room?.ready(session, msg.ready !== false);
        break;
      case 'rematch':
        room?.rematch(session);
        break;
      case 'state':
        room?.state(session, msg, now);
        break;
      case 'hit':
        room?.hit(session, msg, now);
        break;
      case 'musou':
        room?.musou(session, now);
        break;
      default:
        break;
    }
  }

  _hello(conn, msg) {
    const clientId = String(msg.clientId || '').slice(0, 64) || randomId();
    let session = msg.token ? this.sessions.get(msg.token) : null;
    if (session && session.clientId !== clientId) session = null;

    if (session) {
      // The same seat, a new socket. The old one — if it is somehow still
      // open — is shut, so there is never a second body for one player.
      if (session.conn && session.conn !== conn) session.conn.close();
    } else {
      session = {
        token: randomId(),
        clientId,
        name: String(msg.name || 'Samurai').slice(0, 16),
        conn: null,
        room: null,
        slot: -1,
        latency: 0,
        history: [],
        stamina: 0,
        counterUntil: 0,
        musouUntil: 0,
        musouReadyAt: 0,
        lastHit: {},
        hitTimes: []
      };
      this.sessions.set(session.token, session);
    }
    session.conn = conn;
    session.connected = true;
    session.droppedAt = 0;
    conn.session = session;
    if (typeof msg.latency === 'number') session.latency = Math.max(0, Math.min(1000, msg.latency));

    conn.send({
      type: 'welcome',
      clientId: session.clientId,
      token: session.token,
      stats: this.stats.get(session.clientId)
    });
    if (session.room) session.room.resume(session);
  }

  _dropped(conn) {
    const session = conn.session;
    if (!session || session.conn !== conn) return;
    session.conn = null;
    session.connected = false;
    session.droppedAt = this.now();
    if (session.room) session.room.dropped(session);
    else this.sessions.delete(session.token);
  }

  _code() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}

/* ==================================================================== */

class Room {
  constructor(code, server) {
    this.code = code;
    this.server = server;
    /** @type {(object|null)[]} the two seats */
    this.players = [null, null];
    this.phase = 'lobby';
    this.round = 0;
    this.score = [0, 0];
    this.hp = [PVP.maxHp, PVP.maxHp];
    this.ready_ = [false, false];
    this.rematch_ = [false, false];
    this.startsAt = 0;
    this.endsAt = 0;
    /** Phase to go back to when a paused match resumes. */
    this.resumeTo = null;
    this.matchId = 0;
    this.statsApplied = new Set();
    this.lastWinner = -1;
  }

  get full() {
    return this.players.every(Boolean);
  }

  get empty() {
    return this.players.every((p) => !p);
  }

  /* ---- membership ---- */

  join(session) {
    const slot = this.players.indexOf(null);
    if (slot < 0) return;
    this.players[slot] = session;
    session.room = this;
    session.slot = slot;
    session.history = [];
    this.ready_[slot] = false;
    this.broadcastRoom();
  }

  leave(session) {
    const slot = session.slot;
    if (this.players[slot] !== session) return;
    const midMatch = ['countdown', 'fight', 'roundEnd', 'paused'].includes(this.phase);
    this.players[slot] = null;
    session.room = null;
    session.slot = -1;
    if (midMatch && this.players[1 - slot]) this._forfeit(1 - slot);
    this._toLobby();
  }

  dropped(session) {
    // Held, not removed: the phone may come back within the grace period.
    if (['countdown', 'fight', 'roundEnd'].includes(this.phase)) {
      this.resumeTo = this.phase === 'roundEnd' ? 'roundEnd' : 'countdown';
      this.phase = 'paused';
      this.endsAt = this.server.now() + PVP.reconnectGrace * 1000;
    }
    this.broadcastRoom();
  }

  resume(session) {
    const now = this.server.now();
    if (this.phase === 'paused' && this.players.every((p) => p && p.connected)) {
      // Back in: the round restarts from a countdown so nobody is hit while
      // their screen is still catching up. Health and score are kept.
      if (this.resumeTo === 'roundEnd') this._afterRound(now);
      else this._countdown(now, false);
    }
    session.conn?.send(this.snapshot(session));
    this.broadcastRoom();
  }

  /* ---- lobby ---- */

  ready(session, value) {
    if (this.phase !== 'lobby') return;
    this.ready_[session.slot] = value;
    this.broadcastRoom();
    if (this.full && this.ready_.every(Boolean) && this.players.every((p) => p.connected)) {
      this.matchId++;
      this.score = [0, 0];
      this.round = 0;
      this._countdown(this.server.now(), true);
    }
  }

  rematch(session) {
    if (this.phase !== 'matchEnd') return;
    this.rematch_[session.slot] = true;
    this.broadcastRoom();
    if (this.full && this.rematch_.every(Boolean)) {
      this.matchId++;
      this.score = [0, 0];
      this.round = 0;
      this.rematch_ = [false, false];
      this._countdown(this.server.now(), true);
    }
  }

  /* ---- the fight ---- */

  state(session, msg, now) {
    const s = {
      t: now,
      x: num(msg.x),
      z: num(msg.z),
      facing: num(msg.facing),
      speed: num(msg.speed),
      move: typeof msg.move === 'string' ? msg.move.slice(0, 24) : null,
      phase: num(msg.phase),
      guarding: !!msg.guarding,
      // The guard's start, on the server's clock: the client says how long it
      // has been up, and half its round trip is how old that report is.
      guardSince: msg.guarding ? now - session.latency / 2 - num(msg.guardAge) * 1000 : Infinity,
      stamina: num(msg.stamina),
      gauge: num(msg.gauge),
      down: !!msg.down
    };
    session.stamina = s.stamina;
    const history = session.history;
    history.push(s);
    while (history.length && now - history[0].t > HISTORY_MS) history.shift();
    if (typeof msg.latency === 'number') session.latency = Math.max(0, Math.min(1000, msg.latency));

    const other = this.players[1 - session.slot];
    other?.conn?.send({ type: 'peer', s: now, ...stripT(s) });
  }

  musou(session, now) {
    if (this.phase !== 'fight' || now < session.musouReadyAt) return;
    session.musouUntil = now + PVP.musouTime * 1000;
    session.musouReadyAt = now + PVP.musouCooldown * 1000;
    const other = this.players[1 - session.slot];
    other?.conn?.send({ type: 'peerMusou' });
  }

  /**
   * A hit claim. Checked, rewound, defended, applied — or refused.
   */
  hit(session, msg, now) {
    const a = session.slot;
    const b = 1 - a;
    const attacker = session;
    const target = this.players[b];
    const reject = (reason) => attacker.conn?.send({ type: 'hitRejected', reason, move: msg.move });

    if (this.phase !== 'fight' || !target) return reject('phase');
    if (this.hp[a] <= 0 || this.hp[b] <= 0) return reject('dead');

    const move = String(msg.move || '');
    const base = PVP.damage[move];
    if (!base) return reject('move');
    if (move.startsWith('musou') && now > attacker.musouUntil) return reject('musou');

    // Flood limits: the same move twice inside `hitCooldownMs`, or too many in a second.
    if (now - (attacker.lastHit[move] ?? -Infinity) < PVP.hitCooldownMs) return reject('rate');
    attacker.hitTimes = attacker.hitTimes.filter((t) => now - t < 1000);
    if (attacker.hitTimes.length >= PVP.maxHitsPerSec) return reject('rate');

    // Where the target was when the attacker saw it connect.
    const at = Math.max(now - PVP.maxRewindMs, Math.min(now, num(msg.renderTime, now)));
    const them = sampleHistory(target.history, at);
    const me = last(attacker.history);
    if (!them || !me) return reject('state');

    const dx = them.x - me.x;
    const dz = them.z - me.z;
    const distance = Math.hypot(dx, dz);
    const reach = (PVP.reach[move] ?? PVP.reach.default) + PVP.reachSlack;
    if (distance > reach) return reject('reach');

    attacker.lastHit[move] = now;
    attacker.hitTimes.push(now);

    const k = distance > 1e-3 ? 1 / distance : 0;
    const toAttackerX = -dx * k || 0;
    const toAttackerZ = -dz * k || 1;
    const config = settings.defense;
    const outcome = resolveDefense(
      {
        guarding: them.guarding,
        guardAge: them.guarding ? (at - them.guardSince) / 1000 : Infinity,
        stamina: config.staminaEnabled ? them.stamina : Infinity,
        facing: them.facing,
        toAttackerX,
        toAttackerZ
      },
      {
        ...config,
        // Limited parry correction: the window is widened by the defender's
        // own latency, but never by more than `parryLagTolerance`.
        parryWindow:
          (config.parryWindow ?? 0) + Math.min(PVP.parryLagTolerance, target.latency / 2000)
      }
    );

    const counter = now < attacker.counterUntil ? PVP.counterBonus : 1;
    const damage = Math.round(base * outcome.damageScale * counter);
    this.hp[b] = Math.max(0, this.hp[b] - damage);
    if (outcome.result === 'parry') target.counterUntil = now + (config.counterWindow ?? 1) * 1000;

    this.broadcast({
      type: 'damage',
      attacker: a,
      target: b,
      move,
      result: outcome.result,
      damage,
      counter: counter > 1,
      hp: this.hp.slice(),
      dirX: dx * k || 0,
      dirZ: dz * k || 1
    });

    if (this.hp[b] <= 0) this._endRound(a, now);
  }

  /* ---- the clock ---- */

  tick(now) {
    if (this.phase === 'countdown' && now >= this.startsAt) {
      this.phase = 'fight';
      this.broadcast({ type: 'fight', round: this.round });
      this.broadcastRoom();
    } else if (this.phase === 'roundEnd' && now >= this.endsAt) {
      this._afterRound(now);
    } else if (this.phase === 'paused' && now >= this.endsAt) {
      // Grace ran out: whoever is still here wins — recorded for both before
      // the absent seat is given up, so the loss counts too.
      const present = this.players.findIndex((p) => p && p.connected);
      if (present >= 0) this._forfeit(present);
      for (const p of this.players) {
        if (p && !p.connected) {
          this.players[p.slot] = null;
          p.room = null;
          this.server.sessions.delete(p.token);
        }
      }
      this._toLobby();
    }
  }

  _countdown(now, fresh) {
    if (fresh || this.phase !== 'paused') {
      this.round++;
      this.hp = [PVP.maxHp, PVP.maxHp];
    }
    if (fresh) this.round = Math.max(1, this.round);
    this.phase = 'countdown';
    this.startsAt = now + PVP.countdown * 1000;
    for (const p of this.players) {
      if (!p) continue;
      p.counterUntil = 0;
      p.musouUntil = 0;
      p.history = [];
    }
    this.broadcast({
      type: 'round',
      round: this.round,
      hp: this.hp.slice(),
      score: this.score.slice(),
      spawns: PVP.spawns,
      startsAt: this.startsAt,
      countdown: PVP.countdown
    });
    this.broadcastRoom();
  }

  _endRound(winner, now) {
    this.score[winner]++;
    this.lastWinner = winner;
    this.phase = 'roundEnd';
    this.endsAt = now + PVP.roundEndTime * 1000;
    this.broadcast({ type: 'roundEnd', winner, score: this.score.slice(), hp: this.hp.slice() });
    this.broadcastRoom();
  }

  _afterRound(now) {
    const winner = this.score.findIndex((s) => s >= PVP.winsNeeded);
    if (winner >= 0) return this._matchEnd(winner);
    this._countdown(now, false);
  }

  _matchEnd(winner) {
    this.phase = 'matchEnd';
    this.rematch_ = [false, false];
    this.ready_ = [false, false];
    // Once per match, however many times this is reached.
    const stats = [null, null];
    if (!this.statsApplied.has(this.matchId)) {
      this.statsApplied.add(this.matchId);
      this.players.forEach((p, slot) => {
        if (p) stats[slot] = this.server.stats.record(p.clientId, slot === winner ? 'win' : 'loss');
      });
    }
    this.players.forEach((p, slot) => {
      p?.conn?.send({
        type: 'matchEnd',
        winner,
        score: this.score.slice(),
        stats: stats[slot] ?? this.server.stats.get(p.clientId)
      });
    });
    this.broadcastRoom();
  }

  _forfeit(winner) {
    if (!['countdown', 'fight', 'roundEnd', 'paused'].includes(this.phase)) return;
    this.score[winner] = PVP.winsNeeded;
    this._matchEnd(winner);
  }

  _toLobby() {
    if (this.phase !== 'matchEnd') this.phase = 'lobby';
    this.ready_ = [false, false];
    this.broadcastRoom();
  }

  /* ---- messages ---- */

  roomMessage(forSlot) {
    return {
      type: 'room',
      code: this.code,
      you: forSlot,
      phase: this.phase,
      round: this.round,
      score: this.score.slice(),
      hp: this.hp.slice(),
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      players: this.players.map((p, slot) =>
        p
          ? {
              slot,
              name: p.name,
              connected: !!p.connected,
              ready: this.ready_[slot],
              rematch: this.rematch_[slot]
            }
          : null
      )
    };
  }

  broadcastRoom() {
    this.players.forEach((p, slot) => p?.conn?.send(this.roomMessage(slot)));
  }

  broadcast(msg) {
    for (const p of this.players) p?.conn?.send(msg);
  }

  /** Everything a reconnecting client needs to rebuild the match. */
  snapshot(session) {
    const other = this.players[1 - session.slot];
    return {
      ...this.roomMessage(session.slot),
      type: 'snapshot',
      spawns: PVP.spawns,
      self: stripT(last(session.history)),
      peer: other ? stripT(last(other.history)) : null
    };
  }
}

/* ==================================================================== */

/** In-memory stats; `server/stats.js` wraps this with a file. */
export function memoryStats(initial = {}) {
  const data = { ...initial };
  const get = (id) => ({ wins: 0, losses: 0, played: 0, ...(data[id] ?? {}) });
  return {
    data,
    get,
    record(id, result) {
      const s = get(id);
      s.played++;
      if (result === 'win') s.wins++;
      else s.losses++;
      data[id] = s;
      return { ...s };
    }
  };
}

/** Linear interpolation through a position history at server time `t`. */
function sampleHistory(history, t) {
  if (!history.length) return null;
  if (t <= history[0].t) return history[0];
  for (let i = history.length - 1; i > 0; i--) {
    const a = history[i - 1];
    const b = history[i];
    if (t >= a.t) {
      if (t >= b.t) return b;
      const u = (t - a.t) / Math.max(1, b.t - a.t);
      return {
        ...b,
        x: a.x + (b.x - a.x) * u,
        z: a.z + (b.z - a.z) * u,
        facing: a.facing + angleDelta(a.facing, b.facing) * u,
        guarding: u < 0.5 ? a.guarding : b.guarding,
        guardSince: u < 0.5 ? a.guardSince : b.guardSince
      };
    }
  }
  return last(history);
}

function angleDelta(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

function last(list) {
  return list.length ? list[list.length - 1] : null;
}

function stripT(s) {
  if (!s) return null;
  const { t, guardSince, ...rest } = s;
  return rest;
}

function num(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
