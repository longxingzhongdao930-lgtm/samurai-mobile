import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, QuaternionKeyframeTrack } from 'three';
import { silentDrawDistance, silentIaiConfig, silentIaiClip } from '../src/game/hero/SilentIai.js';
test('hidden cut exposes only a short blade and lands after it is seated',()=>{
 const config=silentIaiConfig({hits:[.32,.65],damage:8,reach:2.6});
 assert.equal(config.damage,8);assert.equal(config.reach,2.6);assert.equal(config.trail,false);
 assert.equal(config.hits.length,2);
 for(const hit of config.hits)assert.equal(silentDrawDistance(hit),0);
 assert.equal(silentDrawDistance(0),0);assert.equal(silentDrawDistance(1),0);
 assert.ok(silentDrawDistance(.35)>.1);
 for(let p=0;p<=1;p+=.005)assert.ok(silentDrawDistance(p)>=0&&silentDrawDistance(p)<=.12);
});
test('quiet iai preserves the arm tracks and source rig instead of animating a visible swing',()=>{
 const track=new QuaternionKeyframeTrack('RightArm.quaternion',[0,1],[0,0,0,1,0,0,0,1]);
 const idle=new AnimationClip('idle',1,[track]),before=idle.toJSON();
 const result=silentIaiClip(idle,idle,'k1');
 for(let t=0;t<=result.duration;t+=.01)assert.deepEqual(Array.from(result.tracks[0].createInterpolant().evaluate(t)),[0,0,0,1]);
 assert.deepEqual(idle.toJSON(),before);
});
