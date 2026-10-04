import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, QuaternionKeyframeTrack } from 'three';
import { sheathPose } from '../src/game/hero/SheathPose.js';

test('sheath torso stays relaxed while leg tracks and source attack remain intact', () => {
  const pose = [0,0,0,1, 0,.6,0,.8];
  const crouch = new AnimationClip('crouch', 1, ['mixamorigSpine','mixamorigSpine1','mixamorigLeftUpLeg'].map(name => new QuaternionKeyframeTrack(name+'.quaternion',[0,1],pose)));
  const idle = new AnimationClip('idle',1,['mixamorigSpine','mixamorigSpine1'].map(name=>new QuaternionKeyframeTrack(name+'.quaternion',[0,1],[0,0,0,1,0,0,0,1])));
  const result = sheathPose(crouch,idle);
  for(const track of result.tracks.slice(0,2)) assert.deepEqual(Array.from(track.values),[0,0,0,1,0,0,0,1]);
  assert.deepEqual(result.tracks[2].values,crouch.tracks[2].values);
  assert.ok(crouch.tracks[0].values[5]>.5,'source attack untouched');
});
