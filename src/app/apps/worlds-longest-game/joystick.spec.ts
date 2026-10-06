import { describe, expect, it } from 'vitest';
import { KNOB_TRAVEL, STICK_SPEED, knobOffset, stickVector } from './joystick';

describe('stickVector', () => {
  it('ignores a drag inside the dead zone', () => {
    expect(stickVector(2, 1, 50)).toEqual({ x: 0, y: 0 });
    expect(stickVector(0, 0, 50)).toEqual({ x: 0, y: 0 });
    expect(stickVector(5, 5, 0)).toEqual({ x: 0, y: 0 });
  });

  it('snaps to the nearest of eight directions at a fixed length', () => {
    expect(stickVector(30, 0, 50)).toEqual({ x: STICK_SPEED, y: 0 });
    expect(stickVector(0, -500, 50)).toEqual({ x: 0, y: -STICK_SPEED });
    // 20 degrees off the x axis still counts as straight right; 30 off it is the diagonal.
    expect(stickVector(40, 14.5, 50).y).toBeCloseTo(0, 10);
    const diagonal = stickVector(40, 25, 50);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(STICK_SPEED, 10);
    expect(diagonal.x).toBeCloseTo(diagonal.y, 10);
    const up = stickVector(-5, -40, 50);
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(-STICK_SPEED, 10);
  });
});

describe('knobOffset', () => {
  it('snaps to the chosen direction and is held on the travel circle', () => {
    expect(knobOffset(10, 0, 50)).toEqual({ x: 0, y: 0 });
    const right = knobOffset(30, 5, 50);
    expect(right.x).toBeCloseTo(Math.hypot(30, 5), 10);
    expect(right.y).toBeCloseTo(0, 10);
    const held = knobOffset(300, 300, 50);
    expect(held.x).toBeCloseTo(35.355, 2);
    expect(held.y).toBeCloseTo(35.355, 2);
    expect(KNOB_TRAVEL).toBeLessThan(1);
  });
});
