import { writeFileSync, mkdirSync } from 'node:fs';
import { createKatanaEffectGeometry } from '../src/game/fx/KatanaEffectGeometry.js';
mkdirSync('public/models/fx',{recursive:true});
for(const kind of ['slash','rift','end','burst','lightning','waist']){
 const geometry=createKatanaEffectGeometry(kind),position=geometry.attributes.position,normal=geometry.attributes.normal,uv=geometry.attributes.uv;
 const p=Buffer.from(position.array.buffer),n=Buffer.from(normal.array.buffer),u=Buffer.from(uv.array.buffer),bin=Buffer.concat([p,n,u]);
 geometry.computeBoundingBox();const bounds=geometry.boundingBox;
 const doc={asset:{version:'2.0',generator:'Samurai Mobile original parametric 3D effects',extras:{originalGeometry:true,source:'src/game/fx/KatanaEffectGeometry.js',effect:kind}},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:geometry.name}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},material:0}]}],materials:[{doubleSided:true,alphaMode:'BLEND',pbrMetallicRoughness:{baseColorFactor:[.65,.78,1,.18],metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_unlit:{}}}],extensionsUsed:['KHR_materials_unlit'],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:p.length,target:34962},{buffer:0,byteOffset:p.length,byteLength:n.length,target:34962},{buffer:0,byteOffset:p.length+n.length,byteLength:u.length,target:34962}],accessors:[{bufferView:0,componentType:5126,count:position.count,type:'VEC3',min:bounds.min.toArray(),max:bounds.max.toArray()},{bufferView:1,componentType:5126,count:normal.count,type:'VEC3'},{bufferView:2,componentType:5126,count:uv.count,type:'VEC2'}]};
 const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
 const output=Buffer.concat([header,jh,json,bh,bin]);writeFileSync('public/models/fx/black-rain-'+kind+'.glb',output);console.log(kind,position.count/3+' triangles',output.length+' bytes');
}
