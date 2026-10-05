import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, Bone, Group, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { judgementEndTravelClip, judgementEndRecoveryClip, applyEndWaistPose } from '../src/game/hero/JudgementEndPose.js';
function pose(angle,height){return new AnimationClip('source',1,[new QuaternionKeyframeTrack('LeftUpLeg.quaternion',[0,1],[Math.sin(angle/2),0,0,Math.cos(angle/2),Math.sin(angle/2),0,0,Math.cos(angle/2)]),new QuaternionKeyframeTrack('RightArm.quaternion',[0,1],[0,0,0,1,0,0,0,1]),new QuaternionKeyframeTrack('Spine.quaternion',[0,1],[0,0,0,1,0,0,0,1]),new VectorKeyframeTrack('Hips.position',[0,1],[0,height,0,0,height,0])]);}
test('dedicated travel pose bends legs while leaving arm placement to the grip solver',()=>{
 const idle=pose(0,1),crouch=pose(1,.7),before=crouch.toJSON(),clip=judgementEndTravelClip(idle,crouch),leg=clip.tracks[0];assert.ok(leg.createInterpolant().evaluate(.5)[0]>.2);assert.equal(clip.tracks[1].createInterpolant().evaluate(.5)[3],1);assert.deepEqual(crouch.toJSON(),before);
 for(const track of clip.tracks.filter(t=>t.name.endsWith('quaternion')))for(let t=0;t<=1;t+=.01)assert.ok(Math.abs(Math.hypot(...track.createInterpolant().evaluate(t))-1)<1e-5);
});
test('waist grip maintains bone lengths, hand-to-handle contact, and a horizontal blade',()=>{
 const root=new Group(),hips=new Bone();hips.name='Hips';hips.position.y=1;root.add(hips);const bones=new Map([['Hips',hips]]);
 for(const [side,x] of [['Left',.2],['Right',-.2]]){const arm=new Bone(),fore=new Bone(),hand=new Bone();arm.position.set(x,.4,0);fore.position.y=-.26;hand.position.y=-.24;hips.add(arm);arm.add(fore);fore.add(hand);bones.set(side+'Arm',arm);bones.set(side+'ForeArm',fore);bones.set(side+'Hand',hand);}
 const weapon=new Group();bones.get('RightHand').add(weapon);const c={root,position:root.position,height:1.8,facing:0,getBone:n=>bones.get(n)},positions=[...bones].map(([n,b])=>[n,b.position.clone()]);const state=applyEndWaistPose(c,weapon,.25);assert.ok(state);root.updateMatrixWorld(true);
 for(const [name,p] of positions)assert.ok(bones.get(name).position.equals(p));
 const anchor=weapon.localToWorld(new Vector3(0,0,-.1)),wrist=bones.get('RightHand').getWorldPosition(new Vector3());assert.ok(anchor.distanceTo(wrist)<1e-6);assert.ok(Math.abs(state.direction.y)<1e-6);assert.ok(state.mouth.distanceTo(bones.get('LeftHand').getWorldPosition(new Vector3()))<1e-6);
 for(const side of ['Left','Right'])assert.ok(Math.abs(bones.get(side+'Arm').getWorldPosition(new Vector3()).distanceTo(bones.get(side+'ForeArm').getWorldPosition(new Vector3()))-.26)<1e-6);
});

test('return stance folds one leg then releases without changing source positions',()=>{
 const q=a=>[Math.sin(a/2),0,0,Math.cos(a/2)],make=a=>new AnimationClip('source',1,['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'].map(n=>new QuaternionKeyframeTrack(n+'.quaternion',[0,1],[...q(a),...q(a)]))),idle=make(0),crouch=make(.7),before=crouch.toJSON(),clip=judgementEndRecoveryClip(idle,crouch);
 const left=clip.tracks[0].createInterpolant().evaluate(0),right=clip.tracks[1].createInterpolant().evaluate(0);assert.ok(Math.abs(left[0])>Math.abs(right[0])*5);
 for(const t of clip.tracks){assert.ok(Math.abs(Math.hypot(...t.createInterpolant().evaluate(.5))-1)<1e-6);assert.ok(Math.abs(t.createInterpolant().evaluate(1)[0])<1e-6);}
 assert.deepEqual(crouch.toJSON(),before);
});
