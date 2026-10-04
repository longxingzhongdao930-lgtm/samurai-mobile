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
 p.evaluate("""window.dualEnclosure=()=>{app.scene.updateMatrixWorld(true);const h=app.game.heroPresence,ray=new app.characterScreen.raycaster.constructor();return h.dualKatana.rigs.map(rig=>{let tested=0,outside=0,crossings=0;const cover=rig.presence.sheath,materials=new Map();cover.traverse(n=>{for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(m&&!materials.has(m)){materials.set(m,m.side);m.side=2;}});try{rig.copy.traverse(n=>{const attr=n.geometry?.attributes.position,index=n.geometry?.index;if(!attr||!index)return;const edges=new Set();for(let i=0;i<index.count;i+=3){for(const [a,b]of [[index.getX(i),index.getX(i+1)],[index.getX(i+1),index.getX(i+2)],[index.getX(i+2),index.getX(i)]]){const key=Math.min(a,b)+':'+Math.max(a,b);if(edges.has(key))continue;edges.add(key);const va=rig.copy.position.clone().fromBufferAttribute(attr,a),vb=va.clone().fromBufferAttribute(attr,b);if(va.z<.02||vb.z<.02)continue;va.applyMatrix4(n.matrixWorld);vb.applyMatrix4(n.matrixWorld);const direction=vb.clone().sub(va),length=direction.length();if(length<1e-6)continue;ray.set(va,direction.normalize());const hits=ray.intersectObject(cover,true);const inside=point=>[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]].every(axis=>{const probe=new app.characterScreen.raycaster.constructor();probe.set(point,point.clone().set(...axis).transformDirection(cover.matrixWorld));return probe.intersectObject(cover,true).length>0;});if(hits.some(hit=>hit.distance>1e-5&&hit.distance<length-1e-5&&cover.worldToLocal(hit.point.clone()).z>.02&&inside(hit.point.clone().addScaledVector(direction,-.001))!==inside(hit.point.clone().addScaledVector(direction,.001))))crossings++;}}});rig.copy.traverse(n=>{const a=n.geometry?.attributes.position;if(!a)return;for(let i=0;i<a.count;i++){const vertex=rig.copy.position.clone().fromBufferAttribute(a,i);if(vertex.z<.02)continue;const world=vertex.applyMatrix4(n.matrixWorld),local=cover.worldToLocal(world.clone());if(local.z<.02)continue;tested++;for(const direction of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]){ray.set(world,world.clone().set(...direction).transformDirection(cover.matrixWorld));if(!ray.intersectObject(cover,true).length){outside++;break;}}}});}finally{for(const [m,side]of materials)m.side=side;}return {tested,outside,crossings,span:app.game.player.character.getBone(rig.side+'Hand').getWorldPosition(cover.position.clone()).distanceTo(cover.position),length:rig.length,angle:rig.copy.quaternion.angleTo(cover.quaternion)};});}""")
 p.evaluate('()=>{const g=app.game;g.input.reset();g.player.arts.cancel();g.player.revive();g.player.arts.startSheath();}')
 enclosure=[];previous=0
 for t in [.05,.1,.15,.2,.25,.3,.35,.4,.45,.5,.55,.6,.65,.7,.75,.8,.85,.9,1,1.1,1.3]:
  p.evaluate('t=>{let steps=0;while(app.game.player.arts.t+1e-9<t){app.simulate(1/60,1/60);if(++steps>120)throw Error("sheath clock stalled");}}',t);previous=t
  sample=p.evaluate('dualEnclosure()');enclosure.append({'t':t,'hands':sample})
  if os.environ.get('DUAL_CAPTURE_PREP')=='1' and t in [.1,.25,.5,.7]:
   p.evaluate('dualShot()');p.screenshot(path=str(out/f'prepare-{t:.2f}.png'))
 (out/'enclosure.json').write_text(json.dumps(enclosure,indent=2))
 assert all(hand['crossings']==0 for row in enclosure for hand in row['hands']), 'blade edges do not cross the scabbard boundary'
 assert all(hand['tested']>0 and hand['outside']==0 for row in enclosure for index,hand in enumerate(row['hands']) if row['t']-index*.4>=.4), 'aligned blades stay inside their scabbards'
 transitions=p.evaluate("""()=>{
  const g=app.game,p=g.player,d=g.heroPresence.dualKatana,results=[];
  for(const action of ['guard','dodge','draw','flourish','hurt']){
   g.input.reset();p.arts.cancel();p.revive();app.simulate(.3);p.arts.startSheath();app.simulate(.45);
   if(action==='guard')g.input.press('guard');
   if(action==='dodge')g.input.press('dodge');
   if(action==='draw'){g.input.press('attack');p.arts.charge();app.simulate(.4);g.input.release('attack');}
   if(action==='flourish')p.arts.startSheath(true);
   if(action==='hurt'){p.state='hurt';p.arts.cancel();}
   let maxGap=0,maxStep=0,stalledRightFrames=0,previous=[];
   for(let frame=0;frame<100;frame++){
    app.simulate(1/60,1/60);app.scene.updateMatrixWorld(true);
    if(['guard','dodge','hurt'].includes(action)&&d.rigs[1].arts.mode==='sheathed')stalledRightFrames++;
    for(const [index,rig]of d.rigs.entries()){
     const source=rig.source(),visible=rig.copy?.visible?rig.copy:source;
     const grip=visible.localToWorld(visible.position.clone().set(0,0,-.1));
     const hand=p.character.getBone(index?'RightHand':'LeftHand').getWorldPosition(grip.clone());
     if(!hand.toArray().every(Number.isFinite))throw Error('invalid hand '+action);
     maxGap=Math.max(maxGap,grip.distanceTo(hand));
     if(previous[index]&&frame>90)maxStep=Math.max(maxStep,hand.distanceTo(previous[index]));previous[index]=hand;
    }
   }
   results.push({action,maxGap,stalledRightFrames,maxSettledHandStep:maxStep});
  }
  return results;
 }""")
 (out/'transitions.json').write_text(json.dumps(transitions,indent=2));assert all(r['maxGap']<.005 for r in transitions),'both grips stay attached through interruptions'
 assert all(r['stalledRightFrames']==0 for r in transitions),'guard, dodge and hurt must not retain the draw delay'
 assert all(r['maxSettledHandStep']<.005 for r in transitions),'hands settle after each transition'
 low_fps=p.evaluate("""()=>{const g=app.game,p=g.player,d=g.heroPresence.dualKatana;g.input.reset();p.arts.cancel();p.revive();p.arts.startSheath();let maxGap=0;for(let frame=0;frame<60;frame++){app.simulate(1/30,1/30);app.scene.updateMatrixWorld(true);for(const [index,rig]of d.rigs.entries()){const source=rig.source(),visible=rig.copy?.visible?rig.copy:source;const grip=visible.localToWorld(visible.position.clone().set(0,0,-.1));const hand=p.character.getBone(index?'RightHand':'LeftHand').getWorldPosition(grip.clone());maxGap=Math.max(maxGap,grip.distanceTo(hand));}}return {fps:30,maxGap,mode:p.arts.mode};}""")
 (out/'low-fps.json').write_text(json.dumps(low_fps,indent=2));assert low_fps['maxGap']<.005 and low_fps['mode']=='sheathed','both hands maintain contact at 30fps'
 p.evaluate('()=>{const g=app.game;g.input.reset();g.player.arts.cancel();g.player.revive();g.player.arts.charge();app.simulate(.4);}')

 p.evaluate('()=>{const g=app.game;g.input.press("attack");g.player.arts.charge();app.simulate(.4);g.input.release("attack");app.simulate(.08);dualShot()}');p.screenshot(path=str(out/'draw-left.png'))
 first_draw=p.evaluate('()=>app.game.heroPresence.dualKatana.rigs.map(r=>r.copy.position.distanceTo(r.presence.sheath.position))')
 assert first_draw[0]>.05 and first_draw[1]<.005, 'left draw begins while right blade remains seated'
 p.evaluate('app.simulate(.18);dualShot()');p.screenshot(path=str(out/'draw-right.png'))
 p.evaluate('()=>{const g=app.game;g.player.arts.cancel();g.player.revive();g.input.reset();g.input.press("guard");app.simulate(.4);dualShot()}');p.screenshot(path=str(out/'guard.png'))
 p.evaluate('()=>{const g=app.game;g.input.reset();g.player.arts.cancel();g.player.setWeapon("gauntlet");app.simulate(.1);if(g.heroPresence.dualKatana.left)throw Error("left blade leaked after weapon switch");g.player.setWeapon("katana");app.simulate(.3);if(!g.heroPresence.dualKatana.left)throw Error("left blade missing after return");}')
 if os.environ.get('DUAL_RECORD')=='1':
  frames=out/'frames';frames.mkdir(exist_ok=True)
  p.evaluate('()=>{const g=app.game;g.input.reset();g.player.arts.cancel();g.player.revive();g.player.arts.startSheath();}')
  fps=int(os.environ.get('DUAL_RECORD_FPS','30'))
  for frame in range(round(2.8*fps)):
   p.evaluate('dt=>{app.simulate(dt,1/60);dualShot()}',1/fps)
   if frame==round(40*fps/30):p.evaluate('()=>{const g=app.game;g.input.press("attack");g.player.arts.charge();}')
   if frame==round(52*fps/30):p.evaluate('app.game.input.release("attack")')
   p.screenshot(path=str(frames/f'{frame:03d}.png'))
 assert not errors;print(json.dumps({'maxGripGap':max(h['gap'] for r in rows for h in r['hands']),'errors':errors}));b.close()
