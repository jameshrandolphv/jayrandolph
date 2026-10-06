import { Injectable } from '@angular/core';
import { META_STORE, SCORES_STORE, idbGet, idbPut, openAppDb } from './app-db';

const KEY_ID = 'score-hmac-key';

interface KeyRecord {
  id: string;
  key: CryptoKey;
}

interface ScoreRecord {
  game: string;
  score: number;
  mac: ArrayBuffer;
}

export interface ScoreResult {
  best: number;
  isNewBest: boolean;
}

export interface ScoreStoreOptions {
  idb?: IDBFactory;
  subtle?: SubtleCrypto;
  dbName?: string;
}

/**
 * High scores signed with a non-extractable HMAC key kept in IndexedDB, so edited records are
 * rejected. This stops casual tampering only: script running in the page can still call `sign`.
 */
export class ScoreStore {
  private readonly idb: IDBFactory | undefined;
  private readonly subtle: SubtleCrypto | undefined;
  private dbPromise?: Promise<{ db: IDBDatabase; key: CryptoKey }>;
  /** Used when storage is unavailable, and as the floor for this session. */
  private readonly session = new Map<string, number>();

  constructor(private readonly options: ScoreStoreOptions = {}) {
    this.idb = options.idb ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
    this.subtle = options.subtle ?? (typeof crypto === 'undefined' ? undefined : crypto.subtle);
  }

  async getBest(game: string): Promise<number> {
    const stored = await this.readStored(game);
    return Math.max(stored, this.session.get(game) ?? 0);
  }

  async submit(game: string, score: number): Promise<ScoreResult> {
    const best = await this.getBest(game);
    if (!Number.isSafeInteger(score) || score <= best) return { best, isNewBest: false };
    this.session.set(game, score);
    await this.writeStored(game, score);
    return { best: score, isNewBest: true };
  }

  private async readStored(game: string): Promise<number> {
    try {
      const { db, key } = await this.open();
      const record = await idbGet<ScoreRecord>(db, SCORES_STORE, game);
      if (!record || !Number.isSafeInteger(record.score) || record.score < 0) return 0;
      const valid = await this.subtle!.verify('HMAC', key, record.mac, payload(game, record.score));
      return valid ? record.score : 0;
    } catch {
      return 0;
    }
  }

  private async writeStored(game: string, score: number): Promise<void> {
    try {
      const { db, key } = await this.open();
      const mac = await this.subtle!.sign('HMAC', key, payload(game, score));
      await idbPut(db, SCORES_STORE, { game, score, mac } satisfies ScoreRecord);
    } catch {
      // The session score still applies.
    }
  }

  private open() {
    this.dbPromise ??= this.openWithKey().catch((error) => {
      this.dbPromise = undefined;
      throw error;
    });
    return this.dbPromise;
  }

  private async openWithKey(): Promise<{ db: IDBDatabase; key: CryptoKey }> {
    if (!this.idb || !this.subtle) throw new Error('Secure storage is unavailable');
    const db = await openAppDb(this.idb, this.options.dbName);
    const existing = await idbGet<KeyRecord>(db, META_STORE, KEY_ID);
    if (existing) return { db, key: existing.key };

    const candidate = await this.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    const key = await new Promise<CryptoKey>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      let chosen = candidate;
      const read = store.get(KEY_ID);
      // Re-checked inside the write transaction so two tabs can't each keep a different key.
      read.onsuccess = () => {
        if (read.result) chosen = (read.result as KeyRecord).key;
        else store.put({ id: KEY_ID, key: candidate } satisfies KeyRecord);
      };
      tx.oncomplete = () => resolve(chosen);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
    return { db, key };
  }
}

const payload = (game: string, score: number): Uint8Array<ArrayBuffer> => new TextEncoder().encode(`${game}:${score}`);

@Injectable({ providedIn: 'root' })
export class ScoreService extends ScoreStore {
  constructor() {
    super();
  }
}
