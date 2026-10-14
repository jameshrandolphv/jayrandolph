import { FixedStep } from '../../games/fixed-step';
import type { LogicalSize } from '../../games/game-canvas';
import type { ScoreResult, ScoreStore } from '../../games/score.service';
import type { Sfx, SfxName } from '../../games/sfx';
import {
  BACK_BUTTON,
  FRAME_H,
  HELP_BUTTON,
  MENU_BUTTON,
  PLAY_BUTTON,
  QUIT_BUTTON,
  RESUME_BUTTON,
  RETRY_BUTTON,
  inOval,
  inRect,
  pauseButton,
  type Bounds,
} from './constants';
import type { Point } from './park';
import { ChaosParkSim, type SimEvent } from './sim';

export const GAME_ID = 'chaos-park';

const SOUNDS: Readonly<Record<SimEvent, SfxName>> = {
  lap: 'checkpoint',
  alert: 'alert',
  crash: 'crash',
  slip: 'slip',
  shift: 'pick',
  bump: 'click',
  boost: 'boost',
  brake: 'brake',
};

/**
 * A swipe has to travel this far (screen logical px) to count. Mostly across the road changes lane; mostly along it
 * speeds up (forward) or slows back down (backward).
 */
const SWIPE_MIN = 12;

/** The park is landscape; on a portrait screen it is turned a quarter clockwise. */
export const isPortrait = (size: LogicalSize): boolean => size.height > size.width;

/** A point on screen (logical px) in park coordinates. */
export const screenToPark = (size: LogicalSize, x: number, y: number): Point =>
  isPortrait(size) ? { x: y, y: FRAME_H - x } : { x, y };

/** A direction on screen in park coordinates. */
const screenDirToPark = (size: LogicalSize, dx: number, dy: number): Point =>
  isPortrait(size) ? { x: dy, y: -dx } : { x: dx, y: dy };

interface Swipe {
  /** Where the pointer went down, on screen. */
  x: number;
  y: number;
  mover: number;
  used: boolean;
}

/** Connects input, the simulation, sound and the high-score store; knows nothing about rendering. */
export class ChaosParkGame {
  readonly sim: ChaosParkSim;
  result: ScoreResult | null = null;
  best = 0;
  /** The screen's logical size and visible part; the canvas updates both in place. */
  size: LogicalSize = { width: 860, height: 600 };
  bounds: Bounds = { left: 0, top: 0, right: 860, bottom: 600 };

  private readonly step = new FixedStep();
  private readonly swipes = new Map<number, Swipe>();
  private run = 0;

  constructor(
    private readonly scores: ScoreStore,
    private readonly sfx: Sfx,
    rng?: () => number,
  ) {
    this.sim = new ChaosParkSim(rng);
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

  /** A pointer pressed, in screen logical coordinates. Several pointers can each swipe a mover at once. */
  pointerDown(pointer: number, x: number, y: number): void {
    this.sfx.unlock();
    const { sim } = this;
    // Card buttons are laid out about the middle of the screen.
    const cx = x - this.size.width / 2;
    const cy = y - this.size.height / 2;
    switch (sim.phase) {
      case 'title':
        if (inOval(PLAY_BUTTON, cx, cy)) this.start();
        else if (inOval(HELP_BUTTON, cx, cy)) {
          this.sfx.play('click');
          sim.showHelp();
        }
        break;
      case 'help':
        if (inOval(BACK_BUTTON, cx, cy)) this.toTitle();
        break;
      case 'playing':
        if (sim.paused) {
          if (inOval(RESUME_BUTTON, cx, cy)) this.resume();
          else if (inOval(QUIT_BUTTON, cx, cy)) this.quit();
        } else if (inRect(pauseButton(this.bounds), x, y)) {
          this.sfx.play('click');
          this.swipes.clear();
          sim.setPaused(true);
        } else {
          const at = screenToPark(this.size, x, y);
          const mover = sim.grab(at.x, at.y);
          if (mover) this.swipes.set(pointer, { x, y, mover: mover.id, used: false });
        }
        break;
      case 'gameOver':
        if (inOval(RETRY_BUTTON, cx, cy)) this.start();
        else if (inOval(MENU_BUTTON, cx, cy)) this.toTitle();
        break;
      case 'crashed':
        break;
    }
  }

  /**
   * One action per swipe, decided the first time a drag goes far enough: across the road shifts a lane that way,
   * along it in the direction of travel speeds the mover up, and back against it returns it to its usual speed.
   */
  pointerMove(pointer: number, x: number, y: number): void {
    const swipe = this.swipes.get(pointer);
    if (!swipe || swipe.used) return;
    const dx = x - swipe.x;
    const dy = y - swipe.y;
    const len = Math.hypot(dx, dy);
    if (len < SWIPE_MIN) return;
    const mover = this.sim.movers.find((m) => m.id === swipe.mover);
    if (!mover || mover.state !== 'track') {
      this.swipes.delete(pointer);
      return;
    }
    const dir = screenDirToPark(this.size, dx, dy);
    const out = this.sim.outward(mover);
    const ahead = this.sim.forward(mover);
    const across = (dir.x * out.x + dir.y * out.y) / len;
    const along = (dir.x * ahead.x + dir.y * ahead.y) / len;
    swipe.used = true;
    if (Math.abs(across) >= Math.abs(along)) this.sim.shift(mover.id, across > 0 ? 1 : -1);
    else this.sim.setBoost(mover.id, along > 0);
  }

  pointerUp(pointer: number): void {
    this.swipes.delete(pointer);
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
    this.swipes.clear();
    this.sim.setPaused(!this.sim.paused);
  }

  /** For when the page loses focus or visibility. */
  autoPause(): void {
    this.swipes.clear();
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
    this.swipes.clear();
    this.sfx.play('click');
  }

  private resume(): void {
    this.sfx.play('click');
    this.sim.setPaused(false);
  }

  /** Leaving mid-run still counts the laps so far. */
  private quit(): void {
    if (this.sim.score > 0) void this.submit(this.sim.score);
    this.toTitle();
  }

  private toTitle(): void {
    if (!this.sim.toTitle()) return;
    this.result = null;
    this.run++;
    this.swipes.clear();
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
