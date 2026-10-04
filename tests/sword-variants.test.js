import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { SwordVariants } from '../src/game/hero/SwordVariants.js';
import { HeroStudio, validateHero } from '../src/game/hero/HeroStudio.js';

function rig(){
 const slot={model:new Group(),mount:new Group()};slot.mount.add(slot.model);
 const game={player:{weapon:{id:'katana'}},heroPresence:{sheath:new Group(),katanaSheath:{invalidate(){}}}};
 const weapons={current:'katana',_slot:()=>slot,_rebindTrail(){}};
 return new SwordVariants(game,weapons);
}
test('latest sword selection wins when older downloads finish last',async()=>{
 const swords=rig(),resolve=new Map();
 swords.load=name=>new Promise(done=>resolve.set(name,()=>{swords.templates.set(name,new Group());done();}));
 const old=swords.select('oni'),latest=swords.select('classic');
 resolve.get('katana-classic')();resolve.get('katana-classic-scabbard')();
 assert.equal(await latest,true);const blade=swords.blade,cover=swords.g.heroPresence.sheath.children[0];
 resolve.get('katana-oni')();resolve.get('katana-oni-scabbard')();
 assert.equal(await old,false);assert.equal(swords.id,'classic');assert.equal(swords.blade,blade);assert.equal(swords.g.heroPresence.sheath.children[0],cover);
});
test('failed sword download preserves the equipped blade and matching cover',async()=>{
 const swords=rig();swords.load=async name=>swords.templates.set(name,new Group());
 await swords.select('classic');const blade=swords.blade,cover=swords.g.heroPresence.sheath.children[0];
 swords.load=async()=>{throw Error('offline');};await assert.rejects(swords.select('oni'),/offline/);
 assert.equal(swords.id,'classic');assert.equal(swords.blade,blade);assert.equal(swords.g.heroPresence.sheath.children[0],cover);
});
test('saved single sword IDs survive validation and unknown selections use the default',()=>{
 for(const sword of ['mythical','oni','classic'])assert.equal(validateHero({sword}).sword,sword);
 assert.equal(validateHero({sword:'invalid'}).sword,'mythical');
});

test('chosen sword is restored by a new studio instance',()=>{
 const previous=globalThis.localStorage,values=new Map();
 globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 try {const first=new HeroStudio({});first.sword='oni';first.save();assert.equal(new HeroStudio({}).sword,'oni');}
 finally {if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
