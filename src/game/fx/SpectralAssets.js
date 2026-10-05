import { Mesh, SphereGeometry, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createKatanaEffectGeometry } from './KatanaEffectGeometry.js';
import { cutMaterial, cloudMaterial } from './KatanaEffectMaterials.js';
import { KATANA_FX_PROFILES, sampleKatanaEffect } from './KatanaEffectProfiles.js';
/** Original effect geometry is available immediately, independently of asset loading. */
export class SpectralAssets {
 constructor(group,{cloudSteps=12}={}){
  this.group=group;this.status={force:false,end:true};
  this.endPool=this.pool('end',4,'#a59aff');this.burstPool=this.pool('burst',4,'#eff5ff');
  this.slashPool=this.pool('slash',6,'#65cfff');this.riftPool=this.pool('rift',12,'#dce3ff');
  const geometry=new SphereGeometry(.95,16,12);
  for(const slot of this.riftPool){
   const aura=new Mesh(geometry,cloudMaterial(cloudSteps));aura.name='黒雨・自作立体空間雲';
   const cameraLocal=new Vector3();
   aura.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(cameraLocal);aura.worldToLocal(cameraLocal);aura.material.uniforms.uCamera.value.copy(cameraLocal);};
   const bolts=new Mesh(createKatanaEffectGeometry('lightning'),cutMaterial('#85bfff'));bolts.name='黒雨・空間雷';slot.mesh.add(aura,bolts);slot.aura=aura;slot.bolts=bolts;
  }
 }
 pool(kind,count,color){
  const geometry=createKatanaEffectGeometry(kind);
  return Array.from({length:count},()=>{const mesh=new Mesh(geometry,cutMaterial(color));mesh.visible=false;this.group.add(mesh);return {mesh,life:0,kind};});
 }
 async load(){try{const gltf=await new GLTFLoader().loadAsync('./models/fx/force-edge.glb');gltf.scene.traverse(n=>{if(n.isMesh)this.forceGeometry=n.geometry;});this.status.force=!!this.forceGeometry;}catch(error){console.warn('[SpectralAssets] sword fallback',error);}}
 sword(fallback,material){return new Mesh(this.forceGeometry??fallback,material);}
 spawn(pool,at,scale,duration=null){
  const slot=pool.find(s=>s.life<=0);if(!slot)return false;
  slot.duration=duration??KATANA_FX_PROFILES[slot.kind]?.duration??.24;slot.life=slot.duration;slot.scale=scale;
  slot.mesh.position.copy(at);slot.mesh.scale.setScalar(scale);slot.mesh.visible=true;return true;
 }
 end(at,duration=null){return this.spawn(this.endPool,at,1.8,duration);}
 slash(at,facing){const slot=this.slashPool.find(s=>s.life<=0);if(!slot)return false;this.spawn([slot],at,.65);slot.mesh.rotation.set(-Math.PI/2,facing-Math.PI/2,0,'YXZ');return true;}
 burst(at){return this.spawn(this.burstPool,at,1.3);}
 rift(at,wide=false){return this.spawn(this.riftPool,at,wide?1.5:1);}
 slots(){return [...this.endPool,...this.riftPool,...this.burstPool,...this.slashPool];}
 reset(){for(const s of this.slots()){s.life=0;s.mesh.visible=false;s.mesh.material.opacity=0;if(s.mesh.material.uniforms)s.mesh.material.uniforms.uOpacity.value=0;if(s.aura)s.aura.material.uniforms.uOpacity.value=0;if(s.bolts)s.bolts.material.uniforms.uOpacity.value=0;}}
 update(dt){for(const s of this.slots()){
  s.life=Math.max(0,s.life-dt);s.mesh.visible=s.life>0;
  const age=(s.duration??.24)-s.life,phase=age/(s.duration??.24);
  const sample=s.life<=0?{cut:0,cloud:0,scale:1}:s.kind?sampleKatanaEffect(s.kind,phase*KATANA_FX_PROFILES[s.kind].duration):{cut:s.life>0?Math.sin(Math.PI*phase)*.18:0,cloud:0,scale:.85+.15*phase};
  s.mesh.material.opacity=sample.cut;
  if(s.mesh.material.uniforms){s.mesh.material.uniforms.uOpacity.value=sample.cut;s.mesh.material.uniforms.uAge.value=age;}
  s.mesh.scale.setScalar((s.scale??1.8)*sample.scale);
  if(s.aura){s.aura.material.uniforms.uPhase.value=phase;s.aura.material.uniforms.uOpacity.value=sample.cloud;s.bolts.material.uniforms.uOpacity.value=sample.cloud*.35;}
 }}
}
