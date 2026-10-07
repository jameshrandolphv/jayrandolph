import { describe, expect, it } from 'vitest';
import type { LevelDef } from './level';
import { LevelSource } from './level-source';

const def = (number: number): LevelDef => ({ number }) as LevelDef;
const later = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('LevelSource', () => {
  it('hands out a prefetched level once, for the seed it was asked with', async () => {
    const source = new LevelSource(async (number) => def(number));
    source.prefetch(3, 11);
    await later();
    expect(source.take(3, 12)).toBeUndefined();
    expect(source.take(3, 11)?.number).toBe(3);
    expect(source.take(3, 11)).toBeUndefined();
  });

  it('asks for each level only once', async () => {
    const asked: number[] = [];
    const source = new LevelSource(async (number) => (asked.push(number), def(number)));
    source.prefetch(2, 1);
    source.prefetch(2, 1);
    await later();
    source.prefetch(2, 1);
    expect(asked).toEqual([2]);
  });

  it('does nothing without a builder', () => {
    const source = new LevelSource();
    source.prefetch(2, 1);
    expect(source.take(2, 1)).toBeUndefined();
  });

  it('drops what it holds, and what is still on its way, when cleared', async () => {
    const source = new LevelSource(async (number) => def(number));
    source.prefetch(2, 1);
    source.clear();
    await later();
    expect(source.take(2, 1)).toBeUndefined();
  });

  it('can ask again after a failure', async () => {
    let fail = true;
    const source = new LevelSource(async (number) => {
      if (fail) throw new Error('no');
      return def(number);
    });
    source.prefetch(2, 1);
    await later();
    fail = false;
    source.prefetch(2, 1);
    await later();
    expect(source.take(2, 1)?.number).toBe(2);
  });
});
