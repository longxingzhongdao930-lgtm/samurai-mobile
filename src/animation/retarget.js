import { AnimationClip, PropertyBinding } from 'three';

/**
 * Lift a Mixamo clip onto a rig that shares its joint names.
 *
 * Shared by the player's `CharacterController` and the enemy population: both
 * bodies are rigged to Mixamo's `mixamorig:` skeleton, so one set of motion
 * files can drive every body on stage. See `CharacterController#_retarget` for
 * the reasoning behind the unit correction and the frozen hips.
 *
 * @param {import('three').AnimationClip} clip
 * @param {Map<string, import('three').Bone>} bones raw and namespace-stripped names
 * @param {string} name what to call the result
 * @param {{onHipsTrack?: (track: import('three').KeyframeTrack) => void}} [options]
 * @returns {import('three').AnimationClip|null}
 */
export function retargetClip(clip, bones, name, { onHipsTrack = null } = {}) {
  if (!clip) return null;
  const hips = bones.get('Hips')?.name ?? null;
  const unitScale = measureClipUnits(clip, bones, hips);
  const tracks = [];

  for (const original of clip.tracks) {
    const node = PropertyBinding.parseTrackName(original.name).nodeName;
    if (!bones.has(node)) continue;
    const track = original.clone();

    if (track.name.endsWith('.position')) {
      const values = track.values;
      if (unitScale !== 1) {
        for (let i = 0; i < values.length; i++) values[i] *= unitScale;
      }
      if (node === hips) {
        onHipsTrack?.(track);
        const bind = bones.get('Hips');
        const x = bind ? bind.position.x : values[0];
        const z = bind ? bind.position.z : values[2];
        for (let i = 0; i < values.length; i += 3) {
          values[i] = x;
          values[i + 2] = z;
        }
      }
    }

    tracks.push(track);
  }

  return tracks.length ? new AnimationClip(name, clip.duration, tracks) : null;
}

/**
 * How far the clip's units are from the rig's, read off bone lengths below the
 * hips (the median, so one odd track cannot decide it).
 */
export function measureClipUnits(clip, bones, hipsName) {
  const ratios = [];
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position') || track.values.length < 3) continue;
    const nodeName = PropertyBinding.parseTrackName(track.name).nodeName;
    if (nodeName === hipsName) continue;
    const bone = bones.get(nodeName);
    if (!bone) continue;
    const clipLength = Math.hypot(track.values[0], track.values[1], track.values[2]);
    const bindLength = bone.position.length();
    if (clipLength < 1e-6 || bindLength < 1e-6) continue;
    ratios.push(bindLength / clipLength);
  }
  if (!ratios.length) return 1;
  ratios.sort((a, b) => a - b);
  const ratio = ratios[ratios.length >> 1];
  return ratio > 0.5 && ratio < 2 ? 1 : ratio;
}
