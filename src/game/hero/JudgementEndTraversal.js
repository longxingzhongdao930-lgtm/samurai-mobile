import { judgementEndTravelClip } from './JudgementEndPose.js';
import { Vector3 } from 'three';
import { PoseLayer } from '../combat/PoseLayer.js';
import { END_SEQUENCE, endTravel } from './JudgementEndSequence.js';
const turn=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*smooth(t);
const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
/** Continuous whole-body reconstruction. World depth is inferred, not a certified trace. */
export function sampleEndTraversal(time,origin,target,yaw){
 const last=endTravel(4,origin,target).to;
 if(time<END_SEQUENCE.travel[0]||time>=END_SEQUENCE.return)return {position:origin.clone(),yaw,lift:0,clip:null,phase:0};
 const fieldEnd=END_SEQUENCE.field+END_SEQUENCE.fieldDuration;
 if(time>=fieldEnd){
  const t=smooth((time-fieldEnd)/(END_SEQUENCE.return-fieldEnd));
  return {position:last.clone().lerp(origin,t),yaw:turn(Math.atan2(last.x-endTravel(3,origin,target).to.x,last.z-endTravel(3,origin,target).to.z),yaw,t),lift:Math.sin(Math.PI*t)*.25,clip:'endTravelRight',phase:.85};
 }
 let index=END_SEQUENCE.travel.findLastIndex(t=>time>=t);index=Math.max(0,index);
 const path=endTravel(index,origin,target),from=index?endTravel(index-1,origin,target).to:origin;
 const end=index<4?END_SEQUENCE.travel[index+1]:END_SEQUENCE.field-.1;
 const phase=Math.max(0,Math.min(1,(time-END_SEQUENCE.travel[index])/(end-END_SEQUENCE.travel[index]))),u=smooth(phase);
 const position=from.clone().lerp(path.to,u).addScaledVector(path.arc,Math.sin(Math.PI*u));
 const d=path.to.clone().sub(from);const heading=d.lengthSq()>1e-8?Math.atan2(d.x,d.z):yaw;
 const priorFrom=index>1?endTravel(index-2,origin,target).to:origin,priorTo=index?endTravel(index-1,origin,target).to:origin,prior=index?Math.atan2(priorTo.x-priorFrom.x,priorTo.z-priorFrom.z):yaw;
 return {position,yaw:turn(prior,heading,Math.min(1,phase/.35)),lift:Math.sin(Math.PI*u)*path.lift,clip:path.clip,phase:phase*.85};
}
export class JudgementEndTraversal {
 prepare(){const c=this.p.character;for(const [name,side] of [['endTravelLeft','Left'],['endTravelRight','Right']])if(!c.clips.has(name)){const clip=judgementEndTravelClip(c.clips.get('idle'),c.clips.get('crouch'),side);if(clip)c.clips.set(name,clip);}}
 constructor(player){this.p=player;this.lift=0;this.active=false;this.layers=new Map();this.held={warp:{active:false,x:0,z:0,yaw:0}};}
 layer(name){
  if(this.layers.has(name))return this.layers.get(name);
  const clip=this.p.character.clips.get(name);if(!clip)return null;
  const pose=new PoseLayer(this.p.character.mixer,clip,{blendIn:.055,blendOut:.08});
  this.layers.set(name,pose);this.p.poses.push(pose);this.p.character.locomotion.overrides.push(pose);return pose;
 }
 update(ritual){
  this.active=true;const p=this.p,c=p.character,sample=sampleEndTraversal(ritual.t,ritual.origin,ritual.point,ritual.yaw);
  for(const [name,pose] of this.layers)if(name!==sample.clip)pose.stop();
  if(sample.clip&&ritual.t<END_SEQUENCE.return)this.layer(sample.clip)?.hold(sample.phase);
  else for(const pose of this.layers.values())pose.stop();
  const destination=sample.position.clone(),previous=c.position.clone();
  // Both the planned sweep and the game's normal post-controller collision use the same stage.
  p.game.stage.moveSafely(destination,previous,.38);
  const warp=this.held.warp;warp.active=true;warp.x=destination.x;warp.z=destination.z;warp.yaw=sample.yaw;
  this.lift=sample.lift;c.tilt.position.y+=this.lift;return this.held;
 }
 cancel(){if(!this.active)return;this.active=false;this.lift=0;this.held.warp.active=false;for(const pose of this.layers.values())pose.cancel();this.p.body.apply();}
}
