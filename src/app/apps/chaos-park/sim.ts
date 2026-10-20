import {
  ART,
  BOOST,
  CARS_FROM_SCORE,
  COLLIDE_FACTOR,
  CRASH_TICKS,
  DAZE_TICKS,
  DOUBLE_GAP,
  FIRST_SPAWN,
  IMPACT_TICKS,
  GHOST_TICKS,
  STAR_TICKS,
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
  JOIN_HOLD,
  JOIN_TICKS,
  KIND_SPECS,
  LANES,
  LANE_RATE,
  LANE_W,
  LAPS_PER_EXTRA,
  LATERAL_OVERLAP,
  MAX_MOVERS,
  MAX_MOVERS_START,
  POP_TICKS,
  RAT_FROM_SCORE,
  RAT_GIVE_UP,
  RAT_INTERVAL,
  RAT_LURK,
  RAT_SPEED,
  ROAD_HALF,
  SHOUT_COOLDOWN,
  SHOUT_TICKS,
  SECOND_CARRIAGE_SCORE,
  SHORTCUT_CHANCE,
  SLIP_TICKS,
  SPAWN_INTERVAL,
  SPAWN_INTERVAL_MIN,
  SPAWN_INTERVAL_STEP,
  SPEED_SPREAD,
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
  DEFAULT_FRAME,
  generatePark,
  laneOffset,
  loopDelta,
  pose,
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
  | 'knock';

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
  /** Ticks left of passing through everyone, after taking an invisibility token. */
  ghost: number;
  /** Ticks left of knocking everyone it touches off the loop, after taking a rainbow star. */
  star: number;
}

/**
 * A rat: it waits at the kerb ahead of the person it is after, darts out to bite them, then runs back off the road.
 */
export interface Rat {
  id: number;
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

/** A burst where two movers collided without ending the run. */
export interface Impact {
  id: number;
  x: number;
  y: number;
  ticks: number;
}

/** How many of the park's patches are on the road at a given score. */
export const patchesShown = (score: number): number =>
  PATCH_SCORES.filter((at) => score >= at).length;

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
  /** Points scored: 1, or the size of a run group. */
  value: number;
  /** Set for a pick-up instead of a lap. */
  pickup?: PickupKind;
  x: number;
  y: number;
  ticks: number;
}

/** Movers allowed in the park at once (not counting carriages) at a given score. */
export const maxMovers = (score: number): number =>
  Math.min(MAX_MOVERS, MAX_MOVERS_START + Math.floor(score / LAPS_PER_EXTRA));

/** Ticks a new screen shape has to hold before the park on the title card is remade for it. */
const FRAME_SETTLE = 20;

const sameFrame = (a: ParkFrame, b: ParkFrame): boolean =>
  Math.abs(a.w - b.w) < 2 && Math.abs(a.h - b.h) < 2 && a.hud === b.hud;

/** How fast a mover is actually going: nothing while dazed. */
export const pace = (m: Pick<Mover, 'speed' | 'daze'>): number => (m.daze > 0 ? 0 : m.speed);

/** People a rat goes for, and who a biker shouts at. */
const BITEABLE: ReadonlySet<Kind> = new Set(['walker', 'runner', 'dog']);
const ON_FOOT = BITEABLE;

/** How much of each lane span [p, p + w) overlaps, in lanes. */
export const laneOverlap = (p1: number, w1: number, p2: number, w2: number): number =>
  Math.min(p1 + w1, p2 + w2) - Math.max(p1, p2);

/** Deterministic game state advanced at a fixed tick rate; has no rendering or input knowledge. */
export class ChaosParkSim {
  phase: Phase = 'title';
  paused = false;
  /** Laps completed this run, by everything. */
  score = 0;
  park: Park;
  movers: Mover[] = [];
  rats: Rat[] = [];
  pops: Pop[] = [];
  crash: { x: number; y: number; ids: [number, number] } | null = null;
  /** Lives left this run: a collision takes one, and the run ends when none are left. Hearts add one, up to `MAX_LIVES`. */
  lives = LIVES;
  pickups: Pickup[] = [];
  impacts: Impact[] = [];
  phaseTicks = 0;
  /** Ticks since creation; drives idle animation. */
  clock = 0;
  playTicks = 0;

  private events: SimEvent[] = [];
  private nextId = 1;
  private spawnTimer = FIRST_SPAWN;
  private carriagesSent = 0;
  private groupTimer = 0;
  private ratTimer = 0;
  private pickupTimer = 0;
  /** Pairs already warned about, so the alert sounds once per close call. */
  private warnedPairs = new Set<string>();
  /** Pairs that have collided and are still overlapping as one passes the other; they don't collide again. */
  private passing = new Set<string>();

  /** The shape of screen the next park is made for (see `fitFrame`). */
  frame: ParkFrame = DEFAULT_FRAME;
  /** Ticks the screen has kept its current shape. */
  private frameSteady = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.park = generatePark(rng);
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
    if (this.phase === 'gameOver') this.park = generatePark(this.rng, undefined, this.frame);
    // A park made before the screen's shape was known is remade to fit it, in the same season.
    else if (!sameFrame(this.park.frame, this.frame))
      this.park = generatePark(this.rng, this.park.season, this.frame);
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
    if (this.phase !== 'help') this.park = generatePark(this.rng, undefined, this.frame);
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
      this.park = generatePark(this.rng, this.park.season, this.frame);
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
      const d = Math.hypot(x - m.x - ux * along, y - m.y - uy * along) - (m.width * LANE_W) / 2;
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
    const next = Math.max(0, Math.min(LANES - m.width, m.target + delta));
    // Someone dazed by a rat can't be moved on.
    if (next === m.target || m.daze > 0) {
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
    this.phaseTicks++;
    if (this.phase === 'crashed' && this.phaseTicks >= CRASH_TICKS) this.enter('gameOver');
    if (this.phase !== 'playing') return;
    this.playTicks++;
    this.spawn();
    const gone = new Set<Mover>();
    for (const m of this.movers) {
      m.age++;
      if (m.slip > 0) m.slip--;
      if (m.shout > 0) m.shout--;
      if (m.ghost > 0) m.ghost--;
      if (m.star > 0) m.star--;
      if (m.state === 'track') this.moveOnTrack(m);
      else if (this.moveOnRoute(m)) gone.add(m);
    }
    if (gone.size) this.movers = this.movers.filter((m) => !gone.has(m));
    this.moveRats();
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
      // Standing still, seeing stars.
      m.daze--;
      return;
    }
    const from = m.s;
    const delta = m.speed * m.dir;
    m.s = wrap(m.s + delta, track.length);
    if (m.p !== m.target) m.p += Math.max(-LANE_RATE, Math.min(LANE_RATE, m.target - m.p));
    m.progress += m.speed;
    this.countLaps(m);
    this.checkPatches(m);
    this.place(m);

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
    const holdAt = end - JOIN_HOLD;
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
    const at = pose(this.park.track, m.s, laneOffset(m.p, m.width));
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
    const end = pose(track, to, laneOffset(0, 1));
    m.state = 'shortcut';
    m.skip = wrap(to - m.s, track.length);
    this.setRoute(m, [{ x: m.x, y: m.y }, ...path, { x: end.x, y: end.y }], { s: to, p: 0 });
  }

  private leave(m: Mover, e: Entrance): void {
    m.state = 'leaving';
    m.warning = false;
    this.setRoute(m, [{ x: m.x, y: m.y }, e.throat, e.gate, e.street], null);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Laps, patches and collisions.

  private countLaps(m: Mover): void {
    const length = this.park.track.length;
    while (!m.done && m.progress >= (m.lapsDone + 1) * length - 1e-6) {
      m.lapsDone++;
      this.score += m.crowd;
      this.events.push('lap');
      this.pops.push({ id: this.nextId++, value: m.crowd, x: m.x, y: m.y, ticks: 0 });
      if (m.lapsDone >= m.laps) m.done = true;
    }
  }

  private checkPatches(m: Mover): void {
    const { patches, track } = this.park;
    for (const patch of patches.slice(0, patchesShown(this.score))) {
      const over =
        Math.abs(loopDelta(patch.s, m.s, track.length)) < (patch.len + m.len) / 2 - 4 * ART &&
        laneOverlap(m.p, m.width, patch.lane, patch.width) > 0.3;
      if (!over) {
        m.onPatch.delete(patch.id);
        continue;
      }
      if (m.onPatch.has(patch.id)) continue;
      m.onPatch.add(patch.id);
      const options = [m.target - 1, m.target + 1].filter((l) => l >= 0 && l <= LANES - m.width);
      m.target = options[Math.floor(this.rng() * options.length)]!;
      m.slip = SLIP_TICKS;
      this.events.push('slip');
    }
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
    this.lives--;
    const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (this.lives <= 0) {
      this.crash = { ...at, ids: [a.id, b.id] };
      this.events.push('crash');
      this.enter('crashed');
      return true;
    }
    // The one moving into the other did the hitting: a lane change into someone alongside, otherwise whichever is
    // heading toward the other faster.
    const turning = (m: Mover) => Math.abs(m.p - m.target) > 1e-6;
    const towards = (m: Mover, sign: number) => pace(m) * m.dir * sign;
    const aHits =
      turning(a) !== turning(b)
        ? turning(a)
        : towards(a, Math.sign(delta)) >= towards(b, -Math.sign(delta));
    const victim = aHits ? b : a;
    victim.daze = Math.max(victim.daze, STUN_TICKS);
    victim.boosted = false;
    victim.speed = victim.baseSpeed;
    this.passing.add(`${a.id}:${b.id}`);
    this.impacts.push({ id: this.nextId++, ...at, ticks: 0 });
    this.events.push('hit');
    return false;
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
        // A star knocks whoever it touches off the loop, for the laps they had left, except a carriage (too big to
        // shift) or another star, which it passes through.
        if (a.star > 0 || b.star > 0) {
          const victim = a.star > 0 ? b : a;
          if (touching) {
            if (victim.star > 0 || victim.kind === 'carriage') this.passing.add(pair);
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
    for (const m of knocked) this.knockOff(m);
  }

  /** A star sends someone flying off the loop: they're gone, and their remaining laps score at once. */
  private knockOff(m: Mover): void {
    const value = Math.max(1, m.laps - m.lapsDone) * m.crowd;
    this.score += value;
    this.movers = this.movers.filter((o) => o !== m);
    this.impacts.push({ id: this.nextId++, x: m.x, y: m.y, ticks: 0 });
    this.pops.push({ id: this.nextId++, value, x: m.x, y: m.y, ticks: 0 });
    this.events.push('knock');
  }

  // -------------------------------------------------------------------------------------------------------------
  // Arrivals.

  private spawn(): void {
    this.spawnSpecials();
    const active = this.movers.filter((m) => m.kind !== 'carriage' && m.state !== 'leaving').length;
    if (this.carriagesSent < 2 && this.score >= SECOND_CARRIAGE_SCORE && this.arrive('carriage'))
      this.carriagesSent++;
    if (active === 0) this.spawnTimer = Math.min(this.spawnTimer, 30);
    if (--this.spawnTimer > 0) return;
    if (active >= maxMovers(this.score)) {
      this.spawnTimer = 30;
      return;
    }
    const base = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL - this.score * SPAWN_INTERVAL_STEP);
    this.spawnTimer = Math.round(base * (0.75 + this.rng() * 0.5));
    if (!this.arrive(this.pickKind())) this.spawnTimer = 20;
  }

  /** The rare ones: run groups and rats, each on its own long timer once the score is high enough. */
  private spawnSpecials(): void {
    const between = ([lo, hi]: readonly [number, number]) =>
      Math.round(lo + this.rng() * (hi - lo));
    // A group comes GROUP_INTERVAL after the score reaches GROUP_FROM_SCORE, and again that long after each one
    // has gone, so there is never more than one.
    if (this.score >= GROUP_FROM_SCORE) {
      if (this.movers.some((m) => m.kind === 'group')) this.groupTimer = 0;
      else if (this.groupTimer <= 0) this.groupTimer = between(GROUP_INTERVAL);
      // Every gate busy: try again in a moment.
      else if (--this.groupTimer <= 0 && !this.arrive('group')) this.groupTimer = 10;
    }
    if (this.score >= RAT_FROM_SCORE) {
      if (this.ratTimer <= 0) this.ratTimer = between(RAT_INTERVAL) / 2;
      else if (--this.ratTimer <= 0) this.ratTimer = this.sendRat() ? between(RAT_INTERVAL) : 120;
    }
    // One pick-up at a time: the next is timed from when the last one went.
    if (this.score >= PICKUP_FROM_SCORE && !this.pickups.length) {
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
    const kinds: PickupKind[] = ['heart', 'double', 'ghost', 'star'];
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
    const lane = Math.floor(this.rng() * LANES);
    for (const m of this.movers) {
      if (m.state !== 'track') continue;
      if (Math.abs(loopDelta(s, m.s, track.length)) < PICKUP_CLEAR && laneOverlap(m.p, m.width, lane, 1) > 0)
        return false;
    }
    const at = pose(track, s, laneOffset(lane, 1));
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
          m.kind !== 'carriage' &&
          m.kind !== 'group' &&
          Math.abs(loopDelta(p.s, m.s, length)) < (PICKUP_LEN + m.len) / 2 &&
          laneOverlap(m.p, m.width, p.lane, 1) > LATERAL_OVERLAP,
      );
      if (!taker) continue;
      p.ticks = PICKUP_TICKS;
      if (p.kind === 'heart') this.lives = Math.min(MAX_LIVES, this.lives + 1);
      else if (p.kind === 'double') this.duplicate(taker);
      else if (p.kind === 'ghost') taker.ghost = GHOST_TICKS;
      else taker.star = STAR_TICKS;
      this.events.push(p.kind === 'heart' ? 'life' : p.kind);
      this.pops.push({ id: this.nextId++, value: 0, pickup: p.kind, x: taker.x, y: taker.y, ticks: 0 });
    }
    this.pickups = this.pickups.filter((p) => p.ticks < PICKUP_TICKS);
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
    const kinds: Kind[] = ['walker', 'dog', 'runner', 'biker', 'car'];
    // One car in the park at a time, from the moment it turns in at the gate until it has driven out.
    const carIn = this.movers.some((m) => m.kind === 'car');
    const weight = (k: Kind): number =>
      k !== 'car'
        ? KIND_SPECS[k].weight
        : this.score < CARS_FROM_SCORE || carIn
          ? 0
          : KIND_SPECS.car.weight + Math.min(0.05, (this.score - CARS_FROM_SCORE) * 0.002);
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
      WRONG_WAY_CHANCE + (this.score - WRONG_WAY_FROM_SCORE) * 0.003,
    );
    if (
      (kind === 'walker' || kind === 'runner') &&
      this.score >= WRONG_WAY_FROM_SCORE &&
      this.rng() < wrongWayChance
    )
      m.dir = -1;
    m.entrance = e.id;
    m.state = 'arriving';
    m.alpha = 0;
    const p = LANES - m.width;
    const merge = pose(track, e.s, laneOffset(p, m.width));
    this.setRoute(m, [e.street, e.gate, e.throat, { x: merge.x, y: merge.y }], { s: e.s, p });
    m.x = m.prevX = e.street.x;
    m.y = m.prevY = e.street.y;
    m.heading = m.prevHeading = Math.atan2(e.gate.y - e.street.y, e.gate.x - e.street.x);
    this.movers.push(m);
    return true;
  }

  /** The first carriage starts out already on the loop. */
  private placeCarriage(): void {
    const m = this.create('carriage');
    m.state = 'track';
    m.s = this.rng() * this.park.track.length;
    m.p = m.target = this.rng() < 0.5 ? 0 : LANES - 2;
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
    return {
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
    };
  }

  // -------------------------------------------------------------------------------------------------------------
  // Rats.

  /** Sets a rat waiting at the kerb ahead of someone to bite; returns false if nobody suitable is about. */
  private sendRat(): boolean {
    if (this.rats.length) return false;
    const { track } = this.park;
    const lead = RAT_LURK + 30;
    const people = this.movers.filter(
      (m) => m.state === 'track' && BITEABLE.has(m.kind) && m.daze === 0 && !m.done,
    );
    if (!people.length) return false;
    const m = people[Math.floor(this.rng() * people.length)]!;
    // Waits on whichever side of the road is nearer the person, where they will be when it darts out.
    const side = m.p + m.width / 2 <= LANES / 2 ? -1 : 1;
    const at = pose(track, m.s + m.dir * m.speed * lead, side * (ROAD_HALF + 9 * ART));
    const heading = at.angle + (side < 0 ? Math.PI / 2 : -Math.PI / 2);
    this.rats.push({
      id: this.nextId++,
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
    this.events.push('squeak');
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
          target.daze = DAZE_TICKS;
          // A bitten person loses any boost.
          target.boosted = false;
          target.speed = target.baseSpeed;
          this.events.push('bite');
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

  private reset(): void {
    this.score = 0;
    this.movers = [];
    this.rats = [];
    this.pops = [];
    this.crash = null;
    this.lives = LIVES;
    this.pickups = [];
    this.impacts = [];
    this.passing.clear();
    this.paused = false;
    this.spawnTimer = FIRST_SPAWN;
    this.carriagesSent = 0;
    this.groupTimer = 0;
    this.ratTimer = 0;
    this.pickupTimer = 0;
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
