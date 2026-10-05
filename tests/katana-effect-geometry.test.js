import test from 'node:test';
import assert from 'node:assert/strict';
import { createKatanaEffectGeometry } from '../src/game/fx/KatanaEffectGeometry.js';
import { SpectralAssets } from '../src/game/fx/SpectralAssets.js';
import { Group, Vector3 } from 'three';
test('original effects are finite, small, and genuinely three dimensional',()=>{for(const kind of ['slash','rift','end','burst','lightning','waist','flash']){const g=createKatanaEffectGeometry(kind),p=g.attributes.position;assert.ok(p.count/3<=800);assert.ok([...p.array].every(Number.isFinite));assert.ok(g.boundingSphere.radius<4);const z=[...p.array].filter((_,i)=>i%3===2);assert.ok(Math.max(...z)-Math.min(...z)>.05);}});
test('original effects work without downloading any imported model and cannot accumulate',()=>{const a=new SpectralAssets(new Group());for(let i=0;i<12;i++)assert.ok(a.rift(new Vector3()));assert.equal(a.rift(new Vector3()),false);assert.ok(a.end(new Vector3()));a.update(.5);assert.ok([...a.riftPool,...a.endPool].every(s=>!s.mesh.visible&&s.mesh.material.opacity===0));});
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
test('exported original GLBs load in the game loader without textures',async()=>{for(const kind of ['slash','rift','end','burst','lightning','waist','flash']){const raw=readFileSync(new URL('../public/models/fx/black-rain-'+kind+'.glb',import.meta.url)),buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);const gltf=await new GLTFLoader().parseAsync(buffer,'');assert.equal(gltf.asset.extras.originalGeometry,true);let meshes=0;gltf.scene.traverse(o=>{if(o.isMesh){meshes++;assert.ok(o.geometry.attributes.position.count>0);assert.equal(o.material.map,null);}});assert.equal(meshes,1);}});
test('purple space cloud fades with its slash and reset clears its shader',()=>{const a=new SpectralAssets(new Group());a.rift(new Vector3());a.update(.12);const slot=a.riftPool[0];assert.ok(slot.aura.material.uniforms.uOpacity.value>0);assert.ok(slot.mesh.material.opacity<=.56);a.reset();assert.equal(slot.aura.material.uniforms.uOpacity.value,0);assert.equal(slot.mesh.visible,false);});

test('the final burst is pooled, expands, and returns to hidden without lingering',()=>{const a=new SpectralAssets(new Group());assert.ok(a.burst(new Vector3()));a.update(.06);const first=a.burstPool[0].mesh.scale.x;a.update(.06);assert.ok(a.burstPool[0].mesh.scale.x>first);a.update(.19);assert.equal(a.burstPool[0].mesh.visible,false);});

test('draw crescent follows a real hand point, is oriented for facing, and expires rapidly',()=>{const a=new SpectralAssets(new Group()),at=new Vector3(2,1,3);assert.ok(a.slash(at,.5));const s=a.slashPool[0];assert.ok(s.mesh.position.equals(at));assert.ok(s.mesh.quaternion.toArray().every(Number.isFinite));a.update(.06);assert.ok(s.mesh.visible);a.update(.13);assert.equal(s.mesh.visible,false);});

import { sampleKatanaEffect, KATANA_FX_PROFILES } from '../src/game/fx/KatanaEffectProfiles.js';
test('the cloud precedes crossed cuts, and all visible phases expire',()=>{const early=sampleKatanaEffect('rift',.06);assert.ok(early.cloud>0);assert.equal(early.cut,0);const crossing=sampleKatanaEffect('rift',.18);assert.ok(crossing.cloud>0&&crossing.cut>0);const late=sampleKatanaEffect('rift',.35);assert.equal(late.cloud,0);assert.ok(late.cut>0);for(const [kind,p] of Object.entries(KATANA_FX_PROFILES)){const done=sampleKatanaEffect(kind,p.duration+.001);assert.equal(done.cut,0);assert.equal(done.cloud,0);assert.equal(done.visible,false);}});

test('travel ribbons stop on reset and field clouds remain bounded by the field duration',()=>{
 const a=new SpectralAssets(new Group());a.travel(new Vector3(0,1,2),.7,.5);assert.ok(a.travelMesh.visible);assert.ok(a.travelMesh.material.uniforms.uOpacity.value>0);a.travel(null);assert.equal(a.travelMesh.visible,false);a.end(new Vector3(),.7);a.update(.2);const slot=a.endPool[0];assert.ok(slot.aura.material.uniforms.uOpacity.value>0);assert.ok(slot.aura.scale.y<slot.aura.scale.x);a.update(.51);assert.equal(slot.aura.material.uniforms.uOpacity.value,0);assert.equal(slot.mesh.visible,false);a.travel(new Vector3(),0,.5);a.reset();assert.equal(a.travelMesh.visible,false);
});

test('final horizontal flash originates at the hero, expires before the burst, and resets',()=>{
 const a=new SpectralAssets(new Group()),enemy=new Vector3(0,1,3),hero=new Vector3(0,1.1,0);assert.ok(a.burst(enemy,hero));const slot=a.burstPool[0];a.update(.05);assert.ok(slot.flash.visible);assert.ok(slot.flash.position.equals(hero));assert.ok(slot.mesh.position.equals(enemy));a.update(.10);assert.equal(slot.flash.visible,false);assert.ok(slot.mesh.visible);a.reset();assert.equal(slot.flash.material.uniforms.uOpacity.value,0);
});

test('purple flying slashes move independently, use bounded slots and reset cleanly',()=>{
 const fx=new SpectralAssets(new Group()),from=new Vector3(),to=new Vector3(0,1,3);fx.flyingSlash(from,to,0);
 const active=fx.flyPool.filter(s=>s.life>0);assert.equal(active.length,3);const start=active[0].mesh.position.clone();fx.update(.1);assert.ok(active[0].mesh.position.distanceTo(start)>.2);
 fx.reset();assert.ok(fx.flyPool.every(s=>!s.mesh.visible&&s.mesh.material.uniforms.uOpacity.value===0));
});
