import { AdditiveBlending, AnimationMixer, Group, MeshBasicMaterial, Vector3 } from 'three';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';

/** Independent posed skeletons: effect movement never moves the player's bones. */
export class KatanaAfterimages {
 constructor(group,count=3){this.group=group;this.count=count;this.pool=[];this.sourceModel=null;}
 ensure(character){
  let stale=this.sourceModel!==character.model||!this.pool.length;
  if(!stale)character.root.traverse(node=>{if(!this.pool[0].pairs.has(node))stale=true;});
  if(!stale)return;
  this.dispose();this.sourceModel=character.model;
  for(let i=0;i<this.count;i++){
   const model=cloneRigged(character.root),material=new MeshBasicMaterial({color:'#78b7ff',transparent:true,opacity:0,depthWrite:false,blending:AdditiveBlending,toneMapped:false});
   const pairs=new Map(),walk=(a,b)=>{pairs.set(a,b);for(let n=0;n<a.children.length;n++)walk(a.children[n],b.children[n]);};walk(character.root,model);
   model.traverse(node=>{if(node.isMesh){node.material=material;node.castShadow=false;node.receiveShadow=false;node.frustumCulled=false;}});
   const pivot=new Group();pivot.name='黒雨・全身残像';pivot.add(model);pivot.visible=false;this.group.add(pivot);
   this.pool.push({pivot,model,material,pairs,mixer:new AnimationMixer(model),life:0,from:new Vector3(),to:new Vector3()});
  }
 }
 emit(character,from,to,duration=.18,clipName=null,path={}){
  this.ensure(character);const slot=this.pool.find(s=>s.life<=0);if(!slot)return false;
  for(const [source,target] of slot.pairs){target.position.copy(source.position);target.quaternion.copy(source.quaternion);target.scale.copy(source.scale);target.visible=source.visible;}
  slot.mixer.stopAllAction();
  const clip=character.clips?.get(clipName);
  if(clip){slot.action=slot.mixer.clipAction(clip);slot.action.reset().play();slot.clipDuration=clip.duration;slot.mixer.setTime(0);}else slot.action=null;
  const travel=to.clone().sub(from);if(travel.lengthSq()>1e-8)slot.model.rotation.y=Math.atan2(travel.x,travel.z)-(character._forwardYaw??0);
  slot.model.position.set(0,0,0);slot.life=slot.duration=duration;slot.from.copy(from);slot.to.copy(to);slot.arc=path.arc?.clone()??new Vector3();slot.lift=path.lift??.25;slot.pivot.position.copy(from);slot.pivot.visible=true;slot.material.opacity=.16;return true;
 }
 update(dt){for(const s of this.pool){s.life=Math.max(0,s.life-dt);s.pivot.visible=s.life>0;if(!s.life){s.material.opacity=0;continue;}const t=1-s.life/s.duration;if(s.action)s.mixer.setTime(t*s.clipDuration*.85);s.pivot.position.lerpVectors(s.from,s.to,t);s.pivot.position.addScaledVector(s.arc,Math.sin(Math.PI*t));s.pivot.position.y+=Math.sin(Math.PI*t)*s.lift;s.material.opacity=.16*(1-t);}}
 reset(){for(const s of this.pool){s.life=0;s.pivot.visible=false;s.material.opacity=0;}}
 dispose(){for(const s of this.pool){s.mixer.stopAllAction();s.mixer.uncacheRoot(s.model);s.pivot.removeFromParent();s.material.dispose();s.model.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.dispose();});}this.pool=[];this.sourceModel=null;}
}
