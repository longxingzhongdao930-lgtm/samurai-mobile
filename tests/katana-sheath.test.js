import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { loadRig } from './helpers/load-rig.js';
import { KatanaSheath } from '../src/game/hero/KatanaSheath.js';

test('real katana slides into the scabbard and restores the held blade on interruption', async () => {
  const { scene: source } = await loadRig(new URL('../public/models/weapons/sword.glb', import.meta.url));
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheath', t: 0 }, character: { position: new Vector3(), facing: 0, getBone: () => null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h);
  motion.update(); const start = motion.copy.position.clone();
  assert.equal(source.visible, false); assert.ok(motion.length > .5 && motion.length < 2);
  player.arts.t = .22; motion.update(); const aligned = motion.copy.position.clone();
  player.arts.t = .65; motion.update(); const inserted = motion.copy.position.clone();
  assert.ok(aligned.distanceTo(inserted) > .5, 'blade must visibly slide');
  assert.ok(start.distanceTo(aligned) > .1);
  player.arts.mode = 'sheathed'; motion.update();
  assert.ok(inserted.distanceTo(motion.copy.position) < 1e-6);
  const count = h.root.children.length;
  for (const mode of ['', 'charge', '', 'sheath', '']) { player.arts.mode = mode; motion.update(.2); }
  assert.equal(h.root.children.length, count, 'reuse the visual copy');
  assert.equal(source.visible, true); assert.equal(motion.copy.visible, false);
  assert.equal(source.parent, null, 'do not reparent the combat blade');
});

test('replacement blade is correctly sized, cover-free and fully enclosed after sheathing', async () => {
  const { scene: source } = await loadRig(new URL('../public/models/weapons/sword.glb', import.meta.url));
  let meshes = 0;
  source.traverse(node => { if (node.isMesh) { meshes++; assert.doesNotMatch(node.name, /cover/i); } });
  assert.equal(meshes, 4);
  const fireHull = new Mesh(new BoxGeometry(4, 4, 4), new MeshBasicMaterial());
  fireHull.userData.isFireVolume = true;
  source.add(fireHull);
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheathed', t: 1 }, character: { position: new Vector3(), facing: 0, getBone: () => null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const cover = (await loadRig(new URL('../public/models/weapons/mythical-scabbard.glb', import.meta.url))).scene;
  cover.traverse(node => { if (node.isMesh) node.material.side = DoubleSide; });
  h.sheath.add(cover);
  h.root.add(h.sheath);
  const motion = new KatanaSheath(h);
  motion.update(); h.root.updateMatrixWorld(true);
  assert.equal(fireHull.parent, source, 'the live fire effect stays intact');
  motion.copy.traverse(node => assert.equal(node.userData.isFireVolume, undefined));
  assert.ok(motion.length > .95 && motion.length < .99, 'guard-to-tip reach stays close to the old 0.966m blade');
  let bladeVertices = 0, handleVertices = 0;
  motion.copy.traverse(node => {
    const positions = node.geometry?.attributes.position;
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      const local = new Vector3().fromBufferAttribute(positions, i);
      assert.ok([local.x, local.y, local.z].every(Number.isFinite));
      if (local.z < -.05) { handleVertices++; continue; }
      if (local.z <= .02) continue;
      const inside = h.sheath.worldToLocal(local.clone().applyMatrix4(node.matrixWorld));
      if (i % 8 === 0) {
        // Real mesh enclosure, not merely its rectangular bounding box.
        for (const axis of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]) {
          const direction = new Vector3(...axis).transformDirection(h.sheath.matrixWorld);
          const ray = new Raycaster(h.sheath.localToWorld(inside.clone()), direction);
          assert.ok(ray.intersectObject(h.sheath, true).length > 0, 'native scabbard encloses the blade on all four sides');
        }
      }
      bladeVertices++;
    }
  });
  assert.ok(bladeVertices > 100 && handleVertices > 100, 'both blade and visible hilt retained');
});

test('scabbard mouth stays on the hip across rest and draw; left-hand hold releases with the draw', () => {
  const heavy = { phase: .05 };
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheathed', t: 1 },
    state: 'free', heavy, move: null, character: { position: new Vector3(3,0,7), facing: .7, getBone: () => null } };
  const source = new Group();
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h), hands = [];
  motion._hand = (side, target, weight) => hands.push({side, target: target.clone(), weight});
  motion.update();
  const mouth = h.sheath.position.clone(), orientation = h.sheath.quaternion.clone();
  assert.ok(mouth.distanceTo(player.character.position.clone().setY(.95)) < .3);
  player.arts.mode = ''; player.move = heavy; player.state = 'attack'; hands.length = 0;
  motion.update();
  assert.deepEqual(hands.map(x => x.side), ['Left']);
  assert.ok(hands[0].weight > .5 && hands[0].target.equals(mouth));
  assert.ok(h.sheath.position.equals(mouth));assert.ok(h.sheath.quaternion.angleTo(orientation) < 1e-7);
  heavy.phase = .3; hands.length = 0; motion.update(.2);
  assert.equal(hands.length, 0);assert.equal(motion.drawFromSheath, false);
  player.state = 'free'; motion.update();
  assert.ok(h.sheath.position.equals(mouth));assert.equal(source.visible, true);
});

test('right hand follows the rotating hilt throughout sheath alignment', () => {
  const source = new Group();
  source.position.set(-.3, 1.2, .5);
  source.rotation.set(.4, .8, -.5);
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheath', t: 0 },
    character: { position: new Vector3(), facing: 0, getBone: () => null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false },
    weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h);
  let grip;
  motion._hand = (side, target) => { if (side === 'Right') grip = target.clone(); };
  for (const t of [0, .05, .11, .17, .22, .4, .65]) {
    player.arts.t = t;
    motion.update();
    const expected = new Vector3(0, 0, -.1).applyQuaternion(motion.copy.quaternion).add(motion.copy.position);
    assert.ok(grip.distanceTo(expected) < 1e-9, `hilt contact at ${t}`);
  }
});

test('scabbard follows a crouching hip without editing the lower body', () => {
  const root = new Group(), hips = new Group();
  root.add(hips); hips.position.set(.03, .62, -.04);
  const source = new Group();
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheathed', t: 1 },
    character: { root, position: new Vector3(), facing: 0, getBone: name => name === 'Hips' ? hips : null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h);
  motion._hand = () => {};
  const original = hips.position.clone();
  motion.update();
  assert.ok(Math.abs(h.sheath.position.y - .74) < 1e-9);
  assert.ok(hips.position.equals(original), 'do not change the hip animation');
  hips.position.y = .82; motion.update();
  assert.ok(Math.abs(h.sheath.position.y - .94) < 1e-9);
});

test('blade remains in the real right hand when insertion IK cannot reach its target', () => {
  const root = new Group(), hand = new Group();
  root.add(hand); hand.position.set(-.2, 1, .3);
  const source = new Group(); source.position.set(.4, 1.2, .7);
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheath', t: 0 },
    character: { root, position: new Vector3(), facing: 0, getBone: name => name === 'RightHand' ? hand : null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h); motion._hand = () => {};
  for (const t of [0, .1, .2, .4, .65]) {
    player.arts.t = t; motion.update();
    const grip = new Vector3(0,0,-.1).applyQuaternion(motion.copy.quaternion).add(motion.copy.position);
    assert.ok(grip.distanceTo(hand.getWorldPosition(new Vector3())) < 1e-9);
  }
});

test('aligned blade passes through the mouth on the same axis as its scabbard', () => {
  const root = new Group(), hand = new Group(); root.add(hand); hand.position.set(-.2,1,.3);
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheath', t: 0 },
    character: { root, position: new Vector3(), facing: .5, getBone: name => name === 'RightHand' ? hand : null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: new Group() }) } } };
  const motion = new KatanaSheath(h); motion._hand = () => {};
  for (const t of [.22,.3,.4,.5,.65]) {
    player.arts.t = t; motion.update();
    const axis = new Vector3(0,0,1).applyQuaternion(motion.copy.quaternion);
    const toMouth = h.sheath.position.clone().sub(motion.copy.position);
    assert.ok(toMouth.cross(axis).length() < 1e-9, 'mouth lies on blade line');
    assert.ok(motion.copy.quaternion.angleTo(h.sheath.quaternion) < 1e-7);
  }
});

test('leaving the sheath blends to the held weapon without a one-frame teleport', () => {
  const source = new Group(); source.position.set(-.4, 1.3, .7);
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheathed', t: 1 },
    character: { position: new Vector3(), facing: 0, getBone: () => null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h); motion.update();
  const start = motion.copy.position.clone();
  player.arts.mode = ''; motion.update(1/60);
  assert.equal(source.visible, false); assert.equal(motion.copy.visible, true);
  assert.ok(motion.copy.position.distanceTo(start) < source.position.distanceTo(start) * .1);
  motion.update(.12);
  assert.equal(source.visible, true); assert.equal(motion.copy.visible, false);
  assert.ok(motion.copy.position.distanceTo(source.position) < 1e-9);
  assert.equal(motion.release, null);
});

test('flourish follows the live held blade before beginning insertion', () => {
  const source = new Group(); source.position.set(-.4,1.2,.7);
  const player = { weapon: { id: 'katana' }, arts: { mode: 'flourish', t: .1 },
    character: { position: new Vector3(), facing: 0, getBone: () => null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h); motion.update();
  assert.ok(motion.copy.position.equals(source.position));
  source.position.x += .1; source.rotation.y = .3; player.arts.t = .15; motion.update();
  assert.ok(motion.copy.position.equals(source.position));
  assert.ok(motion.copy.quaternion.angleTo(source.quaternion)<1e-7);
  player.arts.t = .3; motion.update();
  assert.equal(motion.flourishing,false);
  assert.ok(!motion.copy.position.equals(source.position));
});

test('restarting sheath during its exit uses the visible blade instead of the hidden combat blade', () => {
  const source = new Group(); source.position.set(-.4,1.3,.7);
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheathed', t: 1 },
    character: { position: new Vector3(), facing: 0, getBone: () => null } };
  const h = { root: new Group(), sheath: new Group(), g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h); motion.update();
  player.arts.mode = ''; motion.update(1/60);
  const visible = motion.copy.position.clone();
  player.arts.mode = 'sheath'; player.arts.t = 0; motion.update();
  assert.ok(motion.copy.position.distanceTo(visible)<1e-9);
  assert.equal(source.visible,false); assert.equal(motion.release,null);
});

test('wrist rotation keeps the mounted blade aligned with the sheath presentation', () => {
  const root = new Group(), hand = new Group(), source = new Group();
  root.add(hand); hand.position.set(-.2,1,.3); hand.add(source); source.rotation.set(.4,.8,-.2);
  const player = { weapon: { id: 'katana' }, arts: { mode: 'sheath', t: 0 },
    character: { root, position: new Vector3(), facing: .5, getBone: name => name === 'RightHand' ? hand : null } };
  const h = { root: new Group(), sheath: new Group(), turn() {}, g: { player, form: { active: false }, weapons: { _slot: () => ({ model: source }) } } };
  const motion = new KatanaSheath(h); motion._hand = () => {};
  for (const t of [.22,.4,.65]) {
    player.arts.t = t; motion.update(); root.updateMatrixWorld(true);
    assert.ok(source.getWorldQuaternion(motion.copy.quaternion.clone()).angleTo(motion.copy.quaternion)<1e-7);
  }
});

test('normalized live blade is mounted at the same grip used for sheath and draw', () => {
  const root=new Group(),hand=new Group(),source=new Group();
  root.add(hand);hand.position.set(-.2,1,.3);hand.add(source);
  source.position.set(-.051,.102,.052);source.rotation.set(-2.9,1.46,-.01);
  const player={weapon:{id:'katana'},arts:{mode:'',t:0},character:{root,position:new Vector3(),facing:0,getBone:name=>name==='RightHand'?hand:null}};
  const h={root:new Group(),sheath:new Group(),g:{player,form:{active:false},weapons:{_slot:()=>({model:source})}}};
  const motion=new KatanaSheath(h);motion._hand=()=>{};
  motion.update();root.updateMatrixWorld(true);
  assert.ok(source.localToWorld(new Vector3(0,0,-.1)).distanceTo(hand.getWorldPosition(new Vector3()))<1e-9);
  player.arts.mode='sheathed';motion.update();
  player.arts.mode='';
  for(const dt of [1/60,1/60,.12]){
    motion.update(dt);root.updateMatrixWorld(true);h.root.updateMatrixWorld(true);
    const visible=motion.copy.visible?motion.copy:source;
    assert.ok(visible.localToWorld(new Vector3(0,0,-.1)).distanceTo(hand.getWorldPosition(new Vector3()))<1e-9);
  }
});
