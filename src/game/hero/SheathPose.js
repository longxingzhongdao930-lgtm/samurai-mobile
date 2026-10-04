/** Keep the crouch's legs, but do not reuse a cutting torso for sheathing. */
export function sheathPose(crouch, idle) {
  if (!crouch || !idle) return crouch;
  const clip = crouch.clone();
  const torso = /(?:^|[^a-z])(?:mixamorig:?|mixamorig_)?(?:Hips|Spine\d*)\.quaternion$/i;
  clip.tracks = clip.tracks.map(track => {
    if (!torso.test(track.name)) return track;
    const rest = idle.tracks.find(candidate => candidate.name === track.name);
    if (!rest) return track;
    const result = track.clone();
    const value = rest.createInterpolant().evaluate(0);
    for (let i = 0; i < result.times.length; i++) result.values.set(value, i * 4);
    return result;
  });
  return clip;
}

/** Grounded dual strikes: imported Slash contains a raised knee/run pose.
 * Keep its duration for hit timing, but author the legs separately from idle.
 * Walking, dodging, the single sword and airborne attacks keep their clips.
 */
export function dualCombatPose(source,idle){
  const clip=sheathPose(source,idle);
  if(!clip||!idle)return clip;
  const lower=/(?:Hips\.(?:position|quaternion)|(?:Left|Right)(?:UpLeg|Leg|Foot|ToeBase)\.quaternion)$/;
  clip.tracks=clip.tracks.map(track=>{
    if(!lower.test(track.name))return track;
    const rest=idle.tracks.find(t=>t.name===track.name);if(!rest)return track;
    const copy=track.clone(),value=rest.createInterpolant().evaluate(0);
    for(let i=0;i<copy.times.length;i++)copy.values.set(value,i*value.length);
    return copy;
  });
  return clip;
}
