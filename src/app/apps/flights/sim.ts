import { captureZone, generateAirfield, runwayEnd, type Airfield, type Zone } from './airfield';
import {
  COLLIDE_FACTOR,
  CRASH_TICKS,
  EDGE_MARGIN,
  EDGE_TURN,
  FAST_FROM_SCORE,
  FAST_MAX_CHANCE,
  FAST_RADIUS,
  FAST_SPEED,
  FIRST_SPAWN,
  GAME_OVER_LOCKOUT,
  GRAB_RADIUS,
  HEIGHT,
  HELI_LAND_TICKS,
  KINDS,
  KIND_SPECS,
  LANDINGS_PER_EXTRA,
  LAND_TICKS,
  LOCK_FLASH_TICKS,
  MAX_AIRCRAFT,
  MAX_AIRCRAFT_START,
  PATH_MAX,
  PATH_STEP,
  PRAISE_TICKS,
  SPAWN_INTERVAL,
  SPAWN_INTERVAL_MIN,
  SPAWN_INTERVAL_STEP,
  SPAWN_OUTSIDE,
  SPAWN_WARNING,
  STREAK_TICKS,
  WARN_GAP,
  WIDTH,
  type Bounds,
  type Kind,
} from './constants';
import { angleDiff, type Point } from './geometry';

export type Phase = 'title' | 'help' | 'playing' | 'crashed' | 'gameOver';
export type SimEvent = 'land' | 'alert' | 'crash' | 'lock' | 'pick';

export interface Aircraft {
  id: number;
  kind: Kind;
  fast: boolean;
  radius: number;
  speed: number;
  x: number;
  y: number;
  /** Direction of travel, radians. */
  heading: number;
  /** State before the latest tick, for render interpolation. */
  prevX: number;
  prevY: number;
  prevHeading: number;
  state: 'flying' | 'landing';
  /** Set once it is wholly on the field; until then it flies straight in rather than bouncing off the edge. */
  entered: boolean;
  /** Waypoints still to fly through. */
  path: Point[];
  /** Where the path touches down, once it has been drawn onto a zone of the right kind. */
  target: { zone: Zone; at: Point } | null;
  /** Ticks since touchdown. */
  landTicks: number;
  /** Where it touched down and how far it rolls from there. */
  landFrom: Point;
  landRoll: number;
  /** Too close to another aircraft. */
  warning: boolean;
  /** Ticks since it appeared; drives propeller and rotor animation. */
  age: number;
}

/** An aircraft about to arrive, shown as a marker on the edge where it will appear. */
export interface Arrival {
  /** Where the marker is drawn, just inside the edge. */
  x: number;
  y: number;
  kind: Kind;
  fast: boolean;
  heading: number;
  /** Ticks until it appears. */
  ticks: number;
}

/** The flash where a path snapped onto a landing zone. */
export interface LockFlash {
  id: number;
  kind: Kind;
  zone: Zone;
  /** Where the path met the zone. */
  x: number;
  y: number;
  ticks: number;
}

export interface Praise {
  id: number;
  text: string;
  x: number;
  y: number;
  ticks: number;
}

const PRAISES = ['NICE', 'JOLLY GOOD', 'SPLENDID', 'PERFECT', 'MARVELLOUS'];

/** The praise for the `n`th landing in a row, from the second on. */
export const praiseFor = (streak: number): string =>
  PRAISES[Math.min(streak - 2, PRAISES.length - 1)]!;

/** Most aircraft allowed in the air, counting arrivals on their way, at a given score. */
export const maxAircraft = (score: number): number =>
  Math.min(MAX_AIRCRAFT, MAX_AIRCRAFT_START + Math.floor(score / LANDINGS_PER_EXTRA));

/** The middle of the field, where arriving aircraft aim. */
const AIM = { x: WIDTH * 0.25, y: HEIGHT * 0.25, w: WIDTH * 0.5, h: HEIGHT * 0.5 };
/** Arrivals keep at least this far from other aircraft and arrivals. */
const ARRIVAL_SPACING = 170;
/** How far along each edge from the corners arrivals keep. */
const CORNER_X = 130;
const CORNER_Y = 80;

/** Deterministic game state advanced at a fixed tick rate; has no rendering or input knowledge. */
export class FlightsSim {
  phase: Phase = 'title';
  paused = false;
  /** Fast-forward: two ticks of play per tick. */
  fast = false;
  score = 0;
  field: Airfield;
  aircraft: Aircraft[] = [];
  arrivals: Arrival[] = [];
  praise: Praise[] = [];
  locks: LockFlash[] = [];
  /** Where the collision happened and which aircraft were involved. */
  crash: { x: number; y: number; ids: [number, number] } | null = null;
  /** The aircraft whose path is being drawn. */
  drawing: number | null = null;
  phaseTicks = 0;
  /** Ticks since creation; drives idle animation. */
  clock = 0;
  /** Ticks of play, so fast-forward counts double. */
  playTicks = 0;
  /**
   * The field on screen. It always contains the 960 x 640 area the airfield is laid out in, and reaches past it
   * when the window is wider or taller; aircraft arrive from and turn back at its edges.
   */
  bounds: Bounds = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT };

  private events: SimEvent[] = [];
  private nextId = 1;
  private spawnTimer = FIRST_SPAWN;
  private streak = 0;
  private lastLanding = -Infinity;
  /** Pairs already warned about, so the alert sounds once per close call. */
  private warnedPairs = new Set<string>();

  constructor(private readonly rng: () => number = Math.random) {
    this.field = generateAirfield(rng);
  }

  drainEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Starts a run on a freshly generated airfield. */
  start(): void {
    if (this.phase === 'gameOver' && this.phaseTicks < GAME_OVER_LOCKOUT) return;
    if (this.phase !== 'title' && this.phase !== 'gameOver' && this.phase !== 'help') return;
    // The title screen shows the airfield the run will use; a retry gets a new one.
    if (this.phase === 'gameOver') this.field = generateAirfield(this.rng);
    this.reset();
    this.enter('playing');
  }

  showHelp(): void {
    if (this.phase === 'title') this.enter('help');
  }

  /** Back to the title, with a new airfield behind it. */
  toTitle(): boolean {
    if (this.phase === 'gameOver' && this.phaseTicks < GAME_OVER_LOCKOUT) return false;
    if (this.phase === 'title') return false;
    if (this.phase !== 'help') this.field = generateAirfield(this.rng);
    this.reset();
    this.enter('title');
    return true;
  }

  setPaused(paused: boolean): void {
    if (this.phase !== 'playing') return;
    this.paused = paused;
    if (paused) this.drawing = null;
  }

  toggleFast(): void {
    if (this.phase === 'playing') this.fast = !this.fast;
  }

  /** Grabs the aircraft nearest a press, to draw a new path for it. Returns whether one was in reach. */
  beginPath(x: number, y: number): boolean {
    if (this.phase !== 'playing' || this.paused) return false;
    let best: Aircraft | null = null;
    let bestDist = Infinity;
    for (const a of this.aircraft) {
      if (a.state !== 'flying') continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < Math.max(GRAB_RADIUS, a.radius + 14) && d < bestDist) {
        best = a;
        bestDist = d;
      }
    }
    if (!best) return false;
    best.path = [];
    best.target = null;
    this.drawing = best.id;
    this.events.push('pick');
    return true;
  }

  /** Continues the path being drawn through a pointer position. */
  extendPath(x: number, y: number): void {
    const a = this.drawingAircraft();
    if (!a || a.target) return;
    const b = this.bounds;
    x = Math.max(b.left + 4, Math.min(b.right - 4, x));
    y = Math.max(b.top + 4, Math.min(b.bottom - 4, y));
    let last: Point = a.path[a.path.length - 1] ?? a;
    let gap = Math.hypot(x - last.x, y - last.y);
    // Long pointer moves are split, so the path stays evenly spaced and the zone test sees every stretch.
    while (gap >= PATH_STEP && a.path.length < PATH_MAX) {
      const t = PATH_STEP / gap;
      const p = { x: last.x + (x - last.x) * t, y: last.y + (y - last.y) * t };
      a.path.push(p);
      const hit = captureZone(this.field, a.kind, p, p.x - last.x, p.y - last.y);
      if (hit) {
        a.path.push(hit.at);
        a.target = hit;
        this.drawing = null;
        this.events.push('lock');
        this.locks.push({
          id: this.nextId++,
          kind: a.kind,
          zone: hit.zone,
          x: p.x,
          y: p.y,
          ticks: 0,
        });
        return;
      }
      last = p;
      gap = Math.hypot(x - last.x, y - last.y);
    }
  }

  endPath(): void {
    this.drawing = null;
  }

  /** Remaining runway after the touchdown point, along which a landing aircraft rolls. */
  private rollFor(a: Aircraft): number {
    const zone = a.target?.zone;
    if (!zone || zone.type !== 'runway') return 0;
    const end = runwayEnd(zone);
    const left = Math.hypot(end.x - a.x, end.y - a.y);
    return Math.max(0, Math.min(left - zone.width * 0.4, a.speed * LAND_TICKS * 0.75));
  }

  step(): void {
    for (const a of this.aircraft) {
      a.prevX = a.x;
      a.prevY = a.y;
      a.prevHeading = a.heading;
    }
    if (this.paused) return;
    this.clock++;
    this.phaseTicks++;
    if (this.phase === 'crashed' && this.phaseTicks >= CRASH_TICKS) this.enter('gameOver');
    if (this.phase !== 'playing') return;
    this.advance();
    if (this.fast && this.phase === 'playing') this.advance();
  }

  private advance(): void {
    this.playTicks++;
    this.spawn();
    for (const a of this.aircraft) {
      a.age++;
      if (a.state === 'landing') this.stepLanding(a);
      else this.fly(a);
    }
    this.aircraft = this.aircraft.filter(
      (a) => a.state !== 'landing' || a.landTicks < landTicks(a),
    );
    for (const l of this.locks) l.ticks++;
    this.locks = this.locks.filter((l) => l.ticks < LOCK_FLASH_TICKS);
    for (const p of this.praise) p.ticks++;
    this.praise = this.praise.filter((p) => p.ticks < PRAISE_TICKS);
    this.checkTraffic();
  }

  private fly(a: Aircraft): void {
    let budget = a.speed;
    while (budget > 0 && a.path.length > 0) {
      const p = a.path[0]!;
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      if (d > 0.01) a.heading = Math.atan2(p.y - a.y, p.x - a.x);
      if (d <= budget) {
        a.x = p.x;
        a.y = p.y;
        budget -= d;
        a.path.shift();
      } else {
        a.x += Math.cos(a.heading) * budget;
        a.y += Math.sin(a.heading) * budget;
        budget = 0;
      }
    }
    if (a.path.length === 0 && a.target && this.drawing !== a.id) {
      this.touchDown(a);
      return;
    }
    if (budget > 0) {
      if (a.entered) this.turnAtEdge(a);
      a.x += Math.cos(a.heading) * budget;
      a.y += Math.sin(a.heading) * budget;
    }
    const r = a.radius;
    const b = this.bounds;
    if (
      !a.entered &&
      a.x > b.left + r &&
      a.x < b.right - r &&
      a.y > b.top + r &&
      a.y < b.bottom - r
    ) {
      a.entered = true;
    }
  }

  /** Steers back in when heading off the field, turning steadily so it reads as a banked turn. */
  private turnAtEdge(a: Aircraft): void {
    let vx = Math.cos(a.heading);
    let vy = Math.sin(a.heading);
    const b = this.bounds;
    const outX = (a.x < b.left + EDGE_MARGIN && vx < 0) || (a.x > b.right - EDGE_MARGIN && vx > 0);
    const outY = (a.y < b.top + EDGE_MARGIN && vy < 0) || (a.y > b.bottom - EDGE_MARGIN && vy > 0);
    if (!outX && !outY) return;
    if (outX) vx = -vx;
    if (outY) vy = -vy;
    const diff = angleDiff(a.heading, Math.atan2(vy, vx));
    a.heading += Math.sign(diff) * Math.min(Math.abs(diff), EDGE_TURN);
  }

  private touchDown(a: Aircraft): void {
    a.state = 'landing';
    a.landTicks = 0;
    a.landFrom = { x: a.x, y: a.y };
    a.landRoll = this.rollFor(a);
    a.warning = false;
    if (this.drawing === a.id) this.drawing = null;
    this.score++;
    this.events.push('land');

    this.streak = this.playTicks - this.lastLanding <= STREAK_TICKS ? this.streak + 1 : 1;
    this.lastLanding = this.playTicks;
    if (this.streak >= 2) {
      const zone = a.target!.zone;
      this.praise.push({
        id: this.nextId++,
        text: praiseFor(this.streak),
        x: zone.x,
        y: zone.y,
        ticks: 0,
      });
    }
  }

  private stepLanding(a: Aircraft): void {
    a.landTicks++;
    const zone = a.target!.zone;
    if (zone.type === 'runway') {
      const t = Math.min(1, a.landTicks / LAND_TICKS);
      // Rolls out quickly, then slows to a stop.
      const s = 1 - (1 - t) ** 2;
      a.x = a.landFrom.x + Math.cos(zone.angle) * a.landRoll * s;
      a.y = a.landFrom.y + Math.sin(zone.angle) * a.landRoll * s;
      a.heading += angleDiff(a.heading, zone.angle) * 0.18;
    }
  }

  /** Crash if any two airborne aircraft touch; otherwise flag the ones getting too close. */
  private checkTraffic(): void {
    const flying = this.aircraft.filter((a) => a.state === 'flying');
    for (const a of flying) a.warning = false;
    const pairs = new Set<string>();
    for (let i = 0; i < flying.length; i++) {
      for (let j = i + 1; j < flying.length; j++) {
        const a = flying[i]!;
        const b = flying[j]!;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < (a.radius + b.radius) * COLLIDE_FACTOR) {
          this.crash = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ids: [a.id, b.id] };
          this.drawing = null;
          this.fast = false;
          this.events.push('crash');
          this.enter('crashed');
          return;
        }
        if (d < a.radius + b.radius + WARN_GAP) {
          a.warning = b.warning = true;
          const key = `${a.id}:${b.id}`;
          pairs.add(key);
          if (!this.warnedPairs.has(key)) this.events.push('alert');
        }
      }
    }
    this.warnedPairs = pairs;
  }

  private spawn(): void {
    for (const arrival of this.arrivals) arrival.ticks--;
    for (const arrival of this.arrivals.filter((a) => a.ticks <= 0)) this.launch(arrival);
    this.arrivals = this.arrivals.filter((a) => a.ticks > 0);

    const airborne = this.aircraft.filter((a) => a.state === 'flying').length;
    // An empty sky shouldn't stay empty for long.
    if (airborne === 0 && this.arrivals.length === 0)
      this.spawnTimer = Math.min(this.spawnTimer, 40);
    if (--this.spawnTimer > 0) return;
    if (airborne + this.arrivals.length >= maxAircraft(this.score)) {
      this.spawnTimer = 30;
      return;
    }
    const base = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL - this.score * SPAWN_INTERVAL_STEP);
    this.spawnTimer = Math.round(base * (0.75 + this.rng() * 0.5));
    const arrival = this.planArrival();
    if (arrival) this.arrivals.push(arrival);
  }

  private planArrival(): Arrival | null {
    const kind = this.pickKind();
    const fastChance =
      this.score < FAST_FROM_SCORE
        ? 0
        : Math.min(FAST_MAX_CHANCE, (this.score - FAST_FROM_SCORE + 1) * 0.012);
    const fast = this.rng() < fastChance;
    for (let tries = 0; tries < 12; tries++) {
      // A point on the edge, weighted by edge length, out of the corners where the HUD and buttons sit.
      const b = this.bounds;
      const across = b.right - b.left - CORNER_X * 2;
      const down = b.bottom - b.top - CORNER_Y * 2;
      const edge = this.rng() * (across + down) * 2;
      let x: number;
      let y: number;
      if (edge < across) [x, y] = [b.left + CORNER_X + edge, b.top];
      else if (edge < across * 2) [x, y] = [b.left + CORNER_X + edge - across, b.bottom];
      else if (edge < across * 2 + down) [x, y] = [b.left, b.top + CORNER_Y + edge - across * 2];
      else [x, y] = [b.right, b.top + CORNER_Y + edge - across * 2 - down];
      const crowded =
        this.aircraft.some((a) => Math.hypot(a.x - x, a.y - y) < ARRIVAL_SPACING) ||
        this.arrivals.some((a) => Math.hypot(a.x - x, a.y - y) < ARRIVAL_SPACING);
      if (crowded) continue;
      const aimX = AIM.x + this.rng() * AIM.w;
      const aimY = AIM.y + this.rng() * AIM.h;
      const heading = Math.atan2(aimY - y, aimX - x);
      const inset = 26;
      return {
        x: Math.max(b.left + inset, Math.min(b.right - inset, x)),
        y: Math.max(b.top + inset, Math.min(b.bottom - inset, y)),
        kind,
        fast,
        heading,
        ticks: SPAWN_WARNING,
      };
    }
    return null;
  }

  private pickKind(): Kind {
    const total = KINDS.reduce((sum, k) => sum + KIND_SPECS[k].weight, 0);
    let r = this.rng() * total;
    for (const k of KINDS) {
      r -= KIND_SPECS[k].weight;
      if (r < 0) return k;
    }
    return KINDS[KINDS.length - 1]!;
  }

  private launch(arrival: Arrival): void {
    const spec = KIND_SPECS[arrival.kind];
    // Starts out of sight behind its marker, on the line it flies in along.
    const b = this.bounds;
    const edgeX = arrival.x < b.left + 30 ? b.left : arrival.x > b.right - 30 ? b.right : arrival.x;
    const edgeY = arrival.y < b.top + 30 ? b.top : arrival.y > b.bottom - 30 ? b.bottom : arrival.y;
    const x = edgeX - Math.cos(arrival.heading) * SPAWN_OUTSIDE;
    const y = edgeY - Math.sin(arrival.heading) * SPAWN_OUTSIDE;
    this.aircraft.push({
      id: this.nextId++,
      kind: arrival.kind,
      fast: arrival.fast,
      radius: spec.radius * (arrival.fast ? FAST_RADIUS : 1),
      speed: spec.speed * (arrival.fast ? FAST_SPEED : 1),
      x,
      y,
      heading: arrival.heading,
      prevX: x,
      prevY: y,
      prevHeading: arrival.heading,
      state: 'flying',
      entered: false,
      path: [],
      target: null,
      landTicks: 0,
      landFrom: { x, y },
      landRoll: 0,
      warning: false,
      age: 0,
    });
  }

  private drawingAircraft(): Aircraft | undefined {
    return this.drawing === null
      ? undefined
      : this.aircraft.find((a) => a.id === this.drawing && a.state === 'flying');
  }

  private reset(): void {
    this.score = 0;
    this.aircraft = [];
    this.arrivals = [];
    this.praise = [];
    this.locks = [];
    this.crash = null;
    this.drawing = null;
    this.paused = false;
    this.fast = false;
    this.spawnTimer = FIRST_SPAWN;
    this.streak = 0;
    this.lastLanding = -Infinity;
    this.playTicks = 0;
    this.warnedPairs.clear();
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseTicks = 0;
  }
}

export const landTicks = (a: Pick<Aircraft, 'kind'>): number =>
  a.kind === 'heli' ? HELI_LAND_TICKS : LAND_TICKS;

/** 0 in the air to 1 at the end of the landing. */
export const landProgress = (a: Aircraft): number =>
  a.state === 'landing' ? Math.min(1, a.landTicks / landTicks(a)) : 0;
