"""Verify sword-specific loadouts through the actual settings UI and reload."""
import json, os
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('GAME_URL','http://127.0.0.1:4181/')+'?q=low&dyn=0')
 page.wait_for_function('window.app?.game?.state==="title"',timeout=240000);page.evaluate('app.stop()')
 page.get_by_role('button',name='はじめる',exact=True).click()
 page.evaluate('()=>{app.game.heroStudio.menu(()=>{});const swords=app.game.weapons.swords,load=swords.load.bind(swords);window.swordGate=new Promise(done=>window.releaseSword=done);swords.load=async name=>{await window.swordGate;return load(name);};}')
 for sword,name in [('dual','二刀セット'),('oni','鬼殺しセット')]:
  page.get_by_label('刀装',exact=True).select_option(sword)
  if sword=='dual':
   assert page.get_by_role('button',name='装備セットを保存',exact=True).is_disabled()
   page.evaluate('releaseSword()')
  page.wait_for_function('id=>app.game.heroStudio.sword===id && app.game.weapons.swords.id===id',arg=sword)
  page.get_by_label('装備名',exact=True).fill(name)
  page.get_by_role('button',name='装備セットを保存',exact=True).click()
 page.evaluate('()=>{const h=app.game.heroStudio;h.counts.sheath=3;h.build="draw";h.menu(()=>{});}')
 page.get_by_role('button',name='装備 2：二刀セット · 二刀流',exact=True).click()
 page.wait_for_function('app.game.heroStudio.sword==="dual" && app.game.weapons.swords.id==="dual"')
 assert page.get_by_label('刀装',exact=True).input_value()=='dual'
 assert page.evaluate('!!app.game.heroPresence.sheath.getObjectByName("dual_katana_scabbard")')
 assert page.get_by_label('戦いの型',exact=True).input_value()=='none'
 page.reload(wait_until='domcontentloaded')
 page.wait_for_function('window.app?.game?.state==="title" && app.game.weapons.swords.id==="dual"',timeout=240000);page.evaluate('app.stop()')
 page.evaluate('()=>app.game.heroStudio.menu(()=>{})')
 page.get_by_role('button',name='装備 1：鬼殺しセット · 単刀2 · 鬼殺し',exact=True).click()
 page.wait_for_function('app.game.heroStudio.sword==="oni" && app.game.weapons.swords.id==="oni"')
 assert page.get_by_label('刀装',exact=True).input_value()=='oni'
 assert page.evaluate('!!app.game.heroPresence.sheath.getObjectByName("oni_katana_scabbard")')
 assert not errors
 print(json.dumps({'restoredSets':page.evaluate('app.game.heroStudio.sets.map(s=>({name:s.name,sword:s.sword}))'),'reloadPassed':True,'pageErrors':errors}),flush=True)
 browser.close()
