import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ProgressStore } from '../../games/progress.service';
import type { ScoreStore } from '../../games/score.service';
import type { Sfx } from '../../games/sfx';
import { CONTINUE_BUTTON, MENU_BUTTON, NEW_BUTTON, PLAY_BUTTON, START_BUTTON } from './constants';
import { GAME_ID, LongestGame } from './game';

const scores = { getBest: async () => 0, submit: async () => ({ best: 0, isNewBest: false }) } as unknown as ScoreStore;
const sfx = { play: () => undefined, unlock: () => undefined, dispose: () => undefined } as unknown as Sfx;
const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const open = async (progress: ProgressStore) => {
  const game = new LongestGame(scores, sfx, progress, 1);
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
});
