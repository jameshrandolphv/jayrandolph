export interface Point {
  x: number;
  y: number;
}

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay);

/** Distance from `p` to the segment `a`–`b`. */
export const distToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p.x, p.y, a.x + dx * t, a.y + dy * t);
};

const cross = (o: Point, a: Point, b: Point): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Shortest distance between two segments; 0 when they cross. */
export const segmentDistance = (a: Point, b: Point, c: Point, d: Point): number => {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return 0;
  return Math.min(
    distToSegment(a, c, d),
    distToSegment(b, c, d),
    distToSegment(c, a, b),
    distToSegment(d, a, b),
  );
};

/** Distance from `p` to an open polyline. */
export const distToPolyline = (p: Point, line: readonly Point[]): number => {
  let best = Infinity;
  for (let i = 1; i < line.length; i++)
    best = Math.min(best, distToSegment(p, line[i - 1]!, line[i]!));
  return best;
};

/** Signed difference `b - a` wrapped to (-π, π]. */
export const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
};

export const lerpAngle = (a: number, b: number, t: number): number => a + angleDiff(a, b) * t;

/** Points along a Catmull-Rom spline through `pts`, `perSpan` per span, ending on the last point. */
export const spline = (pts: readonly Point[], perSpan: number): Point[] => {
  const out: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let s = 0; s < perSpan; s++) {
      const t = s / perSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push({ ...pts[pts.length - 1]! });
  return out;
};

/** Small seeded generator (mulberry32), so an airfield can be rebuilt from its seed. */
export const seededRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
