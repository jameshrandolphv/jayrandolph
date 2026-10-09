import { describe, expect, it } from 'vitest';
import { COLS, ENEMY_R, MAX_ENEMY_SPEED, ROWS, TILE, TILE_SAFE, TILE_VOID } from './constants';
import { difficultyFor } from './difficulty';
import { buildChecked, deadEndsHaveCoins, generateLevel } from './generator';
import { enemyPositionAt, insideZone, tileAt, type LevelDef } from './level';
import type { Plan } from './layouts';
import { hashSeed } from './rng';
import { isSolvable, openAreas, viableSpots } from './solver';
import { wheelsOf, wheelsOverlap } from './wheels';

const SEEDS = [1, 7, 12345];

const speedOf = (e: LevelDef['enemies'][number]): number => {
  const a = enemyPositionAt(e, 0);
  const b = enemyPositionAt(e, 1);
  return Math.hypot(b.x - a.x, b.y - a.y);
};

describe('generateLevel', () => {
  it('is deterministic and JSON-safe', () => {
    const level = generateLevel(9, 42);
    expect(generateLevel(9, 42)).toEqual(level);
    expect(JSON.parse(JSON.stringify(level))).toEqual(level);
    expect(generateLevel(9, 43)).not.toEqual(level);
  });

  it('starts with one chamber, a coin and a handful of enemies', () => {
    const level = generateLevel(1, 1);
    expect(level.zones).toHaveLength(2);
    expect(level.coins.length).toBeGreaterThan(0);
    expect(level.enemies.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps safe zones scarce, adding a checkpoint only now and then', () => {
    expect([1, 2, 9].map((n) => difficultyFor(n).segments)).toEqual([1, 1, 1]);
    expect([10, 23].map((n) => difficultyFor(n).segments)).toEqual([2, 2]);
    expect(difficultyFor(24).segments).toBe(3);
    expect(difficultyFor(45).segments).toBe(4);
  });

  it('opens up every pattern and layout by level 15', () => {
    const d = difficultyFor(15);
    expect(new Set(d.patterns)).toEqual(
      new Set([
        'sweepV',
        'sweepH',
        'orbit',
        'spinner',
        'swing',
        'loop',
        'unison',
        'pinwheel',
        'streams',
        'diagonal',
        'wall',
        'trace',
      ]),
    );
    expect(new Set(d.layouts)).toEqual(new Set(['chain', 'winding', 'comb', 'hall', 'stairs']));
  });

  it('starts plain: simple rooms, a couple of patterns, sparse lanes', () => {
    const d = difficultyFor(1);
    expect(d.layouts).toEqual(['chain']);
    expect(d.patterns).toEqual(['sweepV', 'sweepH']);
    expect(d.patternsPerChamber).toBe(1);
    expect(d.speed).toBeCloseTo(2.2 + 0.06 * 2, 5);
    expect(d.columns * d.perColumn).toBeLessThan(difficultyFor(15).columns * difficultyFor(15).perColumn);
    expect(d.chamber.maxW * d.chamber.maxH).toBeLessThanOrEqual(60);
  });

  it('adds patterns and layouts gradually, never taking one away until the segments change', () => {
    let prev = difficultyFor(1);
    for (let n = 2; n <= 15; n++) {
      const d = difficultyFor(n);
      for (const kind of prev.patterns) expect(d.patterns).toContain(kind);
      for (const kind of prev.layouts) expect(d.layouts).toContain(kind);
      prev = d;
    }
  });

  it('keeps safe zones small and few', () => {
    for (const n of [1, 2, 5, 10, 25, 45]) {
      for (const seed of SEEDS) {
        const level = generateLevel(n, seed);
        expect(level.zones.length).toBeGreaterThanOrEqual(2);
        expect(level.zones.length).toBeLessThanOrEqual(difficultyFor(n).segments + 1);
        for (const zone of level.zones) expect(zone.w * zone.h).toBeLessThanOrEqual(6);
      }
    }
  });

  it('draws on a wide variety of levels once the game is in full swing', () => {
    const kinds = new Set<string>();
    const shapes = new Set<string>();
    let busiest = 0;
    let coins = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const level = generateLevel(15, seed * 101);
      for (const enemy of level.enemies) kinds.add(enemy.kind);
      // The floor's outline: its row-by-row widths, a cheap fingerprint of the shape.
      const rows: number[] = [];
      for (let r = 0; r < ROWS; r++)
        rows.push(level.tiles.slice(r * COLS, (r + 1) * COLS).filter((t) => t !== TILE_VOID).length);
      shapes.add(rows.join(','));
      busiest = Math.max(busiest, level.enemies.length);
      coins = Math.max(coins, level.coins.length);
    }
    expect(kinds).toContain('route');
    expect(kinds).toContain('sweep');
    expect(kinds).toContain('orbit');
    expect(shapes.size).toBeGreaterThan(20);
    expect(busiest).toBeGreaterThan(30);
    expect(coins).toBeGreaterThan(10);
  });

  it('never makes the main parameters easier as levels rise', () => {
    let prev = difficultyFor(1);
    for (let n = 2; n <= 200; n++) {
      const d = difficultyFor(n);
      expect(d.segments).toBeGreaterThanOrEqual(prev.segments);
      expect(d.speed).toBeGreaterThanOrEqual(prev.speed);
      expect(d.lane).toBeLessThanOrEqual(prev.lane);
      expect(d.coins).toBeGreaterThanOrEqual(prev.coins);
      expect(d.patternsPerChamber).toBeGreaterThanOrEqual(prev.patternsPerChamber);
      prev = d;
    }
  });

  it.each([1, 2, 3, 5, 8, 10, 14, 18, 25, 30, 40, 60, 100, 200])('level %i is well formed and solvable', (n) => {
    for (const seed of SEEDS) {
      const level = generateLevel(n, seed);
      expect(level.tiles).toHaveLength(COLS * ROWS);
      expect(isSolvable(level)).toBe(true);
      expect(level.zones.length).toBeGreaterThanOrEqual(2);

      for (const zone of level.zones) {
        for (let r = zone.r; r < zone.r + zone.h; r++) {
          for (let c = zone.c; c < zone.c + zone.w; c++) expect(level.tiles[r * COLS + c]).toBe(TILE_SAFE);
        }
      }

      for (const coin of level.coins) {
        expect(tileAt(level, coin.x, coin.y)).not.toBe(TILE_VOID);
        expect(level.zones.some((z) => insideZone(z, coin.x, coin.y))).toBe(false);
      }

      for (const enemy of level.enemies) {
        expect(level.period % enemy.period).toBe(0);
        expect(speedOf(enemy)).toBeLessThanOrEqual(MAX_ENEMY_SPEED + 0.05);
        // Enemies stay on chamber floor, clear of safe zones and walls.
        for (let tick = 0; tick < level.period; tick += 30) {
          const { x, y } = enemyPositionAt(enemy, tick);
          for (const [dx, dy] of [
            [0, 0],
            [ENEMY_R, 0],
            [-ENEMY_R, 0],
            [0, ENEMY_R],
            [0, -ENEMY_R],
          ]) {
            expect(tileAt(level, x + dx!, y + dy!)).toBe(1);
          }
        }
      }
    }
  });
});

/** Whether a coordinate is the middle of a checkerboard square. */
const centred = (v: number): boolean => Math.abs((((v % TILE) + TILE) % TILE) - TILE / 2) < 0.01;

describe('straight-running enemies', () => {
  it.each([1, 3, 8, 15, 30])('level %i keeps them down the middle of the squares they cross', (n) => {
    for (const seed of [...SEEDS, 99, 100, 101]) {
      for (const e of generateLevel(n, seed).enemies) {
        if (e.kind === 'sweep') {
          const horizontal = e.ay === e.by && e.ax !== e.bx;
          const vertical = e.ax === e.bx && e.ay !== e.by;
          if (horizontal) expect(centred(e.ay)).toBe(true);
          if (vertical) expect(centred(e.ax)).toBe(true);
        } else if (e.kind === 'loop') {
          for (const v of [e.x, e.y, e.x + e.w, e.y + e.h]) expect(centred(v)).toBe(true);
        } else if (e.kind === 'route') {
          // Routes bend only at square middles; the ends are pulled in from a safe zone's edge along the way.
          e.points.forEach((p, i) => {
            const prev = e.points[i - 1];
            if (!prev) return;
            if (p.x === prev.x) expect(centred(p.x)).toBe(true);
            if (p.y === prev.y) expect(centred(p.y)).toBe(true);
          });
        }
      }
    }
  });
});

describe('open areas', () => {
  it.each([1, 2, 5, 10, 20, 40])('level %i has nowhere in the chambers that enemies never reach', (n) => {
    for (const seed of SEEDS) expect(openAreas(generateLevel(n, seed), 4)).toEqual([]);
  });
});

describe('isSolvable', () => {
  it('rejects a level whose chamber is filled with stationary enemies', () => {
    const level = generateLevel(1, 1);
    const enemies: LevelDef['enemies'] = [];
    for (let y = 5; y < ROWS * TILE; y += 20) {
      for (let x = 5; x < COLS * TILE; x += 20) {
        if (level.zones.some((z) => insideZone(z, x, y)) || tileAt(level, x, y) === TILE_VOID) continue;
        enemies.push({ kind: 'sweep', ax: x, ay: y, bx: x, by: y, period: 720, phase: 0 });
      }
    }
    expect(isSolvable({ ...level, enemies })).toBe(false);
  });

  it('rejects a coin that sits in a wall', () => {
    const level = generateLevel(1, 1);
    expect(isSolvable({ ...level, coins: [{ x: 2, y: 2, segment: 0 }] })).toBe(false);
  });

  it('builds some dot walls and staircases', () => {
    let walls = 0;
    let staircases = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const level = generateLevel(15 + (seed % 5), seed * 31);
      // A wall is a straight line of at least six static dots.
      const lines = new Map<string, number>();
      for (const e of level.enemies) {
        if (e.kind !== 'sweep' || e.ax !== e.bx || e.ay !== e.by) continue;
        for (const key of [`x${e.ax}`, `y${e.ay}`]) lines.set(key, (lines.get(key) ?? 0) + 1);
      }
      if ([...lines.values()].some((count) => count >= 6)) walls++;
      // A staircase has a floor row that starts further over than the row above it, twice or more.
      let steps = 0;
      let prev = -1;
      for (let r = 0; r < ROWS; r++) {
        const first = level.tiles.slice(r * COLS, (r + 1) * COLS).findIndex((t) => t !== TILE_VOID);
        if (first >= 0 && prev >= 0 && Math.abs(first - prev) >= 2) steps++;
        prev = first;
      }
      if (steps >= 3) staircases++;
    }
    expect(walls).toBeGreaterThan(0);
    expect(staircases).toBeGreaterThan(0);
  }, 60000);

  it('only calls cells viable when the player can be there and still get through', () => {
    const level = generateLevel(1, 1);
    const spots = viableSpots(level, 0);
    expect(spots.length).toBeGreaterThan(50);
    const [first] = spots;
    // A dot parked on a viable spot makes it, and its surroundings, unviable.
    const parked = {
      ...level,
      enemies: [
        ...level.enemies,
        {
          kind: 'sweep' as const,
          ax: first!.x,
          ay: first!.y,
          bx: first!.x,
          by: first!.y,
          period: 720,
          phase: 0,
        },
      ],
    };
    expect(viableSpots(parked, 0).some((s) => Math.hypot(s.x - first!.x, s.y - first!.y) < 12)).toBe(false);
  });
});

describe('spinners', () => {
  it('never turn into each other', () => {
    for (const number of [5, 15, 30, 45]) {
      for (const seed of [1, 7, 12345, 777, 4242]) {
        const wheels = wheelsOf(generateLevel(number, seed).enemies);
        for (let i = 0; i < wheels.length; i++)
          for (let j = i + 1; j < wheels.length; j++)
            expect(wheelsOverlap(wheels[i]!, wheels[j]!), `level ${number}, seed ${seed}`).toBe(false);
      }
    }
  });
});

describe('dead ends', () => {
  const branch = { c: 5, r: 2, w: 2, h: 3 };
  const plan = {
    grid: false,
    zones: [],
    chambers: [{ parts: [], branches: [branch], nooks: [{ x: 6 * TILE, y: 2.6 * TILE }] }],
  } as Plan;
  const level = (enemies: LevelDef['enemies'], coins: LevelDef['coins']) => ({ period: 60, enemies, coins }) as LevelDef;
  const dot = (x: number, y: number): LevelDef['enemies'][number] => ({
    kind: 'sweep',
    ax: x,
    ay: y,
    bx: x,
    by: y,
    period: 60,
    phase: 0,
  });

  it('need a coin when enemies are in them', () => {
    const guard = [dot(6 * TILE, 3 * TILE)];
    expect(deadEndsHaveCoins(plan, level(guard, []))).toBe(false);
    expect(deadEndsHaveCoins(plan, level(guard, [{ x: 6 * TILE, y: 2.6 * TILE, segment: 0 }]))).toBe(true);
  });

  it('can stay bare when nothing is in them, and enemies outside do not count', () => {
    expect(deadEndsHaveCoins(plan, level([], []))).toBe(true);
    expect(deadEndsHaveCoins(plan, level([dot(2 * TILE, 3 * TILE)], []))).toBe(true);
  });

  it('get a coin in every generated comb that has enemies in a branch', () => {
    let checked = 0;
    for (const number of [10, 15, 24, 30]) {
      for (let seed = 1; seed <= 25; seed++) {
        const built = buildChecked(hashSeed(seed, number, 0), number, difficultyFor(number));
        if (!built.solvable) continue;
        for (const chamber of built.plan.chambers) {
          for (const b of chamber.branches ?? []) {
            const guarded = built.level.enemies.some((e) => {
              for (let tick = 0; tick < built.level.period; tick += 6) {
                const p = enemyPositionAt(e, tick);
                if (p.x >= b.c * TILE && p.x < (b.c + b.w) * TILE && p.y >= b.r * TILE && p.y < (b.r + b.h) * TILE)
                  return true;
              }
              return false;
            });
            if (!guarded) continue;
            checked++;
            expect(
              built.level.coins.some(
                (c) => c.x >= b.c * TILE && c.x < (b.c + b.w) * TILE && c.y >= b.r * TILE && c.y < (b.r + b.h) * TILE,
              ),
              `level ${number}, seed ${seed}`,
            ).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 120_000);
});
