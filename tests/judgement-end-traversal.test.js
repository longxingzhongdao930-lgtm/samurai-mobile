import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { END_SEQUENCE } from '../src/game/hero/JudgementEndSequence.js';
import { sampleEndTraversal, JudgementEndTraversal } from '../src/game/hero/JudgementEndTraversal.js';
test('finisher body paths join continuously and return before sheathing',()=>{
 const origin=new Vector3(2,0,4),target=new Vector3(2,1,7),boundaries=[...END_SEQUENCE.travel,END_SEQUENCE.field,END_SEQUENCE.field+END_SEQUENCE.fieldDuration,END_SEQUENCE.return];
 for(const t of boundaries){const before=sampleEndTraversal(t-1e-6,origin,target,.3),after=sampleEndTraversal(t+1e-6,origin,target,.3);assert.ok(before.position.distanceTo(after.position)<1e-4);assert.ok(Math.abs(before.lift-after.lift)<1e-4);assert.ok(Math.abs(Math.atan2(Math.sin(before.yaw-after.yaw),Math.cos(before.yaw-after.yaw)))<1e-4);}
 const end=sampleEndTraversal(END_SEQUENCE.sheath,origin,target,.3);assert.ok(end.position.equals(origin));assert.equal(end.lift,0);assert.ok(Math.abs(Math.atan2(Math.sin(end.yaw-.3),Math.cos(end.yaw-.3)))<1e-9);
});
test('body travel respects stage clamping; interruption clears lift without teleporting',()=>{
 const root=new Group(),tilt=new Group();root.add(tilt);const p={poses:[],character:{root,tilt,position:root.position,clips:new Map(),locomotion:{overrides:[]}},game:{stage:{moveSafely:(at)=>{at.x=Math.min(.2,at.x);}}},body:{apply:()=>tilt.position.set(0,0,0)}};
 const traversal=new JudgementEndTraversal(p),r={t:.27,origin:new Vector3(),point:new Vector3(0,1,3),yaw:0},held=traversal.update(r);assert.ok(held.warp.active);assert.ok(held.warp.x<=.2);assert.ok(traversal.lift>0);root.position.set(held.warp.x,0,held.warp.z);const stopped=root.position.clone();traversal.cancel();assert.ok(root.position.equals(stopped));assert.equal(tilt.position.y,0);assert.equal(traversal.active,false);assert.equal(held.warp.active,false);
});
