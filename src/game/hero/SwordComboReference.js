import { smoothPhase } from './SheathReference.js';

// Hand-authored reconstruction of the opening of the supplied 0746-52
// Yamato Combo A recording. Not extracted original animation data.
// Shoulder-relative wrist offset, then blade direction; metres, forward +Z.
const OPEN = [-.26, -.30, .28, -.8, .04, .6];
const FOLLOW = [.34, -.18, .36, 1, .08, .22];
const RETURN = [-.26, -.26, .36, -.85, .12, .55];
const REST = [.05, -.38, .18, .1, .3, 1];
const HIGH = [.12, .18, .30, .1, 1, .25];
const FINISH = [.24, -.33, .40, .2, -.8, .5];
export const COMBO_OPENING_PATHS = {
  k1: [[0,...OPEN],[.18,...OPEN],[.48,...FOLLOW],[.82,...FOLLOW],[1,...REST]],
  k2: [[0,...FOLLOW],[.18,...FOLLOW],[.48,...RETURN],[.82,...RETURN],[1,...REST]]
};
// Preserve the game's five inputs. Later cuts are compatible reconstructions,
// not a claim that the recording proves exactly these five stages/hit counts.
export const COMBO_REFERENCE_PATHS = {
  ...COMBO_OPENING_PATHS,
  k3: [[0,...RETURN],[.18,...RETURN],[.48,...HIGH],[.82,...HIGH],[1,...REST]],
  k4: [[0,...HIGH],[.12,...HIGH],[.32,...FOLLOW],[.45,...FOLLOW],[.65,...RETURN],[.82,...RETURN],[1,...REST]],
  k5: [[0,...RETURN],[.22,.12,.20,.25,.1,.85,.45],[.48,...FINISH],[.82,...FINISH],[1,...REST]]
};

export function sampleSwordPath(keys, phase) {
  let index = keys.findIndex(key => key[0] >= phase);
  if (index < 1) index = phase > keys.at(-1)[0] ? keys.length - 1 : 1;
  const a = keys[index - 1], b = keys[index];
  const u = smoothPhase(phase, a[0], b[0]);
  return a.slice(1).map((value, i) => value + (b[i + 1] - value) * u);
}
