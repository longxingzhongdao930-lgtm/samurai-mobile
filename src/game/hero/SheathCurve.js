import { Matrix3, Quaternion, Vector3 } from 'three';

/** Approximate the blade's centreline; never change the supplied geometry. */
export function bladeCurve(points, length) {
  const bins = Array.from({ length: 20 }, () => ({ min: Infinity, max: -Infinity, n: 0, z: 0 }));
  for (const p of points) {
    if (p.z < length * .12 || p.z > length * .85) continue;
    const b = bins[Math.min(19, Math.floor(p.z / length * 20))];
    b.min = Math.min(b.min, p.x); b.max = Math.max(b.max, p.x); b.n++; b.z += p.z;
  }
  const samples = bins.filter(b => b.n > 1).map(b => [b.z / b.n, (b.min + b.max) / 2]);
  if (samples.length < 4) return { a: 0, b: 0 };
  const sums = [0, 0, 0, 0, 0], rhs = new Vector3();
  for (const [z, x] of samples) {
    for (let i = 0; i < 5; i++) sums[i] += z ** i;
    rhs.add(new Vector3(x * z * z, x * z, x));
  }
  const matrix = new Matrix3().set(sums[4], sums[3], sums[2], sums[3], sums[2], sums[1], sums[2], sums[1], sums[0]);
  if (Math.abs(matrix.determinant()) < 1e-10) return { a: 0, b: 0 };
  const fit = rhs.applyMatrix3(matrix.invert());
  return { a: fit.x, b: fit.y };
}

/** Rigid curved insertion at a depth compatible with the actual hand span. */
export function curvedInsertion(curve, distance, length) {
  const frame = out => {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -2 * curve.a * out);
    const guard = new Vector3(curve.a * out * out - curve.b * out, 0, -out);
    const grip = new Vector3(0, 0, -.1).applyQuaternion(rotation).add(guard);
    return { rotation, guard, grip, out };
  };
  let lo = 0, hi = length;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (frame(mid).grip.length() < distance) lo = mid; else hi = mid;
  }
  return frame((lo + hi) / 2);
}
