import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { preferences, validateRun, readStored, writeStored } from '../src/game/progression/Storage.js';
import { Blessings } from '../src/game/progression/Blessings.js';
import { AIDirector } from '../src/game/ai/AIDirector.js';
import { PlayerCombat } from '../src/game/combat/PlayerCombat.js';
import { Stage } from '../src/game/world/Stage.js';
import { defeatAdvice } from '../src/game/combat/CombatCoach.js';
import { WEAPONS } from '../src/game/data/weapons.js';

const run=()=>({version:1,checkpoint:{beat:3,position:[0,0,80],facing:0,unlocked:[true,false,false],maxHp:120,special:.5,blessings:[['road','flow']]},playTime:300,bossSeen:true});
test('run validation rejects incompatible, corrupt and unsafe resource values',()=>{
 assert.equal(validateRun(run()).checkpoint.maxHp,120);
 for(const mutate of [r=>r.version=2,r=>r.checkpoint.beat=99,r=>r.checkpoint.position=[0,NaN,1],r=>r.checkpoint.maxHp=999,r=>r.checkpoint.special=Infinity,r=>r.checkpoint.unlocked=['yes',false,false]]){const r=run();mutate(r);assert.equal(validateRun(r),null)}
 const r=run();r.checkpoint.blessings.push(['bad','blade']);assert.equal(validateRun(r).checkpoint.blessings.length,1);
});
test('preferences are bounded and storage denial does not crash gameplay',()=>{
 assert.equal(preferences({touchSize:9,volume:-1,quality:'evil'}).touchSize,1.15);
 assert.equal(preferences({volume:-1}).volume,0);
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('denied')}});
 try{assert.equal(writeStored('run',run()),false);assert.equal(readStored('run'),null)}finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage}
});
test('parry and switching blessings stack, serialize, and cannot be farmed at one shrine',()=>{
 const b=new Blessings();assert.ok(b.choose('road','flow'));assert.equal(b.parryMp,12);assert.equal(b.choose('road','link'),false);
 assert.ok(b.choose('sanctum','link'));assert.equal(b.linkBonus,8);
 const copy=new Blessings();copy.restore(b.snapshot());assert.equal(copy.parryMp,12);assert.equal(copy.linkBonus,8);
});
test('major enemy attacks block new ranged and melee starts and release when recovery begins',()=>{
 const d=new AIDirector({});const major={alive:true,type:{elite:true},state:'attack',moveSpec:{unblockable:true}};d.agents.push(major);
 assert.equal(d.requestToken({type:{}},true),false);assert.equal(d.requestToken({type:{}},false),false);
 major.state='engage';assert.equal(d.requestToken({type:{}},true),true);
});
test('swept character movement cannot cross a thin prop and exact-center circles eject safely',()=>{
 const stage=new Stage({});stage.boxes.push([-2,2,4,4.05]);
 const from=new Vector3(),to=new Vector3(0,0,10);assert.equal(stage.moveSafely(to,from,.38),true);assert.ok(to.z<4);
 stage.circles.push({x:0,z:0,r:1});const p=new Vector3();stage.collide(p,.38);assert.ok(p.x>=1.38);
});
test('execution cannot be dodge-cancelled, heavy must reach contact, recovery accepts dodge',()=>{
 const p=Object.assign(Object.create(PlayerCombat.prototype),{state:'attack'});
 p.move=p.execute={locked:true,phase:.9,config:{cancelAt:1,hits:[.6]}};assert.equal(p._canDodge(),false);
 p.move=p.heavy={locked:true,phase:.2,config:{cancelAt:.8,hits:[.5]}};assert.equal(p._canDodge(),false);
 p.move.phase=.6;assert.equal(p._canDodge(),true);p.state='free';assert.equal(p._canDodge(),true);
});
test('stick dodge keeps requested heading and neutral dodge steps backward',()=>{
 for(const heading of [Math.PI/2,null]){
  const p=Object.assign(Object.create(PlayerCombat.prototype),{weapon:WEAPONS.katana,moves:[],character:{position:new Vector3(),facing:0},_dodge:{},body:{impulse(){}},dodgePose:{hold(){}},_cancelPoses(){},_updateDodge(){},game:{stickHeading:()=>heading}});
  p._startDodge();if(heading===null){assert.ok(p._dodge.dz<0);assert.equal(p._dodge.yaw,0)}else{assert.ok(p._dodge.dx>0);assert.ok(Math.abs(p._dodge.dz)<1e-6)}
 }
});
test('defeat advice describes guard exhaustion, rear hits and the specific ranged enemy',()=>{
 assert.match(defeatAdvice('guard','mage'),/ガード/);assert.match(defeatAdvice('rear','queen'),/背後/);assert.match(defeatAdvice('ranged','mage'),/照準/);
});
test('stuck recovery finds a short detour without crossing a barrier or a prop',()=>{
 const stage=new Stage({});stage.boxes.push([-1,1,4,6]);
 const at=new Vector3(0,0,3.5),target=new Vector3(0,0,9),next=stage.escapePoint(at,target,.4);
 assert.ok(next);assert.ok(next.distanceTo(at)<=2.001);assert.ok(next.z<4||Math.abs(next.x)>1.4);
 stage.barriers.wall={active:true,rect:[-5,5,4,4.2]};
 const blocked=stage.escapePoint(at,target,.4);assert.ok(!blocked||blocked.z<4);
});

test('reserved attack tokens cannot bypass a major wind-up and a major move waits for committed swings',()=>{
 const d=new AIDirector({}), minor={alive:true,type:{},state:'engage'}, major={alive:true,type:{elite:true},state:'engage'};
 d.agents.push(minor,major);assert.equal(d.requestToken(minor,true),true);
 major.state='attack';major.moveSpec={unblockable:true};assert.equal(d.requestToken(minor,true),false);
 major.state='engage';minor.state='attack';assert.equal(d.canStartAttack(major,{unblockable:true}),false);
 minor.state='engage';assert.equal(d.canStartAttack(major,{unblockable:true}),true);
});
test('knockdown grants protection through the complete rise and a quarter-second after',()=>{
 const p=Object.assign(Object.create(PlayerCombat.prototype),{moves:[],_knock:{},body:{fall:0},character:{position:new Vector3()},game:{},_cancelPoses(){},_faceToward(){}});
 p._stagger(1.25,0,1,2.4,true);assert.equal(p.state,'down');assert.equal(p._hurtTime,1.25);assert.equal(p.invulnerable,1.5);
});

test('slow enemies repeatedly moving into a wall still trigger stuck recovery',()=>{
 let escaped=0;
 const game={quality:{aiSkip:1,name:'low'},playerPosition:new Vector3(0,0,5),stage:{collide(p){p.z=0},escapePoint(){escaped++;return new Vector3(1,0,0)}}};
 const d=new AIDirector(game),agent={alive:true,state:'engage',type:{},radius:.4,position:new Vector3(),enemy:{_castShadows(){}},update(){this.position.z+=.01}};
 d.agents.push(agent);for(let i=0;i<100;i++)d.update(1/60,{});
 assert.equal(escaped,1);assert.equal(agent.position.x,1);
});
