"""Reference iai entry/recovery and readable timed blue-white draw effects."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/vergil-iai-result');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':960,'height':640});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');page.wait_for_function('window.app?.game?.state==="title"',timeout=240000);page.evaluate('app.stop()');page.get_by_role('button',name='はじめる',exact=True).click()
 page.evaluate('''()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);g.input.press('attack');g.player.arts.charge();app.simulate(.5);window.shot=()=>{const at=g.player.character.position,c=app.rig.camera;c.position.set(at.x+2.5,at.y+1.6,at.z+2.4);c.lookAt(at.x,at.y+.95,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();};shot();}''')
 page.screenshot(path=str(out/'stance.png'));page.evaluate("()=>{app.game.input.release('attack');app.simulate(1/60);}")
 rows=[]
 for index,target in enumerate([.06,.2,.4,.65,.82,.94]):
  row=page.evaluate('''target=>{const g=app.game,p=g.player;for(let i=0;i<300&&p.move===p.heavy&&p.move.phase<target;i++)app.simulate(1/120,1/120);shot();const c=p.character,h=g.heroPresence,blade=h.katanaSheath.copy?.visible?h.katanaSheath.copy:g.weapons.blade(),grip=c.position.clone().set(0,0,-.1);blade.localToWorld(grip);const hand=c.getBone('RightHand').getWorldPosition(c.position.clone()),u=g.fx.trail.material.uniforms;const shoulder=c.getBone('RightArm').getWorldPosition(c.position.clone()),elbow=c.getBone('RightForeArm').getWorldPosition(c.position.clone()),left=c.getBone('LeftHand').getWorldPosition(c.position.clone());return {rightReachRatio:shoulder.distanceTo(hand)/(shoulder.distanceTo(elbow)+elbow.distanceTo(hand)),leftGap:left.distanceTo(h.sheath.position),phase:p.move?.phase,state:p.state,gap:grip.distanceTo(hand),color:u.uColor.value.getHexString(),strength:u.uStrength.value,flash:!!g.fx._iaiDraw};}''',target)
  rows.append(row);page.screenshot(path=str(out/f'{index:02}.png'))
 assert all(r['gap']<.01 and r['rightReachRatio']<1.001 for r in rows),rows
 assert all(r['leftGap']<.005 for r in rows if .3<r['phase']<.72),rows
 assert rows[2]['color']=='769fff' and rows[2]['strength']>0 and rows[2]['flash'],rows
 page.evaluate('app.simulate(2)');assert page.evaluate('app.game.player.state')=='free'
 assert page.evaluate('app.game.fx.trail.material.uniforms.uColor.value.getHexString()')=='ffb36a'
 assert not errors,errors
 (out/'results.json').write_text(json.dumps(rows,indent=2));print(json.dumps({'frames':rows,'errors':errors}));b.close()
