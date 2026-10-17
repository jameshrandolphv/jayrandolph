import { describe, expect, it } from 'vitest';
import {
  ART,
  BOOST,
  MAX_HITS,
  PATCH_SCORES,
  STUN_TICKS,
  CRASH_TICKS,
  DAZE_TICKS,
  GAME_OVER_LOCKOUT,
  GROUP_FROM_SCORE,
  GROUP_INTERVAL,
  GROUP_SIZE,
  KIND_SPECS,
  LANES,
  RAT_LURK,
  groupLength,
  type Kind,
} from './constants';
import { ChaosParkGame, frameFor, placePark, screenToPark } from './game';
import { generatePark, laneOffset, pose, seededRng, wrap } from './park';
import { ChaosParkSim, laneOverlap, lapsLeft, maxMovers, patchesShown, type Mover } from './sim';

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
  const at = pose(sim.park.track, s, laneOffset(p, spec.width));
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
    sim.hits = MAX_HITS - 1;
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
    sim.hits = MAX_HITS - 1;
    const s = 100;
    put(sim, 'runner', s, 0);
    put(sim, 'walker', s + 150, 0, { dir: -1 });
    while (sim.phase === 'playing' && sim.playTicks < 300) sim.step();
    expect(sim.phase).toBe('crashed');
  });

  it('counts a two-lane mover as in both its lanes', () => {
    const sim = playing();
    sim.hits = MAX_HITS - 1;
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
    sim.score = PATCH_SCORES[0]!;
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
    expect(sim.movers.length).toBeLessThanOrEqual(maxMovers(sim.score) + 3);
  });

  it('allows more movers as the score rises', () => {
    expect(maxMovers(0)).toBeLessThan(maxMovers(40));
    expect(maxMovers(10_000)).toBe(22);
  });

  it('moves to game over after the crash and locks out a hasty retry', () => {
    const sim = playing();
    sim.hits = MAX_HITS - 1;
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

  it('come the moment the score reaches 10, then every 45 to 65 seconds, never two at once', () => {
    for (const seed of [6, 7, 8]) {
      const sim = new ChaosParkSim(seededRng(seed));
      sim.start();
      // No crashes; the score is put back where it was set after every tick.
      internals(sim).checkTraffic = () => undefined;
      for (let t = 0; t < 600; t++) {
        sim.score = GROUP_FROM_SCORE - 1;
        sim.step();
      }
      expect(sim.movers.some((m) => m.kind === 'group')).toBe(false);
      sim.score = GROUP_FROM_SCORE;
      const arrivals: number[] = [];
      const seen = new Set<number>();
      for (let t = 0; t < 8 * 3600; t++) {
        sim.step();
        sim.score = GROUP_FROM_SCORE;
        const now = sim.movers.filter((m) => m.kind === 'group');
        expect(now.length).toBeLessThanOrEqual(1);
        for (const g of now) {
          if (seen.has(g.id)) continue;
          seen.add(g.id);
          arrivals.push(t);
        }
      }
      // Straight away (give or take a moment if every gate is busy)...
      expect(arrivals[0]!).toBeLessThan(30);
      // ...then 45 to 65 seconds apart.
      for (let k = 1; k < arrivals.length; k++) {
        const gap = arrivals[k]! - arrivals[k - 1]!;
        expect(gap).toBeGreaterThanOrEqual(GROUP_INTERVAL[0]);
        expect(gap).toBeLessThanOrEqual(GROUP_INTERVAL[1] + 30);
      }
      expect(GROUP_INTERVAL).toEqual([45 * 60, 65 * 60]);
      expect(arrivals.length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('rare visitors', () => {
  it('include a rat every 30 to 55 seconds or so, one at a time', () => {
    const sim = new ChaosParkSim(seededRng(6));
    sim.start();
    (sim as unknown as { checkTraffic: () => void }).checkTraffic = () => undefined;
    sim.score = 20;
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
    (sim as unknown as { sendRat: () => boolean }).sendRat();

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
    sim.hits = MAX_HITS - 1;
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
    sim.hits = MAX_HITS - 1;
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
    while (sim.hits === 0 && sim.playTicks < 300) sim.step();
    expect(sim.phase).toBe('playing');
    expect(sim.hits).toBe(1);
    expect(sim.drainEvents()).toContain('hit');
    expect(sim.impacts).toHaveLength(1);
    expect(walker.daze).toBeGreaterThan(STUN_TICKS - 3);
    expect(runner.daze).toBe(0);
    // The runner goes on through and out the other side without a second collision.
    const at = walker.s;
    ticks(sim, 80);
    expect(sim.hits).toBe(1);
    expect(walker.s).toBe(at);
    expect(runner.s).toBeGreaterThan(walker.s + (walker.len + runner.len) / 2);
    ticks(sim, STUN_TICKS);
    expect(walker.daze).toBe(0);
  });

  it('end the run on the third', () => {
    const sim = playing();
    for (let n = 1; n <= MAX_HITS; n++) {
      sim.movers = [];
      put(sim, 'walker', 160, 1);
      put(sim, 'car', 60, 0);
      while (sim.hits < n && sim.playTicks < 3000) sim.step();
      expect(sim.hits).toBe(n);
      expect(sim.phase).toBe(n < MAX_HITS ? 'playing' : 'crashed');
    }
  });

  it('blame the one that turned into the other', () => {
    const sim = playing();
    const steady = put(sim, 'runner', 100, 1);
    const turner = put(sim, 'runner', 100, 2);
    sim.shift(turner.id, -1);
    while (sim.hits === 0 && sim.playTicks < 60) sim.step();
    expect(sim.hits).toBe(1);
    expect(steady.daze).toBeGreaterThan(0);
    expect(turner.daze).toBe(0);
  });

  it('blame the faster one in a head-on', () => {
    const sim = playing();
    const bike = put(sim, 'biker', 100, 1);
    const walker = put(sim, 'walker', 200, 1, { dir: -1 });
    while (sim.hits === 0 && sim.playTicks < 200) sim.step();
    expect(walker.daze).toBeGreaterThan(0);
    expect(bike.daze).toBe(0);
  });

  it('start afresh with every run', () => {
    const sim = playing();
    sim.hits = 2;
    sim.impacts.push({ id: 1, x: 0, y: 0, ticks: 0 });
    sim.toTitle();
    sim.start();
    expect(sim.hits).toBe(0);
    expect(sim.impacts).toHaveLength(0);
  });
});

describe('arrivals', () => {
  it('never let a second car in while one is in the park', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const sim = new ChaosParkSim(seededRng(seed));
      sim.start();
      // No collisions, and a score where cars are common.
      (sim as unknown as { checkTraffic: () => void }).checkTraffic = () => undefined;
      sim.score = 60;
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
  it('appear at 25, 50 and 100 points', () => {
    expect([0, 24, 25, 49, 50, 99, 100, 500].map(patchesShown)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(PATCH_SCORES).toEqual([25, 50, 100]);
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
