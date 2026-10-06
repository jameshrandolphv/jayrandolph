import { describe, expect, it } from 'vitest';
import { COLS, ENEMY_R, MAX_ENEMY_SPEED, ROWS, TILE, TILE_SAFE, TILE_VOID } from './constants';
import { difficultyFor } from './difficulty';
import { generateLevel } from './generator';
import { enemyPositionAt, insideZone, tileAt, type LevelDef } from './level';
import { isSolvable, openAreas } from './solver';

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

  it('introduces checkpoints and new patterns gradually', () => {
    expect(difficultyFor(1).segments).toBe(1);
    expect(difficultyFor(2).segments).toBe(1);
    expect(difficultyFor(3).segments).toBe(2);
    expect(difficultyFor(1).patterns).toContain('orbit');
    expect(difficultyFor(1).patterns).not.toContain('swing');
    expect(difficultyFor(3).patterns).toContain('swing');
    expect(difficultyFor(5).patterns).not.toContain('loop');
    expect(difficultyFor(6).patterns).toContain('loop');
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
          for (const [dx, dy] of [[0, 0], [ENEMY_R, 0], [-ENEMY_R, 0], [0, ENEMY_R], [0, -ENEMY_R]]) {
            expect(tileAt(level, x + dx!, y + dy!)).toBe(1);
          }
        }
      }
    }
  });
});

describe('open areas', () => {
  it.each([1, 2, 5, 10, 20])('level %i has no big stretch of chamber free of enemies', (n) => {
    for (const seed of SEEDS) expect(openAreas(generateLevel(n, seed), 40)).toEqual([]);
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
});
