"""Campaign regression: leave optional enemies alive, including at the mobile budget floor.

This drives real Flow/combat code with scripted positions, invulnerability and
lethal hits. It verifies progression, not player difficulty or mobile FPS.
"""
import json
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
        headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    )
    page = browser.new_page(viewport={'width': 844, 'height': 390}, has_touch=True, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(os.environ.get('GAME_URL', 'http://127.0.0.1:4173/') + '?q=low&dyn=0', wait_until='domcontentloaded')
    page.wait_for_function('window.app?.game?.state === "title"', timeout=240000)
    # Pause costly software rendering while Playwright waits for stable UI.
    page.evaluate('app.stop()')
    page.get_by_role('button', name='はじめる', exact=True).click()
    page.wait_for_function('app.game.state === "playing" && app.game.form.ready', timeout=90000)
    for budget in [12, 6]:
        report = page.evaluate('''budget => {
            app.stop(); const g = app.game, p = g.player, f = g.flow;
            g.start();
            Object.defineProperty(g.budget, 'maxEnemies', { value: budget, configurable: true });
            const visited = new Set(), optional = new Set();
            const positions = { intro: 0, first: 22, street: 52, oni: 92, horde: 120,
                shrineRoad: 160, shrineCourt: 195, approach: 222, boss: 250 };
            let steps = 0, peakAlive = 0, streetSpawned = 0, optionalAtBoss = 0;
            while (g.state !== 'result' && steps++ < 1800) {
                if (g.state === 'blessing') document.querySelector('.gs-blessing__choice').click();
                p.invulnerable = 999;
                const beat = f.beats[f.beat];
                if (!beat) throw Error('missing beat ' + f.beat);
                visited.add(beat.id);
                if (!beat.started && positions[beat.id] !== undefined)
                    f._place(g.playerPosition.clone().set(0, 0, positions[beat.id]), 0);
                if (beat.id === 'street' && beat.started) {
                    for (const a of g.director.agents)
                        if (a.alive && !f.encounter.agents.includes(a)) optional.add(a);
                    streetSpawned = Math.max(streetSpawned, f.encounter.agents.length);
                }
                if (beat.id === 'boss' && !beat.started) {
                    optionalAtBoss = [...optional].filter(a => a.alive).length;
                    if (optionalAtBoss !== 4) throw Error('optional enemies cleared before boss');
                }
                if (['thunder', 'ice'].includes(beat.id)) {
                    const pickup = f.pickups.find(x => x.kind === beat.id);
                    if (pickup) f._place(pickup.position.clone().setY(0), 0);
                }
                // Only required enemies take test damage. The four side-yard
                // enemies stay in the world and keep using the device budget.
                const required = new Set(f.encounter?.agents ?? []);
                if (f._oni) required.add(f._oni);
                if (g.boss?.agent) required.add(g.boss.agent);
                for (const a of required) if (a.alive && !g.cinematic)
                    g.damageEnemy(a.enemy, { damage: 99999, posture: 0, source: 'magic',
                        quiet: true, execute: !!a.finalDown, dirX: 0, dirZ: 1, knockback: 0 });
                app.simulate(.25);
                peakAlive = Math.max(peakAlive, g.director.aliveCount);
                if (peakAlive > budget) throw Error('enemy budget exceeded ' + peakAlive);
            }
            if (g.state !== 'result') throw Error('progression stuck at ' + f.beats[f.beat].id);
            if (visited.size !== 12 || !p.unlocked.every(Boolean)) throw Error('incomplete chapter');
            // Boss victory intentionally purges all surviving enemies.
            if (optional.size !== 4 || optionalAtBoss !== 4) throw Error('optional enemies missing');
            if (streetSpawned !== 4) throw Error('street enemies missing');
            if (localStorage.getItem('kuroame.v1.run') !== null) throw Error('completed save not cleared');
            if (!g.journey.records.has('tarislandDragon')) throw Error('boss rematch not unlocked');
            app.frame();
            const result = { budget, peakAlive, streetSpawned, optionalAliveAtBoss: optionalAtBoss,
                visited: [...visited], result: g.state, steps };
            g.toTitle();
            if (document.querySelector('[data-action=continue]')) throw Error('completed journey still resumable');
            delete g.budget.maxEnemies;
            return result;
        }''', budget)
        print(json.dumps(report), flush=True)
    page.screenshot(path='/tmp/samurai-chapter-complete-title.png')
    print(json.dumps({'pageErrors': errors}), flush=True)
    assert not errors
    browser.close()
