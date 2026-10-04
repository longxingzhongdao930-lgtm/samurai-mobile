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
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.075));
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-.07));
      q.toArray(value);
    }
    result.times=new Float32Array([0,1]);
    result.values=new Float32Array([...value,...value]);
    return result;
  });
  return new AnimationClip('Vergil inspired low iai stance',1,tracks);
}

/** Blend the held reference stance into the existing cut and back to idle.
 * This reconstructs the entry/recovery; the core slash is the authored source.
 */
export function vergilIaiCut(source, stance, idle) {
  if(!source||!stance||!idle)return source;
  const clip=source.clone();clip.name='Vergil inspired iai entry and recovery';
  const start=source.duration*.12,end=source.duration*.92;
  clip.tracks=clip.tracks.map(track=>{
    const held=stance.tracks.find(t=>t.name===track.name),rest=idle.tracks.find(t=>t.name===track.name);
    if(!held||!rest)return track.clone();
    const result=track.clone(),size=track.getValueSize(),times=Array.from(new Set([...Array.from(track.times),start,end])).sort((a,b)=>a-b);
    const sampler=track.createInterpolant(),from=Array.from(held.createInterpolant().evaluate(0)),to=Array.from(rest.createInterpolant().evaluate(0)),values=[];
    for(const time of times){
      const phase=(time-start)/(end-start),value=Array.from(sampler.evaluate(time));
      const entering=Math.max(0,Math.min(1,phase/.22)),leaving=Math.max(0,Math.min(1,(phase-.84)/.16));
      if(size===4&&track.name.endsWith('.quaternion')){
        const q=new Quaternion().fromArray(from).slerp(new Quaternion().fromArray(value),entering);
        q.slerp(new Quaternion().fromArray(to),leaving).toArray(values,values.length);
      }else{
        for(let i=0;i<size;i++)values.push((from[i]+(value[i]-from[i])*entering)*(1-leaving)+to[i]*leaving);
      }
    }
    result.times=new Float32Array(times);result.values=new Float32Array(values);return result;
  });
  return clip;
}
