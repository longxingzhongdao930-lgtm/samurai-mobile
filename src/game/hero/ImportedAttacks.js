import { versionedAsset } from '../../core/BuildVersion.js';
import { AnimationClip } from 'three';
/** Prepared against the preserved samurai bind pose; source FBX stays untouched. */
export async function loadImportedAttacks(character){
 const results=await Promise.allSettled(['quick-slash','heavenly-strike-2'].map(async id=>{
  const response=await fetch(versionedAsset('./animations/imported/'+id+'.json'),{cache:'no-cache'});if(!response.ok)throw new Error(id+': '+response.status);
  const data=await response.json();const clip=AnimationClip.parse(data);clip.userData=data.source;character.clips.set(id,clip);return id;
 }));
 for(const result of results)if(result.status==='rejected')console.warn('[ImportedAttacks] existing animation fallback',result.reason);
}
