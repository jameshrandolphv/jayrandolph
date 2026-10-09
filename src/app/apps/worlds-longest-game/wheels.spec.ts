import { describe, expect, it } from 'vitest';
import { BAR_STEP } from './patterns';
import type { Enemy } from './level';
import { crossesWheels, wheelsOf, wheelsOverlap } from './wheels';

const orbit = (cx: number, cy: number, radius: number, period = 360, dir: 1 | -1 = 1): Enemy => ({
  kind: 'orbit',
  cx,
  cy,
  radius,
  period,
  phase: 0,
  dir,
});

/** A pivot dot and one arm of dots reaching out `steps` steps. */
const wheel = (cx: number, cy: number, steps: number, period = 360): Enemy[] =>
  Array.from({ length: steps + 1 }, (_, k) => orbit(cx, cy, k * BAR_STEP, period));

describe('wheelsOf', () => {
  it('finds a turning bar and how far it reaches', () => {
    expect(wheelsOf(wheel(100, 200, 4))).toEqual([{ cx: 100, cy: 200, reach: 4 * BAR_STEP }]);
  });

  it('ignores a ring of dots, even around the same pivot as a wheel', () => {
    const ring = [orbit(100, 200, 130, 240, -1), orbit(100, 200, 130, 240, -1)];
    expect(wheelsOf(ring)).toEqual([]);
    expect(wheelsOf([...ring, ...wheel(100, 200, 3)])).toEqual([{ cx: 100, cy: 200, reach: 3 * BAR_STEP }]);
  });

  it('ignores lone orbiting dots and other kinds of enemy', () => {
    const sweep: Enemy = { kind: 'sweep', ax: 0, ay: 0, bx: 10, by: 0, period: 60, phase: 0 };
    expect(wheelsOf([orbit(50, 50, 24), sweep])).toEqual([]);
  });
});

describe('wheelsOverlap', () => {
  const a = { cx: 0, cy: 0, reach: 60 };

  it('is true when the circles they sweep meet or nearly meet', () => {
    expect(wheelsOverlap(a, { cx: 100, cy: 0, reach: 60 })).toBe(true);
    expect(wheelsOverlap(a, { cx: 60 + 60 + 20 + 3, cy: 0, reach: 60 })).toBe(true);
  });

  it('is false with room to spare', () => {
    expect(wheelsOverlap(a, { cx: 60 + 60 + 20 + 12, cy: 0, reach: 60 })).toBe(false);
    expect(wheelsOverlap(a, { cx: 0, cy: 300, reach: 60 })).toBe(false);
  });
});

describe('crossesWheels', () => {
  it('checks new wheels against existing ones and against each other', () => {
    const existing = wheel(0, 0, 3);
    expect(crossesWheels(existing, wheel(80, 0, 3))).toBe(true);
    expect(crossesWheels(existing, wheel(300, 0, 3))).toBe(false);
    expect(crossesWheels([], [...wheel(0, 0, 3), ...wheel(80, 0, 3)])).toBe(true);
    expect(crossesWheels(existing, [])).toBe(false);
  });

  it('is unaffected by crossing wheels that were already there', () => {
    expect(crossesWheels([...wheel(0, 0, 3), ...wheel(80, 0, 3)], wheel(500, 0, 2))).toBe(false);
  });
});
