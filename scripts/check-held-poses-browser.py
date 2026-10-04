"""Measure held guard/sheath/iai poses in the built game, including real bones."""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
        headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    )
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('GAME_URL', 'http://127.0.0.1:4173/') + '?q=low&dyn=0', wait_until='domcontentloaded')
    page.wait_for_function('window.app?.game?.state === "title"', timeout=240000)
    page.get_by_role('button', name='はじめる', exact=True).click()
    page.wait_for_function('app.game.form.ready', timeout=90000)
    print(page.evaluate('''() => {
        app.stop();
        const g = app.game, p = g.player;
        g.flow.update = () => {};
        g.director.clear(); g.magic.clear();
        g.flow._place(g.playerPosition.clone().set(0, 0, 124), 0);
        p.setWeapon('katana');
        const names = ['Head', 'Spine2', 'RightArm', 'LeftArm', 'RightForeArm', 'RightUpLeg', 'RightLeg', 'LeftLeg'];
        const results = {};
        for (const mode of ['guard', 'sheath', 'charge']) {
            g.input.reset(); p.arts.cancel(); p.guardPose.cancel(); p.guarding = false;
            if (mode === 'guard') g.input.press('guard');
            else if (mode === 'sheath') p.arts.startSheath();
            else { g.input.press('attack'); p.arts.charge(); }
            app.simulate(2);
            let previous;
            const max = {};
            for (let frame = 0; frame < 60; frame++) {
                app.simulate(1 / 60);
                const row = Object.fromEntries(names.map(name => [name, p.character.getBone(name).quaternion.clone().normalize()]));
                if (previous) for (const name of names) {
                    const angle = row[name].angleTo(previous[name]);
                    max[name] = Math.max(max[name] || 0, angle);
                    if (angle > .002) throw Error(`${mode} jitter in ${name}: ${angle}`);
                }
                previous = row;
                const layer = mode === 'guard' ? p.guardPose : p.arts.pose;
                if (layer.weight !== 1) throw Error(`${mode} lost held weight: ${layer.weight}`);
            }
            results[mode] = max;
        }
        return results;
    }'''), flush=True)
    assert not errors, errors
    browser.close()
