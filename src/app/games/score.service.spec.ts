import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { META_STORE, SCORES_STORE, openAppDb } from './app-db';
import { ScoreStore } from './score.service';

const freshStore = () => {
  const idb = new IDBFactory();
  return { idb, store: new ScoreStore({ idb }) };
};

const rawRecord = async (idb: IDBFactory, storeName: string, key: string) => {
  const db = await openAppDb(idb);
  return new Promise<any>((resolve) => {
    const req = db.transaction(storeName).objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
  });
};

const overwrite = async (idb: IDBFactory, storeName: string, value: unknown) => {
  const db = await openAppDb(idb);
  await new Promise<void>((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
  });
};

describe('ScoreStore', () => {
  it('starts at zero and reports the first score as a new best', async () => {
    const { store } = freshStore();
    expect(await store.getBest('g')).toBe(0);
    expect(await store.submit('g', 3)).toEqual({ best: 3, isNewBest: true });
  });

  it('keeps the higher score and reports ties and lower scores as not new', async () => {
    const { store } = freshStore();
    await store.submit('g', 5);
    expect(await store.submit('g', 2)).toEqual({ best: 5, isNewBest: false });
    expect(await store.submit('g', 5)).toEqual({ best: 5, isNewBest: false });
    expect(await store.submit('g', 6)).toEqual({ best: 6, isNewBest: true });
  });

  it('persists across store instances', async () => {
    const { idb, store } = freshStore();
    await store.submit('g', 9);
    expect(await new ScoreStore({ idb }).getBest('g')).toBe(9);
  });

  it('keeps games separate', async () => {
    const { store } = freshStore();
    await store.submit('a', 4);
    expect(await store.getBest('b')).toBe(0);
  });

  it('stores a non-extractable key in the app-meta store', async () => {
    const { idb, store } = freshStore();
    await store.submit('g', 1);
    const record = await rawRecord(idb, META_STORE, 'score-hmac-key');
    expect(record.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', record.key)).rejects.toThrow();
  });

  it('rejects an edited score', async () => {
    const { idb, store } = freshStore();
    await store.submit('g', 4);
    const record = await rawRecord(idb, SCORES_STORE, 'g');
    await overwrite(idb, SCORES_STORE, { ...record, score: 999 });
    expect(await new ScoreStore({ idb }).getBest('g')).toBe(0);
  });

  it("rejects a score signed for another game", async () => {
    const { idb, store } = freshStore();
    await store.submit('a', 50);
    await store.submit('b', 1);
    const a = await rawRecord(idb, SCORES_STORE, 'a');
    await overwrite(idb, SCORES_STORE, { ...a, game: 'b' });
    expect(await new ScoreStore({ idb }).getBest('b')).toBe(0);
  });

  it('keeps the session score when storage is unavailable', async () => {
    const store = new ScoreStore({ idb: {} as IDBFactory });
    expect(await store.submit('g', 2)).toEqual({ best: 2, isNewBest: true });
    expect(await store.getBest('g')).toBe(2);
    expect(await store.submit('g', 1)).toEqual({ best: 2, isNewBest: false });
  });

  it('ignores invalid scores', async () => {
    const { store } = freshStore();
    expect((await store.submit('g', -1)).isNewBest).toBe(false);
    expect((await store.submit('g', 1.5)).isNewBest).toBe(false);
    expect((await store.submit('g', Number.NaN)).isNewBest).toBe(false);
  });
});
