/// <reference lib="webworker" />
import type { FromWorker, ToWorker } from './engine-protocol';

interface EngineExports {
  memory: WebAssembly.Memory;
  fs_alloc(len: number): number;
  fs_free(ptr: number, len: number): void;
  fs_film_load(ptr: number, len: number): number;
  fs_film_free(film: number): void;
  fs_process_tile_u16(
    film: number,
    params: number,
    input: number,
    output: number,
    w: number,
    h: number,
  ): number;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let engine: EngineExports | null = null;
const films = new Map<string, number>();

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

function loadFilm(id: string, bytes: ArrayBuffer): void {
  const e = engine!;
  const old = films.get(id);
  if (old) e.fs_film_free(old);
  const ptr = e.fs_alloc(bytes.byteLength);
  new Uint8Array(e.memory.buffer, ptr, bytes.byteLength).set(new Uint8Array(bytes));
  const handle = e.fs_film_load(ptr, bytes.byteLength);
  e.fs_free(ptr, bytes.byteLength);
  if (!handle) throw new Error(`Film data "${id}" is invalid.`);
  films.set(id, handle);
}

function runTile(msg: Extract<ToWorker, { type: 'tile' }>): Uint16Array {
  const e = engine!;
  const film = films.get(msg.film);
  if (!film) throw new Error(`Film "${msg.film}" is not loaded.`);
  const count = msg.width * msg.height * 3;
  const pBytes = msg.params.byteLength;
  const params = e.fs_alloc(pBytes);
  const input = e.fs_alloc(count * 2);
  const output = e.fs_alloc(count * 2);
  try {
    // Memory may grow on any allocation, so create views only after all allocations.
    new Float32Array(e.memory.buffer, params, msg.params.length).set(msg.params);
    new Uint16Array(e.memory.buffer, input, count).set(msg.input);
    const rc = e.fs_process_tile_u16(film, params, input, output, msg.width, msg.height);
    if (rc !== 0) throw new Error(`Engine returned status ${rc}.`);
    const full = new Uint16Array(e.memory.buffer, output, count);
    const out = new Uint16Array(msg.cropW * msg.cropH * 3);
    for (let y = 0; y < msg.cropH; y++) {
      const s = ((msg.cropY + y) * msg.width + msg.cropX) * 3;
      out.set(full.subarray(s, s + msg.cropW * 3), y * msg.cropW * 3);
    }
    return out;
  } finally {
    e.fs_free(params, pBytes);
    e.fs_free(input, count * 2);
    e.fs_free(output, count * 2);
  }
}

ctx.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'init': {
        const instance = await WebAssembly.instantiate(msg.module, {});
        engine = instance.exports as unknown as EngineExports;
        post({ type: 'ready' });
        break;
      }
      case 'film':
        loadFilm(msg.id, msg.bytes);
        post({ type: 'film-loaded', id: msg.id });
        break;
      case 'tile': {
        const output = runTile(msg);
        post({ type: 'tile-done', job: msg.job, output }, [output.buffer]);
        break;
      }
    }
  } catch (err) {
    post({
      type: 'error',
      job: msg.type === 'tile' ? msg.job : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
