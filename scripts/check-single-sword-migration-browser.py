"""Old dual saves migrate without loading deleted models or losing progress."""
import json,os
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page();errors=[];removed=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:removed.append(r.url) if 'dual-katana' in r.url else None)
 p.add_init_script("localStorage.setItem('kuroame.v1.hero',JSON.stringify({sword:'dual',singleSword:'oni',counts:{hits:17},sets:[{name:'旧装備',weapon:'katana',sword:'dual',element:0}]}));")
 p.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0');p.wait_for_function('window.app?.game?.state==="title"',timeout=240000);p.evaluate('app.stop()')
 state=p.evaluate('''()=>{const g=app.game;return {sword:g.heroStudio.sword,equipped:g.weapons.swords.id,set:g.heroStudio.sets[0].sword,hits:g.heroStudio.counts.hits,combo:g.player.combo.length,dualRig:!!g.heroPresence.dualKatana};}''')
 assert state=={'sword':'oni','equipped':'oni','set':'oni','hits':17,'combo':5,'dualRig':False},state
 p.get_by_role('button',name='はじめる',exact=True).click()
 assert p.evaluate("async()=>await app.game.weapons.swords.select('dual')") is False
 assert not errors and not removed,(errors,removed)
 print(json.dumps({'save':state,'removedAssetRequests':removed,'pageErrors':errors}));b.close()
