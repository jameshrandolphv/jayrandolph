import { describe, expect, it } from 'vitest';
import { BOOST, CRASH_TICKS, GAME_OVER_LOCKOUT, KIND_SPECS, LANES, type Kind } from './constants';
import { ChaosParkGame, screenToPark } from './game';
import { generatePark, laneOffset, pose, seededRng, wrap } from './park';
import { ChaosParkSim, laneOverlap, lapsLeft, maxMovers, type Mover } from './sim';

const ticks = (sim: ChaosParkSim, n: number): void => {
  for (let i = 0; i < n; i++) sim.step();
};

/** Stops anything arriving, so tests control every mover. */
const noArrivals = (sim: ChaosParkSim): void => {
  (sim as unknown as { spawn: () => void }).spawn = () => undefined;
};

/**
 * A run with the starting carriage cleared away, nothing arriving, and no short cuts or ice, so movers stay where
 * tests put them.
 */
const playing = (seed = 3): ChaosParkSim => {
  const sim = new ChaosParkSim(seededRng(seed));
  sim.start();
  sim.movers = [];
  sim.park = { ...sim.park, shortcuts: [], ice: [] };
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
    onIce: new Set(),
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
    const s = 100;
    put(sim, 'runner', s, 0);
    put(sim, 'walker', s + 150, 0, { dir: -1 });
    ticks(sim, 200);
    expect(sim.phase).toBe('crashed');
  });

  it('counts a two-lane mover as in both its lanes', () => {
    const sim = playing();
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

  it('slides movers a lane on ice', () => {
    const sim = new ChaosParkSim(seededRng(5));
    sim.park = generatePark(seededRng(5), 'winter');
    sim.start();
    sim.movers = [];
    noArrivals(sim);
    const patch = sim.park.ice[0]!;
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
    game.sim.park = { ...game.sim.park, shortcuts: [], ice: [] };
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

describe('screenToPark', () => {
  it('leaves landscape alone and turns portrait a quarter back', () => {
    expect(screenToPark({ width: 860, height: 600 }, 10, 20)).toEqual({ x: 10, y: 20 });
    // Portrait screens show the park turned clockwise: its top edge runs down the right of the screen.
    expect(screenToPark({ width: 600, height: 860 }, 600, 0)).toEqual({ x: 0, y: 0 });
    expect(screenToPark({ width: 600, height: 860 }, 0, 860)).toEqual({ x: 860, y: 600 });
  });
});
