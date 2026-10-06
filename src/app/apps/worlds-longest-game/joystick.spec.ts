import { describe, expect, it } from 'vitest';
import { KNOB_TRAVEL, STICK_SPEED, knobOffset, stickVector } from './joystick';

describe('stickVector', () => {
  it('ignores a drag inside the dead zone', () => {
    expect(stickVector(2, 1, 50)).toEqual({ x: 0, y: 0 });
    expect(stickVector(0, 0, 50)).toEqual({ x: 0, y: 0 });
    expect(stickVector(5, 5, 0)).toEqual({ x: 0, y: 0 });
  });

  it('gives a fixed-length direction once past it, however far the drag goes', () => {
    expect(stickVector(30, 0, 50)).toEqual({ x: STICK_SPEED, y: 0 });
    expect(stickVector(0, -500, 50)).toEqual({ x: 0, y: -STICK_SPEED });
    const diagonal = stickVector(40, 40, 50);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(STICK_SPEED, 10);
    expect(diagonal.x).toBeCloseTo(diagonal.y, 10);
  });
});

describe('knobOffset', () => {
  it('follows the drag inside the travel circle and is held on its edge outside', () => {
    expect(knobOffset(10, -5, 50)).toEqual({ x: 10, y: -5 });
    const held = knobOffset(300, 400, 50);
    expect(held.x).toBeCloseTo(30, 10);
    expect(held.y).toBeCloseTo(40, 10);
    expect(KNOB_TRAVEL).toBeLessThan(1);
  });
});
