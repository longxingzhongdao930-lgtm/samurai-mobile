"""Synthetic layout/crowd/guide checks; software rendering is not a phone FPS test."""
import json
import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':844,'height':390},has_touch=True,reduced_motion='reduce')
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 base=os.environ.get('GAME_URL','http://127.0.0.1:4173/')
 page.goto(base+'?q=low&dyn=0',wait_until='domcontentloaded')
 page.wait_for_function('window.app?.game?.state==="title"',timeout=240000)
 page.get_by_role('button',name='はじめる',exact=True).click()
 page.wait_for_function('app.game.form.ready',timeout=90000)
 page.evaluate('app.stop();app.game.flow.update=()=>{};app.game.director.clear();app.game.input.reset()')
 for w,h in [(844,390),(568,320),(667,375)]:
  page.set_viewport_size({'width':w,'height':h})
  print(page.evaluate('''() => {
   const g=app.game,checked=[];
   for(const left of [false,true])for(const size of [.85,1.15]){
    g.journey.options.leftHanded=left;g.journey.options.touchSize=size;g.journey.apply();
    for(const el of g.touch.root.querySelectorAll('button')){
     const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
     const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
     if(r.width<43.9||r.height<43.9||r.x<0||r.y<0||r.right>innerWidth||r.bottom>innerHeight||!el.contains(top))throw Error('unreachable control '+[innerWidth,innerHeight,left,size,el.className,JSON.stringify(r)]);
    }
    checked.push({left,size});
   }return {viewport:[innerWidth,innerHeight],checked};
  }'''),flush=True)
 print(page.evaluate('''() => {
  const g=app.game;g.player.invulnerable=999;g.flow._place(g.playerPosition.clone().set(0,0,124),0);
  for(let i=0;i<14;i++)g.director.spawn(['ashigaru','queen','mage','samurai','dragon','infinian','achates'][i%7],(i%5-2)*2,128+Math.floor(i/5)*3,Math.PI,{alert:true});
  const start=performance.now();app.simulate(10);const simulationMs=performance.now()-start;
  if(g.director.agents.some(a=>!Number.isFinite(a.position.x+a.position.z)))throw Error('nonfinite crowd');
  if(g.coach.warnings.length>3)throw Error('unbounded warnings');
  for(let i=0;i<4;i++)app.frame();
  const r=app.renderer.gl.info;
  return {crowd:14,simulatedSeconds:10,simulationMs:Math.round(simulationMs),drawCalls:r.render.calls,triangles:r.render.triangles,geometries:r.memory.geometries,textures:r.memory.textures,warningCount:g.coach.warnings.length};
 }'''),flush=True)
 page.screenshot(path='/tmp/kuroame-crowd.png')
 page.evaluate('app.game.pause();app.game.journey.settings(()=>app.game.resume())')
 page.wait_for_function('getComputedStyle(document.querySelector(".gs-settings")).opacity==="1"')
 page.screenshot(path='/tmp/kuroame-settings-top.png')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.goto(base+'characters.html',wait_until='domcontentloaded')
 for name in ['queen','samurai','mage','dragon','achates','infinian']:
  page.locator(f'[data-id="{name}"]').click()
  page.wait_for_function('(name)=>window.characterGuide?.selected === name',arg=name,timeout=120000)
  page.locator('[data-motion="attack0"]').click()
  page.wait_for_timeout(200)
  print('guide motion: '+name,flush=True)
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/kuroame-guide-mobile.png',full_page=True)
 print(json.dumps({'pageErrors':errors}),flush=True);assert not errors
 b.close()
