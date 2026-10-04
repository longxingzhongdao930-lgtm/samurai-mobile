import test from 'node:test';
import assert from 'node:assert/strict';
import { createKatanaEffectGeometry } from '../src/game/fx/KatanaEffectGeometry.js';
import { SpectralAssets } from '../src/game/fx/SpectralAssets.js';
import { Group, Vector3 } from 'three';
test('original effects are finite, small, and genuinely three dimensional',()=>{for(const kind of ['slash','rift','end','burst']){const g=createKatanaEffectGeometry(kind),p=g.attributes.position;assert.ok(p.count/3<=800);assert.ok([...p.array].every(Number.isFinite));assert.ok(g.boundingSphere.radius<4);const z=[...p.array].filter((_,i)=>i%3===2);assert.ok(Math.max(...z)-Math.min(...z)>.05);}});
test('original effects work without downloading any imported model and cannot accumulate',()=>{const a=new SpectralAssets(new Group());for(let i=0;i<12;i++)assert.ok(a.rift(new Vector3()));assert.equal(a.rift(new Vector3()),false);assert.ok(a.end(new Vector3()));a.update(.25);assert.ok([...a.riftPool,...a.endPool].every(s=>!s.mesh.visible&&s.mesh.material.opacity===0));});
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
test('exported original GLBs load in the game loader without textures',async()=>{for(const kind of ['slash','rift','end','burst']){const raw=readFileSync(new URL('../public/models/fx/black-rain-'+kind+'.glb',import.meta.url)),buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);const gltf=await new GLTFLoader().parseAsync(buffer,'');assert.equal(gltf.asset.extras.originalGeometry,true);let meshes=0;gltf.scene.traverse(o=>{if(o.isMesh){meshes++;assert.ok(o.geometry.attributes.position.count>0);assert.equal(o.material.map,null);}});assert.equal(meshes,1);}});
test('purple space cloud fades with its slash and reset clears its shader',()=>{const a=new SpectralAssets(new Group());a.rift(new Vector3());a.update(.12);const slot=a.riftPool[0];assert.ok(slot.aura.material.uniforms.uOpacity.value>0);assert.ok(slot.mesh.material.opacity<=.42);a.reset();assert.equal(slot.aura.material.uniforms.uOpacity.value,0);assert.equal(slot.mesh.visible,false);});

test('the final burst is pooled, expands, and returns to hidden without lingering',()=>{const a=new SpectralAssets(new Group());assert.ok(a.burst(new Vector3()));a.update(.06);const first=a.burstPool[0].mesh.scale.x;a.update(.06);assert.ok(a.burstPool[0].mesh.scale.x>first);a.update(.13);assert.equal(a.burstPool[0].mesh.visible,false);});

test('draw crescent follows a real hand point, is oriented for facing, and expires rapidly',()=>{const a=new SpectralAssets(new Group()),at=new Vector3(2,1,3);assert.ok(a.slash(at,.5));const s=a.slashPool[0];assert.ok(s.mesh.position.equals(at));assert.ok(s.mesh.quaternion.toArray().every(Number.isFinite));a.update(.06);assert.ok(s.mesh.visible);a.update(.07);assert.equal(s.mesh.visible,false);});
