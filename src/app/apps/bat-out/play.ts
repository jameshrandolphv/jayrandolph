import { vec, type Vec3 } from './camera';
import {
  BASES,
  BASE_PATH,
  BATTER_START,
  CATCH_HEIGHT,
  FIELDER_SPEED,
  FIELDER_SPOTS,
  FIELD_HEIGHT,
  FOUL_ANGLE,
  PIVOT,
  REACH,
  REACT,
  RELAY_COST,
  RELAY_FEET,
  RUNNER_START,
  RUN_SPEED,
  THROW_INFIELD,
  THROW_OUTFIELD,
  TRANSFER_INFIELD,
  TRANSFER_OUTFIELD,
  TURN_COST,
} from './constants';
import { FLIGHT_DT, sprayOf, type BallFlight } from './flight';
import { gauss, type Rng } from './rng';
import type { Contact } from './swing';

/** A ground position at a time (real seconds from contact). Tracks are made of these, joined by straight lines. */
export interface Key {
  t: number;
  x: number;
  y: number;
}
export type Track = Key[];

export interface BallKey {
  t: number;
  p: Vec3;
}

/** Who is on first, second and third: a runner's id (his place in the batting order) or null. */
export type Bases = [number | null, number | null, number | null];

export interface RunnerPlay {
  id: number;
  track: Track;
  /** When he was put out, or null. */
  outAt: number | null;
  /** When he crossed home, or null. */
  scoredAt: number | null;
}

/** A call made at a base during the play, such as OUT or SAFE. */
export interface Mark {
  t: number;
  at: Vec3;
  text: string;
}

export type Call =
  | 'foul'
  | 'homeRun'
  | 'grandSlam'
  | 'groundRuleDouble'
  | 'single'
  | 'double'
  | 'triple'
  | 'insideTheParker'
  | 'flyOut'
  | 'lineOut'
  | 'popOut'
  | 'foulOut'
  | 'infieldFly'
  | 'sacFly'
  | 'groundOut'
  | 'doublePlay'
  | 'triplePlay'
  | 'fieldersChoice'
  | 'infieldHit';

export interface PlayResult {
  call: Call;
  /** Outs made on the play. */
  outs: number;
  /** Runs that count. */
  runs: number;
  /** Who is on base afterwards. */
  bases: Bases;
  /** Bases the batter took on a hit (1 to 4), 0 if not a hit. */
  hit: number;
  /** A runner put out on the bases, for an extra call such as OUT AT HOME. */
  extra: string | null;
}

export interface Play {
  flight: BallFlight;
  ball: BallKey[];
  /** Every fielder's movement, by position (P, C, 1B, 2B, 3B, SS, LF, CF, RF). */
  fielders: Track[];
  runners: RunnerPlay[];
  marks: Mark[];
  /** Where the ball comes down, if it is in the air, for a landing marker. */
  landing: Vec3 | null;
  /** Real seconds the play lasts. */
  duration: number;
  result: PlayResult;
}

export interface PlayContext {
  outs: number;
  bases: Bases;
  batter: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
const base = (n: number): Vec3 => BASES[n % 4];
const isInfielder = (f: number): boolean => f <= 5;

export const trackAt = (track: Track, t: number): { x: number; y: number } => {
  if (t <= track[0].t) return track[0];
  for (let i = 1; i < track.length; i++) {
    const b = track[i];
    if (t <= b.t) {
      const a = track[i - 1];
      const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return track[track.length - 1];
};

export const ballAt = (ball: readonly BallKey[], t: number): Vec3 => {
  if (t <= ball[0].t) return ball[0].p;
  let lo = 0;
  let hi = ball.length - 1;
  if (t >= ball[hi].t) return ball[hi].p;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ball[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = ball[lo];
  const b = ball[hi];
  const f = (t - a.t) / (b.t - a.t || 1);
  return vec(a.p.x + (b.p.x - a.p.x) * f, a.p.y + (b.p.y - a.p.y) * f, a.p.z + (b.p.z - a.p.z) * f);
};

/** Seconds for a throw of this length, with the cut-off man on long ones. */
const throwTime = (feet: number, outfield: boolean): number =>
  feet / (outfield ? THROW_OUTFIELD : THROW_INFIELD) + (feet > RELAY_FEET ? RELAY_COST : 0);

/** Runners and the batter run base to base; rounding a base costs a little. */
const runTime = (from: number, to: number): number =>
  ((to - from) * BASE_PATH) / RUN_SPEED + Math.max(0, to - from - 1) * TURN_COST;

/**
 * Seconds a fielder needs to get to a ball at `p`: a moment to react, then running, less what he can reach. A ball
 * in the air takes longer to read; a hard-hit ground ball has to be met nearly head on.
 */
const needTime = (f: number, p: Vec3, air: boolean, groundSpeed: number): number => {
  const reach = air ? REACH : groundSpeed > 100 ? 1.5 : 3;
  // Nobody runs a perfect line: reading a fly ball and getting in front of a grounder both cost speed.
  const speed = FIELDER_SPEED[f] * (air ? AIR_ROUTE : isInfielder(f) ? GROUND_ROUTE : 0.9);
  return (air ? REACT + 0.25 : REACT) + Math.max(0, dist(FIELDER_SPOTS[f], p) - reach) / speed;
};
const AIR_ROUTE = 0.72;
const GROUND_ROUTE = 0.5;

const groundSpeedAt = (pts: readonly Vec3[], i: number): number =>
  i > 0 ? dist(pts[i], pts[i - 1]) / FLIGHT_DT : 0;

/** Ball in flight can be caught here: fair, or foul but short of the stands and the screen behind home. */
const catchable = (p: Vec3): boolean => {
  const angle = Math.abs(sprayOf(p));
  if (angle <= FOUL_ANGLE) return true;
  // Distance from the nearer foul line, outside it.
  const r = Math.hypot(p.x, p.y);
  const off = r * Math.sin(((Math.min(angle, 180) - FOUL_ANGLE) * Math.PI) / 180);
  return p.y > -45 && off < 40 && r < 320;
};

interface Pickup {
  fielder: number;
  /** Index into the flight's points, and the time. */
  i: number;
  t: number;
  /** Caught before it touched the ground. */
  air: boolean;
  /** Spare time the fielder had, s. */
  slack: number;
}

/**
 * The first fielder able to get to the ball, catching it if it is still in the air. A ball that comes down just
 * within reach is a diving catch that sometimes goes wrong, and then the nearest fielder picks it up off the grass.
 * With `airOnly` (a foul ball) only a catch counts.
 */
const firstPickup = (flight: BallFlight, rng: Rng, airOnly = false): Pickup | null => {
  const { pts, land } = flight;
  let best: Pickup | null = null;
  for (let f = 0; f < 9; f++) {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const air = land < 0 || i < land;
      if (airOnly && !air) break;
      if (air ? p.z > CATCH_HEIGHT || !catchable(p) : p.z > FIELD_HEIGHT || flight.foul) continue;
      const t = i * FLIGHT_DT;
      const need = needTime(f, p, air, groundSpeedAt(pts, i));
      if (need > t) continue;
      const slack = t - need;
      if (!best || t < best.t - 0.05 || (Math.abs(t - best.t) <= 0.05 && slack > best.slack))
        best = { fielder: f, i, t, air, slack };
      break;
    }
  }
  if (best?.air && best.slack < 0.2 && rng() > 0.6)
    return airOnly ? null : firstPickupAfter(flight, land >= 0 ? land : best.i);
  return best ?? (airOnly ? null : restingPickup(flight));
};

/** After a ball is dropped, the nearest fielder to where it lands picks it up. */
const firstPickupAfter = (flight: BallFlight, from: number): Pickup => {
  const { pts } = flight;
  let best: Pickup | null = null;
  const start = Math.max(from, 1);
  for (let f = 0; f < 9; f++) {
    for (let i = start; i < pts.length; i++) {
      const p = pts[i];
      if (p.z > FIELD_HEIGHT) continue;
      const t = i * FLIGHT_DT;
      const need = needTime(f, p, false, groundSpeedAt(pts, i));
      if (need > t) continue;
      if (!best || t < best.t) best = { fielder: f, i, t, air: false, slack: t - need };
      break;
    }
  }
  return best ?? restingPickup(flight);
};

/** A ball nobody reached while it moved is picked up where it stops. */
const restingPickup = (flight: BallFlight): Pickup => {
  const i = flight.pts.length - 1;
  const p = flight.pts[i];
  let best: Pickup | null = null;
  for (let f = 0; f < 9; f++) {
    const t = Math.max(i * FLIGHT_DT, needTime(f, p, false, 0));
    if (!best || t < best.t) best = { fielder: f, i, t, air: false, slack: 0 };
  }
  return best!;
};

/** Who takes a throw at each base, given who fielded the ball. */
const coverer = (b: number, fielder: number, spray: number): number => {
  switch (b % 4) {
    case 1:
      return fielder === 2 ? 0 : 2;
    case 2:
      // The shortstop covers on balls to the right side, the second baseman on balls to the left.
      if (fielder === 5) return 3;
      if (fielder === 3) return 5;
      return spray > 0 ? 5 : 3;
    case 3:
      return fielder === 4 ? 5 : 4;
    default:
      return 1;
  }
};

/** Builds a fielder's track: wait to react, run to a spot, then stay. */
const runTo = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  speed: number,
  start: number,
): Track => {
  const t1 = start + dist(from, to) / speed;
  return [
    { t: 0, x: from.x, y: from.y },
    { t: start, x: from.x, y: from.y },
    { t: t1, x: to.x, y: to.y },
  ];
};

/** Moves a track on from its end to a new spot, starting no earlier than `start`. */
const extend = (track: Track, to: { x: number; y: number }, speed: number, start: number): void => {
  const last = track[track.length - 1];
  const t0 = Math.max(start, last.t);
  if (t0 > last.t) track.push({ t: t0, x: last.x, y: last.y });
  track.push({ t: t0 + dist(last, to) / speed, x: to.x, y: to.y });
};

interface Runner {
  id: number;
  /** Base he started from: 0 for the batter. */
  from: number;
  /** Base he is going to (4 is home). */
  to: number;
  start: number;
  out: boolean;
  outAt: number | null;
}

const arrive = (r: Runner, b = r.to): number => r.start + runTime(r.from, b);

/** Throws the ball from where it is to a base and returns when it gets there, adding its arc to the ball keys. */
const addThrow = (
  ball: BallKey[],
  from: Vec3,
  to: Vec3,
  release: number,
  outfield: boolean,
  rng: Rng,
): number => {
  const feet = dist(from, to);
  const arrival = release + throwTime(feet, outfield) + gauss(rng) * 0.06;
  ball.push({ t: release, p: vec(from.x, from.y, 5) });
  const steps = Math.max(2, Math.ceil((arrival - release) * 30));
  const arc = Math.min(30, feet * 0.06);
  for (let s = 1; s <= steps; s++) {
    const f = s / steps;
    ball.push({
      t: release + (arrival - release) * f,
      p: vec(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f, 5 + arc * 4 * f * (1 - f)),
    });
  }
  return arrival;
};

const runnerTrack = (r: Runner, end: number, trot = RUN_SPEED): Track => {
  const at = base(r.from);
  const track: Track = [{ t: 0, x: at.x, y: at.y }];
  if (r.to === r.from && !r.out) return track;
  track.push({ t: r.start, x: at.x, y: at.y });
  let t = r.start;
  const last = r.out ? r.to : r.to;
  for (let b = r.from + 1; b <= last; b++) {
    const leg = BASE_PATH / trot + (b > r.from + 1 ? TURN_COST : 0);
    const p = base(b);
    const stopAt =
      r.out && r.outAt !== null && b === r.to ? Math.max(t, Math.min(t + leg, r.outAt)) : t + leg;
    const f = (stopAt - t) / leg;
    const prev = base(b - 1);
    track.push({ t: stopAt, x: prev.x + (p.x - prev.x) * f, y: prev.y + (p.y - prev.y) * f });
    t = stopAt;
  }
  if (t < end) track.push({ ...track[track.length - 1], t: end });
  return track;
};

/**
 * Plays out a ball in play: who fields it, where it is thrown, how far each runner gets and who is out, following
 * the rules of baseball (force plays, tagging up on a caught fly, runs not counting when the third out is a force
 * or the batter before he reaches first). The defence makes the play worth the most: outs first, then keeping runs
 * off the board. Everything is in real seconds from contact.
 */
export const resolvePlay = (
  flight: BallFlight,
  contact: Contact,
  ctx: PlayContext,
  rng: Rng,
): Play => {
  const spray = contact.spray;
  const fielders: Track[] = FIELDER_SPOTS.map((p) => [{ t: 0, x: p.x, y: p.y }]);
  const marks: Mark[] = [];
  const landIndex = flight.land >= 0 ? flight.land : flight.pts.length - 1;
  const landing = contact.la > 8 && !flight.homeRun ? flight.pts[landIndex] : null;
  const flightKeys = (upTo: number): BallKey[] =>
    flight.pts.slice(0, upTo + 1).map((p, i) => ({ t: i * FLIGHT_DT, p }));

  const runnersOn = (): Runner[] =>
    [
      { id: ctx.batter, from: 0, to: 0, start: BATTER_START, out: false, outAt: null },
      ...ctx.bases.flatMap((id, i) =>
        id === null
          ? []
          : [{ id, from: i + 1, to: i + 1, start: RUNNER_START, out: false, outAt: null }],
      ),
    ] as Runner[];

  const finish = (
    runners: Runner[],
    ball: BallKey[],
    result: Omit<PlayResult, 'runs' | 'bases' | 'outs'>,
    end: number,
    noRunsOnThirdOut = false,
    trot = RUN_SPEED,
  ): Play => {
    const outs = runners.filter((r) => r.out).length;
    const thirdOut = ctx.outs + outs >= 3;
    const lastOut = Math.max(...runners.map((r) => (r.out ? (r.outAt ?? 0) : -1)));
    let runs = 0;
    const plays: RunnerPlay[] = runners.map((r) => {
      const scored = !r.out && r.to >= 4;
      const scoredAt = scored ? r.start + runTime(r.from, 4) * (RUN_SPEED / trot) : null;
      // A run counts if he crossed before the third out, unless that out was a force or the batter's.
      const counts = scored && (!thirdOut || (!noRunsOnThirdOut && scoredAt! < lastOut));
      if (counts) runs++;
      return {
        id: r.id,
        track: runnerTrack(r, end, trot),
        outAt: r.outAt,
        scoredAt: counts ? scoredAt : null,
      };
    });
    const bases: Bases = [null, null, null];
    if (!thirdOut)
      for (const r of runners) if (!r.out && r.to >= 1 && r.to <= 3) bases[r.to - 1] = r.id;
    for (const f of fielders) if (f[f.length - 1].t < end) f.push({ ...f[f.length - 1], t: end });
    return {
      flight,
      ball,
      fielders,
      runners: plays,
      marks,
      landing,
      duration: end,
      result: { ...result, outs, runs, bases },
    };
  };

  // Over the fence: everyone trots home.
  if (flight.homeRun || flight.groundRule) {
    const runners = runnersOn();
    const trot = RUN_SPEED * 2.4;
    for (const r of runners) {
      r.to = flight.homeRun ? 4 : Math.min(4, r.from + 2);
      r.start = flight.land >= 0 ? Math.min(flight.land * FLIGHT_DT, 2) : 1;
    }
    const loaded = ctx.bases.every((b) => b !== null);
    const call: Call = flight.groundRule ? 'groundRuleDouble' : loaded ? 'grandSlam' : 'homeRun';
    const end = Math.max(flight.pts.length * FLIGHT_DT, 1.5) + (flight.homeRun ? 3 : 1.5);
    // Outfielders drift back to the wall to watch it go.
    for (let f = 6; f < 9; f++) {
      const p = flight.pts[flight.pts.length - 1];
      const to = { x: (FIELDER_SPOTS[f].x * 2 + p.x) / 3, y: (FIELDER_SPOTS[f].y * 2 + p.y) / 3 };
      fielders[f] = runTo(FIELDER_SPOTS[f], to, FIELDER_SPEED[f], REACT);
    }
    return finish(
      runners,
      flightKeys(flight.pts.length - 1),
      { call, hit: flight.homeRun ? 4 : 2, extra: null },
      end,
      false,
      trot,
    );
  }

  const pick = firstPickup(flight, rng, flight.foul);
  // A foul ball nobody catches is dead.
  if (flight.foul && !pick) {
    const end = Math.min(flight.pts.length * FLIGHT_DT, 2.2);
    return finish(
      runnersOn(),
      flightKeys(Math.min(flight.pts.length - 1, Math.round(end / FLIGHT_DT))),
      { call: 'foul', hit: 0, extra: null },
      end,
    );
  }
  const p = pick!;
  const at = flight.pts[p.i];
  fielders[p.fielder] = runTo(FIELDER_SPOTS[p.fielder], at, FIELDER_SPEED[p.fielder], REACT);
  const ball = flightKeys(p.i);
  const covers = new Map<number, number>();
  for (const b of [1, 2, 3, 4]) {
    const f = coverer(b, p.fielder, spray);
    if (f !== p.fielder && !covers.has(f)) {
      covers.set(f, b);
      fielders[f] = runTo(FIELDER_SPOTS[f], base(b), FIELDER_SPEED[f], REACT);
    }
  }
  const outfield = !isInfielder(p.fielder);
  // Gathering a ball off the grass in the outfield takes longer than throwing one just caught.
  const transfer = outfield ? TRANSFER_OUTFIELD + (p.air ? 0 : 0.3) : TRANSFER_INFIELD;

  // Caught in the air: the batter is out, and runners may tag up.
  if (p.air) {
    const runners = runnersOn();
    const batter = runners[0];
    // He runs towards first until it is caught.
    batter.out = true;
    batter.outAt = p.t;
    batter.to = 1;
    marks.push({ t: p.t, at, text: 'OUT' });
    const outsNow = ctx.outs + 1;
    let call: Call = flight.foul
      ? 'foulOut'
      : contact.la < 18
        ? 'lineOut'
        : contact.la > 48 && isInfielder(p.fielder)
          ? 'popOut'
          : 'flyOut';
    if (call === 'popOut' && ctx.outs < 2 && ctx.bases[0] !== null && ctx.bases[1] !== null)
      call = 'infieldFly';
    let end = p.t + 1.2;
    let extra: string | null = null;
    if (outsNow < 3) {
      // From the lead runner back: he goes if he can beat the throw comfortably and the base ahead is free.
      let freeAhead = 5;
      let target: Runner | null = null;
      for (const r of runners.slice(1).sort((a, b) => b.from - a.from)) {
        const next = r.from + 1;
        r.start = p.t + 0.1;
        const throwIn = p.t + transfer + throwTime(dist(at, base(next)), outfield);
        const go =
          next < freeAhead && r.start + runTime(r.from, next) + 0.25 + rng() * 0.5 < throwIn;
        if (go) {
          r.to = next;
          target ??= r;
        }
        freeAhead = r.to;
      }
      if (target) {
        const arrival = addThrow(ball, at, base(target.to), p.t + transfer, outfield, rng);
        const safe = arrive(target) <= arrival;
        if (!safe) {
          target.out = true;
          target.outAt = arrival;
          extra =
            target.to === 4
              ? 'OUT AT HOME!'
              : `OUT AT ${['', 'FIRST', 'SECOND', 'THIRD'][target.to]}!`;
        }
        marks.push({
          t: Math.max(arrival, arrive(target)),
          at: base(target.to),
          text: safe ? 'SAFE' : 'OUT',
        });
        end = Math.max(arrival, arrive(target)) + 1.2;
        if (safe && target.to === 4 && call !== 'foulOut') call = 'sacFly';
      }
    }
    return finish(runners, ball, { call, hit: 0, extra }, end);
  }

  const runners = runnersOn();
  const batter = runners[0];
  const forced = (r: Runner): boolean => {
    if (r.from === 0) return true;
    for (let b = 1; b < r.from; b++) if (ctx.bases[b - 1] === null) return false;
    return true;
  };

  // An infielder fields a ground ball: force plays, a double play, or the sure out at first.
  if (isInfielder(p.fielder) && dist(at, base(0)) < 165) {
    const twoOuts = ctx.outs === 2;
    for (const r of runners) {
      if (forced(r)) r.to = r.from + 1;
      else if (twoOuts) r.to = r.from + 1;
      else r.start = Infinity;
    }
    // Options: throw to the base the lead forced runner is going to, or to first; then maybe on to first for two.
    const forcedBases = runners.filter((r) => forced(r)).map((r) => r.to);
    const options: number[][] = [];
    for (const b of forcedBases) {
      options.push([b]);
      if (b !== 1 && ctx.outs < 2) options.push([b, 1]);
      if (b === 3 && ctx.outs === 0) options.push([3, 2, 1]);
    }

    interface Outcome {
      seq: number[];
      outs: { runner: Runner; t: number }[];
      safes: { runner: Runner; t: number; b: number }[];
      times: number[];
      value: number;
    }
    const holder = p.fielder;
    const evaluate = (seq: number[], noise: number[]): Outcome => {
      let from: { x: number; y: number } = at;
      let t = p.t;
      let who = holder;
      const outs: Outcome['outs'] = [];
      const safes: Outcome['safes'] = [];
      const times: number[] = [];
      seq.forEach((b, k) => {
        const target = base(b);
        const runner = runners.find((r) => r.to === b && forced(r))!;
        const near = dist(from, target) < 14;
        // A fielder near the bag steps on it himself; otherwise he throws (a pivot is quicker than a fielded ball).
        const arrival =
          k === 0 && near
            ? t + dist(from, target) / FIELDER_SPEED[who]
            : t +
              (k === 0 ? TRANSFER_INFIELD : PIVOT) +
              throwTime(dist(from, target), false) +
              noise[k];
        times.push(arrival);
        if (arrival < arrive(runner)) outs.push({ runner, t: arrival });
        else safes.push({ runner, t: arrive(runner), b });
        from = target;
        t = arrival;
        who = coverer(b, holder, spray);
      });
      const outsMade = Math.min(outs.length, 3 - ctx.outs);
      const lead = outs.length ? Math.max(...outs.map((o) => o.runner.from)) : -1;
      const margin = outs.length
        ? arrive(outs[0].runner) - times[0]
        : times[0] - (safes[0] ? arrive(safes[0].runner) : 0);
      return {
        seq,
        outs,
        safes,
        times,
        value: outsMade * 10 + lead * 0.5 + Math.min(margin, 1) * (twoOuts ? 2 : 0.2),
      };
    };
    const noise = [gauss(rng) * 0.08, gauss(rng) * 0.08, gauss(rng) * 0.08];
    const outcomes = options.map((o) => evaluate(o, noise));
    let best = outcomes.reduce((a, b) => (b.value > a.value ? b : a));
    // With no out to be had, the throw goes where it comes closest.
    if (best.outs.length === 0)
      best = outcomes.reduce((a, b) =>
        b.safes[0].t - b.times[0] > a.safes[0].t - a.times[0] ? b : a,
      );

    let cursor: Vec3 = at;
    let t = p.t;
    let who = holder;
    best.seq.forEach((b, k) => {
      const target = base(b);
      const arrival = best.times[k];
      const near = k === 0 && dist(cursor, target) < 14;
      if (near) {
        extend(fielders[who], target, FIELDER_SPEED[who], t);
        ball.push(
          { t, p: vec(cursor.x, cursor.y, 3) },
          { t: arrival, p: vec(target.x, target.y, 3) },
        );
      } else
        addThrow(
          ball,
          cursor,
          target,
          t + (k === 0 ? TRANSFER_INFIELD : PIVOT) + noise[k],
          false,
          rng,
        );
      const out = best.outs.find((o) => o.runner.to === b);
      const runner = runners.find((r) => r.to === b && forced(r))!;
      if (out) {
        runner.out = true;
        runner.outAt = arrival;
      }
      marks.push({
        t: Math.max(arrival, out ? arrival : arrive(runner)),
        at: target,
        text: out ? 'OUT' : 'SAFE',
      });
      cursor = target;
      t = arrival;
      who = coverer(b, holder, spray);
    });
    // Trimmed to the outs that were needed: once three are made the play is over.
    let outsSoFar = ctx.outs;
    for (const r of runners) if (r.out && ++outsSoFar > 3) r.out = false;
    const lastThrow = t;

    // Runners who held go on the throw if it went behind them: from second on a ball to the right side, from third on
    // one to the middle or right side (the run scores on a ground out to first).
    const throwBase = best.seq[best.seq.length - 1];
    for (const r of runners.filter((x) => x.start === Infinity).sort((a, b) => b.from - a.from)) {
      const canGo =
        r.from === 2 ? holder === 2 || holder === 3 : holder === 2 || holder === 3 || holder === 5;
      const ahead = runners.some((o) => o !== r && !o.out && o.to === r.from + 1);
      r.start = RUNNER_START;
      if (throwBase < r.from + 1 && canGo && !ahead) {
        r.to = r.from + 1;
        r.start = p.t + 0.1;
      } else r.to = r.from;
    }

    const outCount = runners.filter((r) => r.out).length;
    const batterOut = batter.out;
    let call: Call;
    if (outCount >= 3) call = 'triplePlay';
    else if (outCount === 2) call = 'doublePlay';
    else if (outCount === 1) call = batterOut ? 'groundOut' : 'fieldersChoice';
    else call = 'infieldHit';
    const end = Math.max(lastThrow, ...runners.map((r) => (r.out ? 0 : arrive(r)))) + 1.2;
    return finish(
      runners,
      ball,
      { call, hit: call === 'infieldHit' ? 1 : 0, extra: null },
      end,
      true,
    );
  }

  // A hit: the ball is picked up in the outfield (or got through), and runners take what they can.
  const airTime = flight.land >= 0 ? flight.land * FLIGHT_DT : 0;
  const twoOuts = ctx.outs === 2;
  const release = p.t + transfer;
  const defenceAt = (b: number): number => release + throwTime(dist(at, base(b)), outfield);
  let cap = 5;
  for (const r of runners.slice(1).sort((a, b) => b.from - a.from)) {
    // With fewer than two outs runners wait to see a fly ball land before going all out.
    r.start = !twoOuts && contact.la > 15 ? Math.max(RUNNER_START, airTime - 0.7) : RUNNER_START;
    const min = forced(r) ? r.from + 1 : r.from;
    let to = min;
    for (let b = r.from + 1; b <= 4; b++) {
      if (b >= cap && b < 4) break;
      // Some send the runner; a few get thrown out.
      if (arrive(r, b) - 0.15 + rng() * 0.6 < defenceAt(b)) to = b;
      else break;
    }
    r.to = Math.max(min, Math.min(to, cap === 4 ? 4 : cap - 1));
    cap = r.to === 4 ? 4 : r.to;
  }
  let hit = 1;
  for (let b = 2; b <= 4; b++) {
    if (b >= cap && b < 4) break;
    if (arrive(batter, b) + 0.1 + rng() * 0.4 < defenceAt(b)) hit = b;
    else break;
  }
  batter.to = hit;

  // The throw goes to the runner most likely to be out, home first.
  const advancing = runners.filter((r) => r.to > r.from && r.to > 1);
  let target: Runner | null = null;
  for (const r of advancing) {
    const margin = arrive(r) - defenceAt(r.to);
    if (
      !target ||
      r.to > target.to ||
      (r.to === target.to && margin > arrive(target) - defenceAt(target.to))
    )
      target = r;
  }
  let end = Math.max(...runners.map((r) => arrive(r))) + 1;
  let extra: string | null = null;
  if (target) {
    const arrival = addThrow(ball, at, base(target.to), release, outfield, rng);
    const out = arrival < arrive(target) && ctx.outs < 3;
    if (out) {
      target.out = true;
      target.outAt = arrival;
      extra =
        target.to === 4 ? 'OUT AT HOME!' : `OUT AT ${['', 'FIRST', 'SECOND', 'THIRD'][target.to]}!`;
    }
    marks.push({
      t: Math.max(arrival, arrive(target)),
      at: base(target.to),
      text: out ? 'OUT' : 'SAFE',
    });
    end = Math.max(end, arrival + 1);
  } else {
    // Nobody to throw out: the ball comes in to the base ahead of the lead runner to hold him there.
    const lead = Math.max(...runners.map((r) => r.to));
    const to = base(Math.min(lead + 1, 4));
    const arrival = addThrow(ball, at, to, release, outfield, rng);
    end = Math.max(end, arrival + 0.8);
  }
  // Thrown out stretching it, he is still credited with the hit he had.
  if (batter.out) hit = Math.max(1, hit - 1);
  const call: Call =
    hit === 4 ? 'insideTheParker' : hit === 3 ? 'triple' : hit === 2 ? 'double' : 'single';
  return finish(runners, ball, { call, hit, extra }, end);
};
