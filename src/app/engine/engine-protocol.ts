/** Messages exchanged between the main thread and the engine workers. */

export type ToWorker =
  | { type: 'init'; module: WebAssembly.Module }
  | { type: 'film'; id: string; bytes: ArrayBuffer }
  | {
      type: 'tile';
      job: number;
      film: string;
      params: Float32Array;
      /** Interleaved 16-bit linear Rec.2020, `width * height * 3`, halo included. */
      input: Uint16Array;
      width: number;
      height: number;
      /** Payload rectangle inside the tile (the rest is halo). */
      cropX: number;
      cropY: number;
      cropW: number;
      cropH: number;
    };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'film-loaded'; id: string }
  | { type: 'tile-done'; job: number; output: Uint16Array }
  | { type: 'error'; job?: number; message: string };
