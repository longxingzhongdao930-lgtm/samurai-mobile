import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AnimationClip } from 'three';
for(const id of ['quick-slash','heavenly-strike-2'])test(id+' preserves joint lengths and finite rotations while removing horizontal root travel',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/animations/imported/'+id+'.json',import.meta.url))),clip=AnimationClip.parse(data);
 assert.equal(clip.tracks.length,26);assert.ok(data.source.duration>clip.duration);assert.ok(data.source.hitPhase>.2&&data.source.hitPhase<.4);
 for(const t of clip.tracks){assert.ok(!t.name.endsWith('.scale'));assert.ok([...t.values].every(Number.isFinite));if(t.name.endsWith('.quaternion'))for(let i=0;i<t.values.length;i+=4)assert.ok(Math.abs(Math.hypot(...t.values.slice(i,i+4))-1)<.00001);}
 const hip=clip.tracks.find(t=>t.name.endsWith('Hips.position'));for(let i=0;i<hip.values.length;i+=3){assert.equal(hip.values[i],hip.values[0]);assert.equal(hip.values[i+2],hip.values[2]);}
});
