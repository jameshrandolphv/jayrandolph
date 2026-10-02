import type { LinearImage } from './raw-decoder.service';

type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const REC2020_TO_XYZ: Mat3 = [
  0.636958, 0.144617, 0.168881, 0.2627, 0.677998, 0.059302, 0, 0.028073, 1.060985,
];
const XYZ_TO_SRGB: Mat3 = [
  3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259,
  1.0572252,
];

function mul(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]);
    }
  }
  return out as unknown as Mat3;
}

const REC2020_TO_SRGB = mul(XYZ_TO_SRGB, REC2020_TO_XYZ);

const LUT_SIZE = 4096;
const SRGB_LUT = new Uint8ClampedArray(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const l = i / (LUT_SIZE - 1);
  SRGB_LUT[i] = Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));
}

function encode(linear: number): number {
  const i = Math.round(linear * (LUT_SIZE - 1));
  return SRGB_LUT[i < 0 ? 0 : i >= LUT_SIZE ? LUT_SIZE - 1 : i];
}

export interface PreviewImage {
  readonly width: number;
  readonly height: number;
  /** sRGB RGBA, 8-bit. */
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  /** Position of this crop in full-resolution pixels (absent for whole-image previews). */
  readonly origin?: { readonly x: number; readonly y: number };
}

/** Box-downsamples linear data so the long side is at most `maxDim` (never upsamples). */
export function downscaleLinear(img: LinearImage, maxDim: number): LinearImage {
  const scale = Math.max(1, Math.max(img.width, img.height) / maxDim);
  if (scale === 1) return img;
  const w = Math.max(1, Math.floor(img.width / scale));
  const h = Math.max(1, Math.floor(img.height / scale));
  const out = new Uint16Array(w * h * 3);
  const src = img.data;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * scale)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * scale)));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = y0; yy < y1; yy++) {
        let p = (yy * img.width + x0) * 3;
        for (let xx = x0; xx < x1; xx++, p += 3) {
          r += src[p];
          g += src[p + 1];
          b += src[p + 2];
        }
      }
      const inv = 1 / ((y1 - y0) * (x1 - x0));
      const o = (y * w + x) * 3;
      out[o] = Math.round(r * inv);
      out[o + 1] = Math.round(g * inv);
      out[o + 2] = Math.round(b * inv);
    }
  }
  return { width: w, height: h, data: out };
}

/** Encodes linear Rec.2020 data to an sRGB display preview (no downscaling). */
export function buildPreview(img: LinearImage): PreviewImage {
  const w = img.width;
  const h = img.height;
  const out = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  const src = img.data;
  const m = REC2020_TO_SRGB;
  const k = 1 / 65535;
  for (let i = 0, o = 0; i < w * h * 3; i += 3, o += 4) {
    const r = src[i] * k;
    const g = src[i + 1] * k;
    const b = src[i + 2] * k;
    out.data[o] = encode(m[0] * r + m[1] * g + m[2] * b);
    out.data[o + 1] = encode(m[3] * r + m[4] * g + m[5] * b);
    out.data[o + 2] = encode(m[6] * r + m[7] * g + m[8] * b);
    out.data[o + 3] = 255;
  }
  return out;
}

/** Converts 16-bit display-encoded RGB to an 8-bit RGBA preview. */
export function previewFromEncoded(
  img: {
    readonly width: number;
    readonly height: number;
    readonly data: Uint16Array;
  },
  origin?: { readonly x: number; readonly y: number },
): PreviewImage {
  const n = img.width * img.height;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0, s = 0, o = 0; i < n; i++, s += 3, o += 4) {
    data[o] = img.data[s] >> 8;
    data[o + 1] = img.data[s + 1] >> 8;
    data[o + 2] = img.data[s + 2] >> 8;
    data[o + 3] = 255;
  }
  return { width: img.width, height: img.height, data, origin };
}
