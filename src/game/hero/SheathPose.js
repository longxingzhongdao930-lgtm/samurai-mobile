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
