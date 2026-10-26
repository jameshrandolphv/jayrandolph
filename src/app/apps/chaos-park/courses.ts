/**
 * The courses. Chaos Park is the first, and the only one on the website; the apps add four more, each unlocked by a
 * score on the one before. A course changes the park's shape and adds its own visitors and hazards on top of the
 * same rules; everything it changes is here, so the sim and the drawing read it rather than checking which course
 * this is.
 */
export type CourseId = 'park' | 'waters' | 'canyon' | 'jungle' | 'mansion';
export const COURSE_IDS: readonly CourseId[] = ['park', 'waters', 'canyon', 'jungle', 'mansion'];

/**
 * What the two patches (at `PATCH_SCORES` laps) are: slippery ground that slides whoever crosses it a lane, an
 * obstacle (rocks, a cactus, a fallen tree) that people steer round on their own, or slime that sticks whoever steps
 * in it to the spot for `SLIME_TICKS`.
 */
export type Obstacle = 'slip' | 'steer' | 'slime';

/**
 * A course's own event, on its own timer from `EVENT_FROM_SCORE` laps:
 * - hook: a fisherman on the bank casts into one lane, and whoever swims into the hook is reeled out, their laps lost
 *   but no life;
 * - tumbleweed: rolls across every lane at one spot, and whoever it touches is stunned (no life lost);
 * - sting / haunt: like the rat, a bee or a ghost goes for someone, who then swerves from lane to lane for
 *   `SWERVE_TICKS` (and a ghost speeds them up and slows them down too).
 */
export type CourseEvent = 'none' | 'hook' | 'tumbleweed' | 'sting' | 'haunt';

/**
 * A stretch of the loop drawn under cover: an old train bridge across the canyon (where a coyote now and then drops
 * TNT, see `TNT_FROM_SCORE`), or a big vine across the road.
 */
export type Cover = 'none' | 'trestle' | 'vine';

/**
 * The shape of a course's road:
 * - loop: a rounded rectangle with a few gentle bends (bent further by `bend`, and winding like a river if `river`);
 * - switchback: an uneven polygon of straights and tight corners, like a road through a canyon;
 * - eight: a figure of eight, one way over the other on a bridge where they cross;
 * - manor: a formal drive, a rectangle with its corners cut off, round a house in the middle, with a two-lane hall
 *   through the house that people on the inner lanes now and then take, and a winding graveyard road that everyone
 *   on the inside lane takes, coming back on behind where they left (see `SideRoad`).
 */
export type Layout = 'loop' | 'switchback' | 'eight' | 'manor';

export interface CourseSpec {
  id: CourseId;
  name: string;
  lanes: number;
  /**
   * How wide each lane is. Five lanes are narrower, so the road is no wider than four and still fits a phone; people
   * and vehicles are drawn the same size.
   */
  laneW: number;
  layout: Layout;
  /** How strong the loop's bends are, times Chaos Park's. */
  bend: number;
  /** Whether the loop winds like a river, its bends easing off only as far as they must to fit. */
  river: boolean;
  /** Added to the difficulty level, so later courses start further up the ramp. */
  levelOffset: number;
  /**
   * How much of a level each lap after the knee adds (`LEVEL_RATE` on Chaos Park): later courses start higher but
   * climb more slowly, so the Haunted Mansion at 80 laps is about where it used to be at 50.
   */
  levelRate: number;
  /**
   * Arrival weights of the slow walker (one lane) and slow pair (two lanes). On Chaos Park the slow walkers come with a
   * walking frame or in a wheelchair, and there are no pairs.
   */
  slow: number;
  slowPair: number;
  /** Whether a predator (shark, coyote, leopard, skeleton dog) comes round now and then. */
  predator: boolean;
  obstacle: Obstacle;
  event: CourseEvent;
  cover: Cover;
  /** Whether the park has footpaths across its middle, and short cuts along them. */
  paths: boolean;
  /**
   * Whether one or two lanes have a short stretch of rapids, each its own length, where whoever is in that lane goes
   * `RAPIDS_SPEED` times faster.
   */
  rapids: boolean;
  /** Whether a wave now and then rolls across the lanes, pushing whoever it passes one lane on (see `WAVE_RATE`). */
  waves: boolean;
  /**
   * Whether the carriage is a train instead: one lane wide (`TRAIN_LEN` long), always in lane `TRAIN_LANE`, never
   * moved out of it by a swipe, an obstacle or a pick-up (though a swipe along it speeds it up and slows it back
   * down), and only ever one of it.
   */
  train: boolean;
  /**
   * Whether some of the cars (those with `look[0] < SLOW_CAR_SHARE`) are slow ones: `SLOW_CAR_SPEED` times as fast,
   * and a carriage long.
   */
  slowCars: boolean;
  /**
   * Whether visitors step out of the trees anywhere along the road, inside or out, instead of coming in by the gates,
   * and step back into them as soon as their laps are done (see `WILD_DEPTH`).
   */
  wild: boolean;
  /**
   * Whether a river crosses one half of the course, under a bridge on each side, with its own traffic (see `River`
   * and `RIVER_KINDS`).
   */
  riverCrossing: boolean;
  /** How fast its bikers go, next to Chaos Park's: the jungle's gorillas are a little slower. */
  bikerPace: number;
  /**
   * The score on this course that unlocks the next: a bronze medal, the same on every course. Medals go by
   * `BRONZE_SCORE`, `SILVER_SCORE` and `GOLD_SCORE`.
   */
  unlock: number;
}

export const COURSES: Readonly<Record<CourseId, CourseSpec>> = {
  park: {
    id: 'park',
    name: 'Chaos Park',
    lanes: 4,
    laneW: 30,
    layout: 'loop',
    bend: 1,
    river: false,
    levelOffset: 0,
    levelRate: 0.4,
    slow: 0.03,
    slowPair: 0,
    predator: false,
    obstacle: 'slip',
    event: 'none',
    cover: 'none',
    paths: true,
    rapids: false,
    waves: false,
    train: false,
    slowCars: false,
    wild: false,
    riverCrossing: false,
    bikerPace: 1,
    unlock: 25,
  },
  waters: {
    id: 'waters',
    name: 'Wild Waters',
    lanes: 4,
    laneW: 30,
    layout: 'loop',
    bend: 3,
    river: true,
    levelOffset: 2,
    levelRate: 0.34,
    slow: 0.06,
    slowPair: 0.03,
    predator: true,
    obstacle: 'steer',
    event: 'hook',
    cover: 'none',
    paths: false,
    rapids: true,
    waves: true,
    train: false,
    slowCars: false,
    wild: false,
    riverCrossing: false,
    bikerPace: 1,
    unlock: 25,
  },
  canyon: {
    id: 'canyon',
    name: 'Dusty Canyon',
    lanes: 4,
    laneW: 30,
    layout: 'switchback',
    bend: 1.5,
    river: false,
    levelOffset: 3,
    levelRate: 0.3,
    slow: 0.06,
    slowPair: 0,
    predator: true,
    obstacle: 'steer',
    event: 'tumbleweed',
    cover: 'trestle',
    paths: false,
    rapids: false,
    waves: false,
    train: true,
    slowCars: true,
    wild: false,
    riverCrossing: false,
    bikerPace: 1,
    unlock: 25,
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle Jam',
    lanes: 5,
    laneW: 24,
    layout: 'eight',
    bend: 2,
    river: false,
    levelOffset: 5,
    levelRate: 0.26,
    slow: 0.06,
    slowPair: 0.03,
    predator: true,
    obstacle: 'steer',
    event: 'sting',
    cover: 'vine',
    paths: false,
    rapids: false,
    waves: false,
    train: false,
    slowCars: false,
    wild: true,
    riverCrossing: true,
    bikerPace: 0.8,
    unlock: 25,
  },
  mansion: {
    id: 'mansion',
    name: 'Haunted Mansion',
    lanes: 5,
    laneW: 24,
    layout: 'manor',
    bend: 2.5,
    river: false,
    levelOffset: 6,
    levelRate: 0.23,
    slow: 0.05,
    slowPair: 0.03,
    predator: true,
    obstacle: 'slime',
    event: 'haunt',
    cover: 'none',
    paths: false,
    rapids: false,
    waves: false,
    train: false,
    slowCars: false,
    wild: false,
    riverCrossing: false,
    bikerPace: 1,
    unlock: 25,
  },
};

/** How much faster anyone in the rapids goes, and how long the rapids are. They span `RAPIDS_LANES` lanes side by side. */
export const RAPIDS_SPEED = 1.5;
export const RAPIDS_LEN: readonly [number, number] = [60, 150];
export const RAPIDS_LANES = 2;

/**
 * Waves, on a course with them: from `WAVE_FROM_SCORE` laps, one every `WAVE_INTERVAL` ticks swells up at the bank,
 * inside or out, for `WAVE_SWELL` ticks, then rolls across every lane at `WAVE_RATE` lanes a tick over a stretch
 * `WAVE_LEN` long. Whoever it passes is pushed a lane the way it is rolling, if there is a lane to go to.
 */
export const WAVE_FROM_SCORE = 8;
export const WAVE_INTERVAL: readonly [number, number] = [20 * 60, 40 * 60];
export const WAVE_SWELL = 60;
export const WAVE_RATE = 0.06;
/** At the design lane width. */
export const WAVE_LEN = 90;

/** A course's train: its lane (counted from the inside) and length at the design lane width. */
export const TRAIN_LANE = 1;
export const TRAIN_LEN = 44;

/** On a course with slow cars, the share of cars that are slow, and how fast they go next to a car. */
export const SLOW_CAR_SHARE = 0.5;
export const SLOW_CAR_SPEED = 0.5;

/**
 * On a wild course, how far into the trees, from the road's edge, visitors step out from and back into; and how far
 * along the loop two arriving at once must be apart.
 */
export const WILD_DEPTH = 30;
export const WILD_GAP = 120;
/** A wild course's visitor doesn't leave for the trees from a bridge, or within this of either end of it. */
export const BRIDGE_EXIT_CLEAR = 40;
/** Nor does one come out of the trees, or go into them, within this of a river's banks. */
export const RIVER_SPAWN_CLEAR = 14;

/**
 * A river crossing a course (see `CourseSpec.riverCrossing`): `RIVER_LANES` lanes, its traffic all going downstream.
 * Each one through scores like a lap. What comes down it, by kind: a swimmer (a walker), a long canoe (a biker), a
 * fishing boat two lanes wide (a car) and an alligator (the predator), each with its own speed and length here, at
 * the design lane width (scaled like `KIND_SPECS`).
 */
export const RIVER_LANES = 3;
export const RIVER_KINDS: readonly {
  kind: 'walker' | 'biker' | 'car';
  speed: number;
  len: number;
  weight: number;
}[] = [
  { kind: 'walker', speed: 0.6, len: 14, weight: 0.4 },
  { kind: 'biker', speed: 1.25, len: 52, weight: 0.35 },
  { kind: 'car', speed: 0.55, len: 40, weight: 0.25 },
];
export const RIVER_GATOR = { speed: 1.1, len: 30 };
/**
 * The river's plank bridge (see `River.gaps`): someone one lane wide who walks onto a missing plank, within
 * `PLANK_ZONE` of the middle of the river, falls in and is carried down it at `PLANK_FALL_SPEED` (at the design lane
 * width), scoring at the end like any river traffic. Anyone wider (and a carriage, a predator or anyone on
 * autopilot) steps across into lanes with planks once within `PLANK_LOOK` of it. Someone heading for a gap shows a
 * warning from `PLANK_WARN` ticks away.
 */
export const PLANK_ZONE = 12;
export const PLANK_FALL_SPEED = 0.7;
export const PLANK_LOOK = 80;
export const PLANK_WARN = 90;
/**
 * Dusty Canyon's old train bridge: from `TNT_FROM_SCORE` laps, every `TNT_INTERVAL` ticks, a coyote runs across it
 * (`TNT_RUN` ticks from one rim to the other) and drops a stick of TNT onto the road beside it, `TNT_BESIDE` from its
 * middle (at the design lane width), in the lane it was over. The TNT flashes for `TNT_FUSE` ticks (4 seconds), then
 * goes off: whoever is in that lane within `TNT_BLAST` of it (and their own half length) is blown away, costing one
 * life however many go. The train, anyone invisible and anyone with a star are safe. Anyone heading into it shows a
 * warning from `TNT_WARN` ticks away.
 */
export const TNT_FROM_SCORE = 15;
export const TNT_INTERVAL: readonly [number, number] = [40 * 60, 75 * 60];
export const TNT_RUN = 80;
export const TNT_BESIDE = 40;
export const TNT_FUSE = 4 * 60;
export const TNT_BLAST = 22;
export const TNT_WARN = 90;
/**
 * River traffic comes from `RIVER_FROM_SCORE` laps, one every `RIVER_INTERVAL` ticks, up to `riverMax` of it at once;
 * an alligator every `GATOR_INTERVAL` from `GATOR_FROM_SCORE`, one at a time.
 */
export const RIVER_FROM_SCORE = 2;
export const RIVER_INTERVAL: readonly [number, number] = [150, 360];
export const riverMax = (level: number): number => Math.min(4, 1 + Math.floor(level / 10));
export const GATOR_FROM_SCORE = 8;
export const GATOR_INTERVAL: readonly [number, number] = [30 * 60, 55 * 60];
/**
 * An alligator reaching a bridge has this chance of climbing out onto the trail, where it hunts like the course's
 * predator for `GATOR_WALK` of a lap before going off into the trees.
 */
export const GATOR_CLIMB = 0.35;
export const GATOR_WALK = 0.35;

/** Medal scores, the same on every course. */
export const BRONZE_SCORE = 25;
export const SILVER_SCORE = 50;
export const GOLD_SCORE = 100;

export type Medal = 'none' | 'bronze' | 'silver' | 'gold';

export const medalFor = (course: CourseSpec, best: number): Medal =>
  best >= GOLD_SCORE
    ? 'gold'
    : best >= SILVER_SCORE
      ? 'silver'
      : best >= BRONZE_SCORE
        ? 'bronze'
        : 'none';

/** The course before this one, whose score unlocks it; none for the first. */
export const previousCourse = (id: CourseId): CourseSpec | null => {
  const i = COURSE_IDS.indexOf(id);
  return i > 0 ? COURSES[COURSE_IDS[i - 1]!] : null;
};

/** Whether a course is open, given the best score on each. */
export const unlocked = (id: CourseId, best: (id: CourseId) => number): boolean => {
  const before = previousCourse(id);
  return !before || best(before.id) >= before.unlock;
};
