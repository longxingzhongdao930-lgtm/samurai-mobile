import json
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']);p=b.new_page(viewport={'width':1100,'height':750});errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto('http://127.0.0.1:4181/motions.html');p.wait_for_function('window.motionBot?.current',timeout=240000)
 for name in ['vergil','force-edge','judgement-cut-end']:
  url='./models/reference/'+name+'.glb';p.select_option('#model',url);p.wait_for_function('(url)=>window.motionBot?.sourceUrl===url',arg=url,timeout=240000);p.wait_for_timeout(500);p.screenshot(path='/tmp/reference-'+name+'.png');print(name,p.locator('#status').inner_text());print(p.evaluate('(()=>{let bones=0,meshes=0;motionBot.model.traverse(n=>{if(n.isBone)bones++;if(n.isMesh)meshes++;});return {bones,meshes,mapped:motionBot.current?.mapped.length};})()'))
  if name=='vergil':
   assert p.evaluate('motionBot.current?.mapped.length')==599
   assert p.evaluate('motionBot.current?.missing.length')==0
   assert p.evaluate('Object.keys(motionBot.model.userData.motionRest).length')==598
   with p.expect_download() as download:p.click('#save-library')
   download.value.save_as('/tmp/vergil-motion-library.json');library=json.loads(Path('/tmp/vergil-motion-library.json').read_text());assert len(library['motions'])==21;assert len(library['sourceSkeleton'])==598
   for clip in ['sheathed','stance','sheath','walk','judgement']:
    p.select_option('#motion',clip);p.wait_for_timeout(300);p.screenshot(path='/tmp/vergil-'+clip+'.png')
 assert not errors,errors;b.close()
