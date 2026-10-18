/**
 * A pinhole camera over the field, in feet: home plate is the origin, +y runs out to centre field, +x towards first
 * base and +z up. Screen positions are in logical px about the middle of the screen, +y down.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Camera {
  pos: Vec3;
  /** The point it looks at. */
  at: Vec3;
  /** Focal length in logical px: how many px one foot covers one foot away. */
  focal: number;
  /** Where `at` lands on screen, relative to the middle of the screen. */
  cx: number;
  cy: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Distance in front of the camera (ft); nothing at or behind zero is drawn. */
  depth: number;
  /** Logical px per foot at this depth. */
  scale: number;
}

export const vec = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

interface Basis {
  f: Vec3;
  r: Vec3;
  u: Vec3;
}

const basis = (cam: Camera): Basis => {
  const dx = cam.at.x - cam.pos.x;
  const dy = cam.at.y - cam.pos.y;
  const dz = cam.at.z - cam.pos.z;
  const len = Math.hypot(dx, dy, dz);
  const f = { x: dx / len, y: dy / len, z: dz / len };
  // Right is forward crossed with up (+z); the cameras never look straight down.
  const rl = Math.hypot(f.y, f.x);
  const r = { x: f.y / rl, y: -f.x / rl, z: 0 };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { f, r, u };
};

export const project = (cam: Camera, p: Vec3): Projected => {
  const { f, r, u } = basis(cam);
  const dx = p.x - cam.pos.x;
  const dy = p.y - cam.pos.y;
  const dz = p.z - cam.pos.z;
  const depth = dx * f.x + dy * f.y + dz * f.z;
  const scale = cam.focal / Math.max(depth, 0.01);
  return {
    x: cam.cx + (dx * r.x + dy * r.y + dz * r.z) * scale,
    y: cam.cy - (dx * u.x + dy * u.y + dz * u.z) * scale,
    depth,
    scale,
  };
};

/**
 * Where a point on screen lies on the upright plane through home plate that faces the mound (y = 0): its x across
 * the plate and z height, in feet. Used to read where a swipe crosses the strike zone. Null if the ray misses it.
 */
export const toPlatePlane = (
  cam: Camera,
  sx: number,
  sy: number,
): { x: number; z: number } | null => {
  const { f, r, u } = basis(cam);
  const a = (sx - cam.cx) / cam.focal;
  const b = -(sy - cam.cy) / cam.focal;
  const d = { x: f.x + r.x * a + u.x * b, y: f.y + r.y * a + u.y * b, z: f.z + r.z * a + u.z * b };
  if (Math.abs(d.y) < 1e-9) return null;
  const t = -cam.pos.y / d.y;
  if (t <= 0) return null;
  return { x: cam.pos.x + d.x * t, z: cam.pos.z + d.z * t };
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 =>
  vec(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

export const lerpCamera = (a: Camera, b: Camera, t: number): Camera => ({
  pos: lerpVec(a.pos, b.pos, t),
  at: lerpVec(a.at, b.at, t),
  focal: lerp(a.focal, b.focal, t),
  cx: lerp(a.cx, b.cx, t),
  cy: lerp(a.cy, b.cy, t),
});

/** Behind the catcher at the batter's eye: the plate near the bottom, the mound in the top half. */
export const BATTING_CAMERA: Camera = {
  pos: vec(0, -7, 6.5),
  at: vec(0, 20, -1.5),
  focal: 240,
  cx: 0,
  cy: 0,
};

/**
 * The broadcast view from centre field for pitching: a long lens high over the outfield and a little to one side, so
 * the pitcher is at the bottom left with his back to us and the batter and strike zone are in the upper half.
 */
export const PITCHING_CAMERA: Camera = {
  pos: vec(-14, 400, 52),
  at: vec(0, 0, 2.5),
  focal: 7600,
  cx: 0,
  cy: -70,
};

/** High behind home plate, looking out over the field; it follows the ball while a play runs. */
export const fieldCamera = (target: Vec3): Camera => ({
  pos: vec(target.x * 0.5, target.y - 150, 95),
  at: vec(target.x, target.y, 0),
  focal: 210,
  cx: 0,
  cy: 0,
});
