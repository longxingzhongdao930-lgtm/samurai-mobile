import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';
import { vergilIaiStance, vergilIaiCut } from '../src/game/hero/VergilIai.js';
const clip=(name)=>new AnimationClip(name,1,[new QuaternionKeyframeTrack('Spine.quaternion',[0,1],[0,0,0,1,0,.5,0,Math.sqrt(.75)]),new VectorKeyframeTrack('Hips.position',[0,1],[0,1,0,0,.7,0])]);
test('reference entry and recovery meet their held endpoints without mutating source clips',()=>{
 const source=clip('cut'),idle=clip('idle'),crouch=clip('crouch'),before=source.toJSON();
 const stance=vergilIaiStance(crouch,idle),cut=vergilIaiCut(source,stance,idle);
 for(const track of cut.tracks){
  const held=stance.tracks.find(t=>t.name===track.name).createInterpolant().evaluate(0);
  const resting=idle.tracks.find(t=>t.name===track.name).createInterpolant().evaluate(0);
  const start=track.createInterpolant().evaluate(.12),end=track.createInterpolant().evaluate(.92);
  assert.ok(Array.from(start).every((v,i)=>Math.abs(v-held[i])<1e-5));
  assert.ok(Array.from(end).every((v,i)=>Math.abs(v-resting[i])<1e-5));
  for(let t=.12;t<=.92;t+=.01){const v=Array.from(track.createInterpolant().evaluate(t));assert.ok(v.every(Number.isFinite));if(v.length===4)assert.ok(Math.abs(Math.hypot(...v)-1)<1e-5);}
 }
 assert.deepEqual(source.toJSON(),before);
});
test('full-body reconstruction does not inherit the old cutting motion',()=>{
 const source=clip('old-cut'),other=clip('different-cut'),idle=clip('idle');
 other.tracks[0].values.fill(0);other.tracks[1].values.fill(100);
 const stance=vergilIaiStance(clip('crouch'),idle);
 const a=vergilIaiCut(source,stance,idle),b=vergilIaiCut(other,stance,idle);
 const aj=a.toJSON(),bj=b.toJSON();delete aj.uuid;delete bj.uuid;assert.deepEqual(aj,bj);
});
