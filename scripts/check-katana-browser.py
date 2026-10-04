"""Render the equipped replacement blade in existing combat/held poses."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

output = Path(os.environ.get('KATANA_CAPTURE_DIR', '/tmp/samurai-katana'))
output.mkdir(parents=True, exist_ok=True)
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 960, 'height': 640}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(os.environ.get('GAME_URL', 'http://127.0.0.1:4173/') + '?q=low&dyn=0', wait_until='domcontentloaded')
    page.wait_for_function('window.app?.game?.state === "title"', timeout=240000)
    page.evaluate('app.stop()')
    page.get_by_role('button', name='はじめる', exact=True).click()
    page.wait_for_function('app.game.form.ready', timeout=90000)
    page.evaluate('''() => {
        const g=app.game,p=g.player;g.flow.update=()=>{};g.director.clear();g.magic.clear();
        g.flow._place(g.playerPosition.clone().set(0,0,124),0);p.setWeapon('katana');
        g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(.1);
        window.captureKatana=(mode,side=false)=>{
            g.input.reset();p.arts.cancel();p.revive();g.flow._place(g.playerPosition.clone().set(0,0,124),0);
            if(mode==='guard')g.input.press('guard');
            if(['inserting','sheathed'].includes(mode))p.arts.startSheath();
            if(mode==='charge'){g.input.press('attack');p.arts.charge();}
            app.simulate(mode==='inserting'?.4:1);
            if(mode==='draw'){g.input.press('attack');p.arts.charge();app.simulate(.5);g.input.release('attack');app.simulate(.2);}
            const model=g.weapons._slot().model, h=g.heroPresence, copy=h.katanaSheath.copy;
            if(!model.getObjectByName('Mythical_Katana_—_blade_only') && !model.children.some(n=>n.name.includes('Mythical')))
                throw Error('replacement blade not loaded');
            const held=['inserting','sheathed','charge'].includes(mode);
            if(model.visible===held||held&&!copy?.visible)throw Error('incorrect blade visibility '+mode);
            if(held&&(h.katanaSheath.length<.95||h.katanaSheath.length>.99||h.katanaSheath.width>.12))throw Error('incorrect sheath bounds');
            let meshes=0;model.traverse(n=>{if(n.isMesh&&n.name.startsWith('katana_blade')){meshes++;if(!n.material.map&&!n.material.name.startsWith('Scratched_Gold'))throw Error('missing texture '+n.material.name);}});
            if(meshes!==4)throw Error('cover leaked into hand');
            const c=app.rig.camera,at=p.character.position;
            c.position.set(at.x+(side?3.1:1.7),at.y+1.55,at.z+(side?.4:2.8));
            c.lookAt(at.x,at.y+1.08,at.z);c.fov=42;c.updateProjectionMatrix();
            app.scene.updateMatrixWorld(true);app.post.render();
            return {mode,side,meshes,length:h.katanaSheath.length,sourceVisible:model.visible,copyVisible:copy?.visible??false};
        };
    }''')
    reports=[]
    for mode, side in [('idle',False),('guard',False),('inserting',True),('sheathed',True),('charge',False),('draw',False)]:
        reports.append(page.evaluate('([m,s])=>captureKatana(m,s)', [mode, side]))
        page.screenshot(path=str(output / (mode+'.png')))
    print(json.dumps({'poses':reports,'pageErrors':errors}),flush=True)
    assert not errors
    browser.close()
