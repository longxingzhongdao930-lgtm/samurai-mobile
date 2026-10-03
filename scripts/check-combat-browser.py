import json
import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':844,'height':390},has_touch=True,reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('GAME_URL', 'http://127.0.0.1:4173/') + '?q=low&dyn=0',wait_until='domcontentloaded')
 page.wait_for_function('window.app?.game?.state === "title"',timeout=240000)
 page.get_by_role('button',name='はじめる',exact=True).click()
 page.wait_for_function('app.game.state === "playing" && app.game.form.ready',timeout=90000)
 print(page.evaluate('''async () => {
 app.stop();const g=app.game,p=g.player;window.flowUpdate=g.flow.update;g.flow.update=()=>{};
 const results=[];
 for(const id of ['katana','odachi','spear','naginata','kusarigama','gauntlet','shuriken']) {
   g.director.clear();g.magic.clear();g.weapons.clear();p.revive();g.input.reset();
   g.flow._place(g.playerPosition.clone().set(0,0,95),0);p.setWeapon(id);p.invulnerable=999;
   for(let n=0;n<100 && g.weapons.current!==id;n++){app.simulate(1/60);await new Promise(r=>setTimeout(r,20));}
   const a=g.director.spawn('infinian',0,97,Math.PI);a.hp=a.maxHp=5000;a.maxPosture=10000;a.cooldown=999;p.lockTarget=a.enemy;
   g.input.press('attack');app.simulate(1/60);g.input.release('attack');app.simulate(3);
   if(a.hp===5000)throw Error('weapon missed '+id+' '+p.state);
   const damage=5000-a.hp;
   g.input.press('dodge');app.simulate(1/60);g.input.release('dodge');
   if(p.state!=='dodge')throw Error('dodge did not start '+id);
   app.simulate(2);if(p.state!=='free')throw Error('dodge stuck '+id);
   results.push({weapon:id,damage,dodge:true});
 }
 g.director.clear();p.revive();p.setWeapon('katana');p.hp=1;p.guardMeter=1;p.guarding=true;p.guardTime=99;p.invulnerable=0;
 p.receiveHit({damage:20,from:g.playerPosition.clone().add({x:0,y:0,z:1})});
 if(p.state!=='dead')throw Error('lethal guard break');app.simulate(2);
 if(g.state!=='defeat')throw Error('no defeat screen');
 g.input.press('attack');g.input.press('special');g.input.stick.active=true;g.input.stick.y=1;
 p._charging=true;p._chargeTime=2;g.retry();
 if(g.input.held.attack||g.input.held.special||g.input.stick.active||p._charging||g._slowTimer||app._hitStop)throw Error('retry residue');
 app.simulate(.5);if(p.state!=='free')throw Error('retry automatic action');
 return {weapons:results,lethalGuardBreak:true,retryClean:true};
 }'''),flush=True)
 print(page.evaluate("""() => {
 const g=app.game,p=g.player;g.input.reset();g.director.clear();g.magic.clear();p.revive();
 g.flow._place(g.playerPosition.clone().set(0,0,95),0);
 p.special=1;g.input.press('special');app.simulate(1/60);g.input.release('special');app.simulate(3);
 if(!g.form.active||!g.form.group.visible)throw Error('transformation failed');
 g.input.press('attack');app.simulate(1/60);g.input.release('attack');
 if(!g.form.attack)throw Error('dragon attack failed');app.simulate(2);
 g.form.end();if(!app.character.tilt.visible||g.form.group.visible)throw Error('transform cleanup');
 g.director.clear();g.flow._place(g.playerPosition.clone().set(0,0,80),0);p.invulnerable=0;
 const a=g.director.spawn('mage',0,92,Math.PI),c=a.enemy.caster;a.cooldown=999;
 a.enemy.root.updateMatrixWorld(true);c.aim.copy(g.playerPosition).y+=1.1;c.hasAim=true;
 g.stage.setBarrier('plazaA',true);const hp=p.hp;c.fire({damage:10});
 if(p.hp!==hp)throw Error('laser crossed barrier');
 const end=c.beamEnd(c.muzzlePosition());if(end.z<85)throw Error('beam crossed barrier visually');
 g.stage.setBarrier('plazaA',false);c.fire({damage:10});if(p.hp!==hp-10)throw Error('open barrier laser missed');
 g.director.clear();p.revive();g.flow._place(g.playerPosition.clone().set(0,0,0),0);g.input.reset();
 app.frame();return {dragonAttack:true,transformCleanup:true,barrierLaser:true};
 }"""),flush=True)
 for width,height in [(844,390),(568,320),(667,375)]:
  page.set_viewport_size({'width':width,'height':height})
  page.wait_for_timeout(80)
  print(page.evaluate("""() => {
   const buttons=[...document.querySelectorAll('.tc button')].filter(e=>e.getBoundingClientRect().width>0);
   const boxes=buttons.map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),r:e.getBoundingClientRect(),e}));
   for(const {name,r,e} of boxes){
    if(r.width<43.9||r.height<43.9)throw Error('small target '+name+' '+r.width+' '+r.height);
    if(r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)throw Error('offscreen '+name);
    if(!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('covered button '+name);
   }
   // Advance the normal render pipeline after the viewport change.
   for(let i=0;i<4;i++)app.frame();
   const gl=app.renderer.gl.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
   gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let visible=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>15)visible++;
   if(visible<1000||gl.getError()!==0)throw Error('scene not rendered after resize');
   return {viewport:[innerWidth,innerHeight],touchButtons:boxes.length,reachable:true};
  }"""),flush=True)
 page.screenshot(path='/tmp/samurai-mobile-controls.png')
 page.evaluate("app.game.input.press('attack');app.game.input.stick.active=true;app.game.input.stick.y=1")
 page.set_viewport_size({'width':390,'height':844})
 page.wait_for_function("app.game.state==='paused'",timeout=5000)
 print(page.evaluate("""() => {
 const g=app.game,before=g.playTime;app.simulate(2);
 if(g.playTime!==before||g.input.held.attack||g.input.stick.active)throw Error('portrait battle continued');
 if(getComputedStyle(document.querySelector('.gs-rotate')).display==='none')throw Error('rotation cover missing');
 return {portraitPaused:true,heldInputCleared:true};
 }"""),flush=True)
 page.screenshot(path='/tmp/samurai-mobile-portrait.png')
 page.set_viewport_size({'width':844,'height':390})
 page.wait_for_timeout(80)
 page.locator('[data-action="resume"]').click()
 page.wait_for_function("app.game.state==='playing'")
 print(page.evaluate('''() => {
 const g=app.game,p=g.player,f=g.flow;f.update=window.flowUpdate;g._timers.length=0;f.start();
 const visited=new Set(),retried=new Set();let steps=0;
 const positions={intro:0,first:22,street:52,oni:92,horde:120,shrineRoad:160,shrineCourt:195,approach:222,boss:250};
 while(g.state!=='result'&&steps++<1800) {
   if(g.state==='blessing')document.querySelector('.gs-blessing__choice').click();
   p.invulnerable=999;
   const beat=f.beats[f.beat];if(!beat)throw Error('missing beat '+f.beat);
   visited.add(beat.id);
   if(!beat.started&&positions[beat.id]!==undefined) f._place(g.playerPosition.clone().set(0,0,positions[beat.id]),0);
   if(beat.started&&['oni','shrineCourt'].includes(beat.id)&&!retried.has(beat.id)) {
      const name=beat.id, hp=f.checkpoint.maxHp;retried.add(name);
      p.maxHp+=20;g.retry();
      if(f.beats[f.beat].id!==name)throw Error('retry skipped '+name);
      if(p.maxHp!==hp)throw Error('maxHp retry mismatch');
      continue;
   }
   if(['thunder','ice'].includes(beat.id)) {
     const pickup=f.pickups.find(x=>x.kind===beat.id);
     if(pickup) f._place(pickup.position.clone().setY(0),0);
   }
   for(const a of [...g.director.agents]) if(a.alive&&!g.cinematic) {
      g.damageEnemy(a.enemy,{damage:99999,posture:0,source:'magic',quiet:true,execute:!!a.finalDown,dirX:0,dirZ:1,knockback:0});
   }
   app.simulate(.25);
 }
 if(g.state!=='result')throw Error('progression stuck '+f.beats[f.beat].id+' '+steps);
 if(visited.size!==12)throw Error('missing beats '+[...visited]);
 if(!p.unlocked.every(Boolean))throw Error('elements not unlocked');
 app.frame();return {visited:[...visited],retried:[...retried],result:g.state,simulationSteps:steps};
 }'''),flush=True)
 page.screenshot(path='/tmp/samurai-combat-audit-result.png')
 print(json.dumps({'errors':errors}),flush=True);assert not errors
 b.close()
