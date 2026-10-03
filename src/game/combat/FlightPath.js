import { Vector3 } from 'three';
/** Squared distance to a swept projectile segment; avoids frame-rate tunnelling. */
export function segmentDistanceSq(point, from, to) {
  const delta = new Vector3().subVectors(to, from), length = delta.lengthSq();
  const t = length ? Math.max(0, Math.min(1, new Vector3().subVectors(point, from).dot(delta) / length)) : 0;
  return from.clone().addScaledVector(delta, t).distanceToSquared(point);
}
