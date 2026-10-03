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
