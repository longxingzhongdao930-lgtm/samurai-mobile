import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { attackDirection, tipContact, behind, HeroArts } from '../src/game/hero/HeroArts.js';
import { validateHero, heroTitle } from '../src/game/hero/HeroStudio.js';
import { DragonForm } from '../src/game/combat/DragonForm.js';

test('directional attacks use body-relative input, with neutral and wrapped headings',()=>{
 assert.equal(attackDirection(null,0),'neutral');assert.equal(attackDirection(0,0),'front');assert.equal(attackDirection(Math.PI,0),'back');assert.equal(attackDirection(-Math.PI/2,0),'left');assert.equal(attackDirection(Math.PI/2,0),'right');assert.equal(attackDirection(2*Math.PI,0),'front');
});
test('tip rewards and rear openings have bounded geometry',()=>{
 assert.equal(tipContact(2.5,3),true);assert.equal(tipContact(.3,3),false);assert.equal(tipContact(4,3),false);
 const e={position:new Vector3(),facing:0};assert.ok(behind(e,new Vector3(0,0,-1)));assert.ok(!behind(e,new Vector3(0,0,1)));
});
test('hero saves reject unknown gear and cannot unlock styles through a corrupt selection',()=>{
 const h=validateHero({build:'draw',counts:{sheath:1,hits:NaN},appearance:'bad',sets:[{weapon:'bad',element:0},{weapon:'katana',element:99}]});
 assert.equal(h.build,'none');assert.equal(h.counts.hits,0);assert.equal(h.appearance,'plain');assert.deepEqual(h.sets,[]);
 assert.equal(validateHero({build:'draw',counts:{sheath:3}}).build,'draw');
});
test('titles reward different play styles without granting damage',()=>{
 assert.equal(heroTitle({damageTaken:0}),'無傷の帰還');assert.equal(heroTitle({damageTaken:10,parries:8}),'不動');assert.equal(heroTitle({damageTaken:10,maxCombo:12}),'百芸');
});
test('large-target approach is swept and cannot jump through a wall',()=>{
 const at=new Vector3(),a=Object.assign(Object.create(HeroArts.prototype),{p:{character:{position:at}},g:{stage:{moveSafely(p){p.z=Math.min(p.z,.5)}}}});
 a.stepToward({alive:true,position:new Vector3(0,0,8)},3);assert.equal(at.z,.5);
});
test('projectile cut requires the contact window and excludes lasers',()=>{
 const p={weapon:{id:'katana'},state:'attack',move:{phase:.5,config:{hits:[.5]}}};
 const a=Object.assign(Object.create(HeroArts.prototype),{p,g:{audio:{play(){}},fx:{parry(){}}}});
 assert.equal(a.cutProjectile({kind:'arrow',from:new Vector3()}),true);p.move.phase=.2;assert.equal(a.cutProjectile({kind:'arrow'}),false);p.move.phase=.5;assert.equal(a.cutProjectile({kind:'shadowLaser',unparryable:true}),false);
});
test('dragon wing guard costs reserve and never blocks unblockable damage',()=>{
 const p={hp:100,stats:{damageTaken:0}};const f=Object.assign(Object.create(DragonForm.prototype),{guarding:true,guardReserve:100,character:{position:new Vector3()},game:{player:p,fx:{block(){}},audio:{play(){}}}});
 assert.ok(f.absorb({damage:20}));assert.equal(p.hp,96.8);assert.equal(f.guardReserve,70);
 f.absorb({damage:20,unblockable:true});assert.equal(p.hp,88.8);
});
test('empty sheathing cannot farm calm, but one landed attack funds one completion',()=>{
 const p={state:'free',dead:false,spirit:{calm:0},weapon:{id:'katana'}},g={form:{active:false},weapons:{},_nearest:()=>null,hud:{notice(){}}};
 const a=Object.assign(Object.create(HeroArts.prototype),{p,g,pose:{hold(){}},mode:'sheath',t:0,rewardAvailable:false});
 const input={pending:()=>false,moving:false};a.control(.6,input);assert.equal(p.spirit.calm,0);
 a.mode='sheath';a.t=0;a.rewardAvailable=true;a.control(.6,input);assert.equal(p.spirit.calm,12);assert.equal(a.rewardAvailable,false);
 a.mode='sheath';a.t=0;a.control(.6,input);assert.equal(p.spirit.calm,12);
});
test('expiry lets a committed dragon strike land once before returning to human form',()=>{
 let strikes=0,ended=0;const f=Object.assign(Object.create(DragonForm.prototype),{time:.01,duration:10,guardReserve:100,_skillCd:0,_comboIdle:0,attack:{spec:{speed:1,hitAt:.5,end:.8},t:.49,duration:1,struck:false},game:{player:{_hold:()=>({})}},_strike(){strikes++},end(){ended++}});
 const input={held:{},pending:()=>false,consume(){}};f.control(.02,input);assert.equal(strikes,1);assert.equal(ended,0);f.control(.02,input);assert.equal(ended,1);assert.equal(strikes,1);
});
