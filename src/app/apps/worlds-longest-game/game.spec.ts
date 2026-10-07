import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ProgressStore } from '../../games/progress.service';
import type { ScoreStore } from '../../games/score.service';
import type { Sfx } from '../../games/sfx';
import { CONTINUE_BUTTON, MENU_BUTTON, NEW_BUTTON, PLAY_BUTTON, START_BUTTON } from './constants';
import { GAME_ID, LongestGame } from './game';
import { generateLevel } from './generator';
import { LevelSource } from './level-source';

const scores = {
  getBest: async () => 0,
  submit: async () => ({ best: 0, isNewBest: false }),
} as unknown as ScoreStore;
const sfx = {
  play: () => undefined,
  unlock: () => undefined,
  dispose: () => undefined,
} as unknown as Sfx;
const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const open = async (progress: ProgressStore, seed = 1) => {
  const game = new LongestGame(scores, sfx, progress, seed);
  await settle();
  return game;
};

describe('LongestGame progress', () => {
  it('offers only a new game when nothing is saved', async () => {
    const game = await open(new ProgressStore({ idb: new IDBFactory() }));
    expect(game.resumable).toBe(0);
    game.press(...centre(PLAY_BUTTON));
    expect(game.sim.phase).toBe('instructions');
  });

  it('offers to resume even level 1', async () => {
    const progress = new ProgressStore({ idb: new IDBFactory() });
    await progress.save(GAME_ID, 1);
    expect((await open(progress)).resumable).toBe(1);
  });

  it('opens the menu mid-run from the MENU label and picks the run back up', async () => {
    const game = await open(new ProgressStore({ idb: new IDBFactory() }));
    game.keyDown('Enter');
    game.keyDown('Enter');
    game.sim.skipIntro();
    expect(game.sim.phase).toBe('playing');

    game.press(...centre(MENU_BUTTON));
    expect(game.sim.phase).toBe('title');
    expect(game.resumable).toBe(1);

    game.press(...centre(CONTINUE_BUTTON));
    expect(game.sim.phase).toBe('playing');
    expect(game.sim.level).toBe(1);
  });

  it('starts a new game from a mid-run menu', async () => {
    const game = await open(new ProgressStore({ idb: new IDBFactory() }));
    game.keyDown('Enter');
    game.keyDown('Enter');
    game.press(...centre(MENU_BUTTON));
    game.press(...centre(NEW_BUTTON));
    game.press(...centre(START_BUTTON));
    expect(game.sim.phase).toBe('intro');
    expect(game.sim.canReturn).toBe(false);
  });

  it('continues from the saved level', async () => {
    const progress = new ProgressStore({ idb: new IDBFactory() });
    await progress.save(GAME_ID, 5);
    const game = await open(progress);
    expect(game.resumable).toBe(5);
    game.press(...centre(CONTINUE_BUTTON));
    expect(game.sim.level).toBe(5);
    expect(game.sim.phase).toBe('intro');
  });

  it('starts over from level 1 and replaces the saved level', async () => {
    const idb = new IDBFactory();
    const progress = new ProgressStore({ idb });
    await progress.save(GAME_ID, 5);
    const game = await open(progress);
    game.press(...centre(NEW_BUTTON));
    expect(game.sim.phase).toBe('instructions');
    game.press(...centre(START_BUTTON));
    expect(game.sim.level).toBe(1);
    game.frame(16);
    await settle();
    expect(await new ProgressStore({ idb }).load(GAME_ID)).toBe(1);
    expect(game.resumable).toBe(0);
  });

  it('saves each level reached', async () => {
    const idb = new IDBFactory();
    const game = await open(new ProgressStore({ idb }));
    game.keyDown('Enter');
    game.keyDown('Enter');
    game.frame(16);
    await settle();
    expect(await new ProgressStore({ idb }).load(GAME_ID)).toBe(1);
  });

  it('stores the seed with the level and rebuilds the same level when reopened', async () => {
    const idb = new IDBFactory();
    const first = await open(new ProgressStore({ idb }), 111);
    first.keyDown('Enter');
    first.keyDown('Enter');
    first.frame(16);
    await settle();
    expect(await new ProgressStore({ idb }).loadProgress(GAME_ID)).toEqual({
      level: 1,
      seed: 111,
      deaths: 0,
    });

    const second = await open(new ProgressStore({ idb }), 222);
    second.press(...centre(CONTINUE_BUTTON));
    expect(second.sim.def).toEqual(generateLevel(1, 111));
    expect(second.sim.def).not.toEqual(generateLevel(1, 222));
  });

  it('keeps the saved seed through later levels and saves a new one for a new run', async () => {
    const idb = new IDBFactory();
    const progress = new ProgressStore({ idb });
    await progress.save(GAME_ID, 3, 111);
    const game = await open(progress, 222);
    game.press(...centre(CONTINUE_BUTTON));
    expect(game.sim.level).toBe(3);
    game.frame(16);
    await settle();
    expect(await new ProgressStore({ idb }).loadProgress(GAME_ID)).toEqual({ level: 3, seed: 111 });

    game.keyDown('Enter');
    game.keyDown('Enter');
    game.frame(16);
    game.press(...centre(MENU_BUTTON));
    game.press(...centre(NEW_BUTTON));
    game.press(...centre(START_BUTTON));
    game.frame(16);
    await settle();
    const saved = await new ProgressStore({ idb }).loadProgress(GAME_ID);
    expect(saved.level).toBe(1);
    expect(saved.seed).not.toBe(111);
  });

  it('still resumes progress saved without a seed', async () => {
    const progress = new ProgressStore({ idb: new IDBFactory() });
    await progress.save(GAME_ID, 4);
    const game = await open(progress);
    game.press(...centre(CONTINUE_BUTTON));
    expect(game.sim.level).toBe(4);
  });

  describe('death count', () => {
    const kill = (game: LongestGame): void => {
      game.keyDown('Enter');
      game.keyDown('Enter');
      game.sim.skipIntro();
      const def = game.sim.def!;
      // Park an enemy on the player.
      def.enemies.push({
        kind: 'sweep',
        ax: game.sim.x,
        ay: game.sim.y,
        bx: game.sim.x,
        by: game.sim.y,
        period: def.period,
        phase: 0,
      });
      game.frame(16);
    };

    it('saves deaths as they happen', async () => {
      const idb = new IDBFactory();
      const game = await open(new ProgressStore({ idb }));
      kill(game);
      expect(game.sim.deaths).toBe(1);
      await settle();
      expect(await new ProgressStore({ idb }).loadProgress(GAME_ID)).toMatchObject({
        level: 1,
        deaths: 1,
      });
    });

    it('carries the saved deaths into a continued game', async () => {
      const progress = new ProgressStore({ idb: new IDBFactory() });
      await progress.save(GAME_ID, 4, 111, 37);
      const game = await open(progress);
      game.press(...centre(CONTINUE_BUTTON));
      expect(game.sim.level).toBe(4);
      expect(game.sim.deaths).toBe(37);
    });

    it('resets the count, and the saved one, for a new game', async () => {
      const idb = new IDBFactory();
      const progress = new ProgressStore({ idb });
      await progress.save(GAME_ID, 1, undefined, 12);
      const game = await open(progress);
      expect(game.resumable).toBe(1);
      game.press(...centre(NEW_BUTTON));
      game.press(...centre(START_BUTTON));
      expect(game.sim.deaths).toBe(0);
      game.frame(16);
      await settle();
      expect(await new ProgressStore({ idb }).loadProgress(GAME_ID)).toMatchObject({
        level: 1,
        deaths: 0,
      });
    });

    it('still continues progress saved before deaths were kept', async () => {
      const progress = new ProgressStore({ idb: new IDBFactory() });
      await progress.save(GAME_ID, 6, 111);
      const game = await open(progress);
      game.press(...centre(CONTINUE_BUTTON));
      expect(game.sim.deaths).toBe(0);
    });
  });

  describe('prefetching', () => {
    it('requests the next level when a level starts and uses it when it is reached', async () => {
      const asked: [number, number][] = [];
      const levels = new LevelSource(async (number, seed) => (asked.push([number, seed]), generateLevel(number, seed)));
      const game = new LongestGame(scores, sfx, new ProgressStore({ idb: new IDBFactory() }), 77, undefined, levels);
      await settle();
      game.keyDown('Enter');
      game.keyDown('Enter');
      game.frame(16);
      game.frame(16);
      expect(asked).toEqual([[2, 77]]);
      await settle();
      const next = generateLevel(2, 77);
      expect(levels.take(2, 77)).toEqual(next);
    });
  });
});
