import { srgbIccProfile } from './icc';

export type ExportFormat = 'png16' | 'tiff16' | 'jpeg';

export interface EncodeInput {
  /** Interleaved 16-bit display-encoded sRGB. */
  readonly data: Uint16Array;
  readonly width: number;
  readonly height: number;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(...parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(v: number): Uint8Array {
  return Uint8Array.of((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array[] {
  const t = Uint8Array.from(type, (c) => c.charCodeAt(0));
  return [u32be(data.length), t, data, u32be(crc32(t, data))];
}

const PNG_ROWS_PER_BATCH = 64;

/** 16-bit RGB PNG tagged sRGB. Rows are streamed through the browser's zlib. */
export async function encodePng16({ data, width, height }: EncodeInput): Promise<Blob> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const compressed: Uint8Array[] = [];
  const drain = (async () => {
    const reader = cs.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      compressed.push(value);
    }
  })();

  const rowSamples = width * 3;
  const rowBytes = rowSamples * 2 + 1;
  for (let y0 = 0; y0 < height; y0 += PNG_ROWS_PER_BATCH) {
    const rows = Math.min(PNG_ROWS_PER_BATCH, height - y0);
    const buf = new Uint8Array(rows * rowBytes);
    for (let r = 0; r < rows; r++) {
      let o = r * rowBytes + 1; // filter type 0
      let s = (y0 + r) * rowSamples;
      for (let i = 0; i < rowSamples; i++, s++, o += 2) {
        const v = data[s];
        buf[o] = v >> 8;
        buf[o + 1] = v & 255;
      }
    }
    await writer.write(buf);
  }
  await writer.close();
  await drain;

  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr.set([16, 2, 0, 0, 0], 8); // 16-bit, truecolour, deflate, no filter, no interlace
  const parts: Uint8Array[] = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)];
  parts.push(...pngChunk('IHDR', ihdr), ...pngChunk('sRGB', Uint8Array.of(0)));
  for (const c of compressed) parts.push(...pngChunk('IDAT', c));
  parts.push(...pngChunk('IEND', new Uint8Array(0)));
  return new Blob(parts as BlobPart[], { type: 'image/png' });
}

/** Uncompressed single-strip 16-bit RGB TIFF with an embedded sRGB ICC profile. */
export function encodeTiff16({ data, width, height }: EncodeInput): Blob {
  const icc = srgbIccProfile();
  const tags = 11;
  const ifdSize = 2 + tags * 12 + 4;
  const bpsOffset = 8 + ifdSize;
  const iccOffset = bpsOffset + 6 + ((bpsOffset + 6) % 2);
  const dataOffset = iccOffset + icc.length + (icc.length % 2);
  const head = new ArrayBuffer(dataOffset);
  const dv = new DataView(head);
  dv.setUint16(0, 0x4949, true);
  dv.setUint16(2, 42, true);
  dv.setUint32(4, 8, true);
  dv.setUint16(8, tags, true);
  let p = 10;
  const entry = (tag: number, type: number, count: number, value: number) => {
    dv.setUint16(p, tag, true);
    dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) dv.setUint16(p + 8, value, true);
    else dv.setUint32(p + 8, value, true);
    p += 12;
  };
  const SHORT = 3;
  const LONG = 4;
  const UNDEFINED = 7;
  entry(256, LONG, 1, width);
  entry(257, LONG, 1, height);
  entry(258, SHORT, 3, bpsOffset);
  entry(259, SHORT, 1, 1); // no compression
  entry(262, SHORT, 1, 2); // RGB
  entry(273, LONG, 1, dataOffset);
  entry(277, SHORT, 1, 3);
  entry(278, LONG, 1, height);
  entry(279, LONG, 1, width * height * 6);
  entry(284, SHORT, 1, 1); // chunky
  entry(34675, UNDEFINED, icc.length, iccOffset);
  dv.setUint32(p, 0, true);
  for (let i = 0; i < 3; i++) dv.setUint16(bpsOffset + i * 2, 16, true);
  new Uint8Array(head).set(icc, iccOffset);
  return new Blob([head, data as unknown as BlobPart], { type: 'image/tiff' });
}

const JPEG_ROWS_PER_BATCH = 256;

/** 8-bit JPEG via the browser encoder, with the sRGB ICC profile inserted. */
export async function encodeJpeg({ data, width, height }: EncodeInput, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available for JPEG export.');
  for (let y0 = 0; y0 < height; y0 += JPEG_ROWS_PER_BATCH) {
    const rows = Math.min(JPEG_ROWS_PER_BATCH, height - y0);
    const px = new Uint8ClampedArray(width * rows * 4);
    for (let i = 0, s = y0 * width * 3, o = 0; i < width * rows; i++, s += 3, o += 4) {
      px[o] = (data[s] + 128) / 257;
      px[o + 1] = (data[s + 1] + 128) / 257;
      px[o + 2] = (data[s + 2] + 128) / 257;
      px[o + 3] = 255;
    }
    ctx.putImageData(new ImageData(px, width, rows), 0, y0);
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encoding failed.'))), 'image/jpeg', quality),
  );
  return withJpegIcc(new Uint8Array(await blob.arrayBuffer()), srgbIccProfile());
}

export function withJpegIcc(jpeg: Uint8Array, icc: Uint8Array): Blob {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG.');
  // Keep the JFIF APP0 segment first if present.
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const id = Uint8Array.from('ICC_PROFILE\0', (c) => c.charCodeAt(0));
  const len = 2 + id.length + 2 + icc.length;
  const seg = new Uint8Array(2 + len);
  seg.set([0xff, 0xe2, len >> 8, len & 255]);
  seg.set(id, 4);
  seg.set([1, 1], 4 + id.length);
  seg.set(icc, 4 + id.length + 2);
  return new Blob([jpeg.subarray(0, at), seg, jpeg.subarray(at)] as BlobPart[], { type: 'image/jpeg' });
}

export const EXPORT_FORMATS: readonly { id: ExportFormat; label: string; ext: string }[] = [
  { id: 'png16', label: 'PNG (16-bit)', ext: 'png' },
  { id: 'tiff16', label: 'TIFF (16-bit)', ext: 'tif' },
  { id: 'jpeg', label: 'JPEG (8-bit)', ext: 'jpg' },
];
