import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group, Vector3, Box3 } from 'three';
import { loadRig } from './helpers/load-rig.js';
import { FlyingGauntlet } from '../src/game/combat/FlyingGauntlet.js';

test('actual gauntlet preserves authored interleaved geometry through flight and re-equipping', async () => {
  const { scene: template } = await loadRig(new URL('../public/models/weapons/gauntlet_pair.glb', import.meta.url));
  const source = template.getObjectByName('gauntlet').geometry;
  assert.equal(source.attributes.position.isInterleavedBufferAttribute, true);
  const original = Object.fromEntries(Object.entries(source.attributes).map(([key, a]) => [key, a.array.slice()]));
  const hand = new Bone(), forearm = new Bone();
  const game = {
    app: { scene: new Group(), character: { position: new Vector3(), facing: 0, getBone: name => name === 'RightHand' ? hand : forearm } },
    player: { weapon: { id: 'gauntlet' }, state: 'free' },
    weapons: { current: 'gauntlet' }, form: { active: false }, enemies: { enemies: [] }
  };
  let disposed = false;
  source.addEventListener('dispose', () => { disposed = true; });
  for (let equip = 0; equip < 2; equip++) {
    const model = template.clone(true), fist = new FlyingGauntlet(game, model);
    const check = () => {
      fist.lateUpdate();
      const geometry = model.getObjectByName('gauntlet').geometry;
      for (const [key, a] of Object.entries(geometry.attributes)) assert.deepEqual(a.array, original[key], key);
      const size = new Box3().setFromObject(model).getSize(new Vector3());
      assert.ok(size.length() < .7, `unexpected gauntlet size ${size.length()}`);
    };
    check();
    fist.launch({ damage: 10, posture: 10 });
    for (let frame = 0; frame < 120; frame++) { fist.update(1 / 60); check(); }
    assert.equal(fist.flight, null);
    fist.launch({ damage: 10, posture: 10 }); fist.update(.1);
    fist.flight.grabbed = { alive: false, agent: {} }; check();
    fist.recall(true); check();
    fist.dispose();
    assert.equal(disposed, false, 'shared template geometry must remain reusable');
    assert.equal(hand.scale.x, 1); assert.equal(forearm.scale.x, 1);
  }
});
