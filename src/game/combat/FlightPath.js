/** Fraction of a segment inside an axis-aligned box; null when it misses. */
export function segmentBoxInterval(from, to, box) {
  let enter = 0, exit = 1;
  for (const [axis, lo, hi] of [['x', box[0], box[1]], ['z', box[2], box[3]], ['y', box[4] ?? -Infinity, box[5] ?? Infinity]]) {
    const d = to[axis] - from[axis];
    if (Math.abs(d) < 1e-12) {
      if (from[axis] < lo || from[axis] > hi) return null;
    } else {
      const a = (lo - from[axis]) / d, b = (hi - from[axis]) / d;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (enter > exit) return null;
    }
  }
  return [enter, exit];
}

/** First wall along a segment, including gaps between two walkable areas. */
export function obstructionFraction(from, to, walkable, blockers = []) {
  const intervals = walkable.map(box => segmentBoxInterval(from, to, box)).filter(Boolean).sort((a, b) => a[0] - b[0]);
  let free = 0;
  for (const [enter, exit] of intervals) {
    if (enter > free + 1e-9) break;
    free = Math.max(free, exit);
  }
  for (const box of blockers) {
    const hit = segmentBoxInterval(from, to, box);
    if (hit) free = Math.min(free, hit[0]);
  }
  return free;
}

/** Clips the rendered movement to the same obstruction used by hit tests. */
export function clipFlight(stage, from, to) {
  const t = stage?.projectileFraction?.(from, to) ?? (stage?.blocks?.(to.x, to.z) ? 0 : 1);
  if (t < 1) to.lerpVectors(from, to, t);
  return t < 1;
}

/** First contact with a sphere. Infinity means no contact this frame. */
export function segmentSphereHit(center, radius, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const x = from.x - center.x, y = from.y - center.y, z = from.z - center.z;
  const c = x*x + y*y + z*z - radius*radius;
  if (c <= 0) return 0;
  const a = dx*dx + dy*dy + dz*dz, b = x*dx + y*dy + z*dz;
  const disc = b*b - a*c;
  if (a < 1e-12 || disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
}

/** Swept upright hit volume used by arrows and magic bolts. */
export function segmentCylinderHit(center, radius, bottom, top, from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const x = from.x - center.x, z = from.z - center.z;
  const a = dx*dx + dz*dz, b = x*dx + z*dz, c = x*x + z*z - radius*radius;
  let enter = 0, exit = 1;
  if (a < 1e-12) { if (c > 0) return Infinity; }
  else {
    const disc = b*b - a*c; if (disc < 0) return Infinity;
    enter = Math.max(0, (-b - Math.sqrt(disc)) / a);
    exit = Math.min(1, (-b + Math.sqrt(disc)) / a);
  }
  const dy = to.y - from.y;
  if (Math.abs(dy) < 1e-12) { if (from.y < bottom || from.y > top) return Infinity; }
  else {
    const lo = (bottom - from.y) / dy, hi = (top - from.y) / dy;
    enter = Math.max(enter, Math.min(lo, hi)); exit = Math.min(exit, Math.max(lo, hi));
  }
  return enter <= exit ? enter : Infinity;
}

/** Squared distance to a swept projectile segment; avoids frame-rate tunnelling. */
export function segmentDistanceSq(point, from, to) {
  const dx = to.x-from.x, dy = to.y-from.y, dz = to.z-from.z;
  const length = dx*dx + dy*dy + dz*dz;
  const t = length ? Math.max(0, Math.min(1, ((point.x-from.x)*dx+(point.y-from.y)*dy+(point.z-from.z)*dz)/length)) : 0;
  return (from.x+dx*t-point.x)**2 + (from.y+dy*t-point.y)**2 + (from.z+dz*t-point.z)**2;
}
