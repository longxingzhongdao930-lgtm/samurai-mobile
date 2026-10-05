import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw,ImageEnhance
out=Path('/tmp/silent-iai');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':640,'height':540});errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto('http://127.0.0.1:4181/?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(.5);window.snapshot=()=>{const p=g.player,c=p.character;c.root.updateMatrixWorld(true);const hand=c.getBone('RightHand'),blade=g.weapons.blade(),v=c.position.clone(),q=hand.quaternion.clone();return {id:p.move?.config.id,phase:p.move?.phase,state:p.state,link:!!p.swordOpeningLink,wrist:hand.getWorldPosition(v).toArray(),blade:blade.getWorldQuaternion(q).toArray(),bones:[...c.bones.values()].every(b=>[...b.quaternion.toArray(),...b.position.toArray()].every(Number.isFinite))};};window.camera=()=>{const at=g.playerPosition,c=app.rig.camera;c.position.set(at.x+1.6,at.y+1.6,at.z+3.5);c.lookAt(at.x,at.y+1,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();};}''')

 p.evaluate("""()=>{const g=app.game,a=g.director.spawn('infinian',0,126,Math.PI);a.hp=a.maxHp=10000;a.cooldown=999;a.maxPosture=10000;a.update=()=>{};window.target=a;}""")
 rows=[]
 for ident in ['k1','k2','k3','k4','k5','quickDraw','heavy']:
  p.evaluate("""id=>{const g=app.game,p=g.player;g.input.reset();p.revive();p.arts.cancel();g.flow._place(g.playerPosition.clone().set(0,0,124),0);app.simulate(.3);target.hp=10000;target.enemy.position.set(0,0,126);const m=[...p.combo,p.quickDraw,p.heavy].find(m=>m.config.id===id);p._startMove(m,null);app.simulate(1/60);}""",ident)
  result=[]
  for j in range(21):
   if j:p.evaluate('app.simulate(app.game.player.move?.action.getClip().duration/20||.02)')
   result.append(p.evaluate("""()=>{const g=app.game,p=g.player,c=p.character,h=g.heroPresence,k=h.katanaSheath,v=c.position.clone();return {phase:p.move?.phase,mode:p.arts.mode,hp:target.hp,source:g.weapons.blade().visible,copy:k.copy?.visible,trail:g.fx.trail.active,bones:[...c.bones.values()].every(b=>b.quaternion.toArray().every(Number.isFinite))};}"""))
   if ident=='k1':
    p.evaluate('target.enemy.root.visible=false;camera()');p.screenshot(path=str(out/f'k1-{j:02}.png'));p.evaluate('target.enemy.root.visible=true')
  assert all(row['hp']==10000 for row in result if row['phase'] is not None and row['phase']<.62),(ident,result)
  assert result[-1]['hp']<10000,(ident,result)
  assert all(row['bones'] and not row['trail'] for row in result),(ident,result)
  rows.append({'id':ident,'timeline':result})
 p.evaluate("""()=>{const fx=app.game.fx.effectAtlas,at=app.game.playerPosition.clone().add({x:0,y:1,z:0});for(const id of ['127578','71330','127577','220078','182612'])fx.spawn(id,at,1,.5);fx.update(.1);camera();}""")
 p.screenshot(path=str(out/'effects.png'))
 assert p.evaluate('app.game.fx.effectAtlas.slots.filter(s=>s.mesh.visible).length')==5
 p.evaluate('app.game.fx.effectAtlas.clear()')
 assert p.evaluate('app.game.fx.effectAtlas.slots.every(s=>!s.mesh.visible)')
 assert not errors,errors
 json.dump(rows,open(out/'metrics.json','w'),indent=2)
 print(json.dumps({'moves':[r['id'] for r in rows],'errors':errors}),flush=True);b.close()
