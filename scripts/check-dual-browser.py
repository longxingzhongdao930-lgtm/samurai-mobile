import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(os.environ.get('DUAL_CAPTURE_DIR','/tmp/samurai-dual'));out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']);p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''async()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();await g.weapons.swords.select('dual');g.player.setWeapon('katana');g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(.3);window.dualShot=()=>{const at=g.player.character.position,c=app.rig.camera;c.position.set(at.x+2.8,at.y+1.65,at.z+2.2);c.lookAt(at.x,at.y+1.15,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render()}}''')
 p.evaluate('()=>{const g=app.game,d=g.heroPresence.dualKatana,right=g.weapons.blade().getWorldScale(d.left.position.clone()).x,left=d.left.getWorldScale(d.left.position.clone()).x;if(Math.abs(left/right-1)>.001)throw Error("left blade scale differs from right");dualShot();}')
 p.screenshot(path=str(out/'idle.png'))
 rows=p.evaluate('''()=>{const g=app.game,p=g.player,d=g.heroPresence.dualKatana;g.input.reset();p.arts.startSheath();let rows=[];for(let i=0;i<90;i++){app.simulate(1/60,1/60);app.scene.updateMatrixWorld(true);rows.push({t:(i+1)/60,mode:p.arts.mode,hands:d.rigs.map((rig,index)=>{const hand=p.character.getBone(index?'RightHand':'LeftHand').getWorldPosition(rig.copy.position.clone());const grip=rig.copy.position.clone().add(rig.copy.position.clone().set(0,0,-.1).applyQuaternion(rig.copy.quaternion));return {gap:grip.distanceTo(hand),guard:rig.copy.position.distanceTo(rig.presence.sheath.position)}})});}return rows;}''')
 (out/'timeline.json').write_text(json.dumps(rows,indent=2));assert max(h['gap'] for r in rows for h in r['hands'])<.005
 assert rows[44]['hands'][0]['guard']<.005 and rows[44]['hands'][1]['guard']>.1, 'left sword seats before right'
 assert max(h['guard'] for h in rows[-1]['hands'])<.005, 'both guards meet the mouths'
 p.evaluate('dualShot()');p.screenshot(path=str(out/'sheathed.png'))
 enclosure=p.evaluate("""()=>{const h=app.game.heroPresence,ray=new app.characterScreen.raycaster.constructor();return h.dualKatana.rigs.map(rig=>{let tested=0,outside=0;const cover=rig.presence.sheath,materials=new Map();cover.traverse(n=>{for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(m&&!materials.has(m)){materials.set(m,m.side);m.side=2;}});try{rig.copy.traverse(n=>{const a=n.geometry?.attributes.position;if(!a)return;for(let i=0;i<a.count;i++){const vertex=rig.copy.position.clone().fromBufferAttribute(a,i);if(vertex.z<.02)continue;const world=vertex.applyMatrix4(n.matrixWorld),local=cover.worldToLocal(world.clone());if(local.z<.02)continue;tested++;for(const direction of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]){ray.set(world,world.clone().set(...direction).transformDirection(cover.matrixWorld));if(!ray.intersectObject(cover,true).length){outside++;break;}}}});}finally{for(const [m,side]of materials)m.side=side;}return {tested,outside};});}""")
 (out/'enclosure.json').write_text(json.dumps(enclosure,indent=2));assert all(r['tested']>0 and r['outside']==0 for r in enclosure), 'both swords fit their scabbards'

 p.evaluate('()=>{const g=app.game;g.input.press("attack");g.player.arts.charge();app.simulate(.4);g.input.release("attack");app.simulate(.08);dualShot()}');p.screenshot(path=str(out/'draw-left.png'))
 first_draw=p.evaluate('()=>app.game.heroPresence.dualKatana.rigs.map(r=>r.copy.position.distanceTo(r.presence.sheath.position))')
 assert first_draw[0]>.05 and first_draw[1]<.005, 'left draw begins while right blade remains seated'
 p.evaluate('app.simulate(.18);dualShot()');p.screenshot(path=str(out/'draw-right.png'))
 p.evaluate('()=>{const g=app.game;g.player.arts.cancel();g.player.revive();g.input.reset();g.input.press("guard");app.simulate(.4);dualShot()}');p.screenshot(path=str(out/'guard.png'))
 p.evaluate('()=>{const g=app.game;g.input.reset();g.player.arts.cancel();g.player.setWeapon("gauntlet");app.simulate(.1);if(g.heroPresence.dualKatana.left)throw Error("left blade leaked after weapon switch");g.player.setWeapon("katana");app.simulate(.3);if(!g.heroPresence.dualKatana.left)throw Error("left blade missing after return");}')
 if os.environ.get('DUAL_RECORD')=='1':
  frames=out/'frames';frames.mkdir(exist_ok=True)
  p.evaluate('()=>{const g=app.game;g.input.reset();g.player.arts.cancel();g.player.revive();g.player.arts.startSheath();}')
  for frame in range(84):
   p.evaluate('()=>{app.simulate(1/30,1/60);dualShot()}')
   if frame==40:p.evaluate('()=>{const g=app.game;g.input.press("attack");g.player.arts.charge();}')
   if frame==52:p.evaluate('app.game.input.release("attack")')
   p.screenshot(path=str(frames/f'{frame:03d}.png'))
 assert not errors;print(json.dumps({'maxGripGap':max(h['gap'] for r in rows for h in r['hands']),'errors':errors}));b.close()
