import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, Bone, Group, VectorKeyframeTrack } from 'three';
import { CreatureMotion, DRAGON_CLIPS } from '../src/animation/CreatureMotion.js';
import { CreatureEnemy } from '../src/combat/CreatureEnemy.js';
import { EnemyManager } from '../src/combat/EnemyManager.js';
import { settings } from '../src/config/settings.js';

function fixture() {
  const model = new Group();
  const root = new Bone();
  root.name = 'Root';
  model.add(root);
  const clips = Object.values(DRAGON_CLIPS).flat().map((name) => new AnimationClip(name, 1, [
    new VectorKeyframeTrack('Root.position', [0, 0.5, 1], [0, 1, 0, 2, 2, 3, 4, 1, 6])
  ]));
  return { model, clips, root };
}

test('movement loops in place, retaining vertical animation and source data', () => {
  const { model, clips, root } = fixture();
  const motion = new CreatureMotion(model, clips);
  motion.play(DRAGON_CLIPS.run);
  motion.update(0.5);
  assert.equal(root.position.x, 0);
  assert.equal(root.position.z, 0);
  assert.equal(root.position.y, 2);
  motion.update(1);
  assert.equal(motion.state, DRAGON_CLIPS.run);
  assert.equal(root.position.y, 2);
  assert.equal(clips[0].tracks[0].values[3], 2);
});

test('attack finishes once, movement cannot interrupt it, and idle resumes', () => {
  const { model, clips } = fixture();
  const motion = new CreatureMotion(model, clips);
  motion.play(DRAGON_CLIPS.attacks[0], { once: true });
  assert.equal(motion.play(DRAGON_CLIPS.walk), false);
  motion.update(1.1);
  assert.equal(motion.state, DRAGON_CLIPS.idle);
  assert.equal(motion.locked, false);
  motion.update(0.25);
  assert.equal(motion.action.getEffectiveWeight(), 1);
});

test('hit interrupts an attack, death interrupts hit and holds its final pose', () => {
  const { model, clips } = fixture();
  const motion = new CreatureMotion(model, clips);
  motion.play(DRAGON_CLIPS.attacks[0], { once: true });
  motion.update(0.2);
  motion.play(DRAGON_CLIPS.hits[0], { once: true, force: true });
  assert.equal(motion.state, DRAGON_CLIPS.hits[0]);
  motion.play(DRAGON_CLIPS.deaths[0], { once: true, force: true, death: true });
  motion.update(2);
  assert.equal(motion.completed, true);
  assert.equal(motion.action.paused, true);
  assert.equal(motion.play(DRAGON_CLIPS.idle, { force: true }), false);
  assert.equal(motion.state, DRAGON_CLIPS.deaths[0]);
});

test('all eight skill actions return to idle', () => {
  const { model, clips } = fixture();
  const motion = new CreatureMotion(model, clips);
  for (const skill of DRAGON_CLIPS.skills) {
    assert.equal(motion.play(skill, { once: true }), true);
    motion.update(1.1);
    assert.equal(motion.state, DRAGON_CLIPS.idle);
  }
});

test('manager counts only lethal hits; dragon corpse waits for death completion', () => {
  const { model, clips } = fixture();
  const dragon = new CreatureEnemy({ source: model, clips, terrain: { heightAt: () => 0 } });
  const manager = new EnemyManager();
  for (let i = 1; i < settings.creatures.dragon.hitsToDefeat; i++) {
    assert.equal(manager.kill(dragon, 0, 1), true);
    assert.equal(manager.kills, 0);
    assert.equal(dragon.alive, true);
  }
  assert.equal(manager.kill(dragon, 0, 1), true);
  assert.equal(manager.kills, 1);
  assert.equal(dragon.alive, false);
  assert.equal(manager.kill(dragon, 0, 1), false);
  dragon.update(0.5);
  assert.equal(dragon.finished, false);
  dragon.update(0.6);
  dragon.update(settings.enemies.corpseTime);
  assert.equal(dragon.finished, true);
});

test('missing animation is reported instead of silently leaving a static model', () => {
  const { model, clips } = fixture();
  assert.throws(() => new CreatureMotion(model, clips.slice(1)), /animation missing/);
});

test('multipart actions continue in order, then return to idle without repeating', () => {
  const { model, clips } = fixture();
  const motion = new CreatureMotion(model, clips);
  const sequence = DRAGON_CLIPS.attacks.slice(0, 3);
  motion.play(sequence, { once: true });
  for (const name of sequence) {
    assert.equal(motion.state, name);
    assert.equal(motion.locked, true);
    motion.update(1.01);
  }
  assert.equal(motion.state, DRAGON_CLIPS.idle);
  assert.equal(motion.locked, false);
});

test('absolute source timelines are rebased and root origins agree between clips', () => {
  const { model, clips, root } = fixture();
  const run = clips.find(clip => clip.name === DRAGON_CLIPS.run);
  for (const track of run.tracks) {
    track.shift(50);
    track.values[0] = 100;
    track.values[2] = 200;
  }
  run.resetDuration();
  const motion = new CreatureMotion(model, clips);
  motion.play(DRAGON_CLIPS.run);
  motion.update(0.5);
  assert.equal(motion.action.getClip().duration, 1);
  assert.equal(root.position.x, 0);
  assert.equal(root.position.z, 0);
  assert.equal(root.position.y, 2);
  assert.equal(run.duration, 51);
});
