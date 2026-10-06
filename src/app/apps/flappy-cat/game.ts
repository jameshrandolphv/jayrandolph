import { FixedStep } from '../../games/fixed-step';
import { FramePacer } from '../../games/frame-pacer';
import type { Sfx, SfxName } from '../../games/sfx';
import type { ScoreResult, ScoreStore } from '../../games/score.service';
import { OK_BUTTON, PAUSE_BUTTON, START_BUTTON, inRect } from './constants';
import { FlappySim, type SimEvent } from './sim';

export const GAME_ID = 'flappy-cat';

const SOUNDS: Readonly<Record<SimEvent, SfxName>> = { flap: 'flap', score: 'score', hit: 'hit', fall: 'fall' };

/** Connects input, the simulation, sound and the high-score store; knows nothing about rendering. */
export class FlappyGame {
  readonly sim: FlappySim;
  /** Set once the score for the finished run has been saved. */
  result: ScoreResult | null = null;

  private readonly step = new FixedStep();
  private readonly pacer = new FramePacer();
  private run = 0;

  constructor(
    private readonly scores: ScoreStore,
    private readonly sfx: Sfx,
    rng?: () => number,
  ) {
    this.sim = new FlappySim(rng);
    // Creates the signing key ahead of the first game over.
    void scores.getBest(GAME_ID);
  }

  frame(deltaMs: number): number {
    this.step.advance(this.pacer.pace(deltaMs), () => {
      const before = this.sim.phase;
      this.sim.step();
      if (before !== 'gameOver' && this.sim.phase === 'gameOver') this.saveScore();
    });
    for (const event of this.sim.drainEvents()) this.sfx.play(SOUNDS[event]);
    return this.step.alpha;
  }

  /** A pointer press in logical coordinates. */
  press(x: number, y: number): void {
    this.sfx.unlock();
    const { sim } = this;
    switch (sim.phase) {
      case 'title':
        if (inRect(START_BUTTON, x, y)) this.startGame();
        break;
      case 'ready':
        sim.flap(this.step.alpha);
        break;
      case 'playing':
        if (sim.paused) sim.setPaused(false);
        else if (inRect(PAUSE_BUTTON, x, y)) sim.setPaused(true);
        else sim.flap(this.step.alpha);
        break;
      case 'gameOver':
        if (inRect(OK_BUTTON, x, y)) this.dismiss();
        break;
      case 'dying':
        break;
    }
  }

  /** Space, up arrow or Enter. */
  primary(): void {
    this.sfx.unlock();
    const { sim } = this;
    switch (sim.phase) {
      case 'title':
        this.startGame();
        break;
      case 'ready':
        sim.flap(this.step.alpha);
        break;
      case 'playing':
        if (sim.paused) sim.setPaused(false);
        else sim.flap(this.step.alpha);
        break;
      case 'gameOver':
        this.dismiss();
        break;
      case 'dying':
        break;
    }
  }

  togglePause(): void {
    this.sim.setPaused(!this.sim.paused);
  }

  /** For when the page loses focus or visibility. */
  autoPause(): void {
    this.sim.setPaused(true);
  }

  dispose(): void {
    this.sfx.dispose();
  }

  private startGame(): void {
    this.sfx.play('click');
    this.sim.start();
  }

  private dismiss(): void {
    if (!this.sim.dismiss()) return;
    this.result = null;
    this.run++;
    this.sfx.play('click');
  }

  private saveScore(): void {
    this.result = null;
    const run = ++this.run;
    void this.scores.submit(GAME_ID, this.sim.score).then((result) => {
      if (run === this.run) this.result = result;
    });
  }
}
