import json
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':844,'height':390},has_touch=True,reduced_motion='reduce',accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 attempts=[]
 def flaky(route):
  attempts.append(route.request.url)
  if len(attempts)==1: route.abort()
  else: route.continue_()
 page.route('**/models/weapons/shuriken.glb',flaky)
 page.goto(os.environ.get('GAME_URL','http://127.0.0.1:4173/')+'?q=low&dyn=0',wait_until='domcontentloaded')
 page.wait_for_function('window.app?.game?.state==="title"',timeout=240000)
 page.evaluate('app.game.journey.startPractice("queen",true)')
 page.wait_for_function('app.game.form.ready',timeout=90000)
 assert page.evaluate('localStorage.getItem("kuroame.v1.run")') is None
 page.evaluate('app.game.toTitle()')
 print('fresh-title practice loads transformation without creating a campaign save',flush=True)
 page.get_by_role('button',name='はじめる',exact=True).click()
 page.wait_for_function('app.game.state==="playing" && app.game.form.ready',timeout=90000)
 page.evaluate('app.stop();app.game.flow.update=()=>{};app.game.director.clear();app.game.player.setWeapon("shuriken");app.simulate(.02)')
 page.get_by_role('button',name='このデータを再読み込み',exact=True).wait_for(timeout=30000)
 assert page.evaluate('app.game.state')=='paused'
 page.get_by_role('button',name='このデータを再読み込み',exact=True).click()
 page.wait_for_function('app.game.weapons.models.has("shuriken")',timeout=60000)
 assert len(attempts)==2
 page.get_by_role('button',name='再開',exact=True).click()
 print('asset retry: only failed weapon retried, run preserved',flush=True)
 print(page.evaluate('''() => {
 const g=app.game,p=g.player;g.input.reset();p.revive();g.journey.options.guardToggle=true;
 g.input.press('guard');app.simulate(.02);g.input.release('guard');app.simulate(.02);
 if(!p.guarding)throw Error('toggle did not hold');g.input.press('guard');app.simulate(.02);g.input.release('guard');app.simulate(.02);
 if(p.guarding)throw Error('toggle did not release');g.journey.options.guardToggle=false;p.revive();g.input.reset();
 p.maxHp=120;g.blessings.choose('road','flow');g.flow._setCheckpoint(g.playerPosition.clone().set(0,0,80),0,3);g.journey.bossSeen=true;g.journey.save();
 const before=localStorage.getItem('kuroame.v1.run');
 for(const id of ['ashigaru','queen','samurai','mage']){
   g.journey.startPractice(id,true);app.simulate(.2);
   if(g.flow!==null||g.director.aliveCount!==1)throw Error('practice setup '+id);
   p.invulnerable=0;p.receiveHit({damage:99999,from:g.playerPosition.clone().add({x:0,y:0,z:1})});
   if(p.dead)throw Error('training death');app.simulate(.2);
   if(localStorage.getItem('kuroame.v1.run')!==before)throw Error('practice overwrote save');
 }
 g.toTitle();g.journey.continueRun();
 if(g.flow.beat!==3||p.maxHp!==120||g.blessings.parryMp!==12||!g.journey.bossSeen)throw Error('continue failed');
 if(JSON.parse(localStorage.getItem('kuroame.v1.run')).checkpoint.beat!==3)throw Error('continue erased checkpoint');
 g.pause();return {guardToggle:true,practice:4,saveAndContinue:true};
 }'''),flush=True)
 page.get_by_role('button',name='設定・記録の移行',exact=True).click()
 page.get_by_label('音量',exact=True).fill('0.4')
 page.get_by_label('カメラ感度',exact=True).fill('1.5')
 page.get_by_label('操作配置',exact=True).select_option('true')
 page.get_by_label('ガード操作',exact=True).select_option('true')
 page.get_by_label('演出',exact=True).select_option('clear')
 with page.expect_download() as download_info: page.get_by_role('button',name='記録を書き出す',exact=True).click()
 download=download_info.value;download.save_as('/tmp/kuroame-test-save.json')
 page.get_by_label('旅の記録を読み込む').set_input_files('/tmp/kuroame-test-save.json')
 page.get_by_text('読み込みました。タイトルの「続きから」で再開できます').wait_for()
 saved=page.evaluate('JSON.parse(localStorage.getItem("kuroame.v1.preferences"))')
 assert saved['volume']==.4 and saved['sensitivity']==1.5 and saved['leftHanded'] and saved['guardToggle']
 page.screenshot(path='/tmp/kuroame-settings.png')
 page.evaluate('''() => {
  const g=app.game;g.flow.checkpoint.beat=0;g.toTitle();
  if(JSON.parse(localStorage.getItem('kuroame.v1.run')).checkpoint.beat!==3)throw Error('title overwrote imported run');
 }''')
 # Reload proves preferences and checkpoint survive a fresh app instance.
 page.reload(wait_until='domcontentloaded');page.wait_for_function('window.app?.game?.state==="title"',timeout=240000)
 assert page.evaluate('app.game.journey.options.volume')==.4
 page.get_by_role('button',name='続きから',exact=True).click()
 page.wait_for_function('app.game.state==="playing" && app.game.form.ready',timeout=90000)
 print(page.evaluate('''() => {
 app.stop();const g=app.game;g.flow.update=()=>{};g.director.clear();
 if(g.flow.beat!==3||g.player.maxHp!==120||!g.touch.root.classList.contains('tc--left'))throw Error('reload state');
 const pad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false}))};
 Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
 g.player.revive();pad.axes[0]=1;g.gamepad.poll(.016);if(g.input.sample().x<.9)throw Error('gamepad movement');
 pad.axes[0]=0;pad.buttons[1].pressed=true;g.gamepad.poll(.016);if(!g.input.pending('dodge'))throw Error('gamepad dodge');
 pad.buttons[1].pressed=false;g.gamepad.poll(.016);g.input.reset();g.pause();
 document.querySelector('[data-action=settings]').focus();pad.buttons[0].pressed=true;g.gamepad.poll(.016);
 if(!document.querySelector('.gs-settings'))throw Error('gamepad menu');pad.connected=false;g.gamepad.poll(.016);
 g.resume();g.journey.options.guardToggle=false;g.player.revive();g.player.setWeapon('katana');
 g.flow._place(g.playerPosition.clone().set(0,0,80),0);const a=g.director.spawn('mage',0,92,Math.PI);g.stage.setBarrier('plazaA',true);
 if(g.targetVisible(a.enemy))throw Error('lock sees through wall');g.stage.setBarrier('plazaA',false);if(!g.targetVisible(a.enemy))throw Error('visible lock lost');
 a._startAttack(a.type.attacks[0]);app.simulate(.1);if(!g.coach.warnings.length)throw Error('missing warning');
 g.director.clear();g.coach.clear();g.flow._place(g.playerPosition.clone().set(0,0,124),0);g.input.reset();
 for(let i=0;i<4;i++)app.frame();
 return {reloaded:true,gamepad:true,lockVisibility:true,telegraph:true};
 }'''),flush=True)
 page.screenshot(path='/tmp/kuroame-left-handed.png')
 print(page.evaluate("""() => {
  const g=app.game,before=localStorage.getItem('kuroame.v1.run');
  g.journey.startPractice('tarislandDragon',false);
  const a=g.director.agents[0];if(g.cinematic||a.state==='intro')throw Error('boss intro was not skipped');
  const spec=a.type.attacks.find(s=>s.ring);g.coach.clear();a._startAttack(spec);
  a.position.x+=1;g.coach.update(0);
  if(g.coach.warnings[0].ring.position.x!==a.position.x)throw Error('danger ring left behind moving enemy');
  a.onDefeated();app.simulate(3.2);
  if(!g.screens.open||g.state!=='paused')throw Error('boss rematch did not return to menu');
  if(localStorage.getItem('kuroame.v1.run')!==before)throw Error('boss rematch overwrote run');
  g.toTitle();return {bossRematch:true,shortIntro:true};
 }"""),flush=True)

 print(json.dumps({'pageErrors':errors}),flush=True);assert not errors
 b.close()
