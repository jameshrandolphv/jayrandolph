import { makePitch, PITCHES, type Pitch, type PitchType } from './pitch';
import { clamp, type Rng } from './rng';

/** A point of a swipe: screen logical px (about the middle of the screen, +y down) and time in ms. */
export interface TracePoint {
  x: number;
  y: number;
  t: number;
}

/** Maps a screen point onto the plate plane (ft), as `toPlatePlane` does for the camera in use. */
export type ToPlate = (x: number, y: number) => { x: number; z: number } | null;

const pathLength = (pts: readonly TracePoint[]): number => {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
};

/** The first point at least `frac` of the way along the swipe. */
const along = (pts: readonly TracePoint[], frac: number): number => {
  const total = pathLength(pts);
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (len >= total * frac) return i;
  }
  return pts.length - 1;
};

const angleOf = (a: TracePoint, b: TracePoint): number =>
  (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const angleDiff = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;

/** A pitching swipe must travel this far (px) and mostly upwards, towards the batter. */
export const PITCH_SWIPE_MIN = 36;
/** Holding still this long (ms) at the end of a pitching swipe throws a knuckleball. */
export const KNUCKLE_HOLD_MS = 140;

export interface PitchRead {
  type: PitchType;
  /** 0 (a slow swipe) to 1 (a fast flick). */
  speed: number;
  /** Where on screen it was aimed. */
  aim: TracePoint;
  /** Which way a slider or curve was hooked on screen: -1 left, 1 right, 0 none. */
  hook: -1 | 0 | 1;
  /** How hard it was hooked, in degrees. */
  turn: number;
}

/**
 * Reads a pitching swipe, made upwards from the pitcher towards the plate: a straight flick is a fastball (a
 * changeup if slow), a hook at the end is a slider or, hooked harder, a curveball, flicking back down at the end is
 * a sinker, and stopping dead before letting go is a knuckleball. Null if it isn't a pitch.
 */
export const readPitchSwipe = (trace: readonly TracePoint[]): PitchRead | null => {
  // Drop the still part at the end, timing how long the finger rested.
  let last = trace.length - 1;
  while (
    last > 0 &&
    Math.hypot(trace[last].x - trace[last - 1].x, trace[last].y - trace[last - 1].y) < 1.5
  )
    last--;
  const pts = trace.slice(0, last + 1);
  if (pts.length < 3 || pathLength(pts) < PITCH_SWIPE_MIN) return null;
  const first = pts[0];
  const top = pts.reduce((best, p) => (p.y < best.y ? p : best), first);
  if (first.y - top.y < PITCH_SWIPE_MIN * 0.7) return null;
  const hold = trace[trace.length - 1].t - pts[pts.length - 1].t;

  const mid = pts[along(pts, 0.6)];
  const late = pts[Math.min(along(pts, 0.78), pts.length - 2)];
  const end = pts[pts.length - 1];
  const turn = angleDiff(angleOf(first, mid), angleOf(late, end));

  const ms = Math.max(end.t - first.t, 16);
  const speed = clamp((pathLength(pts) / ms - 0.25) / 0.9, 0, 1);

  const abs = Math.abs(turn);
  let type: PitchType;
  let aim = end;
  let hook: -1 | 0 | 1 = 0;
  if (hold >= KNUCKLE_HOLD_MS) type = 'knuckleball';
  else if (abs >= 110) {
    type = 'sinker';
    aim = top;
  } else if (abs >= 18) {
    type = abs >= 45 ? 'curveball' : 'slider';
    aim = mid;
    // Turning clockwise on screen (from going up to going right) hooks it right.
    hook = turn > 0 ? 1 : -1;
  } else type = speed < 0.3 ? 'changeup' : 'fastball';
  return { type, speed, aim, hook, turn: abs };
};

/**
 * The pitch a read swipe throws. `screenRightIsFirst` says which way the camera looks: from centre field, screen
 * right is the third-base side, so a hook to the left breaks towards first.
 */
export const pitchFromRead = (
  read: PitchRead,
  toPlate: ToPlate,
  rng: Rng,
  screenRightIsFirst = false,
): Pitch => {
  const spec = PITCHES[read.type];
  const mph = spec.mph[0] + (spec.mph[1] - spec.mph[0]) * read.speed;
  const aim = toPlate(read.aim.x, read.aim.y) ?? { x: 0, z: 2.5 };
  // Aims are kept to somewhere a catcher could reach.
  aim.x = clamp(aim.x, -3, 3);
  aim.z = clamp(aim.z, 0.2, 5.5);
  const wild =
    0.1 + 0.22 * read.speed + (read.type === 'curveball' || read.type === 'knuckleball' ? 0.08 : 0);
  // The spec's sideways break is glove side (towards first); a hook the other way breaks to the arm side.
  const towardsFirst = read.hook > 0 === screenRightIsFirst;
  const side: 1 | -1 = read.hook === 0 || towardsFirst ? 1 : -1;
  const bend = read.hook === 0 ? 1 : clamp(read.turn / 60, 0.75, 1.35);
  return makePitch(read.type, mph, aim, rng, wild, bend, side);
};

/** A batting swipe has to travel this far (px) before it is a swing. */
export const SWING_MIN = 18;

export interface SwingRead {
  /** Seconds (game time) when the bat met the ball's path. */
  t: number;
  /** How far the bat was below the ball (ft): + means under it (lifting it), - over it. */
  dz: number;
  /** -1 (swiping down) to 1 (swiping up): an uppercut adds loft. */
  lift: number;
  /** 0 to 1, from how fast the swipe was. */
  power: number;
}

/** Where the ball looks to be at a game time, read back onto the plate (ft), as the swipe is. */
export type BallSight = (t: number) => { x: number; z: number } | null;

/**
 * Where a batting swipe met the ball as you see it: the first time the swipe crosses the ball's left-right position,
 * or passes within `reach` (ft) of it, with the height of the bat against the ball there. The ball is followed where
 * it appears on screen at each moment, so swiping through the ball you see meets it, early or late. Times in the
 * trace are game seconds. Null until then.
 */
export const readSwing = (
  trace: readonly TracePoint[],
  toPlate: ToPlate,
  ball: BallSight,
  reach = 0,
): SwingRead | null => {
  if (trace.length < 2 || pathLength(trace) < SWING_MIN) return null;
  const read = (i: number, f: number, z: number, bz: number): SwingRead => {
    const p0 = trace[i - 1];
    const p1 = trace[i];
    const t = p0.t + (p1.t - p0.t) * f;
    // Direction and speed over the few points either side of the meeting.
    const s0 = trace[Math.max(0, i - 4)];
    const s1 = trace[Math.min(trace.length - 1, i + 2)];
    const dx = s1.x - s0.x;
    const dy = s1.y - s0.y;
    const len = Math.hypot(dx, dy) || 1;
    const secs = Math.max(s1.t - s0.t, 1 / 120);
    return {
      t,
      dz: bz - z,
      lift: clamp(-dy / len, -1, 1),
      // A gentle swipe is ~150 px a second and a hard flick 600 or more.
      power: clamp((len / secs - 120) / 480, 0, 1),
    };
  };
  let prev = toPlate(trace[0].x, trace[0].y);
  let prevBall = ball(trace[0].t);
  for (let i = 1; i < trace.length; i++) {
    const cur = toPlate(trace[i].x, trace[i].y);
    const curBall = ball(trace[i].t);
    if (prev && cur && prevBall && curBall) {
      const a = prev.x - prevBall.x;
      const b = cur.x - curBall.x;
      if (a === 0 || a * b < 0 || b === 0) {
        const f = a === b ? 0 : a / (a - b);
        return read(i, f, prev.z + (cur.z - prev.z) * f, prevBall.z + (curBall.z - prevBall.z) * f);
      }
      // A swipe that stops short of the ball, or goes up or down past it, still meets it when the bat's width
      // reaches: the nearest point of this stretch of the swipe to the ball.
      if (reach > 0) {
        const ex = cur.x - prev.x;
        const ez = cur.z - prev.z;
        const l2 = ex * ex + ez * ez || 1;
        const f = clamp(((curBall.x - prev.x) * ex + (curBall.z - prev.z) * ez) / l2, 0, 1);
        const x = prev.x + ex * f;
        const z = prev.z + ez * f;
        if (
          Math.hypot(curBall.x - x, curBall.z - z) <= reach &&
          Math.abs(curBall.x - x) <= reach * 0.5
        )
          return read(i, f, z, curBall.z);
      }
    }
    prev = cur;
    prevBall = curBall;
  }
  return null;
};
