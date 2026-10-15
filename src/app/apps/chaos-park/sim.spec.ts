import { describe, expect, it } from 'vitest';
import {
  BOOST,
  CRASH_TICKS,
  DAZE_TICKS,
  GAME_OVER_LOCKOUT,
  GROUP_SIZE,
  KIND_SPECS,
  LANES,
  RAT_LURK,
  groupLength,
  type Kind,
} from './constants';
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

  it('slides movers a lane on a patch, whatever the season', () => {
    const sim = new ChaosParkSim(seededRng(5));
    sim.park = generatePark(seededRng(5), 'summer');
    sim.start();
    sim.movers = [];
    noArrivals(sim);
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

  it('are rare and never two at once', () => {
    const sim = new ChaosParkSim(seededRng(6));
    sim.start();
    // No crashes, and a score high enough for groups and rats from the start.
    internals(sim).checkTraffic = () => undefined;
    sim.score = 20;
    const groups = new Set<number>();
    let rats = 0;
    let lastRat = -1;
    const minutes = 10;
    for (let t = 0; t < minutes * 3600; t++) {
      sim.step();
      sim.drainEvents();
      const now = sim.movers.filter((m) => m.kind === 'group');
      expect(now.length).toBeLessThanOrEqual(1);
      for (const g of now) groups.add(g.id);
      expect(sim.rats.length).toBeLessThanOrEqual(1);
      const rat = sim.rats[0]?.id ?? -1;
      if (rat !== -1 && rat !== lastRat) rats++;
      lastRat = rat;
    }
    // Roughly one every 40 to 70 seconds for groups (after a full wait for the first), 30 to 55 for rats.
    expect(groups.size).toBeGreaterThanOrEqual(minutes * 0.6);
    expect(groups.size).toBeLessThanOrEqual(minutes * 1.6);
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

describe('screenToPark', () => {
  it('leaves landscape alone and turns portrait a quarter back', () => {
    expect(screenToPark({ width: 860, height: 600 }, 10, 20)).toEqual({ x: 10, y: 20 });
    // Portrait screens show the park turned clockwise: its top edge runs down the right of the screen.
    expect(screenToPark({ width: 600, height: 860 }, 600, 0)).toEqual({ x: 0, y: 0 });
    expect(screenToPark({ width: 600, height: 860 }, 0, 860)).toEqual({ x: 860, y: 600 });
  });
});
