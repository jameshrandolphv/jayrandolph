import { describe, expect, it } from 'vitest';
import { TiffDecoderService, tiffToLinear } from './tiff-decoder.service';
import { SRGB_ENCODING } from './icc-parse';

const base = { width: 2, height: 1, samples: 3, bits: 8 as const, channels: 3 as const, whiteIsZero: false, orientation: 1 };

describe('tiffToLinear', () => {
  it('maps sRGB white/black to Rec.2020 white/black', () => {
    const data = new Uint8Array([255, 255, 255, 0, 0, 0]);
    const out = tiffToLinear({ ...base, data }, SRGB_ENCODING);
    expect(Array.from(out.data.slice(0, 3))).toEqual([65535, 65535, 65535]);
    expect(Array.from(out.data.slice(3, 6))).toEqual([0, 0, 0]);
  });

  it('linearises mid-gray with the sRGB curve', () => {
    const out = tiffToLinear({ ...base, width: 1, data: new Uint8Array([128, 128, 128]) }, SRGB_ENCODING);
    expect(out.data[1] / 65535).toBeCloseTo(0.2158, 3);
  });

  it('ignores alpha samples', () => {
    const data = new Uint8Array([255, 255, 255, 0, 0, 0, 0, 255]);
    const out = tiffToLinear({ ...base, samples: 4, data }, SRGB_ENCODING);
    expect(Array.from(out.data.slice(0, 3))).toEqual([65535, 65535, 65535]);
    expect(Array.from(out.data.slice(3, 6))).toEqual([0, 0, 0]);
  });

  it('inverts WhiteIsZero grayscale and replicates it across channels', () => {
    const out = tiffToLinear(
      { ...base, samples: 1, channels: 1, whiteIsZero: true, data: new Uint8Array([0, 255]) },
      SRGB_ENCODING,
    );
    expect(Array.from(out.data)).toEqual([65535, 65535, 65535, 0, 0, 0]);
  });

  it('accepts 16-bit data', () => {
    const data = new Uint16Array([65535, 65535, 65535, 0, 0, 0]);
    const out = tiffToLinear({ ...base, bits: 16, data }, SRGB_ENCODING);
    expect(out.data[0]).toBe(65535);
  });

  it('rotates for orientation 6 (90 degrees clockwise)', () => {
    // Source 2x1: [white, black]; rotated clockwise it is 1x2: white on top.
    const data = new Uint8Array([255, 255, 255, 0, 0, 0]);
    const out = tiffToLinear({ ...base, orientation: 6, data }, SRGB_ENCODING);
    expect([out.width, out.height]).toEqual([1, 2]);
    expect(out.data[0]).toBe(65535);
    expect(out.data[3]).toBe(0);
  });

  it('flips horizontally for orientation 2', () => {
    const data = new Uint8Array([255, 255, 255, 0, 0, 0]);
    const out = tiffToLinear({ ...base, orientation: 2, data }, SRGB_ENCODING);
    expect(out.data[0]).toBe(0);
    expect(out.data[3]).toBe(65535);
  });
});

/** Smallest valid little-endian uncompressed single-strip RGB TIFF. */
function buildTiff(width: number, height: number, pixels: number[]): File {
  const entries = 9;
  const ifdSize = 2 + entries * 12 + 4;
  const bpsOffset = 8 + ifdSize;
  const dataOffset = bpsOffset + 6;
  const buf = new ArrayBuffer(dataOffset + pixels.length);
  const dv = new DataView(buf);
  dv.setUint8(0, 0x49);
  dv.setUint8(1, 0x49);
  dv.setUint16(2, 42, true);
  dv.setUint32(4, 8, true);
  dv.setUint16(8, entries, true);
  let p = 10;
  const entry = (tag: number, type: number, count: number, value: number) => {
    dv.setUint16(p, tag, true);
    dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) dv.setUint16(p + 8, value, true);
    else dv.setUint32(p + 8, value, true);
    p += 12;
  };
  entry(256, 3, 1, width);
  entry(257, 3, 1, height);
  entry(258, 3, 3, bpsOffset);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 2);
  entry(273, 4, 1, dataOffset);
  entry(277, 3, 1, 3);
  entry(278, 3, 1, height);
  entry(279, 4, 1, pixels.length);
  for (let i = 0; i < 3; i++) dv.setUint16(bpsOffset + 2 * i, 8, true);
  new Uint8Array(buf, dataOffset).set(pixels);
  return new File([buf], 'test.tif');
}

describe('TiffDecoderService', () => {
  it('decodes an RGB TIFF to linear Rec.2020', async () => {
    const file = buildTiff(2, 1, [255, 255, 255, 0, 0, 0]);
    const out = await new TiffDecoderService().decode(file);
    expect([out.image.width, out.image.height]).toEqual([2, 1]);
    expect(Array.from(out.image.data.slice(0, 3))).toEqual([65535, 65535, 65535]);
    expect(Array.from(out.image.data.slice(3, 6))).toEqual([0, 0, 0]);
  });
});
