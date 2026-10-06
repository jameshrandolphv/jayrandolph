const parsed = new Map<string, readonly [number, number, number]>();

const rgb = (hex: string): readonly [number, number, number] => {
  let c = parsed.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    parsed.set(hex, c);
  }
  return c;
};

/** RGBA pixel buffer for authoring pixel-art sprites in code; colors are `#rrggbb`. */
export class Pixels {
  readonly data: Uint8ClampedArray<ArrayBuffer>;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /** Builds a sprite from rows of palette characters; `.` and unknown characters are transparent. */
  static fromRows(rows: readonly string[], palette: Readonly<Record<string, string>>): Pixels {
    const p = new Pixels(Math.max(...rows.map((r) => r.length)), rows.length);
    rows.forEach((row, y) => [...row].forEach((ch, x) => p.set(x, y, palette[ch] ?? null)));
    return p;
  }

  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.data[(y * this.width + x) * 4 + 3] > 0;
  }

  set(x: number, y: number, color: string | null): this {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return this;
    const i = (y * this.width + x) * 4;
    if (color === null) {
      this.data[i + 3] = 0;
      return this;
    }
    const [r, g, b] = rgb(color);
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = 255;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, color: string | null): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string | null): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, color);
      }
    }
    return this;
  }

  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, color: string | null): this {
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) return this;
    for (let y = Math.floor(Math.min(y0, y1, y2)); y <= Math.ceil(Math.max(y0, y1, y2)); y++) {
      for (let x = Math.floor(Math.min(x0, x1, x2)); x <= Math.ceil(Math.max(x0, x1, x2)); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const a = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
        const b = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
        if (a >= 0 && b >= 0 && a + b <= 1) this.set(x, y, color);
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string | null): this {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /** Copies `src` onto this buffer; transparent source pixels leave the destination untouched. */
  stamp(src: Pixels, ox = 0, oy = 0): this {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const s = (y * src.width + x) * 4;
        if (src.data[s + 3] === 0) continue;
        const tx = x + ox;
        const ty = y + oy;
        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
        const d = (ty * this.width + tx) * 4;
        this.data.set(src.data.subarray(s, s + 4), d);
      }
    }
    return this;
  }

  /** Returns a copy with a one-pixel border around every opaque pixel; callers must leave room for it. */
  outlined(color: string, diagonals = false): Pixels {
    const out = new Pixels(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.has(x, y)) continue;
        const near =
          this.has(x - 1, y) ||
          this.has(x + 1, y) ||
          this.has(x, y - 1) ||
          this.has(x, y + 1) ||
          (diagonals && (this.has(x - 1, y - 1) || this.has(x + 1, y - 1) || this.has(x - 1, y + 1) || this.has(x + 1, y + 1)));
        if (near) out.set(x, y, color);
      }
    }
    return out.stamp(this);
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.getContext('2d')!.putImageData(new ImageData(this.data, this.width, this.height), 0, 0);
    return canvas;
  }
}
