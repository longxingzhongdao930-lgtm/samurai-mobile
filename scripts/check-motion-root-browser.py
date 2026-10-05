"""Play, scrub, and save whole-body travel on different humanoid rigs."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':960,'height':640});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto('http://127.0.0.1:4181/motions.html');p.wait_for_function('window.motionBot?.current?.mapped.length>0',timeout=240000)
 p.select_option('#motion','end');p.wait_for_function('motionBot.current.clip.name==="黒雨・次元斬絶"')
 results=[]
 for model in ['./models/tpose.fbx','./models/characters/samurai.glb','./models/characters/queen.glb','./models/characters/mage.glb']:
  if p.locator('#model').input_value()!=model:
   p.select_option('#model',model);p.wait_for_function('(url)=>motionBot.sourceUrl===url&&motionBot.current?.clip.name==="黒雨・次元斬絶"',arg=model,timeout=240000)
  p.locator('#time').fill('0.2');p.wait_for_function('motionBot.wrapper.position.length()>.1')
  row=p.evaluate('({model:motionBot.sourceUrl,mapped:motionBot.current.mapped.length,missing:motionBot.current.missing.length,missingNames:motionBot.current.missing,position:motionBot.wrapper.position.toArray()})');assert all(__import__('math').isfinite(v) for v in row['position']);assert all('end' in n.lower() for n in row['missingNames']),row;results.append(row);p.screenshot(path='/tmp/motion-root-'+model.rsplit('/',1)[-1]+'.png')
  p.locator('#time').fill('1');p.wait_for_function('motionBot.wrapper.position.length()<.01')
 p.select_option('#model','./models/tpose.fbx');p.wait_for_function('motionBot.sourceUrl==="./models/tpose.fbx"&&motionBot.current?.clip.name==="黒雨・次元斬絶"',timeout=240000)
 with p.expect_download() as d:p.click('#save')
 d.value.save_as('/tmp/motion-bot-end-with-travel.json');saved=json.loads(Path('/tmp/motion-bot-end-with-travel.json').read_text());assert saved['movement']['units']=='metres';assert len(saved['movement']['samples'])>100;assert saved['sourceRest']
 with p.expect_download() as library_download:p.click('#save-library')
 library_download.value.save_as('/tmp/black-rain-motion-library-with-travel.json');library=json.loads(Path('/tmp/black-rain-motion-library-with-travel.json').read_text());assert len(library['motions'])==32;assert next(m for m in library['motions'] if m['id']=='end')['movement']['samples']
 p.select_option('#motion','sheathed');p.wait_for_function('motionBot.current.clip.name==="黒雨・納刀直立"&&motionBot.wrapper.position.length()<.01')
 assert not errors,errors;print(json.dumps({'rigs':results,'savedTravelSamples':len(saved['movement']['samples']),'stationaryReset':True,'errors':errors}));b.close()
