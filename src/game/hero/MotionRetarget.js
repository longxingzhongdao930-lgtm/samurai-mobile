import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack, Vector3 } from 'three';
export function canonicalBone(raw){let n=raw.replace(/^.*:/,'').replace(/^mixamorig\d*/i,'').replace(/^armature/i,'').toLowerCase().replace(/[\s_.-]/g,'');const side=n.endsWith('l')?'left':n.endsWith('r')?'right':null;if(side){const part=n.slice(0,-1),parts={upperarm:'arm',forearm:'forearm',hand:'hand',thigh:'upleg',shin:'leg',foot:'foot'};if(parts[part])n=side+parts[part];}return ({pelvis:'hips',hip:'hips',spine01:'spine',spine02:'spine1',spine03:'spine2'})[n]??n;}
export function restPose(root){
 // GLB inverse-bind matrices may live in scaled mesh space. Use the imported
 // local bind pose, captured once before playback, rather than decomposing
 // inverse binds into a different unit system.
 if(root.userData.motionRest)return root.userData.motionRest;
 root.updateMatrixWorld(true);const result={};root.traverse(b=>{if(b.isBone)result[b.name]={position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray(),worldQuaternion:b.getWorldQuaternion(new Quaternion()).toArray(),parent:b.parent?.isBone?b.parent.name:null};});
 root.userData.motionRest=result;return result;
}
/** Retarget local rest-pose deltas; unusual bone axes can be corrected per bone.
 * Non-humanoid topology needs explicit mappings and separate authored motions.
 */
export function retargetMotion(data,root,{boneMap={},rotationOffsets={},height=0,chest=0,autoAxes=false}={}){
 const bones=new Map();root.traverse(b=>{if(b.isBone)bones.set(b.name,b);});const byName=new Map([...bones].map(([n,b])=>[canonicalBone(n),b])),rest=restPose(root),tracks=[],missing=[],mapped=[];
 const sourceWorld=(name,seen=new Set())=>{const r=data.sourceRest?.[name];if(!r||seen.has(name))return new Quaternion();seen.add(name);const q=new Quaternion().fromArray(r.quaternion);return r.parent?sourceWorld(r.parent,seen).multiply(q):q;};
 const sourceHip=Object.keys(data.sourceRest??{}).find(n=>canonicalBone(n)==='hips'),targetHip=bones.get(boneMap.hips)??byName.get('hips'),alignment=targetHip&&sourceHip?new Quaternion().fromArray(rest[targetHip.name].worldQuaternion??rest[targetHip.name].quaternion).multiply(sourceWorld(sourceHip).invert()):new Quaternion();
 for(const t of data.tracks){const dot=t.name.lastIndexOf('.'),source=t.name.slice(0,dot),property=t.name.slice(dot+1),id=canonicalBone(source),target=bones.get(boneMap[source]??boneMap[id])??byName.get(id);if(!target){missing.push(source);continue;}const sr=data.sourceRest?.[source],tr=rest[target.name];if(property==='quaternion'){
  const sourceQ=sr?new Quaternion().fromArray(sr.quaternion):new Quaternion(),targetQ=new Quaternion().fromArray(tr.quaternion),offset=rotationOffsets[source]??rotationOffsets[id]??[0,0,0],basis=new Quaternion().setFromEuler(new Euler(...offset.map(v=>v*Math.PI/180))),values=[];if(autoAxes&&sr)basis.premultiply(new Quaternion().fromArray(tr.worldQuaternion??tr.quaternion).invert().multiply(alignment).multiply(sourceWorld(source)));
  for(let i=0;i<t.values.length;i+=4){const delta=sourceQ.clone().invert().multiply(new Quaternion().fromArray(t.values,i));const q=targetQ.clone().multiply(basis).multiply(delta).multiply(basis.clone().invert());if(id==='spine1'||id==='spine2')q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),chest*Math.PI/360));q.normalize().toArray(values,values.length);}tracks.push(new QuaternionKeyframeTrack(target.name+'.quaternion',t.times,values));
 }else if(property==='position'&&id==='hips'){
  const src=sr?.position??t.values.slice(0,3),base=new Vector3().fromArray(tr.position),scale=Math.max(.0001,Math.hypot(...tr.position))/Math.max(.0001,Math.hypot(...src)),values=[];for(let i=0;i<t.values.length;i+=3){const pos=new Vector3().fromArray(t.values,i).sub(new Vector3().fromArray(src)).multiplyScalar(scale).add(base);pos.y+=height;pos.toArray(values,values.length);}tracks.push(new VectorKeyframeTrack(target.name+'.position',t.times,values));
 }mapped.push({source,target:target.name});}
 return {clip:new AnimationClip(data.name,data.duration,tracks),mapped,missing:[...new Set(missing)]};
}
