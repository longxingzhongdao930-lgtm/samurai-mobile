import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Vector3 } from 'three';
import { SlashTrail } from '../src/game/fx/SlashTrail.js';
test('blade trail excludes effect hulls instead of spanning their oversized bounds',()=>{const root=new Group(),blade=new Mesh(new BoxGeometry(.03,.03,.8),new MeshBasicMaterial()),hull=new Mesh(new BoxGeometry(6,6,6),new MeshBasicMaterial());blade.position.z=.4;hull.userData.isFireVolume=true;root.add(blade,hull);const trail=new SlashTrail();trail.bind(root,new Vector3());assert.ok(Math.abs(trail._blade.b.z-.8)<.000001);assert.ok(trail._blade.a.distanceTo(trail._blade.b)<.5);trail.dispose();});
