import {AnimationMixer,AnimationClip,Quaternion,QuaternionKeyframeTrack,VectorKeyframeTrack,TextureLoader,Texture,LoopOnce,Vector3} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import { ik } from '../src/game/combat/WeaponMotion.js';
import {readFileSync,writeFileSync} from 'node:fs';
// Strip presentation textures in memory; only motion tracks are exported.
TextureLoader.prototype.load=function(){return new Texture();};
const load=path=>{const b=readFileSync(path);return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const canon=n=>n.replace(/^EEJANAIBot|^mixamorig:?/i,'');
const target=load('public/models/tpose.fbx');target.updateMatrixWorld(true);
const tb=new Map();target.traverse(b=>{if(b.isBone)tb.set(canon(b.name),b);});
const handRest=tb.get('RightHand').quaternion.clone();
const upperRest=new Map(['Spine','Spine1','Spine2','Neck','Head'].map(n=>[n,tb.get(n).quaternion.clone()]));
const rests=new Map([...tb].map(([id,b])=>[id,b.getWorldQuaternion(new Quaternion())]));
const inputs=[['quick-slash',process.argv[2],.38],['heavenly-strike-2',process.argv[3],.6]];
for(const [id,path,seconds] of inputs){
 const source=load(path);source.updateMatrixWorld(true);const original=source.animations[0];
 const animated=new Map();source.traverse(b=>{if(b.isBone&&!animated.has(canon(b.name)))animated.set(canon(b.name),b);});
 // FBX has an animated wrapper and an identically named skin bone. The skin's
 // inverse-bind gives the true T-pose; the first wrapper supplies animation.
 const bind=new Map();source.traverse(m=>{if(m.isSkinnedMesh)for(let i=0;i<m.skeleton.bones.length;i++){const b=m.skeleton.bones[i];bind.set(canon(b.name),new Quaternion().setFromRotationMatrix(m.skeleton.boneInverses[i].clone().invert()));}});
 const mixer=new AnimationMixer(source),action=mixer.clipAction(original);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
 let peak={y:-Infinity,phase:.55};
 for(let frame=0;frame<=90;frame++){const phase=frame/90;if(phase<.38||phase>.78)continue;mixer.setTime(original.duration*phase);source.updateMatrixWorld(true);const y=animated.get('RightHand').getWorldPosition(new Vector3()).y;if(y>peak.y)peak={y,phase};}
 const cutEnd=peak.phase,hold=id==='quick-slash'?.22:.28;
 const times=[],values=new Map([...tb].filter(([n])=>animated.has(n)&&bind.has(n)).map(([n])=>[n,[]])),hips=[];
 let firstY=null,previous=null,best={speed:0,phase:.5};const count=Math.ceil(original.duration*30);
 for(let frame=0;frame<=count;frame++){
  const phase=frame/count*cutEnd;mixer.setTime(original.duration*phase);source.updateMatrixWorld(true);times.push(seconds*frame/count);
  const desired=new Map();
  for(const n of values.keys())desired.set(n,animated.get(n).getWorldQuaternion(new Quaternion()).multiply(bind.get(n).clone().invert()).multiply(rests.get(n)).normalize());
  for(const [n] of values){const bone=tb.get(n),parentId=canon(bone.parent.name),parent=desired.get(parentId)??bone.parent.getWorldQuaternion(new Quaternion());bone.quaternion.copy(parent.clone().invert().multiply(desired.get(n)).normalize());}
  // Finish the supplied sweep in a clean upper guard, without its return/fidget.
  const lift=Math.max(0,Math.min(1,(frame/count-.8)/.2)),weight=lift*lift*(3-2*lift);
  if(weight){for(const [n,q] of upperRest)tb.get(n).quaternion.slerp(q,weight*.8);target.updateMatrixWorld(true);const arm=tb.get('RightArm'),fore=tb.get('RightForeArm'),hand=tb.get('RightHand'),at=arm.getWorldPosition(new Vector3()),elbow=fore.getWorldPosition(new Vector3()),wrist=hand.getWorldPosition(new Vector3()),reach=at.distanceTo(elbow)+elbow.distanceTo(wrist),sign=Math.sign(at.x)||-1;ik(arm,fore,hand,at.clone().add(new Vector3(sign*reach*.25,reach*.8,reach*.25)),new Vector3(sign*.5,.1,.3),weight);hand.quaternion.slerp(handRest,weight);}
  for(const [n,v] of values)tb.get(n).quaternion.normalize().toArray(v,v.length);
  const y=animated.get('Hips').getWorldPosition(new Vector3()).y;if(firstY===null)firstY=y;
  const hip=tb.get('Hips');hips.push(hip.position.x,hip.position.y+(y-firstY),hip.position.z);
  const hand=animated.get('RightHand').getWorldPosition(new Vector3());if(previous&&phase>.15&&phase<.85){const speed=hand.distanceTo(previous);if(speed>best.speed)best={speed,phase:phase/cutEnd*seconds/(seconds+hold)};}previous=hand;
 }
 times.push(seconds+hold);for(const v of values.values())v.push(...v.slice(-4));hips.push(...hips.slice(-3));
 const tracks=[...values].map(([n,v])=>new QuaternionKeyframeTrack(tb.get(n).name+'.quaternion',times,v));tracks.push(new VectorKeyframeTrack(tb.get('Hips').name+'.position',times,hips));
 const clip=new AnimationClip(id,seconds+hold,tracks),json=AnimationClip.toJSON(clip);json.source={file:path.split('/').pop(),duration:original.duration,frames:count+1,retarget:'animated wrapper world rotation / skin inverse bind; target joint lengths unchanged',hitPhase:best.phase,holdStart:seconds,holdSeconds:hold,sourceCutPhase:cutEnd};
 writeFileSync('public/animations/imported/'+id+'.json',JSON.stringify(json));console.log(JSON.stringify({id,seconds,tracks:tracks.length,hitPhase:best.phase,holdStart:seconds,holdSeconds:hold,sourceCutPhase:cutEnd,sourceSeconds:original.duration}));
}
