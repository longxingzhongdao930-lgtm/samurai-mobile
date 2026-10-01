// Browser regression for the game: every system driven through the real page.
//
//   npm run dev -- --port 5173        (in another terminal)
//   npm run test:e2e [section …]     (all sections when none are named)
//
// Needs Playwright's Chromium: `npx playwright install chromium` once, or point
// PW at an installed `playwright` package. URL overrides the page address.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const URL = process.env.URL || 'http://127.0.0.1:5173/';
const only = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const R = {}; const T0 = Date.now();
const PC = { viewport: { width: 400, height: 225 } };
const MOB = { viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

async function boot(opts, setup = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => document.querySelector('.loader--done'), null, { timeout: 300000 });
  await page.evaluate((s) => {
    if (!s.keepTitle && app.title?.visible) app._closeTitle();
    settings.combat.bufferTime = 600;
    settings.combat.player.maxHp = s.hp ?? 1e6; app.playerHp = settings.combat.player.maxHp;
    settings.enemies.count = s.count ?? 3;
    // Plain swordsmen unless a test asks for a kind: the open field's mix
    // (shields, ninja, brutes) would make every count of hits a dice roll.
    app.enemies.forceKind = s.kinds ? null : 'grunt';
    if (s.passive) settings.enemyAI.maxAttackers = 0;
    window.__log = [];
    const im = app._impact.bind(app);
    app._impact = (e, x, z, c, r, ...rest) => { __log.push({ r, move: Object.keys(settings).find(k => settings[k] === c) }); return im(e, x, z, c, r, ...rest); };
    const sw = app._onSwing.bind(app);
    app._onSwing = (m) => { __log.push({ swing: m.configKey }); return sw(m); };
    window.__place = (spots) => {
      app.enemies.respawnAll();
      const p = app.character.position, f = app.character.facing;
      app.enemies.enemies.forEach((e, i) => {
        const sp = spots[i];
        if (sp) { const a = f + (sp.a || 0); e.place(p.x + Math.sin(a) * sp.d, p.z + Math.cos(a) * sp.d, a + Math.PI); }
        else e.place(p.x + 40 + i * 3, p.z + 40, 0);
      });
    };
  }, setup);
  return { ctx, page, errors };
}
const idle = (page) => page.waitForFunction(() => !app.character.moves.some(m => m.locked), null, { timeout: 300000 });
const swings = (page, n) => page.waitForFunction((n) => __log.filter(l => l.swing).length >= n, n, { timeout: 300000 });
const run = async (name, fn) => {
  if (only.length && !only.includes(name)) return;
  const t = Date.now();
  try { R[name] = await fn(); } catch (e) { R[name] = { FAIL: String(e).slice(0, 300) }; }
  // A failed test must not leave its page rendering and slowing every test after it.
  for (const c of browser.contexts()) await c.close().catch(() => {});
  R[name] = { ...R[name], sec: Math.round((Date.now() - t) / 1000) };
  console.error(name, JSON.stringify(R[name]).slice(0, 400));
};

await run('pcCombo', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 3 });
  await page.evaluate(() => __place([{ d: 2.2, a: -0.4 }, { d: 2.2 }, { d: 2.2, a: 0.4 }]));
  for (let i = 0; i < 5; i++) { await page.keyboard.press('KeyJ'); await swings(page, i + 1); }
  await idle(page);
  const r = await page.evaluate(() => ({ steps: __log.filter(l => l.swing).map(l => l.swing).join(','), hits: __log.filter(l => l.r).length }));
  await ctx.close();
  return { ok: r.steps === 'combo1,combo2,combo3,combo4,combo5' && r.hits >= 3 && !errors.length, ...r, errors };
});

await run('pcFinisher', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1 });
  await page.evaluate(() => __place([{ d: 2.2 }]));
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => __log.some(l => l.r), null, { timeout: 300000 });
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => __log.filter(l => l.r).length >= 2, null, { timeout: 300000 });
  const r = await page.evaluate(() => __log.filter(l => l.r).map(l => l.r).join(','));
  await ctx.close();
  return { ok: r === 'stagger,finisher' && !errors.length, results: r, errors };
});

await run('pcMusou', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 6 });
  await page.evaluate(() => __place([0, 1, 2, 3, 4, 5].map(i => ({ d: 3, a: (i / 5 - 0.5) * 5 }))));
  await page.evaluate(() => { settings.souls.enabled = false; app.musouGauge = settings.musou.max; });
  await page.keyboard.press('KeyQ');
  await swings(page, 3); await idle(page);
  const r = await page.evaluate(() => ({ steps: __log.filter(l => l.swing).map(l => l.swing).join(','), kills: __log.filter(l => l.r && l.r !== 'stagger').length, gauge: app.musouGauge }));
  await ctx.close();
  return { ok: r.steps === 'musou1,musou2,musou3' && r.kills >= 5 && r.gauge === 0 && !errors.length, ...r, errors };
});

await run('aiHpRetry', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 100 });
  await page.evaluate(() => {
    settings.enemyAI.reactTime = 0.05; settings.enemyAI.cooldownMin = 0.2; settings.enemyAI.cooldownMax = 0.3;
    __place([{ d: 1.7 }]);
    window.__ph = []; const oh = app.enemies.onPlayerHit;
    app.enemies.onPlayerHit = (e, x, z) => { oh(e, x, z); __ph.push(app.playerHp); };
  });
  await page.waitForFunction(() => __ph.length >= 1, null, { timeout: 400000 });
  const hpAfter = await page.evaluate(() => __ph[0]);
  await page.evaluate(() => { settings.combat.player.damage = 999; });
  await page.waitForFunction(() => app.playerDown, null, { timeout: 400000 });
  await page.evaluate(() => { settings.combat.player.damage = 12; });
  await page.waitForFunction(() => app.playerHud.retryReady, null, { timeout: 60000 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ down: app.playerDown, hp: app.playerHp, frozen: app.controller.frozen }));
  await ctx.close();
  return { ok: hpAfter === 88 && !after.down && after.hp === 100 && !after.frozen && !errors.length, hpAfter, after, errors };
});

await run('mobile', async () => {
  const { ctx, page, errors } = await boot(MOB, { passive: true, count: 3 });
  const layout = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.mc-actions .mc-btn')].map(b => b.dataset.id);
    const boxes = [...document.querySelectorAll('.mc-actions .mc-btn')].map(b => b.getBoundingClientRect());
    let overlaps = 0; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2) overlaps++; }
    const off = boxes.filter(b => b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight).length; const offIds = ids.filter((_, i) => { const b = boxes[i]; return b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight; });
    return { ids: ids.join(','), overlaps, off, offIds: offIds.join(',') };
  });
  await page.evaluate(() => __place([{ d: 2.2 }, { d: 2.2, a: 0.5 }]));
  const tap = async (id) => { const b = await page.locator(`.mc-btn[data-id="${id}"]`).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
  await tap('combo'); await swings(page, 1); await tap('combo'); await swings(page, 2); await idle(page);
  await page.evaluate(() => { app.musouGauge = settings.musou.max; }); await page.waitForTimeout(500);
  await tap('musou'); await swings(page, 5); await idle(page);
  const p0 = await page.evaluate(() => app.character.position.toArray());
  const cdp = await ctx.newCDPSession(page);
  const sx = 90, sy = 320 - 90;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - i * 8, id: 1 }] }); await page.waitForTimeout(60); }
  await page.waitForTimeout(1500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const p1 = await page.evaluate(() => app.character.position.toArray());
  const steps = await page.evaluate(() => __log.filter(l => l.swing).map(l => l.swing).join(','));
  const moved = +Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(2);
  await ctx.close();
  return { ok: layout.overlaps === 0 && layout.off === 0 && steps.startsWith('combo1,combo2,musou1') && moved > 0.5 && !errors.length, layout, steps, moved, errors };
});


// ---- PHASE 1+: guard
async function guardCase(page, behind) {
  await page.evaluate((behind) => {
    settings.enemyAI.reactTime = 0.05; settings.enemyAI.cooldownMin = 0.2; settings.enemyAI.cooldownMax = 0.3;
    __place([{ d: 1.6, a: behind ? Math.PI : 0 }]);
    window.__def = [];
    const d = app.defense.defend.bind(app.defense);
    app.defense.defend = (...a) => { const o = d(...a); __def.push({ result: o.result, guarding: app.defense.guarding }); return o; };
  }, behind);
  await page.keyboard.down('KeyK');
  await page.waitForFunction(() => __def.length >= 1, null, { timeout: 400000 });
  await page.keyboard.up('KeyK');
  await page.waitForTimeout(300);
  return page.evaluate(() => ({ def: __def[0], hp: app.playerHp }));
}
await run('guardFront', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 100 });
  const r = await guardCase(page, false);
  await ctx.close();
  return { ok: r.def.result === 'block' && r.def.guarding && r.hp === 100 && !errors.length, ...r, errors };
});
await run('guardBack', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 100 });
  const r = await guardCase(page, true);
  await ctx.close();
  return { ok: r.def.result === 'hit' && r.def.guarding && r.hp === 88 && !errors.length, ...r, errors };
});
await run('mobileGuard', async () => {
  const { ctx, page, errors } = await boot(MOB, { passive: true, count: 1 });
  const b = await page.locator('.mc-btn[data-id="guard"]').boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 5 }] });
  const held = await page.waitForFunction(() => app.defense.guarding, null, { timeout: 120000 }).then(() => true).catch(() => false);
  const chip = await page.evaluate(() => document.querySelector('.mc-btn[data-id="guard"]').className);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const released = await page.waitForFunction(() => !app.defense.guarding, null, { timeout: 120000 }).then(() => true).catch(() => false);
  await ctx.close();
  return { ok: held && released && !errors.length, held, released, chip, errors };
});


// ---- PHASE 2+: parry timing (deterministic) + counter
await run('parry', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1, hp: 100 });
  // The counter path: with parry→execution on, J here would be the 処刑 (tested in 'execution').
  await page.evaluate(() => { settings.execution.afterParry = false; });
  await page.evaluate(() => __place([{ d: 1.6 }]));
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const e = app.enemies.enemies[0], p = app.character.position;
    // face the enemy
    app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing;
    const dx = p.x - e.position.x, dz = p.z - e.position.z, L = Math.hypot(dx, dz);
    const blow = (guardAgo) => {
      app._invuln = 0;
      app.defense.guarding = guardAgo !== null; app.defense.guardSince = guardAgo === null ? -Infinity : app.elapsed - guardAgo;
      const hp0 = app.playerHp; const d = app.defense.defend.bind(app.defense); let res;
      app.defense.defend = (...a) => { const o = d(...a); res = o.result; return o; };
      app._onPlayerHit(e, dx / L, dz / L);
      app.defense.defend = d;
      return { res, lost: hp0 - app.playerHp };
    };
    const early = blow(0.6), late = blow(null), perfect = blow(0.05);
    return { early, late, perfect, stagger: +e.staggerTime.toFixed(2), counter: +app.defense.counter.toFixed(2), alive: e.alive };
  });
  // counter: the next blow lands harder (combo1 fells a fresh body only with the bonus)
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => __log.some(l => l.r), null, { timeout: 200000 });
  const counterHit = await page.evaluate(() => ({ r: __log.find(l => l.r).r, alive: app.enemies.enemies[0].alive, counterLeft: app.defense.counter }));
  await ctx.close();
  const ok = r.early.res === 'block' && r.early.lost === 0 && r.late.res === 'hit' && r.late.lost === 12 &&
    r.perfect.res === 'parry' && r.perfect.lost === 0 && r.stagger >= 1 && r.counter > 0 &&
    ['finisher', 'kill'].includes(counterHit.r) && !counterHit.alive && counterHit.counterLeft === 0 && !errors.length;
  return { ok, ...r, counterHit, errors };
});
await run('telegraph', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 1e6 });
  await page.evaluate(() => {
    settings.enemyAI.reactTime = 0.05; settings.enemyAI.cooldownMin = 0.2; settings.enemyAI.cooldownMax = 0.3; settings.enemyAI.telegraphTime = 1.0;
    __place([{ d: 1.6 }]);
    window.__w = { start: null, end: null };
    window.__iv = setInterval(() => { const e = app.enemies.enemies[0]; if (!e) return; const st = e._ai.state;
      if (st === 'windup' && __w.start === null) __w.start = app.elapsed; if (st === 'strike' && __w.start !== null && __w.end === null) __w.end = app.elapsed; }, 5);
  });
  await page.waitForFunction(() => __w.end !== null, null, { timeout: 400000 });
  const r = await page.evaluate(() => ({ windup: +(__w.end - __w.start).toFixed(2) }));
  await ctx.close();
  return { ok: Math.abs(r.windup - 1.0) < 0.2 && !errors.length, ...r, errors };
});

await run('stamina', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1, hp: 100 });
  await page.evaluate(() => __place([{ d: 1.6 }]));
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const e = app.enemies.enemies[0], p = app.character.position;
    app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing;
    const dx = p.x - e.position.x, dz = p.z - e.position.z, L = Math.hypot(dx, dz);
    app.defense.stamina = settings.defense.staminaMax;
    const seq = [];
    for (let i = 0; i < 8; i++) {
      app._invuln = 0;
      if (!app.defense.broken) { app.defense.guarding = true; app.defense.guardSince = app.elapsed - 1; }
      const hp0 = app.playerHp; const d = app.defense.defend.bind(app.defense); let res;
      app.defense.defend = (...a) => { const o = d(...a); res = o.result; return o; };
      app._onPlayerHit(e, dx / L, dz / L);
      app.defense.defend = d;
      seq.push(res + ':' + (hp0 - app.playerHp));
      if (res === 'break') break;
    }
    return { seq: seq.join(','), broken: app.defense.broken > 0, guarding: app.defense.guarding, left: Math.round(app.defense.stamina) };
  });
  // regen: guard down, wait past the delay
  await page.evaluate(() => { app.defense.stamina = 0; app.defense.guarding = false; app.defense._sinceSpent = 0; });
  await page.waitForFunction(() => app.defense.stamina > 20, null, { timeout: 120000 });
  // leap: too winded → nothing spent, enough → leapCost spent
  const leap = await page.evaluate(() => {
    app.defense.stamina = 5; const low = app.controller.spendLeap();
    app.defense.stamina = 100; const high = app.controller.spendLeap();
    return { low, high, after: Math.round(app.defense.stamina) };
  });
  const hud = await page.evaluate(() => getComputedStyle(document.querySelector('.hp__stamina i')).transform !== 'none');
  await ctx.close();
  const ok = r.seq === 'block:0,block:0,block:0,block:0,block:0,block:0,break:6' && r.broken && !r.guarding &&
    leap.low === false && leap.high === true && leap.after === 80 && hud && !errors.length;
  return { ok, ...r, leap, hud, errors };
});
await run('posture', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1, hp: 100 });
  await page.evaluate(() => { settings.enemies.health = 1e6; __place([{ d: 1.6 }]); const e = app.enemies.enemies[0]; e.setKind('grunt'); e.health = e.maxHealth = 1e6; });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const e = app.enemies.enemies[0];
    const hits = [];
    for (let i = 0; i < 6 && !e.postureBroken; i++) { e.staggerTime = 0; hits.push(app.enemies.hit(e, 0, 1, { ...settings.kick, damage: 1 })); }
    return { hits: hits.join(','), broken: e.postureBroken, posture: e.posture };
  });
  const fin = await page.evaluate(() => { const e = app.enemies.enemies[0]; return { r: app.enemies.hit(e, 0, 1, { ...settings.kick, damage: 1 }), alive: e.alive }; });
  // parry posture: a parry alone takes parryDamage
  const parry = await page.evaluate(() => {
    __place([{ d: 1.6 }]);
    const e = app.enemies.enemies[0], p = app.character.position;
    const before = e.posture;
    app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing;
    const dx = p.x - e.position.x, dz = p.z - e.position.z, L = Math.hypot(dx, dz);
    app._invuln = 0; app.defense.guarding = true; app.defense.guardSince = app.elapsed - 0.05;
    app._onPlayerHit(e, dx / L, dz / L);
    return { before, after: e.posture };
  });
  await ctx.close();
  const ok = r.broken && r.hits.split(',').every(h => h === 'stagger') && r.hits.split(',').length === 5 &&
    fin.r === 'finisher' && !fin.alive && parry.before - parry.after === 60 && !errors.length;
  return { ok, ...r, fin, parry, errors };
});

await run('lockOn', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 3 });
  await page.evaluate(() => __place([{ d: 3 }, { d: 5, a: 0.8 }, { d: 6, a: -0.8 }]));
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(300);
  const first = await page.evaluate(() => app.enemies.enemies.indexOf(app.lockOn.target));
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(300);
  const second = await page.evaluate(() => app.enemies.enemies.indexOf(app.lockOn.target));
  // the controller faces the locked body
  await page.waitForFunction(() => { const t = app.lockOn.target, p = app.character.position; const w = Math.atan2(t.position.x - p.x, t.position.z - p.z); return Math.abs(Math.atan2(Math.sin(w - app.character.facing), Math.cos(w - app.character.facing))) < 0.2; }, null, { timeout: 120000 }).catch(() => {});
  const facing = await page.evaluate(() => {
    const t = app.lockOn.target, p = app.character.position;
    const want = Math.atan2(t.position.x - p.x, t.position.z - p.z);
    return { err: +Math.abs(Math.atan2(Math.sin(want - app.character.facing), Math.cos(want - app.character.facing))).toFixed(2), marker: !document.querySelector('.lock-marker').hidden, ctl: !!app.controller.lockTarget };
  });
  // felled → next candidate
  const next = await page.evaluate(() => { const t = app.lockOn.target; app.enemies.hit(t, 0, 1, { ...settings.kick, damage: 1e6 }); return app.enemies.enemies.indexOf(t); });
  await page.waitForFunction((n) => app.enemies.enemies.indexOf(app.lockOn.target) !== n, next, { timeout: 60000 }).catch(() => {});
  const after = await page.evaluate(() => ({ idx: app.enemies.enemies.indexOf(app.lockOn.target), alive: app.lockOn.target?.alive }));
  // long press releases
  await page.keyboard.down('KeyL'); await page.waitForTimeout(900); await page.keyboard.up('KeyL');
  await page.waitForFunction(() => app.lockOn.target === null && !app.controller.lockTarget, null, { timeout: 30000 }).catch(() => {});
  const released = await page.evaluate(() => app.lockOn.target === null && document.querySelector('.lock-marker').hidden && !app.controller.lockTarget);
  await ctx.close();
  const ok = first === 0 && second > 0 && facing.err < 0.25 && facing.marker && facing.ctl && after.idx >= 0 && after.idx !== next && after.alive && released && !errors.length;
  return { ok, first, second, facing, next, after, released, errors };
});
await run('mobileLock', async () => {
  const { ctx, page, errors } = await boot(MOB, { passive: true, count: 2 });
  await page.evaluate(() => __place([{ d: 3 }, { d: 5, a: 0.8 }]));
  await page.waitForTimeout(400);
  const btn = await page.$('.mc-util[data-util="lock"]');
  const box = btn && await btn.boundingBox();
  if (box) { await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); }
  await page.waitForFunction(() => document.querySelector('.mc-util[data-util="lock"]')?.classList.contains('is-active'), null, { timeout: 30000 }).catch(() => {});
  const r = await page.evaluate(() => ({ locked: app.lockOn.target !== null, active: document.querySelector('.mc-util[data-util="lock"]')?.classList.contains('is-active') }));
  // camera drag still works while locked (free camera kept)
  const az0 = await page.evaluate(() => app.rig.azimuth);
  await ctx.close();
  const ok = !!box && r.locked && r.active && !errors.length;
  return { ok, box: !!box, ...r, az0, errors };
});

await run('arena', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 4 });
  const amp0 = await page.evaluate(() => settings.terrain.amplitude);
  await page.evaluate(() => { settings.arena.enabled = true; });
  await page.waitForFunction(() => app.arena.active, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const p = app.character.position;
    return { spawn: [+p.x.toFixed(2), +p.z.toFixed(2)], amp: settings.terrain.amplitude, visible: app.arena.group.visible };
  });
  // walk into the fence: held in
  await page.evaluate(() => { app.character.position.set(30, 0, 0); });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
  const inside = await page.evaluate(() => {
    const d = (p) => Math.hypot(p.x, p.z);
    return { player: +d(app.character.position).toFixed(2), enemies: app.enemies.enemies.filter(e => e.alive).map(e => +d(e.position).toFixed(2)) };
  });
  if (process.env.SP) await page.screenshot({ path: process.env.SP + '/arena.png' });
  await page.evaluate(() => { settings.arena.enabled = false; });
  await page.waitForFunction(() => !app.arena.active, null, { timeout: 60000 });
  const back = await page.evaluate(() => ({ amp: settings.terrain.amplitude, visible: app.arena.group.visible }));
  await ctx.close();
  const lim = 10 - 0.5 + 0.01;
  const ok = r.visible && r.amp === 0 && Math.abs(r.spawn[0]) < 0.3 && Math.abs(r.spawn[1] + 4.5) < 0.6 &&
    inside.player <= lim && inside.enemies.every(d => d <= 10) && back.amp === amp0 && !back.visible && !errors.length;
  return { ok, amp0, ...r, inside, back, errors };
});

await run('mouse', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1 });
  await page.evaluate(() => { settings.camera.pointerLock = false; app.editor?.toggle?.(); __place([{ d: 1.6 }]); });
  await page.waitForTimeout(500);
  const cx = 200, cy = 140;
  // left click → the normal attack
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'left' }); await page.mouse.up({ button: 'left' });
  await page.waitForFunction(() => __log.some(l => l.swing), null, { timeout: 200000 });
  const swing = await page.evaluate(() => __log.find(l => l.swing).swing);
  await idle(page);
  // right button held → guard; the context menu is suppressed
  const menu = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); app.canvas.dispatchEvent(e); return e.defaultPrevented; });
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => app.defense.guarding, null, { timeout: 60000 }).catch(() => {});
  const guarding = await page.evaluate(() => app.defense.guarding);
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => !app.defense.guarding, null, { timeout: 60000 }).catch(() => {});
  const released = await page.evaluate(() => !app.defense.guarding);
  const n1 = await page.evaluate(() => __log.filter(l => l.swing).length);
  // J and K still work
  await page.keyboard.press('KeyJ');
  await page.waitForFunction((n) => __log.filter(l => l.swing).length > n, n1, { timeout: 200000 });
  await ctx.close();
  const ok = swing === 'combo1' && menu && guarding && released && !errors.length;
  return { ok, swing, menu, guarding, released, errors };
});

await run('devMode', async () => {
  const probe = async (opts, query) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(URL + query, { timeout: 180000 });
    await page.waitForFunction(() => document.querySelector('.loader--done'), null, { timeout: 300000 });
    const look = () => page.evaluate(() => {
      const gui = document.querySelector('.lil-gui.lil-root, .lil-gui.root');
      const stats = document.querySelector('.stats');
      const hint = document.querySelector('.hint__dev');
      return {
        editor: !!app.editor, gui: !!gui && getComputedStyle(gui).display !== 'none',
        stats: !!stats && !stats.hidden, hintDev: !!hint && getComputedStyle(hint).display !== 'none',
        editorBtn: !!document.querySelector('.mc-bar [aria-label="Editor"], .mc-util[data-util="editor"]') ||
          [...document.querySelectorAll('.mc-util')].some(b => b.textContent.includes('Editor'))
      };
    });
    const before = await look();
    await page.keyboard.press('KeyG'); await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);
    const after = await look();
    await ctx.close();
    return { before, after, errors };
  };
  const pc = await probe(PC, '');
  const pcDev = await probe(PC, '?dev=1');
  const mob = await probe(MOB, '');
  const ok =
    !pc.before.editor && !pc.before.gui && !pc.before.stats && !pc.before.hintDev && !pc.after.gui && !pc.after.stats &&
    pcDev.before.editor && pcDev.before.gui && pcDev.before.stats && pcDev.before.hintDev && !pcDev.after.gui && !pcDev.after.stats &&
    !mob.before.editor && !mob.before.gui && !mob.before.stats && !mob.before.editorBtn &&
    !pc.errors.length && !pcDev.errors.length && !mob.errors.length;
  return { ok, pc, pcDev, mob };
});

await run('issen', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 2, hp: 100 });
  await page.evaluate(() => __place([{ d: 1.6 }, { d: 1.8, a: 0.3 }]));
  await page.waitForTimeout(400);
  const setup = () => page.evaluate(() => { const e = app.enemies.enemies[0], p = app.character.position; app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing; });
  await setup();
  // a swing just began → the blow arrives inside the window: issen
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => app.character.moves.some(m => m.locked), null, { timeout: 100000 });
  const r1 = await page.evaluate(() => {
    const e = app.enemies.enemies[0], p = app.character.position; const hp0 = app.playerHp;
    const dx = p.x - e.position.x, dz = p.z - e.position.z, L = Math.hypot(dx, dz);
    app._swingStartedAt = app.elapsed; app._invuln = 0;
    app._onPlayerHit(e, dx / L, dz / L);
    return { alive: e.alive, lost: hp0 - app.playerHp, chain: app._issenChain };
  });
  await idle(page);
  // no swing → an ordinary hit
  const r2 = await page.evaluate(() => {
    const e = app.enemies.enemies[1], p = app.character.position; const hp0 = app.playerHp;
    const dx = p.x - e.position.x, dz = p.z - e.position.z, L = Math.hypot(dx, dz);
    app._swingStartedAt = -Infinity; app._invuln = 0;
    app._onPlayerHit(e, dx / L, dz / L);
    return { alive: e.alive, lost: hp0 - app.playerHp };
  });
  // too late a swing (started beyond the window) → ordinary hit
  await ctx.close();
  const ok = !r1.alive && r1.lost === 0 && r1.chain === 1 && r2.alive && r2.lost === 12 && !errors.length;
  return { ok, r1, r2, errors };
});

await run('souls', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 2, hp: 100 });
  await page.evaluate(() => { app.progress.reset(); app._applyUpgrades(); __place([{ d: 1.6 }, { d: 12 }]); });
  await page.waitForTimeout(400);
  // a kill drops souls; standing close takes them in
  const dropped = await page.evaluate(() => {
    settings.souls.yellowChance = 1; settings.souls.blueChance = 1;
    app.playerHp = 50; app.playerHud.setHp(50, settings.combat.player.maxHp); app.musouGauge = 0;
    const e = app.enemies.enemies[0];
    app.enemies.hit(e, 0, 1, { ...settings.kick, damage: 1e6 });
    return app.souls.count;
  });
  await page.waitForFunction(() => app.souls.count === 0, null, { timeout: 120000 }).catch(() => {});
  const got = await page.evaluate(() => ({ red: app.progress.souls, hp: app.playerHp, gauge: app.musouGauge, hud: document.querySelector('.hp__souls').textContent, left: app.souls.count }));
  // far souls: not taken until Z is held
  await page.evaluate(() => { const p = app.character.position; app.souls.drop(p.x + 6.5, p.y + 1, p.z, [0, 0]); });
  await page.waitForTimeout(3000);
  const farWaiting = await page.evaluate(() => app.souls.count);
  await page.keyboard.down('KeyZ');
  await page.waitForFunction(() => app.souls.count === 0, null, { timeout: 120000 }).catch(() => {});
  await page.keyboard.up('KeyZ');
  const pulled = await page.evaluate(() => ({ left: app.souls.count, red: app.progress.souls }));
  // upgrades: U opens (pauses), buy blade and body, levels persist
  await page.evaluate(() => app.progress.addSouls(100));
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(300);
  const open = await page.evaluate(() => ({ visible: app.upgradeMenu.visible, paused: app.paused }));
  await page.evaluate(() => { [...document.querySelectorAll('.upg__btn:not(.upg__btn--ghost)')].slice(0, 2).forEach(b => b.click()); });
  const bought = await page.evaluate(() => ({ blade: app.progress.level('blade'), body: app.progress.level('body'), maxHp: settings.combat.player.maxHp, souls: app.progress.souls, force: app._counterForce(settings.combo1).damage, saved: save.get('progress') }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => ({ visible: app.upgradeMenu.visible, paused: app.paused }));
  await page.evaluate(() => { app.progress.reset(); app._applyUpgrades(); });
  await ctx.close();
  const ok = dropped >= 5 && got.red === 3 && got.hp === 62 && got.gauge >= 8 && got.hud === '魂 3' && got.left === 0 &&
    farWaiting === 2 && pulled.left === 0 && pulled.red === 5 &&
    open.visible && open.paused && bought.blade === 2 && bought.body === 2 && bought.maxHp === 125 && bought.souls === 105 - 35 &&
    bought.saved.levels.blade === 2 && !closed.visible && !closed.paused && !errors.length;
  return { ok, dropped, got, farWaiting, pulled, open, bought: { ...bought, saved: undefined }, closed, errors };
});
await run('vfx', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 2, hp: 100 });
  await page.evaluate(() => { app.editor?.toggle?.(); __place([{ d: 1.8 }, { d: 2.4, a: 0.5 }]); });
  await page.waitForTimeout(1500);
  const miasma = await page.evaluate(() => app.miasma.mesh.geometry.instanceCount);
  // the trail lights during a swing
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => app.trail.mesh.visible, null, { timeout: 120000 }).catch(() => {});
  const trail = await page.evaluate(() => app.trail.mesh.visible);
  await page.waitForFunction(() => !app.character.moves.some(m => m.locked), null, { timeout: 200000 });
  // parry flare, issen iai cut, boss omen, glint
  const n0 = await page.evaluate(() => app.fx.mesh.geometry.instanceCount);
  await page.evaluate(() => {
    const e = app.enemies.enemies[0], p = app.character.position;
    app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing;
    const dx = p.x - e.position.x, dz = p.z - e.position.z, L = Math.hypot(dx, dz);
    app._invuln = 0; app.defense.guarding = true; app.defense.guardSince = app.elapsed - 0.05;
    app._onPlayerHit(e, dx / L, dz / L);
    app.defense.guarding = false;
    app.bossOmen(p.x, p.z + 3);
    app._iai(e.position, app.character.facing, 1);
  });
  const n1 = await page.evaluate(() => app.fx.mesh.geometry.instanceCount);
  await page.waitForTimeout(200);
  if (process.env.SP) await page.screenshot({ path: process.env.SP + '/vfx.png' });
  // glint scheduled on a windup
  await page.evaluate(() => { settings.enemyAI.maxAttackers = 2; settings.enemyAI.reactTime = 0.05; });
  await page.waitForFunction(() => app.enemies.enemies.some(e => e._glintAt !== undefined), null, { timeout: 200000 }).catch(() => {});
  const glintScheduled = await page.evaluate(() => app.enemies.enemies.some(e => e._glintAt !== undefined) || app.fx.mesh.geometry.instanceCount > 0);
  await ctx.close();
  const ok = miasma > 0 && trail && n1 >= n0 + 5 && glintScheduled && !errors.length;
  return { ok, miasma, trail, n0, n1, glintScheduled, errors };
});

await run('execution', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 2, hp: 100 });
  await page.evaluate(() => { __place([{ d: 1.6 }, { d: 14 }]); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const e = app.enemies.enemies[0], p = app.character.position; app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing; e._parriedUntil = app.elapsed + 30; e.staggerTime = 30; });
  await page.waitForFunction(() => app.execution.candidate === app.enemies.enemies[0] && !document.querySelector('.exec-marker').hidden, null, { timeout: 60000 }).catch(() => {});
  const prompt = await page.evaluate(() => ({ candidate: app.execution.candidate === app.enemies.enemies[0], marker: !document.querySelector('.exec-marker').hidden }));
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => !!app.execution.active, null, { timeout: 60000 }).catch(() => {});
  const started = await page.evaluate(() => ({ active: !!app.execution.active, frozen: app.controller.frozen }));
  await page.waitForFunction(() => !app.execution.active, null, { timeout: 300000 }).catch(() => {});
  const r = await page.evaluate(() => ({ alive: app.enemies.enemies[0]?.alive ?? false, souls: app.souls.count + app.progress.souls, scripted: app._scripted, frozen: app.controller.frozen, hp: app.playerHp }));
  // a stance-broken body is executable too; a healthy one is not
  const rules = await page.evaluate(() => {
    const e = app.enemies.enemies.find(x => x.alive);
    if (!e) return { none: true };
    e._parriedUntil = -1; e.postureBroken = false;
    const plain = app.execution.executable(e);
    e.postureBroken = true;
    const broken = app.execution.executable(e);
    e.postureBroken = false;
    return { plain, broken };
  });
  await ctx.close();
  const ok = prompt.candidate && prompt.marker && started.active && started.frozen && !r.alive && r.souls >= 6 && !r.scripted && !r.frozen &&
    rules.plain === false && rules.broken === true && !errors.length;
  return { ok, prompt, started, r, rules, errors };
});
await run('hien', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 4, hp: 100 });
  // three in the lane at 4, 8 and 12 m, one well off to the side
  await page.evaluate(() => { __place([{ d: 4 }, { d: 8 }, { d: 12 }, { d: 6, a: 1.2 }]); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const e = app.enemies.enemies[1], p = app.character.position; app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing; app.defense.stamina = 100; });
  await page.keyboard.press('KeyB');
  await page.waitForFunction(() => document.querySelector('.sky-crack')?.classList.contains('is-on'), null, { timeout: 120000 }).catch(() => {});
  const crack = await page.evaluate(() => !!document.querySelector('.sky-crack.is-on') && document.querySelector('.sky-crack__core').getAttribute('d').length > 50);
  await page.waitForFunction(() => app.enemies.enemies.slice(0, 3).every(e => !e.alive), null, { timeout: 200000 }).catch(() => {});
  const r = await page.evaluate(() => ({ lane: app.enemies.enemies.slice(0, 3).map(e => e.alive), side: app.enemies.enemies[3].alive, stamina: Math.round(app.defense.stamina) }));
  await ctx.close();
  const ok = crack && r.lane.every(a => !a) && r.side && r.stamina <= 75 + 5 && !errors.length;
  return { ok, crack, ...r, errors };
});
await run('pointerLook', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1 });
  await page.evaluate(() => { app.editor?.toggle?.(); __place([{ d: 1.6 }]); });
  await page.waitForTimeout(400);
  // the click that takes the mouse is not a swing
  await page.mouse.move(200, 140); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(1500);
  const first = await page.evaluate(() => ({ swings: __log.filter(l => l.swing).length, locked: app.pointerLook.locked, failures: app.pointerLook._failures, hint: document.querySelector('.look-hint') !== null }));
  // the look buffer turns the orbit
  const az0 = await page.evaluate(() => app.rig.azimuth);
  await page.evaluate(() => app.rig.look(0.6, 0));
  await page.waitForFunction((a) => Math.abs(Math.atan2(Math.sin(app.rig.azimuth - a), Math.cos(app.rig.azimuth - a))) > 0.3, az0, { timeout: 60000 }).catch(() => {});
  const az1 = await page.evaluate(() => app.rig.azimuth);
  await ctx.close();
  const turned = Math.abs(Math.atan2(Math.sin(az1 - az0), Math.cos(az1 - az0))) > 0.3;
  const ok = first.swings === 0 && first.hint && turned && !errors.length;
  return { ok, first, az0, az1, turned, errors };
});

const face = (page, i) => page.evaluate((i) => { const e = app.enemies.enemies[i], p = app.character.position; app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing; app.defense.stamina = 100; }, i);
const countHits = (page) => page.evaluate(() => { window.__hits = new Map(); const h = app.enemies.hit.bind(app.enemies); app.enemies.hit = (e, ...a) => { __hits.set(e, (__hits.get(e) || 0) + 1); return h(e, ...a); }; });
await run('shukuchi', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1, hp: 100 });
  await page.evaluate(() => { __place([{ d: 20 }]); app.defense.stamina = 100; });
  await page.waitForTimeout(300);
  const from = await page.evaluate(() => [app.character.position.x, app.character.position.z]);
  await page.keyboard.press('KeyX');
  await page.waitForFunction(() => app.arts.run?.id === 'shukuchi', null, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => !app.arts.run, null, { timeout: 60000 }).catch(() => {});
  const r = await page.evaluate((from) => ({ moved: +Math.hypot(app.character.position.x - from[0], app.character.position.z - from[1]).toFixed(2), frozen: app.controller.frozen, stamina: Math.round(app.defense.stamina) }), from);
  await ctx.close();
  return { ok: r.moved > 5 && r.moved < 7 && !r.frozen && r.stamina < 100 && !errors.length, ...r, errors };
});
await run('kagebashiri', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 3, hp: 100 });
  await page.evaluate(() => { __place([{ d: 3 }, { d: 6, a: 0.8 }, { d: 8, a: -0.6 }]); for (const e of app.enemies.enemies) if (e.alive) e.setKind('grunt'); app.defense.stamina = 100; });
  await page.waitForTimeout(300);
  await countHits(page);
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => app.enemies.enemies.every(e => !e.alive), null, { timeout: 120000 }).catch(() => {});
  await page.waitForFunction(() => !app.arts.run, null, { timeout: 60000 }).catch(() => {});
  const r = await page.evaluate(() => ({ alive: app.enemies.enemies.filter(e => e.alive).length, hits: [...__hits.values()], frozen: app.controller.frozen }));
  await ctx.close();
  return { ok: r.alive === 0 && r.hits.every(n => n === 1) && !r.frozen && !errors.length, ...r, errors };
});
await run('raikiri', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 3, hp: 100 });
  // two on the line, one off to the side of the first (the chain)
  await page.evaluate(() => { __place([{ d: 3 }, { d: 6 }, { d: 4, a: 0.9 }]); settings.enemies.health = 2; });
  await page.waitForTimeout(300);
  await face(page, 0);
  await countHits(page);
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => app.arts.run?.id === 'raikiri', null, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => !app.arts.run, null, { timeout: 120000 }).catch(() => {});
  const r = await page.evaluate(() => ({ line: app.enemies.enemies.slice(0, 2).map(e => e.alive), side: app.enemies.enemies[2].alive, sideHits: __hits.get(app.enemies.enemies[2]) || 0, bolts: app.fx.mesh.geometry.instanceCount, frozen: app.controller.frozen }));
  await ctx.close();
  return { ok: r.line.every(a => !a) && r.sideHits === 1 && r.bolts > 5 && !r.frozen && !errors.length, ...r, errors };
});
await run('iai', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 3, hp: 100 });
  // one to draw on at 6 m, one behind it on the lane for the wave, one far to the side
  await page.evaluate(() => { __place([{ d: 6 }, { d: 11 }, { d: 6, a: 1.4 }]); });
  await page.waitForTimeout(300);
  await face(page, 0);
  await countHits(page);
  await page.keyboard.down('KeyB');
  await page.waitForFunction(() => !!app.arts.stance, null, { timeout: 60000 }).catch(() => {});
  const stance = await page.evaluate(() => !!app.arts.stance && app.controller.frozen);
  await page.keyboard.up('KeyB');
  await page.waitForFunction(() => app.enemies.enemies.slice(0, 2).every(e => !e.alive), null, { timeout: 120000 }).catch(() => {});
  const r = await page.evaluate(() => ({ drawn: !app.enemies.enemies[0].alive, wave: !app.enemies.enemies[1].alive, side: app.enemies.enemies[2].alive, hits: [__hits.get(app.enemies.enemies[0]) || 0, __hits.get(app.enemies.enemies[1]) || 0], dist: +Math.hypot(app.character.position.x, app.character.position.z).toFixed(1), frozen: app.controller.frozen }));
  await ctx.close();
  const ok = stance && r.drawn && r.wave && r.side && r.hits[0] === 1 && r.hits[1] === 1 && r.dist > 3 && !r.frozen && !errors.length;
  return { ok, stance, ...r, errors };
});

const kindAt = (page, kind, d, a = 0, faceAway = false) => page.evaluate(({ kind, d, a, faceAway }) => {
  settings.enemyKinds.mix = {};
  __place([{ d, a }]);
  const e = app.enemies.enemies[0];
  e.setKind(kind, app.enemies.makeProp);
  const p = app.character.position;
  const toPlayer = Math.atan2(p.x - e.position.x, p.z - e.position.z);
  e.facing = faceAway ? toPlayer + Math.PI : toPlayer;
  e.root.rotation.y = e.facing - e.forwardYaw;
  app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing;
}, { kind, d, a, faceAway });
await run('kindShield', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1, hp: 100 });
  await kindAt(page, 'shield', 1.6);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const e = app.enemies.enemies[0], p = app.character.position;
    const dx = e.position.x - p.x, dz = e.position.z - p.z, L = Math.hypot(dx, dz);
    let blocked = 0; app.enemies.onBlocked = () => { blocked++; };
    const front = app.enemies.hit(e, dx / L, dz / L, settings.combo1);
    const hp1 = e.health;
    const kick = app.enemies.hit(e, dx / L, dz / L, settings.kick);
    const open = e.shieldOpen > 0;
    const after = app.enemies.hit(e, dx / L, dz / L, settings.combo1);
    return { front, blocked, hp1, kick, open, after, prop: !!e._prop, kind: e.kind };
  });
  // and the back is never covered
  await kindAt(page, 'shield', 1.6, 0, true);
  const back = await page.evaluate(() => { const e = app.enemies.enemies[0], p = app.character.position; const dx = e.position.x - p.x, dz = e.position.z - p.z, L = Math.hypot(dx, dz); return app.enemies.hit(e, dx / L, dz / L, settings.combo1); });
  await ctx.close();
  const ok = r.kind === 'shield' && r.prop && r.front === null && r.blocked === 1 && r.hp1 === 3 && r.kick === 'stagger' && r.open && r.after && back && !errors.length;
  return { ok, ...r, back, errors };
});
await run('kindNinja', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 1e6 });
  await kindAt(page, 'ninja', 6);
  await page.evaluate(() => { settings.enemyAI.reactTime = 0.05; app.enemies.enemies[0].aware = true; window.__closeAt = null; window.__t0 = app.elapsed;
    window.__iv = setInterval(() => { const e = app.enemies.enemies[0], p = app.character.position; if (!e) return; if (__closeAt === null && Math.hypot(e.position.x - p.x, e.position.z - p.z) < 2) __closeAt = app.elapsed - __t0; }, 10); });
  await page.waitForFunction(() => __closeAt !== null, null, { timeout: 200000 }).catch(() => {});
  const closed = await page.evaluate(() => __closeAt);
  // a parried ninja is open to an execution
  const exec = await page.evaluate(() => {
    const e = app.enemies.enemies[0], p = app.character.position;
    app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing;
    const dx = p.x - e.position.x, dz = p.z - e.position.z, L = Math.hypot(dx, dz);
    app._invuln = 0; app.defense.guarding = true; app.defense.guardSince = app.elapsed - 0.05;
    app._onPlayerHit(e, dx / L, dz / L);
    return { candidate: app.execution.findCandidate() === e, postureBroken: e.postureBroken, speed: e.kindCfg.speed };
  });
  await ctx.close();
  // plain swordsmen walk 1.5 m/s: 4 m would take ~3 s; the ninja does it well under that
  const ok = closed !== null && closed < 2.2 && exec.candidate && !errors.length;
  return { ok, closed, ...exec, errors };
});
await run('kindArcher', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 100 });
  await kindAt(page, 'archer', 3);
  await page.evaluate(() => { const e = app.enemies.enemies[0]; e._gun = false; e.aware = true; settings.enemyAI.reactTime = 0.05; window.__fired = 0; const f = app.projectiles.fire.bind(app.projectiles); app.projectiles.fire = (...a) => { __fired++; return f(...a); }; });
  // backs off to its range, then shoots
  await page.waitForFunction(() => { const e = app.enemies.enemies[0], p = app.character.position; return Math.hypot(e.position.x - p.x, e.position.z - p.z) > 5; }, null, { timeout: 200000 }).catch(() => {});
  const retreated = await page.evaluate(() => { const e = app.enemies.enemies[0], p = app.character.position; return +Math.hypot(e.position.x - p.x, e.position.z - p.z).toFixed(1); });
  await page.waitForFunction(() => __fired > 0, null, { timeout: 200000 }).catch(() => {});
  await page.waitForFunction(() => app.playerHp < 100, null, { timeout: 200000 }).catch(() => {});
  const hit = await page.evaluate(() => ({ fired: __fired, hp: app.playerHp }));
  // guarding toward it: the next shot is stopped
  await page.evaluate(() => { const e = app.enemies.enemies[0], p = app.character.position; app.character.setFacing(Math.atan2(e.position.x - p.x, e.position.z - p.z)); settings.character.facing = app.character.facing; app.defense.stamina = 100; window.__res = []; const d = app.defense.defend.bind(app.defense); app.defense.defend = (...a) => { const o = d(...a); __res.push(o.result); return o; }; });
  await page.keyboard.down('KeyK');
  await page.waitForFunction(() => __res.length > 0, null, { timeout: 200000 }).catch(() => {});
  await page.keyboard.up('KeyK');
  const guard = await page.evaluate(() => __res[0] ?? null);
  await ctx.close();
  const ok = retreated > 5 && hit.fired > 0 && hit.hp < 100 && ['block', 'parry'].includes(guard) && !errors.length;
  return { ok, retreated, ...hit, guard, errors };
});

await run('kindBrute', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1, hp: 100 });
  await kindAt(page, 'brute', 2.2);
  await page.waitForTimeout(300);
  // head-on, a full string barely dents it and it never reels
  const front = await page.evaluate(() => {
    const e = app.enemies.enemies[0], p = app.character.position;
    const dx = e.position.x - p.x, dz = e.position.z - p.z, L = Math.hypot(dx, dz);
    for (const k of ['combo1', 'combo2', 'combo3', 'combo4', 'combo5']) app.enemies.hit(e, dx / L, dz / L, settings[k]);
    return { alive: e.alive, health: e.health, max: e.maxHealth, stagger: e.staggerTime, size: e.size, broken: e.postureBroken };
  });
  // parries tear its stance: two break it, and it is open to an execution
  const parry = await page.evaluate(() => {
    const e = app.enemies.enemies[0], p = app.character.position;
    e.posture = e.postureMax; e._postureIdle = 0;
    const dx = p.x - e.position.x, dz = p.z - e.position.z, L = Math.hypot(dx, dz);
    let n = 0;
    while (!e.postureBroken && n < 5) { app._invuln = 0; app.defense.guarding = true; app.defense.guardSince = app.elapsed - 0.05; app._onPlayerHit(e, dx / L, dz / L); n++; }
    app.defense.guarding = false;
    return { parries: n, broken: e.postureBroken, candidate: app.execution.findCandidate() === e };
  });
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => !!app.execution.active, null, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => !app.execution.active, null, { timeout: 300000 }).catch(() => {});
  const executed = await page.evaluate(() => !app.enemies.enemies[0].alive);
  // its blow: heavy, and marked on the ground first
  await kindAt(page, 'brute', 2.2);
  const blow = await page.evaluate(() => {
    const e = app.enemies.enemies[0], p = app.character.position;
    const n0 = app.fx.mesh.geometry.instanceCount;
    app._onEnemyWindup(e);
    const omen = app.fx.mesh.geometry.instanceCount > n0;
    const dx = p.x - e.position.x, dz = p.z - e.position.z, L = Math.hypot(dx, dz);
    app._invuln = 0; app.defense.guarding = false; const hp0 = app.playerHp;
    app._onPlayerHit(e, dx / L, dz / L);
    return { omen, lost: +(hp0 - app.playerHp).toFixed(1) };
  });
  await ctx.close();
  const ok = front.alive && front.health >= 8.5 && front.stagger === 0 && front.size > 1.4 && parry.broken && parry.parries <= 3 && parry.candidate && executed && blow.omen && blow.lost > 20 && !errors.length;
  return { ok, front, parry, executed, blow, errors };
});

await run('stage', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 3, hp: 1e6 });
  const st = () => page.evaluate(() => ({ step: app.stage.step, g1: app.stage.barriers.g1.open, g2: app.stage.barriers.g2.open, g3: app.stage.barriers.g3.open, enemies: app.enemies.enemies.filter(e => e.alive).length, cp: app.stage.checkpoint }));
  const go = (x, z) => page.evaluate(([x, z]) => app._teleport(x, z, 0), [x, z]);
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { settings.enemyAI.maxAttackers = 0; settings.enemyKinds.archer.cooldownMin = 999; settings.enemyKinds.archer.cooldownMax = 999; });
  await page.evaluate(() => app.stage.start({ tutorial: false }));
  await until(() => app.stage.step === 'approach');
  const start = await page.evaluate(() => ({ step: app.stage.step, amp: settings.terrain.amplitude, alive: app.enemies.enemies.filter(e => e.alive).length, manual: app.enemies.manual, objective: document.querySelector('.stage-objective').textContent }));
  await go(0, 5);
  await until(() => app.stage.barriers.g1.open);
  const gate1 = await st();
  await go(0, 12);
  await until(() => app.stage.step === 'plaza');
  const plaza = await page.evaluate(() => ({ step: app.stage.step, wave: app.stage.wave.map(e => e.kind), g1: app.stage.barriers.g1.open }));
  // the gate behind is shut: walking back is stopped at the plaza's edge
  await go(0, 2);
  await page.waitForFunction(() => app.character.position.z > 10, null, { timeout: 30000 }).catch(() => {});
  const heldIn = await page.evaluate(() => app.character.position.z > 10);
  await page.evaluate(() => { for (const e of app.stage.wave) if (e.alive) app.enemies.kill(e, 0, 1, settings.kick); });
  await until(() => app.stage.step === 'onward');
  const onward = await st();
  await page.evaluate(() => { app.playerHp = 30; });
  await go(2.0, 42);
  await until(() => app.stage.checkpoint === 'save');
  const save = await page.evaluate(() => ({ cp: app.stage.checkpoint, hp: app.playerHp, g3: app.stage.barriers.g3.open }));
  await go(0, 54);
  await until(() => app.stage.step === 'boss' && !!app.stage.boss);
  const boss = await page.evaluate(() => { const b = app.stage.boss; return { kind: b.enemy.kind, size: b.enemy.size, hp: b.enemy.maxHealth, hud: !!document.querySelector('.boss-hud'), phase: b.phase }; });
  // phase two: the slam, warned first
  await page.evaluate(() => { const b = app.stage.boss; b.enemy.health = b.enemy.maxHealth * 0.6; });
  await until(() => app.stage.boss.phase === 2);
  await page.evaluate(() => { app.stage.boss.nextSpecial = 0; window.__omens = 0; const o = app.fx.omen.bind(app.fx); app.fx.omen = (...a) => { __omens++; return o(...a); }; });
  await until(() => !!app.stage.boss.special);
  await until(() => __omens > 0);
  const p2 = await page.evaluate(() => ({ phase: app.stage.boss.phase, special: !!app.stage.boss.special, omens: __omens, speed: app.stage.boss.enemy.kindCfg.speed }));
  // phase three: retainers
  await page.evaluate(() => { const b = app.stage.boss; b.enemy.health = b.enemy.maxHealth * 0.3; });
  await until(() => app.stage.boss.phase === 3);
  const p3 = await page.evaluate(() => ({ phase: app.stage.boss.phase, adds: app.stage.boss.adds.length }));
  // falling in the boss fight: back to the mirror, the boss gone until you walk in again
  await page.evaluate(() => { app._down(); });
  await until(() => app.playerHud.retryReady);
  await page.evaluate(() => app._retry());
  await until(() => app.stage.step === 'onward');
  const retry = await page.evaluate(() => ({ step: app.stage.step, boss: !!app.stage.boss, z: +app.character.position.z.toFixed(1), hp: app.playerHp }));
  await go(0, 54);
  await until(() => app.stage.step === 'boss' && !!app.stage.boss);
  const souls0 = await page.evaluate(() => app.souls.count);
  await page.evaluate(() => app.enemies.kill(app.stage.boss.enemy, 0, 1, settings.kick));
  await until(() => app.stage.boss?.defeated);
  const souls = await page.evaluate(() => app.souls.count);
  await until(() => !document.querySelector('.stage-clear').hidden);
  const clear = await page.evaluate(() => ({ step: app.stage.step, screen: !document.querySelector('.stage-clear').hidden, stats: document.querySelector('.stage-clear__stats').textContent }));
  await page.click('.stage-clear [data-act="leave"]');
  await page.waitForTimeout(500);
  const left = await page.evaluate(() => ({ active: app.stage.active, manual: app.enemies.manual, amp: settings.terrain.amplitude }));
  await ctx.close();
  const ok = start.step === 'approach' && start.amp === 0 && start.alive === 0 && gate1.g1 && plaza.step === 'plaza' && plaza.wave.length === 6 &&
    plaza.wave.includes('brute') && plaza.wave.includes('shield') && !plaza.g1 && heldIn && onward.g2 && save.cp === 'save' && save.hp > 30 && save.g3 &&
    boss.kind === 'boss' && boss.hud && p2.phase === 2 && p2.omens > 0 && p3.phase === 3 && p3.adds === 2 &&
    retry.step === 'onward' && !retry.boss && retry.z > 38 && retry.z < 44 && souls - souls0 >= 40 && clear.step === 'clear' && clear.screen &&
    !left.active && !left.manual && left.amp > 0 && !errors.length;
  return { ok, start, gate1, plaza, heldIn, onward, save, boss, p2, p3, retry, souls: souls - souls0, clear, left, errors };
});

await run('title', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, keepTitle: true });
  const t0 = await page.evaluate(() => ({ visible: app.title.visible, paused: app.paused, record: document.querySelector('.title__record').textContent, resume: !document.querySelector('[data-act="resume"]').hidden }));
  await page.click('.title [data-act="controls"]');
  const sheet = await page.evaluate(() => ({ rows: document.querySelectorAll('.title__controls tr').length, shown: !document.querySelector('.title__controls').hidden }));
  await page.click('.title [data-view="controls"] [data-act="back"]');
  await page.click('.title [data-act="select"]');
  await page.click('.title [data-act="free"]');
  const free = await page.evaluate(() => ({ visible: app.title.visible, paused: app.paused }));
  // the corner button brings it back
  await page.click('.stage-open');
  const back = await page.evaluate(() => ({ visible: app.title.visible, paused: app.paused }));
  await ctx.close();
  const ok = t0.visible && t0.paused && t0.record.includes('未踏破') && !t0.resume && sheet.shown && sheet.rows > 10 && !free.visible && !free.paused && back.visible && back.paused && !errors.length;
  return { ok, t0, sheet, free, back, errors };
});
await run('tutorial', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 1e6, keepTitle: true });
  await page.click('.title [data-act="select"]');
  await page.click('.title [data-act="stage"]');
  await page.waitForFunction(() => app.stage.step === 'tutorial', null, { timeout: 60000 }).catch(() => {});
  const s0 = await page.evaluate(() => ({ step: app.stage.step, card: !document.querySelector('.tutorial').hidden, text: document.querySelector('.tutorial__text').textContent, paused: app.paused }));
  const at = (i) => page.waitForFunction((i) => app.stage.tutorial.index === i, i, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const p = app.character.position; app._teleport(p.x, p.z + 3, 0); });
  await at(1);
  const dummy = await page.evaluate(() => ({ alive: !!app.stage.tutorial.dummy?.alive, hp: app.stage.tutorial.dummy?.health }));
  await page.evaluate(() => { app.counters.hits += 3; });
  await at(2);
  await page.evaluate(() => { app.counters.parry += 1; });
  await at(3);
  const swinging = await page.evaluate(() => !app.stage.tutorial.dummy._passive);
  await page.evaluate(() => { app.counters.execution += 1; });
  await at(4);
  await page.evaluate(() => { app.defense.stamina = 100; });
  await page.keyboard.press('KeyX');
  await page.waitForFunction(() => app.stage.step === 'approach', null, { timeout: 60000 }).catch(() => {});
  const done = await page.evaluate(() => ({ step: app.stage.step, card: document.querySelector('.tutorial').hidden, saved: save.get('stage1').tutorialDone, dummy: app.stage.tutorial.dummy }));
  await ctx.close();
  const ok = s0.step === 'tutorial' && s0.card && !s0.paused && dummy.alive && dummy.hp === 99 && swinging && done.step === 'approach' && done.card && done.saved === true && !done.dummy && !errors.length;
  return { ok, s0, dummy, swinging, done, errors };
});
await run('stageSave', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 1e6 });
  await page.evaluate(() => { save.set('stage1', { tutorialDone: true }); settings.enemyAI.maxAttackers = 0; app.stage.start(); });
  await page.waitForFunction(() => app.stage.step === 'approach', null, { timeout: 60000 }).catch(() => {});
  // run to the mirror (the plaza's enemies cleared by hand)
  await page.evaluate(() => { app._teleport(0, 12, 0); });
  await page.waitForFunction(() => app.stage.step === 'plaza', null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { for (const e of app.stage.wave) if (e.alive) app.enemies.kill(e, 0, 1); });
  await page.waitForFunction(() => app.stage.step === 'onward', null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => app._teleport(2, 42, 0));
  await page.waitForFunction(() => save.get('stage1').checkpoint === 'save', null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => save.flush());
  // a fresh page: the title offers 続きから, and it starts at the mirror
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => document.querySelector('.loader--done') && app.title?.visible, null, { timeout: 300000 });
  const title = await page.evaluate(() => ({ resume: !document.querySelector('[data-act="resume"]').hidden, backend: save.backend }));
  await page.click('.title [data-act="select"]');
  await page.click('.title [data-act="resume"]');
  await page.waitForFunction(() => app.stage.step === 'onward', null, { timeout: 60000 }).catch(() => {});
  const resumed = await page.evaluate(() => ({ step: app.stage.step, cp: app.stage.checkpoint, z: +app.character.position.z.toFixed(1), g2: app.stage.barriers.g2.open }));
  // beat the boss: cleared + best time recorded, and the checkpoint cleared
  await page.evaluate(() => { settings.combat.player.maxHp = 1e6; app.playerHp = 1e6; app._teleport(0, 54, 0); });
  await page.waitForFunction(() => !!app.stage.boss, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => app.enemies.kill(app.stage.boss.enemy, 0, 1));
  await page.waitForFunction(() => save.get('stage1').cleared === true, null, { timeout: 60000 }).catch(() => {});
  const rec = await page.evaluate(() => save.get('stage1'));
  await page.waitForFunction(() => !document.querySelector('.stage-clear').hidden, null, { timeout: 60000 }).catch(() => {});
  await page.click('.stage-clear [data-act="leave"]');
  await page.waitForFunction(() => app.title.visible, null, { timeout: 30000 }).catch(() => {});
  const after = await page.evaluate(() => ({ title: app.title.visible, record: document.querySelector('.title__record').textContent, resume: !document.querySelector('[data-act="resume"]').hidden }));
  await ctx.close();
  const ok = title.resume && title.backend === 'indexeddb' && resumed.step === 'onward' && resumed.cp === 'save' && resumed.z > 38 && resumed.g2 && rec.cleared && rec.best == null && rec.checkpoint === 'start' &&
    after.title && after.record.includes('討伐済') && !after.record.includes('最速') && !after.resume && !errors.length;
  return { ok, title, resumed, rec, after, errors };
});


// The save lives in IndexedDB: souls, upgrades, the stage record and the
// settings survive a reload, and the old localStorage keys are carried over.
await run('saveDb', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1 });
  await page.evaluate(async () => {
    await save.clear();
    localStorage.setItem('samurai.progress', JSON.stringify({ souls: 77, levels: { blade: 2 } }));
    localStorage.setItem('samurai.stage1', JSON.stringify({ cleared: true, best: 95, checkpoint: 'start', tutorialDone: true }));
  });
  // A fresh page with an empty database migrates the old keys.
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('samurai'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => document.querySelector('.loader--done'), null, { timeout: 300000 });
  const migrated = await page.evaluate(() => ({ backend: save.backend, souls: app.progress.souls, blade: app.progress.level('blade'), rec: save.get('stage1'), record: document.querySelector('.title__record').textContent }));
  // Change a setting and some souls, flush, reload: still there.
  await page.evaluate(async () => { app._applyPrefs({ music: 0.2, quality: 'light' }); app.progress.addSouls(5); await save.flush(); });
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => document.querySelector('.loader--done'), null, { timeout: 300000 });
  const reloaded = await page.evaluate(() => ({ souls: app.progress.souls, music: settings.audio.music, quality: app.renderer.quality, prefs: app.prefs }));
  await ctx.close();
  const ok = migrated.backend === 'indexeddb' && migrated.souls === 77 && migrated.blade === 2 && migrated.rec.best === 95 && migrated.record.includes('1:35') &&
    reloaded.souls === 82 && reloaded.music === 0.2 && reloaded.quality === 'light' && !errors.length;
  return { ok, migrated, reloaded, errors };
});

// 設定: every control reaches the game, and 「セーブ削除」 needs two presses.
await run('settingsPanel', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, keepTitle: true });
  await page.click('.title [data-act="settings"]');
  const shown = await page.evaluate(() => !document.querySelector('[data-view="settings"]').hidden);
  await page.evaluate(() => { const i = document.querySelector('[data-pref="sfx"]'); i.value = '0.3'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('.title [data-quality="standard"]');
  await page.evaluate(() => { const i = document.querySelector('[data-pref="sensitivity"]'); i.value = '1.5'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  const applied = await page.evaluate(() => ({ sfx: settings.audio.sfx, quality: app.renderer.quality, checked: document.querySelector('[data-quality="standard"]').getAttribute('aria-checked'), rotate: app.rig.controls.rotateSpeed, saved: save.get('prefs') }));
  await page.evaluate(() => app.progress.addSouls(40));
  await page.click('.title [data-act="erase"]');
  const armed = await page.evaluate(() => ({ souls: app.progress.souls, text: document.querySelector('[data-act="erase"]').textContent }));
  await page.click('.title [data-act="erase"]');
  const erased = await page.evaluate(() => ({ souls: app.progress.souls, quality: app.renderer.quality, sfx: settings.audio.sfx }));
  await page.click('.title [data-view="settings"] [data-act="back"]');
  const main = await page.evaluate(() => app.title.current);
  await ctx.close();
  const ok = shown && applied.sfx === 0.3 && applied.quality === 'standard' && applied.checked === 'true' && Math.abs(applied.rotate - 0.975) < 1e-6 && applied.saved.quality === 'standard' &&
    armed.souls === 40 && armed.text.includes('もう一度') && erased.souls === 0 && erased.quality === 'auto' && erased.sfx === 1 && main === 'main' && !errors.length;
  return { ok, shown, applied, armed, erased, main, errors };
});

// 一ノ章, start to finish, the way a player goes through it: the title, the
// stage select, the lesson (skipped here — it has its own test), the gate,
// the plaza, the mirror, 羅刹 (entrance, phases), the clear screen and back to
// the title with the record on it. The music follows each part.
await run('fullRun', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 1e6, keepTitle: true });
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { settings.enemyAI.maxAttackers = 0; settings.enemyKinds.archer.cooldownMin = 999; settings.enemyKinds.archer.cooldownMax = 999; });
  // A gesture unlocks the audio, as a real press would.
  await page.mouse.click(5, 5);
  const music0 = await page.evaluate(() => app.music.current?.name ?? app.music.wanted);
  await page.click('.title [data-act="select"]');
  await page.click('.title [data-act="stage"]');
  await until(() => app.stage.step === 'tutorial');
  const lesson = await page.evaluate(() => ({ step: app.stage.step, card: !document.querySelector('.tutorial').hidden, title: app.title.visible }));
  await page.click('.tutorial__skip');
  await until(() => app.stage.step === 'approach');
  await page.evaluate(() => app._teleport(0, 12, 0));
  await until(() => app.stage.step === 'plaza');
  await page.waitForTimeout(600);
  const fieldMusic = await page.evaluate(() => ({ piece: app.music.current?.name, intensity: app.music.intensity }));
  await page.evaluate(() => { for (const e of app.stage.wave) if (e.alive) app.enemies.kill(e, 0, 1, settings.kick); });
  await until(() => app.stage.step === 'onward');
  await page.evaluate(() => app._teleport(2, 42, 0));
  await until(() => app.stage.checkpoint === 'save');
  await page.evaluate(() => app._teleport(0, 54, 0));
  await until(() => app.stage.step === 'boss' && !!app.stage.boss);
  const intro = await page.evaluate(() => ({ intro: app.stage.boss.intro > 0, locked: app.lockOn.target === app.stage.boss.enemy, hud: document.querySelector('.boss-hud').classList.contains('is-intro') }));
  await until(() => app.stage.boss.intro <= 0);
  await page.waitForTimeout(400);
  const bossMusic = await page.evaluate(() => ({ piece: app.music.current?.name, framing: app.rig._frameDistanceGoal, fov: app.camera.fov }));
  await page.evaluate(() => { const b = app.stage.boss; b.enemy.health = b.enemy.maxHealth * 0.6; });
  await until(() => app.stage.boss.phase === 2);
  await page.evaluate(() => { const b = app.stage.boss; b.enemy.health = b.enemy.maxHealth * 0.3; });
  await until(() => app.stage.boss.phase === 3);
  const phases = await page.evaluate(() => ({ phase: app.stage.boss.phase, musicPhase: app.music.phase, hud: document.querySelector('.boss-hud').dataset.phase, lock: app.lockOn.target?.kind }));
  await page.evaluate(() => app.enemies.kill(app.stage.boss.enemy, 0, 1, settings.kick));
  await until(() => app.stage.step === 'clear');
  await page.waitForTimeout(300);
  const clearMusic = await page.evaluate(() => app.music.current?.name);
  await until(() => !document.querySelector('.stage-clear').hidden);
  const clear = await page.evaluate(() => document.querySelector('.stage-clear__stats').textContent);
  await page.click('.stage-clear [data-act="leave"]');
  await until(() => app.title.visible && app.music.wanted === 'title');
  const back = await page.evaluate(() => ({ title: app.title.visible, record: document.querySelector('.title__record').textContent, rec: save.get('stage1'), manual: app.enemies.manual, piece: app.music.wanted }));
  await ctx.close();
  const ok = music0 === 'title' && lesson.step === 'tutorial' && lesson.card && !lesson.title && fieldMusic.piece === 'field' && fieldMusic.intensity > 0 &&
    intro.intro && intro.locked && intro.hud && bossMusic.piece === 'boss' && bossMusic.framing > 0 && phases.phase === 3 && phases.musicPhase === 3 && phases.hud === '3' &&
    clearMusic === 'clear' && clear.includes('新記録') && !clear.includes('魂 +0') && back.title && back.record.includes('討伐済') && back.record.includes('最速') && back.rec.cleared && back.rec.best > 0 &&
    !back.manual && back.piece === 'title' && !errors.length;
  return { ok, music0, lesson, fieldMusic, intro, bossMusic, phases, clearMusic, clear, back, errors };
});


// 一時停止: P opens it over the game, its panels lead back to it, Escape
// closes it; 鏡から再開 (or the gate) and タイトルへ do what they say.
await run('pauseMenu', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 1e6 });
  await page.evaluate(() => { save.set('stage1', { tutorialDone: true }); settings.enemyAI.maxAttackers = 0; app.stage.start(); });
  await page.waitForFunction(() => app.stage.step === 'approach', null, { timeout: 60000 }).catch(() => {});
  await page.keyboard.press('KeyP');
  const open = await page.evaluate(() => ({ visible: app.title.visible, mode: app.title.mode, view: app.title.current, paused: app.paused, restart: document.querySelector('[data-act="restart"]').textContent, where: document.querySelector('.title__pause-where').textContent }));
  await page.click('.title [data-view="pause"] [data-act="settings"]');
  await page.click('.title [data-view="settings"] [data-act="back"]');
  const back = await page.evaluate(() => app.title.current);
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => ({ visible: app.title.visible, paused: app.paused }));
  // 門からやり直す: no mirror yet, so the run starts again at the gate.
  await page.evaluate(() => app._teleport(0, 5, 0));
  await page.keyboard.press('KeyP');
  await page.click('.title [data-act="restart"]');
  await page.waitForTimeout(500);
  const restarted = await page.evaluate(() => ({ step: app.stage.step, z: +app.character.position.z.toFixed(1), paused: app.paused, visible: app.title.visible }));
  await page.keyboard.press('KeyP');
  await page.click('.title [data-act="quit"]');
  await page.waitForTimeout(300);
  const quit = await page.evaluate(() => ({ title: app.title.visible, mode: app.title.mode, stage: app.stage.active, music: app.music.wanted }));
  await ctx.close();
  const ok = open.visible && open.mode === 'pause' && open.view === 'pause' && open.paused && open.restart.includes('門') && open.where.includes('一ノ章') &&
    back === 'pause' && !closed.visible && !closed.paused && restarted.step === 'approach' && restarted.z < 1 && !restarted.paused && !restarted.visible &&
    quit.title && quit.mode === 'title' && !quit.stage && quit.music === 'title' && !errors.length;
  return { ok, open, back, closed, restarted, quit, errors };
});

// 難易度: the numbers it scales, and 羅刹's health; never in a duel's numbers.
await run('difficulty', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 1e6 });
  const read = () => page.evaluate(() => ({ id: app.difficulty.id, dmg: settings.combat.player.damage, parry: settings.defense.parryWindow, attackers: settings.enemyAI.maxAttackers }));
  await page.evaluate(() => app._applyPrefs({ difficulty: 'normal' }));
  const normal = await read();
  await page.evaluate(() => app._applyPrefs({ difficulty: 'hard' }));
  const hard = await read();
  await page.evaluate(() => app._applyPrefs({ difficulty: 'easy' }));
  const easy = await read();
  await ctx.close();
  const ok = hard.dmg > normal.dmg && easy.dmg < normal.dmg && hard.parry < normal.parry && easy.parry > normal.parry && easy.attackers <= normal.attackers && hard.attackers > normal.attackers && !errors.length;
  return { ok, normal, hard, easy, errors };
});

// A pad: buttons are keys (A swings), and over a menu A/B and the stick drive it.
await run('gamepad', async () => {
  const { ctx, page, errors } = await boot(PC, { passive: true, count: 1 });
  await page.evaluate(() => {
    const pad = { id: 'Test pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [pad];
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
    __place([{ d: 1.6 }]);
  });
  const press = async (i, on) => page.evaluate(([i, on]) => { __pad.buttons[i].pressed = on; }, [i, on]);
  await press(0, true);
  await page.waitForFunction(() => __log.some((l) => l.swing), null, { timeout: 120000 }).catch(() => {});
  await press(0, false);
  const swung = await page.evaluate(() => __log.find((l) => l.swing)?.swing ?? null);
  // Start: the pause menu; B closes it again.
  await idle(page);
  await press(9, true);
  await page.waitForFunction(() => app.title.visible, null, { timeout: 60000 }).catch(() => {});
  await press(9, false);
  const paused = await page.evaluate(() => ({ visible: app.title.visible, mode: app.title.mode }));
  await page.waitForTimeout(400);
  await press(1, true);
  await page.waitForFunction(() => !app.title.visible, null, { timeout: 60000 }).catch(() => {});
  await press(1, false);
  const resumed = await page.evaluate(() => !app.title.visible && !app.paused);
  // Left stick: the walk.
  await page.evaluate(() => { __pad.axes[1] = -1; });
  await page.waitForFunction(() => app.input.stick.y > 0.5, null, { timeout: 60000 }).catch(() => {});
  const stick = await page.evaluate(() => ({ y: app.input.stick.y, run: app.input.stick.run }));
  await page.evaluate(() => { __pad.axes[1] = 0; });
  await ctx.close();
  const ok = swung === 'combo1' && paused.visible && paused.mode === 'pause' && resumed && stick.y > 0.5 && !errors.length;
  return { ok, swung, paused, resumed, stick, errors };
});

// The rank on the clear screen and the best kept per difficulty; vibration asked for on a parry.
await run('rankHaptics', async () => {
  const { ctx, page, errors } = await boot(PC, { count: 1, hp: 1e6 });
  await page.evaluate(() => { save.set('stage1', { tutorialDone: true }); settings.enemyAI.maxAttackers = 0; settings.enemyKinds.archer.cooldownMin = 999; settings.enemyKinds.archer.cooldownMax = 999; app._applyPrefs({ difficulty: 'hard' }); app.stage.start(); });
  await page.waitForFunction(() => app.stage.step === 'approach', null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { app.counters.parry += 4; app.counters.execution += 2; app.haptics.log.length = 0; app.haptics._last = 0; app.haptics.pulse([30]); });
  await page.evaluate(() => app._teleport(0, 12, 0));
  await page.waitForFunction(() => app.stage.step === 'plaza', null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { for (const e of app.stage.wave) if (e.alive) app.enemies.kill(e, 0, 1, settings.kick); });
  await page.waitForFunction(() => app.stage.step === 'onward', null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => app._teleport(0, 54, 0));
  await page.waitForFunction(() => !!app.stage.boss, null, { timeout: 60000 }).catch(() => {});
  const bossHp = await page.evaluate(() => ({ hp: app.stage.boss.enemy.maxHealth, base: settings.enemyKinds.boss.health }));
  await page.evaluate(() => app.enemies.kill(app.stage.boss.enemy, 0, 1, settings.kick));
  await page.waitForFunction(() => !document.querySelector('.stage-clear').hidden, null, { timeout: 120000 }).catch(() => {});
  const clear = await page.evaluate(() => ({ rank: document.querySelector('.stage-clear__rank').textContent, detail: document.querySelector('.stage-clear__detail').textContent, saved: save.get('stage1').ranks, haptics: app.haptics.log.length, banner: document.querySelector('.banner__word').textContent }));
  await ctx.close();
  const ok = bossHp.hp === Math.round(bossHp.base * 1.3) && ['S', 'A', 'B', 'C'].includes(clear.rank) && clear.detail.includes('難易度 +8') && clear.saved?.hard === clear.rank &&
    clear.haptics >= 2 && clear.banner === '討伐' && !errors.length;
  return { ok, bossHp, clear, errors };
});

// The whole chapter on a phone: taps for the menus, the same run to the clear.
await run('fullRunPhone', async () => {
  const { ctx, page, errors } = await boot(MOB, { count: 1, hp: 1e6, keepTitle: true });
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 120000 }).catch(() => {});
  const tap = async (sel) => { const el = await page.waitForSelector(sel, { state: 'visible', timeout: 60000 }); const b = await el.boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
  await page.evaluate(() => { settings.enemyAI.maxAttackers = 0; settings.enemyKinds.archer.cooldownMin = 999; settings.enemyKinds.archer.cooldownMax = 999; });
  await tap('.title [data-act="select"]');
  await tap('.title [data-act="stage"]');
  await until(() => app.stage.step === 'tutorial');
  await tap('.tutorial__skip');
  await until(() => app.stage.step === 'approach');
  // The Attack button swings.
  await tap('.mc [data-id="combo"]').catch(() => {});
  const swung = await page.waitForFunction(() => app.character.moves.some((m) => m.locked), null, { timeout: 60000 }).then(() => true).catch(() => false);
  await idle(page);
  await page.evaluate(() => app._teleport(0, 12, 0));
  await until(() => app.stage.step === 'plaza');
  await page.evaluate(() => { for (const e of app.stage.wave) if (e.alive) app.enemies.kill(e, 0, 1, settings.kick); });
  await until(() => app.stage.step === 'onward');
  await page.evaluate(() => app._teleport(2, 42, 0));
  await until(() => app.stage.checkpoint === 'save');
  // The phone's Pause button opens the menu; 再開 closes it.
  await tap('.mc [data-id="pause"], .mc-util[aria-label="Pause"], .mc-util[data-util="pause"]').catch(() => page.keyboard.press('KeyP'));
  await until(() => app.title.visible && app.title.mode === 'pause');
  const pause = await page.evaluate(() => ({ visible: app.title.visible, restart: document.querySelector('[data-act="restart"]').textContent, cp: app.stage.checkpoint, z: +app.character.position.z.toFixed(1), x: +app.character.position.x.toFixed(2), step: app.stage.step }));
  await tap('.title [data-act="resume-game"]');
  await page.evaluate(() => app._teleport(0, 54, 0));
  await until(() => !!app.stage.boss);
  await page.evaluate(() => app.enemies.kill(app.stage.boss.enemy, 0, 1, settings.kick));
  await until(() => !document.querySelector('.stage-clear').hidden);
  const clear = await page.evaluate(() => ({ rank: document.querySelector('.stage-clear__rank').textContent, stats: document.querySelector('.stage-clear__stats').textContent }));
  await tap('.stage-clear [data-act="leave"]');
  await until(() => app.title.visible);
  const back = await page.evaluate(() => ({ title: app.title.visible, record: document.querySelector('.title__record').textContent, dpr: app.renderer.gl.getPixelRatio(), quality: app.quality.tier }));
  await ctx.close();
  const ok = swung && pause.visible && pause.restart.includes('鏡') && ['S', 'A', 'B', 'C'].includes(clear.rank) && back.title && back.record.includes('討伐済') && !errors.length;
  return { ok, swung, pause, clear, back, errors };
});

const allOk = Object.values(R).every(r => r.ok);
console.log(JSON.stringify({ allOk, totalSec: Math.round((Date.now() - T0) / 1000), R }, null, 1));
await browser.close();
process.exitCode = allOk ? 0 : 1;
