/** Minimal ICC v2 matrix/TRC sRGB profile (D50-adapted primaries), generated at runtime. */

const TRC_ENTRIES = 1024;

function s15(v: number): number {
  return Math.round(v * 65536) | 0;
}

function ascii(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

class Bytes {
  readonly out: number[] = [];
  u8(...v: number[]): this {
    this.out.push(...v);
    return this;
  }
  u16(v: number): this {
    return this.u8((v >> 8) & 255, v & 255);
  }
  u32(v: number): this {
    return this.u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  }
  tag(s: string): this {
    return this.u8(...ascii(s));
  }
  pad(n: number): this {
    for (let i = 0; i < n; i++) this.out.push(0);
    return this;
  }
  align4(): this {
    return this.pad((4 - (this.out.length % 4)) % 4);
  }
}

function xyzTag(x: number, y: number, z: number): number[] {
  return new Bytes().tag('XYZ ').pad(4).u32(s15(x)).u32(s15(y)).u32(s15(z)).out;
}

function textTag(s: string): number[] {
  return new Bytes().tag('text').pad(4).tag(s).u8(0).out;
}

function descTag(s: string): number[] {
  return new Bytes()
    .tag('desc')
    .pad(4)
    .u32(s.length + 1)
    .tag(s)
    .u8(0)
    .u32(0)
    .u32(0)
    .u16(0)
    .u8(0)
    .pad(67).out;
}

function curveTag(): number[] {
  const b = new Bytes().tag('curv').pad(4).u32(TRC_ENTRIES);
  for (let i = 0; i < TRC_ENTRIES; i++) {
    const l = i / (TRC_ENTRIES - 1);
    const v = l <= 0.04045 ? l / 12.92 : Math.pow((l + 0.055) / 1.055, 2.4);
    b.u16(Math.round(v * 65535));
  }
  return b.out;
}

export function srgbIccProfile(): Uint8Array {
  const trc = curveTag();
  const entries: [string, number[], string?][] = [
    ['cprt', textTag('Public domain')],
    ['desc', descTag('sRGB IEC61966-2.1')],
    ['wtpt', xyzTag(0.9642, 1.0, 0.8249)],
    ['rXYZ', xyzTag(0.4360747, 0.2225045, 0.0139322)],
    ['gXYZ', xyzTag(0.3850649, 0.7168786, 0.0971045)],
    ['bXYZ', xyzTag(0.1430804, 0.0606169, 0.7141733)],
    ['rTRC', trc],
    ['gTRC', trc, 'rTRC'],
    ['bTRC', trc, 'rTRC'],
  ];

  const tableEnd = 128 + 4 + entries.length * 12;
  const body = new Bytes();
  const placed = new Map<string, { offset: number; size: number }>();
  const table = new Bytes().u32(entries.length);
  for (const [sig, data, shareWith] of entries) {
    let loc = shareWith ? placed.get(shareWith)! : undefined;
    if (!loc) {
      loc = { offset: tableEnd + body.out.length, size: data.length };
      body.u8(...data).align4();
    }
    placed.set(sig, loc);
    table.tag(sig).u32(loc.offset).u32(loc.size);
  }

  const header = new Bytes()
    .u32(tableEnd + body.out.length)
    .pad(4)
    .u32(0x02100000)
    .tag('mntr')
    .tag('RGB ')
    .tag('XYZ ')
    .u16(2024)
    .u16(1)
    .u16(1)
    .u16(0)
    .u16(0)
    .u16(0)
    .tag('acsp')
    .pad(4 * 3 + 4 + 8)
    .u32(0)
    .u32(s15(0.9642))
    .u32(s15(1.0))
    .u32(s15(0.8249))
    .pad(4 + 16 + 28);
  if (header.out.length !== 128) throw new Error('ICC header size mismatch');
  return Uint8Array.from([...header.out, ...table.out, ...body.out]);
}
