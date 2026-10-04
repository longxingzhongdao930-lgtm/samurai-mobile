import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, AnimationMixer, Bone, QuaternionKeyframeTrack } from 'three';
import { PoseLayer } from '../src/game/combat/PoseLayer.js';

for (const [name, blendIn, blendOut, repeatedHold] of [['guard', .07, .14, true], ['sheath/iai', .12, .1, false]]) {
  test(`${name} holds full weight and a constant pose at 30/60/120 fps, then fades out`, () => {
    for (const fps of [30, 60, 120]) {
      const bone = new Bone(); bone.name = 'joint';
      const mixer = new AnimationMixer(bone);
      const idle = new AnimationClip('idle', 1, [new QuaternionKeyframeTrack('joint.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
      const pose = new AnimationClip('pose', 1, [new QuaternionKeyframeTrack('joint.quaternion', [0, 1], [0, 0, .6, .8, 0, 0, .6, .8])]);
      const idleAction = mixer.clipAction(idle).play();
      const layer = new PoseLayer(mixer, pose, { blendIn, blendOut }); layer.hold(.35);
      let held;
      for (let frame = 0; frame < fps * 3; frame++) {
        if (repeatedHold) layer.hold(.35);
        layer.update(1 / fps); idleAction.setEffectiveWeight(1 - layer.weight); mixer.update(1 / fps);
        if (frame > fps) {
          assert.equal(layer.weight, 1, `frame ${frame}, ${fps} fps`);
          if (held) assert.ok(bone.quaternion.angleTo(held) < 1e-6);
          held = bone.quaternion.clone();
        }
      }
      layer.stop(); let last = layer.weight;
      for (let frame = 0; frame < fps; frame++) {
        layer.update(1 / fps); assert.ok(layer.weight <= last); last = layer.weight;
      }
      assert.equal(layer.weight, 0); assert.equal(layer.action.enabled, false);
    }
  });
}
