import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group, Vector3 } from 'three';
import { FlyingGauntlet } from '../src/game/combat/FlyingGauntlet.js';
import { SwordVolley } from '../src/game/ai/SwordVolley.js';
import { segmentDistanceSq } from '../src/game/combat/FlightPath.js';

test('swept hit test catches a target between two flight frames', () => {
  assert.equal(segmentDistanceSq(new Vector3(0,0,5),new Vector3(),new Vector3(0,0,10)),0);
  assert.equal(segmentDistanceSq(new Vector3(2,0,5),new Vector3(),new Vector3(0,0,10)),4);
});

test('the single original gauntlet hits at range once, returns, and restores the hand on removal', () => {
  const hand = new Bone(), scene = new Group(), pos = new Vector3();
  const target = { alive: true, position: new Vector3(0,0,8), agent: { type: {height:1.8}, radius:.4, state:'engage' } };
  let damage = 0;
  const g = { app: {scene, character: {position:pos,facing:0,getBone:()=>hand}}, playerPosition:pos,
    player: { weapon:{id:'gauntlet'},state:'free',onRangedHit:()=>{},air:{launch:()=>{}} }, weapons:{current:'gauntlet'}, form:{active:false},
    enemies:{enemies:[target]},damageEnemy:()=>{damage++;return {damage:10}},stage:{blocks:()=>false} };
  const model=new Group(), fist=new FlyingGauntlet(g,model);
  fist.lateUpdate();assert.equal(hand.scale.x,.001);assert.ok(new Vector3(0,0,1).applyQuaternion(model.quaternion).y < -.99);
  fist.launch({damage:10,posture:3},target);assert.equal(damage,0);
  for(let i=0;i<120;i++){fist.update(1/60);fist.lateUpdate()}
  assert.equal(damage,1);assert.equal(fist.flight,null);assert.equal(scene.children.length,1);assert.ok(model.position.distanceTo(fist.home())<.001);
  fist.launch({damage:10},target);fist.update(.05);fist.dispose();assert.equal(hand.scale.x,1);assert.equal(fist.flight,null);assert.equal(scene.children.length,0);
});

test('queen sends one real sword at a time, damages on travel, and restores every bone', () => {
  const root=new Group(), bones=Array.from({length:6},()=>{const b=new Bone();b.position.y=1.1;root.add(b);return b});
  let hits=0;
  const e={alive:true,agent:{state:'attack',game:{playerPosition:new Vector3(0,0,6),player:{receiveHit:()=>{hits++;return 'hit'}},stage:{blocks:()=>false}}}};
  const volley=new SwordVolley(e,bones);
  volley.enqueue({damage:8});volley.enqueue({damage:8});assert.equal(hits,0);
  for(let i=0;i<240;i++){volley.beforeAnimate();root.updateMatrixWorld(true);volley.update(1/60)}
  assert.equal(hits,2);assert.equal(volley.index,2);assert.equal(volley.flight,null);
  for(const b of bones)assert.ok(b.position.distanceTo(new Vector3(0,1.1,0))<.001);
  volley.enqueue({damage:8});volley.update(.1);e.alive=false;volley.update(.1);
  assert.equal(volley.flight,null);assert.equal(volley.queue.length,0);assert.equal(hits,2);
});

function gripFixture(elite = false, blocked = false) {
  const hand = new Bone(), pos = new Vector3(), hits = [], launches = [];
  const enemy = { alive: true, position: new Vector3(0,0,8) };
  enemy.agent = { alive:true,type:{id:'samurai',height:1.8,elite},radius:.4,state:'engage',moves:[],velocity:{x:0,z:0},_knock:{x:0,z:0},kneel:{stop(){}},fall:{stop(){}},_recoil(){} };
  const g = { app:{scene:new Group(),character:{position:pos,facing:0,getBone:()=>hand},terrain:{heightAt:()=>0}},playerPosition:pos,
    player:{weapon:{id:'gauntlet'},state:'free',onRangedHit(){},air:{active:false,launch(e){launches.push(e)}}},weapons:{current:'gauntlet'},form:{active:false},
    enemies:{enemies:[enemy]},director:{releaseToken(){}},damageEnemy(e,hit){hits.push(hit);return {damage:hit.damage}},
    stage:{blocks:()=>false,collide(p){if(blocked)p.z=Math.max(5,p.z)}} };
  const fist = new FlyingGauntlet(g,new Group());
  fist.launch({damage:14,posture:38,gripPull:true,airLauncher:true},enemy);
  return {g,enemy,fist,hits,launches};
}
test('charged hand pulls a small enemy into reach, launches once and releases control', () => {
  const f=gripFixture();for(let i=0;i<150;i++)f.fist.update(1/60);
  assert.ok(f.enemy.position.z<=2);assert.equal(f.launches.length,1);assert.equal(f.enemy.agent.grabbed,false);assert.equal(f.hits.length,1);
});
test('large targets take posture damage without moving; walls and weapon changes release the grip', () => {
  const large=gripFixture(true);for(let i=0;i<150;i++)large.fist.update(1/60);
  assert.equal(large.enemy.position.z,8);assert.equal(large.hits[0].posture,58);assert.equal(large.launches.length,0);
  const wall=gripFixture(false,true);for(let i=0;i<150;i++)wall.fist.update(1/60);
  assert.ok(wall.enemy.position.z>=5);assert.equal(wall.launches.length,0);assert.equal(wall.enemy.agent.grabbed,false);
  const change=gripFixture();for(let i=0;i<60&&!change.enemy.agent.grabbed;i++)change.fist.update(1/60);
  assert.ok(change.enemy.agent.grabbed);change.g.player.weapon.id='katana';change.fist.update(1/60);
  assert.equal(change.enemy.agent.grabbed,false);assert.equal(change.fist.flight,null);
});
test('only timed parries reflect swords; the third returned impact breaks posture once', () => {
  const root=new Group(),bone=new Bone();bone.position.y=1.1;root.add(bone);
  const hits=[];let result='block';
  const e={alive:true,position:new Vector3(),agent:{state:'attack',type:{height:1.9},radius:.4,maxPosture:80}};
  e.agent.game={playerPosition:new Vector3(0,0,6),player:{receiveHit:()=>result},stage:{blocks:()=>false},damageEnemy:(e,hit)=>hits.push(hit)};
  const volley=new SwordVolley(e,[bone]);
  const run=()=>{volley.enqueue({damage:8});for(let i=0;i<200;i++){volley.beforeAnimate();root.updateMatrixWorld(true);volley.update(1/60)}};
  run();assert.equal(hits.length,0);
  result='parry';run();run();assert.equal(hits.length,2);assert.equal(hits[0].posture,0);
  run();assert.equal(hits.length,3);assert.equal(hits[2].posture,80);assert.equal(volley.reflections,0);assert.equal(volley.flight,null);
});
