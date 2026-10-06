/** Reads matrix/TRC RGB ICC profiles and describes them as a decode to linear Rec.2020. */

export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
type Vec3 = readonly [number, number, number];

/** Encoded channel value (0..1) to linear light. */
export type Trc = (v: number) => number;

export interface ColorEncoding {
  readonly trc: readonly [Trc, Trc, Trc];
  /** Linear source RGB to linear Rec.2020 (D65). */
  readonly toRec2020: Mat3;
}

const REC2020_TO_XYZ: Mat3 = [
  0.636958, 0.144617, 0.168881, 0.2627, 0.677998, 0.059302, 0, 0.028073, 1.060985,
];
const SRGB_TO_XYZ_D65: Mat3 = [
  0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041,
];
const D50: Vec3 = [0.9642, 1, 0.8249];
const D65: Vec3 = [0.95047, 1, 1.08883];
const BRADFORD: Mat3 = [
  0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296,
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

function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    C / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}

function bradford(src: Vec3, dst: Vec3): Mat3 {
  const s = apply(BRADFORD, src);
  const d = apply(BRADFORD, dst);
  const scale: Mat3 = [d[0] / s[0], 0, 0, 0, d[1] / s[1], 0, 0, 0, d[2] / s[2]];
  return mul(invert(BRADFORD), mul(scale, BRADFORD));
}

const XYZ_D65_TO_REC2020 = invert(REC2020_TO_XYZ);
const D50_TO_D65 = bradford(D50, D65);

// Rounded matrix constants leave white a hair off-neutral; scale rows to sum to 1.
function normalizeRows(m: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    const s = m[3 * r] + m[3 * r + 1] + m[3 * r + 2];
    out.push(m[3 * r] / s, m[3 * r + 1] / s, m[3 * r + 2] / s);
  }
  return out as unknown as Mat3;
}

function srgbDecode(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export const SRGB_ENCODING: ColorEncoding = {
  trc: [srgbDecode, srgbDecode, srgbDecode],
  toRec2020: normalizeRows(mul(XYZ_D65_TO_REC2020, SRGB_TO_XYZ_D65)),
};

export const LINEAR_REC2020_ENCODING: ColorEncoding = {
  trc: [(v) => v, (v) => v, (v) => v],
  toRec2020: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};

const sig = (dv: DataView, o: number): string =>
  String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

function parseXyz(dv: DataView, o: number): Vec3 {
  if (sig(dv, o) !== 'XYZ ') throw new Error('Bad XYZ tag');
  return [dv.getInt32(o + 8) / 65536, dv.getInt32(o + 12) / 65536, dv.getInt32(o + 16) / 65536];
}

function parseCurve(dv: DataView, o: number): Trc {
  const type = sig(dv, o);
  if (type === 'curv') {
    const n = dv.getUint32(o + 8);
    if (n === 0) return (v) => v;
    if (n === 1) {
      const g = dv.getUint16(o + 12) / 256;
      return (v) => Math.pow(Math.max(v, 0), g);
    }
    const table = new Float32Array(n);
    for (let i = 0; i < n; i++) table[i] = dv.getUint16(o + 12 + 2 * i) / 65535;
    return (v) => {
      const x = Math.min(1, Math.max(0, v)) * (n - 1);
      const i = Math.min(n - 2, Math.floor(x));
      return table[i] + (table[i + 1] - table[i]) * (x - i);
    };
  }
  if (type === 'para') {
    const fn = dv.getUint16(o + 8);
    const counts = [1, 3, 4, 5, 7];
    if (fn > 4) throw new Error('Bad parametric curve');
    const p = Array.from({ length: counts[fn] }, (_, i) => dv.getInt32(o + 12 + 4 * i) / 65536);
    const [g, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] = p;
    const pw = (x: number) => Math.pow(Math.max(x, 0), g);
    switch (fn) {
      case 0:
        return (v) => pw(v);
      case 1:
        return (v) => (v >= -b / a ? pw(a * v + b) : 0);
      case 2:
        return (v) => (v >= -b / a ? pw(a * v + b) + c : c);
      case 3:
        return (v) => (v >= d ? pw(a * v + b) : c * v);
      default:
        return (v) => (v >= d ? pw(a * v + b) + e : c * v + f);
    }
  }
  throw new Error('Unsupported curve type');
}

/** Returns null for anything other than an RGB matrix/TRC profile. */
export function parseIccEncoding(icc: Uint8Array): ColorEncoding | null {
  try {
    if (icc.length < 132) return null;
    const dv = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
    if (sig(dv, 36) !== 'acsp' || sig(dv, 16) !== 'RGB ' || sig(dv, 20) !== 'XYZ ') return null;
    const tags = new Map<string, number>();
    const count = dv.getUint32(128);
    for (let i = 0; i < count; i++) {
      const e = 132 + 12 * i;
      tags.set(sig(dv, e), dv.getUint32(e + 4));
    }
    const at = (name: string): number => {
      const o = tags.get(name);
      if (o === undefined) throw new Error(`Missing ${name}`);
      return o;
    };
    const r = parseXyz(dv, at('rXYZ'));
    const g = parseXyz(dv, at('gXYZ'));
    const b = parseXyz(dv, at('bXYZ'));
    const toXyzD50: Mat3 = [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]];
    return {
      trc: [
        parseCurve(dv, at('rTRC')),
        parseCurve(dv, at('gTRC')),
        parseCurve(dv, at('bTRC')),
      ],
      toRec2020: normalizeRows(mul(XYZ_D65_TO_REC2020, mul(D50_TO_D65, toXyzD50))),
    };
  } catch {
    return null;
  }
}
