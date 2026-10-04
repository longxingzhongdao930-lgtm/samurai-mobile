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
    variant=os.environ.get('KATANA_VARIANT','mythical')
    page.evaluate('async id=>{if(!await app.game.weapons.swords.select(id)||app.game.weapons.swords.id!==id)throw Error("wrong sword selection");}',variant)
    page.evaluate('''() => {
        const g=app.game,p=g.player;g.flow.update=()=>{};g.director.clear();g.magic.clear();
        g.flow._place(g.playerPosition.clone().set(0,0,124),0);p.setWeapon('katana');
        g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(.1);
        window.captureKatana=(mode,side=false)=>{
            g.input.reset();p.arts.cancel();p.revive();g.flow._place(g.playerPosition.clone().set(0,0,124),0);
            if(mode==='guard')g.input.press('guard');
            if(['inserting','sheathed'].includes(mode))p.arts.startSheath();
            if(mode==='charge'){g.input.press('attack');p.arts.charge();}
            app.simulate(mode==='inserting'?1.5:mode==='sheathed'?3:1);
            if(mode==='draw'){g.input.press('attack');p.arts.charge();app.simulate(.5);g.input.release('attack');app.simulate(.2);}
            const model=g.weapons.blade(), h=g.heroPresence, copy=h.katanaSheath.copy;
            const held=['inserting','sheathed','charge'].includes(mode);
            if(model.visible===held||held&&!copy?.visible)throw Error('incorrect blade visibility '+mode);
            let covers=0;h.sheath.traverse(n=>{if(n.isMesh)covers++;});if(!covers)throw Error('native scabbard missing');
            let meshes=0;model.traverse(n=>{if(n.isMesh)meshes++;});if(!meshes)throw Error('blade missing');
            const c=app.rig.camera,at=p.character.position;
            c.position.set(at.x+(side?3.1:1.7),at.y+1.55,at.z+(side?.4:2.8));
            c.lookAt(at.x,at.y+1.08,at.z);c.fov=42;c.updateProjectionMatrix();
            app.scene.updateMatrixWorld(true);app.post.render();
            const leftGap=held?p.character.getBone('LeftHand').getWorldPosition(h.sheath.position.clone()).distanceTo(h.sheath.position):null;
            if(['sheathed','charge'].includes(mode)&&leftGap>.12)throw Error('left hand floats from scabbard '+leftGap);
            return {mode,side,meshes,covers,leftGap,length:h.katanaSheath.length,sourceVisible:model.visible,copyVisible:copy?.visible??false};
        };
    }''')
    if os.environ.get('KATANA_PERSIST_ONLY') == '1':
        page.evaluate('()=>app.game.heroStudio.menu(()=>{})')
        page.get_by_label('刀装',exact=True).select_option(variant)
        page.wait_for_function('id=>app.game.heroStudio.sword===id',arg=variant)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('id=>window.app?.game?.state==="title" && app.game.weapons.swords.id===id',arg=variant,timeout=240000)
        page.evaluate('app.stop()')
        assert not errors
        print(json.dumps({'restoredSword':variant,'pageErrors':errors}),flush=True)
        browser.close()
        raise SystemExit(0)
    reports=[]
    for mode, side in [('idle',False),('guard',False),('inserting',True),('sheathed',True),('charge',False),('draw',False)]:
        reports.append(page.evaluate('([m,s])=>captureKatana(m,s)', [mode, side]))
        page.screenshot(path=str(output / (mode+'.png')))
    timeline = page.evaluate("""() => {
        const g=app.game,p=g.player,h=g.heroPresence;
        g.input.reset();p.arts.cancel();p.revive();p.arts.startSheath();
        const rows=[];
        for(let i=0;i<180;i++){
            app.simulate(1/60,1/60);app.scene.updateMatrixWorld(true);
            const mouth=h.sheath.position.clone();
            const left=p.character.getBone('LeftHand').getWorldPosition(mouth.clone());
            const right=p.character.getBone('RightHand').getWorldPosition(mouth.clone());
            const copy=h.katanaSheath.copy;
            const grip=mouth.clone().set(0,0,-.1).applyQuaternion(copy.quaternion).add(copy.position);
            rows.push({gripping:h.katanaSheath.gripping!==false,t:(i+1)/60,mode:p.arts.mode,leftGap:left.distanceTo(mouth),rightGap:right.distanceTo(grip),
                left:left.toArray(),right:right.toArray(),mouth:mouth.toArray(),guard:copy.position.toArray(),
                mouthAxisGap:mouth.clone().sub(copy.position).cross(grip.clone().set(0,0,1).applyQuaternion(copy.quaternion)).length(),
                axisAngle:copy.quaternion.angleTo(h.sheath.quaternion),
                wristAngle:copy.quaternion.angleTo((g.weapons.blade?.()??g.weapons._slot().model).getWorldQuaternion(copy.quaternion.clone()))});
        }
        return rows;
    }""")
    (output/'timeline.json').write_text(json.dumps(timeline,indent=2))
    settled=[r for r in timeline if r['t']>1]
    assert max(r['leftGap'] for r in settled)<.005, 'settled left-hand contact'
    assert max(r['rightGap'] for r in timeline if r['gripping'])<.005, 'right hand keeps its grip throughout insertion'
    aligned=[r for r in timeline if r['t']>=.95 and r['gripping']]
    # Curved insertion intentionally turns the blade relative to the mouth axis.
    assert max(r['axisAngle'] for r in aligned)<.2, 'curved insertion stays within a modest angle'
    assert max(r['wristAngle'] for r in aligned)<.005, 'wrist follows the mounted blade orientation'
    transitions=page.evaluate("""() => {
        const g=app.game,p=g.player,h=g.heroPresence,results=[];
        for(const action of ['guard','draw','flourish','dodge','weapon','hurt']) {
            g.input.reset();p.arts.cancel();p.revive();p.setWeapon('katana');p.arts.startSheath();app.simulate(.35);
            if(action==='guard')g.input.press('guard');
            if(action==='dodge')g.input.press('dodge');
            if(action==='weapon')p.setWeapon('gauntlet');
            if(action==='hurt'){p.state='hurt';p.arts.cancel();}
            if(action==='draw'){g.input.press('attack');p.arts.charge();app.simulate(.4);g.input.release('attack');}
            if(action==='flourish')p.arts.startSheath(true);
            let maxStep=0,previous=null;
            for(let i=0;i<240;i++) {
                app.simulate(1/60,1/60);app.scene.updateMatrixWorld(true);
                const bone=p.character.getBone('RightHand'),at=bone.getWorldPosition(h.sheath.position.clone());
                if(!at.toArray().every(Number.isFinite))throw Error('nonfinite hand '+action);
                if(previous&&i>225)maxStep=Math.max(maxStep,at.distanceTo(previous));previous=at;
            }
            results.push({action,maxSettledHandStep:maxStep,mode:p.arts.mode,guard:p.guarding});
        }
        return results;
    }""")
    (output/'transitions.json').write_text(json.dumps(transitions,indent=2))
    draw_grip=page.evaluate("""() => {
        const g=app.game,p=g.player,h=g.heroPresence;
        g.input.reset();p.arts.cancel();p.revive();p.setWeapon('katana');
        g.input.press('attack');p.arts.charge();app.simulate(.4);g.input.release('attack');
        const rows=[];
        for(let i=0;i<20;i++){
            app.simulate(1/60,1/60);app.scene.updateMatrixWorld(true);
            const source=g.weapons.blade?.()??g.weapons._slot().model;
            const visible=h.katanaSheath.copy?.visible?h.katanaSheath.copy:source;
            const grip=visible.localToWorld(visible.position.clone().set(0,0,-.1));
            const hand=p.character.getBone('RightHand').getWorldPosition(grip.clone());
            rows.push({t:(i+1)/60,gap:grip.distanceTo(hand),copyVisible:h.katanaSheath.copy?.visible,wristAngle:visible.getWorldQuaternion(visible.quaternion.clone()).angleTo(source.getWorldQuaternion(source.quaternion.clone()))});
        }
        return rows;
    }""")
    (output/'draw-grip.json').write_text(json.dumps(draw_grip,indent=2))
    assert max(r['gap'] for r in draw_grip)<.005, 'grip contact throughout draw display handover'
    assert max(r['wristAngle'] for r in draw_grip)<.005, 'wrist orientation throughout draw display handover'
    enclosure=page.evaluate("""() => {
        const g=app.game,p=g.player,h=g.heroPresence;
        g.input.reset();p.arts.cancel();p.revive();p.setWeapon('katana');p.arts.startSheath();
        const ray=new app.characterScreen.raycaster.constructor();
        const materials=new Map();h.sheath.traverse(n=>{for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(m&&!materials.has(m)){materials.set(m,m.side);m.side=2;}});
        const rows=[];let previous=0;
        try {
            for(const t of [1,1.25,1.5,1.8,2.15,2.6]) {
                app.simulate(t-previous,1/60);previous=t;app.scene.updateMatrixWorld(true);
                const copy=h.katanaSheath.copy;let tested=0,outside=0;const examples=[];
                copy.traverse(node=>{
                    const attr=node.geometry?.attributes.position;if(!attr)return;
                    for(let i=0;i<attr.count;i++){
                        const vertex=copy.position.clone().fromBufferAttribute(attr,i);if(vertex.z<=.02)continue;
                        const world=vertex.applyMatrix4(node.matrixWorld),local=h.sheath.worldToLocal(world.clone());
                        if(local.z<.02)continue;tested++;
                        let enclosed=true;
                        for(const a of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]){
                            ray.set(world,world.clone().set(...a).transformDirection(h.sheath.matrixWorld));
                            if(!ray.intersectObject(h.sheath,true).length){enclosed=false;break;}
                        }
                        if(!enclosed){outside++;if(examples.length<3)examples.push(local.toArray());}
                    }
                });
                rows.push({t,tested,outside,examples});
            }
        } finally {for(const [m,side] of materials)m.side=side;}
        return rows;
    }""")
    (output/'enclosure.json').write_text(json.dumps(enclosure,indent=2))
    assert all(r['tested']>0 and r['outside']==0 for r in enclosure), 'native scabbard encloses the inserted blade'
    low_fps=page.evaluate("""() => {
        const g=app.game,p=g.player,h=g.heroPresence;
        g.input.reset();p.arts.cancel();p.revive();p.setWeapon('katana');p.arts.startSheath();
        let maxGap=0,maxAxisGap=0;
        for(let i=0;i<90;i++){
            app.simulate(1/30,1/30);app.scene.updateMatrixWorld(true);
            const copy=h.katanaSheath.copy,hand=p.character.getBone('RightHand').getWorldPosition(copy.position.clone());
            const grip=copy.position.clone().set(0,0,-.1).applyQuaternion(copy.quaternion).add(copy.position);
            if(h.katanaSheath.gripping!==false)maxGap=Math.max(maxGap,hand.distanceTo(grip));
            if(p.arts.t>=h.katanaSheath.reference.align&&h.katanaSheath.gripping!==false){const axis=grip.clone().set(0,0,1).applyQuaternion(copy.quaternion);maxAxisGap=Math.max(maxAxisGap,h.sheath.position.clone().sub(copy.position).cross(axis).length());}
        }
        if(maxGap>.005)throw Error('30fps contact regression');
        return {fps:30,maxGap,maxAxisGap,mode:p.arts.mode};
    }""")
    (output/'low-fps.json').write_text(json.dumps(low_fps,indent=2))
    if os.environ.get('KATANA_RECORD') == '1':
        frames=output/'frames';frames.mkdir(exist_ok=True)
        page.evaluate("flourish => {const g=app.game;g.input.reset();g.player.arts.cancel();g.player.arts.startSheath(flourish);}", os.environ.get('KATANA_MODE') == 'flourish')
        for frame in range(int(os.environ.get('KATANA_RECORD_FRAMES', '60'))):
            page.evaluate("() => {app.simulate(1/30,1/60);const at=app.game.player.character.position,c=app.rig.camera;c.position.set(at.x+3.1,at.y+1.55,at.z+.4);c.lookAt(at.x,at.y+1.08,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();}")
            page.screenshot(path=str(frames/f'{frame:03d}.png'))
    if os.environ.get('KATANA_PERSIST') == '1':
        page.evaluate('()=>app.game.heroStudio.menu(()=>{})')
        page.get_by_label('刀装',exact=True).select_option(variant)
        page.wait_for_function('id=>app.game.heroStudio.sword===id',arg=variant)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('id=>app?.game?.state==="title" && app.game.weapons.swords.id===id',arg=variant,timeout=240000)
        page.evaluate('app.stop()')
    print(json.dumps({'poses':reports,'transitions':transitions,'lowFps':low_fps,'enclosure':enclosure,'pageErrors':errors}),flush=True)
    assert not errors
    browser.close()
