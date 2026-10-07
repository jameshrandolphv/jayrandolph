import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ProgressStore } from './progress.service';

describe('ProgressStore', () => {
  it('has nothing to resume at first', async () => {
    expect(await new ProgressStore({ idb: new IDBFactory() }).load('g')).toBe(0);
  });

  it('keeps a level across stores sharing a database, per game', async () => {
    const idb = new IDBFactory();
    await new ProgressStore({ idb }).save('g', 7);
    expect(await new ProgressStore({ idb }).load('g')).toBe(7);
    expect(await new ProgressStore({ idb }).load('other')).toBe(0);
  });

  it('clears progress by saving 0', async () => {
    const idb = new IDBFactory();
    const store = new ProgressStore({ idb });
    await store.save('g', 7);
    await store.save('g', 0);
    expect(await new ProgressStore({ idb }).load('g')).toBe(0);
  });

  it('ignores a corrupt record', async () => {
    const idb = new IDBFactory();
    await new ProgressStore({ idb }).save('g', 2.5);
    expect(await new ProgressStore({ idb }).load('g')).toBe(0);
  });

  it('still remembers within the session when storage is unavailable', async () => {
    const store = new ProgressStore({ idb: {} as IDBFactory });
    expect(await store.load('g')).toBe(0);
    await store.save('g', 4);
    expect(await store.load('g')).toBe(4);
  });

  it('keeps the seed alongside the level', async () => {
    const idb = new IDBFactory();
    await new ProgressStore({ idb }).save('g', 7, 4242);
    expect(await new ProgressStore({ idb }).loadProgress('g')).toEqual({ level: 7, seed: 4242 });
    expect(await new ProgressStore({ idb }).load('g')).toBe(7);
  });

  it('loads progress saved without a seed', async () => {
    const idb = new IDBFactory();
    await new ProgressStore({ idb }).save('g', 7);
    expect(await new ProgressStore({ idb }).loadProgress('g')).toEqual({ level: 7 });
  });

  it('drops a corrupt seed but keeps the level', async () => {
    const idb = new IDBFactory();
    await new ProgressStore({ idb }).save('g', 7, 1.5);
    expect(await new ProgressStore({ idb }).loadProgress('g')).toEqual({ level: 7 });
  });

  it('keeps the death count alongside the level and seed', async () => {
    const idb = new IDBFactory();
    await new ProgressStore({ idb }).save('g', 7, 4242, 31);
    expect(await new ProgressStore({ idb }).loadProgress('g')).toEqual({
      level: 7,
      seed: 4242,
      deaths: 31,
    });
  });

  it('drops a corrupt death count but keeps the level', async () => {
    const idb = new IDBFactory();
    await new ProgressStore({ idb }).save('g', 7, 4242, -3);
    expect(await new ProgressStore({ idb }).loadProgress('g')).toEqual({ level: 7, seed: 4242 });
  });
});
