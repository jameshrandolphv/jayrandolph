import { Injectable } from '@angular/core';
import { PROGRESS_STORE, idbGet, idbPut, openAppDb } from './app-db';

interface ProgressRecord {
  game: string;
  level: number;
  /** Seed the level was generated from, for games whose levels are random. */
  seed?: number;
}

export interface Progress {
  /** 0 when there is nothing to resume. */
  level: number;
  /** Absent for progress saved without one. */
  seed?: number;
}

export interface ProgressStoreOptions {
  idb?: IDBFactory;
  dbName?: string;
}

/** The level a player reached in each game; unlike scores it isn't signed, as nothing is gained by editing it. */
export class ProgressStore {
  private readonly idb: IDBFactory | undefined;
  private dbPromise?: Promise<IDBDatabase>;
  /** Used when storage is unavailable, so progress still holds for this session. */
  private readonly session = new Map<string, Progress>();

  constructor(private readonly options: ProgressStoreOptions = {}) {
    this.idb = options.idb ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
  }

  /** 0 when there is nothing to resume. */
  async load(game: string): Promise<number> {
    return (await this.loadProgress(game)).level;
  }

  async loadProgress(game: string): Promise<Progress> {
    const session = this.session.get(game);
    if (session !== undefined) return session;
    try {
      const record = await idbGet<ProgressRecord>(await this.open(), PROGRESS_STORE, game);
      if (!record || !Number.isSafeInteger(record.level) || record.level <= 0) return { level: 0 };
      return Number.isSafeInteger(record.seed) ? { level: record.level, seed: record.seed } : { level: record.level };
    } catch {
      return { level: 0 };
    }
  }

  /** Saving 0 clears the progress. */
  async save(game: string, level: number, seed?: number): Promise<void> {
    this.session.set(game, seed === undefined ? { level } : { level, seed });
    try {
      await idbPut(await this.open(), PROGRESS_STORE, { game, level, seed } satisfies ProgressRecord);
    } catch {
      // The session value still applies.
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.idb) return Promise.reject(new Error('Storage is unavailable'));
    this.dbPromise ??= openAppDb(this.idb, this.options.dbName).catch((error) => {
      this.dbPromise = undefined;
      throw error;
    });
    return this.dbPromise;
  }
}

@Injectable({ providedIn: 'root' })
export class ProgressService extends ProgressStore {
  constructor() {
    super();
  }
}
