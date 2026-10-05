import { AnimationClip, Quaternion, Vector3 } from 'three';
import { ik } from '../combat/WeaponMotion.js';
const up=new Vector3(0,1,0),forwardAxis=new Vector3(0,0,1);
/** Observed low silhouette and waist-height cut; unseen depth remains reconstructed. */
export function judgementEndTravelClip(idle,crouch,rear='Left'){
 if(!idle)return null;
 const times=[0,.25,.6,1],tracks=idle.tracks.map(t=>{
  const r=t.clone(),rest=Array.from(t.createInterpolant().evaluate(0)),low=crouch?.tracks.find(s=>s.name===t.name),bent=low?Array.from(low.createInterpolant().evaluate(crouch.duration*.35)):rest,values=[];
  for(const phase of times){
   const tuck=.68+.18*Math.sin(Math.PI*phase);
   if(t.name.endsWith('.quaternion')&&rest.length===4){
    const q=new Quaternion().fromArray(rest);
    if(/(?:Left|Right)(?:UpLeg|Leg|Foot)\.quaternion$/i.test(t.name))q.slerp(new Quaternion().fromArray(bent),t.name.includes(rear)?tuck*.7:tuck);
    if(/Spine\d*\.quaternion$/i.test(t.name)){q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.05));q.multiply(new Quaternion().setFromAxisAngle(up,.025*Math.sin(Math.PI*phase)));}
    q.normalize().toArray(values,values.length);
   }else for(let i=0;i<rest.length;i++)values.push(/Hips\.position$/i.test(t.name)?rest[i]+(bent[i]-rest[i])*.32:rest[i]);
  }
  r.times=new Float32Array(times);r.values=new Float32Array(values);return r;
 });
 const clip=new AnimationClip('黒雨・次元斬絶・空走姿勢・'+rear,1,tracks);clip.userData={reconstruction:true,reference:'0750-07:0.6–2.4',depth:'inferred'};return clip;
}
/** Solve a supported scabbard grip and a horizontal cut without translating bones. */
export function applyEndWaistPose(character,weapon,phase,record=()=>{}){
 const c=character,hips=c.getBone('Hips');if(!hips||!weapon)return null;
 const arms=['Left','Right'].map(side=>({side,upper:c.getBone(side+'Arm'),lower:c.getBone(side+'ForeArm'),hand:c.getBone(side+'Hand')}));
 if(arms.some(a=>!a.upper||!a.lower||!a.hand))return null;
 c.root.updateMatrixWorld(true);
 const yaw=c.facing,s=(c.height??1.8)/1.8,right=new Vector3(-Math.cos(yaw),0,Math.sin(yaw)),front=new Vector3(Math.sin(yaw),0,Math.cos(yaw));
 const mouth=hips.getWorldPosition(new Vector3()).addScaledVector(right,-.14*s).addScaledVector(front,.32*s).add(new Vector3(0,.18*s,0));
 const draw=(.16+.20*Math.sin(Math.PI*Math.max(0,Math.min(1,phase))))*s;
 for(const a of arms){
  const target=mouth.clone();if(a.side==='Right')target.addScaledVector(right,draw);
  const shoulder=a.upper.getWorldPosition(new Vector3()),elbow=a.lower.getWorldPosition(new Vector3()),wrist=a.hand.getWorldPosition(new Vector3()),reach=(shoulder.distanceTo(elbow)+elbow.distanceTo(wrist))*.94,delta=target.clone().sub(shoulder);
  if(delta.length()>reach)target.copy(shoulder).add(delta.setLength(reach));
  for(const b of [a.upper,a.lower,a.hand])record(b);
  const offset=shoulder.clone().sub(c.position),sign=Math.sign(offset.x*Math.cos(yaw)-offset.z*Math.sin(yaw))||(a.side==='Left'?1:-1),pole=new Vector3(Math.cos(yaw)*sign*.45+Math.sin(yaw)*.25,-1,-Math.sin(yaw)*sign*.45+Math.cos(yaw)*.25);
  ik(a.upper,a.lower,a.hand,target,pole,1);c.root.updateMatrixWorld(true);
 }
 const angle=.25*Math.sin(phase*Math.PI*2),direction=right.clone().multiplyScalar(Math.cos(angle)).addScaledVector(front,Math.sin(angle)).normalize(),hand=arms[1].hand;
 weapon.updateWorldMatrix(true,false);
 const rotation=new Quaternion().setFromUnitVectors(forwardAxis,direction),desired=rotation.multiply(weapon.getWorldQuaternion(new Quaternion()).invert()).multiply(hand.getWorldQuaternion(new Quaternion()));
 hand.quaternion.copy(hand.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired)).normalize();c.root.updateMatrixWorld(true);
 // This is the same authored -10cm handle anchor used by the regular sheath solver.
 const gripLocal=weapon.parent.worldToLocal(hand.getWorldPosition(new Vector3())),anchor=new Vector3(0,0,-.1).multiply(weapon.scale).applyQuaternion(weapon.quaternion);
 weapon.position.copy(gripLocal.sub(anchor));weapon.updateWorldMatrix(true,false);
 return {mouth:arms[0].hand.getWorldPosition(new Vector3()),axis:direction.clone().negate(),direction};
}
