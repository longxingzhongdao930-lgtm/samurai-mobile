import test from 'node:test';
import assert from 'node:assert/strict';
import { nextWeapon,weaponCycle } from '../src/game/combat/WeaponCycle.js';
import { SwordVariants } from '../src/game/hero/SwordVariants.js';
import { GameInput } from '../src/game/GameInput.js';
import { validateHero } from '../src/game/hero/HeroStudio.js';

test('weapon cycle places dual between selected single and odachi',()=>{
 assert.deepEqual(weaponCycle().slice(0,3),['katana','dual','odachi']);
 const p={weapon:{id:'katana'},game:{weapons:{swords:{id:'oni'}}}};
 assert.equal(nextWeapon(p),'dual');p.game.weapons.swords.id='dual';assert.equal(nextWeapon(p),'odachi');
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
 assert.equal(validateHero({sword:'classic'}).singleSword,'classic');
 assert.equal(validateHero({sword:'dual',singleSword:'dual'}).singleSword,'mythical');
});
