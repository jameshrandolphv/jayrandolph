import { Injectable } from '@angular/core';
import type { LinearImage } from '../core/raw-decoder.service';
import type { FromWorker, ToWorker } from './engine-protocol';
import {
  GRAIN_ORIGIN_X,
  GRAIN_ORIGIN_Y,
  buildParams,
  pixelSizeUm,
  type FilmMeta,
  type RenderSettings,
} from './film-params';

/** 16-bit interleaved sRGB-encoded RGB. */
export interface ProcessedImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint16Array;
}

export interface ProcessRequest {
  readonly source: LinearImage;
  readonly stock: string;
  readonly settings: RenderSettings;
  /** Process only this rectangle of `source` (default: the whole image). */
  readonly region?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly signal?: AbortSignal;
  readonly onProgress?: (fraction: number) => void;
}

const TILE = 512;
const WASM_URL = 'engine/film_engine.wasm';

interface Pending {
  resolve(output: Uint16Array): void;
  reject(err: Error): void;
}

interface Worker1 {
  readonly worker: Worker;
  busy: boolean;
}

@Injectable({ providedIn: 'root' })
export class FilmEngineService {
  private pool: Worker1[] | null = null;
  private setup: Promise<void> | null = null;
  private module: WebAssembly.Module | null = null;
  private haloFn: ((params: Float32Array) => number) | null = null;
  private readonly filmMeta = new Map<string, Promise<FilmMeta>>();
  private readonly filmLoaded = new Map<string, Promise<void>>();
  private readonly pending = new Map<number, Pending>();
  private readonly filmAcks = new Map<
    string,
    { left: number; resolve(): void; reject(e: Error): void }
  >();
  private nextJob = 1;
  private waiters: (() => void)[] = [];

  async process(req: ProcessRequest): Promise<ProcessedImage> {
    await this.ensureReady();
    const meta = await this.loadMeta(req.stock);
    await this.ensureFilm(req.stock);
    throwIfAborted(req.signal);

    const { source } = req;
    const params = buildParams(
      meta,
      req.settings,
      pixelSizeUm(Math.max(source.width, source.height)),
    );
    const halo = this.haloFn!(params);
    const region = req.region ?? { x: 0, y: 0, w: source.width, h: source.height };
    const out = new Uint16Array(region.w * region.h * 3);

    const tasks: (() => Promise<void>)[] = [];
    let done = 0;
    const cols = Math.ceil(region.w / TILE);
    const rows = Math.ceil(region.h / TILE);
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const x0 = tx * TILE;
        const y0 = ty * TILE;
        const w = Math.min(TILE, region.w - x0);
        const h = Math.min(TILE, region.h - y0);
        tasks.push(async () => {
          throwIfAborted(req.signal);
          const ax = region.x + x0 - halo;
          const ay = region.y + y0 - halo;
          const input = extractTile(source, ax, ay, w + 2 * halo, h + 2 * halo);
          // Grain is keyed on absolute pixel coordinates so it is identical however we tile.
          const tileParams = params.slice();
          tileParams[GRAIN_ORIGIN_X] = ax;
          tileParams[GRAIN_ORIGIN_Y] = ay;
          const result = await this.runOnWorker(
            {
              type: 'tile',
              job: 0,
              film: req.stock,
              params: tileParams,
              input,
              width: w + 2 * halo,
              height: h + 2 * halo,
              cropX: halo,
              cropY: halo,
              cropW: w,
              cropH: h,
            },
            req.signal,
          );
          for (let y = 0; y < h; y++) {
            out.set(
              result.subarray(y * w * 3, (y + 1) * w * 3),
              ((y0 + y) * region.w + x0) * 3,
            );
          }
          done++;
          req.onProgress?.(done / tasks.length);
        });
      }
    }
    await Promise.all(tasks.map((t) => t()));
    return { width: region.w, height: region.h, data: out };
  }

  // --- setup ---

  private ensureReady(): Promise<void> {
    this.setup ??= this.start();
    return this.setup;
  }

  private async start(): Promise<void> {
    const response = await fetch(WASM_URL);
    if (!response.ok) throw new Error('Could not load the film engine.');
    this.module = await WebAssembly.compile(await response.arrayBuffer());

    const instance = await WebAssembly.instantiate(this.module, {});
    const ex = instance.exports as unknown as {
      memory: WebAssembly.Memory;
      fs_alloc(n: number): number;
      fs_free(p: number, n: number): void;
      fs_required_halo(p: number): number;
    };
    this.haloFn = (params) => {
      const ptr = ex.fs_alloc(params.byteLength);
      new Float32Array(ex.memory.buffer, ptr, params.length).set(params);
      const halo = ex.fs_required_halo(ptr);
      ex.fs_free(ptr, params.byteLength);
      return halo;
    };

    // Each worker owns a WASM heap sized for a full tile plus halo, so phones get a small pool to stay under the OS memory limit.
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const n = Math.max(1, Math.min(coarse ? 2 : 8, (navigator.hardwareConcurrency || 4) - 1));
    const pool: Worker1[] = [];
    await Promise.all(
      Array.from({ length: n }, () => {
        const worker = new Worker(new URL('./engine.worker', import.meta.url), {
          type: 'module',
        });
        const entry: Worker1 = { worker, busy: false };
        pool.push(entry);
        return new Promise<void>((resolve, reject) => {
          worker.onmessage = (e: MessageEvent<FromWorker>) => {
            if (e.data.type === 'ready') {
              worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(entry, ev.data);
              resolve();
            }
          };
          worker.onerror = (e) => reject(new Error(e.message || 'Engine worker failed.'));
          worker.postMessage({ type: 'init', module: this.module! } satisfies ToWorker);
        });
      }),
    );
    this.pool = pool;
  }

  private loadMeta(stock: string): Promise<FilmMeta> {
    let p = this.filmMeta.get(stock);
    if (!p) {
      p = fetch(`film/${stock}.json`).then((r) => {
        if (!r.ok) throw new Error(`Missing film data for ${stock}.`);
        return r.json() as Promise<FilmMeta>;
      });
      this.filmMeta.set(stock, p);
    }
    return p;
  }

  private ensureFilm(stock: string): Promise<void> {
    let p = this.filmLoaded.get(stock);
    if (!p) {
      p = (async () => {
        const r = await fetch(`film/${stock}.fsp`);
        if (!r.ok) throw new Error(`Missing film data for ${stock}.`);
        const bytes = await r.arrayBuffer();
        await new Promise<void>((resolve, reject) => {
          this.filmAcks.set(stock, { left: this.pool!.length, resolve, reject });
          for (const w of this.pool!) {
            w.worker.postMessage({
              type: 'film',
              id: stock,
              bytes: bytes.slice(0),
            } satisfies ToWorker);
          }
        });
      })();
      this.filmLoaded.set(stock, p);
      p.catch(() => this.filmLoaded.delete(stock));
    }
    return p;
  }

  // --- scheduling ---

  private async runOnWorker(msg: ToWorker & { type: 'tile' }, signal?: AbortSignal): Promise<Uint16Array> {
    const entry = await this.acquire(signal);
    const job = this.nextJob++;
    return new Promise<Uint16Array>((resolve, reject) => {
      this.pending.set(job, {
        resolve: (o) => {
          this.release(entry);
          resolve(o);
        },
        reject: (e) => {
          this.release(entry);
          reject(e);
        },
      });
      entry.worker.postMessage({ ...msg, job } satisfies ToWorker, [msg.input.buffer]);
    });
  }

  private async acquire(signal?: AbortSignal): Promise<Worker1> {
    for (;;) {
      throwIfAborted(signal);
      const free = this.pool!.find((w) => !w.busy);
      if (free) {
        free.busy = true;
        return free;
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  private release(entry: Worker1): void {
    entry.busy = false;
    // Wake everyone: a single wake-up can be swallowed by an aborted waiter, stalling live ones.
    const waiters = this.waiters;
    this.waiters = [];
    for (const wake of waiters) wake();
  }

  private onMessage(_entry: Worker1, msg: FromWorker): void {
    if (msg.type === 'film-loaded') {
      const ack = this.filmAcks.get(msg.id);
      if (ack && --ack.left === 0) {
        this.filmAcks.delete(msg.id);
        ack.resolve();
      }
    } else if (msg.type === 'error' && msg.job === undefined) {
      for (const [id, ack] of this.filmAcks) {
        this.filmAcks.delete(id);
        ack.reject(new Error(msg.message));
      }
    } else if (msg.type === 'tile-done') {
      this.pending.get(msg.job)?.resolve(msg.output);
      this.pending.delete(msg.job);
    } else if (msg.type === 'error' && msg.job !== undefined) {
      this.pending.get(msg.job)?.reject(new Error(msg.message));
      this.pending.delete(msg.job);
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

/** Copies a rectangle (possibly extending past the image) with edge replication. */
export function extractTile(
  src: LinearImage,
  x0: number,
  y0: number,
  w: number,
  h: number,
): Uint16Array {
  const out = new Uint16Array(w * h * 3);
  const maxX = src.width - 1;
  const maxY = src.height - 1;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(maxY, Math.max(0, y0 + y));
    const row = sy * src.width;
    let o = y * w * 3;
    for (let x = 0; x < w; x++, o += 3) {
      const sx = Math.min(maxX, Math.max(0, x0 + x));
      const s = (row + sx) * 3;
      out[o] = src.data[s];
      out[o + 1] = src.data[s + 1];
      out[o + 2] = src.data[s + 2];
    }
  }
  return out;
}
