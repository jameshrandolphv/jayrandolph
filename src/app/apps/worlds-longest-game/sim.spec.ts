import { describe, expect, it } from 'vitest';
import { COLS, DEATH_TICKS, INTRO_TICKS, ROWS, TILE_FLOOR, TILE_SAFE, TILE_VOID } from './constants';
import type { Enemy, LevelDef } from './level';
import { LongestSim } from './sim';

/** Two rows of floor from column 1 to 9, with safe zones at columns 1, 5 and 9 of the top row. */
const corridor = (enemies: Enemy[] = [], zones = 3): LevelDef => {
  const tiles = new Array<number>(COLS * ROWS).fill(TILE_VOID);
  for (const r of [5, 6]) for (let c = 1; c <= 9; c++) tiles[r * COLS + c] = TILE_FLOOR;
  const columns = zones === 3 ? [1, 5, 9] : [1, 5];
  for (const c of columns) tiles[5 * COLS + c] = TILE_SAFE;
  return {
    version: 1,
    number: 1,
    seed: 0,
    period: 720,
    cols: COLS,
    rows: ROWS,
    tiles,
    zones: columns.map((c) => ({ c, r: 5, w: 1, h: 1 })),
    coins:
      zones === 3
        ? [
            { x: 3.5 * 48, y: 6.5 * 48, segment: 0 },
            { x: 7.5 * 48, y: 6.5 * 48, segment: 1 },
          ]
        : [{ x: 3.5 * 48, y: 6.5 * 48, segment: 0 }],
    enemies,
  };
};

const still = (x: number, y: number): Enemy => ({ kind: 'sweep', ax: x, ay: y, bx: x, by: y, period: 720, phase: 0 });

const started = (def: LevelDef, onGenerate: (level: number) => void = () => undefined): LongestSim => {
  const sim = new LongestSim((level) => {
    onGenerate(level);
    return def;
  });
  sim.showInstructions();
  sim.begin();
  sim.skipIntro();
  return sim;
};

const walk = (sim: LongestSim, dx: number, dy: number, ticks: number): void => {
  sim.setMove(dx, dy);
  for (let i = 0; i < ticks; i++) sim.step();
  sim.setMove(0, 0);
};

describe('LongestSim', () => {
  it('moves from the title through the instructions into a level intro', () => {
    const generated: number[] = [];
    const sim = new LongestSim((level) => (generated.push(level), corridor()));
    expect(sim.phase).toBe('title');
    sim.back();
    expect(sim.phase).toBe('title');

    sim.showInstructions();
    expect(sim.phase).toBe('instructions');
    sim.back();
    expect(sim.phase).toBe('title');

    sim.showInstructions();
    sim.begin();
    expect(sim.phase).toBe('intro');
    expect(sim.level).toBe(1);
    expect(generated).toEqual([1]);

    for (let i = 0; i < INTRO_TICKS - 1; i++) sim.step();
    expect(sim.phase).toBe('intro');
    sim.step();
    expect(sim.phase).toBe('playing');
  });

  it('forgives an enemy that only grazes the drawn square', () => {
    // Start centre is (1.5, 5.5) tiles; the drawn square reaches 16px right, the hurt box 12px.
    const sim = started(corridor([still(1.5 * 48 + 16 + 10 - 2, 5.5 * 48)]));
    sim.step();
    expect(sim.phase).toBe('playing');
    const hit = started(corridor([still(1.5 * 48 + 12 + 10 - 2, 5.5 * 48)]));
    hit.step();
    expect(hit.phase).toBe('dying');
  });

  it('reaches a checkpoint as soon as any part of the square touches it', () => {
    const sim = started(corridor());
    sim.collected = [true, true];
    // Checkpoint 1 starts at x = 5 * 48; the square's right edge touches it 16px earlier.
    sim.x = 5 * 48 - 16 + 1;
    sim.y = 5.5 * 48;
    sim.step();
    expect(sim.checkpoint).toBe(1);
  });

  it('lets the intro be skipped and holds still during it', () => {
    const sim = new LongestSim(() => corridor());
    sim.showInstructions();
    sim.begin();
    const { x } = sim;
    sim.setMove(1, 0);
    sim.step();
    expect(sim.x).toBe(x);
    sim.skipIntro();
    expect(sim.phase).toBe('playing');
  });

  it('starts every run on level 1 with no deaths', () => {
    const sim = started(corridor());
    expect(sim.level).toBe(1);
    expect(sim.deaths).toBe(0);
    expect(sim.checkpoint).toBe(0);
  });

  it('moves at a constant speed and normalises diagonals', () => {
    const sim = started(corridor());
    const { x, y } = sim;
    walk(sim, 1, 0, 10);
    expect(sim.x - x).toBeCloseTo(35, 5);
    const x2 = sim.x;
    walk(sim, 3, 3, 1);
    expect(Math.hypot(sim.x - x2, sim.y - y)).toBeCloseTo(3.5, 5);
  });

  it('is stopped by the void but slides along walls', () => {
    const sim = started(corridor());
    walk(sim, 0, -1, 40);
    expect(sim.y).toBeGreaterThanOrEqual(256 - 0.01);
    expect(sim.y).toBeLessThan(264);
    const x = sim.x;
    walk(sim, 1, -1, 5);
    expect(sim.x).toBeGreaterThan(x);
    expect(sim.y).toBeGreaterThanOrEqual(256 - 0.01);
    walk(sim, -1, 0, 100);
    expect(sim.x).toBeGreaterThanOrEqual(48 + 16 - 0.01);
    expect(sim.phase).toBe('playing');
  });

  it('kills on contact, counts the death and respawns after a pause', () => {
    const sim = started(corridor([still(72, 264)]));
    sim.step();
    expect(sim.phase).toBe('dying');
    expect(sim.deaths).toBe(1);
    expect(sim.drainEvents()).toContain('death');
    expect(sim.deathProgress).toBe(0);
    sim.step();
    expect(sim.deathProgress).toBeGreaterThan(0);

    for (let i = 1; i < DEATH_TICKS; i++) sim.step();
    expect(sim.phase).toBe('playing');
    expect(sim.deaths).toBe(1);
  });

  it('keeps enemies moving through the death pause', () => {
    const sim = started(corridor([still(72, 264)]));
    sim.step();
    const tick = sim.tick;
    sim.step();
    expect(sim.tick).toBe(tick + 1);
  });

  it('only lets the goal count once every coin before it is collected', () => {
    const levels: number[] = [];
    const sim = started(corridor([], 2), (level) => levels.push(level));
    walk(sim, 1, 0, 60);
    expect(sim.x).toBeGreaterThan(240);
    expect(sim.level).toBe(1);

    walk(sim, -1, 0, 30);
    walk(sim, 0, 1, 8);
    expect(sim.collected).toEqual([true]);
    walk(sim, 0, -1, 8);
    walk(sim, 1, 0, 30);
    expect(sim.level).toBe(2);
    expect(levels).toEqual([1, 2]);
    expect(sim.phase).toBe('intro');
    expect(sim.deaths).toBe(0);
  });

  it('respawns at the last checkpoint with the coins collected before it', () => {
    const sim = started(corridor([still(8.5 * 48, 264)]));
    walk(sim, 1, 0, 28);
    walk(sim, 0, 1, 8);
    expect(sim.collected).toEqual([true, false]);
    walk(sim, 0, -1, 8);
    walk(sim, 1, 0, 25);
    expect(sim.checkpoint).toBe(1);
    expect(sim.drainEvents()).toContain('checkpoint');

    walk(sim, 1, 0, 30);
    walk(sim, 0, 1, 8);
    expect(sim.collected).toEqual([true, true]);
    walk(sim, 0, -1, 8);
    walk(sim, 1, 0, 20);
    expect(sim.phase).toBe('dying');

    for (let i = 0; i < DEATH_TICKS; i++) sim.step();
    expect(sim.phase).toBe('playing');
    expect(sim.collected).toEqual([true, false]);
    expect(sim.x).toBe(5.5 * 48);
    expect(sim.y).toBe(5.5 * 48);
  });
});
