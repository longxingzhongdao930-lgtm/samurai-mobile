"""Record real-input five-stage links at 30 fps; verify displayed grip continuity."""
import json,os,math
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw,ImageEnhance
out=Path(os.environ.get('COMBO_CAPTURE_DIR','/tmp/combo-five'));out.mkdir(exist_ok=True)
capture=os.environ.get("COMBO_CAPTURE","1")!="0"
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':640,'height':540});errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.hud.setVisible(false);g.touch.setVisible(false);app.simulate(.5);window.snapshot=()=>{const p=g.player,c=p.character;c.root.updateMatrixWorld(true);const hand=c.getBone('RightHand'),blade=g.weapons.blade(),v=c.position.clone(),q=hand.quaternion.clone();return {id:p.move?.config.id,phase:p.move?.phase,state:p.state,link:!!p.swordOpeningLink,wrist:hand.getWorldPosition(v).toArray(),blade:blade.getWorldQuaternion(q).toArray(),bones:[...c.bones.values()].every(b=>[...b.quaternion.toArray(),...b.position.toArray()].every(Number.isFinite))};};window.camera=()=>{const at=g.playerPosition,c=app.rig.camera;c.position.set(at.x+1.6,at.y+1.6,at.z+3.5);c.lookAt(at.x,at.y+1,at.z);c.fov=42;c.updateProjectionMatrix();app.scene.updateMatrixWorld(true);app.post.render();};}''')
 p.evaluate('app.game.player.arts.cancel()');p.keyboard.press('j');p.evaluate('app.simulate(1/60)');rows=[];linked=False;linked_ids=set()
 for i in range(60):
  if i:
   current=p.evaluate('snapshot()')
   if current['id'] in ['k1','k2','k3','k4'] and current['id'] not in linked_ids and current['phase']>=.73:
    p.keyboard.press('j');linked=True;linked_ids.add(current['id'])
   p.evaluate('app.simulate(1/30)')
  row=p.evaluate('snapshot()');row['frame']=i;rows.append(row)
  if capture:
   p.evaluate('camera()');p.screenshot(path=str(out/f'{i:03}.png'))
 json.dump({'timeline':rows},open(out/'partial-metrics.json','w'),indent=2)
 assert len(linked_ids)==4 and all(any(r['id']==f'k{i}' for r in rows) for i in range(1,6)),rows
 assert all(r['bones'] for r in rows)
 for a,next_row in zip(rows,rows[1:]):
  if a['id']!=next_row['id'] and next_row['id'] in ['k2','k3','k4','k5']:
   assert math.dist(a['wrist'],next_row['wrist'])<.08,('grip jumped',a,next_row)
   angle=2*math.acos(min(1,abs(sum(x*y for x,y in zip(a['blade'],next_row['blade'])))))
   assert angle<.35,('blade flipped',angle,a,next_row)
 assert rows[-1]['state']=='free',rows[-1]
 # Verify repeated input reaches all five moves, and interruption releases linking state.
 check=p.evaluate('''()=>{const g=app.game,p=g.player;g.input.reset();p.revive();p.arts.cancel();app.simulate(.3);const ids=[];for(let i=0;i<240;i++){if(i%6===0){g.input.press('attack');g.input.release('attack');}app.simulate(1/60);if(p.state==='attack'&&!ids.includes(p.move.config.id))ids.push(p.move.config.id);}g.input.reset();app.simulate(1);return {ids,state:p.state,bones:[...p.character.bones.values()].every(b=>b.quaternion.toArray().every(Number.isFinite))};}''')
 assert all(f'k{i}' in check['ids'] for i in range(1,6)),check
 assert check['state']=='free' and check['bones'],check
 assert not errors,errors
 json.dump({'timeline':rows,'repeated':check,'errors':errors},open(out/'metrics.json','w'),indent=2);b.close()
 if not capture:
  print(json.dumps({'repeated':check,'errors':errors}),flush=True);raise SystemExit(0)
 grid=Image.new('RGB',(1280,3*292),'#151515');d=ImageDraw.Draw(grid)
 for k,i in enumerate([0,4,7,8,12,16,21,25,30,36,45,59]):
  im=Image.open(out/f'{i:03}.png');im.thumbnail((320,270));grid.paste(ImageEnhance.Brightness(im).enhance(1.7),((k%4)*320,(k//4)*292+22));d.text(((k%4)*320+5,(k//4)*292+5),f'{i/30:.2f}s {rows[i]["id"]} {rows[i]["phase"]}',fill='white')
 grid.save(out/'opening-sheet.jpg');print(json.dumps({'repeated':check,'errors':errors}),flush=True)
