"""Holding iai must plant both feet; release must still play its attack."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/iai-planted');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);window.readFeet=()=>{const c=g.player.character;c.root.updateMatrixWorld(true);return ['Left','Right'].map(s=>c.getBone(s+'Foot').getWorldPosition(c.position.clone()).toArray());};}''')
 results=[]
 for variant in ['mythical','oni']:
  row=p.evaluate('''async id=>{const g=app.game,p=g.player;g.input.reset();p.arts.cancel();p.revive();await g.weapons.swords.select(id);p.setWeapon('katana');app.simulate(.3);p.arts.restPose.hold(0);app.simulate(.2);const baseline=readFeet(),standingHip=p.character.getBone('Hips').getWorldPosition(p.character.position.clone()).y;g.input.press('attack');p.arts.charge();const feet=[];for(let i=0;i<12;i++){app.simulate(.15);feet.push(readFeet());}return {baseline,feet,standingHip,chargedHip:p.character.getBone('Hips').getWorldPosition(p.character.position.clone()).y,ground:readFeet().map(v=>g.app.terrain.heightAt(v[0],v[2])),mode:p.arts.mode};}''',variant)
  assert row['mode']=='charge',row
  drift=max(sum((f[s][j]-row['feet'][3][s][j])**2 for j in range(3))**.5 for f in row['feet'][3:] for s in range(2))
  assert drift<.01,(variant,drift)
  assert row['chargedHip']<row['standingHip']-.08,row
  assert all(abs(row['feet'][-1][s][1]-row['ground'][s]-.08)<.06 for s in range(2)),row
  for angle in ['front','side']:
   p.evaluate('''angle=>{const at=app.game.player.character.position,c=app.rig.camera;c.position.set(at.x+(angle==='side'?3:0),at.y+1.6,at.z+(angle==='front'?3:0));c.lookAt(at.x,at.y+1.1,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();}''',angle)
   p.screenshot(path=str(out/f'{variant}-{angle}.png'))
  released=p.evaluate('''()=>{const g=app.game;g.input.release('attack');app.simulate(.12);const started=g.player.state==='attack'&&g.player.move===g.player.heavy;app.simulate(2.5);return {started,mode:g.player.arts.mode,state:g.player.state};}''')
  assert released['started'] and released['state']=='free',released
  # Guard must cancel a new held charge, without leaving its pose active.
  cancelled=p.evaluate('''()=>{const g=app.game;g.input.press('attack');g.player.arts.charge();app.simulate(.4);g.input.press('guard');app.simulate(.3);return {mode:g.player.arts.mode,guarding:g.player.guarding,pose:g.player.arts.pose.active,rest:g.player.arts.restPose.active};}''')
  assert cancelled=={'mode':'','guarding':True,'pose':False,'rest':False},cancelled
  results.append({'variant':variant,'footDrift':drift,'released':released,'cancelled':cancelled})
 assert not errors,errors
 (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps({'cases':results,'pageErrors':errors}));b.close()
