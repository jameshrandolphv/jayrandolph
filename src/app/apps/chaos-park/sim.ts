import {
  ART,
  BOOST,
  CARRIAGE_EFFECT_LAPS,
  CARS_FROM_SCORE,
  COLLIDE_FACTOR,
  DUSK_FROM,
  DUSK_LAPS,
  EARLY_LAPS_PER_EXTRA,
  EARLY_MAX_MOVERS,
  GROUP_EARLY_UNTIL,
  GROUP_INTERVAL_EARLY,
  LATE_FROM,
  LATE_LAPS_PER_EXTRA,
  MAX_MOVERS_LATE,
  STREAK_LAPS,
  level,
  CRASH_TICKS,
  DAZE_TICKS,
  DOUBLE_GAP,
  FIRST_SPAWN,
  IMPACT_TICKS,
  EXTRA_LAPS,
  FIRE_SPEED,
  PICKUP_KINDS,
  TURTLE_SPEED,
  WARP_EASE_TICKS,
  WARP_SLOW_TICKS,
  WARP_SPEED,
  LIVES,
  MAX_LIVES,
  PATCH_SCORES,
  PICKUP_CLEAR,
  PICKUP_FIRST,
  PICKUP_FROM_SCORE,
  PICKUP_INTERVAL,
  PICKUP_LEN,
  PICKUP_TICKS,
  PICKUP_WEIGHTS,
  STUN_TICKS,
  GAME_OVER_LOCKOUT,
  GRAB_RADIUS,
  GROUP_FROM_SCORE,
  GROUP_INTERVAL,
  GROUP_SIZE,
  JOIN_CLEAR,
  JOIN_TICKS,
  KIND_SPECS,
  EVENT_FROM_SCORE,
  EVENT_INTERVAL,
  HAUNT_SPEEDS,
  HOOK_CAST,
  HOOK_LEN,
  HOOK_TICKS,
  LANE_RATE,
  LANE_W,
  LAPS_PER_EXTRA,
  LEVEL_RATE,
  LATERAL_OVERLAP,
  MAX_MOVERS,
  MAX_MOVERS_START,
  POP_TICKS,
  RAT_FROM_SCORE,
  RAT_GIVE_UP,
  RAT_INTERVAL,
  RAT_LURK,
  RAT_SPEED,
  PREDATOR_FROM_SCORE,
  PREDATOR_INTERVAL,
  PREDATOR_SIGHT,
  PREDATOR_WANDER,
  PREDATOR_WANDER_CHANCE,
  PREDATOR_TURN,
  PREDATOR_COMMIT,
  PREDATOR_LUNGE,
  SHOUT_COOLDOWN,
  SHOUT_TICKS,
  SECOND_CARRIAGE_SCORE,
  CARRIAGE_RETURN,
  SHORTCUT_CHANCE,
  SLIME_TICKS,
  SLIP_TICKS,
  SPAWN_INTERVAL,
  SPAWN_INTERVAL_MIN,
  SPAWN_INTERVAL_STEP,
  SPEED_SPREAD,
  STEER_AHEAD,
  SWERVE_EVERY,
  SWERVE_TICKS,
  TUMBLE_LEN,
  TUMBLE_RATE,
  WARN_MAX_GAP,
  WARN_TICKS,
  WRONG_WAY_CHANCE,
  WRONG_WAY_FROM_SCORE,
  WRONG_WAY_MAX_CHANCE,
  groupLength,
  type Kind,
  type PickupKind,
} from './constants';
import {
  COURSES,
  RAPIDS_SPEED,
  SLOW_CAR_SHARE,
  SLOW_CAR_SPEED,
  WILD_DEPTH,
  WILD_GAP,
  BRIDGE_EXIT_CLEAR,
  TRAIN_LANE,
  TRAIN_LEN,
  WAVE_FROM_SCORE,
  WAVE_INTERVAL,
  WAVE_LEN,
  WAVE_RATE,
  WAVE_SWELL,
  type CourseId,
  type CourseSpec,
} from './courses';
import {
  DEFAULT_FRAME,
  generatePark,
  laneOffset,
  inRapids,
  loopDelta,
  nearPolyline,
  onBridge,
  pose,
  underCover,
  wrap,
  type Entrance,
  type Park,
  type ParkFrame,
  type Point,
  type Shortcut,
} from './park';

export type Phase = 'title' | 'help' | 'playing' | 'crashed' | 'gameOver';
export type SimEvent =
  | 'lap'
  | 'alert'
  | 'crash'
  | 'slip'
  | 'shift'
  | 'bump'
  | 'boost'
  | 'brake'
  | 'squeak'
  | 'bite'
  | 'hit'
  | 'life'
  | 'double'
  | 'ghost'
  | 'star'
  | 'fire'
  | 'turtle'
  | 'strength'
  | 'coin'
  | 'skull'
  | 'spiral'
  | 'autopilot'
  | 'streak'
  | 'knock'
  | 'eat'
  | 'cast'
  | 'reel'
  | 'snap'
  | 'roll'
  | 'sting'
  | 'haunt'
  | 'slime'
  | 'wave';

/**
 * Where a mover is: walking in from the street, on the loop, cutting across the park, or heading out. Only movers on
 * the loop collide or can be swiped.
 */
export type MoverState = 'arriving' | 'track' | 'shortcut' | 'leaving';

export interface Mover {
  id: number;
  kind: Kind;
  width: 1 | 2;
  len: number;
  /** Its speed now: `baseSpeed`, or faster while boosted. */
  speed: number;
  baseSpeed: number;
  /** Swiped forward to go faster; swiping back returns it to `baseSpeed`. */
  boosted: boolean;
  /** 1 counterclockwise (the right way round), -1 the wrong way. */
  dir: 1 | -1;
  state: MoverState;
  /** Distance along the loop, and the lane its innermost side is in (fractional while changing lane). */
  s: number;
  p: number;
  /** The lane it is moving to. */
  target: number;
  /** Distance covered round the loop since it joined, counting short cuts as the stretch they skip. */
  progress: number;
  /** Laps to do before leaving (`Infinity` for carriages) and laps done. */
  laps: number;
  lapsDone: number;
  /** Every lap is done; it leaves at the next entrance. */
  done: boolean;
  /** Off the loop it follows a route: points, the length so far at each, and how far along it is. */
  route: Point[];
  routeLens: number[];
  routeAt: number;
  /** Where it joins the loop at the end of its route, if it does. */
  join: { s: number; p: number } | null;
  /** Still to stop short of the end of the route and wait for a gap. */
  hold: boolean;
  /** Waiting for a gap to join the loop. */
  waiting: boolean;
  /** Distance the current short cut skips, added to `progress` when it rejoins. */
  skip: number;
  /** The entrance it arrived by. */
  entrance: number;
  x: number;
  y: number;
  heading: number;
  prevX: number;
  prevY: number;
  prevHeading: number;
  /** Fades in from the street and out on the way back to it. */
  alpha: number;
  /** About to hit something in its lane. */
  warning: boolean;
  /** Ticks left of a wobble after sliding on a patch. */
  slip: number;
  /** Ticks since it appeared; drives walking and pedalling. */
  age: number;
  /** Fixed random numbers for its colours. */
  look: [number, number, number];
  /** Patches it is on, so each crossing only slides it once. */
  onPatch: Set<number>;
  /** How many people it is: the runners in a run group, otherwise 1. Each scores for a lap. */
  crowd: number;
  /** Ticks left standing still after a rat bite. */
  daze: number;
  /** Ticks left of a biker's "Out of my way!", and when it last shouted. */
  shout: number;
  shoutAt: number;
  /** 1 once it has taken an invisibility token: it passes through everyone for the rest of its laps. */
  ghost: number;
  /** 1 once it has taken a rainbow star: it knocks everyone it touches off the loop for the rest of its laps. */
  star: number;
  /** 1 once it has taken an autopilot token: it steers itself out of the way of collisions. */
  autopilot: number;
  /** Slowed by its autopilot to keep behind someone; back to its usual speed once clear. */
  autoSlow: boolean;
  /**
   * A carriage's pick-up wears off once it has done this many laps (`Infinity` while it has none), going back to
   * `plainSpeed`.
   */
  wearOff: number;
  plainSpeed: number;
  /** Ticks left swerving from lane to lane after a bee sting or a haunting, and whether it was a haunting. */
  swerve: number;
  haunted: boolean;
  /** Ticks left stuck in slime (it stands still for as long, as if dazed). */
  slime: number;
  /** A predator's tick of its last move toward someone. */
  turnedAt: number;
}

/**
 * A rat: it waits at the kerb ahead of the person it is after, darts out to bite them, then runs back off the road.
 */
export interface Rat {
  id: number;
  /** A biter (the rat, or whatever bites on this course), a bee or a ghost. */
  kind: 'bite' | 'sting' | 'haunt';
  state: 'lurk' | 'dash' | 'flee';
  /** The mover it is after. */
  target: number;
  /** Where it waited, off the road, which it runs back to. */
  home: Point;
  x: number;
  y: number;
  heading: number;
  prevX: number;
  prevY: number;
  prevHeading: number;
  /** Ticks in its current state. */
  ticks: number;
}

/** The fisherman's hook: cast from the bank into one lane at `s`, where it then sits. */
export interface Hook {
  id: number;
  s: number;
  lane: number;
  /** Where the fisherman stands, and where the hook lands. */
  from: Point;
  x: number;
  y: number;
  state: 'cast' | 'set';
  ticks: number;
}

/**
 * A tumbleweed at `s`: waiting at the roadside, then rolling across the lanes from the side it started on (`q` is
 * the lane its inner side is at, fractional as it rolls, moving by `dir`).
 */
export interface Tumbleweed {
  id: number;
  s: number;
  q: number;
  dir: 1 | -1;
  state: 'wait' | 'roll';
  ticks: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

/**
 * A wave at `s`: swelling at the bank, then rolling across the lanes (`q` is how far across its front is, in lanes from
 * the inside, moving by `dir`). `hit` holds whoever it has already pushed.
 */
export interface Wave {
  id: number;
  s: number;
  q: number;
  dir: 1 | -1;
  state: 'swell' | 'roll';
  ticks: number;
  hit: number[];
}

/** A burst where two movers collided without ending the run. */
export interface Impact {
  id: number;
  x: number;
  y: number;
  ticks: number;
}

/** How many of the park's patches are on the road after a given number of laps. */
export const patchesShown = (laps: number): number =>
  PATCH_SCORES.filter((at) => laps >= at).length;

/** A heart or token lying on the loop, in one lane, until someone takes it or it runs out. */
export interface Pickup {
  id: number;
  kind: PickupKind;
  s: number;
  lane: number;
  x: number;
  y: number;
  /** Ticks since it appeared. */
  ticks: number;
}

/** The "+1" that floats up where a lap is completed, or what a pick-up did where it was taken. */
export interface Pop {
  id: number;
  /** Points scored: 1, or the size of a run group, times the streak. */
  value: number;
  /** Set for a pick-up instead of a lap. */
  pickup?: PickupKind;
  x: number;
  y: number;
  ticks: number;
}

/**
 * Movers allowed in the park at once (not counting carriages) after a given number of laps, on a course whose level
 * starts `offset` higher.
 */
export const maxMovers = (laps: number, offset = 0, rate = LEVEL_RATE): number => {
  const early = Math.min(
    EARLY_MAX_MOVERS,
    MAX_MOVERS_START + Math.floor(laps / EARLY_LAPS_PER_EXTRA),
  );
  const ramp = Math.min(
    MAX_MOVERS,
    MAX_MOVERS_START + Math.floor((level(laps, rate) + offset) / LAPS_PER_EXTRA),
  );
  const late =
    laps > LATE_FROM
      ? Math.min(MAX_MOVERS_LATE - MAX_MOVERS, Math.floor((laps - LATE_FROM) / LATE_LAPS_PER_EXTRA))
      : 0;
  return Math.max(early, ramp) + late;
};

/** How far dusk has fallen after a given number of laps, 0 (day) to 1 (as dark as it gets). */
export const duskAt = (laps: number): number =>
  Math.max(0, Math.min(1, (laps - DUSK_FROM) / DUSK_LAPS));

/** What each lap is worth after this many laps in a row without losing a life. */
export const streakValue = (clean: number): number => 1 + Math.floor(clean / STREAK_LAPS);

/** Ticks a new screen shape has to hold before the park on the title card is remade for it. */
const FRAME_SETTLE = 20;

const sameFrame = (a: ParkFrame, b: ParkFrame): boolean =>
  Math.abs(a.w - b.w) < 2 && Math.abs(a.h - b.h) < 2 && a.hud === b.hud;

/** How fast a mover is actually going: nothing while dazed. */
export const pace = (m: Pick<Mover, 'speed' | 'daze'>): number => (m.daze > 0 ? 0 : m.speed);

/** People a rat goes for, who a biker shouts at, and who a predator eats. */
const BITEABLE: ReadonlySet<Kind> = new Set(['walker', 'runner', 'dog', 'slow', 'pair']);
const ON_FOOT = BITEABLE;

/** Pick-ups whose effect lasts the taker's laps, and so only a couple of laps on a carriage. */
const LASTING: ReadonlySet<PickupKind> = new Set(['ghost', 'star', 'fire', 'turtle', 'autopilot']);
const speedFactor = (kind: PickupKind): number =>
  kind === 'fire' ? FIRE_SPEED : kind === 'turtle' ? TURTLE_SPEED : 1;

/** An autopilot only changes lane into one clear for at least this long, and slows to this share of who's ahead. */
const AUTO_SAFE_TICKS = 30;
const AUTO_SLOW = 0.95;

/** How much of each lane span [p, p + w) overlaps, in lanes. */
export const laneOverlap = (p1: number, w1: number, p2: number, w2: number): number =>
  Math.min(p1 + w1, p2 + w2) - Math.max(p1, p2);

/** Deterministic game state advanced at a fixed tick rate; has no rendering or input knowledge. */
export class ChaosParkSim {
  phase: Phase = 'title';
  paused = false;
  /** Points this run: a lap is worth `streakValue` of them, and a coin one. */
  score = 0;
  /** Laps completed this run, by everything (and those a star knocked off the loop): what the difficulty goes by. */
  laps = 0;
  /** Laps since a life was last lost, for the streak. */
  cleanLaps = 0;
  park: Park;
  movers: Mover[] = [];
  rats: Rat[] = [];
  pops: Pop[] = [];
  crash: { x: number; y: number; ids: number[] } | null = null;
  /** Lives left this run: a collision takes one, and the run ends when none are left. Hearts add one, up to `MAX_LIVES`. */
  lives = LIVES;
  pickups: Pickup[] = [];
  hooks: Hook[] = [];
  weeds: Tumbleweed[] = [];
  waves: Wave[] = [];
  /** Ticks left of a time warp, from taking a spiral: see `timeScale`. */
  warp = 0;
  impacts: Impact[] = [];
  phaseTicks = 0;
  /** Ticks since creation; drives idle animation. */
  clock = 0;
  playTicks = 0;

  private events: SimEvent[] = [];
  private nextId = 1;
  private spawnTimer = FIRST_SPAWN;
  private carriagesSent = 0;
  /** Ticks until a carriage knocked off the loop may be replaced. */
  private carriageWait = 0;
  private groupTimer = 0;
  private ratTimer = 0;
  private pickupTimer = 0;
  private predatorTimer = 0;
  private eventTimer = 0;
  private waveTimer = 0;
  /** Pairs already warned about, so the alert sounds once per close call. */
  private warnedPairs = new Set<string>();
  /** Pairs that have collided and are still overlapping as one passes the other; they don't collide again. */
  private passing = new Set<string>();

  /** Collisions never end the run: for the crowd behind the title (see `inPark`). */
  endless = false;

  /** The shape of screen the next park is made for (see `fitFrame`). */
  frame: ParkFrame = DEFAULT_FRAME;
  /** Ticks the screen has kept its current shape. */
  private frameSteady = 0;

  constructor(
    private readonly rng: () => number = Math.random,
    /** The course being played; see `setCourse`. */
    public course: CourseSpec = COURSES.park,
  ) {
    this.park = generatePark(rng, undefined, DEFAULT_FRAME, course);
  }

  /** A run already under way in `park`, for the crowd behind the title: never ending, as `endless`. */
  static inPark(park: Park, rng: () => number): ChaosParkSim {
    const sim = new ChaosParkSim(rng, COURSES[park.course]);
    sim.park = park;
    sim.frame = park.frame;
    sim.endless = true;
    sim.placeCarriage();
    sim.enter('playing');
    return sim;
  }

  /** Picks the course for the next run, on the title or game-over card, with a new park for it behind the card. */
  setCourse(id: CourseId): void {
    if (this.course.id === id) return;
    if (this.phase !== 'title' && this.phase !== 'gameOver' && this.phase !== 'help') return;
    this.course = COURSES[id];
    this.park = generatePark(this.rng, this.park.season, this.frame, this.course);
  }

  /** The difficulty level now: from the laps, and higher on later courses. */
  get level(): number {
    return level(this.laps, this.course.levelRate) + this.course.levelOffset;
  }

  drainEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Starts a run in the park on the title screen; a retry gets a new park. */
  start(): void {
    if (this.phase === 'gameOver' && this.phaseTicks < GAME_OVER_LOCKOUT) return;
    if (this.phase !== 'title' && this.phase !== 'gameOver' && this.phase !== 'help') return;
    if (this.phase === 'gameOver')
      this.park = generatePark(this.rng, undefined, this.frame, this.course);
    // A park made before the screen's shape was known is remade to fit it, in the same season.
    else if (!sameFrame(this.park.frame, this.frame))
      this.park = generatePark(this.rng, this.park.season, this.frame, this.course);
    this.reset();
    this.placeCarriage();
    this.enter('playing');
  }

  showHelp(): void {
    if (this.phase === 'title') this.enter('help');
  }

  /** Back to the title, with a new park behind it. */
  toTitle(): boolean {
    if (this.phase === 'gameOver' && this.phaseTicks < GAME_OVER_LOCKOUT) return false;
    if (this.phase === 'title') return false;
    // Back to the title in the same season as the park just played.
    if (this.phase !== 'help')
      this.park = generatePark(this.rng, this.park.season, this.frame, this.course);
    this.reset();
    this.enter('title');
    return true;
  }

  /**
   * Tells the sim the shape of the screen. New parks are made to fill it; on the title and how-to-play cards the
   * park behind is remade straight away the first time, and otherwise once the screen has kept a new shape for a
   * moment (so dragging a window's edge doesn't remake it every frame). A park in play keeps its shape.
   */
  fitFrame(frame: ParkFrame): void {
    if (sameFrame(frame, this.frame)) this.frameSteady++;
    else {
      this.frame = frame;
      this.frameSteady = 0;
    }
    const idle = this.phase === 'title' || this.phase === 'help';
    if (!idle || sameFrame(this.park.frame, this.frame)) return;
    if (this.clock === 0 || this.frameSteady >= FRAME_SETTLE)
      this.park = generatePark(this.rng, this.park.season, this.frame, this.course);
  }

  setPaused(paused: boolean): void {
    if (this.phase === 'playing') this.paused = paused;
  }

  /** The mover on the loop nearest a point in park coordinates, if any is within reach. */
  grab(x: number, y: number): Mover | null {
    if (this.phase !== 'playing' || this.paused) return null;
    let best: Mover | null = null;
    let bestDist = Infinity;
    for (const m of this.movers) {
      if (m.state !== 'track') continue;
      // Distance to the line along its body, so long movers can be grabbed anywhere along them.
      const ux = Math.cos(m.heading);
      const uy = Math.sin(m.heading);
      const along = Math.max(-m.len / 2, Math.min(m.len / 2, (x - m.x) * ux + (y - m.y) * uy));
      const d =
        Math.hypot(x - m.x - ux * along, y - m.y - uy * along) - (m.width * this.park.laneW) / 2;
      if (d < GRAB_RADIUS && d < bestDist) {
        best = m;
        bestDist = d;
      }
    }
    return best;
  }

  /** The way out of the park at a mover's spot, for telling which way a swipe went. */
  outward(m: Mover): Point {
    const i =
      Math.round(wrap(m.s, this.park.track.length) / this.park.track.step) %
      this.park.track.normals.length;
    return this.park.track.normals[i]!;
  }

  /** Moves a mover one lane outward (1) or inward (-1). */
  shift(id: number, delta: 1 | -1): boolean {
    if (this.phase !== 'playing' || this.paused) return false;
    const m = this.movers.find((o) => o.id === id && o.state === 'track');
    if (!m) return false;
    const next = Math.max(0, Math.min(this.park.lanes - m.width, m.target + delta));
    // Someone dazed by a rat can't be moved on, and nobody can go through the mansion's wall.
    if (next === m.target || m.daze > 0 || !this.canChange(m, next)) {
      this.events.push('bump');
      return false;
    }
    m.target = next;
    this.events.push('shift');
    return true;
  }

  /** The direction a mover is travelling at its spot, for telling a forward swipe from a backward one. */
  forward(m: Mover): Point {
    const { track } = this.park;
    const t =
      track.tangents[Math.round(wrap(m.s, track.length) / track.step) % track.tangents.length]!;
    return { x: t.x * m.dir, y: t.y * m.dir };
  }

  /**
   * How fast the game runs, as a share of real time: `WARP_SPEED` through a time warp, easing back to 1 at its end.
   * The game feeds ticks to `step` at this rate, so everything on the loop slows together.
   */
  get timeScale(): number {
    if (this.warp <= 0) return 1;
    if (this.warp > WARP_EASE_TICKS) return WARP_SPEED;
    return 1 - (1 - WARP_SPEED) * (this.warp / WARP_EASE_TICKS);
  }

  /** Speeds a mover up (`true`) or returns it to its usual speed (`false`). */
  setBoost(id: number, on: boolean): boolean {
    if (this.phase !== 'playing' || this.paused) return false;
    const m = this.movers.find((o) => o.id === id && o.state === 'track');
    if (!m) return false;
    if (m.boosted === on || m.daze > 0) {
      this.events.push('bump');
      return false;
    }
    m.boosted = on;
    m.speed = m.baseSpeed * (on ? BOOST : 1);
    this.events.push(on ? 'boost' : 'brake');
    return true;
  }

  step(): void {
    for (const m of this.movers) {
      m.prevX = m.x;
      m.prevY = m.y;
      m.prevHeading = m.heading;
    }
    for (const r of this.rats) {
      r.prevX = r.x;
      r.prevY = r.y;
      r.prevHeading = r.heading;
    }
    if (this.paused) return;
    this.clock++;
    if (this.warp > 0) this.warp--;
    this.phaseTicks++;
    if (this.phase === 'crashed' && this.phaseTicks >= CRASH_TICKS) this.enter('gameOver');
    if (this.phase !== 'playing') return;
    this.playTicks++;
    this.spawn();
    for (const m of this.movers)
      if (m.autopilot > 0 && m.state === 'track' && m.daze === 0) this.steer(m);
    for (const m of this.movers)
      if (m.kind === 'predator' && m.state === 'track' && m.daze === 0) this.hunt(m);
    const gone = new Set<Mover>();
    for (const m of this.movers) {
      m.age++;
      if (m.slip > 0) m.slip--;
      if (m.shout > 0) m.shout--;
      if (m.state === 'track') this.moveOnTrack(m);
      else if (this.moveOnRoute(m)) gone.add(m);
    }
    if (gone.size) this.movers = this.movers.filter((m) => !gone.has(m));
    this.moveRats();
    this.moveHooks();
    this.moveWeeds();
    if (this.phase !== 'playing') return;
    this.moveWaves();
    for (const i of this.impacts) i.ticks++;
    this.impacts = this.impacts.filter((i) => i.ticks < IMPACT_TICKS);
    for (const p of this.pops) p.ticks++;
    this.pops = this.pops.filter((p) => p.ticks < POP_TICKS);
    this.checkPickups();
    this.checkTraffic();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Moving.

  private moveOnTrack(m: Mover): void {
    const { track, entrances, shortcuts } = this.park;
    if (m.daze > 0) {
      // Standing still, seeing stars (or stuck in slime).
      m.daze--;
      if (m.slime > 0) m.slime--;
      return;
    }
    if (m.swerve > 0) this.swerveStep(m);
    const from = m.s;
    // Faster through the rapids.
    const pace = inRapids(this.park.rapids, m.s, m.p, m.width, track.length)
      ? m.speed * RAPIDS_SPEED
      : m.speed;
    const delta = pace * m.dir;
    m.s = wrap(m.s + delta, track.length);
    if (m.p !== m.target) m.p += Math.max(-LANE_RATE, Math.min(LANE_RATE, m.target - m.p));
    m.progress += pace;
    this.countLaps(m);
    if (m.lapsDone >= m.wearOff) this.wearOff(m);
    this.checkPatches(m);
    this.place(m);

    if (m.done && this.course.wild) {
      // Back into the trees, on whichever side of the road it's nearer.
      this.leaveWild(m);
      return;
    }
    if (m.done) {
      // The last lap ends at the entrance it came in by, so look a little either side as well as just ahead.
      const exit =
        entrances.find((e) => Math.abs(loopDelta(m.s, e.s, track.length)) <= m.speed + 0.5) ??
        entrances.find((e) => this.crossed(from, delta, e.s));
      if (exit) this.leave(m, exit);
      return;
    }
    if (
      m.dir === 1 &&
      (m.kind === 'walker' || m.kind === 'runner') &&
      m.target === 0 &&
      m.p === 0
    ) {
      for (const c of shortcuts) {
        const reversed = this.crossed(from, delta, c.b);
        if (!reversed && !this.crossed(from, delta, c.a)) continue;
        if (this.rng() < SHORTCUT_CHANCE) this.takeShortcut(m, c, reversed);
        return;
      }
    }
  }

  /** Whether moving `delta` from `from` passes `at`. */
  private crossed(from: number, delta: number, at: number): boolean {
    const d = wrap((at - from) * Math.sign(delta), this.park.track.length);
    return d > 0 && d <= Math.abs(delta);
  }

  /** Follows the route; returns true once a leaving mover has gone. */
  private moveOnRoute(m: Mover): boolean {
    const end = m.routeLens[m.routeLens.length - 1]!;
    const holdAt = m.hold ? Math.max(0, end - this.joinHold(m)) : end;
    if (m.hold && m.routeAt >= holdAt - 1e-6) {
      if (!this.canJoin(m)) {
        m.waiting = true;
        return false;
      }
      m.hold = false;
      m.waiting = false;
    }
    m.routeAt = Math.min(m.routeAt + m.speed, m.hold ? holdAt : end);
    const at = this.routePoint(m);
    this.face(m, at.x, at.y);
    m.x = at.x;
    m.y = at.y;
    if (m.state === 'arriving') m.alpha = Math.min(1, m.routeAt / 24);
    if (m.state === 'leaving') m.alpha = Math.max(0, Math.min(1, (end - m.routeAt) / 30));
    if (m.routeAt < end) return false;
    if (!m.join) return true;

    m.state = 'track';
    m.s = m.join.s;
    m.p = m.target = m.join.p;
    m.progress += m.skip;
    m.skip = 0;
    m.join = null;
    m.alpha = 1;
    this.countLaps(m);
    return false;
  }

  /**
   * How far back from the end of its route a joining mover waits: with its front `JOIN_CLEAR` short of the road's
   * edge, however long it is and whichever lane it joins.
   */
  private joinHold(m: Mover): number {
    const edge = this.park.half - Math.abs(laneOffset(m.join!.p, m.width, this.park));
    return edge + m.len / 2 + JOIN_CLEAR;
  }

  private routePoint(m: Mover): Point {
    const { route, routeLens, routeAt } = m;
    let i = 1;
    while (i < route.length - 1 && routeLens[i]! < routeAt) i++;
    const a = route[i - 1]!;
    const b = route[i]!;
    const span = routeLens[i]! - routeLens[i - 1]! || 1;
    const t = Math.max(0, Math.min(1, (routeAt - routeLens[i - 1]!) / span));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  private setRoute(m: Mover, route: Point[], join: Mover['join']): void {
    m.route = route;
    m.routeLens = [0];
    for (let i = 1; i < route.length; i++)
      m.routeLens.push(
        m.routeLens[i - 1]! +
          Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y),
      );
    m.routeAt = 0;
    m.join = join;
    m.hold = !!join;
    m.waiting = false;
  }

  /** Puts a mover on the loop where `s` and `p` say, facing the way it moved. */
  private place(m: Mover): void {
    const at = pose(this.park.track, m.s, laneOffset(m.p, m.width, this.park));
    this.face(m, at.x, at.y, at.angle + (m.dir < 0 ? Math.PI : 0));
    m.x = at.x;
    m.y = at.y;
  }

  private face(m: Mover, x: number, y: number, fallback = m.heading): void {
    const dx = x - m.x;
    const dy = y - m.y;
    m.heading = Math.hypot(dx, dy) > 0.05 ? Math.atan2(dy, dx) : fallback;
  }

  private takeShortcut(m: Mover, c: Shortcut, reversed: boolean): void {
    const { track } = this.park;
    const to = reversed ? c.a : c.b;
    const path = reversed ? [...c.path].reverse() : c.path;
    const end = pose(track, to, laneOffset(0, 1, this.park));
    m.state = 'shortcut';
    m.skip = wrap(to - m.s, track.length);
    this.setRoute(m, [{ x: m.x, y: m.y }, ...path, { x: end.x, y: end.y }], { s: to, p: 0 });
  }

  private leave(m: Mover, e: Entrance): void {
    m.state = 'leaving';
    m.warning = false;
    this.setRoute(m, [{ x: m.x, y: m.y }, e.throat, e.gate, e.street], null);
  }

  private leaveWild(m: Mover): void {
    const { track, half, lanes, bridge } = this.park;
    // Not off a bridge: on over it first.
    if (
      bridge &&
      underCover(
        { s: bridge.over.s - BRIDGE_EXIT_CLEAR, len: bridge.over.len + 2 * BRIDGE_EXIT_CLEAR },
        m.s,
        track.length,
      )
    )
      return;
    const near = m.p + m.width / 2 < lanes / 2 ? -1 : 1;
    // On a figure of eight, not into the other road: the far side if the near one is blocked, or on a little further.
    const side = this.clearOfRoad(m.s, near) ? near : this.clearOfRoad(m.s, -near) ? -near : 0;
    if (side === 0) return;
    const edge = pose(track, m.s, side * (half + 4));
    const out = pose(track, m.s, side * (half + WILD_DEPTH));
    m.state = 'leaving';
    m.warning = false;
    this.setRoute(
      m,
      [
        { x: m.x, y: m.y },
        { x: edge.x, y: edge.y },
        { x: out.x, y: out.y },
      ],
      null,
    );
  }

  /**
   * Whether the trees `WILD_DEPTH` out from the road at `s`, on `side`, are clear of any other road: always on a loop,
   * not near where a figure of eight's halves meet.
   */
  private clearOfRoad(s: number, side: number): boolean {
    if (!this.park.bridge) return true;
    const { track, half } = this.park;
    const out = pose(track, s, side * (half + WILD_DEPTH));
    return !nearPolyline(track.points, out, half + 8, true);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Laps, patches and collisions.

  private countLaps(m: Mover): void {
    const length = this.park.track.length;
    while (!m.done && m.progress >= (m.lapsDone + 1) * length - 1e-6) {
      m.lapsDone++;
      if (m.lapsDone >= m.laps) m.done = true;
      // A predator's lap scores nothing.
      if (m.kind === 'predator') continue;
      const value = this.scoreLaps(m.crowd);
      this.events.push('lap');
      this.pops.push({ id: this.nextId++, value, x: m.x, y: m.y, ticks: 0 });
    }
  }

  /** Scores laps at the streak's value, then counts them toward the streak; returns the points. */
  private scoreLaps(laps: number): number {
    const before = streakValue(this.cleanLaps);
    const value = laps * before;
    this.score += value;
    this.laps += laps;
    this.cleanLaps += laps;
    if (streakValue(this.cleanLaps) > before) this.events.push('streak');
    return value;
  }

  /**
   * Slippery patches slide whoever crosses them a lane; obstacles are steered round, a lane either way, a little
   * before they are reached; slime holds whoever steps in it.
   */
  private checkPatches(m: Mover): void {
    const { patches, track } = this.park;
    const { obstacle } = this.course;
    for (const patch of patches.slice(0, patchesShown(this.laps))) {
      const dist = Math.abs(loopDelta(patch.s, m.s, track.length));
      const over =
        obstacle === 'steer'
          ? dist < (patch.len + m.len) / 2 + STEER_AHEAD &&
            laneOverlap(m.target, m.width, patch.lane, patch.width) > 0.3
          : dist < (patch.len + m.len) / 2 - 4 * ART &&
            laneOverlap(m.p, m.width, patch.lane, patch.width) > 0.3;
      if (!over) {
        m.onPatch.delete(patch.id);
        continue;
      }
      if (m.onPatch.has(patch.id)) continue;
      m.onPatch.add(patch.id);
      if (obstacle === 'slime') {
        if (m.ghost > 0 || m.star > 0) continue;
        m.daze = m.slime = SLIME_TICKS;
        m.boosted = false;
        m.autoSlow = false;
        m.speed = m.baseSpeed;
        this.events.push('slime');
        continue;
      }
      const options = [m.target - 1, m.target + 1].filter(
        (l) => l >= 0 && l <= this.park.lanes - m.width && this.canChange(m, l),
      );
      if (!options.length) continue;
      m.target = options[Math.floor(this.rng() * options.length)]!;
      if (obstacle === 'slip') {
        m.slip = SLIP_TICKS;
        this.events.push('slip');
      }
    }
  }

  /** Whether a mover may change to `lane`: anyone but the course's train. */
  private canChange(m: Mover, _lane: number): boolean {
    return !this.isTrain(m);
  }

  /** Whether a mover is the course's train, which keeps to its lane whatever happens. */
  private isTrain(m: Mover): boolean {
    return m.kind === 'carriage' && this.course.train;
  }

  /** A biker bearing down on someone on foot tells them to get out of the way. */
  private shoutIfBiker(a: Mover, b: Mover): void {
    const [biker, other] = a.kind === 'biker' ? [a, b] : b.kind === 'biker' ? [b, a] : [null, null];
    if (!biker || !other || !ON_FOOT.has(other.kind)) return;
    // Only when the person is ahead of the biker, the way it is going.
    const ahead = wrap((other.s - biker.s) * biker.dir, this.park.track.length);
    if (ahead > this.park.track.length / 2) return;
    if (this.playTicks - biker.shoutAt < SHOUT_COOLDOWN) return;
    biker.shout = SHOUT_TICKS;
    biker.shoutAt = this.playTicks;
  }

  /** Whether a mover waiting at the end of its route can join the loop without anything about to run into it. */
  canJoin(m: Mover): boolean {
    if (!m.join) return true;
    const { s, p } = m.join;
    const length = this.park.track.length;
    for (const o of this.movers) {
      if (o === m || o.state !== 'track') continue;
      const lo = Math.min(o.p, o.target);
      const hi = Math.max(o.p, o.target) + o.width;
      if (hi <= p + 0.05 || lo >= p + m.width - 0.05) continue;
      const clearance = (o.len + m.len) / 2 + 10 * ART;
      // How far it has to go to reach the joining spot, and how far past it it already is.
      const toReach = wrap((s - o.s) * o.dir, length);
      if (toReach < pace(o) * JOIN_TICKS + clearance) return false;
      if (length - toReach < clearance) return false;
      if (o.dir === m.dir) {
        // Something slower just ahead would soon be caught.
        const ahead = wrap((o.s - s) * m.dir, length);
        if (ahead < clearance + Math.max(0, m.speed - pace(o)) * JOIN_TICKS) return false;
      }
    }
    return true;
  }

  /**
   * Two movers have touched. The last collision a run can take ends it; before that, whoever was run into is
   * stunned and the one that hit them carries on through. Returns true when the run is over.
   */
  private collide(a: Mover, b: Mover, delta: number): boolean {
    const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (this.loseLife(at, [a.id, b.id])) return true;
    // The one moving into the other did the hitting: a lane change into someone alongside, otherwise whichever is
    // heading toward the other faster.
    const turning = (m: Mover) => Math.abs(m.p - m.target) > 1e-6;
    const towards = (m: Mover, sign: number) => pace(m) * m.dir * sign;
    const aHits =
      turning(a) !== turning(b)
        ? turning(a)
        : towards(a, Math.sign(delta)) >= towards(b, -Math.sign(delta));
    this.stun(aHits ? b : a, at);
    this.passing.add(`${a.id}:${b.id}`);
    return false;
  }

  /** Takes a life for a collision or wreck at `at`; true if that was the last, ending the run. */
  private loseLife(at: { x: number; y: number }, ids: number[]): boolean {
    if (this.endless) this.lives = LIVES;
    this.lives--;
    this.cleanLaps = 0;
    if (this.lives > 0) return false;
    this.crash = { ...at, ids };
    this.events.push('crash');
    this.enter('crashed');
    return true;
  }

  /** Stuns whoever was hit, at `at`, losing any boost. */
  private stun(victim: Mover, at: { x: number; y: number }): void {
    victim.daze = Math.max(victim.daze, STUN_TICKS);
    victim.boosted = false;
    victim.autoSlow = false;
    victim.speed = victim.baseSpeed;
    this.impacts.push({ id: this.nextId++, ...at, ticks: 0 });
    this.events.push('hit');
  }

  /** Collide any two movers on the loop that touch; otherwise flag the ones about to. */
  private checkTraffic(): void {
    const live = this.movers.filter((m) => m.state === 'track');
    const length = this.park.track.length;
    for (const m of live) m.warning = false;
    const pairs = new Set<string>();
    const knocked = new Set<Mover>();
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!;
        const b = live[j]!;
        const delta = loopDelta(a.s, b.s, length);
        const dist = Math.abs(delta);
        const half = (a.len + b.len) / 2;
        const pair = `${a.id}:${b.id}`;
        if (knocked.has(a) || knocked.has(b)) continue;
        if (this.passing.has(pair)) {
          // One is passing through the other after a collision; done once they are clear.
          if (dist >= half || laneOverlap(a.p, a.width, b.p, b.width) <= 0)
            this.passing.delete(pair);
          continue;
        }
        if (dist > half + WARN_MAX_GAP) continue;
        const touching =
          laneOverlap(a.p, a.width, b.p, b.width) > LATERAL_OVERLAP && dist < half * COLLIDE_FACTOR;
        // A star knocks whoever it touches off the loop, for the laps they had left (a carriage for nothing),
        // except another star, which it passes through.
        if (a.star > 0 || b.star > 0) {
          const victim = a.star > 0 ? b : a;
          if (touching) {
            if (victim.star > 0) this.passing.add(pair);
            else knocked.add(victim);
          }
          continue;
        }
        // An invisible one goes through anyone, and nobody warns about it. Still overlapping when it shows again,
        // it carries on through rather than colliding.
        if (a.ghost > 0 || b.ghost > 0) {
          if (touching) this.passing.add(pair);
          continue;
        }
        if (touching) {
          // A predator eats whoever on foot it touches; anything bigger it collides with.
          const predator = a.kind === 'predator' ? a : b.kind === 'predator' ? b : null;
          const prey = predator === a ? b : a;
          if (predator && ON_FOOT.has(prey.kind)) {
            if (this.eat(predator, prey)) return;
            knocked.add(prey);
            continue;
          }
          if (this.collide(a, b, delta)) return;
          continue;
        }
        // Warn on where they are heading as well as where they are.
        const aLo = Math.min(a.p, a.target);
        const bLo = Math.min(b.p, b.target);
        const aW = Math.max(a.p, a.target) + a.width - aLo;
        const bW = Math.max(b.p, b.target) + b.width - bLo;
        if (laneOverlap(aLo, aW, bLo, bW) <= 0.1) continue;
        const gap = dist - half;
        const closing = -Math.sign(delta) * (pace(b) * b.dir - pace(a) * a.dir);
        if (gap < 6 * ART || (closing > 0 && gap / closing < WARN_TICKS)) {
          a.warning = b.warning = true;
          const key = `${a.id}:${b.id}`;
          pairs.add(key);
          if (!this.warnedPairs.has(key)) {
            this.events.push('alert');
            this.shoutIfBiker(a, b);
          }
        }
      }
    }
    this.warnedPairs = pairs;
    for (const m of knocked) if (this.movers.includes(m)) this.knockOff(m);
  }

  /** A predator catches someone: they're gone, their laps lost, and it costs a life. True if that ended the run. */
  private eat(predator: Mover, prey: Mover): boolean {
    this.events.push('eat');
    const at = { x: prey.x, y: prey.y };
    this.movers = this.movers.filter((o) => o !== prey);
    this.impacts.push({ id: this.nextId++, ...at, ticks: 0 });
    return this.loseLife(at, [predator.id, prey.id]);
  }

  /**
   * A predator moves a lane at a time toward the nearest person on foot ahead of it, now and then, so a swipe can
   * still put it off.
   */
  private hunt(m: Mover): void {
    if (this.playTicks - m.turnedAt < PREDATOR_TURN || m.p !== m.target) return;
    const length = this.park.track.length;
    let prey: Mover | null = null;
    let nearest = PREDATOR_SIGHT;
    for (const o of this.movers) {
      if (o.state !== 'track' || !ON_FOOT.has(o.kind) || o.ghost > 0) continue;
      const d = wrap((o.s - m.s) * m.dir, length);
      if (d < nearest) {
        nearest = d;
        prey = o;
      }
    }
    // Close enough to catch them, it runs straight on for a while, so a late swipe still gets them away.
    if (prey) {
      const gap = nearest - (m.len + prey.len) / 2;
      const closing = pace(m) - pace(prey) * prey.dir * m.dir;
      if (closing > 0 && gap / closing < PREDATOR_COMMIT) {
        m.turnedAt = this.playTicks + PREDATOR_LUNGE - PREDATOR_TURN;
        return;
      }
    }
    let lane = !prey
      ? m.target
      : prey.target < m.target
        ? m.target - 1
        : prey.target > m.target
          ? m.target + 1
          : m.target;
    // With nobody to go for, it wanders a lane now and then of its own accord.
    if (
      !prey &&
      this.playTicks - m.turnedAt >= PREDATOR_WANDER &&
      this.rng() < PREDATOR_WANDER_CHANCE
    ) {
      const up =
        m.target === 0 ? true : m.target >= this.park.lanes - m.width ? false : this.rng() < 0.5;
      lane = m.target + (up ? 1 : -1);
    }
    if (lane === m.target || !this.canChange(m, lane)) return;
    m.target = lane;
    m.turnedAt = this.playTicks;
  }

  /**
   * A star sends someone flying off the loop: they're gone, and their remaining laps score at once. A carriage scores
   * nothing, and another comes in its place after `CARRIAGE_RETURN`.
   */
  private knockOff(m: Mover): void {
    this.movers = this.movers.filter((o) => o !== m);
    this.impacts.push({ id: this.nextId++, x: m.x, y: m.y, ticks: 0 });
    this.events.push('knock');
    if (m.kind === 'carriage') {
      this.carriagesSent--;
      const [lo, hi] = CARRIAGE_RETURN;
      this.carriageWait = Math.round(lo + this.rng() * (hi - lo));
      return;
    }
    if (m.kind === 'predator') return;
    const value = this.scoreLaps(Math.max(1, m.laps - m.lapsDone) * m.crowd);
    this.pops.push({ id: this.nextId++, value, x: m.x, y: m.y, ticks: 0 });
  }

  // -------------------------------------------------------------------------------------------------------------
  // Arrivals.

  private spawn(): void {
    this.spawnSpecials();
    const active = this.movers.filter(
      (m) => m.kind !== 'carriage' && m.kind !== 'predator' && m.state !== 'leaving',
    ).length;
    // One carriage, and a second from SECOND_CARRIAGE_SCORE laps; one knocked off is replaced after a wait.
    const carriages = this.laps >= SECOND_CARRIAGE_SCORE && !this.course.train ? 2 : 1;
    if (this.carriageWait > 0) this.carriageWait--;
    else if (this.carriagesSent < carriages && this.arrive('carriage')) this.carriagesSent++;
    if (active === 0) this.spawnTimer = Math.min(this.spawnTimer, 30);
    if (--this.spawnTimer > 0) return;
    if (active >= maxMovers(this.laps, this.course.levelOffset, this.course.levelRate)) {
      this.spawnTimer = 30;
      return;
    }
    const base = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL - this.level * SPAWN_INTERVAL_STEP);
    this.spawnTimer = Math.round(base * (0.75 + this.rng() * 0.5));
    if (!this.arrive(this.pickKind())) this.spawnTimer = 20;
  }

  /** The rare ones: run groups and rats, each on its own long timer once there have been enough laps. */
  private spawnSpecials(): void {
    const between = ([lo, hi]: readonly [number, number]) =>
      Math.round(lo + this.rng() * (hi - lo));
    // A group comes a while after the laps reach GROUP_FROM_SCORE, and again a while after each one has gone, so
    // there is never more than one.
    if (this.laps >= GROUP_FROM_SCORE) {
      if (this.movers.some((m) => m.kind === 'group')) this.groupTimer = 0;
      else if (this.groupTimer <= 0)
        this.groupTimer = between(
          this.laps < GROUP_EARLY_UNTIL ? GROUP_INTERVAL_EARLY : GROUP_INTERVAL,
        );
      // Every gate busy: try again in a moment.
      else if (--this.groupTimer <= 0 && !this.arrive('group')) this.groupTimer = 10;
    }
    if (this.laps >= RAT_FROM_SCORE) {
      if (this.ratTimer <= 0) this.ratTimer = between(RAT_INTERVAL) / 2;
      else if (--this.ratTimer <= 0)
        this.ratTimer = this.sendRat('bite') ? between(RAT_INTERVAL) : 120;
    }
    // A course's predator, like a run group: one at a time, a while after the last.
    if (this.course.predator && this.laps >= PREDATOR_FROM_SCORE) {
      if (this.movers.some((m) => m.kind === 'predator')) this.predatorTimer = 0;
      else if (this.predatorTimer <= 0) this.predatorTimer = between(PREDATOR_INTERVAL);
      else if (--this.predatorTimer <= 0 && !this.arrive('predator')) this.predatorTimer = 10;
    }
    const { event } = this.course;
    if (event !== 'none' && this.laps >= EVENT_FROM_SCORE) {
      if (this.eventTimer <= 0) this.eventTimer = between(EVENT_INTERVAL) / 2;
      else if (--this.eventTimer <= 0)
        this.eventTimer = this.startEvent() ? between(EVENT_INTERVAL) : 120;
    }
    // Waves, one at a time, on their own timer.
    if (this.course.waves && this.laps >= WAVE_FROM_SCORE && !this.waves.length) {
      if (this.waveTimer <= 0) this.waveTimer = between(WAVE_INTERVAL);
      else if (--this.waveTimer <= 0 && !this.sendWave()) this.waveTimer = 30;
    }
    // One pick-up at a time: the next is timed from when the last one went.
    if (this.laps >= PICKUP_FROM_SCORE && !this.pickups.length) {
      if (this.pickupTimer <= 0) this.pickupTimer = between(PICKUP_FIRST);
      else if (--this.pickupTimer <= 0)
        this.pickupTimer = this.placePickup() ? between(PICKUP_INTERVAL) : 30;
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Pick-ups.

  /** Puts a heart or token somewhere clear on the loop; returns false if the spot drawn was too close to someone. */
  private placePickup(): boolean {
    const { track } = this.park;
    const kinds = PICKUP_KINDS;
    const weight = (k: PickupKind): number =>
      k === 'heart' && this.lives >= MAX_LIVES ? 0 : PICKUP_WEIGHTS[k];
    let r = this.rng() * kinds.reduce((sum, k) => sum + weight(k), 0);
    let kind: PickupKind = 'double';
    for (const k of kinds) {
      r -= weight(k);
      if (r < 0) {
        kind = k;
        break;
      }
    }
    const s = this.rng() * track.length;
    const lane = Math.floor(this.rng() * this.park.lanes);
    if (onBridge(this.park.bridge, s, track.length)) return false;
    for (const m of this.movers) {
      if (m.state !== 'track') continue;
      if (
        Math.abs(loopDelta(s, m.s, track.length)) < PICKUP_CLEAR &&
        laneOverlap(m.p, m.width, lane, 1) > 0
      )
        return false;
    }
    const at = pose(track, s, laneOffset(lane, 1, this.park));
    this.pickups.push({ id: this.nextId++, kind, s, lane, x: at.x, y: at.y, ticks: 0 });
    return true;
  }

  /** Ages the pick-ups on the loop, and gives each to the first visitor over it. */
  private checkPickups(): void {
    const length = this.park.track.length;
    for (const p of this.pickups) {
      p.ticks++;
      const taker = this.movers.find(
        (m) =>
          m.state === 'track' &&
          m.kind !== 'group' &&
          m.kind !== 'predator' &&
          !(m.kind === 'carriage' && (p.kind === 'double' || p.kind === 'strength')) &&
          !this.isTrain(m) &&
          Math.abs(loopDelta(p.s, m.s, length)) < (PICKUP_LEN + m.len) / 2 &&
          laneOverlap(m.p, m.width, p.lane, 1) > LATERAL_OVERLAP,
      );
      if (!taker) continue;
      p.ticks = PICKUP_TICKS;
      switch (p.kind) {
        case 'heart':
          this.lives = Math.min(MAX_LIVES, this.lives + 1);
          break;
        case 'double':
          this.duplicate(taker);
          break;
        case 'ghost':
          taker.ghost = 1;
          break;
        case 'star':
          taker.star = 1;
          break;
        case 'fire':
        case 'turtle': {
          const factor = p.kind === 'fire' ? FIRE_SPEED : TURTLE_SPEED;
          taker.baseSpeed *= factor;
          taker.speed *= factor;
          break;
        }
        case 'strength':
          taker.laps += EXTRA_LAPS;
          break;
        case 'coin':
          this.score++;
          break;
        case 'skull':
          // A star keeps its taker safe.
          if (taker.star > 0) break;
          if (this.loseLife({ x: taker.x, y: taker.y }, [taker.id])) {
            this.events.push('skull');
            this.pops.push({
              id: this.nextId++,
              value: 0,
              pickup: p.kind,
              x: taker.x,
              y: taker.y,
              ticks: 0,
            });
            this.pickups = this.pickups.filter((o) => o.ticks < PICKUP_TICKS);
            return;
          }
          this.stun(taker, { x: taker.x, y: taker.y });
          break;
        case 'spiral':
          this.warp = WARP_SLOW_TICKS + WARP_EASE_TICKS;
          break;
        case 'autopilot':
          taker.autopilot = 1;
          break;
      }
      // A carriage never leaves, so what it took lasts it a couple of laps rather than for good.
      if (taker.kind === 'carriage' && LASTING.has(p.kind)) {
        if (!Number.isFinite(taker.wearOff))
          taker.plainSpeed = taker.baseSpeed / speedFactor(p.kind);
        taker.wearOff = taker.lapsDone + CARRIAGE_EFFECT_LAPS;
      }
      this.events.push(p.kind === 'heart' ? 'life' : p.kind);
      this.pops.push({
        id: this.nextId++,
        value: 0,
        pickup: p.kind,
        x: taker.x,
        y: taker.y,
        ticks: 0,
      });
    }
    this.pickups = this.pickups.filter((p) => p.ticks < PICKUP_TICKS);
  }

  /** A carriage's pick-ups wear off: it shows again, stops knocking people off, and goes back to its usual speed. */
  private wearOff(m: Mover): void {
    m.wearOff = Infinity;
    m.ghost = 0;
    m.star = 0;
    m.autopilot = 0;
    m.autoSlow = false;
    m.baseSpeed = m.plainSpeed;
    m.speed = m.baseSpeed * (m.boosted ? BOOST : 1);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Autopilot.

  /**
   * The soonest, in ticks, anything on the loop would touch `m` were it in lanes [lo, lo + w): 0 for anything
   * alongside or nearly so, `Infinity` for nothing on the way. Ignores anyone invisible, and anyone it is already
   * passing through.
   */
  private contactIn(m: Mover, lo: number, w: number): number {
    const length = this.park.track.length;
    let soonest = Infinity;
    for (const o of this.movers) {
      if (o === m || o.state !== 'track' || o.ghost > 0) continue;
      if (this.passing.has(`${m.id}:${o.id}`) || this.passing.has(`${o.id}:${m.id}`)) continue;
      const oLo = Math.min(o.p, o.target);
      const oW = Math.max(o.p, o.target) + o.width - oLo;
      if (laneOverlap(lo, w, oLo, oW) <= 0.1) continue;
      const delta = loopDelta(m.s, o.s, length);
      const gap = Math.abs(delta) - (m.len + o.len) / 2;
      if (gap > WARN_MAX_GAP * 2) continue;
      if (gap < 6 * ART) return 0;
      const closing = -Math.sign(delta) * (pace(o) * o.dir - pace(m) * m.dir);
      if (closing > 0) soonest = Math.min(soonest, gap / closing);
    }
    return soonest;
  }

  /**
   * Someone on autopilot about to touch someone moves to whichever lane beside it is clear for longest, or failing
   * that slows to keep behind whoever is ahead; once clear it goes back to its usual speed.
   */
  private steer(m: Mover): void {
    const length = this.park.track.length;
    const soon = this.contactIn(m, m.target, m.width);
    if (soon >= WARN_TICKS) {
      if (m.autoSlow) {
        m.autoSlow = false;
        m.speed = m.baseSpeed * (m.boosted ? BOOST : 1);
      }
      return;
    }
    let lane = m.target;
    let clear = soon;
    for (const next of [m.target - 1, m.target + 1]) {
      if (next < 0 || next > this.park.lanes - m.width || !this.canChange(m, next)) continue;
      const t = this.contactIn(m, next, m.width);
      if (t > clear) {
        lane = next;
        clear = t;
      }
    }
    if (lane !== m.target && clear >= AUTO_SAFE_TICKS) {
      m.target = lane;
      return;
    }
    // Nowhere to go: keep behind the nearest one ahead in its lane going the same way, if slower.
    let ahead: Mover | null = null;
    let nearest = Infinity;
    for (const o of this.movers) {
      if (o === m || o.state !== 'track' || o.dir !== m.dir || o.ghost > 0) continue;
      if (
        laneOverlap(
          m.target,
          m.width,
          Math.min(o.p, o.target),
          Math.abs(o.p - o.target) + o.width,
        ) <= 0.1
      )
        continue;
      const d = wrap((o.s - m.s) * m.dir, length);
      if (d < nearest && d < length / 2) {
        nearest = d;
        ahead = o;
      }
    }
    if (ahead && pace(ahead) < m.speed) {
      m.speed = pace(ahead) * AUTO_SLOW;
      m.autoSlow = true;
    }
  }

  /**
   * Puts an exact copy of a mover just behind it, with the laps it still had to do. If the copy lands on top of
   * anyone, that doesn't count as a collision: they pass through each other.
   */
  private duplicate(m: Mover): void {
    const { track } = this.park;
    const copy: Mover = {
      ...m,
      id: this.nextId++,
      s: wrap(m.s - m.dir * (m.len + DOUBLE_GAP), track.length),
      progress: 0,
      laps: Math.max(1, m.laps - m.lapsDone),
      lapsDone: 0,
      done: false,
      route: [],
      routeLens: [0],
      join: null,
      warning: false,
      onPatch: new Set(),
      shout: 0,
      shoutAt: -Infinity,
    };
    this.place(copy);
    copy.heading = copy.prevHeading = m.heading;
    copy.prevX = copy.x;
    copy.prevY = copy.y;
    const length = track.length;
    for (const o of this.movers) {
      if (o.state !== 'track') continue;
      const half = (o.len + copy.len) / 2;
      if (
        laneOverlap(o.p, o.width, copy.p, copy.width) > LATERAL_OVERLAP &&
        Math.abs(loopDelta(o.s, copy.s, length)) < half * COLLIDE_FACTOR
      )
        this.passing.add(`${o.id}:${copy.id}`);
    }
    this.movers.push(copy);
  }

  private pickKind(): Kind {
    const kinds: Kind[] = ['walker', 'dog', 'runner', 'biker', 'car', 'slow', 'pair'];
    // One car in the park at a time, from the moment it turns in at the gate until it has driven out.
    const carIn = this.movers.some((m) => m.kind === 'car');
    const weight = (k: Kind): number =>
      k === 'slow'
        ? this.course.slow
        : k === 'pair'
          ? this.course.slowPair
          : k !== 'car'
            ? KIND_SPECS[k].weight
            : this.laps < CARS_FROM_SCORE || carIn
              ? 0
              : KIND_SPECS.car.weight + Math.min(0.05, (this.level - CARS_FROM_SCORE) * 0.002);
    const total = kinds.reduce((sum, k) => sum + weight(k), 0);
    let r = this.rng() * total;
    for (const k of kinds) {
      r -= weight(k);
      if (r < 0) return k;
    }
    return 'walker';
  }

  /** Sends a mover in through a free entrance; returns false when every entrance is busy. */
  private arrive(kind: Kind): boolean {
    if (this.course.wild) return this.arriveWild(kind);
    const { entrances, track } = this.park;
    const free = entrances.filter(
      (e) => !this.movers.some((m) => m.state === 'arriving' && m.entrance === e.id),
    );
    if (!free.length) return false;
    const e = free[Math.floor(this.rng() * free.length)]!;
    const crowd =
      kind === 'group'
        ? GROUP_SIZE[0] + Math.floor(this.rng() * (GROUP_SIZE[1] - GROUP_SIZE[0] + 1))
        : 1;
    const m = this.create(kind, crowd);
    const wrongWayChance = Math.min(
      WRONG_WAY_MAX_CHANCE,
      WRONG_WAY_CHANCE + (this.level - WRONG_WAY_FROM_SCORE) * 0.003,
    );
    if (
      (kind === 'walker' || kind === 'runner') &&
      this.laps >= WRONG_WAY_FROM_SCORE &&
      this.rng() < wrongWayChance
    )
      m.dir = -1;
    m.entrance = e.id;
    m.state = 'arriving';
    m.alpha = 0;
    const p = this.isTrain(m) ? TRAIN_LANE : e.side > 0 ? this.park.lanes - m.width : 0;
    const merge = pose(track, e.s, laneOffset(p, m.width, this.park));
    this.setRoute(m, [e.street, e.gate, e.throat, { x: merge.x, y: merge.y }], { s: e.s, p });
    m.x = m.prevX = e.street.x;
    m.y = m.prevY = e.street.y;
    m.heading = m.prevHeading = Math.atan2(e.gate.y - e.street.y, e.gate.x - e.street.x);
    this.movers.push(m);
    return true;
  }

  /**
   * On a wild course, sends a mover out of the trees at a random spot along the road, on the inside or the outside;
   * returns false when another is already arriving near there.
   */
  private arriveWild(kind: Kind): boolean {
    const { track, half, lanes } = this.park;
    const s = this.rng() * track.length;
    const inside = this.rng() < 0.5;
    // Not where a figure of eight's other road (or its bridge) is right there.
    if (onBridge(this.park.bridge, s, track.length) || !this.clearOfRoad(s, inside ? -1 : 1))
      return false;
    if (
      this.movers.some(
        (o) =>
          o.state === 'arriving' &&
          !!o.join &&
          Math.abs(loopDelta(o.join.s, s, track.length)) < WILD_GAP,
      )
    )
      return false;
    const crowd =
      kind === 'group'
        ? GROUP_SIZE[0] + Math.floor(this.rng() * (GROUP_SIZE[1] - GROUP_SIZE[0] + 1))
        : 1;
    const m = this.create(kind, crowd);
    const wrongWayChance = Math.min(
      WRONG_WAY_MAX_CHANCE,
      WRONG_WAY_CHANCE + (this.level - WRONG_WAY_FROM_SCORE) * 0.003,
    );
    if (
      (kind === 'walker' || kind === 'runner') &&
      this.laps >= WRONG_WAY_FROM_SCORE &&
      this.rng() < wrongWayChance
    )
      m.dir = -1;
    m.entrance = -1;
    m.state = 'arriving';
    m.alpha = 0;
    const side = inside ? -1 : 1;
    const p = inside ? 0 : lanes - m.width;
    // Deep enough in the trees that even a long one waits out of the road and fully in view.
    const from = pose(track, s, side * (half + WILD_DEPTH + m.len / 2));
    const edge = pose(track, s, side * (half + 4));
    const merge = pose(track, s, laneOffset(p, m.width, this.park));
    this.setRoute(
      m,
      [
        { x: from.x, y: from.y },
        { x: edge.x, y: edge.y },
        { x: merge.x, y: merge.y },
      ],
      { s, p },
    );
    m.x = m.prevX = from.x;
    m.y = m.prevY = from.y;
    m.heading = m.prevHeading = Math.atan2(edge.y - from.y, edge.x - from.x);
    this.movers.push(m);
    return true;
  }

  /** The first carriage starts out already on the loop. */
  private placeCarriage(): void {
    const m = this.create('carriage');
    m.state = 'track';
    m.s = this.rng() * this.park.track.length;
    m.p = m.target = this.rng() < 0.5 ? 0 : this.park.lanes - 2;
    if (this.isTrain(m)) m.p = m.target = TRAIN_LANE;
    this.place(m);
    m.heading = m.prevHeading = pose(this.park.track, m.s).angle;
    m.prevX = m.x;
    m.prevY = m.y;
    this.movers.push(m);
    this.carriagesSent = 1;
  }

  private create(kind: Kind, crowd = 1): Mover {
    const spec = KIND_SPECS[kind];
    const [lo, hi] = spec.laps;
    // Fewer laps are more likely than many.
    const laps = Number.isFinite(lo)
      ? lo + Math.floor(this.rng() ** 1.6 * (hi - lo + 1))
      : Infinity;
    const speed = spec.speed * (1 + (this.rng() * 2 - 1) * SPEED_SPREAD);
    const m: Mover = {
      id: this.nextId++,
      kind,
      width: spec.width,
      len: kind === 'group' ? groupLength(crowd) : spec.len,
      speed,
      baseSpeed: speed,
      boosted: false,
      dir: 1,
      state: 'track',
      s: 0,
      p: 0,
      target: 0,
      progress: 0,
      laps,
      lapsDone: 0,
      done: false,
      route: [],
      routeLens: [0],
      routeAt: 0,
      join: null,
      hold: false,
      waiting: false,
      skip: 0,
      entrance: -1,
      x: 0,
      y: 0,
      heading: 0,
      prevX: 0,
      prevY: 0,
      prevHeading: 0,
      alpha: 1,
      warning: false,
      slip: 0,
      age: 0,
      look: [this.rng(), this.rng(), this.rng()],
      onPatch: new Set(),
      crowd,
      daze: 0,
      shout: 0,
      shoutAt: -Infinity,
      ghost: 0,
      star: 0,
      autopilot: 0,
      autoSlow: false,
      wearOff: Infinity,
      plainSpeed: speed,
      swerve: 0,
      haunted: false,
      slime: 0,
      turnedAt: -Infinity,
    };
    if (kind === 'carriage' && this.course.train) {
      m.width = 1;
      m.len = TRAIN_LEN * ART;
    }
    if (kind === 'car' && this.course.slowCars && m.look[0] < SLOW_CAR_SHARE) {
      m.speed = m.baseSpeed = m.plainSpeed = speed * SLOW_CAR_SPEED;
      m.len = KIND_SPECS.carriage.len;
    }
    return m;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Rats.

  /**
   * Sets a rat (or a bee or a ghost) waiting at the kerb ahead of someone to go for; returns false if nobody suitable
   * is about. One of each kind at a time.
   */
  private sendRat(kind: Rat['kind']): boolean {
    if (this.rats.some((r) => r.kind === kind)) return false;
    const { track } = this.park;
    const lead = RAT_LURK + 30;
    const people = this.movers.filter(
      (m) => m.state === 'track' && BITEABLE.has(m.kind) && m.daze === 0 && !m.done,
    );
    if (!people.length) return false;
    const m = people[Math.floor(this.rng() * people.length)]!;
    // Waits on whichever side of the road is nearer the person, where they will be when it darts out.
    const side = m.p + m.width / 2 <= this.park.lanes / 2 ? -1 : 1;
    const at = pose(track, m.s + m.dir * m.speed * lead, side * (this.park.half + 9 * ART));
    const heading = at.angle + (side < 0 ? Math.PI / 2 : -Math.PI / 2);
    this.rats.push({
      id: this.nextId++,
      kind,
      state: 'lurk',
      target: m.id,
      home: { x: at.x, y: at.y },
      x: at.x,
      y: at.y,
      heading,
      prevX: at.x,
      prevY: at.y,
      prevHeading: heading,
      ticks: 0,
    });
    this.events.push(kind === 'bite' ? 'squeak' : kind);
    return true;
  }

  private moveRats(): void {
    for (const r of this.rats) {
      r.ticks++;
      const target = this.movers.find((m) => m.id === r.target);
      const gone = !target || target.state !== 'track';
      if (r.state === 'lurk') {
        if (gone) this.ratState(r, 'flee');
        else if (r.ticks >= RAT_LURK) this.ratState(r, 'dash');
        continue;
      }
      if (r.state === 'dash') {
        if (gone || target.daze > 0 || r.ticks > RAT_GIVE_UP) {
          this.ratState(r, 'flee');
          continue;
        }
        if (this.ratRun(r, target, (target.width * 5 + 3) * ART)) {
          if (r.kind === 'bite') {
            target.daze = DAZE_TICKS;
            // A bitten person loses any boost.
            target.boosted = false;
            target.speed = target.baseSpeed;
            this.events.push('bite');
          } else {
            target.swerve = SWERVE_TICKS;
            target.haunted = r.kind === 'haunt';
            this.events.push('hit');
          }
          this.ratState(r, 'flee');
        }
        continue;
      }
      if (this.ratRun(r, r.home, 1)) r.ticks = -1;
    }
    this.rats = this.rats.filter((r) => r.ticks >= 0);
  }

  private ratState(r: Rat, state: Rat['state']): void {
    r.state = state;
    r.ticks = 0;
  }

  /** Runs a rat toward a point; returns true once it is within `reach`. */
  private ratRun(r: Rat, to: Point, reach: number): boolean {
    const dx = to.x - r.x;
    const dy = to.y - r.y;
    const d = Math.hypot(dx, dy);
    if (d <= reach) return true;
    const step = Math.min(RAT_SPEED, d - reach + 0.01);
    r.heading = Math.atan2(dy, dx);
    r.x += (dx / d) * step;
    r.y += (dy / d) * step;
    return d - step <= reach;
  }

  /**
   * A sting or a haunting has its victim swerve a lane at random every `SWERVE_EVERY` ticks; a haunted one also
   * speeds up and slows down by turns. Back to its usual self when it wears off.
   */
  private swerveStep(m: Mover): void {
    m.swerve--;
    if (m.swerve === 0) {
      m.haunted = false;
      m.speed = m.baseSpeed * (m.boosted ? BOOST : 1);
      return;
    }
    if (m.swerve % SWERVE_EVERY !== 0) return;
    const options = [m.target - 1, m.target + 1].filter(
      (l) => l >= 0 && l <= this.park.lanes - m.width && this.canChange(m, l),
    );
    if (options.length) m.target = options[Math.floor(this.rng() * options.length)]!;
    if (m.haunted) {
      const turn = Math.floor(m.swerve / SWERVE_EVERY) % 2;
      m.speed = m.baseSpeed * HAUNT_SPEEDS[turn]!;
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Course events.

  /** Starts the course's own event; false if it can't happen just now. */
  private startEvent(): boolean {
    switch (this.course.event) {
      case 'hook':
        return this.castHook();
      case 'tumbleweed':
        return this.rollWeed();
      case 'sting':
        return this.sendRat('sting');
      case 'haunt':
        return this.sendRat('haunt');
      case 'none':
        return false;
    }
  }

  /** The fisherman casts into a lane, somewhere nobody is just about to be. */
  private castHook(): boolean {
    if (this.hooks.length) return false;
    const { track, lanes, half } = this.park;
    const s = this.rng() * track.length;
    const lane = Math.floor(this.rng() * lanes);
    if (underCover(this.park.cover, s, track.length) || onBridge(this.park.bridge, s, track.length))
      return false;
    for (const m of this.movers) {
      if (m.state !== 'track') continue;
      if (
        Math.abs(loopDelta(s, m.s, track.length)) < PICKUP_CLEAR &&
        laneOverlap(m.p, m.width, lane, 1) > 0
      )
        return false;
    }
    const from = pose(track, s, half + 16 * ART);
    const at = pose(track, s, laneOffset(lane, 1, this.park));
    this.hooks.push({
      id: this.nextId++,
      s,
      lane,
      from: { x: from.x, y: from.y },
      x: at.x,
      y: at.y,
      state: 'cast',
      ticks: 0,
    });
    this.events.push('cast');
    return true;
  }

  /**
   * Once it lands, the hook catches whoever one lane wide swims into it, reeling them out with their laps lost but no
   * life. Something wider, or someone with a star, breaks the line; someone invisible goes past.
   */
  private moveHooks(): void {
    const length = this.park.track.length;
    for (const h of this.hooks) {
      h.ticks++;
      if (h.state === 'cast') {
        if (h.ticks >= HOOK_CAST) {
          h.state = 'set';
          h.ticks = 0;
        }
        continue;
      }
      if (h.ticks >= HOOK_TICKS) continue;
      const m = this.movers.find(
        (o) =>
          o.state === 'track' &&
          o.ghost === 0 &&
          Math.abs(loopDelta(h.s, o.s, length)) < (HOOK_LEN + o.len) / 2 &&
          laneOverlap(o.p, o.width, h.lane, 1) > LATERAL_OVERLAP,
      );
      if (!m) continue;
      h.ticks = HOOK_TICKS;
      if (m.width > 1 || m.star > 0 || m.kind === 'carriage' || m.kind === 'group') {
        this.events.push('snap');
        continue;
      }
      this.movers = this.movers.filter((o) => o !== m);
      this.impacts.push({ id: this.nextId++, x: m.x, y: m.y, ticks: 0 });
      this.events.push('reel');
    }
    this.hooks = this.hooks.filter((h) => h.state === 'cast' || h.ticks < HOOK_TICKS);
  }

  /** A tumbleweed blows up at the roadside, inside or out, then rolls across every lane. */
  private rollWeed(): boolean {
    if (this.weeds.length) return false;
    const { track, lanes } = this.park;
    const s = this.rng() * track.length;
    const dir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
    if (underCover(this.park.cover, s, track.length) || onBridge(this.park.bridge, s, track.length))
      return false;
    const q = dir > 0 ? -1.2 : lanes + 0.2;
    const at = pose(track, s, laneOffset(q, 1, this.park));
    this.weeds.push({
      id: this.nextId++,
      s,
      q,
      dir,
      state: 'wait',
      ticks: 0,
      x: at.x,
      y: at.y,
      prevX: at.x,
      prevY: at.y,
    });
    this.events.push('roll');
    return true;
  }

  /** A wave swells up at the bank, inside or out, somewhere in the open. */
  private sendWave(): boolean {
    const { track, lanes } = this.park;
    const s = this.rng() * track.length;
    const dir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
    if (underCover(this.park.cover, s, track.length) || onBridge(this.park.bridge, s, track.length))
      return false;
    this.waves.push({
      id: this.nextId++,
      s,
      q: dir > 0 ? 0 : lanes,
      dir,
      state: 'swell',
      ticks: 0,
      hit: [],
    });
    this.events.push('wave');
    return true;
  }

  /**
   * A rolling wave pushes whoever its front passes one lane the way it is going, once each, unless they are invisible,
   * dazed, the train, or already in the last lane that way.
   */
  private moveWaves(): void {
    const { track, lanes } = this.park;
    for (const w of this.waves) {
      w.ticks++;
      if (w.state === 'swell') {
        if (w.ticks >= WAVE_SWELL) {
          w.state = 'roll';
          w.ticks = 0;
        }
        continue;
      }
      w.q += WAVE_RATE * w.dir;
      for (const m of this.movers) {
        if (m.state !== 'track' || w.hit.includes(m.id)) continue;
        if (Math.abs(loopDelta(w.s, m.s, track.length)) >= (WAVE_LEN * ART + m.len) / 2) continue;
        const middle = m.p + m.width / 2;
        if (w.dir > 0 ? w.q < middle : w.q > middle) continue;
        w.hit.push(m.id);
        if (m.ghost > 0 || m.daze > 0 || this.isTrain(m)) continue;
        const next = m.target + w.dir;
        if (next < 0 || next > lanes - m.width || !this.canChange(m, next)) continue;
        m.target = next;
        this.events.push('shift');
      }
      if (w.q < 0 || w.q > lanes) w.ticks = -1;
    }
    this.waves = this.waves.filter((w) => w.ticks >= 0);
  }

  /** Whoever a rolling tumbleweed touches is stunned by it (no life lost), unless invisible; a star breaks it up. */
  private moveWeeds(): void {
    const { track, lanes } = this.park;
    for (const w of this.weeds) {
      w.prevX = w.x;
      w.prevY = w.y;
      w.ticks++;
      if (w.state === 'wait') {
        if (w.ticks >= RAT_LURK) {
          w.state = 'roll';
          w.ticks = 0;
        }
        continue;
      }
      w.q += TUMBLE_RATE * w.dir;
      const at = pose(track, w.s, laneOffset(w.q, 1, this.park));
      w.x = at.x;
      w.y = at.y;
      const m = this.movers.find(
        (o) =>
          o.state === 'track' &&
          o.ghost === 0 &&
          Math.abs(loopDelta(w.s, o.s, track.length)) <
            ((TUMBLE_LEN + o.len) / 2) * COLLIDE_FACTOR &&
          laneOverlap(o.p, o.width, w.q, 1) > LATERAL_OVERLAP,
      );
      if (m) {
        w.ticks = -1;
        // A star breaks it up, and so does the train.
        if (m.star > 0 || this.isTrain(m)) {
          this.impacts.push({ id: this.nextId++, x: w.x, y: w.y, ticks: 0 });
          this.events.push('knock');
          continue;
        }
        this.stun(m, { x: w.x, y: w.y });
        continue;
      }
      if (w.q < -1.5 || w.q > lanes + 0.5) w.ticks = -1;
    }
    this.weeds = this.weeds.filter((w) => w.ticks >= 0);
  }

  private reset(): void {
    this.score = 0;
    this.laps = 0;
    this.cleanLaps = 0;
    this.movers = [];
    this.rats = [];
    this.pops = [];
    this.crash = null;
    this.lives = LIVES;
    this.pickups = [];
    this.impacts = [];
    this.passing.clear();
    this.paused = false;
    this.warp = 0;
    this.spawnTimer = FIRST_SPAWN;
    this.carriagesSent = 0;
    this.carriageWait = 0;
    this.groupTimer = 0;
    this.ratTimer = 0;
    this.pickupTimer = 0;
    this.predatorTimer = 0;
    this.eventTimer = 0;
    this.waveTimer = 0;
    this.hooks = [];
    this.weeds = [];
    this.waves = [];
    this.playTicks = 0;
    this.warnedPairs.clear();
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseTicks = 0;
  }
}

/** Laps still to go, for the badge; `Infinity` for carriages. */
export const lapsLeft = (m: Mover): number => m.laps - m.lapsDone;
