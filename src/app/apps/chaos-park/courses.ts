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
 * - tumbleweed: rolls across every lane at one spot, and whoever it touches has collided;
 * - sting / haunt: like the rat, a bee or a ghost goes for someone, who then swerves from lane to lane for
 *   `SWERVE_TICKS` (and a ghost speeds them up and slows them down too).
 */
export type CourseEvent = 'none' | 'hook' | 'tumbleweed' | 'sting' | 'haunt';

/** A stretch of the loop drawn under cover: an arch, a big vine, or the mansion, which the inner two lanes go through. */
export type Cover = 'none' | 'arch' | 'vine' | 'mansion';

export interface CourseSpec {
  id: CourseId;
  name: string;
  lanes: number;
  /**
   * How wide each lane is. The mansion's five are narrower, so its road is no wider than the others' four and still
   * fits a phone; people and vehicles are drawn the same size.
   */
  laneW: number;
  /** How strong the loop's bends are, times Chaos Park's. */
  bend: number;
  /** Whether the loop winds like a river, its bends easing off only as far as they must to fit. */
  river: boolean;
  /** Added to the difficulty level, so later courses start further up the ramp. */
  levelOffset: number;
  /** Arrival weights of the slow walker (one lane) and slow pair (two lanes); none on Chaos Park. */
  slow: number;
  slowPair: number;
  /** Whether a predator (shark, coyote, leopard, skeleton dog) comes round now and then. */
  predator: boolean;
  obstacle: Obstacle;
  event: CourseEvent;
  cover: Cover;
  /** Whether the park has footpaths across its middle, and short cuts along them. */
  paths: boolean;
  /** Whether a short stretch of the loop is rapids, where everyone goes `RAPIDS_SPEED` times faster. */
  rapids: boolean;
  /**
   * Whether the carriage is a train instead: one lane wide (`TRAIN_LEN` long), always in lane `TRAIN_LANE`, never
   * moved by a swipe, an obstacle or a pick-up, and only ever one of it.
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
   * The score on this course that unlocks the next, and earns its bronze medal; silver is `SILVER_MORE` more, and
   * gold `GOLD_MORE` more.
   */
  unlock: number;
}

export const COURSES: Readonly<Record<CourseId, CourseSpec>> = {
  park: {
    id: 'park',
    name: 'Chaos Park',
    lanes: 4,
    laneW: 30,
    bend: 1,
    river: false,
    levelOffset: 0,
    slow: 0,
    slowPair: 0,
    predator: false,
    obstacle: 'slip',
    event: 'none',
    cover: 'none',
    paths: true,
    rapids: false,
    train: false,
    slowCars: false,
    wild: false,
    unlock: 25,
  },
  waters: {
    id: 'waters',
    name: 'Wild Waters',
    lanes: 4,
    laneW: 30,
    bend: 3,
    river: true,
    levelOffset: 3,
    slow: 0.12,
    slowPair: 0.06,
    predator: true,
    obstacle: 'steer',
    event: 'hook',
    cover: 'none',
    paths: false,
    rapids: true,
    train: false,
    slowCars: false,
    wild: false,
    unlock: 30,
  },
  canyon: {
    id: 'canyon',
    name: 'Dusty Canyon',
    lanes: 4,
    laneW: 30,
    bend: 1.5,
    river: false,
    levelOffset: 6,
    slow: 0.12,
    slowPair: 0,
    predator: true,
    obstacle: 'steer',
    event: 'tumbleweed',
    cover: 'arch',
    paths: false,
    rapids: false,
    train: true,
    slowCars: true,
    wild: false,
    unlock: 35,
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle Jam',
    lanes: 4,
    laneW: 30,
    bend: 2,
    river: false,
    levelOffset: 9,
    slow: 0.12,
    slowPair: 0.06,
    predator: true,
    obstacle: 'steer',
    event: 'sting',
    cover: 'vine',
    paths: true,
    rapids: false,
    train: false,
    slowCars: false,
    wild: true,
    unlock: 40,
  },
  mansion: {
    id: 'mansion',
    name: 'Haunted Mansion',
    lanes: 5,
    laneW: 24,
    bend: 2.5,
    river: false,
    levelOffset: 12,
    slow: 0.1,
    slowPair: 0.06,
    predator: true,
    obstacle: 'slime',
    event: 'haunt',
    cover: 'mansion',
    paths: false,
    rapids: false,
    train: false,
    slowCars: false,
    wild: false,
    unlock: 45,
  },
};

/** How much faster everyone goes on a course's rapids, and how long the rapids are. */
export const RAPIDS_SPEED = 1.25;
export const RAPIDS_LEN: readonly [number, number] = [80, 110];

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

/** Medals on a course: bronze at its unlock score, silver this much more, gold this much more. */
export const SILVER_MORE = 15;
export const GOLD_MORE = 75;

export type Medal = 'none' | 'bronze' | 'silver' | 'gold';

export const medalFor = (course: CourseSpec, best: number): Medal =>
  best >= course.unlock + GOLD_MORE
    ? 'gold'
    : best >= course.unlock + SILVER_MORE
      ? 'silver'
      : best >= course.unlock
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
