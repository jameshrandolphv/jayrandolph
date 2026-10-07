import { describe, expect, it } from 'vitest';
import { COLS, ROWS, TILE_FLOOR, TILE_SAFE } from './constants';
import { difficultyFor, type LayoutKind } from './difficulty';
import { FALLBACK, isValidPlan, planLevel, tilesOf } from './layouts';
import { createRandom } from './rng';

const LAYOUTS: LayoutKind[] = ['chain', 'winding', 'comb', 'hall', 'stairs'];
const NUMBERS = [1, 5, 12, 25, 45];

const plans = (kind: LayoutKind, number: number, count = 25) =>
  Array.from({ length: count }, (_, seed) =>
    planLevel(createRandom(seed + 1), { ...difficultyFor(number), layouts: [kind] }),
  );

describe('planLevel', () => {
  it.each(LAYOUTS)('%s layouts hold together at every stage of the game', (kind) => {
    for (const number of NUMBERS) {
      for (const plan of plans(kind, number)) {
        expect(isValidPlan(plan)).toBe(true);
        expect(plan.zones.length).toBeGreaterThanOrEqual(2);
        expect(plan.zones.length).toBeLessThanOrEqual(difficultyFor(number).segments + 1);
        const tiles = tilesOf(plan);
        expect(tiles.filter((t) => t === TILE_SAFE).length).toBeGreaterThanOrEqual(plan.zones.length * 2);
        expect(tiles.filter((t) => t === TILE_FLOOR).length).toBeGreaterThan(20);
        expect(tiles).toHaveLength(COLS * ROWS);
      }
    }
  });

  it('makes winding corridors with a route down the middle', () => {
    const made = plans('winding', 1).filter((p) => p.chambers[0]!.parts.length > 1);
    expect(made.length).toBeGreaterThan(5);
    expect(made.some((p) => p.chambers[0]!.route)).toBe(true);
  });

  it('makes combs with dead ends to tuck coins into', () => {
    const made = plans('comb', 1).filter((p) => p.chambers[0]!.nooks?.length);
    expect(made.length).toBeGreaterThan(5);
  });

  it('makes staircases of stepped blocks, with a route when they are wide enough', () => {
    const made = plans('stairs', 1).filter((p) => p.chambers[0]!.parts.length >= 3);
    expect(made.length).toBeGreaterThan(10);
    expect(made.some((p) => p.chambers[0]!.route)).toBe(true);
    expect(plans('stairs', 12, 5).every((p) => p.zones.length <= 3)).toBe(true);
  });

  it('lays out halls for a grid of coins', () => {
    expect(plans('hall', 1).every((p) => p.grid)).toBe(true);
  });

  it('mixes layouts, falling back to the plain one only rarely', () => {
    for (const number of NUMBERS) {
      const fallbacks = Array.from({ length: 40 }, (_, seed) =>
        planLevel(createRandom(seed + 1), difficultyFor(number)),
      ).filter((p) => p === FALLBACK);
      expect(fallbacks.length).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    expect(plans('winding', 12, 5)).toEqual(plans('winding', 12, 5));
  });

  it('rejects a chamber that touches the wrong zone', () => {
    const plan = plans('chain', 1, 1)[0]!;
    expect(
      isValidPlan({
        ...plan,
        zones: [plan.zones[0]!, { ...plan.zones[0]!, c: plan.zones[0]!.c + 1 }],
      }),
    ).toBe(false);
  });
});
