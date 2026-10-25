import { describe, expect, it } from 'vitest';
import {
  ART,
  BOOST,
  DOUBLE_GAP,
  CARRIAGE_RETURN,
  EXTRA_LAPS,
  FIRE_SPEED,
  TURTLE_SPEED,
  WARP_EASE_TICKS,
  WARP_SLOW_TICKS,
  WARP_SPEED,
  LIVES,
  MAX_LIVES,
  PICKUP_FROM_SCORE,
  PICKUP_TICKS,
  PATCH_SCORES,
  STUN_TICKS,
  CRASH_TICKS,
  JOIN_CLEAR,
  DAZE_TICKS,
  GAME_OVER_LOCKOUT,
  GROUP_FROM_SCORE,
  GROUP_INTERVAL_EARLY,
  level,
  GROUP_SIZE,
  KIND_SPECS,
  LANES,
  RAT_LURK,
  HOOK_CAST,
  SLIME_TICKS,
  SWERVE_TICKS,
  groupLength,
  soundButton,
  type Kind,
  type PickupKind,
} from './constants';
import {
  COURSES,
  COURSE_IDS,
  RAPIDS_LANES,
  RIVER_KINDS,
  TNT_FROM_SCORE,
  TNT_FUSE,
  TNT_INTERVAL,
  TNT_RUN,
  TRAIN_LANE,
  WAVE_SWELL,
  medalFor,
  unlocked,
  type CourseId,
} from './courses';
import { ChaosParkGame, DEMO_LAPS, frameFor, placePark, screenToPark } from './game';
import { generatePark, laneOffset, loopDelta, pose, seededRng, wrap } from './park';
import {
  ChaosParkSim,
  duskAt,
  laneOverlap,
  lapsLeft,
  maxMovers,
  patchesShown,
  streakValue,
  type Mover,
} from './sim';
import type { SideRoad } from './park';

const ticks = (sim: ChaosParkSim, n: number): void => {
  for (let i = 0; i < n; i++) sim.step();
};

/** Stops anything arriving, so tests control every mover. */
const noArrivals = (sim: ChaosParkSim): void => {
  (sim as unknown as { spawn: () => void }).spawn = () => undefined;
};

/**
 * A run with the starting carriage cleared away, nothing arriving, and no short cuts or patches, so movers stay where
 * tests put them.
 */
const playing = (seed = 3): ChaosParkSim => {
  const sim = new ChaosParkSim(seededRng(seed));
  sim.start();
  sim.movers = [];
  sim.park = { ...sim.park, shortcuts: [], patches: [] };
  noArrivals(sim);
  return sim;
};

let nextId = 1000;
const put = (
  sim: ChaosParkSim,
  kind: Kind,
  s: number,
  p: number,
  options: Partial<Pick<Mover, 'dir' | 'laps' | 'speed'>> = {},
): Mover => {
  const spec = KIND_SPECS[kind];
  const at = pose(sim.park.track, s, laneOffset(p, spec.width, sim.park));
  const m: Mover = {
    id: nextId++,
    kind,
    width: spec.width,
    len: spec.len,
    speed: spec.speed,
    baseSpeed: spec.speed,
    boosted: false,
    dir: 1,
    state: 'track',
    s,
    p,
    target: p,
    progress: 0,
    laps: 3,
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
    x: at.x,
    y: at.y,
    heading: at.angle,
    prevX: at.x,
    prevY: at.y,
    prevHeading: at.angle,
    alpha: 1,
    warning: false,
    slip: 0,
    age: 0,
    look: [0.5, 0.5, 0.5],
    onPatch: new Set(),
    crowd: 1,
    daze: 0,
    shout: 0,
    shoutAt: -Infinity,
    ghost: 0,
    star: 0,
    autopilot: 0,
    autoSlow: false,
    wearOff: Infinity,
    plainSpeed: spec.speed,
    swerve: 0,
    haunted: false,
    slime: 0,
    turnedAt: -Infinity,
    side: -1,
    sideSkip: -1,
    river: false,
    ...options,
  };
  m.baseSpeed = m.speed;
  sim.movers.push(m);
  return m;
};

describe('ChaosParkSim', () => {
  it('starts with one carriage on the loop that never leaves', () => {
    const sim = new ChaosParkSim(seededRng(1));
    sim.start();
    expect(sim.movers).toHaveLength(1);
    expect(sim.movers[0]!.kind).toBe('carriage');
    expect(lapsLeft(sim.movers[0]!)).toBe(Infinity);
  });

  it('crashes when a faster mover runs into a slower one in the same lane', () => {
    const sim = playing();
    sim.lives = 1;
    const s = 100;
    put(sim, 'walker', s + 60, 1);
    put(sim, 'runner', s, 1);
    ticks(sim, 200);
    expect(sim.phase).toBe('crashed');
    expect(sim.crash).not.toBeNull();
  });

  it('warns before the collision', () => {
    const sim = playing();
    const s = 100;
    const slow = put(sim, 'walker', s + 80, 1);
    const fast = put(sim, 'runner', s, 1);
    let warned = false;
    for (let i = 0; i < 200 && sim.phase === 'playing'; i++) {
      sim.step();
      warned ||= slow.warning && fast.warning;
    }
    expect(warned).toBe(true);
  });

  it('lets movers pass in neighbouring lanes', () => {
    const sim = playing();
    const s = 100;
    put(sim, 'walker', s + 60, 1);
    put(sim, 'runner', s, 2);
    ticks(sim, 300);
    expect(sim.phase).toBe('playing');
  });

  it('avoids the crash when the faster one is swiped into the next lane', () => {
    const sim = playing();
    const s = 100;
    put(sim, 'walker', s + 60, 1);
    const runner = put(sim, 'runner', s, 1);
    ticks(sim, 30);
    expect(sim.shift(runner.id, 1)).toBe(true);
    ticks(sim, 300);
    expect(sim.phase).toBe('playing');
    expect(runner.p).toBe(2);
  });

  it('crashes head-on with something going the wrong way', () => {
    const sim = playing();
    sim.lives = 1;
    const s = 100;
    put(sim, 'runner', s, 0);
    put(sim, 'walker', s + 150, 0, { dir: -1 });
    while (sim.phase === 'playing' && sim.playTicks < 300) sim.step();
    expect(sim.phase).toBe('crashed');
  });

  it('counts a two-lane mover as in both its lanes', () => {
    const sim = playing();
    sim.lives = 1;
    const s = 100;
    put(sim, 'walker', s + 80, 2);
    put(sim, 'car', s, 1);
    ticks(sim, 120);
    expect(sim.phase).toBe('crashed');
  });

  it('keeps swipes on the road, with a two-lane mover reaching lane 2 at most', () => {
    const sim = playing();
    const s = 100;
    const car = put(sim, 'car', s, 1);
    expect(sim.shift(car.id, 1)).toBe(true);
    expect(sim.shift(car.id, 1)).toBe(false);
    expect(car.target).toBe(LANES - 2);
    const walker = put(sim, 'walker', s + 200, 0);
    expect(sim.shift(walker.id, -1)).toBe(false);
    expect(sim.drainEvents()).toEqual(['shift', 'bump', 'bump']);
  });

  it('scores each lap and sends a mover out at its entrance once its laps are done', () => {
    const sim = playing();
    const e = sim.park.entrances[0]!;
    const m = put(sim, 'biker', e.s, LANES - 1, { laps: 2 });
    const lapTicks = Math.ceil(sim.park.track.length / m.speed);
    ticks(sim, lapTicks + 2);
    expect(sim.score).toBe(1);
    expect(m.state).toBe('track');
    ticks(sim, lapTicks);
    expect(sim.score).toBe(2);
    expect(m.state).toBe('leaving');
    ticks(sim, 400);
    expect(sim.movers).not.toContain(m);
  });

  it('keeps carriages going round, counting their laps', () => {
    const sim = playing();
    const m = put(sim, 'carriage', 0, 0, { laps: Infinity });
    ticks(sim, Math.ceil((sim.park.track.length * 2) / m.speed) + 2);
    expect(sim.score).toBe(2);
    expect(m.state).toBe('track');
  });

  it('shows a "+1" where a lap finishes', () => {
    const sim = playing();
    const m = put(sim, 'car', 0, 0);
    ticks(sim, Math.ceil(sim.park.track.length / m.speed) + 1);
    expect(sim.pops).toHaveLength(1);
  });

  it('cuts across the park without changing the lap count', () => {
    const sim = new ChaosParkSim(seededRng(2));
    sim.start();
    sim.movers = [];
    noArrivals(sim);
    const c = sim.park.shortcuts[0];
    expect(c).toBeDefined();
    const { length } = sim.park.track;
    // Always take the short cut.
    (sim as unknown as { rng: () => number }).rng = () => 0;
    const m = put(sim, 'runner', wrap(c!.a - 5, length), 0, { laps: 1 });
    let cut = false;
    for (let i = 0; i < 4000 && m.state !== 'leaving'; i++) {
      sim.step();
      cut ||= m.state === 'shortcut';
    }
    expect(cut).toBe(true);
    expect(sim.score).toBe(1);
    expect(m.state).toBe('leaving');
  });

  it('slides movers a lane on a patch, whatever the season', () => {
    const sim = new ChaosParkSim(seededRng(5));
    sim.park = generatePark(seededRng(5), 'summer');
    sim.start();
    sim.movers = [];
    noArrivals(sim);
    sim.laps = PATCH_SCORES[0]!;
    const patch = sim.park.patches[0]!;
    const m = put(sim, 'runner', wrap(patch.s - 40, sim.park.track.length), patch.lane);
    ticks(sim, 60);
    expect(m.target).not.toBe(patch.lane);
    expect(Math.abs(m.target - patch.lane)).toBe(1);
    expect(sim.drainEvents()).toContain('slip');
  });

  it('holds arrivals at the entrance until the way is clear', () => {
    const sim = playing();
    const e = sim.park.entrances[0]!;
    const { length } = sim.park.track;
    // A car coming up to the entrance in the outer lanes.
    put(sim, 'car', wrap(e.s - 120, length), LANES - 2);
    (sim as unknown as { arrive: (k: Kind) => boolean }).arrive('walker');
    const walker = sim.movers.find((m) => m.kind === 'walker')!;
    // Pretend it came in at this entrance.
    walker.entrance = e.id;
    walker.join = { s: e.s, p: LANES - 1 };
    expect(sim.canJoin(walker)).toBe(false);
    ticks(sim, 200);
    expect(sim.canJoin(walker)).toBe(true);
  });

  it('brings movers in from the entrances and onto the loop', () => {
    const sim = new ChaosParkSim(seededRng(8));
    sim.start();
    let peak = 0;
    for (let i = 0; i < 1500; i++) {
      sim.step();
      if (sim.phase !== 'playing') break;
      peak = Math.max(peak, sim.movers.filter((m) => m.state === 'track').length);
    }
    expect(peak).toBeGreaterThanOrEqual(3);
    expect(sim.movers.length).toBeLessThanOrEqual(maxMovers(sim.laps) + 3);
  });

  it('allows more movers as the score rises', () => {
    expect(maxMovers(0)).toBeLessThan(maxMovers(40));
    expect(maxMovers(10_000)).toBe(26);
  });

  it('let a fourth and fifth in over the first laps, then ramp up at 0.4 of the pace after ten', () => {
    expect([0, 3, 6, 10, 20, 30, 50, 100, 150, 190].map((l) => maxMovers(l))).toEqual([
      3, 3, 4, 5, 5, 6, 8, 12, 16, 23,
    ]);
    expect([0, 10, 30, 50].map((l) => level(l))).toEqual([0, 10, 18, 26]);
  });

  it('moves to game over after the crash and locks out a hasty retry', () => {
    const sim = playing();
    sim.lives = 1;
    const s = 100;
    put(sim, 'walker', s + 30, 1);
    put(sim, 'car', s, 0);
    while (sim.phase === 'playing') sim.step();
    expect(sim.phase).toBe('crashed');
    ticks(sim, CRASH_TICKS);
    expect(sim.phase).toBe('gameOver');
    sim.start();
    expect(sim.phase).toBe('gameOver');
    ticks(sim, GAME_OVER_LOCKOUT);
    sim.start();
    expect(sim.phase).toBe('playing');
  });

  it('stands still while paused', () => {
    const sim = playing();
    const m = put(sim, 'runner', 100, 0);
    sim.setPaused(true);
    ticks(sim, 50);
    expect(m.s).toBe(100);
  });

  it('grabs the mover nearest a press, anywhere along its body', () => {
    const sim = playing();
    const s = 100;
    const car = put(sim, 'car', s, 0);
    put(sim, 'walker', s + 200, 2);
    sim.step();
    const tail = pose(sim.park.track, car.s - 18, laneOffset(0, 2));
    expect(sim.grab(tail.x, tail.y)?.id).toBe(car.id);
    expect(sim.grab(-500, -500)).toBeNull();
  });

  it('measures lane overlap', () => {
    expect(laneOverlap(0, 1, 1, 1)).toBe(0);
    expect(laneOverlap(0, 2, 1, 1)).toBe(1);
    expect(laneOverlap(0.5, 1, 1, 2)).toBe(0.5);
  });
});

describe('run groups', () => {
  const internals = (sim: ChaosParkSim) =>
    sim as unknown as { arrive: (k: Kind) => boolean; checkTraffic: () => void };

  it('come in as one two-lane pack of 6 to 12 runners doing a single lap', () => {
    const black = new Set<boolean>();
    for (let seed = 1; seed <= 40; seed++) {
      const sim = playing(seed);
      expect(internals(sim).arrive('group')).toBe(true);
      const g = sim.movers.find((m) => m.kind === 'group')!;
      expect(g.width).toBe(2);
      expect(g.crowd).toBeGreaterThanOrEqual(GROUP_SIZE[0]);
      expect(g.crowd).toBeLessThanOrEqual(GROUP_SIZE[1]);
      expect(g.len).toBe(groupLength(g.crowd));
      expect(g.laps).toBe(1);
      expect(g.dir).toBe(1);
      black.add(g.look[0] < 0.5);
    }
    // Both all-black and colourful groups turn up.
    expect(black.size).toBe(2);
  });

  it('score a lap for every runner, then leave', () => {
    const sim = playing();
    const e = sim.park.entrances[0]!;
    const g = put(sim, 'group', e.s, LANES - 2, { laps: 1 });
    g.crowd = 9;
    g.len = groupLength(9);
    ticks(sim, Math.ceil(sim.park.track.length / g.speed) + 2);
    expect(sim.score).toBe(9);
    expect(sim.pops[0]!.value).toBe(9);
    expect(g.state).toBe('leaving');
  });

  it('come 20 to 50 seconds after the laps reach 12, and that long after the last one left, one at a time', () => {
    for (const seed of [6, 7, 8]) {
      const sim = new ChaosParkSim(seededRng(seed));
      sim.start();
      // No crashes or pick-ups; the score is put back where it was set after every tick.
      internals(sim).checkTraffic = () => undefined;
      (sim as unknown as { placePickup: () => boolean }).placePickup = () => false;
      for (let t = 0; t < 600; t++) {
        sim.laps = GROUP_FROM_SCORE - 1;
        sim.step();
      }
      expect(sim.movers.some((m) => m.kind === 'group')).toBe(false);
      sim.laps = GROUP_FROM_SCORE;
      // Each wait: from reaching the score, or from the last group leaving, to the next arriving.
      const waits: number[] = [];
      let since = 0;
      let present = false;
      for (let t = 0; t < 8 * 3600; t++) {
        sim.step();
        sim.laps = GROUP_FROM_SCORE;
        const now = sim.movers.filter((m) => m.kind === 'group');
        expect(now.length).toBeLessThanOrEqual(1);
        if (now.length && !present) waits.push(t - since);
        if (!now.length && present) since = t;
        present = now.length > 0;
      }
      expect(GROUP_INTERVAL_EARLY).toEqual([20 * 60, 50 * 60]);
      // Give or take a moment if every gate is busy.
      for (const w of waits) {
        expect(w).toBeGreaterThanOrEqual(GROUP_INTERVAL_EARLY[0]);
        expect(w).toBeLessThanOrEqual(GROUP_INTERVAL_EARLY[1] + 30);
      }
      expect(waits.length).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('rare visitors', () => {
  it('include a rat every 30 to 55 seconds or so, one at a time', () => {
    const sim = new ChaosParkSim(seededRng(6));
    sim.start();
    (sim as unknown as { checkTraffic: () => void }).checkTraffic = () => undefined;
    sim.laps = 20;
    let rats = 0;
    let lastRat = -1;
    const minutes = 10;
    for (let t = 0; t < minutes * 3600; t++) {
      sim.step();
      sim.drainEvents();
      expect(sim.rats.length).toBeLessThanOrEqual(1);
      const rat = sim.rats[0]?.id ?? -1;
      if (rat !== -1 && rat !== lastRat) rats++;
      lastRat = rat;
    }
    expect(rats).toBeGreaterThanOrEqual(minutes);
    expect(rats).toBeLessThanOrEqual(minutes * 2.2);
  });
});

describe('rats', () => {
  const sendRat = (sim: ChaosParkSim): boolean =>
    (sim as unknown as { sendRat: (kind: string) => boolean }).sendRat('bite');

  it('wait at the kerb, dart out and bite, leaving the person dazed in place', () => {
    const sim = playing();
    const walker = put(sim, 'walker', 100, 0);
    expect(sendRat(sim)).toBe(true);
    expect(sim.drainEvents()).toEqual(['squeak']);
    const rat = sim.rats[0]!;
    expect(rat.state).toBe('lurk');
    ticks(sim, RAT_LURK - 1);
    expect(rat.state).toBe('lurk');
    sim.step();
    expect(rat.state).toBe('dash');
    let bitten = -1;
    for (let t = 0; t < 200 && bitten < 0; t++) {
      sim.step();
      if (sim.drainEvents().includes('bite')) bitten = t;
    }
    expect(bitten).toBeGreaterThanOrEqual(0);
    expect(walker.daze).toBe(DAZE_TICKS);
    const at = walker.s;
    ticks(sim, DAZE_TICKS - 2);
    expect(walker.s).toBe(at);
    expect(walker.daze).toBeGreaterThan(0);
    ticks(sim, 4);
    expect(walker.daze).toBe(0);
    expect(walker.s).not.toBe(at);
    // The rat has run back off the road and gone.
    ticks(sim, 120);
    expect(sim.rats).toHaveLength(0);
  });

  it('only go for people on foot', () => {
    const sim = playing();
    put(sim, 'biker', 100, 0);
    put(sim, 'car', 300, 2);
    put(sim, 'carriage', 500, 0, { laps: Infinity });
    expect(sendRat(sim)).toBe(false);
    put(sim, 'dog', 700, 1);
    expect(sendRat(sim)).toBe(true);
  });

  it('wait on the side of the road nearer their target', () => {
    const sim = playing();
    const { track } = sim.park;
    const inner = put(sim, 'runner', 100, 0);
    sendRat(sim);
    const ratIn = sim.rats[0]!;
    const centreIn = pose(track, inner.s + inner.speed * (RAT_LURK + 30));
    const n =
      track.normals[
        Math.round(wrap(inner.s + inner.speed * (RAT_LURK + 30), track.length) / track.step) %
          track.normals.length
      ]!;
    expect((ratIn.x - centreIn.x) * n.x + (ratIn.y - centreIn.y) * n.y).toBeLessThan(0);
    sim.rats = [];
    sim.movers = [];
    const outer = put(sim, 'runner', 100, 3);
    sendRat(sim);
    const ratOut = sim.rats[0]!;
    const centreOut = pose(track, outer.s + outer.speed * (RAT_LURK + 30));
    expect((ratOut.x - centreOut.x) * n.x + (ratOut.y - centreOut.y) * n.y).toBeGreaterThan(0);
  });

  it('leave a dazed person who cannot be swiped and can be run into', () => {
    const sim = playing();
    sim.lives = 1;
    const walker = put(sim, 'walker', 160, 1);
    const runner = put(sim, 'runner', 60, 1);
    walker.daze = DAZE_TICKS;
    expect(sim.shift(walker.id, 1)).toBe(false);
    expect(sim.setBoost(walker.id, true)).toBe(false);
    let warned = false;
    while (sim.phase === 'playing' && sim.playTicks < 200) {
      sim.step();
      warned ||= runner.warning;
    }
    expect(warned).toBe(true);
    expect(sim.phase).toBe('crashed');
  });

  it('give up and run off when their target leaves the road', () => {
    const sim = playing();
    const walker = put(sim, 'walker', 100, 0);
    sendRat(sim);
    sim.movers = sim.movers.filter((m) => m !== walker);
    sim.step();
    expect(sim.rats[0]!.state).toBe('flee');
    ticks(sim, 60);
    expect(sim.rats).toHaveLength(0);
  });
});

describe('bikers', () => {
  it('shout when they close in on someone on foot', () => {
    for (const kind of ['walker', 'runner', 'dog'] as const) {
      const sim = playing();
      put(sim, kind, 200, 1);
      const bike = put(sim, 'biker', 60, 1);
      let shouted = false;
      while (sim.phase === 'playing' && !shouted && sim.playTicks < 300) {
        sim.step();
        shouted = bike.shout > 0;
      }
      expect(shouted, kind).toBe(true);
      expect(sim.phase).toBe('playing');
    }
  });

  it('keep quiet for others and for people behind them', () => {
    const sim = playing();
    const bike = put(sim, 'biker', 100, 1);
    put(sim, 'car', 0, 0);
    const behind = put(sim, 'walker', 60, 1, { dir: -1 });
    put(sim, 'biker', 260, 1, { speed: KIND_SPECS.biker.speed * 0.5 });
    ticks(sim, 30);
    expect(behind.s).toBeLessThan(bike.s);
    expect(bike.shout).toBe(0);
  });

  it('shout once per close call, and not again straight away', () => {
    const sim = playing();
    const bike = put(sim, 'biker', 60, 1);
    put(sim, 'walker', 200, 1);
    while (bike.shout === 0 && sim.playTicks < 300) sim.step();
    const first = bike.shoutAt;
    expect(bike.shout).toBeGreaterThan(0);
    // Dodge, then come up behind someone else soon after.
    sim.shift(bike.id, 1);
    ticks(sim, 40);
    put(sim, 'runner', bike.s + 60, 2, { speed: KIND_SPECS.runner.speed * 0.5 });
    ticks(sim, 60);
    expect(bike.shoutAt).toBe(first);
  });
});

describe('speed swipes', () => {
  it('speeds a mover up and back down to its usual speed', () => {
    const sim = playing();
    const m = put(sim, 'runner', 100, 1);
    expect(sim.setBoost(m.id, true)).toBe(true);
    expect(m.speed).toBeCloseTo(KIND_SPECS.runner.speed * BOOST);
    expect(sim.setBoost(m.id, true)).toBe(false);
    expect(sim.setBoost(m.id, false)).toBe(true);
    expect(m.speed).toBeCloseTo(KIND_SPECS.runner.speed);
    expect(sim.drainEvents()).toEqual(['boost', 'bump', 'brake']);
  });

  it('lets a boosted mover outrun one that would have caught it', () => {
    const sim = playing();
    const walker = put(sim, 'walker', 160, 1);
    // A slightly quicker walker behind would catch it unboosted.
    const behind = put(sim, 'walker', 100, 1, { speed: KIND_SPECS.walker.speed * 1.08 });
    sim.setBoost(walker.id, true);
    ticks(sim, 600);
    expect(sim.phase).toBe('playing');
    expect(walker.s - behind.s).toBeGreaterThan(60);
  });

  it('finishes laps sooner while boosted', () => {
    const sim = playing();
    const m = put(sim, 'biker', 0, 0, { laps: 5 });
    sim.setBoost(m.id, true);
    ticks(sim, Math.ceil(sim.park.track.length / (m.baseSpeed * BOOST)) + 2);
    expect(sim.score).toBe(1);
  });

  it('can rear-end something when boosted into it', () => {
    const sim = playing();
    sim.lives = 1;
    put(sim, 'runner', 160, 1);
    const behind = put(sim, 'runner', 100, 1);
    sim.setBoost(behind.id, true);
    while (sim.phase === 'playing' && sim.playTicks < 300) sim.step();
    expect(sim.phase).toBe('crashed');
  });
});

describe('ChaosParkGame swipes', () => {
  const setup = () => {
    const scores = { getBest: async () => 0, submit: async () => ({ best: 0, isNewBest: false }) };
    const sfx = { play() {}, unlock() {}, dispose() {} };
    const game = new ChaosParkGame(scores as never, sfx as never, seededRng(3));
    game.sim.start();
    game.sim.movers = [];
    game.sim.park = { ...game.sim.park, shortcuts: [], patches: [] };
    (game.sim as unknown as { spawn: () => void }).spawn = () => undefined;
    const m = put(game.sim, 'runner', 100, 1);
    return { game, m };
  };
  const swipe = (game: ChaosParkGame, m: Mover, dx: number, dy: number) => {
    game.pointerDown(1, m.x, m.y);
    game.pointerMove(1, m.x + dx, m.y + dy);
    game.pointerUp(1);
  };

  it('changes lane on a swipe across the road', () => {
    const { game, m } = setup();
    const out = game.sim.outward(m);
    swipe(game, m, out.x * 30, out.y * 30);
    expect(m.target).toBe(2);
    expect(m.boosted).toBe(false);
  });

  it('boosts on a swipe forward and slows on a swipe back', () => {
    const { game, m } = setup();
    const ahead = game.sim.forward(m);
    swipe(game, m, ahead.x * 30, ahead.y * 30);
    expect(m.boosted).toBe(true);
    expect(m.target).toBe(1);
    swipe(game, m, -ahead.x * 30, -ahead.y * 30);
    expect(m.boosted).toBe(false);
  });

  it('treats forward as the way a wrong-way mover is going', () => {
    const { game, m } = setup();
    m.dir = -1;
    const ahead = game.sim.forward(m);
    const t = game.sim.park.track.tangents[Math.round(m.s / game.sim.park.track.step)]!;
    expect(ahead.x).toBeCloseTo(-t.x);
    swipe(game, m, ahead.x * 30, ahead.y * 30);
    expect(m.boosted).toBe(true);
  });
});

describe('collisions', () => {
  it('stun whoever was run into, and the one that hit them carries on through', () => {
    const sim = playing();
    const walker = put(sim, 'walker', 160, 1);
    const runner = put(sim, 'runner', 100, 1);
    while (sim.lives === LIVES && sim.playTicks < 300) sim.step();
    expect(sim.phase).toBe('playing');
    expect(sim.lives).toBe(LIVES - 1);
    expect(sim.drainEvents()).toContain('hit');
    expect(sim.impacts).toHaveLength(1);
    expect(walker.daze).toBeGreaterThan(STUN_TICKS - 3);
    expect(runner.daze).toBe(0);
    // The runner goes on through and out the other side without a second collision.
    const at = walker.s;
    ticks(sim, 80);
    expect(sim.lives).toBe(LIVES - 1);
    expect(walker.s).toBe(at);
    expect(runner.s).toBeGreaterThan(walker.s + (walker.len + runner.len) / 2);
    ticks(sim, STUN_TICKS);
    expect(walker.daze).toBe(0);
  });

  it('end the run on the third', () => {
    const sim = playing();
    for (let n = 1; n <= LIVES; n++) {
      sim.movers = [];
      put(sim, 'walker', 160, 1);
      put(sim, 'car', 60, 0);
      while (sim.lives > LIVES - n && sim.playTicks < 3000) sim.step();
      expect(sim.lives).toBe(LIVES - n);
      expect(sim.phase).toBe(n < LIVES ? 'playing' : 'crashed');
    }
  });

  it('blame the one that turned into the other', () => {
    const sim = playing();
    const steady = put(sim, 'runner', 100, 1);
    const turner = put(sim, 'runner', 100, 2);
    sim.shift(turner.id, -1);
    while (sim.lives === LIVES && sim.playTicks < 60) sim.step();
    expect(sim.lives).toBe(LIVES - 1);
    expect(steady.daze).toBeGreaterThan(0);
    expect(turner.daze).toBe(0);
  });

  it('blame the faster one in a head-on', () => {
    const sim = playing();
    const bike = put(sim, 'biker', 100, 1);
    const walker = put(sim, 'walker', 200, 1, { dir: -1 });
    while (sim.lives === LIVES && sim.playTicks < 200) sim.step();
    expect(walker.daze).toBeGreaterThan(0);
    expect(bike.daze).toBe(0);
  });

  it('start afresh with every run', () => {
    const sim = playing();
    sim.lives = 1;
    sim.impacts.push({ id: 1, x: 0, y: 0, ticks: 0 });
    sim.toTitle();
    sim.start();
    expect(sim.lives).toBe(LIVES);
    expect(sim.impacts).toHaveLength(0);
  });
});

const lay = (sim: ChaosParkSim, kind: PickupKind, s: number, lane: number) => {
  const at = pose(sim.park.track, s, laneOffset(lane, 1));
  sim.pickups.push({ id: nextId++, kind, s, lane, x: at.x, y: at.y, ticks: 0 });
};

describe('pick-ups', () => {
  it('a heart gives a life back, up to five', () => {
    const sim = playing();
    sim.lives = 1;
    put(sim, 'walker', 100, 1);
    lay(sim, 'heart', 130, 1);
    while (sim.pickups.length && sim.playTicks < 200) sim.step();
    expect(sim.lives).toBe(2);
    expect(sim.drainEvents()).toContain('life');
    sim.lives = MAX_LIVES;
    lay(sim, 'heart', 200, 1);
    while (sim.pickups.length && sim.playTicks < 400) sim.step();
    expect(sim.lives).toBe(MAX_LIVES);
  });

  it('only visitors in its lane take one, and carriages go over duplicates and extra laps', () => {
    const sim = playing();
    put(sim, 'walker', 100, 0);
    put(sim, 'carriage', 300, 2);
    lay(sim, 'heart', 130, 2);
    lay(sim, 'double', 330, 3);
    sim.lives = 1;
    ticks(sim, 120);
    expect(sim.lives).toBe(1);
    expect(sim.pickups).toHaveLength(2);
  });

  it('a run group takes one too, but goes over a duplicate', () => {
    const sim = playing();
    put(sim, 'group', 100, 1, { laps: 1 });
    lay(sim, 'double', 140, 1);
    ticks(sim, 120);
    expect(sim.pickups).toHaveLength(1);
    expect(sim.movers.filter((m) => m.kind === 'group')).toHaveLength(1);
    sim.pickups = [];
    sim.lives = 1;
    const g = sim.movers.find((m) => m.kind === 'group')!;
    lay(sim, 'heart', wrap(g.s + g.dir * 40, sim.park.track.length), 1);
    ticks(sim, 120);
    expect(sim.lives).toBe(2);
    expect(sim.pickups).toHaveLength(0);
  });

  it('go when nobody takes them in time', () => {
    const sim = playing();
    lay(sim, 'double', 100, 0);
    ticks(sim, PICKUP_TICKS - 1);
    expect(sim.pickups).toHaveLength(1);
    sim.step();
    expect(sim.pickups).toHaveLength(0);
  });

  it('a duplicate puts a copy right behind, with the laps still to do, that can land on someone harmlessly', () => {
    const sim = playing();
    const runner = put(sim, 'runner', 100, 1, { laps: 3 });
    runner.lapsDone = 1;
    // Someone walking in the same lane just behind, where the copy will land.
    const walker = put(sim, 'walker', 100 - runner.len - 10 * ART, 1, { speed: 0 });
    lay(sim, 'double', 112, 1);
    sim.step();
    expect(sim.pickups).toHaveLength(0);
    const copy = sim.movers[sim.movers.length - 1]!;
    expect(copy.id).not.toBe(runner.id);
    expect(copy.kind).toBe('runner');
    expect(copy.p).toBe(runner.p);
    expect(copy.laps).toBe(2);
    expect(copy.lapsDone).toBe(0);
    expect(runner.s - copy.s).toBeCloseTo(runner.len + DOUBLE_GAP, 5);
    ticks(sim, 30);
    expect(sim.lives).toBe(LIVES);
    expect(walker.daze).toBe(0);
  });

  it('an invisibility token lets its taker pass through others for the rest of its laps', () => {
    const sim = playing();
    const bike = put(sim, 'biker', 100, 1);
    const walker = put(sim, 'walker', 220, 1);
    lay(sim, 'ghost', 112, 1);
    sim.step();
    expect(bike.ghost).toBe(1);
    while (bike.s < walker.s + 40 && sim.playTicks < 300) sim.step();
    expect(sim.lives).toBe(LIVES);
    expect(walker.daze).toBe(0);
    ticks(sim, 600);
    expect(bike.ghost).toBe(1);
  });

  it('a rainbow star knocks whoever its taker touches off the loop, for the laps they had left', () => {
    const sim = playing();
    const bike = put(sim, 'biker', 100, 1);
    const walker = put(sim, 'walker', 220, 1, { laps: 3 });
    walker.lapsDone = 1;
    lay(sim, 'star', 112, 1);
    sim.step();
    expect(bike.star).toBe(1);
    expect(sim.drainEvents()).toContain('star');
    while (sim.movers.includes(walker) && sim.playTicks < 300) sim.step();
    expect(sim.movers).not.toContain(walker);
    expect(sim.score).toBe(2);
    expect(sim.lives).toBe(LIVES);
    expect(sim.drainEvents()).toContain('knock');
    ticks(sim, 600);
    expect(bike.star).toBe(1);
  });

  it('a rainbow star knocks a carriage off for nothing, and another comes later', () => {
    const sim = playing();
    const bike = put(sim, 'biker', 100, 2);
    const carriage = put(sim, 'carriage', 220, 2, { speed: 0 });
    bike.star = 1;
    while (sim.movers.includes(carriage) && sim.playTicks < 300) sim.step();
    expect(sim.movers).not.toContain(carriage);
    expect(sim.lives).toBe(LIVES);
    expect(sim.score).toBe(0);
    const wait = (sim as unknown as { carriageWait: number }).carriageWait;
    expect(wait).toBeGreaterThanOrEqual(CARRIAGE_RETURN[0] - 1);
    expect(wait).toBeLessThanOrEqual(CARRIAGE_RETURN[1]);
    // Arrivals back on: no carriage until the wait is over, then one.
    delete (sim as unknown as { spawn?: unknown }).spawn;
    sim.movers = sim.movers.filter((m) => m !== bike);
    (sim as unknown as { checkTraffic: () => void }).checkTraffic = () => undefined;
    ticks(sim, wait - 1);
    expect(sim.movers.some((m) => m.kind === 'carriage')).toBe(false);
    ticks(sim, 30);
    expect(sim.movers.some((m) => m.kind === 'carriage')).toBe(true);
  });

  it("fire and turtle tokens change the taker's speed, boosted or not", () => {
    const sim = playing();
    const bike = put(sim, 'biker', 100, 1);
    const base = bike.baseSpeed;
    lay(sim, 'fire', 112, 1);
    sim.step();
    expect(bike.baseSpeed).toBeCloseTo(base * FIRE_SPEED, 9);
    expect(bike.speed).toBeCloseTo(base * FIRE_SPEED, 9);
    expect(sim.drainEvents()).toContain('fire');
    sim.setBoost(bike.id, true);
    lay(sim, 'turtle', bike.s + 14, 1);
    sim.step();
    expect(bike.baseSpeed).toBeCloseTo(base * FIRE_SPEED * TURTLE_SPEED, 9);
    expect(bike.speed).toBeCloseTo(base * FIRE_SPEED * TURTLE_SPEED * BOOST, 9);
    sim.setBoost(bike.id, false);
    expect(bike.speed).toBeCloseTo(bike.baseSpeed, 9);
  });

  it('a strength token adds laps, and a coin adds a point', () => {
    const sim = playing();
    const walker = put(sim, 'walker', 100, 1, { laps: 2 });
    lay(sim, 'strength', 106, 1);
    sim.step();
    expect(walker.laps).toBe(2 + EXTRA_LAPS);
    expect(sim.drainEvents()).toContain('strength');
    lay(sim, 'coin', walker.s + 6, 1);
    sim.step();
    expect(sim.score).toBe(1);
    expect(sim.drainEvents()).toContain('coin');
  });

  it('a skull wrecks its taker as if it had collided, unless it has a star', () => {
    const sim = playing();
    const walker = put(sim, 'walker', 100, 1);
    lay(sim, 'skull', 106, 1);
    sim.step();
    expect(sim.lives).toBe(LIVES - 1);
    expect(walker.daze).toBeGreaterThan(0);
    expect(sim.drainEvents()).toEqual(expect.arrayContaining(['hit', 'skull']));
    const bike = put(sim, 'biker', 300, 2);
    bike.star = 1;
    lay(sim, 'skull', 312, 2);
    sim.step();
    expect(sim.lives).toBe(LIVES - 1);
    expect(bike.daze).toBe(0);
    sim.lives = 1;
    const runner = put(sim, 'runner', 500, 3);
    lay(sim, 'skull', 510, 3);
    sim.step();
    expect(sim.phase).toBe('crashed');
    expect(sim.crash?.ids).toEqual([runner.id]);
    expect(sim.pickups).toHaveLength(0);
  });

  it('a spiral slows the whole game to half speed, then eases it back', () => {
    const sim = playing();
    put(sim, 'walker', 100, 1);
    expect(sim.timeScale).toBe(1);
    lay(sim, 'spiral', 106, 1);
    sim.step();
    expect(sim.timeScale).toBe(WARP_SPEED);
    ticks(sim, WARP_SLOW_TICKS + 1);
    expect(sim.timeScale).toBeGreaterThan(WARP_SPEED);
    expect(sim.timeScale).toBeLessThan(1);
    ticks(sim, WARP_EASE_TICKS - 1);
    expect(sim.timeScale).toBe(1);
  });

  it('come from five laps, one at a time, and never a heart while lives are full', () => {
    const sim = new ChaosParkSim(seededRng(8));
    sim.start();
    sim.laps = PICKUP_FROM_SCORE - 1;
    ticks(sim, 600);
    expect(sim.pickups).toHaveLength(0);
    const kinds = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      sim.laps = Math.max(sim.laps, PICKUP_FROM_SCORE);
      sim.lives = MAX_LIVES;
      sim.step();
      expect(sim.pickups.length).toBeLessThanOrEqual(1);
      for (const p of sim.pickups) kinds.add(p.kind);
      if (sim.phase !== 'playing') break;
    }
    expect(kinds.size).toBeGreaterThan(0);
    expect(kinds.has('heart')).toBe(false);
  });
});

describe('carriage pick-ups', () => {
  it('a carriage takes a token, and it wears off after two of its laps', () => {
    const sim = playing();
    const carriage = put(sim, 'carriage', 300, 2, { laps: Infinity });
    lay(sim, 'ghost', 330, 2);
    lay(sim, 'strength', 330, 3);
    while (carriage.ghost === 0 && sim.playTicks < 200) sim.step();
    expect(carriage.ghost).toBe(1);
    expect(carriage.wearOff).toBe(carriage.lapsDone + 2);
    // Extra laps mean nothing to a carriage, so it leaves that one.
    expect(sim.pickups.map((p) => p.kind)).toEqual(['strength']);
    const done = carriage.lapsDone;
    while (carriage.lapsDone < done + 2 && sim.playTicks < 20_000) sim.step();
    expect(carriage.ghost).toBe(0);
    expect(carriage.wearOff).toBe(Infinity);
  });

  it('a carriage that took super speed goes back to its own speed', () => {
    const sim = playing();
    const carriage = put(sim, 'carriage', 300, 2, { laps: Infinity });
    const speed = carriage.baseSpeed;
    lay(sim, 'fire', 330, 2);
    while (sim.pickups.length && sim.playTicks < 200) sim.step();
    expect(carriage.baseSpeed).toBeCloseTo(speed * FIRE_SPEED);
    const done = carriage.lapsDone;
    while (carriage.lapsDone < done + 2 && sim.playTicks < 20_000) sim.step();
    expect(carriage.baseSpeed).toBeCloseTo(speed);
    expect(carriage.speed).toBeCloseTo(speed);
  });
});

describe('autopilot', () => {
  it('steers out of the way of someone coming the wrong way', () => {
    const sim = playing();
    const runner = put(sim, 'runner', 100, 1, { laps: 5 });
    runner.autopilot = 1;
    put(sim, 'walker', 260, 1, { dir: -1, laps: 5 });
    sim.lives = 1;
    ticks(sim, 200);
    expect(sim.phase).toBe('playing');
    expect(runner.target).not.toBe(1);
  });

  it('slows behind someone slower when both lanes beside it are taken', () => {
    const sim = playing();
    const biker = put(sim, 'biker', 100, 1, { laps: 5 });
    biker.autopilot = 1;
    const walker = put(sim, 'walker', 170, 1, { laps: 5 });
    put(sim, 'dog', 120, 2, { laps: 5 });
    put(sim, 'walker', 110, 0, { laps: 5 });
    sim.lives = 1;
    // It eases off and on as it closes in, so look over the whole stretch.
    let slowed = false;
    for (let i = 0; i < 120; i++) {
      ticks(sim, 1);
      if (biker.autoSlow && biker.speed <= walker.speed) slowed = true;
    }
    expect(sim.phase).toBe('playing');
    expect(slowed).toBe(true);
    expect(loopDelta(biker.s, walker.s, sim.park.track.length)).toBeGreaterThan(0);
  });

  it('is taken from the road like any token', () => {
    const sim = playing();
    const walker = put(sim, 'walker', 100, 0);
    lay(sim, 'autopilot', 130, 0);
    ticks(sim, 60);
    expect(walker.autopilot).toBe(1);
    expect(sim.drainEvents()).toContain('autopilot');
  });
});

describe('streaks', () => {
  it('make every lap worth one more after each ten in a row without losing a life', () => {
    expect([0, 9, 10, 19, 20, 35].map(streakValue)).toEqual([1, 1, 2, 2, 3, 4]);
    const sim = playing();
    sim.cleanLaps = 9;
    const m = put(sim, 'runner', 0, 0, { laps: 3 });
    while (m.lapsDone < 2 && sim.playTicks < 5000) sim.step();
    // The 10th clean lap is still worth 1; the 11th is worth 2.
    expect(sim.laps).toBe(2);
    expect(sim.score).toBe(3);
    expect(sim.drainEvents()).toContain('streak');
  });

  it('start again when a life is lost', () => {
    const sim = playing();
    sim.cleanLaps = 25;
    put(sim, 'walker', 100, 1, { speed: 0 });
    put(sim, 'runner', 60, 1);
    while (sim.lives === LIVES && sim.playTicks < 300) sim.step();
    expect(sim.lives).toBe(LIVES - 1);
    expect(sim.cleanLaps).toBe(0);
  });
});

describe('dusk', () => {
  it('falls from lap 120 over thirty laps', () => {
    expect([0, 120, 135, 150, 500].map(duskAt)).toEqual([0, 0, 0.5, 1, 1]);
  });
});

describe('arrivals', () => {
  it('never let a second car in while one is in the park', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const sim = new ChaosParkSim(seededRng(seed));
      sim.start();
      // No collisions, and a score where cars are common.
      (sim as unknown as { checkTraffic: () => void }).checkTraffic = () => undefined;
      // Nor pick-ups: a duplicate token can copy a car, which is not an arrival.
      (sim as unknown as { placePickup: () => boolean }).placePickup = () => false;
      sim.laps = 60;
      let cars = 0;
      for (let t = 0; t < 4 * 3600; t++) {
        sim.step();
        const now = sim.movers.filter((m) => m.kind === 'car').length;
        expect(now).toBeLessThanOrEqual(1);
        cars = Math.max(cars, now);
      }
      expect(cars).toBe(1);
    }
  });

  it('send cars round only a little faster than bikes', () => {
    expect(KIND_SPECS.car.speed / KIND_SPECS.biker.speed).toBeGreaterThan(1);
    expect(KIND_SPECS.car.speed / KIND_SPECS.biker.speed).toBeLessThan(1.2);
  });
});

describe('patches', () => {
  it('appear at 50 and 100 laps', () => {
    expect([0, 49, 50, 99, 100, 500].map(patchesShown)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(PATCH_SCORES).toEqual([50, 100]);
  });

  it('do nothing until they appear', () => {
    const sim = new ChaosParkSim(seededRng(5));
    sim.start();
    sim.movers = [];
    noArrivals(sim);
    const patch = sim.park.patches[0]!;
    const m = put(sim, 'runner', wrap(patch.s - 40 * ART, sim.park.track.length), patch.lane);
    ticks(sim, 60);
    expect(m.target).toBe(patch.lane);
    expect(sim.drainEvents()).not.toContain('slip');
  });
});

describe('fitting the screen', () => {
  const surface = (w: number, h: number) => {
    // As the canvas does it: the 860 x 600 core (turned on a portrait screen) scaled to fit, the rest showing round it.
    const portrait = h > w;
    const size = portrait ? { width: 600, height: 860 } : { width: 860, height: 600 };
    const fit = Math.min(w / size.width, h / size.height);
    const ox = (w - size.width * fit) / 2;
    const oy = (h - size.height * fit) / 2;
    return {
      size,
      bounds: { left: -ox / fit, top: -oy / fit, right: (w - ox) / fit, bottom: (h - oy) / fit },
    };
  };

  it('makes the frame the shape of the screen, turned for portrait', () => {
    const phone = surface(390, 700);
    const f = frameFor(phone.size, phone.bounds);
    expect(f.hud).toBe('left');
    expect(f.h).toBe(600);
    expect(f.w).toBeGreaterThan(1050);
    const laptop = surface(1280, 760);
    const g = frameFor(laptop.size, laptop.bounds);
    expect(g.hud).toBe('top');
    expect(g.w / g.h).toBeCloseTo(1280 / 760, 1);
    // However wide or square the window, the park fills it.
    const wide = surface(2600, 700);
    const h = frameFor(wide.size, wide.bounds);
    expect(h.w / h.h).toBeCloseTo(2600 / 700, 1);
    const square = surface(700, 700);
    const k = frameFor(square.size, square.bounds);
    expect(k.w / k.h).toBeCloseTo(1, 1);
  });

  it('places the park to fill the screen, and maps touches back onto it', () => {
    for (const [w, h] of [
      [390, 700],
      [1280, 760],
      [768, 1024],
      [2600, 700],
      [700, 700],
    ] as const) {
      const { size, bounds } = surface(w, h);
      const frame = frameFor(size, bounds);
      const place = placePark(frame, size, bounds);
      const toScreen = (x: number, y: number) =>
        place.portrait
          ? { x: place.x0 - y * place.scale, y: place.y0 + x * place.scale }
          : { x: place.x0 + x * place.scale, y: place.y0 + y * place.scale };
      const corners = [toScreen(0, 0), toScreen(frame.w, frame.h)];
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      expect(Math.min(...xs)).toBeCloseTo(bounds.left, 0);
      expect(Math.max(...xs)).toBeCloseTo(bounds.right, 0);
      expect(Math.min(...ys)).toBeCloseTo(bounds.top, 0);
      expect(Math.max(...ys)).toBeCloseTo(bounds.bottom, 0);
      const p = toScreen(123, 45);
      const back = screenToPark(place, p.x, p.y);
      expect(back.x).toBeCloseTo(123);
      expect(back.y).toBeCloseTo(45);
      // On a portrait screen the score runs along the park's left end, which is the top of the screen.
      if (place.portrait) expect(toScreen(0, frame.h / 2).y).toBeCloseTo(bounds.top, 0);
    }
  });

  it('remakes the park on the title card when the screen changes shape, but not during a run', () => {
    const sim = new ChaosParkSim(seededRng(2));
    const phone = { w: 1077, h: 600, hud: 'left' as const };
    sim.fitFrame(phone);
    // The very first frame fits straight away.
    expect(sim.park.frame).toEqual(phone);
    sim.step();
    const tablet = { w: 860, h: 645, hud: 'left' as const };
    const before = sim.park;
    for (let i = 0; i < 5; i++) {
      sim.fitFrame(tablet);
      sim.step();
    }
    expect(sim.park).toBe(before);
    for (let i = 0; i < 30; i++) {
      sim.fitFrame(tablet);
      sim.step();
    }
    expect(sim.park.frame).toEqual(tablet);
    expect(sim.park.season).toBe(before.season);
    sim.start();
    const playing = sim.park;
    for (let i = 0; i < 40; i++) {
      sim.fitFrame(phone);
      sim.step();
    }
    expect(sim.park).toBe(playing);
  });
});

/** A run on a course, cleared like `playing`. */
const onCourse = (id: CourseId, seed = 3): ChaosParkSim => {
  const sim = new ChaosParkSim(seededRng(seed), COURSES[id]);
  sim.start();
  sim.movers = [];
  sim.park = { ...sim.park, shortcuts: [], patches: [] };
  noArrivals(sim);
  return sim;
};

describe('courses', () => {
  it('unlock one after another with a bronze (25) on the course before', () => {
    const best: Record<CourseId, number> = {
      park: 25,
      waters: 24,
      canyon: 0,
      jungle: 0,
      mansion: 0,
    };
    expect(COURSE_IDS.map((id) => unlocked(id, (c) => best[c]))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(COURSE_IDS.map((id) => COURSES[id].unlock)).toEqual([25, 25, 25, 25, 25]);
  });

  it('give bronze at 25, silver at 50 and gold at 100 on every course', () => {
    for (const id of COURSE_IDS)
      expect([0, 24, 25, 49, 50, 99, 100].map((b) => medalFor(COURSES[id], b))).toEqual([
        'none',
        'none',
        'bronze',
        'bronze',
        'silver',
        'silver',
        'gold',
      ]);
  });

  it('make Chaos Park as before, Jungle Jam a five-lane figure of eight and the mansion five lanes round a hall', () => {
    const park = generatePark(seededRng(4));
    expect(park.lanes).toBe(LANES);
    expect(park.cover).toBeNull();
    expect(park.bridge).toBeNull();
    const jungle = generatePark(seededRng(4), undefined, undefined, COURSES.jungle);
    expect(jungle.lanes).toBe(5);
    expect(jungle.bridge).not.toBeNull();
    const mansion = generatePark(seededRng(4), undefined, undefined, COURSES.mansion);
    expect(mansion.lanes).toBe(5);
    expect(mansion.cover).toBeNull();
    expect(mansion.sideRoads.map((r) => r.kind)).toContain('hall');
  });

  it('start later courses further up the difficulty ramp', () => {
    expect(maxMovers(0, COURSES.mansion.levelOffset)).toBeGreaterThan(maxMovers(0));
    const sim = new ChaosParkSim(seededRng(1), COURSES.jungle);
    expect(sim.level).toBe(5);
  });

  it('climb more slowly on later courses, so the Haunted Mansion at 80 laps is where it was at 50', () => {
    const at = (id: CourseId, laps: number) =>
      level(laps, COURSES[id].levelRate) + COURSES[id].levelOffset;
    expect(at('mansion', 80)).toBeCloseTo(level(50) + COURSES.mansion.levelOffset, 0);
    for (let i = 1; i < COURSE_IDS.length; i++) {
      expect(COURSES[COURSE_IDS[i]].levelOffset).toBeGreaterThan(
        COURSES[COURSE_IDS[i - 1]].levelOffset,
      );
      expect(COURSES[COURSE_IDS[i]].levelRate).toBeLessThan(COURSES[COURSE_IDS[i - 1]].levelRate);
    }
  });

  it('can be changed on the title card, with a new park', () => {
    const sim = new ChaosParkSim(seededRng(1));
    sim.setCourse('mansion');
    expect(sim.course.id).toBe('mansion');
    expect(sim.park.lanes).toBe(5);
    sim.start();
    sim.setCourse('park');
    expect(sim.course.id).toBe('mansion');
  });

  it('play for a long while on every course without trouble', () => {
    for (const id of COURSE_IDS) {
      const sim = new ChaosParkSim(seededRng(11), COURSES[id]);
      sim.start();
      sim.laps = 40;
      const seen = new Set<string>();
      for (let t = 0; t < 60 * 240 && sim.phase === 'playing'; t++) {
        sim.step();
        for (const e of sim.drainEvents()) seen.add(e);
        for (const m of sim.movers) seen.add(m.kind);
        // Keep it going: nobody collides.
        sim.lives = 5;
      }
      expect(sim.phase).toBe('playing');
      if (COURSES[id].predator) expect(seen.has('predator')).toBe(true);
    }
  });
});

describe('the train', () => {
  it('speeds up on a swipe and slows back down, but keeps to its lane', () => {
    const sim = onCourse('canyon');
    const train = put(sim, 'carriage', 100, TRAIN_LANE);
    expect(sim.setBoost(train.id, true)).toBe(true);
    expect(train.speed).toBe(train.baseSpeed * BOOST);
    expect(sim.shift(train.id, 1)).toBe(false);
    expect(train.target).toBe(TRAIN_LANE);
    expect(sim.setBoost(train.id, false)).toBe(true);
    expect(train.speed).toBe(train.baseSpeed);
  });
});

describe('arrivals', () => {
  it('wait with their fronts clear of the road', () => {
    for (const id of COURSE_IDS) {
      const sim = new ChaosParkSim(seededRng(5), COURSES[id]);
      sim.start();
      sim.laps = 60;
      let waited = 0;
      for (let t = 0; t < 60 * 90; t++) {
        // Kept going, so even a course with a lot happening has arrivals to wait.
        sim.lives = LIVES;
        sim.step();
        if (sim.phase !== 'playing') continue;
        for (const m of sim.movers) {
          if (!m.waiting || !m.join) continue;
          waited++;
          const edge = sim.park.half - Math.abs(laneOffset(m.join.p, m.width, sim.park));
          const left = m.routeLens[m.routeLens.length - 1]! - m.routeAt;
          if (m.routeAt > 0)
            expect(left).toBeGreaterThanOrEqual(edge + m.len / 2 + JOIN_CLEAR - 1e-6);
        }
      }
      expect(waited).toBeGreaterThan(0);
    }
  });
});

describe('predators', () => {
  it('eat whoever on foot they catch, costing a life and the laps they had', () => {
    const sim = onCourse('waters');
    const walker = put(sim, 'walker', 120, 1);
    put(sim, 'predator', 80, 1);
    let eaten = false;
    for (let t = 0; t < 400 && !eaten; t++) {
      sim.step();
      eaten = sim.drainEvents().includes('eat');
    }
    expect(eaten).toBe(true);
    expect(sim.movers).not.toContain(walker);
    expect(sim.lives).toBe(LIVES - 1);
    expect(sim.score).toBe(0);
  });

  it('collide with anything bigger as usual', () => {
    const sim = onCourse('waters');
    const car = put(sim, 'car', 120, 0, { speed: 0.01 });
    put(sim, 'predator', 70, 0);
    let hit = false;
    for (let t = 0; t < 300 && !hit; t++) {
      sim.step();
      hit = sim.drainEvents().includes('hit');
    }
    expect(hit).toBe(true);
    expect(sim.movers).toContain(car);
    expect(sim.lives).toBe(LIVES - 1);
  });

  it('move a lane at a time toward the nearest person ahead', () => {
    const sim = onCourse('canyon');
    put(sim, 'slow', 300, 3);
    const predator = put(sim, 'predator', 100, 0);
    sim.step();
    expect(predator.target).toBe(1);
    ticks(sim, 20);
    expect(predator.target).toBe(1);
    ticks(sim, 40);
    expect(predator.target).toBe(2);
  });

  it('run straight once close, so a late swipe gets away', () => {
    const sim = onCourse('canyon');
    const walker = put(sim, 'walker', 160, 1);
    const predator = put(sim, 'predator', 100, 1);
    sim.step();
    // Under PREDATOR_COMMIT ticks from catching them: it won't change lanes now.
    expect(predator.turnedAt).toBeGreaterThan(sim.playTicks);
    expect(sim.shift(walker.id, 1)).toBe(true);
    let eaten = false;
    for (let t = 0; t < 200 && !eaten; t++) {
      sim.step();
      eaten = sim.drainEvents().includes('eat');
    }
    expect(eaten).toBe(false);
    expect(predator.target).toBe(1);
    expect(sim.movers).toContain(walker);
    expect(sim.lives).toBe(LIVES);
  });

  it('wander a lane now and then with nobody in sight', () => {
    const sim = onCourse('canyon');
    const predator = put(sim, 'predator', 100, 1);
    const lanes = new Set<number>();
    for (let t = 0; t < 60 * 20; t++) {
      sim.step();
      // Nobody else about, and it stays on the loop.
      predator.lapsDone = 0;
      predator.progress = 0;
      lanes.add(predator.target);
    }
    expect(lanes.size).toBeGreaterThan(1);
  });

  it('score nothing for their lap', () => {
    const sim = onCourse('jungle');
    const predator = put(sim, 'predator', 0, 0, { laps: 1 });
    predator.progress = sim.park.track.length - 1;
    ticks(sim, 4);
    expect(predator.done).toBe(true);
    expect(sim.score).toBe(0);
  });
});

describe('course events', () => {
  const start = (sim: ChaosParkSim): boolean =>
    (sim as unknown as { startEvent: () => boolean }).startEvent();

  it("the fisherman's hook reels out whoever swims into it, without a life", () => {
    const sim = onCourse('waters');
    expect(start(sim)).toBe(true);
    const hook = sim.hooks[0]!;
    ticks(sim, HOOK_CAST);
    expect(hook.state).toBe('set');
    const swimmer = put(sim, 'walker', wrap(hook.s - 20 * ART, sim.park.track.length), hook.lane);
    let reeled = false;
    for (let t = 0; t < 120 && !reeled; t++) {
      sim.step();
      reeled = sim.drainEvents().includes('reel');
    }
    expect(reeled).toBe(true);
    expect(sim.movers).not.toContain(swimmer);
    expect(sim.lives).toBe(LIVES);
    expect(sim.hooks).toHaveLength(0);
  });

  it('the hook snaps on anything two lanes wide', () => {
    const sim = onCourse('waters');
    start(sim);
    const hook = sim.hooks[0]!;
    ticks(sim, HOOK_CAST);
    const lane = Math.min(hook.lane, sim.park.lanes - 2);
    const pair = put(sim, 'dog', wrap(hook.s - 30 * ART, sim.park.track.length), lane);
    let snapped = false;
    for (let t = 0; t < 120 && !snapped; t++) {
      sim.step();
      snapped = sim.drainEvents().includes('snap');
    }
    expect(snapped).toBe(true);
    expect(sim.movers).toContain(pair);
  });

  it('a tumbleweed rolls across every lane, and whoever it touches is stunned without losing a life', () => {
    const sim = onCourse('canyon');
    expect(start(sim)).toBe(true);
    const weed = sim.weeds[0]!;
    const length = sim.park.track.length;
    const lane = weed.dir > 0 ? 2 : 1;
    const m = put(sim, 'walker', wrap(weed.s, length), lane, { speed: 0.001 });
    let hit = false;
    for (let t = 0; t < 400 && !hit; t++) {
      sim.step();
      hit = sim.drainEvents().includes('hit');
    }
    expect(hit).toBe(true);
    expect(m.daze).toBeGreaterThan(0);
    expect(sim.lives).toBe(LIVES);
    expect(sim.phase).toBe('playing');
    expect(sim.weeds).toHaveLength(0);
  });

  it('a bee sting sets its victim swerving, and a haunting changes their speed too', () => {
    for (const id of ['jungle', 'mansion'] as const) {
      const sim = onCourse(id);
      const m = put(sim, 'walker', 100, 1);
      expect(start(sim)).toBe(true);
      expect(sim.rats[0]!.kind).toBe(id === 'jungle' ? 'sting' : 'haunt');
      for (let t = 0; t < 300 && m.swerve === 0; t++) sim.step();
      expect(m.swerve).toBeGreaterThan(SWERVE_TICKS - 5);
      const lanes = new Set<number>();
      const speeds = new Set<number>();
      for (let t = 0; t < SWERVE_TICKS; t++) {
        sim.step();
        lanes.add(m.target);
        speeds.add(Math.round(m.speed * 100));
      }
      expect(lanes.size).toBeGreaterThan(1);
      expect(m.swerve).toBe(0);
      expect(speeds.size > 2).toBe(id === 'mansion');
      expect(m.speed).toBeCloseTo(m.baseSpeed);
    }
  });
});

describe('wild arrivals', () => {
  it('on Jungle Jam, visitors step out of the trees anywhere and back in when done, not by the gates', () => {
    const sim = new ChaosParkSim(seededRng(5), COURSES.jungle);
    sim.start();
    // Enough lives to keep going through the collisions nobody steers round.
    sim.lives = 1000;
    const { track, half } = sim.park;
    const starts: number[] = [];
    let left = 0;
    const seen = new Set<number>();
    for (let t = 0; t < 6000 && sim.phase !== 'gameOver'; t++) {
      for (const m of sim.movers) {
        if (m.state === 'arriving' && !seen.has(m.id)) {
          seen.add(m.id);
          expect(m.entrance).toBe(-1);
          // It starts in the trees, off the road's edge, beside the spot where it joins.
          const near = track.points.reduce(
            (d, p) => Math.min(d, Math.hypot(p.x - m.route[0]!.x, p.y - m.route[0]!.y)),
            Infinity,
          );
          expect(near).toBeGreaterThan(half + 20);
          starts.push(m.join!.s);
        }
        if (m.state === 'leaving' && m.route.length === 3) left++;
      }
      sim.step();
    }
    // Spread round the loop, not bunched at a few gates.
    const quarters = new Set(
      starts.map((s) => Math.floor((wrap(s, track.length) / track.length) * 4)),
    );
    expect(starts.length).toBeGreaterThan(5);
    expect(quarters.size).toBeGreaterThanOrEqual(3);
    expect(left).toBeGreaterThan(0);
  });
});

describe('rapids', () => {
  it('speed up only those in the two lanes that have them, side by side', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const park = generatePark(seededRng(seed), undefined, undefined, COURSES.waters);
      expect(park.rapids.length).toBe(RAPIDS_LANES);
      const [a, b] = park.rapids;
      expect(b!.lane - a!.lane).toBe(1);
      expect([b!.s, b!.len]).toEqual([a!.s, a!.len]);
      expect(b!.lane).toBeLessThan(park.lanes);
    }
    const sim = onCourse('waters');
    const r = sim.park.rapids[0]!;
    const other = (r.lane + 2) % sim.park.lanes;
    sim.park = { ...sim.park, rapids: [r] };
    const fast = put(sim, 'walker', wrap(r.s + 2, sim.park.track.length), r.lane);
    const plain = put(sim, 'walker', wrap(r.s + 2, sim.park.track.length), other);
    const [a, b] = [fast.s, plain.s];
    sim.step();
    expect(wrap(fast.s - a, sim.park.track.length)).toBeGreaterThan(
      wrap(plain.s - b, sim.park.track.length) * 1.2,
    );
  });
});

describe('waves', () => {
  it('push whoever they roll past one lane on, once, and nobody away from them', () => {
    const sim = onCourse('waters');
    const near = put(sim, 'walker', 200, 1, { speed: 0.01 });
    const edge = put(sim, 'walker', 220, 3, { speed: 0.01 });
    const far = put(sim, 'walker', 600, 1, { speed: 0.01 });
    sim.waves = [{ id: 1, s: 200, q: 0, dir: 1, state: 'swell', ticks: 0, hit: [] }];
    ticks(sim, WAVE_SWELL + 10);
    expect(near.target).toBe(1);
    ticks(sim, 60);
    expect(near.target).toBe(2);
    expect(edge.target).toBe(3);
    expect(far.target).toBe(1);
    expect(sim.waves).toEqual([]);
  });

  it('only come on Wild Waters', () => {
    expect(COURSE_IDS.filter((id) => COURSES[id].waves)).toEqual(['waters']);
  });
});

describe('figure of eight', () => {
  it('has gates on whichever side faces the wall, and newcomers join on that side', () => {
    const course = { ...COURSES.jungle, wild: false };
    const sim = new ChaosParkSim(seededRng(2), course);
    sim.start();
    const { track, half, entrances } = sim.park;
    for (const e of entrances) {
      // The mouth of each gate road is off the road, and the gate on the wall.
      const near = track.points.reduce(
        (d, p) => Math.min(d, Math.hypot(p.x - e.throat.x, p.y - e.throat.y)),
        Infinity,
      );
      expect(near).toBeGreaterThan(half);
    }
    expect(entrances.some((e) => e.side < 0)).toBe(true);
  });
});

describe('course obstacles', () => {
  it('are steered round, a lane either way, without slipping', () => {
    const sim = onCourse('waters');
    const rock = { id: 0, s: 300, lane: 1, width: 1, len: 20 * ART };
    sim.park = { ...sim.park, patches: [rock] };
    sim.laps = 60;
    const m = put(sim, 'runner', 200, 1);
    let steered = false;
    for (let t = 0; t < 200; t++) {
      sim.step();
      expect(sim.drainEvents()).not.toContain('slip');
      if (m.target !== 1) steered = true;
      if (Math.abs(m.s - rock.s) < (rock.len + m.len) / 2)
        expect(laneOverlap(m.p, 1, 1, 1)).toBeLessThan(0.5);
    }
    expect(steered).toBe(true);
  });

  it('slime holds whoever steps in it for five seconds', () => {
    const sim = onCourse('mansion');
    const slime = { id: 0, s: 300, lane: 1, width: 1, len: 20 * ART };
    sim.park = { ...sim.park, patches: [slime], cover: null };
    sim.laps = 60;
    const m = put(sim, 'runner', 260, 1);
    for (let t = 0; t < 100 && m.slime === 0; t++) sim.step();
    expect(m.slime).toBe(SLIME_TICKS);
    const at = m.s;
    ticks(sim, SLIME_TICKS - 2);
    expect(m.s).toBe(at);
    ticks(sim, 4);
    expect(m.s).not.toBe(at);
  });

  const mansionSim = () => {
    const sim = new ChaosParkSim(seededRng(3), COURSES.mansion);
    sim.fitFrame({ w: 1040, h: 560, hud: 'top' });
    sim.start();
    sim.movers = [];
    noArrivals(sim);
    return sim;
  };
  const road = (sim: ChaosParkSim, kind: SideRoad['kind']) =>
    sim.park.sideRoads.find((r) => r.kind === kind)!;

  it("the mansion's hall is driven through now and then from the inner two lanes, skipping the stretch round", () => {
    const sim = mansionSim();
    const hall = road(sim, 'hall');
    const length = sim.park.track.length;
    // Always take it.
    (sim as unknown as { rng: () => number }).rng = () => 0;
    const m = put(sim, 'biker', wrap(hall.a - 5, length), 1, { laps: 2 });
    let inside = false;
    for (let t = 0; t < 60 && !inside; t++) {
      sim.step();
      inside = m.state === 'side';
    }
    expect(inside).toBe(true);
    expect(m.side).toBe(hall.id);
    for (let t = 0; t < 2000 && m.state === 'side'; t++) sim.step();
    expect(m.state).toBe('track');
    expect(Math.abs(loopDelta(hall.b, m.s, length))).toBeLessThan(m.speed + 1);
    expect(m.p).toBe(1);
    // It covered the stretch of loop between the ends, not the road it took.
    expect(m.progress).toBeGreaterThan(wrap(hall.b - hall.a, length));
  });

  it("the mansion's hall is left to the outer lanes, cars and predators", () => {
    const sim = mansionSim();
    const hall = road(sim, 'hall');
    (sim as unknown as { rng: () => number }).rng = () => 0;
    const length = sim.park.track.length;
    const movers = [
      put(sim, 'walker', wrap(hall.a - 5, length), 2),
      put(sim, 'car', wrap(hall.a - 60, length), 0),
    ];
    for (let t = 0; t < 120; t++) {
      sim.step();
      for (const m of movers) expect(m.state).toBe('track');
    }
  });

  it('everyone on the inside lane goes round the graveyard, coming back on behind where it left', () => {
    const sim = mansionSim();
    const grave = road(sim, 'graveyard');
    expect(grave.back).toBe(true);
    const length = sim.park.track.length;
    const m = put(sim, 'runner', wrap(grave.a - 5, length), 0, { laps: 3 });
    const outer = put(sim, 'runner', wrap(grave.a - 5, length), 2, { laps: 3 });
    for (let t = 0; t < 30 && m.state !== 'side'; t++) sim.step();
    expect(m.state).toBe('side');
    expect(m.side).toBe(grave.id);
    expect(outer.state).toBe('track');
    const before = m.progress;
    for (let t = 0; t < 3000 && m.state === 'side'; t++) sim.step();
    expect(m.state).toBe('track');
    expect(Math.abs(loopDelta(grave.b, m.s, length))).toBeLessThan(m.speed + 1);
    // Further back round the lap than when it went in, by the stretch between the ends.
    expect(m.progress).toBeLessThan(before);
    // It carries on past the start this time rather than going round again.
    for (let t = 0; t < 60; t++) {
      sim.step();
      expect(m.state).toBe('track');
    }
    expect(loopDelta(grave.a, m.s, length)).toBeGreaterThan(0);
  });

  it('collides two on the same side road, and they can be swiped across its two lanes and sped up', () => {
    const sim = mansionSim();
    const grave = road(sim, 'graveyard');
    const length = sim.park.track.length;
    const slow = put(sim, 'walker', wrap(grave.a - 2, length), 0, { speed: 0.3 });
    for (let t = 0; t < 30 && slow.state !== 'side'; t++) sim.step();
    expect(slow.state).toBe('side');
    expect(sim.shift(slow.id, 1)).toBe(true);
    expect(sim.shift(slow.id, 1)).toBe(false);
    for (let t = 0; t < 40; t++) sim.step();
    expect(slow.p).toBe(1);
    expect(sim.shift(slow.id, -1)).toBe(true);
    for (let t = 0; t < 40; t++) sim.step();
    expect(slow.p).toBe(0);
    const fast = put(sim, 'biker', wrap(grave.a - 2, length), 0);
    expect(sim.setBoost(fast.id, true)).toBe(true);
    const lives = sim.lives;
    for (let t = 0; t < 600 && sim.lives === lives; t++) sim.step();
    expect(sim.lives).toBe(lives - 1);
    expect(fast.state === 'side' || slow.state === 'side').toBe(true);
  });

  const jungleSim = () => {
    const sim = new ChaosParkSim(seededRng(3), COURSES.jungle);
    sim.fitFrame({ w: 1040, h: 560, hud: 'top' });
    sim.start();
    sim.movers = [];
    noArrivals(sim);
    return sim;
  };
  const launch = (sim: ChaosParkSim, kind: Kind | null): Mover => {
    const spec = RIVER_KINDS.find((k) => k.kind === kind) ?? null;
    const ok = (sim as unknown as { launch: (s: typeof spec) => boolean }).launch(spec);
    expect(ok).toBe(true);
    return sim.movers[sim.movers.length - 1]!;
  };

  it("sends traffic down the jungle's river, each one across scoring like a lap", () => {
    const sim = jungleSim();
    expect(sim.park.river).not.toBeNull();
    const canoe = launch(sim, 'biker');
    expect(canoe.state).toBe('river');
    expect(canoe.width).toBe(1);
    ticks(sim, 200);
    const boat = launch(sim, 'car');
    expect(boat.width).toBe(2);
    sim.movers = [canoe];
    const score = sim.score;
    for (let t = 0; t < 5000 && sim.movers.includes(canoe); t++) sim.step();
    expect(sim.movers).not.toContain(canoe);
    expect(sim.score).toBe(score + 1);
    expect(sim.laps).toBe(1);
  });

  it('an alligator in the river eats a swimmer it catches', () => {
    const sim = jungleSim();
    // Never climbing out; everything in the same lane.
    (sim as unknown as { rng: () => number }).rng = () => 0.9;
    const swimmer = launch(sim, 'walker');
    ticks(sim, 120);
    launch(sim, null);
    const lives = sim.lives;
    for (let t = 0; t < 3000 && sim.movers.includes(swimmer); t++) sim.step();
    expect(sim.movers).not.toContain(swimmer);
    expect(sim.lives).toBe(lives - 1);
  });

  it('an alligator now and then climbs out onto a bridge and walks the trail before going into the trees', () => {
    const sim = jungleSim();
    (sim as unknown as { rng: () => number }).rng = () => 0;
    const gator = launch(sim, null);
    const first = sim.park.river!.bridges[0]!;
    for (let t = 0; t < 3000 && gator.state === 'river'; t++) sim.step();
    expect(gator.state).toBe('track');
    expect(gator.river).toBe(true);
    const length = sim.park.track.length;
    expect(Math.abs(loopDelta(first.over.s + first.over.len / 2, gator.s, length))).toBeLessThan(5);
    for (let t = 0; t < 5000 && gator.state === 'track'; t++) sim.step();
    expect(gator.state).toBe('leaving');
  });

  it('drops someone one lane wide through the gap in the plank bridge, down the river and out for a point', () => {
    const sim = jungleSim();
    const river = sim.park.river!;
    const plank = river.bridges.find((b) => b.planks)!;
    expect(plank).toBe(river.bridges[0]);
    const walker = put(
      sim,
      'walker',
      wrap(plank.cross - 40, sim.park.track.length),
      river.gaps[0]!,
      {
        laps: 10,
      },
    );
    let fell = false;
    for (let t = 0; t < 600 && walker.state === 'track'; t++) {
      sim.step();
      fell ||= sim.drainEvents().includes('hit');
    }
    expect(walker.state).toBe('river');
    expect(walker.river).toBe(true);
    expect(fell).toBe(true);
    const score = sim.score;
    for (let t = 0; t < 5000 && sim.movers.includes(walker); t++) sim.step();
    expect(sim.movers).not.toContain(walker);
    expect(sim.score).toBe(score + 1);
  });

  it('a coyote drops TNT from the canyon bridge that blows away whoever is by it in that lane, for one life', () => {
    const sim = onCourse('canyon');
    (sim as unknown as { dropTnt: () => void }).dropTnt();
    const t = sim.tnts[0]!;
    const near = put(sim, 'walker', t.s, t.lane, { speed: 0 });
    const other = put(sim, 'walker', t.s, (t.lane + 2) % sim.park.lanes, { speed: 0 });
    const lives = sim.lives;
    let dropped = false;
    let boom = false;
    let warned = false;
    for (let k = 0; k < TNT_RUN + TNT_FUSE + 5; k++) {
      sim.step();
      const events = sim.drainEvents();
      dropped ||= events.includes('drop');
      boom ||= events.includes('boom');
      warned ||= near.warning;
    }
    expect([dropped, boom, warned]).toEqual([true, true, true]);
    expect(sim.movers).not.toContain(near);
    expect(sim.movers).toContain(other);
    expect(sim.lives).toBe(lives - 1);
    expect(sim.tnts).toHaveLength(0);
  });

  it('sends the TNT coyote now and then from lap 15 on Dusty Canyon only', () => {
    for (const id of ['canyon', 'jungle'] as const) {
      const sim = new ChaosParkSim(seededRng(5), COURSES[id]);
      sim.start();
      sim.endless = true;
      sim.laps = TNT_FROM_SCORE;
      let seen = false;
      for (let k = 0; k < TNT_INTERVAL[1] + 10 && !seen && sim.phase === 'playing'; k++) {
        sim.step();
        seen = sim.tnts.length > 0;
      }
      expect(seen).toBe(id === 'canyon');
    }
  });

  it('a jeep steps across the plank bridge into lanes with planks', () => {
    const sim = jungleSim();
    const river = sim.park.river!;
    const plank = river.bridges.find((b) => b.planks)!;
    const lane = Math.min(river.gaps[0]!, sim.park.lanes - 2);
    const car = put(sim, 'car', wrap(plank.cross - 120, sim.park.track.length), lane, { laps: 10 });
    for (let t = 0; t < 300; t++) sim.step();
    expect(car.state).toBe('track');
    expect(laneOverlap(car.target, 2, river.gaps[0]!, 1)).toBeLessThanOrEqual(0);
  });

  it('loses a second plank from level 50, once nobody is on it', () => {
    const sim = jungleSim();
    const river = sim.park.river!;
    expect(river.gaps).toHaveLength(2);
    const gone = () => (sim as unknown as { planksGone: number }).planksGone;
    ticks(sim, 5);
    expect(gone()).toBe(1);
    sim.laps = 400;
    ticks(sim, 5);
    expect(gone()).toBe(2);
  });

  it("slows the jungle's gorillas", () => {
    const park = new ChaosParkSim(seededRng(4));
    const jungle = new ChaosParkSim(seededRng(4), COURSES.jungle);
    const make = (sim: ChaosParkSim) => {
      (sim as unknown as { rng: () => number }).rng = () => 0.5;
      return (sim as unknown as { create: (k: Kind) => Mover }).create('biker');
    };
    expect(make(jungle).speed).toBeCloseTo(make(park).speed * 0.8, 10);
  });

  it("swipes river traffic across the river's three lanes", () => {
    const sim = jungleSim();
    (sim as unknown as { rng: () => number }).rng = () => 0;
    const boat = launch(sim, 'car');
    expect(boat.p).toBe(0);
    expect(sim.shift(boat.id, 1)).toBe(true);
    expect(sim.shift(boat.id, 1)).toBe(false);
    expect(sim.setBoost(boat.id, true)).toBe(true);
    ticks(sim, 60);
    expect(boat.p).toBe(1);
    expect(sim.grab(boat.x, boat.y)).toBe(boat);
  });
});

describe('title', () => {
  const titleGame = () => {
    const scores = { getBest: async () => 0, submit: async () => ({ best: 0, isNewBest: false }) };
    const played: string[] = [];
    const sfx = { play: (name: string) => played.push(name), unlock() {}, dispose() {} };
    const game = new ChaosParkGame(scores as never, sfx as never, seededRng(3));
    return { game, played };
  };

  it('has a crowd going round behind it on autopilot, kept to its first few laps', () => {
    const { game } = titleGame();
    for (let i = 0; i < 60 * 60; i++) game.frame(1000 / 60);
    const demo = game.demo!;
    expect(demo.park).toBe(game.sim.park);
    expect(demo.movers.length).toBeGreaterThan(0);
    expect(demo.movers.every((m) => m.autopilot > 0)).toBe(true);
    expect(demo.laps).toBeLessThanOrEqual(DEMO_LAPS);
    expect(demo.phase).toBe('playing');
    expect(game.sim.phase).toBe('title');
    expect(game.sim.score).toBe(0);
    game.sim.start();
    game.frame(1000 / 60);
    expect(game.demo).toBeNull();
  });

  it('switches sound on and off with its sound button', () => {
    const { game, played } = titleGame();
    let muted = false;
    game.sound = { muted: () => muted, toggle: () => (muted = !muted) };
    const b = soundButton(game.bounds);
    game.pointerDown(1, b.x + b.w / 2, b.y + b.h / 2);
    expect(muted).toBe(true);
    expect(game.sim.phase).toBe('title');
    game.pointerDown(1, b.x + b.w / 2, b.y + b.h / 2);
    expect(muted).toBe(false);
    expect(played).toContain('click');
  });
});
