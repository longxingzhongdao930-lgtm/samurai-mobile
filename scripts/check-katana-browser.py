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
            let covers=0;h.sheath.traverse(n=>{if(n.isMesh)covers++;});if(covers!==2)throw Error('native scabbard missing');
            let meshes=0;model.traverse(n=>{if(n.isMesh&&n.name.startsWith('katana_blade')){meshes++;if(!n.material.map&&!n.material.name.startsWith('Scratched_Gold'))throw Error('missing texture '+n.material.name);}});
            if(meshes!==4)throw Error('cover leaked into hand');
            const c=app.rig.camera,at=p.character.position;
            c.position.set(at.x+(side?3.1:1.7),at.y+1.55,at.z+(side?.4:2.8));
            c.lookAt(at.x,at.y+1.08,at.z);c.fov=42;c.updateProjectionMatrix();
            app.scene.updateMatrixWorld(true);app.post.render();
            const leftGap=held?p.character.getBone('LeftHand').getWorldPosition(h.sheath.position.clone()).distanceTo(h.sheath.position):null;
            if(['sheathed','charge'].includes(mode)&&leftGap>.12)throw Error('left hand floats from scabbard '+leftGap);
            return {mode,side,meshes,covers,leftGap,length:h.katanaSheath.length,sourceVisible:model.visible,copyVisible:copy?.visible??false};
        };
    }''')
    reports=[]
    for mode, side in [('idle',False),('guard',False),('inserting',True),('sheathed',True),('charge',False),('draw',False)]:
        reports.append(page.evaluate('([m,s])=>captureKatana(m,s)', [mode, side]))
        page.screenshot(path=str(output / (mode+'.png')))
    timeline = page.evaluate("""() => {
        const g=app.game,p=g.player,h=g.heroPresence;
        g.input.reset();p.arts.cancel();p.revive();p.arts.startSheath();
        const rows=[];
        for(let i=0;i<120;i++){
            app.simulate(1/60,1/60);app.scene.updateMatrixWorld(true);
            const mouth=h.sheath.position.clone();
            const left=p.character.getBone('LeftHand').getWorldPosition(mouth.clone());
            const right=p.character.getBone('RightHand').getWorldPosition(mouth.clone());
            const copy=h.katanaSheath.copy;
            const grip=mouth.clone().set(0,0,-.1).applyQuaternion(copy.quaternion).add(copy.position);
            rows.push({t:(i+1)/60,mode:p.arts.mode,leftGap:left.distanceTo(mouth),rightGap:right.distanceTo(grip),
                left:left.toArray(),right:right.toArray(),mouth:mouth.toArray(),guard:copy.position.toArray()});
        }
        return rows;
    }""")
    (output/'timeline.json').write_text(json.dumps(timeline,indent=2))
    settled=[r for r in timeline if r['t']>1]
    assert max(r['leftGap'] for r in settled)<.005, 'settled left-hand contact'
    assert max(r['rightGap'] for r in settled)<.005, 'settled right-hand contact'
    if os.environ.get('KATANA_RECORD') == '1':
        frames=output/'frames';frames.mkdir(exist_ok=True)
        page.evaluate("() => {const g=app.game;g.input.reset();g.player.arts.cancel();g.player.arts.startSheath();}")
        for frame in range(60):
            page.evaluate("() => {app.simulate(1/30,1/60);app.scene.updateMatrixWorld(true);app.post.render();}")
            page.screenshot(path=str(frames/f'{frame:03d}.png'))
    print(json.dumps({'poses':reports,'pageErrors':errors}),flush=True)
    assert not errors
    browser.close()
