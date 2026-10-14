import {
  CARS_FROM_SCORE,
  COLLIDE_FACTOR,
  CRASH_TICKS,
  FIRST_SPAWN,
  GAME_OVER_LOCKOUT,
  GRAB_RADIUS,
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
  type Kind,
} from './constants';
import {
  generatePark,
  laneOffset,
  loopDelta,
  pose,
  wrap,
  type Entrance,
  type Park,
  type Point,
  type Shortcut,
} from './park';

export type Phase = 'title' | 'help' | 'playing' | 'crashed' | 'gameOver';
export type SimEvent = 'lap' | 'alert' | 'crash' | 'slip' | 'shift' | 'bump';

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
  speed: number;
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
  /** Ticks left of an ice wobble. */
  slip: number;
  /** Ticks since it appeared; drives walking and pedalling. */
  age: number;
  /** Fixed random numbers for its colours. */
  look: [number, number, number];
  /** Ice patches it is on, so each crossing only slides it once. */
  onIce: Set<number>;
}

/** The "+1" that floats up where a lap is completed. */
export interface Pop {
  id: number;
  x: number;
  y: number;
  ticks: number;
}

/** Movers allowed in the park at once (not counting carriages) at a given score. */
export const maxMovers = (score: number): number =>
  Math.min(MAX_MOVERS, MAX_MOVERS_START + Math.floor(score / LAPS_PER_EXTRA));

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
  pops: Pop[] = [];
  crash: { x: number; y: number; ids: [number, number] } | null = null;
  phaseTicks = 0;
  /** Ticks since creation; drives idle animation. */
  clock = 0;
  playTicks = 0;

  private events: SimEvent[] = [];
  private nextId = 1;
  private spawnTimer = FIRST_SPAWN;
  private carriagesSent = 0;
  /** Pairs already warned about, so the alert sounds once per close call. */
  private warnedPairs = new Set<string>();

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
    if (this.phase === 'gameOver') this.park = generatePark(this.rng);
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
    if (this.phase !== 'help') this.park = generatePark(this.rng);
    this.reset();
    this.enter('title');
    return true;
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
    if (next === m.target) {
      this.events.push('bump');
      return false;
    }
    m.target = next;
    this.events.push('shift');
    return true;
  }

  step(): void {
    for (const m of this.movers) {
      m.prevX = m.x;
      m.prevY = m.y;
      m.prevHeading = m.heading;
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
      if (m.state === 'track') this.moveOnTrack(m);
      else if (this.moveOnRoute(m)) gone.add(m);
    }
    if (gone.size) this.movers = this.movers.filter((m) => !gone.has(m));
    for (const p of this.pops) p.ticks++;
    this.pops = this.pops.filter((p) => p.ticks < POP_TICKS);
    this.checkTraffic();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Moving.

  private moveOnTrack(m: Mover): void {
    const { track, entrances, shortcuts } = this.park;
    const from = m.s;
    const delta = m.speed * m.dir;
    m.s = wrap(m.s + delta, track.length);
    if (m.p !== m.target) m.p += Math.max(-LANE_RATE, Math.min(LANE_RATE, m.target - m.p));
    m.progress += m.speed;
    this.countLaps(m);
    this.checkIce(m);
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
  // Laps, ice and collisions.

  private countLaps(m: Mover): void {
    const length = this.park.track.length;
    while (!m.done && m.progress >= (m.lapsDone + 1) * length - 1e-6) {
      m.lapsDone++;
      this.score++;
      this.events.push('lap');
      this.pops.push({ id: this.nextId++, x: m.x, y: m.y, ticks: 0 });
      if (m.lapsDone >= m.laps) m.done = true;
    }
  }

  private checkIce(m: Mover): void {
    const { ice, track } = this.park;
    for (const patch of ice) {
      const over =
        Math.abs(loopDelta(patch.s, m.s, track.length)) < (patch.len + m.len) / 2 - 4 &&
        laneOverlap(m.p, m.width, patch.lane, patch.width) > 0.3;
      if (!over) {
        m.onIce.delete(patch.id);
        continue;
      }
      if (m.onIce.has(patch.id)) continue;
      m.onIce.add(patch.id);
      const options = [m.target - 1, m.target + 1].filter((l) => l >= 0 && l <= LANES - m.width);
      m.target = options[Math.floor(this.rng() * options.length)]!;
      m.slip = SLIP_TICKS;
      this.events.push('slip');
    }
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
      const clearance = (o.len + m.len) / 2 + 10;
      // How far it has to go to reach the joining spot, and how far past it it already is.
      const toReach = wrap((s - o.s) * o.dir, length);
      if (toReach < o.speed * JOIN_TICKS + clearance) return false;
      if (length - toReach < clearance) return false;
      if (o.dir === m.dir) {
        // Something slower just ahead would soon be caught.
        const ahead = wrap((o.s - s) * m.dir, length);
        if (ahead < clearance + Math.max(0, m.speed - o.speed) * JOIN_TICKS) return false;
      }
    }
    return true;
  }

  /** Crash if two movers on the loop touch; otherwise flag the ones about to. */
  private checkTraffic(): void {
    const live = this.movers.filter((m) => m.state === 'track');
    const length = this.park.track.length;
    for (const m of live) m.warning = false;
    const pairs = new Set<string>();
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!;
        const b = live[j]!;
        const delta = loopDelta(a.s, b.s, length);
        const dist = Math.abs(delta);
        const half = (a.len + b.len) / 2;
        if (dist > half + WARN_MAX_GAP) continue;
        if (
          laneOverlap(a.p, a.width, b.p, b.width) > LATERAL_OVERLAP &&
          dist < half * COLLIDE_FACTOR
        ) {
          this.crash = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ids: [a.id, b.id] };
          this.events.push('crash');
          this.enter('crashed');
          return;
        }
        // Warn on where they are heading as well as where they are.
        const aLo = Math.min(a.p, a.target);
        const bLo = Math.min(b.p, b.target);
        const aW = Math.max(a.p, a.target) + a.width - aLo;
        const bW = Math.max(b.p, b.target) + b.width - bLo;
        if (laneOverlap(aLo, aW, bLo, bW) <= 0.1) continue;
        const gap = dist - half;
        const closing = -Math.sign(delta) * (b.speed * b.dir - a.speed * a.dir);
        if (gap < 6 || (closing > 0 && gap / closing < WARN_TICKS)) {
          a.warning = b.warning = true;
          const key = `${a.id}:${b.id}`;
          pairs.add(key);
          if (!this.warnedPairs.has(key)) this.events.push('alert');
        }
      }
    }
    this.warnedPairs = pairs;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Arrivals.

  private spawn(): void {
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

  private pickKind(): Kind {
    const kinds: Kind[] = ['walker', 'dog', 'runner', 'biker', 'car'];
    const weight = (k: Kind): number =>
      k !== 'car'
        ? KIND_SPECS[k].weight
        : this.score < CARS_FROM_SCORE
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
    const m = this.create(kind);
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

  private create(kind: Kind): Mover {
    const spec = KIND_SPECS[kind];
    const [lo, hi] = spec.laps;
    // Fewer laps are more likely than many.
    const laps = Number.isFinite(lo)
      ? lo + Math.floor(this.rng() ** 1.6 * (hi - lo + 1))
      : Infinity;
    return {
      id: this.nextId++,
      kind,
      width: spec.width,
      len: spec.len,
      speed: spec.speed * (1 + (this.rng() * 2 - 1) * SPEED_SPREAD),
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
      onIce: new Set(),
    };
  }

  private reset(): void {
    this.score = 0;
    this.movers = [];
    this.pops = [];
    this.crash = null;
    this.paused = false;
    this.spawnTimer = FIRST_SPAWN;
    this.carriagesSent = 0;
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
