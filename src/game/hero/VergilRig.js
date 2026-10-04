import { applyVergilMaterials } from './VergilMaterials.js';
import { Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MOTION_RIG_PRESETS } from './MotionRigPresets.js';
import { canonicalBone } from './MotionRetarget.js';
import { ik } from '../combat/WeaponMotion.js';

export const VERGIL_DETAIL = Object.freeze({breath:.009,blinkPeriod:4.8,fingerCurl:.65,cloth:.035,hair:.018,jointAssist:.08});
const speedFor=g=>g.app.controller.speed??0;
const LINKS={hips:'spine',spine:'spine1',spine1:'spine2',spine2:'neck',neck:'head',leftshoulder:'leftarm',leftarm:'leftforearm',leftforearm:'lefthand',rightshoulder:'rightarm',rightarm:'rightforearm',rightforearm:'righthand',leftupleg:'leftleg',leftleg:'leftfoot',leftfoot:'lefttoebase',rightupleg:'rightleg',rightleg:'rightfoot',rightfoot:'righttoebase'};
const pos=b=>b.getWorldPosition(new Vector3()),quat=b=>b.getWorldQuaternion(new Quaternion());
export function worldRotation(bone,q){bone.quaternion.copy(quat(bone.parent).invert().multiply(q)).normalize();bone.updateMatrixWorld(true);}
export function boneDepth(bone){let n=0;while(bone.parent){n++;bone=bone.parent;}return n;}
/** Original imported hierarchy stays intact. The master gameplay rig owns rules,
 * while this full-detail skin follows its final pose, after weapon/contact IK. */
export class VergilRig {
 constructor(game){this.game=game;this.character=game.app.character;this.config={...VERGIL_DETAIL};this.time=0;this.ready=false;this.bones=new Map();this.rest=new Map();this.metrics={};}
 async load(){
  const [gltf,data]=await Promise.all([new GLTFLoader().loadAsync('./models/reference/vergil.glb'),fetch('./animations/katana/k1.json').then(r=>{if(!r.ok)throw Error('Missing master rest pose');return r.json();})]);
  const c=this.character;this.model=gltf.scene;this.model.name='Vergil full 598-bone rig';this.fabric=applyVergilMaterials(this.model);this.model.traverse(b=>{if(b.isBone){this.bones.set(b.name,b);this.rest.set(b,{q:b.quaternion.clone(),p:b.position.clone(),s:b.scale.clone()});}if(b.isMesh){if(/Weapons|Sheath/.test(b.name)){b.visible=false;return;}b.castShadow=true;b.frustumCulled=false;}});
  this.wrapper=new Group();this.wrapper.name='Vergil visible hero';this.wrapper.add(this.model);c.tilt.add(this.wrapper);c.root.updateMatrixWorld(true);
  const source=new Map([...new Set(c.bones.values())].map(b=>[canonicalBone(b.name),b]));this.source=source;this.target=new Map(Object.entries(MOTION_RIG_PRESETS.vergil).map(([id,name])=>[id,this.bones.get(name)]));
  // Normalise by anatomical landmarks, excluding sword and coat extents.
  const top=pos(this.target.get('head')),feet=pos(this.target.get('leftfoot')).add(pos(this.target.get('rightfoot'))).multiplyScalar(.5);const sourceTop=pos(source.get('head')),sourceFeet=pos(source.get('leftfoot')).add(pos(source.get('rightfoot'))).multiplyScalar(.5);
  this.wrapper.scale.setScalar(sourceTop.distanceTo(sourceFeet)/top.distanceTo(feet));c.root.updateMatrixWorld(true);
  const delta=pos(source.get('hips')).sub(pos(this.target.get('hips')));this.wrapper.position.add(c.tilt.worldToLocal(pos(c.tilt).add(delta)));c.root.updateMatrixWorld(true);
  const original=[];for(const b of source.values()){const r=data.sourceRest[b.name];if(r){original.push([b,b.quaternion.clone(),b.position.clone()]);b.quaternion.fromArray(r.quaternion);b.position.fromArray(r.position);}}
  c.root.updateMatrixWorld(true);const owner=quat(c.tilt).invert();this.entries=[];
  for(const [id,t]of this.target){const s=source.get(id);if(!s||!t)continue;const child=LINKS[id],sc=source.get(child),tc=this.target.get(child),sq=owner.clone().multiply(quat(s)),tq=owner.clone().multiply(quat(t)),adjust=new Quaternion();if(sc&&tc){const a=pos(tc).sub(pos(t)).normalize().applyQuaternion(owner),b=pos(sc).sub(pos(s)).normalize().applyQuaternion(owner);adjust.setFromUnitVectors(a,b);}this.entries.push({id,s,t,sourceInverse:sq.invert(),targetRest:tq,adjust});}
  this.entries.sort((a,b)=>boneDepth(a.t)-boneDepth(b.t));for(const[b,q,p]of original){b.quaternion.copy(q);b.position.copy(p);}c.root.updateMatrixWorld(true);
  this.originalMeshes=[];c.model.traverse(b=>{if(b.isSkinnedMesh){this.originalMeshes.push([b,b.visible]);b.visible=false;}});this.ready=true;this.update(0);
 }
 update(dt){if(!this.ready)return;const c=this.character,g=this.game;this.time+=dt;this.wrapper.visible=!g.form.active;for(const[b,r]of this.rest){b.quaternion.copy(r.q);b.position.copy(r.p);b.scale.copy(r.s);}c.root.updateMatrixWorld(true);
  const owner=quat(c.tilt),inverse=owner.clone().invert();
  // Rest-direction alignment fixes A/T-pose differences as well as bone axes.
  for(const e of this.entries){const q=inverse.clone().multiply(quat(e.s)).multiply(e.sourceInverse).multiply(e.adjust).multiply(e.targetRest);worldRotation(e.t,owner.clone().multiply(q));if(e.id==='hips'){e.t.position.copy(e.t.parent.worldToLocal(pos(e.s)));e.t.updateMatrixWorld(true);}}
  const relaxed=g.player.state==='free'&&g.player.arts.mode==='sheathed'&&!g.player.guarding&&!g.player.dead;this.relax=(this.relax??0)+((relaxed?1:0)-(this.relax??0))*(1-Math.exp(-dt*16));const errors={},goals={};for(const side of ['left','right'])for(const kind of ['hand','foot']){const arm=kind==='hand',a=this.target.get(side+(arm?'arm':'upleg')),b=this.target.get(side+(arm?'forearm':'leg')),end=this.target.get(side+kind),s=this.source.get(side+kind),pole=pos(this.source.get(side+(arm?'forearm':'leg'))).sub(pos(this.source.get(side+(arm?'arm':'upleg'))));const goal=pos(s);if(side==='right'&&arm&&this.relax>0){const shoulder=pos(a),reach=shoulder.distanceTo(pos(b))+pos(b).distanceTo(pos(end)),out=shoulder.clone().sub(pos(this.target.get('hips'))).setY(0).normalize(),rest=shoulder.clone().addScaledVector(out,.035).add(new Vector3(0,-reach*.98,0));if(speedFor(g)>.1)rest.addScaledVector(new Vector3(Math.sin(c.facing),0,Math.cos(c.facing)),Math.sin(this.time*5)*.055);goal.lerp(rest,this.relax);}goals[side+kind]=goal;ik(a,b,end,goal,pole,1);errors[side+kind]=pos(end).distanceTo(goal);}
  // Keep wrist orientations from the master after endpoint correction.
  for(const e of this.entries.filter(e=>/hand$/.test(e.id))){const q=inverse.clone().multiply(quat(e.s)).multiply(e.sourceInverse).multiply(e.targetRest);worldRotation(e.t,owner.clone().multiply(q));}
  this.detail(dt);c.root.updateMatrixWorld(true);for(const side of ['left','right'])for(const kind of ['hand','foot'])errors[side+kind]=pos(this.target.get(side+kind)).distanceTo(goals[side+kind]);this.metrics={...errors,bones:this.bones.size,driven:this.entries.length};
  if(g.heroPresence){g.heroPresence.hat.visible=false;g.heroPresence.mask.visible=false;g.heroPresence.coat.visible=false;for(const s of g.heroPresence.sleeves)s.mesh.visible=false;}
 }
 detail(dt){const g=this.game,p=g.player,v=this.config,t=this.time,speed=g.app.controller.speed??0,active=p.state==='attack'||p.arts.mode==='charge';const breath=p.dead?0:Math.sin(t*2.1)*v.breath*(active?.3:1),blinkPhase=t%v.blinkPeriod,blink=!p.dead&&blinkPhase<.16?Math.sin(blinkPhase/.16*Math.PI):0;
  for(const[b,r]of this.rest){const n=b.name;let x=0,y=0,z=0;
   if(/^arm_(left|right)_finger_[1-5][abc]_Armature$/.test(n)){const left=n.includes('_left_'),held=left||active||p.arts.mode!=='sheathed';z=(left?1:-1)*(held?v.fingerCurl:.12);}
   if(n==='spine_upper_Armature')x=breath;
   if(n==='head_jaw_Armature')x=Math.max(0,breath)*.2;
   if(/head_eyelid_.*_upper_Armature$/.test(n))x=blink*.13;
   if(/head_eyelid_.*_lower_Armature$/.test(n))x=-blink*.06;
   if(/^hair_[123]_Armature$/.test(n))x=Math.sin(t*3+boneDepth(b))*(v.hair+Math.min(speed,4)*.004);
   if(/^(coat|robe)_(front|back|shoulder).*_[a-i]_Armature$/.test(n))x=Math.sin(t*3-boneDepth(b)*.35)*v.cloth*(1+Math.min(speed,4)*.2);
   if(/(?:collar_|sheathe_ribbon_)/.test(n))x=Math.sin(t*2.8+boneDepth(b)*.4)*v.cloth*.3;
   if(/(?:elbow_(up|low)|knee_adj_(front|back)|thigh_adj_(front|back))_Armature$/.test(n)){const side=n.includes('_left_')?'left':'right',id=side+(n.includes('elbow')?'forearm':n.includes('knee')?'leg':'upleg'),joint=this.target.get(id);if(joint)x=Math.min(.12,joint.quaternion.angleTo(this.rest.get(joint).q)*v.jointAssist)*(n.includes('back')||n.includes('low')?-1:1);}
   if(/^head_eyeball_(left|right)_Armature$/.test(n))y=Math.max(-.1,Math.min(.1,g.heroPresence?.look??0));
   if(x||y||z)b.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),x)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),z)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),y));
  }
 }
 restore(){for(const[b,visible]of this.originalMeshes??[])b.visible=visible;this.wrapper?.removeFromParent();this.ready=false;}
}
