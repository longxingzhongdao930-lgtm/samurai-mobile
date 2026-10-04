import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { bladeCurve, curvedInsertion } from '../src/game/hero/SheathCurve.js';

test('centreline fitting ignores blade width and recovers its bend', () => {
  const points=[];
  for(let i=1;i<19;i++){
    const z=(i+.5)/20,x=.1*z*z-.11*z;
    for(const edge of [-.015,.015])points.push(new Vector3(x+edge,0,z));
  }
  const fit=bladeCurve(points,1);
  assert.ok(Math.abs(fit.a-.1)<1e-9);
  assert.ok(Math.abs(fit.b+.11)<1e-9);
});

test('curved insertion respects hand span and finishes with no bend or offset', () => {
  const curve={a:.1,b:-.11};
  for(const span of [.1,.2,.4,.7,1]){
    const frame=curvedInsertion(curve,span,1);
    assert.ok(Math.abs(frame.grip.length()-span)<1e-8);
    assert.ok(frame.rotation.toArray().every(Number.isFinite));
  }
  const complete=curvedInsertion(curve,.1,1);
  assert.ok(complete.guard.length()<1e-8);
  assert.ok(complete.rotation.angleTo(complete.rotation.clone().identity())<1e-7);
});
