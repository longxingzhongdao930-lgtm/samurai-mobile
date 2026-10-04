import { AnimationClip, Quaternion, Vector3 } from 'three';

const TORSO = /(?:Hips|Spine\d*)\.quaternion$/i;
/** Reference reconstruction: held crouch, quiet legs, forward/side-on torso.
 * Source clips stay intact; unseen depth is adapted to the samurai's rig.
 */
export function vergilIaiStance(crouch, idle) {
  if (!crouch || !idle) return crouch;
  const tracks=crouch.tracks.map(track=>{
    const result=track.clone();
    const rest=idle.tracks.find(t=>t.name===track.name);
    const value=Array.from((TORSO.test(track.name)&&rest?rest:track).createInterpolant().evaluate(TORSO.test(track.name)&&rest?0:crouch.duration*.35));
    if(/Spine\d*\.quaternion$/i.test(track.name)){
      const q=new Quaternion().fromArray(value);
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.09));
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-.13));
      q.toArray(value);
    }
    result.times=new Float32Array([0,1]);
    result.values=new Float32Array([...value,...value]);
    return result;
  });
  return new AnimationClip('Vergil inspired low iai stance',1,tracks);
}

/** Full-body keyed reconstruction. The old cutting clip supplies duration only;
 * every body track now comes from the held reference/rest poses and these keys.
 * Camera-hidden depth remains an adaptation, not recovered game animation data.
 */
export const IAI_BODY_KEYS=[
  // phase, standing blend, forward lean, chest yaw, rear-leg release
  [0,0,0,0,0], [.12,0,.02,-.03,0], [.28,.08,.10,-.12,.12],
  [.48,.06,.14,-.22,.32], [.66,.03,.08,.12,.2],
  [.8,.18,.03,.08,.3], [.9,.55,.015,.03,.65], [1,1,0,0,1]
];
export function vergilIaiCut(source, stance, idle, seconds=source?.duration) {
  if(!source||!stance||!idle)return source;
  const start=seconds*.12,end=seconds*.92;
  const times=[0,...IAI_BODY_KEYS.map(k=>start+(end-start)*k[0]),seconds];
  const frames=[IAI_BODY_KEYS[0],...IAI_BODY_KEYS,IAI_BODY_KEYS.at(-1)];
  const tracks=stance.tracks.map(track=>{
    const result=track.clone(),rest=idle.tracks.find(t=>t.name===track.name);
    const from=Array.from(track.createInterpolant().evaluate(0));
    const to=rest?Array.from(rest.createInterpolant().evaluate(0)):from;
    const values=[],size=track.getValueSize();
    for(const key of frames){
      let blend=key[1];
      if(/Left(?:UpLeg|Leg|Foot)\.quaternion$/i.test(track.name))blend=key[4];
      if(size===4&&track.name.endsWith('.quaternion')){
        const q=new Quaternion().fromArray(from).slerp(new Quaternion().fromArray(to),blend);
        if(/Spine\d*\.quaternion$/i.test(track.name)){
          q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),key[2]/3));
          q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),key[3]/3));
        }
        q.normalize().toArray(values,values.length);
      }else for(let i=0;i<size;i++)values.push(from[i]+(to[i]-from[i])*blend);
    }
    result.times=new Float32Array(times);result.values=new Float32Array(values);return result;
  });
  return new AnimationClip('Reference iai full body reconstruction',seconds,tracks);
}
