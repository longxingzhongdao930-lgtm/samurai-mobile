import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBO_OPENING_PATHS, COMBO_REFERENCE_PATHS, sampleSwordPath } from '../src/game/hero/SwordComboReference.js';
import { AnimationClip, QuaternionKeyframeTrack } from 'three';
import { swordBodyClip } from '../src/game/hero/SwordMoves.js';
const close = (a, b) => assert.ok(a.every((value, i) => Math.abs(value - b[i]) < 1e-10));

test('opening holds its follow-through throughout the combo input window', () => {
  const first = sampleSwordPath(COMBO_OPENING_PATHS.k1, .48);
  for (const phase of [.73, .77, .82]) {
    close(sampleSwordPath(COMBO_OPENING_PATHS.k1, phase), first);
    close(sampleSwordPath(COMBO_OPENING_PATHS.k2, 0), first);
  }
});

test('all five stages link from their held blade path, rather than returning to rest', () => {
  for(let i=1;i<5;i++) close(sampleSwordPath(COMBO_REFERENCE_PATHS['k'+i],.73), sampleSwordPath(COMBO_REFERENCE_PATHS['k'+(i+1)],0));
});

test('successive cuts alternate the gait instead of borrowing one stationary walking frame', () => {
  const idle=new AnimationClip('idle',1,[new QuaternionKeyframeTrack('RightUpLeg.quaternion',[0,1],[0,0,0,1,0,0,0,1])]);
  const values=[0,.8,0,-.8,0].flatMap(angle=>[Math.sin(angle/2),0,0,Math.cos(angle/2)]);
  const walk=new AnimationClip('walk',1,[new QuaternionKeyframeTrack('RightUpLeg.quaternion',[0,.25,.5,.75,1],values)]);
  const source=walk.toJSON();
  const first=swordBodyClip(idle,'k1',1,null,walk).tracks[0].createInterpolant().evaluate(.48)[0];
  const second=swordBodyClip(idle,'k2',1,null,walk).tracks[0].createInterpolant().evaluate(.48)[0];
  assert.ok(first>.05 && second<-.05);
  assert.deepEqual(walk.toJSON(),source);
});

test('opening paths remain finite and recover when the player stops attacking', () => {
  for (const keys of Object.values(COMBO_OPENING_PATHS)) {
    for (let phase = 0; phase <= 1; phase += 1 / 120) {
      const sample = sampleSwordPath(keys, phase);
      assert.ok(sample.every(Number.isFinite));
      assert.ok(Math.hypot(...sample.slice(3)) > .1);
    }
  }
  close(sampleSwordPath(COMBO_OPENING_PATHS.k1, 1), sampleSwordPath(COMBO_OPENING_PATHS.k2, 1));
});
