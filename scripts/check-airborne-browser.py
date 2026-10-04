"""Record airborne weapon poses using the actual gameplay camera."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/player-airborne');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate("()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(1);}")
 results=[]
 for weapon in ['katana','dual','odachi','spear']:
  p.evaluate('''async id=>{const g=app.game,p=g.player;g.input.reset();p.revive();g.flow._place(g.playerPosition.clone().set(0,0,124),0);await g.weapons.swords.select(id==='dual'?'dual':'mythical');p.setWeapon(id==='dual'?'katana':id);app.simulate(.6);g.input.press('jump');app.simulate(1/60);g.input.release('jump');}''',weapon)
  folder=out/weapon;folder.mkdir(exist_ok=True);rows=[]
  for frame in range(30):
   if frame==2:p.evaluate('app.game.input.press("attack")')
   if frame==3:p.evaluate('app.game.input.release("attack")')
   row=p.evaluate('''()=>{app.simulate(1/15,1/60);app.scene.updateMatrixWorld(true);app.post.render();const p=app.game.player,c=p.character;
 const head=c.getBone('Head').getWorldPosition(c.position.clone()),hips=c.getBone('Hips').getWorldPosition(c.position.clone());const ndc=head.clone().project(app.rig.camera);
 return {head:head.toArray(),hips:hips.y,screen:ndc.toArray(),state:p.state,move:p.move?.config.id,hop:c.hop.locked};}''')
   rows.append(row);p.screenshot(path=str(folder/f'{frame:03}.png'))
  assert max(r['hips'] for r in rows)-min(r['hips'] for r in rows)>.15,weapon
  assert all(abs(r['screen'][0])<1 and abs(r['screen'][1])<1 and -1<r['screen'][2]<1 for r in rows),f'{weapon} leaves gameplay camera'
  assert rows[-1]['state']=='free' and not rows[-1]['hop'],rows[-1]
  results.append({'weapon':weapon,'maxHeadY':max(r['screen'][1] for r in rows),'minHeadY':min(r['screen'][1] for r in rows),'heightRange':max(r['hips'] for r in rows)-min(r['hips'] for r in rows)})
  (folder/'timeline.json').write_text(json.dumps(rows,indent=2))
 assert not errors,errors
 (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps({'camera':results,'pageErrors':errors}));b.close()
