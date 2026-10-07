import { describe, expect, it } from 'vitest';
import { enemyPositionAt, routeLength, type Enemy } from './level';

const there = (points: { x: number; y: number }[], closed: boolean, phase = 0): Enemy => ({
  kind: 'route',
  points,
  closed,
  period: 100,
  phase,
  dir: 1,
});
const L = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
];

describe('route enemies', () => {
  it('measures a route, closed or not', () => {
    expect(routeLength(L, false)).toBe(200);
    expect(routeLength(L, true)).toBeCloseTo(200 + Math.hypot(100, 100), 5);
  });

  it('goes there and back along an open route', () => {
    const e = there(L, false);
    expect(enemyPositionAt(e, 0)).toEqual({ x: 0, y: 0 });
    expect(enemyPositionAt(e, 25)).toEqual({ x: 100, y: 0 });
    expect(enemyPositionAt(e, 37.5)).toEqual({ x: 100, y: 50 });
    expect(enemyPositionAt(e, 50)).toEqual({ x: 100, y: 100 });
    expect(enemyPositionAt(e, 75)).toEqual({ x: 100, y: 0 });
    expect(enemyPositionAt(e, 100)).toEqual({ x: 0, y: 0 });
  });

  it('goes round a closed route and starts over', () => {
    const e = there(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      true,
    );
    expect(enemyPositionAt(e, 25)).toEqual({ x: 100, y: 0 });
    expect(enemyPositionAt(e, 50)).toEqual({ x: 100, y: 100 });
    expect(enemyPositionAt(e, 100)).toEqual({ x: 0, y: 0 });
  });

  it('honours the phase and survives a JSON round trip', () => {
    const e = there(L, false, 25);
    expect(enemyPositionAt(e, 0)).toEqual({ x: 100, y: 0 });
    expect(enemyPositionAt(JSON.parse(JSON.stringify(e)), 0)).toEqual({ x: 100, y: 0 });
  });
});
