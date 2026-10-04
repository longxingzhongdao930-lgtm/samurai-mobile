"""Run dedicated moves through animation clocks and the real combat sweep."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/dual-combat');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''async()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();await g.weapons.swords.select('dual');g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(.3);window.shot=()=>{const at=g.player.character.position,c=app.rig.camera;c.position.set(at.x+1.6,at.y+1.65,at.z+3.2);c.lookAt(at.x,at.y+1.15,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();};}''')
 result=[] if os.environ.get('DUAL_CAPTURE_ONLY')=='1' else p.evaluate('''()=>{
 const g=app.game,p=g.player,original=g.damageEnemy,originalEnemies=g.enemies.enemies,rows=[];
 const enemy={update(){},alive:true,position:p.character.position.clone().add(p.character.position.clone().set(0,0,1)),agent:{radius:.4,state:'idle'}};
 const oldVisible=g.targetVisible;g.targetVisible=()=>true;g.enemies.enemies=[enemy];
 const oldLanded=p.arts.landed;p.arts.landed=()=>{};
 try{for(const fps of [60,30])for(const move of [...p.combo,p.heavy,p.counter]){
 g.input.reset();p.arts.cancel();p.revive();app.simulate(.3);const contacts=[];
 g.damageEnemy=(e,hit)=>{contacts.push({hand:hit.hand,damage:hit.damage});return {damage:0};};
 const at=p.character.position,yaw=p.character.facing;
 const side=name=>{const q=p.character.getBone(name+'Hand').getWorldPosition(at.clone()).sub(at);return q.x*Math.cos(yaw)-q.z*Math.sin(yaw);};
 if(side('Left')<.05||side('Right')>-.05)throw Error('crossed idle arms '+side('Left')+' / '+side('Right'));
 p._startMove(move,null);let gap=0,leftTrailFrames=0,rightTrailFrames=0,contactsForward=[],footClearance=[];
 for(let frame=0;frame<fps*3;frame++){
 enemy.position.copy(p.character.position);enemy.position.x+=Math.sin(p.character.facing);enemy.position.z+=Math.cos(p.character.facing);
 app.simulate(1/fps,1/fps);app.scene.updateMatrixWorld(true);
 const d=g.heroPresence.dualKatana;
 if(p.state==='attack')for(const side of ['Left','Right']){const foot=p.character.getBone(side+'Foot').getWorldPosition(p.character.position.clone());footClearance.push(foot.y-g.app.terrain.heightAt(foot.x,foot.z));}
 if(g.fx.leftTrail.active)leftTrailFrames++;if(g.fx.trail.active)rightTrailFrames++;
 for(const [index,rig]of d.rigs.entries()){
 const blade=rig.copy?.visible?rig.copy:rig.source();
 const grip=blade.localToWorld(blade.position.clone().set(0,0,-.1));
 const hitIndex=move.config.dualHands.indexOf(index?'Right':'Left');
 if(p.state==='attack'&&hitIndex>=0&&Math.abs(move.phase-move.config.hits[hitIndex])<.045){
 const tip=blade.localToWorld(blade.position.clone().set(0,0,.6)).sub(grip).normalize();
 contactsForward.push(tip.x*Math.sin(p.character.facing)+tip.z*Math.cos(p.character.facing));
 }
 gap=Math.max(gap,grip.distanceTo(p.character.getBone(index?'RightHand':'LeftHand').getWorldPosition(grip.clone())));
 }
 }
 rows.push({fps,id:move.config.id,expected:move.config.dualHands,contacts,gap,leftTrailFrames,rightTrailFrames,contactsForward,footClearance});
 }}finally{g.damageEnemy=original;g.enemies.enemies=originalEnemies;g.targetVisible=oldVisible;p.arts.landed=oldLanded;}
 return rows;
 }''')
 for row in result:
  assert [h['hand'] for h in row['contacts']]==row['expected'],row
  assert row['gap']<.005,row
  assert row['contactsForward'] and min(row['contactsForward'])>.25,row
  assert max(row['footClearance'])<.16 and min(row['footClearance'])>-.03,row
  assert row['leftTrailFrames']>0 if 'Left' in row['expected'] else row['leftTrailFrames']==0,row
  assert row['rightTrailFrames']>0 if 'Right' in row['expected'] else row['rightTrailFrames']==0,row
 if result:(out/'contacts.json').write_text(json.dumps(result,indent=2))
 for index in range(4 if os.environ.get('DUAL_CAPTURE','1')!='0' else 0):
  p.evaluate("""index=>{const p=app.game.player,g=app.game;g.input.reset();p.arts.cancel();p.revive();p.lockTarget=null;g.flow._place(p.character.position.clone().set(0,0,124),0);app.simulate(.3);if(index===3){const g=app.game;g.input.press('attack');p.arts.charge();app.simulate(.6);g.input.release('attack');app.simulate(.02);}else p._startMove(p.combo[index],null);}""",index)
  for frame in range(24):
   p.evaluate('app.simulate(1/15,1/60);shot()');p.screenshot(path=str(out/f'combo-{index}-{frame:02}.png'))
 p.evaluate('''async()=>{const g=app.game;await g.weapons.swords.select('mythical');if(g.player.combo.length!==5||g.player.combo[0].config.dualPose)throw Error('single moves not restored');await g.weapons.swords.select('dual');g.player.setWeapon('gauntlet');g.player.setWeapon('katana');if(g.player.combo[0].config.id!=='dual-left')throw Error('dual moves not restored');}''')
 assert not errors,errors
 print(json.dumps({'moves':len(result),'errors':errors,'maxGap':max((r['gap'] for r in result),default=0)}));b.close()
