import { AdditiveBlending, DoubleSide, Mesh, MeshBasicMaterial, ShaderMaterial, SphereGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createKatanaEffectGeometry } from './KatanaEffectGeometry.js';
/** Original effect geometry is available immediately, independently of asset loading. */
export class SpectralAssets {
 constructor(group){this.group=group;this.status={force:false,end:true};this.endPool=this.pool('end',4,'#aaa0ff');this.burstPool=this.pool('burst',4,'#eff5ff');this.slashPool=this.pool('slash',6,'#85d6ff');this.riftPool=this.pool('rift',12,'#e6e1ff');
  const auraGeometry=new SphereGeometry(.95,16,12);
  for(const slot of this.riftPool){const aura=new Mesh(auraGeometry,new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,uniforms:{uPhase:{value:0},uOpacity:{value:0}},vertexShader:'varying vec3 vPoint;varying vec3 vNormal;varying vec3 vView;void main(){vPoint=position;vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}',fragmentShader:'uniform float uPhase;uniform float uOpacity;varying vec3 vPoint;varying vec3 vNormal;varying vec3 vView;void main(){float edge=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),1.5);float cloud=.5+.5*sin(vPoint.x*13.+uPhase*7.)*sin(vPoint.y*11.-uPhase*5.)*sin(vPoint.z*9.);gl_FragColor=vec4(mix(vec3(.22,.04,.55),vec3(.52,.32,1.),cloud),uOpacity*edge*cloud);}'}));aura.name='黒雨・自作空間雲';slot.mesh.add(aura);slot.aura=aura;}
 }
 pool(kind,count,color){const geometry=createKatanaEffectGeometry(kind);return Array.from({length:count},()=>{const mesh=new Mesh(geometry,new MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,side:DoubleSide,blending:AdditiveBlending}));mesh.visible=false;this.group.add(mesh);return {mesh,life:0,kind,peak:kind==='end'?.18:kind==='slash'?.3:.42};});}
 async load(){try{const gltf=await new GLTFLoader().loadAsync('./models/fx/force-edge.glb');gltf.scene.traverse(n=>{if(n.isMesh)this.forceGeometry=n.geometry;});this.status.force=!!this.forceGeometry;}catch(error){console.warn('[SpectralAssets] sword fallback',error);}}
 sword(fallback,material){return new Mesh(this.forceGeometry??fallback,material);}
 spawn(pool,at,scale){const slot=pool.find(s=>s.life<=0);if(!slot)return false;slot.duration=slot.kind==='slash'?.12:.24;slot.life=slot.duration;slot.scale=scale;slot.mesh.position.copy(at);slot.mesh.scale.setScalar(scale);slot.mesh.visible=true;return true;}
 end(at){return this.spawn(this.endPool,at,1.8);}
 slash(at,facing){const slot=this.slashPool.find(s=>s.life<=0);if(!slot)return false;this.spawn([slot],at,.65);slot.mesh.rotation.set(-Math.PI/2,facing-Math.PI/2,0,'YXZ');return true;}
 burst(at){return this.spawn(this.burstPool,at,1.3);}
 rift(at,wide=false){return this.spawn(this.riftPool,at,wide?1.5:1);}
 reset(){for(const s of [...this.endPool,...this.riftPool,...this.burstPool,...this.slashPool]){s.life=0;s.mesh.visible=false;s.mesh.material.opacity=0;if(s.aura)s.aura.material.uniforms.uOpacity.value=0;}}
 update(dt){for(const s of [...this.endPool,...this.riftPool,...this.burstPool,...this.slashPool]){s.life=Math.max(0,s.life-dt);s.mesh.visible=s.life>0;const phase=1-s.life/(s.duration??.24);s.mesh.material.opacity=s.life>0?Math.max(0,Math.sin(Math.PI*phase))*(s.peak??.18):0;s.mesh.scale.setScalar((s.scale??1.8)*(s.kind==='burst'?.5+phase*1.3:.85+.15*phase));if(s.aura){s.aura.material.uniforms.uPhase.value=phase;s.aura.material.uniforms.uOpacity.value=s.mesh.material.opacity*.7;}}}
}
