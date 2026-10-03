import { roninMotion } from './RoninMotion.js';
import { AnimationClip, AnimationMixer, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack, Vector3 } from 'three';

const FEET = {
  queen: [['foot_l_0103', 'ball_l_0104'], ['foot_r_0107', 'ball_r_0108']],
  samurai: [['CATRigLLegAnkle_04', 'CATRigLLegDigit11_05'], ['CATRigRLegAnkle_08', 'CATRigRLegDigit11_09']],
  mage: [['CC_Base_L_Foot_07', 'CC_Base_L_ToeBase_09'], ['CC_Base_R_Foot_023', 'CC_Base_R_ToeBase_024']]
};
const SHOULDERS = {
  queen: ['upperarm_l_09', 'upperarm_r_056'],
  samurai: ['CATRigLArm1_023', 'CATRigRArm1_043'],
  mage: ['CC_Base_L_Upperarm_052', 'CC_Base_R_Upperarm_080']
};
export function rigForward(model, definition) {
  const direction = new Vector3();
  for (const [from, to] of definition.facingBones ?? FEET[definition.id]) {
    const a = model.getObjectByName(from), b = model.getObjectByName(to);
    if (a && b) direction.add(b.getWorldPosition(new Vector3()).sub(a.getWorldPosition(new Vector3())).setY(0).normalize());
  }
  const shoulders = SHOULDERS[definition.id];
  if (shoulders) {
    const left = model.getObjectByName(shoulders[0]), right = model.getObjectByName(shoulders[1]);
    if (left && right) {
      const across = right.getWorldPosition(new Vector3()).sub(left.getWorldPosition(new Vector3()));
      const forward = new Vector3(0, 1, 0).cross(across).normalize();
      if (forward.dot(direction) < 0) forward.negate();
      if (forward.lengthSq() > 0.1) direction.copy(forward);
    }
  }
  return direction.lengthSq() > 0.001 ? direction.normalize() : direction.set(0, 0, 1);
}

/** Keep authored creature clips; supplement presentation-only humanoids on their own skeleton. */
export function townMotions(model, animations, definition) {
  if (definition.clips) {
    const idle = animations.find(c => c.name === definition.clips.idle);
    const prepared = new Map(animations.map(source => {
      const clip = source.clone();
      const start = Math.min(...clip.tracks.map(t => t.times[0]));
      for (const t of clip.tracks) {
        if (Number.isFinite(start)) t.shift(-start);
        const root = definition.rootTracks.find(r => r.name === t.name);
        if (!root) continue;
        const reference = idle.tracks.find(r => r.name === t.name)?.values ?? t.values;
        for (let i = 0; i < t.values.length; i += 3) for (const axis of root.axes) t.values[i + axis] = reference[axis];
      }
      clip.resetDuration();
      return [clip.name, clip];
    }));
    // Use complete standalone moves, never the opening of a multipart move.
    const moves = [...definition.clips.attacks, ...definition.clips.skills].filter(name => typeof name === 'string');
    const get = name => prepared.get(Array.isArray(name) ? name[0] : name)?.clone();
    const mapped = new Map([
      ['idle', get(definition.clips.idle)], ['walk', get(definition.clips.walk)], ['run', get(definition.clips.run)],
      ['attack0', get(moves[0])], ['attack1', get(moves[1] ?? moves[0])],
      ['land', get(definition.clips.hits[0] ?? definition.clips.idle)],
      ['crouch', get(definition.clips.stuns[0] ?? definition.clips.idle)], ['death', get(definition.clips.deaths[0])]
    ]);
    for (const [key, source] of Object.entries(definition.motionMap ?? {})) mapped.set(key, get(source));
    return mapped;
  }
  const pose = animations.find(c => c.name === definition.clip);
  const mixer = new AnimationMixer(model);
  mixer.clipAction(pose).play();
  mixer.update(0);
  model.updateMatrixWorld(true);
  const bones = [];
  model.traverse(node => { if (node.isBone) bones.push(node); });
  // Convert a world-space bending axis into each bone's local frame. These
  // three exports use different bone axes; raw Euler angles cannot be shared.
  const forward = rigForward(model, definition);
  const worldAxis = new Vector3(forward.z, 0, -forward.x).normalize();
  const snapshots = bones.map(bone => ({ bone, position: bone.position.clone(), scale: bone.scale.clone(), rotation: bone.quaternion.clone(),
    axis: worldAxis.clone().applyQuaternion(bone.getWorldQuaternion(new Quaternion()).invert()),
    yawAxis: new Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new Quaternion()).invert()) }));
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  for (const { bone, rotation, position, scale } of snapshots) {
    bone.quaternion.copy(rotation); bone.position.copy(position); bone.scale.copy(scale);
  }
  const clips = new Map();
  const durations = { idle: 2.4, walk: 1.1, run: 0.72, attack0: 1.3, attack1: 1.5, land: 0.7, crouch: 1.2, death: 1.4 };
  if (definition.id === 'mage') durations.attack0 = 3.8;
  if (definition.id === 'queen') { durations.attack0 = 2.2; durations.attack1 = 3.2; }
  for (const profile of definition.attackProfiles ?? []) durations[profile.name] = profile.duration;
  for (const [name, duration] of Object.entries(durations)) {
    const profile = definition.attackProfiles?.find(p => p.name === name);
    const tracks = snapshots.map(({ bone, rotation, axis, yawAxis }) => {
      const values = [], times = [];
      const left = /(?:^L_|_l(?:\d+)?_|LArm|LLeg|_L_)/.test(bone.name);
      const leg = /thigh_[lr]_\d+$|[LR]_Thigh_\d+$|[LR]Leg1_\d+$/i.test(bone.name);
      const knee = /calf_[lr]_\d+$|[LR]_Calf_\d+$|[LR]Leg2_\d+$/i.test(bone.name);
      const arm = /upperarm_[lr](?:\d+)?_\d|[LR]Arm1_|[LR]_Upperarm_/i.test(bone.name);
      const spine = /spine_0[12]_|CATRigSpine1_011|CC_Base_Spine01_|^Spine(?:1)?_/i.test(bone.name);
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, wave = Math.sin(u * Math.PI * 2 + (left ? 0 : Math.PI));
        let angle = 0;
        if (name === 'walk' || name === 'run') {
          const stride = name === 'run' ? 0.55 : 0.32;
          angle = ['queen', 'mage', 'samurai'].includes(definition.id) ? (spine ? Math.sin(u * Math.PI * 2) * 0.025 : 0) : leg ? wave * stride : knee ? Math.max(0, -wave) * stride : arm ? -wave * stride * 0.55 : 0;
        } else if (profile) {
          // Each contact reaches the forward pose on the same timeline as damage.
          const keys = [[0, 0]];
          for (const hit of profile.hits) keys.push([hit - 0.12, -0.6], [hit, 0.85]);
          keys.push([1, 0]);
          const end = keys.findIndex(([at]) => at >= u);
          const a = keys[Math.max(0, end - 1)], b = keys[Math.max(0, end)];
          const swing = a[1] + (b[1] - a[1]) * (u - a[0]) / Math.max(0.001, b[0] - a[0]);
          if (profile.style === 'kick') angle = leg && !left ? -swing * 0.9 : knee && !left ? Math.max(0, -swing) : spine ? swing * 0.15 : 0;
          else if (profile.style === 'cast') {
            const hit = profile.hits[0];
            const reach = u <= hit ? Math.sin(u / hit * Math.PI / 2) : Math.cos((u - hit) / (1 - hit) * Math.PI / 2);
            angle = arm ? -reach * 0.7 : spine ? swing * 0.08 : 0;
          }
          else angle = arm && !left ? swing * (profile.style === 'overhead' ? 1.4 : 1) : spine ? swing * 0.25 : arm ? swing * 0.2 : 0;
        } else if (name.startsWith('attack')) {
          // Anticipation → contact at 55% → recovery, matching gameplay hits.
          let swing = u < 0.32 ? -u / 0.32 * 0.45 : u < 0.55 ? -0.45 + (u - 0.32) / 0.23 * 1.15 : 0.7 * (1 - (u - 0.55) / 0.45);
          if (definition.id === 'queen' && name === 'attack1') {
            const keys = [[0, 0], [0.25, -0.45], [0.42, 0.7], [0.6, -0.35], [0.72, 0.7], [1, 0]];
            const end = keys.findIndex(([at]) => at >= u);
            const a = keys[Math.max(0, end - 1)], b = keys[Math.max(0, end)];
            swing = a[1] + (b[1] - a[1]) * (u - a[0]) / Math.max(0.001, b[0] - a[0]);
          }
          angle = definition.id === 'mage' ? (arm && !left ? -Math.sin(Math.min(1, u / 0.55) * Math.PI / 2) * 0.85 : 0) : arm ? swing * 0.25 : spine ? swing * 0.08 : 0;
        } else if (name === 'land') angle = spine ? -Math.sin(u * Math.PI) * 0.3 : 0;
        else if (name === 'crouch' || name === 'death') angle = knee ? Math.sin(u * Math.PI / 2) * 0.7 : spine ? 0.25 * u : 0;
        else angle = spine ? Math.sin(u * Math.PI * 2) * 0.025 : 0;
        const q = rotation.clone().multiply(new Quaternion().setFromAxisAngle(profile?.style === 'sweep' ? yawAxis : axis, angle));
        times.push(u * duration); values.push(...q.toArray());
      }
      return new QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values);
    });
    if (definition.authoredIdle) for (const { bone, position } of snapshots) {
      tracks.push(new VectorKeyframeTrack(`${bone.name}.position`, [0, duration], [...position.toArray(), ...position.toArray()]));
    }
    clips.set(name, new AnimationClip(name, duration, tracks));
  }
  if (definition.authoredIdle) {
    const idle = pose.clone();
    const start = Math.min(...idle.tracks.map(t => t.times[0]));
    for (const track of idle.tracks) {
      track.shift(-start);
      if (/^(?:_rootJoint|Pelvis_012)\.position$/.test(track.name)) {
        for (let i = 3; i < track.values.length; i += 3) { track.values[i] = track.values[0]; track.values[i + 1] = track.values[1]; }
      }
    }
    idle.resetDuration(); clips.set('idle', idle);
  }
  if (definition.id === 'queen') {
    // The model already contains six levitating swords. Keep their authored
    // motion and the controlling hands; freeze the legs for hovering travel.
    for (const name of ['idle', 'walk', 'run', 'attack0', 'attack1']) {
      const clip = pose.clone(); clip.name = name;
      const duration = name.startsWith('attack') ? durations[name] : pose.duration;
      for (const track of clip.tracks) {
        if (/thigh|calf|foot|ball|pelvis.*position/i.test(track.name)) {
          const size = track.getValueSize();
          for (let i = size; i < track.values.length; i++) track.values[i] = track.values[i % size];
        }
        track.scale(duration / pose.duration);
      }
      clip.resetDuration(); clips.set(name, clip);
    }
  }
  if (definition.id === 'samurai') {
    clips.set('attack0', roninMotion(pose, 'attack0'));
    clips.set('attack1', roninMotion(pose, 'attack1'));
  }
  return clips;
}
