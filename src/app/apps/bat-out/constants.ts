import { vec, type Vec3 } from './camera';

/** The logical screen: a portrait phone. Wider or longer screens see more of the field round it. */
export const WIDTH = 180;
export const HEIGHT = 320;

/** The simulation ticks at 60 Hz; times in the rules are in seconds. */
export const TICK_HZ = 60;

/** Pitches play out this many times slower than a real one, so a swipe can meet them. */
export const PITCH_SLOW = 2.4;
/** Plays after contact (the ball, fielders and runners) run this much faster than real time. */
export const PLAY_SPEED = 1.5;

export const MOUND = 60.5;
export const BASE_PATH = 90;
/** Home, first, second and third, in feet. */
export const BASES: readonly Vec3[] = [
  vec(0, 0),
  vec(63.64, 63.64),
  vec(0, 127.28),
  vec(-63.64, 63.64),
];

/** Where a right-handed pitcher lets go of the ball. */
export const RELEASE = vec(-1.7, 54.5, 5.9);
/** The ball counts as a strike if any of it passes over the plate between these heights (ft). */
export const ZONE = { left: -0.83, right: 0.83, bottom: 1.6, top: 3.5 } as const;
/** Inside this far towards the batter (a right-hander, on the third-base side), a pitch hits him. */
export const HIT_BY_PITCH_X = -1.55;

/** A right-handed batter stands here, on the third-base side of the plate. */
export const BATTER = vec(-2.6, -0.4);

/** Distance to the outfield wall (ft) by angle from straight out to centre field (degrees, + towards right). */
export const FENCE: readonly [angle: number, feet: number][] = [
  [-45, 330],
  [-25, 370],
  [0, 400],
  [25, 370],
  [45, 330],
];
export const FENCE_HEIGHT = 8;
/** Fair territory is within this angle of straight out to centre. */
export const FOUL_ANGLE = 45;

export const fenceAt = (angle: number): number => {
  const a = Math.max(-45, Math.min(45, angle));
  for (let i = 1; i < FENCE.length; i++) {
    const [a0, d0] = FENCE[i - 1];
    const [a1, d1] = FENCE[i];
    if (a <= a1) return d0 + ((d1 - d0) * (a - a0)) / (a1 - a0);
  }
  return FENCE[FENCE.length - 1][1];
};

/** Fielding positions by scorer's number - 1: P, C, 1B, 2B, 3B, SS, LF, CF, RF. */
export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
export type Position = (typeof POSITIONS)[number];

const polar = (angle: number, feet: number): Vec3 =>
  vec(feet * Math.sin((angle * Math.PI) / 180), feet * Math.cos((angle * Math.PI) / 180));

export const FIELDER_SPOTS: readonly Vec3[] = [
  vec(0, 58),
  vec(0, -4),
  polar(36, 112),
  polar(14, 148),
  polar(-36, 108),
  polar(-13, 148),
  polar(-27, 285),
  polar(0, 315),
  polar(27, 285),
];

/** Running speed (ft/s, real time) of each fielder; outfielders cover the most ground. */
export const FIELDER_SPEED = [24, 22, 25, 26, 25, 27, 28, 29, 28] as const;
/** Seconds before a fielder reacts to a batted ball. */
export const REACT = 0.3;
/** How far a fielder can reach or leap for a ball (ft), and the highest he can catch one. */
export const REACH = 4.5;
export const CATCH_HEIGHT = 8;
/** Below this the ball can be fielded once it has bounced. */
export const FIELD_HEIGHT = 5;
/** Throw speeds (ft/s) and the time to get the ball out of the glove (s). */
export const THROW_INFIELD = 125;
export const THROW_OUTFIELD = 100;
export const TRANSFER_INFIELD = 0.6;
export const TRANSFER_OUTFIELD = 0.7;
/** Throws longer than this go through a cut-off man, which costs time. */
export const RELAY_FEET = 230;
export const RELAY_COST = 0.8;
/** Time for a middle infielder to take a throw at second and turn it to first. */
export const PIVOT = 0.75;

/** Baserunners (ft/s); the batter takes a moment to drop the bat first. */
export const RUN_SPEED = 27;
export const BATTER_START = 0.85;
export const RUNNER_START = 0.15;
/** Extra time to round a base on the way to the next. */
export const TURN_COST = 0.25;
