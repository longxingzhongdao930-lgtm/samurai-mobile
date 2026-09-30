// Two-browser PvP end-to-end: two pages meet in a room and play a match.
//
//   PVP_MAX_HP=20 npx vite --port 5175      (two combo5 claims end a round)
//   URL=http://127.0.0.1:5175/ npm run test:pvp
//
// MOBILE=1 drives both pages as phones. PW overrides the playwright package.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const URL = process.env.URL || 'http://127.0.0.1:5173/';
const MOBILE = process.env.MOBILE === '1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const T0 = Date.now();
const log = (...a) => console.error(`[${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const R = {};
const opts = MOBILE
  ? { viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true }
  : { viewport: { width: 400, height: 225 } };

async function open(name) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => document.querySelector('.loader--done'), null, { timeout: 300000 });
  await page.evaluate(() => { if (app.title?.visible) app._closeTitle(); settings.combat.player.maxHp = 1e6; });
  return { ctx, page, errors, name };
}
const tap = async (page, sel) => {
  const el = await page.waitForSelector(sel, { state: 'visible', timeout: 60000 });
  if (MOBILE) { const b = await el.boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); }
  else await el.click();
};
const phase = (p, ph) => p.page.waitForFunction((ph) => app.pvp.phase === ph, ph, { timeout: 120000 });

let A, B;
try {
  A = await open('A');
  B = await open('B');
  log('both loaded');

  // ---- room: create, join by code, ready, count, fight
  await tap(A.page, '.pvp-open');
  await A.page.fill('.pvp-panel .pvp-input:not(.pvp-input--code)', 'Alpha');
  await tap(A.page, '.pvp-panel__lobby .pvp-btn');
  await A.page.waitForFunction(() => app.pvp.room?.code, null, { timeout: 60000 });
  const code = await A.page.evaluate(() => app.pvp.room.code);
  log('room', code);
  await tap(B.page, '.pvp-open');
  await B.page.fill('.pvp-panel .pvp-input:not(.pvp-input--code)', 'Bravo');
  await B.page.fill('.pvp-input--code', 'ZZZZ');
  await tap(B.page, '.pvp-row .pvp-btn');
  await B.page.waitForFunction(() => document.querySelector('.pvp-panel__error').textContent.length > 0, null, { timeout: 30000 });
  R.badCode = await B.page.evaluate(() => document.querySelector('.pvp-panel__error').textContent);
  await B.page.fill('.pvp-input--code', code.toLowerCase());
  await tap(B.page, '.pvp-row .pvp-btn');
  await B.page.waitForFunction(() => app.pvp.room?.players?.every(Boolean), null, { timeout: 60000 });
  await A.page.waitForFunction(() => app.pvp.room?.players?.every(Boolean), null, { timeout: 60000 });
  R.inRoom = await A.page.evaluate(() => ({ arena: app.arena.active, enemies: app.enemies.enemies.length, hud: !document.querySelector('.pvp-hud').hidden }));
  await tap(A.page, '.pvp-panel__room .pvp-btn:not(.pvp-btn--ghost)');
  await tap(B.page, '.pvp-panel__room .pvp-btn:not(.pvp-btn--ghost)');
  await phase(A, 'countdown');
  await A.page.waitForFunction(() => app.controller.frozen && document.querySelector('.pvp-banner').textContent !== '', null, { timeout: 30000 }).catch(() => {});
  const cd = await A.page.evaluate(() => ({ frozen: app.controller.frozen, banner: document.querySelector('.pvp-banner').textContent, left: (app.pvp.startsAt - app.pvp.client.now()) / 1000 }));
  R.countdown = cd;
  await phase(A, 'fight'); await phase(B, 'fight');
  log('fight');
  R.spawn = await A.page.evaluate(() => ({ you: app.pvp.you, me: [app.character.position.x, app.character.position.z].map(v => +v.toFixed(1)), opp: [app.pvp.opponent.position.x, app.pvp.opponent.position.z].map(v => +v.toFixed(1)) }));

  // ---- sync: B's position reaches A
  await B.page.evaluate(() => app._teleport(2, 0, 0));
  await A.page.waitForFunction(() => Math.abs(app.pvp.opponent.position.x - 2) < 0.3, null, { timeout: 60000 });
  R.sync = true;

  // Stand A just in front of B, facing B; B faces A.
  const stand = async () => {
    log('stand');
    // Wait out any knockback still sliding either body, then put them on their marks.
    const settle = (P, x, z, f) => P.page.waitForFunction(([x, z, f]) => {
      const v = app.controller.velocity;
      const still = Math.hypot(v.x, v.y ?? v.z ?? 0) < 0.05;
      app._teleport(x, z, f);
      return still;
    }, [x, z, f], { timeout: 60000, polling: 250 });
    await settle(B, 0, 1.2, Math.PI);
    await settle(A, 0, -0.2, 0);
    await A.page.waitForFunction(() => Math.abs(app.pvp.opponent.position.z - 1.2) < 0.2, null, { timeout: 60000 });
    await B.page.waitForFunction(() => Math.abs(app.pvp.opponent.position.z + 0.2) < 0.2, null, { timeout: 60000 });
    await A.page.waitForTimeout(400);
    log('stood', await A.page.evaluate(() => [app.pvp.opponent.position.z, app.pvp.opponent.states.at(-1)?.guarding, app.pvp.phase]));
  };
  await stand();

  // ---- a real attack: J on A → claim → server → both HPs
  const hpB0 = await B.page.evaluate(() => app.playerHp);
  await A.page.keyboard.press('KeyJ');
  await B.page.waitForFunction((h) => app.playerHp < h, hpB0, { timeout: 200000 });
  R.realHit = await B.page.evaluate(() => ({ hp: app.playerHp, oppViewOnA: null }));
  R.realHit.aSees = await A.page.evaluate(() => app.pvp.hp[1 - app.pvp.you]);
  log('real hit', R.realHit);

  // ---- guard: B holds K facing A → block
  await B.page.evaluate(() => { app.defense.guarding = true; app.defense.guardSince = app.elapsed - 1; });
  await B.page.keyboard.down('KeyK');
  await B.page.waitForTimeout(1500);
  await B.page.evaluate(() => { window.__dmg = []; const m = app.pvp._message.bind(app.pvp); app.pvp._message = (msg) => { if (msg.type === 'damage') __dmg.push(msg.result); m(msg); }; });
  await A.page.waitForTimeout(300);
  await A.page.waitForFunction(() => app.pvp.opponent.states.at(-1)?.guarding === true, null, { timeout: 60000 });
  R.guardState = await B.page.evaluate(() => ({ g: app.defense.guarding, pressed: [...app.input.pressed], active: document.activeElement?.className || document.activeElement?.tagName }));
  await A.page.evaluate(() => app.pvp.claim('combo1'));
  await B.page.waitForFunction(() => __dmg.length > 0, null, { timeout: 60000 });
  R.guard = await B.page.evaluate(() => ({ result: __dmg[0], hp: app.playerHp, stamina: Math.round(app.defense.stamina) }));
  await B.page.keyboard.up('KeyK');
  await B.page.waitForTimeout(800);
  log('guard', R.guard);

  // ---- round 1: A finishes B (combo5 = 15 against 20 max)
  await A.page.evaluate(() => { window.__rej = []; const m = app.pvp._message.bind(app.pvp); app.pvp._message = (msg) => { if (msg.type === 'hitRejected') __rej.push(msg.reason); m(msg); }; });
  await stand();
  await A.page.waitForFunction(() => app.pvp.opponent.states.at(-1)?.guarding === false, null, { timeout: 60000 });
  for (let i = 0; i < 4; i++) {
    const ph = await A.page.evaluate(() => app.pvp.phase);
    if (ph !== 'fight') break;
    await A.page.evaluate(() => app.pvp.claim('combo5'));
    await A.page.waitForTimeout(500);
  }
  await phase(A, 'roundEnd').catch(() => {});
  R.round1 = await B.page.evaluate(() => ({ phase: app.pvp.phase, score: app.pvp.score, down: app.playerDown }));
  R.round1.rejected = await A.page.evaluate(() => __rej);
  R.round1.bSaw = await B.page.evaluate(() => ({ dmg: __dmg, g: app.defense.guarding, pressed: [...app.input.pressed], hp: app.playerHp }));
  R.round1.aState = await A.page.evaluate(() => ({ alive: app.pvp.opponent.alive, phase: app.pvp.phase, oppStates: app.pvp.opponent.states.length }));
  log('round1', R.round1);

  // ---- reconnect during round 2 countdown/fight: drop B's socket
  await phase(A, 'countdown');
  R.round2Reset = await B.page.evaluate(() => ({ hp: app.playerHp, down: app.playerDown, round: app.pvp.round }));
  await phase(B, 'fight');
  await B.page.evaluate(() => app.pvp.client.ws.close());
  await A.page.waitForFunction(() => app.pvp.phase === 'paused' || app.pvp.room?.players?.some(p => p && !p.connected), null, { timeout: 60000 }).catch(() => {});
  await B.page.waitForFunction(() => app.pvp.client.status === 'online', null, { timeout: 60000 });
  await phase(A, 'fight'); await phase(B, 'fight');
  R.reconnect = await B.page.evaluate(() => ({ status: app.pvp.client.status, you: app.pvp.you, round: app.pvp.round, seats: app.pvp.room.players.filter(Boolean).length, avatars: app.scene.children.filter(c => c.name === 'Opponent').length }));
  log('reconnect', R.reconnect);

  // ---- round 2: A wins → 2-0, match end, stats once
  await stand();
  await A.page.waitForFunction(() => app.pvp.opponent.states.at(-1)?.guarding === false, null, { timeout: 60000 });
  for (let i = 0; i < 4; i++) {
    const ph = await A.page.evaluate(() => app.pvp.phase);
    if (ph !== 'fight') break;
    await A.page.evaluate(() => app.pvp.claim('combo5'));
    await A.page.waitForTimeout(500);
  }
  await phase(A, 'matchEnd'); await phase(B, 'matchEnd');
  R.match = {
    A: await A.page.evaluate(() => ({ score: app.pvp.score, stats: app.pvp.stats, result: document.querySelector('.pvp-result').textContent })),
    B: await B.page.evaluate(() => ({ score: app.pvp.score, stats: app.pvp.stats, result: document.querySelector('.pvp-result').textContent }))
  };
  log('match', R.match);

  // ---- rematch
  await tap(A.page, '.pvp-panel__room .pvp-btn:not(.pvp-btn--ghost):not([hidden])');
  await tap(B.page, '.pvp-panel__room .pvp-btn:not(.pvp-btn--ghost):not([hidden])');
  await phase(A, 'countdown');
  R.rematch = await A.page.evaluate(() => ({ round: app.pvp.round, score: app.pvp.score, hp: app.playerHp }));
  log('rematch', R.rematch);

  // ---- leave → PvE back
  await A.page.evaluate(() => app.pvp.leave());
  await A.page.waitForFunction(() => !app.arena.active, null, { timeout: 60000 }).catch(() => {});
  R.leave = await A.page.evaluate(() => ({ arena: app.arena.active, enemiesEnabled: settings.enemies.enabled, frozen: app.controller.frozen, hud: document.querySelector('.pvp-hud').hidden }));
  R.errors = { A: A.errors, B: B.errors };

  const ok =
    R.badCode && R.inRoom.arena && R.inRoom.hud && R.countdown.frozen && R.sync &&
    R.realHit.hp < 20 && R.realHit.aSees === R.realHit.hp &&
    R.guard.result === 'block' && R.round1.score.includes(1) && R.round2Reset.hp === 20 && !R.round2Reset.down &&
    R.reconnect.status === 'online' && R.reconnect.avatars === 1 &&
    R.match.A.stats.wins + R.match.B.stats.wins === 1 && R.match.A.stats.played === 1 && R.match.B.stats.played === 1 &&
    R.rematch.round === 1 && R.leave.arena === false && R.leave.enemiesEnabled && !R.leave.frozen && R.leave.hud &&
    !A.errors.length && !B.errors.length;
  console.log(JSON.stringify({ ok, sec: Math.round((Date.now() - T0) / 1000), R }, null, 1));
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  const dump = (P) => P?.page.evaluate(() => ({ me: [app.character.position.x, app.character.position.z].map(v => +v.toFixed(2)), opp: [app.pvp.opponent.position.x, app.pvp.opponent.position.z].map(v => +v.toFixed(2)), last: app.pvp.opponent.states.at(-1) && { x: +app.pvp.opponent.states.at(-1).x.toFixed(2), z: +app.pvp.opponent.states.at(-1).z.toFixed(2), s: app.pvp.opponent.states.at(-1).s }, now: app.pvp.client.now(), phase: app.pvp.phase, frozen: app.controller.frozen, paused: app.paused, down: app.playerDown, el: app.elapsed, upg: app.upgradeMenu.visible })).catch(x => String(x));
  console.log(JSON.stringify({ ok: false, error: String(e), errA: A?.errors, errB: B?.errors, dA: await dump(A), dB: await dump(B), R }, null, 1));
  process.exitCode = 1;
} finally {
  await browser.close();
}
