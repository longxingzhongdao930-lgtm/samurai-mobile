import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Box3, Vector3 } from 'three';
import { EdoScenery, EDO_MODELS } from '../src/game/world/EdoScenery.js';
import { loadRig } from './helpers/load-rig.js';

test('real Edo assets fit replacement frontages, leave the combat lane clear and share geometry', async () => {
  const stage = { group: new Group(), boxes: [], projectileBoxes: [], lanterns: [] };
  const edo = new EdoScenery(stage);
  for (const id of EDO_MODELS) edo.models.set(id, (await loadRig(new URL(`../public/models/edo/${id}.glb`, import.meta.url))).scene);
  assert.equal(edo.house(-8.3, 14, 6, 7, Math.PI / 2), true);
  assert.equal(edo.house(8.3, 22, 6, 7, -Math.PI / 2), false);
  assert.equal(edo.house(8.3, 40, 6, 7, -Math.PI / 2), true);
  for (const group of edo.instances) {
    const box = new Box3().setFromObject(group);
    assert.ok(box.max.x <= -4.79 || box.min.x >= 4.79, 'frontage must stay outside 9.2m road');
    assert.ok(Math.abs(box.min.y) < .001);
  }
  edo.decorate();
  assert.ok(stage.boxes.length >= 5);
  assert.equal(stage.projectileBoxes.length, stage.boxes.length);
  assert.ok(stage.projectileBoxes.every(box => box.length === 6 && box[5] > box[4]));
  for (const [x0,x1,z0,z1] of stage.boxes) {
    assert.ok(x1 < -3.2 || x0 > 3.2, 'decorations must not obstruct central travel');
    assert.ok([x0,x1,z0,z1].every(Number.isFinite));
  }
  assert.ok(stage.boxes.some(box => box[2] > 93 && box[3] < 97), 'food stall must clear existing entrance lantern');
  const castle = edo.instances.find(n => n.name === 'Edo:tsuyama-castle');
  const castleBounds = new Box3().setFromObject(castle);
  assert.ok(castleBounds.min.z >= 299.99);
  assert.ok(castleBounds.min.y < 0, 'foundation must stay underground');
  assert.ok(castleBounds.max.y > 25 && castleBounds.max.y < 35);
  assert.ok(Math.abs(castleBounds.max.x - castleBounds.min.x - 160) < .001);
  const source = edo.models.get('es_shop01'); let original;
  source.traverse(n => { if(n.isMesh && !original) original = n.geometry; });
  let shared=false;edo.instances[0].traverse(n=>{if(n.geometry===original)shared=true;});assert.ok(shared);
  edo.update(new Vector3(0,0,270));assert.equal(edo.instances[0].visible,false);
  edo.update(new Vector3(0,0,0));assert.equal(edo.instances[0].visible,true);assert.equal(castle.visible,true);
});
test('missing imported assets retain the procedural fallback', () => {
  const edo = new EdoScenery({ group:new Group(), boxes:[], projectileBoxes:[], lanterns:[] });
  assert.equal(edo.house(-8.3,14,6,7,Math.PI/2),false);
  assert.equal(edo.place('es_hinomi',0,0,2,8,2),null);
  edo.decorate();assert.equal(edo.instances.length,0);
});
