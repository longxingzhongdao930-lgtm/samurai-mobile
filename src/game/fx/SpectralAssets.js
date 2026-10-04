import { AdditiveBlending, DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
/** Shared lightweight geometry; imported sources and licenses stay untouched. */
export class SpectralAssets {
 constructor(group){this.group=group;this.endPool=[];this.status={force:false,end:false};}
 async load(){const loader=new GLTFLoader();const results=await Promise.allSettled(['force-edge','judgement-cut-end'].map(id=>loader.loadAsync('./models/fx/'+id+'.glb')));for(let i=0;i<results.length;i++){const r=results[i];if(r.status!=='fulfilled'){console.warn('[SpectralAssets] procedural fallback',r.reason);continue;}let geometry;r.value.scene.traverse(n=>{if(n.isMesh)geometry=n.geometry;});if(!geometry)continue;if(i===0){this.forceGeometry=geometry;this.status.force=true;}else{this.status.end=true;for(let j=0;j<4;j++){const mesh=new Mesh(geometry,new MeshBasicMaterial({color:'#88b6dd',transparent:true,opacity:0,depthWrite:false,side:DoubleSide,blending:AdditiveBlending}));mesh.visible=false;this.group.add(mesh);this.endPool.push({mesh,life:0});}}}}
 sword(fallback,material){return new Mesh(this.forceGeometry??fallback,material);}
 end(at){const slot=this.endPool.find(s=>s.life<=0);if(!slot)return false;slot.life=.24;slot.mesh.position.copy(at);slot.mesh.scale.setScalar(1.8);slot.mesh.visible=true;return true;}
 reset(){for(const s of this.endPool){s.life=0;s.mesh.visible=false;}}
 update(dt){for(const s of this.endPool){s.life=Math.max(0,s.life-dt);s.mesh.visible=s.life>0;const phase=1-s.life/.24;s.mesh.material.opacity=s.life>0?Math.max(0,Math.sin(Math.PI*phase))*.18:0;s.mesh.scale.setScalar(1.8*(.85+.15*phase));}}
}
