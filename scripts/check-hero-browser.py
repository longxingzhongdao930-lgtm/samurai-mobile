import json,os
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':844,'height':390},has_touch=True,reduced_motion='reduce',accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('GAME_URL','http://127.0.0.1:4173/')+'?q=low&dyn=0',wait_until='domcontentloaded')
 page.wait_for_function('window.app?.game?.state==="title"',timeout=240000)
 page.get_by_role('button',name='はじめる',exact=True).click();page.wait_for_function('app.game.form.ready',timeout=90000)
 print(page.evaluate('''() => {
 app.stop();const g=app.game,p=g.player;g.flow.update=()=>{};g.director.clear();g.magic.clear();p.revive();p.invulnerable=999;g.input.reset();
 g.flow._place(g.playerPosition.clone().set(0,0,124),0);
 p.arts.rewardAvailable=true;g.input.press('sheath');g.input.release('sheath');app.simulate(.8);
 if(p.arts.mode!=='sheathed'||p.spirit.calm!==12)throw Error('sheath reward '+p.arts.mode+' '+p.spirit.calm);
 g.input.press('attack');app.simulate(.5);if(p.arts.mode!=='charge')throw Error('not charging');
 const before=g.playerPosition.clone();g.input.stick.active=true;g.input.stick.y=1;app.simulate(.4);
 if(g.playerPosition.distanceTo(before)<.05)throw Error('charge cannot move');
 g.input.reset();g.input.press('guard');app.simulate(.02);g.input.release('guard');
 if(p.arts.mode)throw Error('guard did not cancel charge');app.simulate(.2);
 p.arts.charge();g.input.press('attack');app.simulate(.4);g.input.release('attack');app.simulate(.02);
 if(p.move!==p.heavy)throw Error('release did not draw');app.simulate(3);
 g.input.press('kick');app.simulate(.02);g.input.release('kick');if(p.move!==p.kickMove)throw Error('kick missing');app.simulate(2);
 p.special=1;g.input.press('special');app.simulate(.02);g.input.release('special');
 if(!g.form.active||p.arts.transform<=0)throw Error('partial transform');app.simulate(3);
 g.input.press('sheath');app.simulate(.02);g.input.release('sheath');
 if(g.form.active||p.special<=0||p.special>.65)throw Error('manual revert reserve');app.simulate(1);
 p.arts.charge();g.input.press('attack');g.pause();g.resume();app.simulate(.1);
 if(p.arts.mode||p.state!=='free')throw Error('pause released an unwanted attack');
 p.arts.charge();p.invulnerable=0;p.receiveHit({damage:5,from:g.playerPosition.clone().add({x:0,y:0,z:1})});
 if(p.arts.mode)throw Error('damage kept charge active');app.simulate(1);
 return {sheath:true,movingCharge:true,cancel:true,kick:true,manualRevert:true,chargeInterruption:true};
 }'''),flush=True)
 print(page.evaluate('''async () => {
 const g=app.game,p=g.player;p.revive();g.director.clear();p.setWeapon('gauntlet');await g.weapons.pending.get('gauntlet');
 for(let n=0;n<20&&!g.weapons.fist;n++)await new Promise(r=>setTimeout(r,20));
 const f=g.weapons.fist;if(!f)throw Error('fist not equipped');
 f.launch({damage:10,posture:5},null);app.simulate(.1);f.recall(true);app.simulate(.2);
 if(f.flight)app.simulate(.2);if(p.arts.returnGuard<=0)throw Error('return guard absent');
 p.invulnerable=0;const result=p.receiveHit({damage:20,from:g.playerPosition.clone().add({x:0,y:0,z:1})});if(result!=='parry')throw Error('return guard result '+result);
 g.director.clear();p.revive();g._resetTransientCombat();g.stage.clearBarriers();g.flow._place(g.playerPosition.clone().set(0,0,124),0);
 const a=g.director.spawn('infinian',0,131,Math.PI);a.cooldown=999;a.hp=5000;
 const from=g.playerPosition.clone();f.launch({damage:10,posture:5,gripPull:true},a.enemy);app.simulate(.8);
 if(g.playerPosition.distanceTo(from)<.5)throw Error('large target approach failed');
 if(!Number.isFinite(f.model.position.x))throw Error('bad fist pose');
 g.director.clear();g._resetTransientCombat();
 p.arts.startSheath();app.simulate(.6);g.input.press('attack');app.simulate(.4);g.input.release('attack');app.simulate(.05);
 if(p.weapon.id!=='katana'||p.move!==p.heavy||!p.move.config.heroLink)throw Error('fist to draw link '+p.weapon.id+' '+p.arts.link+' '+p.arts.mode);
 return {returnGuard:true,largeApproach:true,fistDrawLink:true};
 }'''),flush=True)
 print(page.evaluate('''() => {
 const g=app.game,p=g.player;g.director.clear();g.weapons.clear();p.setWeapon('katana');p.revive();g.input.reset();
 g.heroStudio.counts.sheath=3;g.heroStudio.build='draw';g.heroStudio.save();
 for(const appearance of ['hat','mask','coat']){g.heroStudio.appearance=appearance;app.simulate(.1);if(!g.heroPresence[appearance==='hat'?'hat':appearance==='mask'?'mask':'coat'].visible)throw Error('missing outfit '+appearance)}
 const saved=localStorage.getItem('kuroame.v1.run');g.heroStudio.trial();if(localStorage.getItem('kuroame.v1.run')!==saved)throw Error('trial changed save');
 g.heroStudio.menu(()=>g.heroStudio.trialMenu());return {styles:true,appearances:3,trial:true};
 }'''),flush=True)
 page.get_by_role('button',name='装備セットを保存',exact=True).click()
 assert page.get_by_role('button',name='装備 1：刀',exact=True).count()==1
 page.get_by_role('button',name='フォトモード',exact=True).click()
 page.get_by_label('画角',exact=True).fill('45');page.get_by_label('背景ぼけ',exact=True).fill('0.001')
 page.evaluate('for(let i=0;i<4;i++)app.frame()')
 assert page.evaluate('app.camera.fov')==45
 page.get_by_label('距離',exact=True).fill('3.2');page.get_by_label('左右',exact=True).fill('180')
 for appearance in ['hat','mask','coat']:
  page.evaluate('(a)=>{app.game.heroStudio.appearance=a;app.game.screens.root.style.visibility="hidden";for(let i=0;i<4;i++)app.frame()}',appearance)
  page.screenshot(path='/tmp/kuroame-hero-'+appearance+'.png')
 page.evaluate('app.game.screens.root.style.visibility=""')
 with page.expect_download() as event:page.get_by_role('button',name='画像を保存',exact=True).click()
 event.value.save_as('/tmp/kuroame-hero-photo.png')
 assert os.path.getsize('/tmp/kuroame-hero-photo.png')>10000
 page.get_by_role('button',name='戻る',exact=True).click()
 assert page.evaluate('app.game.heroStudio.photo===null && app.game.heroStudio.bokeh===null')
 print(json.dumps({'photoExport':True,'pageErrors':errors}),flush=True);assert not errors
 b.close()
