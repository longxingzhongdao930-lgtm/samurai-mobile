import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

/** Original parametric ribbons. No sampled or imported model geometry. */
export function createKatanaEffectGeometry(kind='rift') {
 const vertices=[];
 const ribbon=(radius,start,sweep,width,tilt,turn,depth)=>{
  const point=(t,side)=>{const angle=start+sweep*t,r=radius+side*width*Math.sin(Math.PI*t);return new Vector3(Math.cos(angle)*r,Math.sin(angle)*r,depth*Math.sin(angle*2)).applyAxisAngle(new Vector3(1,0,0),tilt).applyAxisAngle(new Vector3(0,1,0),turn);};
  for(let i=0;i<32;i++){const a=point(i/32,-1),b=point(i/32,1),c=point((i+1)/32,-1),d=point((i+1)/32,1);for(const p of [a,b,c,b,d,c])vertices.push(p.x,p.y,p.z);}
 };
 if(kind==='waist')ribbon(1.05,-1.9,3.8,.075,0,0,.055);
 else if(kind==='slash')ribbon(1.1,-.9,2.2,.035,.2,0,.08);
 else if(kind==='rift'){
  // The reference closes with straight crossing cuts, rather than circular rings.
  for(let i=0;i<4;i++){
   const direction=new Vector3(Math.cos(i*.92+.3),Math.sin(i*.92+.3),Math.sin(i*1.3)*.25).normalize(),normal=new Vector3(-direction.y,direction.x,0).normalize();
   const point=(t,side)=>direction.clone().multiplyScalar((t*2-1)*1.05).addScaledVector(normal,side*.025*Math.sin(Math.PI*t));
   for(let j=0;j<16;j++){const a=point(j/16,-1),b=point(j/16,1),c=point((j+1)/16,-1),d=point((j+1)/16,1);for(const p of [a,b,c,b,d,c])vertices.push(p.x,p.y,p.z);}
  }
 }
 else if(kind==='lightning'){
  for(let branch=0;branch<6;branch++){
   const angle=branch*Math.PI/3,direction=new Vector3(Math.cos(angle),Math.sin(angle),Math.sin(branch*1.8)*.4).normalize(),side=new Vector3(-direction.y,direction.x,0).normalize();
   const at=t=>direction.clone().multiplyScalar(.1+t*.7).addScaledVector(side,Math.sin(t*33+branch*2.4)*.08*Math.sin(Math.PI*t));
   for(let i=0;i<8;i++){const a=at(i/8),b=at((i+1)/8),width=side.clone().multiplyScalar(.008);for(const p of [a.clone().sub(width),a.clone().add(width),b.clone().sub(width),a.clone().add(width),b.clone().add(width),b.clone().sub(width)])vertices.push(p.x,p.y,p.z);}
  }
 }
 else if(kind==='end'){
  // Long oblique cuts cross the volume; keep the middle open for the characters.
  for(let i=0;i<12;i++){
   const direction=new Vector3(Math.cos(i*1.13),Math.sin(i*1.13),Math.sin(i*.71)*.65).normalize(),normal=new Vector3(-direction.y,direction.x,.08).normalize(),offset=new Vector3(Math.sin(i*2.1)*.8,Math.cos(i*1.7)*.8,Math.sin(i*.9)*1.2);
   const point=(t,side)=>direction.clone().multiplyScalar((t*2-1)*2.8).add(offset).addScaledVector(normal,side*.012*Math.sin(Math.PI*t));
   for(let j=0;j<16;j++){const a=point(j/16,-1),b=point(j/16,1),c=point((j+1)/16,-1),d=point((j+1)/16,1);for(const p of [a,b,c,b,d,c])vertices.push(p.x,p.y,p.z);}
  }
 }
 else if(kind==='flash'){
  for(const [length,width,angle] of [[3.2,.075,0],[1.7,.045,Math.PI/2],[2.1,.018,.55],[2.1,.018,-.55]]){
   const direction=new Vector3(Math.cos(angle),Math.sin(angle),0),normal=new Vector3(-direction.y,direction.x,0);
   const point=(t,side)=>direction.clone().multiplyScalar((2*t-1)*length).addScaledVector(normal,side*width*Math.sin(Math.PI*t)).add(new Vector3(0,0,.06*Math.sin(Math.PI*t)));
   for(let j=0;j<16;j++){const a=point(j/16,-1),b=point(j/16,1),c=point((j+1)/16,-1),d=point((j+1)/16,1);for(const p of [a,b,c,b,d,c])vertices.push(p.x,p.y,p.z);}
  }
 }
 else if(kind==='burst'){
  for(let i=0;i<16;i++){
   const y=1-2*(i+.5)/16,angle=i*2.399963,direction=new Vector3(Math.sqrt(1-y*y)*Math.cos(angle),y,Math.sqrt(1-y*y)*Math.sin(angle));
   const side=new Vector3(0,1,0).cross(direction).normalize().multiplyScalar(.035),base=direction.clone().multiplyScalar(.12),tip=direction.clone().multiplyScalar(1.1+(i%3)*.2);
   for(const p of [base.clone().sub(side),base.clone().add(side),tip])vertices.push(p.x,p.y,p.z);
  }
 }
 else throw new Error('Unknown katana effect: '+kind);
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));const uv=[];for(let i=0;i<vertices.length/3;i++){const edge=kind==='burst'?[0,1,.5][i%3]:[0,1,0,1,1,0][i%6];uv.push((i%6<3?0:1),edge);}geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.name='黒雨・自作3D・'+kind;return geometry;
}
