import { describe, expect, it } from 'vitest';
import type { Runway } from './airfield';
import {
  CRASH_TICKS,
  GAME_OVER_LOCKOUT,
  HEIGHT,
  KIND_SPECS,
  LAND_TICKS,
  SPAWN_WARNING,
  WIDTH,
  type Kind,
} from './constants';
import { seededRng } from './geometry';
import { FlightsSim, maxAircraft, praiseFor, type Aircraft } from './sim';

const ticks = (sim: FlightsSim, n: number): void => {
  for (let i = 0; i < n; i++) sim.step();
};

/** A sim in play with no arrivals of its own, so tests control every aircraft. */
const playing = (seed = 3): FlightsSim => {
  const sim = new FlightsSim(seededRng(seed));
  sim.start();
  (sim as unknown as { spawnTimer: number }).spawnTimer = Number.POSITIVE_INFINITY;
  return sim;
};

let nextId = 1000;
const place = (sim: FlightsSim, kind: Kind, x: number, y: number, heading = 0): Aircraft => {
  const a: Aircraft = {
    id: nextId++,
    kind,
    fast: false,
    radius: KIND_SPECS[kind].radius,
    speed: KIND_SPECS[kind].speed,
    x,
    y,
    heading,
    prevX: x,
    prevY: y,
    prevHeading: heading,
    state: 'flying',
    entered: true,
    path: [],
    target: null,
    landTicks: 0,
    landFrom: { x, y },
    landRoll: 0,
    warning: false,
    age: 0,
  };
  sim.aircraft.push(a);
  return a;
};

const jetRunway = (sim: FlightsSim): Runway =>
  sim.field.zones.find((z): z is Runway => z.type === 'runway' && z.kind === 'jet')!;

/** Draws from an aircraft through each point, the way a pointer drag would. */
const draw = (sim: FlightsSim, a: Aircraft, points: readonly [number, number][]): void => {
  expect(sim.beginPath(a.x, a.y)).toBe(true);
  for (const [x, y] of points) sim.extendPath(x, y);
  sim.endPath();
};

describe('FlightsSim', () => {
  it('keeps the title airfield for the first run and builds a new one for a retry', () => {
    const sim = new FlightsSim(seededRng(1));
    const titleField = sim.field;
    sim.start();
    expect(sim.phase).toBe('playing');
    expect(sim.field).toBe(titleField);
    place(sim, 'jet', 300, 300);
    place(sim, 'jet', 310, 300);
    sim.step();
    ticks(sim, CRASH_TICKS + GAME_OVER_LOCKOUT);
    expect(sim.phase).toBe('gameOver');
    sim.start();
    expect(sim.phase).toBe('playing');
    expect(sim.field).not.toBe(titleField);
  });

  it('grabs the nearest aircraft in reach, and nothing out of reach', () => {
    const sim = playing();
    const near = place(sim, 'light', 400, 300);
    place(sim, 'light', 470, 300);
    expect(sim.beginPath(410, 300)).toBe(true);
    expect(sim.drawing).toBe(near.id);
    expect(sim.drainEvents()).toEqual(['pick']);
    sim.endPath();
    expect(sim.beginPath(800, 600)).toBe(false);
  });

  it('spaces path points evenly, splitting long pointer moves', () => {
    const sim = playing();
    const a = place(sim, 'light', 100, 300);
    sim.beginPath(100, 300);
    sim.extendPath(170, 300);
    expect(a.path.length).toBe(10);
    for (let i = 1; i < a.path.length; i++) expect(a.path[i]!.x - a.path[i - 1]!.x).toBeCloseTo(7);
  });

  it('flies along its path, then straight on its last heading', () => {
    const sim = playing();
    const a = place(sim, 'light', 300, 300, 0);
    draw(sim, a, [[300, 360]]);
    ticks(sim, 40);
    expect(a.x).toBeCloseTo(300);
    expect(a.y).toBeGreaterThan(300);
    expect(a.heading).toBeCloseTo(Math.PI / 2);
    ticks(sim, 200);
    expect(a.path).toEqual([]);
    expect(a.y).toBeGreaterThan(360);
    expect(a.x).toBeCloseTo(300);
  });

  it('locks a path drawn onto the matching runway and lands at the end of it', () => {
    const sim = playing();
    const r = jetRunway(sim);
    const ux = Math.cos(r.angle);
    const uy = Math.sin(r.angle);
    const a = place(sim, 'jet', r.x - ux * 120, r.y - uy * 120, r.angle);
    draw(sim, a, [
      [r.x - ux * 40, r.y - uy * 40],
      [r.x + ux * 40, r.y + uy * 40],
    ]);
    expect(a.target?.zone).toBe(r);
    expect(sim.drainEvents()).toEqual(['pick', 'lock']);

    let guard = 0;
    while (a.state === 'flying' && guard++ < 2000) sim.step();
    expect(a.state).toBe('landing');
    expect(sim.score).toBe(1);
    expect(sim.drainEvents()).toContain('land');
    ticks(sim, LAND_TICKS);
    expect(sim.aircraft).not.toContain(a);
  });

  it("won't land an aircraft on another kind's zone", () => {
    const sim = playing();
    const r = jetRunway(sim);
    const ux = Math.cos(r.angle);
    const uy = Math.sin(r.angle);
    const a = place(sim, 'light', r.x - ux * 120, r.y - uy * 120, r.angle);
    draw(sim, a, [[r.x + ux * 40, r.y + uy * 40]]);
    expect(a.target).toBeNull();
  });

  it('warns once when aircraft get close, and crashes them when they touch', () => {
    const sim = playing();
    const a = place(sim, 'heli', 400, 300, 0);
    const b = place(sim, 'heli', 400 + a.radius * 2 + 30, 300, Math.PI);
    a.speed = b.speed = 0.1;
    sim.step();
    expect(a.warning && b.warning).toBe(true);
    expect(sim.drainEvents()).toEqual(['alert']);
    sim.step();
    expect(sim.drainEvents()).toEqual([]);

    b.x = a.x + 10;
    sim.step();
    expect(sim.phase).toBe('crashed');
    expect(sim.crash?.ids).toEqual([a.id, b.id]);
    expect(sim.drainEvents()).toContain('crash');
    const x = a.x;
    ticks(sim, CRASH_TICKS - 1);
    expect(a.x).toBe(x);
    expect(sim.phase).toBe('crashed');
    sim.step();
    expect(sim.phase).toBe('gameOver');
  });

  it("doesn't count a landing aircraft in collisions", () => {
    const sim = playing();
    const a = place(sim, 'jet', 400, 300);
    a.state = 'landing';
    a.target = { zone: jetRunway(sim), at: { x: 400, y: 300 } };
    place(sim, 'jet', 405, 300);
    sim.step();
    expect(sim.phase).toBe('playing');
  });

  it('turns aircraft back in at the edges', () => {
    const sim = playing();
    const a = place(sim, 'jet', WIDTH - 60, 200, 0);
    for (let i = 0; i < 2000; i++) {
      sim.step();
      expect(a.x).toBeLessThan(WIDTH);
      expect(a.x).toBeGreaterThan(0);
      expect(a.y).toBeGreaterThan(0);
      expect(a.y).toBeLessThan(HEIGHT);
    }
  });

  it('warns of arrivals before they appear, and caps how many are in the air', () => {
    const sim = new FlightsSim(seededRng(5));
    sim.start();
    let firstSeen = -1;
    for (let t = 0; t < 4000; t++) {
      sim.step();
      if (firstSeen < 0 && sim.arrivals.length > 0) firstSeen = t;
      const airborne = sim.aircraft.filter((a) => a.state === 'flying').length;
      expect(airborne + sim.arrivals.length).toBeLessThanOrEqual(maxAircraft(sim.score));
      // Keep the sky from filling up with collisions while it runs.
      sim.aircraft = sim.aircraft.filter((a) => !a.entered);
    }
    expect(firstSeen).toBeGreaterThanOrEqual(0);
    expect(sim.phase).toBe('playing');
  });

  it('launches an arrival from outside the field once its warning runs out', () => {
    const sim = playing();
    sim.arrivals.push({
      x: 26,
      y: 300,
      kind: 'heli',
      fast: false,
      heading: 0,
      ticks: SPAWN_WARNING,
    });
    ticks(sim, SPAWN_WARNING - 1);
    expect(sim.aircraft).toHaveLength(0);
    sim.step();
    expect(sim.aircraft).toHaveLength(1);
    expect(sim.aircraft[0]!.x).toBeLessThan(0);
    expect(sim.aircraft[0]!.entered).toBe(false);
  });

  it('allows more aircraft as the score rises, up to a limit', () => {
    expect(maxAircraft(0)).toBe(3);
    expect(maxAircraft(20)).toBeGreaterThan(maxAircraft(0));
    expect(maxAircraft(10_000)).toBe(14);
  });

  it('praises landings in quick succession', () => {
    expect(praiseFor(2)).toBe('NICE');
    expect(praiseFor(5)).toBe('PERFECT');
    expect(praiseFor(50)).toBe('MARVELLOUS');
  });

  it('runs twice as fast in fast-forward', () => {
    const slow = playing();
    const fast = playing();
    fast.toggleFast();
    const a = place(slow, 'jet', 300, 300);
    const b = place(fast, 'jet', 300, 300);
    ticks(slow, 30);
    ticks(fast, 30);
    expect(b.x - 300).toBeCloseTo((a.x - 300) * 2);
  });

  it('freezes while paused and ignores drawing', () => {
    const sim = playing();
    const a = place(sim, 'jet', 300, 300);
    sim.setPaused(true);
    ticks(sim, 30);
    expect(a.x).toBe(300);
    expect(sim.beginPath(300, 300)).toBe(false);
  });

  it('only returns to the title after the lockout', () => {
    const sim = playing();
    place(sim, 'jet', 300, 300);
    place(sim, 'jet', 305, 300);
    sim.step();
    ticks(sim, CRASH_TICKS);
    expect(sim.toTitle()).toBe(false);
    ticks(sim, GAME_OVER_LOCKOUT);
    expect(sim.toTitle()).toBe(true);
    expect(sim.phase).toBe('title');
    expect(sim.aircraft).toEqual([]);
    expect(sim.score).toBe(0);
  });
});
