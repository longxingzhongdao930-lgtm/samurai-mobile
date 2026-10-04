import json
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']);p=b.new_page(viewport={'width':1100,'height':750});errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto('http://127.0.0.1:4181/motions.html');p.wait_for_function('window.motionBot?.current?.mapped.length>0',timeout=240000);rows=[]
 for model in ['./models/tpose.fbx','./models/characters/samurai.glb','./models/characters/queen.glb','./models/characters/mage.glb']:
  if model!='./models/tpose.fbx':
   p.select_option('#model',model);p.wait_for_function('(url)=>window.motionBot?.sourceUrl===url && window.motionBot.current?.mapped.length>0',arg=model,timeout=240000)
   p.wait_for_timeout(200)
  rows.append(p.evaluate('({model:document.querySelector("#model").value,mapped:motionBot.current.mapped.length,missing:motionBot.current.missing.length,bones:motionBot.current.mapped.slice(0,4)})'));p.screenshot(path='/tmp/bot-'+model.rsplit('/',1)[-1]+'.png')
 p.select_option('#model','./models/tpose.fbx');p.wait_for_timeout(1500);p.select_option('#motion','judgement');p.wait_for_function('motionBot.current.clip.name==="黒雨・次元斬"');p.select_option('#motion','quickDraw');p.wait_for_function('motionBot.current.clip.name==="黒雨・抜刀一閃"');p.fill('#chest','5');p.click('#apply');p.click('#play');p.locator('#time').fill('0.5');p.screenshot(path='/tmp/motion-bot-adjusted.png')
 with p.expect_download() as download:p.click('#save')
 item=download.value;item.save_as('/tmp/motion-bot-adjusted.json');saved=json.loads(Path('/tmp/motion-bot-adjusted.json').read_text());assert saved['tracks'];assert saved['sourceRest'];assert all('scale' in bone for bone in saved['sourceRest'].values());p.check('#bones')
 with p.expect_download() as download:p.click('#save-library')
 item=download.value;item.save_as('/tmp/black-rain-motion-library.json');library=json.loads(Path('/tmp/black-rain-motion-library.json').read_text());assert len(library['motions'])==22;assert any(m['id']=='quickDraw' for m in library['motions']);assert library['sourceSkeleton'];assert all('scale' in bone and 'parent' in bone for bone in library['sourceSkeleton'].values());assert not errors,errors
 print(json.dumps({'models':rows,'download':item.suggested_filename,'errors':errors}));b.close()
