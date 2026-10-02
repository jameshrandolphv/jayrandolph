import { describe, expect, it } from 'vitest';
import { crc32, encodePng16, encodeTiff16, withJpegIcc } from './encoders';
import { srgbIccProfile } from './icc';

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('encoders', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('builds a self-consistent sRGB ICC profile', () => {
    const p = srgbIccProfile();
    const dv = new DataView(p.buffer);
    expect(dv.getUint32(0)).toBe(p.length);
    expect(String.fromCharCode(...p.subarray(36, 40))).toBe('acsp');
    const count = dv.getUint32(128);
    expect(count).toBe(9);
    for (let i = 0; i < count; i++) {
      const off = dv.getUint32(128 + 4 + i * 12 + 4);
      const size = dv.getUint32(128 + 4 + i * 12 + 8);
      expect(off % 4).toBe(0);
      expect(off + size).toBeLessThanOrEqual(p.length);
    }
  });

  it('writes a 16-bit TIFF with the pixel data and ICC tag', async () => {
    const data = Uint16Array.from([0, 1, 2, 65535, 4660, 9, 7, 8, 9, 10, 11, 12]);
    const t = await bytes(encodeTiff16({ data, width: 2, height: 2 }));
    const dv = new DataView(t.buffer);
    expect(dv.getUint16(0, true)).toBe(0x4949);
    expect(dv.getUint16(8, true)).toBe(11);
    const tags = new Map<number, number>();
    for (let i = 0; i < 11; i++) tags.set(dv.getUint16(10 + i * 12, true), dv.getUint32(10 + i * 12 + 8, true));
    expect(tags.has(34675)).toBe(true);
    const start = tags.get(273)!;
    expect(tags.get(279)).toBe(24);
    expect(t.length).toBe(start + 24);
    expect(dv.getUint16(start + 6, true)).toBe(65535);
    const iccAt = tags.get(34675)!;
    expect(String.fromCharCode(...t.subarray(iccAt + 36, iccAt + 40))).toBe('acsp');
  });

  it('inserts an ICC segment after JFIF APP0', async () => {
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xdb, 0, 2);
    const out = await bytes(withJpegIcc(jpeg, Uint8Array.of(9, 9, 9)));
    expect([...out.subarray(0, 8)]).toEqual([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2]);
    expect([...out.subarray(8, 10)]).toEqual([0xff, 0xe2]);
    expect(out.length).toBe(jpeg.length + 2 + 2 + 12 + 2 + 3);
    expect([...out.subarray(out.length - 4)]).toEqual([0xff, 0xdb, 0, 2]);
  });

  it.skipIf(typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined')(
    'round-trips a 16-bit PNG',
    async () => {
      const w = 3;
      const h = 70;
      const data = new Uint16Array(w * h * 3).map((_, i) => (i * 977) & 0xffff);
      const png = await bytes(await encodePng16({ data, width: w, height: h }));
      expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      const dv = new DataView(png.buffer);
      let p = 8;
      const idat: Uint8Array[] = [];
      while (p < png.length) {
        const len = dv.getUint32(p);
        const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
        const body = png.subarray(p + 8, p + 8 + len);
        expect(dv.getUint32(p + 8 + len)).toBe(crc32(png.subarray(p + 4, p + 8), body));
        if (type === 'IHDR') {
          expect(dv.getUint32(p + 8)).toBe(w);
          expect(dv.getUint32(p + 12)).toBe(h);
          expect(body[8]).toBe(16);
        }
        if (type === 'IDAT') idat.push(body);
        p += 12 + len;
      }
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      void writer.write(new Uint8Array(await new Blob(idat as BlobPart[]).arrayBuffer()));
      void writer.close();
      const raw = new Uint8Array(await new Response(ds.readable).arrayBuffer());
      const rowBytes = w * 6 + 1;
      expect(raw.length).toBe(rowBytes * h);
      const last = (h - 1) * rowBytes + 1;
      const v = data[(h - 1) * w * 3 + 4];
      expect((raw[last + 8] << 8) | raw[last + 9]).toBe(v);
    },
  );
});
