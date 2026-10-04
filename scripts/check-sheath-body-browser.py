"""Check the authored torso, planted legs and both released hands."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/sheath-body');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''async()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);await g.weapons.swords.select('mythical');g.player.setWeapon('katana');g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(.4);g.player.arts.restPose.hold(0);app.simulate(.25);g.player.arts.startSheath();window.readBody=()=>{const c=g.player.character;return {t:g.player.arts.t,pose:g.heroPresence.sheathBody.pose.slice(),bones:Object.fromEntries(['Hips','LeftFoot','RightFoot','LeftHand','RightHand','LeftArm','RightArm'].map(n=>[n,c.getBone(n).getWorldPosition(c.position.clone()).toArray()]))};};}''')
 rows=[]
 for i in range(160):
  rows.append(p.evaluate('()=>{app.simulate(1/60,1/60);return readBody();}'))
  if i in [0,20,44,56,100,138,151]:
   for angle in ['front','side']:
    p.evaluate('''angle=>{const at=app.game.player.character.position,c=app.rig.camera;c.position.set(at.x+(angle==='side'?3:0),at.y+1.6,at.z+(angle==='front'?3:0));c.lookAt(at.x,at.y+1.1,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();}''',angle)
    p.screenshot(path=str(out/f'{angle}-{i:03}.png'))
 # Changes in torso must not turn or translate the feet/hips.
 drift={n:max(sum((row['bones'][n][j]-rows[0]['bones'][n][j])**2 for j in range(3))**.5 for row in rows) for n in ['Hips','LeftFoot','RightFoot']}
 assert max(drift.values())<.005,drift
 assert max(abs(r['pose'][2]) for r in rows)>.1
 assert max(abs(v) for v in rows[-1]['pose'])<.001
 final=rows[-1]['bones']
 for side in ['Left','Right']:
  assert final[side+'Hand'][1]<final[side+'Arm'][1]-.3,final
 assert not errors,errors
 (out/'timeline.json').write_text(json.dumps(rows,indent=2));print(json.dumps({'plantedDrift':drift,'finalPose':rows[-1]['pose'],'pageErrors':errors}));b.close()
