import type { LevelDef } from './level';

export interface LevelRequest {
  id: number;
  number: number;
  seed: number;
}

export interface LevelResponse {
  id: number;
  def: LevelDef;
}

/** Builds a level somewhere off the main thread. */
export type LevelBuilder = (number: number, seed: number) => Promise<LevelDef>;

const keyOf = (number: number, seed: number): string => `${seed}:${number}`;

/**
 * Levels built ahead of time. Making one takes anywhere up to a good fraction of a second, which is a
 * visible stutter when it happens between two frames, so the next one is requested as soon as a level
 * starts and is normally waiting by the time it is needed.
 */
export class LevelSource {
  private readonly ready = new Map<string, LevelDef>();
  private readonly asked = new Set<string>();

  /** Without a builder nothing is prefetched, and every level is made on demand. */
  constructor(private readonly builder?: LevelBuilder) {}

  /** The prefetched level, if it has arrived; each is handed out once. */
  take(number: number, seed: number): LevelDef | undefined {
    const key = keyOf(number, seed);
    const def = this.ready.get(key);
    this.ready.delete(key);
    this.asked.delete(key);
    return def;
  }

  prefetch(number: number, seed: number): void {
    const key = keyOf(number, seed);
    if (!this.builder || this.ready.has(key) || this.asked.has(key)) return;
    this.asked.add(key);
    this.builder(number, seed).then(
      (def) => {
        // Taken, or no longer wanted, in the meantime.
        if (this.asked.has(key)) this.ready.set(key, def);
      },
      () => this.asked.delete(key),
    );
  }

  /** Forgets everything requested so far, such as when a new run picks a new seed. */
  clear(): void {
    this.ready.clear();
    this.asked.clear();
  }
}

/** A builder backed by one worker, started on first use; `stop` ends it. */
export const workerLevelBuilder = (): { build: LevelBuilder; stop: () => void } => {
  let worker: Worker | undefined;
  let next = 0;
  const waiting = new Map<number, { resolve: (def: LevelDef) => void; reject: (error: Error) => void }>();

  const start = (): Worker => {
    const made = new Worker(new URL('./level.worker', import.meta.url), { type: 'module' });
    made.onmessage = (event: MessageEvent<LevelResponse>) => {
      waiting.get(event.data.id)?.resolve(event.data.def);
      waiting.delete(event.data.id);
    };
    made.onerror = () => {
      for (const { reject } of waiting.values()) reject(new Error('Level worker failed.'));
      waiting.clear();
      made.terminate();
      worker = undefined;
    };
    return made;
  };

  return {
    build: (number, seed) =>
      new Promise((resolve, reject) => {
        worker ??= start();
        const id = next++;
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, number, seed } satisfies LevelRequest);
      }),
    stop: () => {
      worker?.terminate();
      worker = undefined;
      waiting.clear();
    },
  };
};
