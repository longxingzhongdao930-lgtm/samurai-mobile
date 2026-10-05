import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(os.environ.get('FX_OUT','/tmp/fx-before'));out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':640,'height':360});errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto('http://127.0.0.1:4181/?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(.5);window.camera=()=>{const at=g.playerPosition,c=app.rig.camera;c.position.set(at.x+1.6,at.y+1.6,at.z+3.5);c.lookAt(at.x,at.y+1,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();};}''')
 rows=[]
 for i in range(120):
  if i==0:p.evaluate('app.game.player._startMove(app.game.player.combo[0],null)')
  if i==20:p.evaluate('app.game.player.techniques.startRitual(true)')
  p.evaluate('app.simulate(1/15);camera()')
  rows.append(p.evaluate('({frame:'+str(i)+',slots:app.game.fx.effectAtlas.slots.filter(s=>s.mesh.visible).map(s=>({id:s.id,frame:s.mesh.material.uniforms.frame.value})),ritual:app.game.player.techniques.ritual?.t})'))
  p.screenshot(path=str(out/f'{i:03}.png'))
 json.dump({'rows':rows,'errors':errors},open(out/'metrics.json','w'));print(json.dumps({'errors':errors,'activeFrames':sum(bool(r['slots']) for r in rows)}),flush=True);b.close()
