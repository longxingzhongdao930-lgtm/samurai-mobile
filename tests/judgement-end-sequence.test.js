import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { END_SEQUENCE, endSequence, endTravel, endStroke, endTravelDuration } from '../src/game/hero/JudgementEndSequence.js';
import { KatanaAfterimages } from '../src/game/fx/KatanaAfterimages.js';
test('low quality can display every traveling slash before the finisher field',()=>{
 const model=new Group(),root=new Group();root.add(model);const c={root,model},fx=new KatanaAfterimages(new Group(),2);let emitted=0;
 for(let t=0;t<END_SEQUENCE.field;t+=1/120){fx.update(1/120);if(emitted<END_SEQUENCE.travel.length&&t>=END_SEQUENCE.travel[emitted]){const path=endTravel(emitted,new Vector3(),new Vector3(0,1,3));assert.ok(fx.emit(c,path.from,path.to,.32,path.clip,path));emitted++;}}
 assert.equal(emitted,5);assert.ok(fx.pool.every(s=>s.life===0));fx.dispose();
});
test('curved afterimage path has height and depth without moving source character',()=>{
 const root=new Group(),model=new Group();root.add(model);const origin=new Vector3(0,0,1),target=new Vector3(0,1,4),before=origin.clone(),path=endTravel(0,origin,target),fx=new KatanaAfterimages(new Group());
 fx.emit({root,model},path.from,path.to,.4,null,path);fx.update(.2);const midpoint=path.from.clone().lerp(path.to,.5);assert.ok(fx.pool[0].pivot.position.y>.5);assert.ok(fx.pool[0].pivot.position.distanceTo(midpoint)>.5);assert.ok(origin.equals(before));assert.ok(root.position.equals(new Vector3()));fx.dispose();
 const straightUp=endTravel(0,new Vector3(),new Vector3(0,2,0));assert.ok(straightUp.from.toArray().every(Number.isFinite));
});
test('uncompressed reference clock remains available separately from game timing',()=>{
 const reference=endSequence(1);assert.equal(reference.field,4.8);assert.equal(reference.burst,10);assert.ok(END_SEQUENCE.travel.at(-1)+.32<END_SEQUENCE.field);assert.ok(END_SEQUENCE.second<END_SEQUENCE.return);assert.ok(END_SEQUENCE.return<END_SEQUENCE.sheath);
});

test('outward cut is monotonic and held after the trail closes',()=>{
 let prior=-Infinity;
 for(let i=0;i<=100;i++){const s=endStroke(i/100);assert.ok(s.angle>=prior);prior=s.angle;}
 assert.deepEqual(endStroke(.7),endStroke(1));assert.equal(endStroke(.7).drawing,false);assert.equal(endStroke(.4).drawing,true);
 for(let i=0;i<5;i++)assert.ok(END_SEQUENCE.travel[i]+endTravelDuration(i)<=END_SEQUENCE.field-.09);
});
