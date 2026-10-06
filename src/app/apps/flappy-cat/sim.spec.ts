import { describe, expect, it } from 'vitest';
import { CAT_RADIUS, CAT_X, FIRST_PIPE_X, GAME_OVER_LOCKOUT, GRAVITY, GROUND_Y, PIPE_GAP, PIPE_W } from './constants';
import { FlappySim, circleHitsRect } from './sim';

const ticks = (sim: FlappySim, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};

const playing = (rng = () => 0.5) => {
  const sim = new FlappySim(rng);
  sim.start();
  sim.flap();
  sim.drainEvents();
  return sim;
};

describe('circleHitsRect', () => {
  const rect = { x: 10, y: 10, w: 10, h: 10 };

  it('detects overlap and clearance', () => {
    expect(circleHitsRect(15, 15, 2, rect)).toBe(true);
    expect(circleHitsRect(8, 15, 2, rect)).toBe(true);
    expect(circleHitsRect(7, 15, 2, rect)).toBe(false);
  });

  it('measures corners by distance, not by box', () => {
    expect(circleHitsRect(8, 8, 2, rect)).toBe(false);
    expect(circleHitsRect(8.6, 8.6, 2, rect)).toBe(true);
  });
});

describe('FlappySim', () => {
  it('moves title -> ready -> playing and ignores flaps before ready', () => {
    const sim = new FlappySim();
    sim.flap();
    expect(sim.phase).toBe('title');
    sim.start();
    expect(sim.phase).toBe('ready');
    sim.flap();
    expect(sim.phase).toBe('playing');
  });

  it('applies gravity and flap impulses', () => {
    const sim = playing();
    const y = sim.catY;
    sim.step();
    expect(sim.catVy).toBeCloseTo(-2.6 + 2 * GRAVITY);
    expect(sim.catY).toBeLessThan(y);
    ticks(sim, 40);
    expect(sim.catVy).toBeGreaterThan(0);
  });

  it('starts a flap from the position on screen and shows it before the next tick', () => {
    const sim = playing();
    ticks(sim, 20);
    for (const alpha of [0, 0.4, 0.9]) {
      const shown = sim.prevCatY + (sim.catY - sim.prevCatY) * alpha;
      sim.flap(alpha);
      expect(sim.prevCatY + (sim.catY - sim.prevCatY) * alpha).toBeCloseTo(shown, 10);
      expect(sim.catY).toBeLessThan(sim.prevCatY);
      expect(sim.tickVy).toBeLessThan(0);
      const once = sim.catY;
      sim.flap(alpha);
      expect(sim.catY).toBeCloseTo(once, 10);
    }
  });

  it('emits a flap event per flap', () => {
    const sim = playing();
    sim.flap();
    expect(sim.drainEvents()).toEqual(['flap']);
    expect(sim.drainEvents()).toEqual([]);
  });

  it('spawns the first pipe off-screen and scrolls it left', () => {
    const sim = playing();
    sim.step();
    expect(sim.pipes).toHaveLength(1);
    expect(sim.pipes[0].x).toBe(FIRST_PIPE_X);
    sim.step();
    expect(sim.pipes[0].x).toBeLessThan(FIRST_PIPE_X);
  });

  it('keeps every gap reachable and on screen', () => {
    let seed = 1;
    const sim = playing(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    for (let i = 0; i < 2000; i++) {
      sim.catY = 100;
      sim.catVy = 0;
      sim.step();
      for (const p of sim.pipes) {
        expect(p.gapY - PIPE_GAP / 2).toBeGreaterThanOrEqual(0);
        expect(p.gapY + PIPE_GAP / 2).toBeLessThanOrEqual(GROUND_Y);
      }
    }
  });

  it('fills a wider screen with pipes and keeps them until they leave its left edge', () => {
    const sim = new FlappySim(() => 0.5);
    sim.left = -100;
    sim.right = 400;
    sim.start();
    sim.flap();
    sim.step();
    expect(sim.pipes.length).toBeGreaterThan(3);
    expect(Math.max(...sim.pipes.map((p) => p.x))).toBeLessThan(400 + PIPE_W);

    sim.pipes = [{ id: 99, x: -100 - PIPE_W + 2, prevX: 0, gapY: 0, scored: true }];
    sim.step();
    expect(sim.pipes.some((p) => p.id === 99)).toBe(true);
    ticks(sim, 2);
    expect(sim.pipes.some((p) => p.id === 99)).toBe(false);
  });

  it('scores once when the cat passes a pipe', () => {
    const sim = playing();
    sim.step();
    sim.pipes[0].x = CAT_X - PIPE_W / 2 + 0.5;
    sim.pipes[0].gapY = sim.catY;
    sim.catVy = 0;
    sim.step();
    expect(sim.score).toBe(1);
    expect(sim.drainEvents()).toContain('score');
    sim.catVy = 0;
    sim.step();
    expect(sim.score).toBe(1);
  });

  it('dies on the ground and goes straight to game over', () => {
    const sim = playing();
    while (sim.phase === 'playing') sim.step();
    expect(sim.phase).toBe('gameOver');
    expect(sim.catY).toBe(GROUND_Y - CAT_RADIUS);
    expect(sim.drainEvents()).toContain('hit');
    expect(sim.flash).toBeGreaterThan(0);
  });

  it('falls after hitting a pipe, then reaches game over', () => {
    const sim = playing();
    sim.step();
    sim.pipes[0].x = CAT_X - PIPE_W / 2;
    sim.pipes[0].gapY = 200;
    sim.catY = 40;
    sim.catVy = 0;
    sim.step();
    expect(sim.phase).toBe('dying');
    expect(sim.drainEvents()).toEqual(expect.arrayContaining(['hit', 'fall']));
    const x = sim.pipes[0].x;
    sim.step();
    expect(sim.pipes[0].x).toBe(x);
    ticks(sim, 200);
    expect(sim.phase).toBe('gameOver');
  });

  it('keeps the cat inside the ceiling', () => {
    const sim = playing();
    for (let i = 0; i < 30; i++) {
      sim.flap();
      sim.step();
    }
    expect(sim.catY).toBeGreaterThanOrEqual(CAT_RADIUS);
  });

  it('freezes while paused and only pauses mid-game', () => {
    const sim = new FlappySim();
    sim.setPaused(true);
    expect(sim.paused).toBe(false);

    const live = playing();
    live.setPaused(true);
    const y = live.catY;
    ticks(live, 10);
    expect(live.catY).toBe(y);
    live.flap();
    expect(live.catVy).toBeCloseTo(-2.6 + GRAVITY);
    live.setPaused(false);
    live.step();
    expect(live.catY).not.toBe(y);
  });

  it('only returns to the title after the lockout', () => {
    const sim = playing();
    while (sim.phase === 'playing') sim.step();
    expect(sim.dismiss()).toBe(false);
    ticks(sim, GAME_OVER_LOCKOUT);
    expect(sim.dismiss()).toBe(true);
    expect(sim.phase).toBe('title');
    expect(sim.score).toBe(0);
    expect(sim.pipes).toEqual([]);
  });

  it('is deterministic for a given random source', () => {
    const run = () => {
      let seed = 7;
      const sim = playing(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
      ticks(sim, 120);
      return sim.pipes.map((p) => p.gapY);
    };
    expect(run()).toEqual(run());
  });
});
