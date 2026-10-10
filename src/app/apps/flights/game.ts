import { FixedStep } from '../../games/fixed-step';
import type { Sfx, SfxName } from '../../games/sfx';
import type { ScoreResult, ScoreStore } from '../../games/score.service';
import {
  BACK_BUTTON,
  FAST_BUTTON,
  HELP_BUTTON,
  MENU_BUTTON,
  PAUSE_BUTTON,
  PLAY_BUTTON,
  QUIT_BUTTON,
  RESUME_BUTTON,
  RETRY_BUTTON,
  inOval,
  inRect,
} from './constants';
import { FlightsSim, type SimEvent } from './sim';

export const GAME_ID = 'flights';

const SOUNDS: Readonly<Record<SimEvent, SfxName>> = {
  land: 'land',
  alert: 'alert',
  crash: 'crash',
  lock: 'lock',
  pick: 'pick',
};

/** Connects input, the simulation, sound and the high-score store; knows nothing about rendering. */
export class FlightsGame {
  readonly sim: FlightsSim;
  /** Set once the score for the finished run has been saved. */
  result: ScoreResult | null = null;
  /** Best score on this device, shown as the high score. */
  best = 0;

  private readonly step = new FixedStep();
  private run = 0;

  constructor(
    private readonly scores: ScoreStore,
    private readonly sfx: Sfx,
    rng?: () => number,
  ) {
    this.sim = new FlightsSim(rng);
    void scores.getBest(GAME_ID).then((best) => (this.best = Math.max(this.best, best)));
  }

  frame(deltaMs: number): number {
    this.step.advance(deltaMs, () => {
      const before = this.sim.phase;
      this.sim.step();
      if (before !== 'gameOver' && this.sim.phase === 'gameOver') this.saveScore();
    });
    for (const event of this.sim.drainEvents()) this.sfx.play(SOUNDS[event]);
    return this.step.alpha;
  }

  /** A pointer pressed, in logical coordinates. */
  pointerDown(x: number, y: number): void {
    this.sfx.unlock();
    const { sim } = this;
    switch (sim.phase) {
      case 'title':
        if (inOval(PLAY_BUTTON, x, y)) this.start();
        else if (inOval(HELP_BUTTON, x, y)) {
          this.sfx.play('click');
          sim.showHelp();
        }
        break;
      case 'help':
        if (inOval(BACK_BUTTON, x, y)) this.toTitle();
        break;
      case 'playing':
        if (sim.paused) {
          if (inOval(RESUME_BUTTON, x, y)) this.resume();
          else if (inOval(QUIT_BUTTON, x, y)) this.quit();
        } else if (inRect(PAUSE_BUTTON, x, y)) {
          this.sfx.play('click');
          sim.setPaused(true);
        } else if (inRect(FAST_BUTTON, x, y)) {
          this.sfx.play('click');
          sim.toggleFast();
        } else {
          sim.beginPath(x, y);
        }
        break;
      case 'gameOver':
        if (inOval(RETRY_BUTTON, x, y)) this.start();
        else if (inOval(MENU_BUTTON, x, y)) this.toTitle();
        break;
      case 'crashed':
        break;
    }
  }

  pointerMove(x: number, y: number): void {
    this.sim.extendPath(x, y);
  }

  pointerUp(): void {
    this.sim.endPath();
  }

  /** Enter or Space: the main button of whatever is on screen. */
  primary(): void {
    this.sfx.unlock();
    const { sim } = this;
    if (sim.phase === 'title' || sim.phase === 'help' || sim.phase === 'gameOver') this.start();
    else if (sim.phase === 'playing' && sim.paused) this.resume();
  }

  togglePause(): void {
    if (this.sim.phase !== 'playing') return;
    this.sfx.play('click');
    this.sim.setPaused(!this.sim.paused);
  }

  toggleFast(): void {
    if (this.sim.phase !== 'playing' || this.sim.paused) return;
    this.sfx.play('click');
    this.sim.toggleFast();
  }

  /** For when the page loses focus or visibility. */
  autoPause(): void {
    this.sim.setPaused(true);
  }

  dispose(): void {
    this.sfx.dispose();
  }

  private start(): void {
    const before = this.sim.phase;
    this.sim.start();
    if (this.sim.phase === before) return;
    this.result = null;
    this.run++;
    this.sfx.play('click');
  }

  private resume(): void {
    this.sfx.play('click');
    this.sim.setPaused(false);
  }

  /** Leaving mid-run still counts the landings so far. */
  private quit(): void {
    if (this.sim.score > 0) void this.submit(this.sim.score);
    this.toTitle();
  }

  private toTitle(): void {
    if (!this.sim.toTitle()) return;
    this.result = null;
    this.run++;
    this.sfx.play('click');
  }

  private saveScore(): void {
    this.result = null;
    const run = ++this.run;
    void this.submit(this.sim.score).then((result) => {
      if (run === this.run) this.result = result;
    });
  }

  private async submit(score: number): Promise<ScoreResult> {
    const result = await this.scores.submit(GAME_ID, score);
    this.best = Math.max(this.best, result.best);
    return result;
  }
}
