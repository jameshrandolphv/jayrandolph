import { describe, expect, it } from 'vitest';
import { buildPreview, downscaleLinear, previewFromEncoded } from './preview';

describe('buildPreview', () => {
  it('maps linear white to sRGB white and black to black', () => {
    const data = new Uint16Array([65535, 65535, 65535, 0, 0, 0]);
    const out = buildPreview({ width: 2, height: 1, data });
    expect(Array.from(out.data.slice(0, 4))).toEqual([255, 255, 255, 255]);
    expect(Array.from(out.data.slice(4, 8))).toEqual([0, 0, 0, 255]);
  });
});

describe('downscaleLinear', () => {
  it('downsamples to the requested maximum dimension', () => {
    const data = new Uint16Array(8 * 4 * 3).fill(30000);
    const out = downscaleLinear({ width: 8, height: 4, data }, 4);
    expect(out.width).toBe(4);
    expect(out.height).toBe(2);
    expect(out.data[0]).toBe(30000);
  });

  it('never upsamples', () => {
    const img = { width: 2, height: 2, data: new Uint16Array(12) };
    expect(downscaleLinear(img, 100)).toBe(img);
  });
});

describe('previewFromEncoded', () => {
  it('reduces 16-bit to 8-bit RGBA', () => {
    const out = previewFromEncoded({ width: 1, height: 1, data: new Uint16Array([65535, 32768, 0]) });
    expect(Array.from(out.data)).toEqual([255, 128, 0, 255]);
  });
});
