import test from 'node:test';
import assert from 'node:assert/strict';
import { nextWeapon,weaponCycle } from '../src/game/combat/WeaponCycle.js';
import { SwordVariants } from '../src/game/hero/SwordVariants.js';
import { GameInput } from '../src/game/GameInput.js';
import { validateHero } from '../src/game/hero/HeroStudio.js';

test('weapon cycle is single katana only',()=>{
 assert.deepEqual(weaponCycle(),['katana']);
 const p={weapon:{id:'katana'},game:{weapons:{swords:{id:'oni'}}}};
 assert.equal(nextWeapon(p),'katana');p.game.weapons.swords.id='dual';assert.equal(nextWeapon(p),'katana');
 p.weapon.id='shuriken';assert.equal(nextWeapon(p),'katana');
});
test('an asynchronously loaded sword cannot apply after the player becomes unavailable',async()=>{
 const swords=new SwordVariants({},{});let complete;
 swords.load=()=>new Promise(resolve=>complete=resolve);
 let available=true;const pending=swords.select('mythical',{canApply:()=>available});available=false;complete();
 assert.equal(await pending,false);assert.equal(swords.blade,undefined);
});
test('an unavailable jump is consumed and never delayed until landing or recovery',()=>{
 const input=Object.assign(Object.create(GameInput.prototype),{enabled:true,_edges:{jump:0},canJump:()=>false});
 assert.equal(input.consumeJump(),false);input.canJump=()=>true;assert.equal(input.consumeJump(),false);
 input._edges.jump=0;assert.equal(input.consumeJump(),true);assert.equal(input.consumeJump(),false);
});
test('single sword memory survives a saved dual loadout and rejects invalid IDs',()=>{
 assert.equal(validateHero({sword:'dual',singleSword:'oni'}).singleSword,'oni');
 assert.equal(validateHero({sword:'dual',singleSword:'oni'}).sword,'oni');
 assert.equal(validateHero({sword:'dual',sets:[{weapon:'katana',sword:'dual',element:0}]}).sets[0].sword,'mythical');
 assert.equal(validateHero({sword:'classic'}).singleSword,'classic');
 assert.equal(validateHero({sword:'dual',singleSword:'dual'}).singleSword,'mythical');
});

test('removed dual sword cannot be loaded or selected',async()=>{const swords=new SwordVariants({},{});swords.load=()=>{throw Error('must not load removed assets');};assert.equal(await swords.select('dual'),false);});

test('older weapon loadouts migrate to katana without losing sword choice or counts',()=>{
 const h=validateHero({sword:'oni',build:'return',counts:{hits:19,fist:8},sets:[{weapon:'gauntlet',element:0,build:'return'},{weapon:'odachi',sword:'classic',element:1}]});
 assert.equal(h.counts.hits,19);assert.equal(h.counts.fist,8);assert.equal(h.build,'none');assert.equal(h.sword,'oni');
 assert.deepEqual(h.sets.map(s=>s.weapon),['katana','katana']);assert.equal(h.sets[1].sword,'classic');
});
