import { describe, expect, it } from 'vitest';
import { type ArrowKey, keysVector } from './arrow-keys';

const held = (...keys: ArrowKey[]) => keysVector(new Set(keys));

describe('keysVector', () => {
  it('is still when nothing is held', () => {
    expect(held()).toEqual({ x: 0, y: 0 });
  });

  it('moves straight at full speed', () => {
    expect(held('right')).toEqual({ x: 1, y: 0 });
    expect(held('up')).toEqual({ x: 0, y: -1 });
  });

  it('normalises diagonals', () => {
    const v = held('left', 'down');
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 10);
    expect(v.x).toBeCloseTo(-v.y, 10);
  });

  it('cancels opposite keys', () => {
    expect(held('left', 'right')).toEqual({ x: 0, y: 0 });
    expect(held('left', 'right', 'up')).toEqual({ x: 0, y: -1 });
  });
});
