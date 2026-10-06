import { describe, expect, it } from 'vitest';
import { COLORS } from './constants';
import { paletteFor } from './palette';

describe('paletteFor', () => {
  it('starts as the original blue', () => {
    expect(paletteFor(1)).toEqual({ enemy: COLORS.enemy, void: COLORS.void, floorA: COLORS.floorA, floorB: COLORS.floorB });
    expect(paletteFor(0)).toEqual(paletteFor(1));
  });

  it('reaches purple at 50, red at 100, brown at 150 and gray at 200', () => {
    expect(paletteFor(50).enemy).toBe(0x7a00cc);
    expect(paletteFor(100).enemy).toBe(0xe60000);
    expect(paletteFor(150).enemy).toBe(0x7a4a1c);
    expect(paletteFor(200).enemy).toBe(0x555555);
  });

  it('stays gray after level 200', () => {
    expect(paletteFor(201)).toEqual(paletteFor(200));
    expect(paletteFor(5000)).toEqual(paletteFor(200));
  });

  it('changes a little each level in between', () => {
    const a = paletteFor(24).enemy;
    const b = paletteFor(25).enemy;
    const c = paletteFor(26).enemy;
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(paletteFor(75).enemy).toBe(0xb00066);
  });
});
