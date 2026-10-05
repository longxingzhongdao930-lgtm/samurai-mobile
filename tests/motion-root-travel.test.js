import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { applyRootTravel, sampleRootTravel } from '../src/game/hero/MotionRootTravel.js';
test('root travel interpolates across the yaw seam without a full-body spin',()=>{
 const movement={samples:[{t:0,position:[0,0,0],yaw:3.1},{t:1,position:[2,.6,1],yaw:-3.1}]};
 const s=sampleRootTravel(movement,.5);assert.deepEqual(s.position,[1,.3,.5]);assert.ok(Math.abs(s.yaw-Math.PI)<1e-9);assert.deepEqual(sampleRootTravel(movement,5).position,[2,.6,1]);
});
test('root travel uses metres on differently scaled rig wrappers and resets for a stationary clip',()=>{
 const wrapper=new Group();wrapper.scale.setScalar(.01);const movement={samples:[{t:0,position:[0,0,0],yaw:0},{t:1,position:[2,.6,1],yaw:.5}]};applyRootTravel(wrapper,movement,1);assert.equal(wrapper.position.x,2);assert.equal(wrapper.scale.x,.01);applyRootTravel(wrapper,null,0);assert.equal(wrapper.position.length(),0);assert.equal(wrapper.rotation.y,0);
});
