"""Exercise real keyboard edges, ordered loadouts, and airborne attacks."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('/tmp/player-controls');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()');p.get_by_role('button',name='はじめる',exact=True).click()
 p.evaluate('''async()=>{const g=app.game;g.flow.update=()=>{};g.director.clear();g.magic.clear();await g.weapons.swords.select('oni');g.player.setWeapon('katana');g.flow._place(g.playerPosition.clone().set(0,0,124),0);app.simulate(.3);}''')
 order=[]
 for expected in ['odachi','spear','naginata','kusarigama','gauntlet','shuriken','katana']:
  p.keyboard.press('e');p.evaluate('app.simulate(.03)')
  p.wait_for_function("id=>app.game.player.weapon.id===id",arg=expected,timeout=90000)
  p.evaluate('app.simulate(.3)');order.append(p.evaluate("()=>app.game.player.weapon.id"))
 assert p.evaluate('app.game.weapons.swords.id')=='oni','restore selected single sword'
 p.keyboard.press('Shift');p.evaluate('app.simulate(.03)');assert p.evaluate('app.game.player.state')=='dodge'
 p.evaluate('app.simulate(1)');p.keyboard.press('Space');p.evaluate('app.simulate(.03)')
 assert p.evaluate('app.character.hop.locked||app.character.jump.locked'),'Space launches a real jump'
 p.keyboard.press('j');p.evaluate('app.simulate(.03)');assert p.evaluate('app.game.player.move===app.game.player.jumpMove&&app.game.player.state==="attack"'),'air attack'
 air=p.evaluate('''()=>{const p=app.game.player,rows=[];for(let i=0;i<90;i++){app.simulate(1/60,1/60);rows.push({t:i/60,hips:p.character.getBone('Hips').getWorldPosition(p.character.position.clone()).y,move:p.move?.config.id,state:p.state,hop:p.character.hop.locked});}return rows;}''')
 assert max(r['hips'] for r in air)-min(r['hips'] for r in air)>.1,'airborne animation keeps its vertical arc'
 assert p.evaluate('app.game.player.state')=='free'
 # Every weapon can start its own airborne variant without a ground warp.
 variants=p.evaluate('''async()=>{const g=app.game,p=g.player,result=[];for(const id of ['katana','odachi','spear','naginata','kusarigama','gauntlet','shuriken']){
 g.input.reset();p.revive();if(id==='katana')await g.weapons.swords.select('oni');p.setWeapon(id);
 p.character.jump.cancel();p.character.hop.cancel();app.simulate(.3);g.input.press('jump');app.simulate(1/60);g.input.release('jump');g.input.press('attack');app.simulate(1/60);g.input.release('attack');
 const originalStrike=p.jumpMove.onStrike,contacts=[];p.jumpMove.onStrike=(move,index)=>{contacts.push('Right');originalStrike(move,index);};
 const row={id,move:p.move?.config.id,air:p.move?.config.airborne,warp:p._held.warp.active};app.simulate(2);p.jumpMove.onStrike=originalStrike;row.contacts=contacts;row.expected=['Right'];result.push(row);
 if(p.state!=='free'||p.character.hop.locked||p.character.jump.locked)throw Error('airborne state stuck '+id);
 }return result;}''')
 assert all(r['air'] and not r['warp'] and r['contacts']==r['expected'] for r in variants),variants
 landing=p.evaluate('''()=>{const g=app.game,p=g.player;g.input.reset();p.revive();p.setWeapon('odachi');app.simulate(2);const enemies=g.enemies.enemies,damage=g.damageEnemy,visible=g.targetVisible,hits=[];
 const enemy={alive:true,agent:{radius:.4,state:'idle'},position:p.character.position.clone().add(p.character.position.clone().set(0,0,1)),update(){}};
 try{g.enemies.enemies=[enemy];g.targetVisible=()=>true;g.damageEnemy=(e,hit)=>{hits.push({damage:hit.damage,airborne:p.character.jump.locked||p.character.hop.locked});return {damage:0};};g.input.press('jump');app.simulate(1/60);g.input.release('jump');g.input.press('attack');app.simulate(1/60);g.input.release('attack');app.simulate(2);return hits;}
 finally{g.enemies.enemies=enemies;g.damageEnemy=damage;g.targetVisible=visible;}}''')
 assert len(landing)==1 and landing[0]['damage']==20 and not landing[0]['airborne'],landing
 # Taking damage must cancel the airborne state instead of freezing its clock.
 p.evaluate("()=>{const g=app.game,p=g.player;g.input.reset();p.revive();g.input.press('jump');app.simulate(1/60);g.input.release('jump');if(!p.character.hop.locked)throw Error('missing hop');p._stagger(.3,1,0,0,false);if(p.character.hop.locked||p.character.jump.locked)throw Error('jump survived damage');app.simulate(1);if(p.state!=='free')throw Error('hurt did not recover');}")
 assert not errors,errors
 (out/'results.json').write_text(json.dumps({'order':order,'air':air,'variants':variants,'landing':landing,'errors':errors},indent=2));print(json.dumps({'order':order,'variants':variants,'landing':landing,'errors':errors}));b.close()
