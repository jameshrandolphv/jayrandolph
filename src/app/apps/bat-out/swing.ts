import { PITCH_SLOW, ZONE } from './constants';
import { inZone, pitchAt, type Count, type Pitch } from './pitch';
import { clamp, gauss, type Rng } from './rng';

/**
 * A swing as the rules see it: `dt` real seconds early (-) or late (+) against the ball reaching the plate, `dz` how
 * far (ft) the bat passed under (+) or over (-) the middle of the ball, `lift` the bat path from chopping down (-1)
 * to an uppercut (1), and `power` 0 to 1.
 */
export interface Swing {
  dt: number;
  dz: number;
  lift: number;
  power: number;
}

/** A ball off the bat: exit speed (mph), launch angle (degrees up) and spray angle (degrees, + to right field). */
export interface Contact {
  ev: number;
  la: number;
  spray: number;
}

/** The bat meets the ball within this many real seconds of perfect timing... */
export const TIMING_WINDOW = 0.075;
/** ...and with the bat within this far (ft) of the middle of the ball. */
export const HEIGHT_WINDOW = 0.5;
/** Contact this thin only nicks it: a foul tip straight back. */
const TIP = 0.88;

/** Converts game seconds from the ball reaching the plate into real seconds of swing timing. */
export const realTiming = (gameSeconds: number): number => gameSeconds / PITCH_SLOW;

/**
 * What a swing does to a pitch: nothing (a miss), or a ball off the bat. Square contact with good timing and a
 * hard swipe hits it hardest; under the ball lifts it, over it beats it into the ground; early pulls it (to left,
 * for a right-handed batter) and late pushes it the other way, foul when too far either way.
 */
export const contact = (swing: Swing, pitch: Pitch, rng: Rng): Contact | null => {
  const t = swing.dt / TIMING_WINDOW;
  const h = swing.dz / HEIGHT_WINDOW;
  if (Math.abs(t) > 1 || Math.abs(h) > 1) return null;
  if (Math.abs(h) > TIP)
    return { ev: 50 + rng() * 30, la: 15 + rng() * 35, spray: 180 - 30 + rng() * 60 };
  const square = 1 - h * h;
  const timed = 1 - t * t;
  const ev =
    38 +
    70 * (0.78 + 0.22 * swing.power) * (0.4 + 0.6 * timed) * (0.3 + 0.7 * square) +
    (pitch.mph - 88) * 0.25 +
    gauss(rng) * 2.5;
  const la = 11 + 52 * h + 10 * swing.lift + gauss(rng) * 5;
  const spray = 50 * t + gauss(rng) * 8;
  return { ev: clamp(ev, 30, 118), la: clamp(la, -60, 85), spray };
};

/**
 * The computer at the plate. It judges a pitch from how it looks most of the way in, so late movement fools it:
 * it may swing at a pitch heading for the zone that breaks out of it, and its bat misses by more the more the pitch
 * moved after it decided. Returns null when it takes the pitch.
 */
export const computerSwing = (pitch: Pitch, count: Count, rng: Rng): Swing | null => {
  // Where the pitch seems to be going from its line at 55% of the way.
  const a = pitchAt(pitch, 0.5);
  const b = pitchAt(pitch, 0.6);
  const k = b.y / (a.y - b.y);
  const seen = { x: b.x + (b.x - a.x) * k, z: b.z + (b.z - a.z) * k };
  const fooled = Math.hypot(seen.x - pitch.end.x, seen.z - pitch.end.z);
  const cz = (ZONE.top + ZONE.bottom) / 2;
  const away = Math.max(
    Math.abs(seen.x) / ZONE.right,
    Math.abs(seen.z - cz) / ((ZONE.top - ZONE.bottom) / 2),
  );

  let chance = inZone(seen) ? 0.7 : clamp(0.45 - (away - 1) * 1.1, 0.02, 0.38);
  if (count.strikes === 2) chance += 0.18;
  if (count.balls === 3 && count.strikes < 2) chance -= 0.3;
  if (count.balls === 0 && count.strikes === 0) chance -= 0.12;
  if (rng() >= chance) return null;

  // Misses scale with how fooled it was, how fast the pitch was and how far off the middle it is.
  const real = Math.max(
    Math.abs(pitch.end.x) / ZONE.right,
    Math.abs(pitch.end.z - cz) / ((ZONE.top - ZONE.bottom) / 2),
  );
  const spread =
    0.13 + 0.4 * fooled + 0.012 * Math.max(0, pitch.mph - 85) + 0.1 * Math.max(0, real - 0.6);
  // Off-speed pitches get it out in front.
  const early = pitch.mph < 86 ? -0.012 * (86 - pitch.mph) * 0.4 : 0;
  return {
    dt: early + gauss(rng) * (0.032 + 0.012 * fooled),
    dz: (pitch.end.z - seen.z) * 0.45 + gauss(rng) * spread,
    lift: 0.15 + gauss(rng) * 0.25,
    power: 0.55 + rng() * 0.45,
  };
};
