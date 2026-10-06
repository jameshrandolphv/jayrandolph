import { Injectable } from '@angular/core';
import type { ImageFileDirectory } from 'geotiff';
import { SRGB_ENCODING, parseIccEncoding, type ColorEncoding } from './icc-parse';
import type { DecodedRaw, LinearImage } from './raw-decoder.service';

const ICC_PROFILE_TAG = 34675;

export interface TiffSamples {
  readonly data: Uint8Array | Uint16Array;
  readonly width: number;
  readonly height: number;
  /** Interleaved samples per pixel, including any alpha. */
  readonly samples: number;
  readonly bits: 8 | 16;
  /** Colour channels: 1 (gray) or 3 (RGB); extra samples are dropped. */
  readonly channels: 1 | 3;
  readonly whiteIsZero: boolean;
  /** TIFF Orientation tag (1-8). */
  readonly orientation: number;
}

/** Decodes display-encoded TIFF samples to linear Rec.2020, applying the Orientation tag. */
export function tiffToLinear(src: TiffSamples, enc: ColorEncoding): LinearImage {
  const { width: w, height: h, samples, channels, bits, data } = src;
  const levels = 1 << bits;
  const lut = enc.trc.map((trc) => {
    const t = new Float32Array(levels);
    for (let i = 0; i < levels; i++) t[i] = trc(i / (levels - 1));
    return t;
  });
  const m = enc.toRec2020;
  const flip = src.whiteIsZero ? levels - 1 : 0;
  const swap = src.orientation >= 5 && src.orientation <= 8;
  const ow = swap ? h : w;
  const oh = swap ? w : h;
  const out = new Uint16Array(ow * oh * 3);
  const clamp16 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 65535 : Math.round(v * 65535));

  let o = 0;
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++, o += 3) {
      let sx: number;
      let sy: number;
      switch (src.orientation) {
        case 2: [sx, sy] = [w - 1 - ox, oy]; break;
        case 3: [sx, sy] = [w - 1 - ox, h - 1 - oy]; break;
        case 4: [sx, sy] = [ox, h - 1 - oy]; break;
        case 5: [sx, sy] = [oy, ox]; break;
        case 6: [sx, sy] = [oy, h - 1 - ox]; break;
        case 7: [sx, sy] = [w - 1 - oy, h - 1 - ox]; break;
        case 8: [sx, sy] = [w - 1 - oy, ox]; break;
        default: [sx, sy] = [ox, oy];
      }
      const p = (sy * w + sx) * samples;
      if (channels === 1) {
        const v = clamp16(lut[1][Math.abs(data[p] - flip)]);
        out[o] = v;
        out[o + 1] = v;
        out[o + 2] = v;
      } else {
        const r = lut[0][data[p]];
        const g = lut[1][data[p + 1]];
        const b = lut[2][data[p + 2]];
        out[o] = clamp16(m[0] * r + m[1] * g + m[2] * b);
        out[o + 1] = clamp16(m[3] * r + m[4] * g + m[5] * b);
        out[o + 2] = clamp16(m[6] * r + m[7] * g + m[8] * b);
      }
    }
  }
  return { width: ow, height: oh, data: out };
}

@Injectable({ providedIn: 'root' })
export class TiffDecoderService {
  async decode(file: File): Promise<DecodedRaw> {
    // Loaded on demand so DNG-only sessions never download the TIFF codecs.
    const { fromArrayBuffer } = await import('geotiff');
    const tiff = await fromArrayBuffer(await file.arrayBuffer());
    const image = await tiff.getImage();
    const dir = image.getFileDirectory();

    const photometric = dir.getValue('PhotometricInterpretation');
    const samples = image.getSamplesPerPixel();
    const bits = image.getBitsPerSample(0);
    const format = image.getSampleFormat(0);
    const isGray = photometric === 0 || photometric === 1;
    if (!(isGray || photometric === 2) || (photometric === 2 && samples < 3)) {
      throw new Error('Unsupported TIFF: only RGB and grayscale images are supported.');
    }
    if (format !== 1 || (bits !== 8 && bits !== 16)) {
      throw new Error('Unsupported TIFF: only 8-bit and 16-bit integer samples are supported.');
    }

    const data = (await image.readRasters({ interleave: true })) as unknown as Uint8Array | Uint16Array;
    const orientation = Number((await dir.loadValue('Orientation')) ?? 1);
    const enc = isGray ? SRGB_ENCODING : await this.encodingOf(dir);
    const linear = tiffToLinear(
      {
        data,
        width: image.getWidth(),
        height: image.getHeight(),
        samples,
        bits,
        channels: isGray ? 1 : 3,
        whiteIsZero: photometric === 0,
        orientation: orientation >= 1 && orientation <= 8 ? orientation : 1,
      },
      enc,
    );
    const make = await dir.loadValue('Make');
    const model = await dir.loadValue('Model');
    return {
      image: linear,
      camera: [make, model].filter(Boolean).join(' ').trim(),
      iso: 0,
      baselineEv: 0,
    };
  }

  private async encodingOf(dir: ImageFileDirectory): Promise<ColorEncoding> {
    try {
      const raw = (await dir.loadValue(ICC_PROFILE_TAG)) as ArrayLike<number> | undefined;
      if (raw && raw.length) return parseIccEncoding(Uint8Array.from(raw)) ?? SRGB_ENCODING;
    } catch {
      // Unreadable profile: treat as sRGB.
    }
    return SRGB_ENCODING;
  }
}
