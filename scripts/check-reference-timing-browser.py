"""Capture the full, timed sheath sequences and verify physical event order."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/sheath-reference-recording');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);window.shot=()=>{const at=g.player.character.position,c=app.rig.camera;c.position.set(at.x+2.8,at.y+1.75,at.z+2.2);c.lookAt(at.x,at.y+1.15,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();};}''')
 results=[]
 for variant,duration in [('mythical',3.5),('dual',6.8)]:
  p.evaluate('''async id=>{const g=app.game;g.input.reset();g.player.arts.cancel();g.player.revive();await g.weapons.swords.select(id);g.player.setWeapon('katana');app.simulate(.4);g.player.arts.startSheath(true);}''',variant)
  folder=out/variant;folder.mkdir(exist_ok=True);rows=[]
  for frame in range(round(duration*15)):
   rows.append(p.evaluate('''()=>{const g=app.game;app.simulate(1/15,1/60);shot();const h=g.heroPresence,p=g.player;
 const rigs=g.weapons.swords.id==='dual'?h.dualKatana.rigs:[h.katanaSheath];
 return {t:p.arts.t,mode:p.arts.mode,hips:p.character.getBone('Hips').getWorldPosition(p.character.position.clone()).y,
 hands:rigs.map(r=>{const blade=r.copy?.visible?r.copy:r.source?.()??g.weapons.blade(),hand=p.character.getBone(r.side+'Hand').getWorldPosition(p.character.position.clone());
 const grip=blade.localToWorld(blade.position.clone().set(0,0,-.1));
 return {gripping:r.gripping!==false,gap:grip.distanceTo(hand),guard:blade.getWorldPosition(grip.clone()).distanceTo(r.presence.sheath.position),hand:hand.toArray()};})};}'''))
   p.screenshot(path=str(folder/f'{frame:03}.png'))
  assert rows[-1]['mode']=='sheathed',rows[-1]
  assert all(h['guard']<.005 for h in rows[-1]['hands']),rows[-1]
  # Physical contact until the deliberate final release, not merely a timer.
  assert max(h['gap'] for row in rows for h in row['hands'] if h['gripping'])<.005
  seats=[];releases=[]
  for index in range(len(rows[-1]['hands'])):
   # Ignore any initial carried blade near the hip: only the latter half is seating.
   seats.append(next(r['t'] for r in rows if r['t']>(.8 if variant=='mythical' else 2.1) and r['hands'][index]['guard']<.005))
   releases.append(next(r['t'] for r in rows if not r['hands'][index]['gripping']))
  if variant=='dual':assert seats[1]-seats[0]>2.7
  results.append({'variant':variant,'seated':seats,'released':releases,'completed':next(r['t'] for r in rows if r['mode']=='sheathed'),'maxGripGap':max(h['gap'] for r in rows for h in r['hands'] if h['gripping'])})
  (folder/'timeline.json').write_text(json.dumps(rows,indent=2))
 assert not errors,errors
 (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps({'sequences':results,'pageErrors':errors}));b.close()
