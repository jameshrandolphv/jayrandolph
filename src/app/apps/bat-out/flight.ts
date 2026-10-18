import { vec, type Vec3 } from './camera';
import { FENCE_HEIGHT, FOUL_ANGLE, fenceAt } from './constants';
import type { Contact } from './swing';

/** Batted balls are stepped and sampled this often (real seconds). */
export const FLIGHT_DT = 1 / 60;

const G = 32.17;
/** Air drag (1/ft), with the lift from backspin folded in; tuned so 100 mph at 28 degrees carries about 385 ft and 105 mph clears 400. */
const DRAG = 0.0017;
const LIFT = 0.25;
/** On a bounce the ball keeps this much of its speed up and along the ground; rolling it slows by `ROLL`. */
const BOUNCE_UP = 0.3;
const BOUNCE_ALONG = 0.72;
const ROLL = 14;
const WALL_BOUNCE = 0.3;
/** The screen behind home plate (ft). */
export const BACKSTOP = -58;
/** Longest a ball's flight is followed. */
const MAX_SECONDS = 9;

export interface BallFlight {
  /** Position every `FLIGHT_DT` from contact until it stops (or the play no longer needs it). */
  pts: Vec3[];
  /** Index of the first time it touched the ground (or the stands), or -1 if it never did. */
  land: number;
  /** Over the fence in fair territory. */
  homeRun: boolean;
  /** It left fair territory: its spray is past the foul lines. */
  foul: boolean;
  /** Index where it came off the outfield wall, or -1. */
  wall: number;
  /** It bounced over the wall: a ground-rule double. */
  groundRule: boolean;
}

/** Degrees from straight out to centre field, + towards right field. */
export const sprayOf = (p: Vec3): number => (Math.atan2(p.x, p.y) * 180) / Math.PI;

export const flyBall = (c: Contact, from: Vec3 = vec(0, 1.5, 2.6)): BallFlight => {
  const foul = Math.abs(c.spray) > FOUL_ANGLE;
  const v = c.ev * 1.4667;
  const la = (c.la * Math.PI) / 180;
  const sp = (c.spray * Math.PI) / 180;
  let vx = v * Math.cos(la) * Math.sin(sp);
  let vy = v * Math.cos(la) * Math.cos(sp);
  let vz = v * Math.sin(la);
  let { x, y, z } = from;
  let rolling = false;
  let land = -1;
  let wall = -1;
  let homeRun = false;
  let groundRule = false;
  const fence = fenceAt(c.spray);
  const pts: Vec3[] = [vec(x, y, z)];
  for (let i = 1; i <= MAX_SECONDS / FLIGHT_DT; i++) {
    const dt = FLIGHT_DT;
    if (rolling) {
      const h = Math.hypot(vx, vy);
      const slow = Math.max(0, h - ROLL * dt);
      if (h > 0) {
        vx *= slow / h;
        vy *= slow / h;
      }
      if (slow === 0) {
        pts.push(vec(x, y, 0));
        break;
      }
    } else {
      const speed = Math.hypot(vx, vy, vz);
      const h = Math.hypot(vx, vy) || 1;
      // Lift acts across the flight, up and back against the drop; it fades once the ball has bounced.
      const lift = land < 0 ? LIFT * DRAG * speed * speed : 0;
      vx -= DRAG * speed * vx * dt;
      vy -= DRAG * speed * vy * dt;
      vz += (-G - DRAG * speed * vz + (lift * h) / speed) * dt;
    }
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    // Balls fouled straight back stop at the backstop.
    if (y < BACKSTOP) {
      pts.push(vec(x, BACKSTOP, Math.max(z, 0)));
      break;
    }
    const r = Math.hypot(x, y);
    if (!foul && !homeRun && wall < 0 && r >= fence) {
      if (z > FENCE_HEIGHT && land >= 0) {
        groundRule = true;
        pts.push(vec(x, y, z));
        break;
      }
      if (z > FENCE_HEIGHT) homeRun = true;
      else {
        // Off the wall: it comes back towards the infield.
        const nx = x / r;
        const ny = y / r;
        const out = vx * nx + vy * ny;
        vx -= (1 + WALL_BOUNCE) * out * nx;
        vy -= (1 + WALL_BOUNCE) * out * ny;
        x = nx * (fence - 0.5);
        y = ny * (fence - 0.5);
        wall = i;
      }
    }
    if (z <= 0 && !rolling) {
      z = 0;
      if (land < 0) land = i;
      // Home runs and foul balls are done once they come down.
      if (homeRun || foul) {
        pts.push(vec(x, y, 0));
        break;
      }
      vz = -vz * BOUNCE_UP;
      vx *= BOUNCE_ALONG;
      vy *= BOUNCE_ALONG;
      if (vz < 5) {
        vz = 0;
        rolling = true;
      }
    }
    pts.push(vec(x, y, z));
  }
  return { pts, land, homeRun, foul, wall, groundRule };
};
