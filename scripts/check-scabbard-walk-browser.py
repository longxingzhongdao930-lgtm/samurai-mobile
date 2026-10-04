"""Start sheathed; walk with left-hand scabbard contact, then draw and cancel."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/scabbard-walk');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 assert p.evaluate('app.game.player.arts.mode')=='sheathed'
 p.evaluate('''()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(.5);}''')
 p.keyboard.down('w')
 rows=p.evaluate('''()=>{const g=app.game,c=g.player.character,start=c.position.clone(),rows=[];for(let i=0;i<24;i++){app.simulate(.05);c.root.updateMatrixWorld(true);const hand=c.getBone('LeftHand').getWorldPosition(c.position.clone()),h=g.heroPresence;const shoulder=c.getBone('LeftArm').getWorldPosition(c.position.clone()),elbow=c.getBone('LeftForeArm').getWorldPosition(c.position.clone()),reach=shoulder.distanceTo(elbow)+elbow.distanceTo(hand);const lateral=c.position.clone().set(Math.cos(c.facing),0,-Math.sin(c.facing)),outward=lateral.multiplyScalar(Math.sign(shoulder.clone().sub(c.position).dot(lateral))||1),axis=c.position.clone().set(0,0,1).applyQuaternion(h.sheath.quaternion),clearance=Math.min(...[0,.3,.6,.9].map(t=>h.sheath.position.clone().addScaledVector(axis,t).sub(c.position).dot(outward)));const forearmClearance=Math.min(...[0,.06,.12,.18,.24,.48,.60,.72].map(t=>{const at=h.sheath.position.clone().addScaledVector(axis,t),delta=hand.clone().sub(elbow),u=Math.max(0,Math.min(1,at.clone().sub(elbow).dot(delta)/delta.lengthSq()));return at.distanceTo(elbow.clone().addScaledVector(delta,u));}));rows.push({forearmClearance,clearance,reachRatio:shoulder.distanceTo(hand)/reach,gap:hand.distanceTo(h.sheath.position.clone().addScaledVector(axis,h.katanaSheath.carryGripDepth??0)),tilt:Math.acos(-axis.y),mouth:h.sheath.position.toArray(),feet:['Left','Right'].map(s=>c.getBone(s+'Foot').getWorldPosition(c.position.clone()).toArray()),mode:g.player.arts.mode,rest:g.player.arts.restPose.active,carry:h.katanaSheath.carryWeight});}return {rows,distance:start.distanceTo(c.position)};}''')
 assert rows['distance']>.5,rows
 assert all(r['mode']=='sheathed' and not r['rest'] and r['gap']<.015 for r in rows['rows']),rows
 assert all(r['forearmClearance']>.065 and r['clearance']>.20 and .98<r['reachRatio']<1 and .5<r['tilt']<.85 for r in rows['rows']),rows
 assert max(r['feet'][0][1] for r in rows['rows'])-min(r['feet'][0][1] for r in rows['rows'])>.025,rows
 p.evaluate('''()=>{const at=app.game.player.character.position,c=app.rig.camera;c.position.set(at.x,at.y+1.5,at.z+3.5);c.lookAt(at.x,at.y+1,at.z);app.scene.updateMatrixWorld(true);app.post.render();}''');p.screenshot(path=str(out/'walking-front.png'))
 p.keyboard.up('w');p.evaluate('app.simulate(.3)');p.keyboard.down('j');p.evaluate('app.simulate(.4)');assert p.evaluate('app.game.player.arts.mode')=='charge'
 p.keyboard.up('j');p.evaluate('app.simulate(.1)');assert p.evaluate('app.game.player.state')=='attack'
 p.evaluate('app.simulate(2)');p.keyboard.press('Shift');p.evaluate('app.simulate(.03)');assert p.evaluate('app.game.player.state')=='dodge'
 page_rest=p.evaluate("""()=>{const g=app.game,p=g.player,c=p.character;g.input.reset();app.simulate(1);p.arts.startSheath();app.simulate(3);const rows=[];for(let i=0;i<30;i++){app.simulate(.2);const chest=c.getBone('Spine2').getWorldQuaternion(c.root.quaternion.clone()).toArray(),arms=['Left','Right'].map(s=>{const a=c.getBone(s+'Arm').getWorldPosition(c.position.clone()),e=c.getBone(s+'ForeArm').getWorldPosition(c.position.clone()),h=c.getBone(s+'Hand').getWorldPosition(c.position.clone());return {drop:a.y-h.y,reach:a.distanceTo(h)/(a.distanceTo(e)+e.distanceTo(h))};});rows.push({chest,arms});}return rows;}""")
 assert all(a['drop']>.3 and a['reach']>.98 and a['reach']<1 for r in page_rest for a in r['arms']),page_rest
 assert max(sum((r['chest'][i]-page_rest[0]['chest'][i])**2 for i in range(4))**.5 for r in page_rest)>.001,page_rest
 assert not errors,errors
 print(json.dumps({'distance':rows['distance'],'maxContactGap':max(r['gap'] for r in rows['rows']),'minBodyClearance':min(r['clearance'] for r in rows['rows']),'minForearmClearance':min(r['forearmClearance'] for r in rows['rows']),'maxArmReachRatio':max(r['reachRatio'] for r in rows['rows']),'errors':errors}));b.close()
