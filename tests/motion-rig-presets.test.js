import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOTION_RIG_PRESETS } from '../src/game/hero/MotionRigPresets.js';
test('humanoid rig presets point to joints present in the actual imported models',()=>{
 for(const id of ['samurai','queen','mage']){
  const raw=readFileSync(new URL('../public/models/characters/'+id+'.glb',import.meta.url)),gltf=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString()),names=new Set(gltf.skins.flatMap(s=>s.joints).map(i=>gltf.nodes[i].name));
  for(const [role,bone] of Object.entries(MOTION_RIG_PRESETS[id]))assert.ok(names.has(bone),id+' '+role+' references missing joint '+bone);
 }
});
