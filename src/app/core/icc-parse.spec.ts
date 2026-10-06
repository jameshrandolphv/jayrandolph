import { describe, expect, it } from 'vitest';
import { srgbIccProfile } from '../export/icc';
import { LINEAR_REC2020_ENCODING, SRGB_ENCODING, parseIccEncoding } from './icc-parse';

describe('parseIccEncoding', () => {
  it('reads the generated sRGB profile as sRGB', () => {
    const enc = parseIccEncoding(srgbIccProfile())!;
    expect(enc).not.toBeNull();
    enc.toRec2020.forEach((v, i) => expect(v).toBeCloseTo(SRGB_ENCODING.toRec2020[i], 3));
    for (const v of [0.02, 0.2, 0.5, 0.9]) {
      expect(enc.trc[1](v)).toBeCloseTo(SRGB_ENCODING.trc[1](v), 3);
    }
  });

  it('rejects data that is not an RGB matrix profile', () => {
    expect(parseIccEncoding(new Uint8Array(200))).toBeNull();
    expect(parseIccEncoding(new Uint8Array(4))).toBeNull();
  });
});

describe('SRGB_ENCODING', () => {
  it('keeps neutrals neutral in Rec.2020', () => {
    const m = SRGB_ENCODING.toRec2020;
    for (let r = 0; r < 3; r++) {
      expect(m[3 * r] + m[3 * r + 1] + m[3 * r + 2]).toBeCloseTo(1, 3);
    }
    expect(LINEAR_REC2020_ENCODING.trc[0](0.25)).toBe(0.25);
  });
});
