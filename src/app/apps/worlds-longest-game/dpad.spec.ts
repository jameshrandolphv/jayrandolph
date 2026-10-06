import { describe, expect, it } from 'vitest';
import { PAD_SPEED, padCell, padVector } from './dpad';

describe('padCell', () => {
  it('maps the pad to a fixed 3x3 grid', () => {
    expect(padCell(50, 50, 90)).toEqual({ dx: 0, dy: 0 });
    expect(padCell(45, 5, 90)).toEqual({ dx: 0, dy: -1 });
    expect(padCell(85, 45, 90)).toEqual({ dx: 1, dy: 0 });
    expect(padCell(5, 85, 90)).toEqual({ dx: -1, dy: 1 });
    expect(padCell(85, 5, 90)).toEqual({ dx: 1, dy: -1 });
  });

  it('keeps a drag past the edge on the nearest cell', () => {
    expect(padCell(500, 45, 90)).toEqual({ dx: 1, dy: 0 });
    expect(padCell(-40, -40, 90)).toEqual({ dx: -1, dy: -1 });
    expect(padCell(10, 10, 0)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('padVector', () => {
  it('is still when centred', () => {
    expect(padVector(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('moves straight at PAD_SPEED', () => {
    expect(padVector(1, 0)).toEqual({ x: PAD_SPEED, y: 0 });
    expect(padVector(0, -1)).toEqual({ x: 0, y: -PAD_SPEED });
  });

  it('normalises diagonals', () => {
    const v = padVector(-1, 1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(PAD_SPEED, 10);
    expect(v.x).toBeCloseTo(-v.y, 10);
  });
});
