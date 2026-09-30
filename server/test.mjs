// Unit tests for the PvP server logic — no sockets, a fake clock.
//   node server/test.mjs
import assert from 'node:assert/strict';

import { settings } from '../src/config/settings.js';
import { PvpServer, PVP, memoryStats } from './room.js';

let clock = 1_000_000;
const now = () => clock;
const advance = (ms, server) => {
  const step = 50;
  for (let t = 0; t < ms; t += step) {
    clock += step;
    server.tick();
  }
};

function client(server, clientId, name = clientId) {
  const inbox = [];
  const c = {
    inbox,
    open: true,
    conn: null,
    last(type) {
      for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].type === type) return inbox[i];
      return null;
    },
    all(type) {
      return inbox.filter((m) => m.type === type);
    },
    send(msg) {
      c.conn.message(JSON.stringify(msg));
    },
    connect(token) {
      c.open = true;
      c.conn = server.connect(
        (msg) => c.open && inbox.push(msg),
        () => {
          c.open = false;
        }
      );
      c.send({ type: 'hello', clientId, name, token });
      return c;
    },
    drop() {
      c.open = false;
      c.conn.closed();
    }
  };
  return c.connect();
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push(['ok', name]);
  } catch (error) {
    results.push(['FAIL', name, error.message]);
  }
}

/** Two players in one room, both ready, fight started. */
function match(opts = {}) {
  const stats = memoryStats();
  const server = new PvpServer({ now, stats });
  const a = client(server, opts.idA ?? 'A');
  const b = client(server, opts.idB ?? 'B');
  a.send({ type: 'create' });
  const code = a.last('room').code;
  b.send({ type: 'join', code });
  a.send({ type: 'ready' });
  b.send({ type: 'ready' });
  advance(PVP.countdown * 1000 + 100, server);
  return { server, a, b, code, stats };
}

/** Both report standing `gap` metres apart, facing each other. */
function stand(a, b, gap = 1.6, extra = {}) {
  a.send({ type: 'state', x: 0, z: 0, facing: 0, ...extra.a });
  b.send({ type: 'state', x: 0, z: gap, facing: Math.PI, ...extra.b });
}

test('create / join / ready / countdown / fight', () => {
  const { a, b, code } = match();
  assert.equal(code.length, 4);
  assert.equal(a.last('room').players.filter(Boolean).length, 2);
  assert.ok(a.last('round'), 'round message');
  assert.ok(b.last('fight'), 'fight started');
  assert.equal(a.last('room').phase, 'fight');
});

test('join errors: no room, full', () => {
  const server = new PvpServer({ now });
  const a = client(server, 'A');
  a.send({ type: 'join', code: 'ZZZZ' });
  assert.equal(a.last('error').reason, 'no-room');
  a.send({ type: 'create' });
  const code = a.last('room').code;
  client(server, 'B').send({ type: 'join', code });
  const c = client(server, 'C');
  c.send({ type: 'join', code });
  assert.equal(c.last('error').reason, 'full');
});

test('state relays to the other side only', () => {
  const { a, b } = match();
  stand(a, b);
  assert.ok(b.last('peer'), 'b sees a');
  assert.equal(b.last('peer').x, 0);
  assert.equal(a.last('peer').z, 1.6);
});

test('hit in reach damages (server HP)', () => {
  const { a, b } = match();
  stand(a, b);
  clock += 50;
  a.send({ type: 'hit', move: 'combo4', renderTime: clock });
  const dmg = b.last('damage');
  assert.equal(dmg.result, 'hit');
  assert.equal(dmg.hp[1], PVP.maxHp - PVP.damage.combo4);
  assert.deepEqual(a.last('damage').hp, dmg.hp, 'both see the same HP');
});

test('hit out of reach rejected', () => {
  const { a, b } = match();
  stand(a, b, 9);
  a.send({ type: 'hit', move: 'combo1', renderTime: clock });
  assert.equal(a.last('hitRejected').reason, 'reach');
  assert.equal(b.last('damage'), null);
});

test('unknown move / flood rejected', () => {
  const { a, b } = match();
  stand(a, b);
  a.send({ type: 'hit', move: 'nuke', renderTime: clock });
  assert.equal(a.last('hitRejected').reason, 'move');
  a.send({ type: 'hit', move: 'combo1', renderTime: clock });
  a.send({ type: 'hit', move: 'combo1', renderTime: clock });
  assert.equal(a.last('hitRejected').reason, 'rate');
});

test('lag compensation: rewinds to where the target was', () => {
  const { a, b } = match();
  stand(a, b, 1.6);
  const seen = clock;
  clock += 150;
  // the target has since stepped away out of reach
  b.send({ type: 'state', x: 0, z: 8, facing: Math.PI });
  a.send({ type: 'state', x: 0, z: 0, facing: 0 });
  a.send({ type: 'hit', move: 'combo2', renderTime: seen });
  assert.equal(b.last('damage')?.result, 'hit', 'accepted at the rewound position');
  // but never further back than maxRewindMs
  clock += 1000;
  b.send({ type: 'state', x: 0, z: 8, facing: Math.PI });
  a.send({ type: 'hit', move: 'combo3', renderTime: clock - 900 });
  assert.equal(a.last('hitRejected').reason, 'reach');
});

test('guard: front blocks, back does not', () => {
  const { a, b } = match();
  // b faces a (PI) and guards → block
  stand(a, b, 1.6, { b: { guarding: true, guardAge: 1, stamina: 100 } });
  a.send({ type: 'hit', move: 'combo4', renderTime: clock });
  const blocked = b.last('damage');
  if ((settings.defense?.guardChip ?? 0) === 0) assert.equal(blocked.damage, 0);
  assert.equal(blocked.result, 'block');
  // Out of stamina: the guard breaks and part of the blow lands.
  if (settings.defense?.staminaEnabled) {
    clock += 400;
    stand(a, b, 1.6, { b: { guarding: true, guardAge: 1, stamina: 0 } });
    a.send({ type: 'hit', move: 'combo4', renderTime: clock });
    const broken = b.last('damage');
    assert.equal(broken.result, 'break');
    assert.equal(broken.damage, Math.round(PVP.damage.combo4 * settings.defense.breakDamage));
  }
  // b turns its back (facing 0, away from a) → hit
  clock += 400;
  stand(a, b, 1.6, { b: { guarding: true, guardAge: 1, facing: 0 } });
  a.send({ type: 'hit', move: 'combo1', renderTime: clock });
  assert.equal(b.last('damage').result, 'hit');
});

test('parry: fresh guard parries, counter window boosts the parrier', () => {
  if (!(settings.defense?.parryWindow > 0)) return; // parry not enabled yet
  const { a, b } = match();
  stand(a, b, 1.6, { b: { guarding: true, guardAge: 0.02, stamina: 100 } });
  a.send({ type: 'hit', move: 'combo1', renderTime: clock });
  assert.equal(b.last('damage').result, 'parry');
  assert.equal(b.last('damage').damage, 0);
  // b counters inside the window
  clock += 100;
  stand(a, b, 1.6);
  b.send({ type: 'hit', move: 'combo1', renderTime: clock });
  const counter = a.last('damage');
  assert.equal(counter.counter, true);
  assert.equal(counter.damage, Math.round(PVP.damage.combo1 * PVP.counterBonus));
});

test('round end, best of three, match end, stats once', () => {
  const { server, a, b, stats } = match({ idA: 'sa', idB: 'sb' });
  const kill = () => {
    for (let i = 0; i < 40 && a.last('room').phase === 'fight'; i++) {
      stand(a, b);
      clock += 200;
      a.send({ type: 'hit', move: 'combo5', renderTime: clock });
    }
  };
  kill();
  assert.equal(a.last('roundEnd').winner, 0);
  assert.deepEqual(b.last('roundEnd').score, [1, 0]);
  advance(PVP.roundEndTime * 1000 + 100, server);
  assert.equal(a.last('round').round, 2);
  assert.deepEqual(a.last('round').hp, [PVP.maxHp, PVP.maxHp], 'HP reset per round');
  advance(PVP.countdown * 1000 + 100, server);
  kill();
  advance(PVP.roundEndTime * 1000 + 100, server);
  const end = a.last('matchEnd');
  assert.equal(end.winner, 0);
  assert.deepEqual(b.last('matchEnd').score, [2, 0]);
  assert.equal(stats.get('sa').wins, 1);
  assert.equal(stats.get('sb').losses, 1);
  // ticking on does not add again
  advance(3000, server);
  assert.equal(stats.get('sa').played, 1);
  assert.equal(stats.get('sb').played, 1);
});

test('rematch: both vote, score resets, new countdown', () => {
  const { server, a, b, stats } = match({ idA: 'ra', idB: 'rb' });
  for (const round of [1, 2]) {
    for (let i = 0; i < 40 && a.last('room').phase === 'fight'; i++) {
      stand(a, b);
      clock += 200;
      a.send({ type: 'hit', move: 'combo5', renderTime: clock });
    }
    advance(PVP.roundEndTime * 1000 + 100, server);
    if (round === 1) advance(PVP.countdown * 1000 + 100, server);
  }
  assert.equal(a.last('room').phase, 'matchEnd');
  a.send({ type: 'rematch' });
  assert.equal(a.last('room').phase, 'matchEnd', 'waits for both');
  b.send({ type: 'rematch' });
  assert.equal(a.last('room').phase, 'countdown');
  assert.deepEqual(a.last('round').score, [0, 0]);
  assert.equal(stats.get('ra').played, 1, 'rematch itself adds nothing');
});

test('reconnect: same seat, snapshot, no second player', () => {
  const { server, a, b } = match();
  stand(a, b);
  a.send({ type: 'hit', move: 'combo4', renderTime: clock });
  const token = b.last('welcome').token;
  b.drop();
  assert.equal(a.last('room').phase, 'paused');
  assert.equal(a.last('room').players[1].connected, false);
  advance(2000, server);
  b.inbox.length = 0;
  b.connect(token);
  const snap = b.last('snapshot');
  assert.ok(snap, 'snapshot sent');
  assert.equal(snap.you, 1);
  assert.equal(snap.hp[1], PVP.maxHp - PVP.damage.combo4, 'HP kept');
  assert.equal(snap.players.filter(Boolean).length, 2, 'still two seats');
  assert.equal(a.last('room').phase, 'countdown', 'resumes with a countdown');
  advance(PVP.countdown * 1000 + 100, server);
  assert.equal(a.last('room').phase, 'fight');
});

test('reconnect: a second socket for the same token closes the first', () => {
  const server = new PvpServer({ now });
  const a = client(server, 'A');
  const token = a.last('welcome').token;
  // A second socket arrives carrying the same token (the phone reconnected
  // before the old socket noticed it was dead): the old one is closed.
  const a2 = client(server, 'A');
  a2.inbox.length = 0;
  a2.connect(token);
  assert.equal(a.open, false, 'older socket for the token was closed');
  assert.equal(a2.last('welcome').token, token, 'same seat');
});

test('grace expires: forfeit win recorded once', () => {
  const { server, a, b, stats } = match({ idA: 'ga', idB: 'gb' });
  b.drop();
  advance(PVP.reconnectGrace * 1000 + 500, server);
  assert.equal(a.last('matchEnd').winner, 0);
  assert.equal(stats.get('ga').wins, 1);
  assert.equal(stats.get('gb').losses, 1);
  advance(5000, server);
  assert.equal(stats.get('ga').played, 1);
});

test('ping / pong', () => {
  const server = new PvpServer({ now });
  const a = client(server, 'P');
  a.send({ type: 'ping', c: 123 });
  assert.equal(a.last('pong').c, 123);
  assert.equal(a.last('pong').s, clock);
});

const failed = results.filter((r) => r[0] !== 'ok');
for (const r of results) console.log(r.join('  '));
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
