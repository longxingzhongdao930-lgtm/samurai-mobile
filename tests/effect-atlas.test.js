import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Texture, PerspectiveCamera, Vector3 } from 'three';
import { EffectAtlas } from '../src/game/fx/EffectAtlas.js';
test('effect billboards update their world matrix before the renderer consumes it',()=>{
 const group=new Group(),fx=new EffectAtlas(group,{load:()=>new Texture()});
 const camera=new PerspectiveCamera();camera.position.set(2,1,3);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 fx.spawn('71330',new Vector3(),.7,.22);
 const mesh=fx.slots.find(s=>s.mesh.visible).mesh;
 mesh.onBeforeRender(null,null,camera);
 const normal=new Vector3(0,0,1).transformDirection(mesh.matrixWorld);
 assert.ok(normal.dot(new Vector3(0,0,1).applyQuaternion(camera.quaternion))>.999);
 for(let i=0;i<10;i++)fx.spawn('71330',new Vector3());
 assert.equal(fx.slots.filter(s=>s.mesh.visible).length,3);
 fx.update(1);assert.ok(fx.slots.every(s=>!s.mesh.visible));
 fx.spawn('127578',new Vector3());fx.clear();assert.ok(fx.slots.every(s=>!s.mesh.visible));
 fx.dispose();assert.equal(group.children.length,0);
});
