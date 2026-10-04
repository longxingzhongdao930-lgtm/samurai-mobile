"""Exercise sheathed tap, held iai, release, guard cancellation and clean recovery."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/imported-attacks');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''async()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);await g.weapons.swords.select('mythical');g.hud.setVisible(false);g.touch.setVisible(false);g.player.invulnerable=999;window.cleanAttack=()=>{g.input.reset();g.player.arts.cancel();g.player.revive();g.player.setWeapon('katana');app.simulate(.3);g.player.arts.startSheath();app.simulate(2);};window.captureAttack=()=>{const at=g.player.character.position,c=app.rig.camera;c.position.set(at.x+2,at.y+1.5,at.z+3);c.lookAt(at.x,at.y+1,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();};cleanAttack();}''')
 result={}
 result['quick']=p.evaluate('''()=>{const g=app.game,p=g.player;g.input.press('attack');app.simulate(.05);g.input.release('attack');app.simulate(.03);return {move:p.move?.config.id,source:p.move?.config.referenceMotion,mode:p.arts.mode};}''')
 assert result['quick']['move']=='quickDraw' and result['quick']['source']=='quick-slash',result
 result['hold']=p.evaluate('''()=>{const g=app.game,p=g.player,m=p.quickDraw,data=p.character.clips.get('quick-slash').userData;app.simulate(Math.max(0,data.holdStart+.02-m.action.time));const arm=p.character.getBone('RightArm'),hand=p.character.getBone('RightHand'),q=arm.quaternion.clone(),at=hand.getWorldPosition(p.character.position.clone());app.simulate(.05);return {angle:q.angleTo(arm.quaternion),handHeight:at.y-arm.getWorldPosition(p.character.position.clone()).y,trail:g.fx.trail.active};}''')
 assert result['hold']['angle']<.001 and result['hold']['handHeight']>0 and result['hold']['trail']==False,result
 p.evaluate('captureAttack()');p.screenshot(path=str(out/'quick-hit.png'))
 result['directSheath']=p.evaluate('''()=>{app.simulate(.12);return app.game.player.arts.mode;}''')
 assert result['directSheath']=='sheath',result
 p.evaluate('app.simulate(1.4);cleanAttack();app.game.input.press("attack");app.simulate(.7);captureAttack()');p.screenshot(path=str(out/'charge.png'))
 result['charge']=p.evaluate('({mode:app.game.player.arts.mode,ring:app.game.heroPresence.chargeRing.visible,state:app.game.player.state})')
 assert result['charge']['mode']=='charge' and result['charge']['ring']
 result['heavy']=p.evaluate('''()=>{app.game.input.release('attack');app.simulate(.03);const p=app.game.player;return {move:p.move?.config.id,source:p.move?.config.referenceMotion};}''')
 assert result['heavy']['source']=='heavenly-strike-2',result
 for t,name in [(.18,'heavenly-windup'),(.12,'heavenly-hit'),(.26,'heavenly-follow')]:
  p.evaluate('t=>{app.simulate(t);captureAttack();}',t);p.screenshot(path=str(out/(name+'.png')))
 result['recovery']=p.evaluate('''()=>{app.simulate(2);const g=app.game;return {state:g.player.state,chargeVisible:g.heroPresence.chargeRing.visible,finite:[...new Set(g.player.character.bones.values())].every(b=>b.quaternion.toArray().every(Number.isFinite))};}''')
 assert result['recovery']=={'state':'free','chargeVisible':False,'finite':True},result
 result['guard']=p.evaluate('''()=>{cleanAttack();app.game.input.press('attack');app.simulate(.5);app.game.input.press('guard');app.simulate(.3);return {mode:app.game.player.arts.mode,ring:app.game.heroPresence.chargeRing.visible,guarding:app.game.player.guarding};}''')
 assert result['guard']=={'mode':'','ring':False,'guarding':True},result
 result['damage']=p.evaluate("""()=>{const g=app.game,p=g.player;g.input.reset();cleanAttack();const a=g.director.spawn('infinian',p.character.position.x,p.character.position.z+1.9,Math.PI);a.hp=a.maxHp=10000;a.maxPosture=10000;a.cooldown=999;a.update=()=>{};p.lockTarget=a.enemy;const before=a.hp;g.input.press('attack');app.simulate(.05);g.input.release('attack');app.simulate(1);const quick=before-a.hp;cleanAttack();p.lockTarget=a.enemy;g.input.press('attack');app.simulate(.6);const hp=a.hp;g.input.release('attack');app.simulate(1.3);return {quick,heavy:hp-a.hp};}""")
 assert result['damage']['quick']>0 and result['damage']['heavy']>0,result
 assert not errors,errors
 result['errors']=errors;(out/'results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));b.close()
