import { AnimationClip } from 'three';

// Take 001: the left hand exposes the blade at 5.5–6.1s and returns it
// at 7.5–8.33s. Preserve the original hand, weapon and attachment tracks.
export function roninMotion(source, name = 'attack0') {
  const duration = 1.8;
  const keys = [[0, 5.1], [0.26, 6.1], [0.32, 6.1], [0.58, 7.1], [0.72, 7.5], [1, source.duration]];
  const tracks = source.tracks.map(original => {
    const track = original.clone(), sampler = original.createInterpolant();
    const times = [], values = [];
    const feet = /LLeg|RLeg/.test(original.name);
    for (let i = 0; i <= 90; i++) {
      const phase = i / 90, end = keys.findIndex(([at]) => at >= phase);
      const a = keys[Math.max(0, end - 1)], b = keys[Math.max(0, end)];
      const t = a[1] + (b[1] - a[1]) * (phase - a[0]) / Math.max(0.001, b[0] - a[0]);
      times.push(phase * duration);
      values.push(...sampler.evaluate(feet ? 0 : t));
    }
    track.times = new Float32Array(times); track.values = new Float32Array(values);
    return track;
  });
  return new AnimationClip(name, duration, tracks);
}
