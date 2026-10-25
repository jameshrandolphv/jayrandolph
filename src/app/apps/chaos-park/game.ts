import { FixedStep } from '../../games/fixed-step';
import type { LogicalSize } from '../../games/game-canvas';
import type { ScoreResult, ScoreStore } from '../../games/score.service';
import type { Sfx, SfxName } from '../../games/sfx';
import {
  BACK_BUTTON,
  HELP_BUTTON,
  MENU_BUTTON,
  PLAY_BUTTON,
  QUIT_BUTTON,
  RESUME_BUTTON,
  RETRY_BUTTON,
  inPlaque,
  inRect,
  pauseButton,
  soundButton,
  type Bounds,
} from './constants';
import type { CourseId } from './courses';
import { seededRng, type ParkFrame, type Point } from './park';
import { ChaosParkSim, type SimEvent } from './sim';

export const GAME_ID = 'chaos-park';

/** Where a course's best is kept: Chaos Park's under the game's own key, as before courses. */
export const scoreKey = (course: CourseId): string =>
  course === 'park' ? GAME_ID : `${GAME_ID}-${course}`;

const SOUNDS: Readonly<Record<SimEvent, SfxName>> = {
  lap: 'checkpoint',
  alert: 'bell',
  crash: 'crash',
  slip: 'slip',
  shift: 'pick',
  bump: 'click',
  boost: 'boost',
  brake: 'brake',
  squeak: 'squeak',
  bite: 'bite',
  hit: 'hit',
  life: 'score',
  double: 'clear',
  ghost: 'swish',
  star: 'clear',
  fire: 'boost',
  turtle: 'brake',
  strength: 'score',
  coin: 'checkpoint',
  skull: 'hit',
  spiral: 'swish',
  autopilot: 'lock',
  streak: 'clear',
  knock: 'hit',
  eat: 'bite',
  cast: 'swish',
  reel: 'fall',
  snap: 'crack',
  roll: 'swish',
  sting: 'alert',
  haunt: 'alert',
  slime: 'slip',
  wave: 'swish',
  drop: 'swish',
  boom: 'crash',
};

/**
 * A swipe has to travel this far (screen logical px) to count. Mostly across the road changes lane; mostly along it
 * speeds up (forward) or slows back down (backward).
 */
const SWIPE_MIN = 12;
/** The crowd behind the title is kept to this many laps, so it stays an early run's. */
export const DEMO_LAPS = 4;

/** The park is landscape; on a portrait screen it is turned a quarter clockwise. */
export const isPortrait = (size: LogicalSize): boolean => size.height > size.width;

/**
 * The frame a park should be generated in to fill the screen: its long side by its short side (in logical px), whatever
 * the screen's shape.
 */
export const frameFor = (size: LogicalSize, bounds: Bounds): ParkFrame => {
  const portrait = isPortrait(size);
  const across = bounds.right - bounds.left;
  const down = bounds.bottom - bounds.top;
  const w = portrait ? down : across;
  const h = portrait ? across : down;
  return { w: Math.floor(w), h: Math.floor(h), hud: portrait ? 'left' : 'top' };
};

/**
 * Where a park sits on screen: turned a quarter clockwise on a portrait screen, scaled to fit what is showing and
 * centred in it. Park (x, y) lands on screen at (x0 + x * s, y0 + y * s), or (x0 - y * s, y0 + x * s) when turned.
 */
export interface Placement {
  portrait: boolean;
  scale: number;
  x0: number;
  y0: number;
}

export const placePark = (frame: ParkFrame, size: LogicalSize, bounds: Bounds): Placement => {
  const portrait = isPortrait(size);
  const across = bounds.right - bounds.left;
  const down = bounds.bottom - bounds.top;
  const pw = portrait ? frame.h : frame.w;
  const ph = portrait ? frame.w : frame.h;
  const scale = Math.min(across / pw, down / ph);
  const left = bounds.left + (across - pw * scale) / 2;
  const top = bounds.top + (down - ph * scale) / 2;
  return { portrait, scale, x0: portrait ? left + pw * scale : left, y0: top };
};

/** A point on screen (logical px) in park coordinates. */
export const screenToPark = (p: Placement, x: number, y: number): Point =>
  p.portrait
    ? { x: (y - p.y0) / p.scale, y: (p.x0 - x) / p.scale }
    : { x: (x - p.x0) / p.scale, y: (y - p.y0) / p.scale };

/** A direction on screen in park coordinates. */
const screenDirToPark = (p: Placement, dx: number, dy: number): Point =>
  p.portrait ? { x: dy, y: -dx } : { x: dx, y: dy };

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

  /** The site's sound switch, which the title's sound button turns on and off; no button without it. */
  sound: { muted(): boolean; toggle(): void } | null = null;

  private readonly step = new FixedStep();
  /**
   * The crowd going round behind the title and its cards: a run of its own in the same park, everyone on autopilot
   * and kept to its first few laps. Nothing it does scores or sounds.
   */
  demo: ChaosParkSim | null = null;
  private readonly demoStep = new FixedStep();
  private demoSeed = 1;
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

  /** Plays another course from the next run (the website only shows Chaos Park; `?course=` tries the others). */
  setCourse(id: CourseId): void {
    this.sim.setCourse(id);
    if (this.sim.course.id !== id) return;
    this.best = 0;
    void this.scores.getBest(scoreKey(id)).then((best) => {
      if (this.sim.course.id === id) this.best = Math.max(this.best, best);
    });
  }

  /** Where the current park sits on screen. */
  placement(): Placement {
    return placePark(this.sim.park.frame, this.size, this.bounds);
  }

  frame(deltaMs: number): number {
    // On the title and how-to-play cards, the park behind is remade to fill the screen if its shape changes.
    this.sim.fitFrame(frameFor(this.size, this.bounds));
    // A time warp slows everything: the game is fed ticks more slowly.
    this.step.advance(deltaMs * this.sim.timeScale, () => {
      const before = this.sim.phase;
      this.sim.step();
      if (before !== 'gameOver' && this.sim.phase === 'gameOver') this.saveScore();
    });
    this.runDemo(deltaMs);
    for (const event of this.sim.drainEvents()) this.sfx.play(SOUNDS[event]);
    return this.step.alpha;
  }

  private runDemo(deltaMs: number): void {
    if (this.sim.phase !== 'title' && this.sim.phase !== 'help') {
      this.demo = null;
      return;
    }
    if (this.demo?.park !== this.sim.park)
      this.demo = ChaosParkSim.inPark(this.sim.park, seededRng(++this.demoSeed));
    const demo = this.demo;
    this.demoStep.advance(deltaMs, () => {
      demo.step();
      for (const m of demo.movers) m.autopilot = 1;
      demo.laps = Math.min(demo.laps, DEMO_LAPS);
    });
    demo.drainEvents();
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
        if (this.sound && inRect(soundButton(this.bounds), x, y)) {
          this.sound.toggle();
          this.sfx.play('click');
        } else if (inPlaque(PLAY_BUTTON, cx, cy)) this.start();
        else if (inPlaque(HELP_BUTTON, cx, cy)) {
          this.sfx.play('click');
          sim.showHelp();
        }
        break;
      case 'help':
        if (inPlaque(BACK_BUTTON, cx, cy)) this.toTitle();
        break;
      case 'playing':
        if (sim.paused) {
          if (inPlaque(RESUME_BUTTON, cx, cy)) this.resume();
          else if (inPlaque(QUIT_BUTTON, cx, cy)) this.quit();
        } else if (inRect(pauseButton(this.bounds), x, y)) {
          this.sfx.play('click');
          this.swipes.clear();
          sim.setPaused(true);
        } else {
          const at = screenToPark(this.placement(), x, y);
          const mover = sim.grab(at.x, at.y);
          if (mover) this.swipes.set(pointer, { x, y, mover: mover.id, used: false });
        }
        break;
      case 'gameOver':
        if (inPlaque(RETRY_BUTTON, cx, cy)) this.start();
        else if (inPlaque(MENU_BUTTON, cx, cy)) this.toTitle();
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
    const dir = screenDirToPark(this.placement(), dx, dy);
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
    const result = await this.scores.submit(scoreKey(this.sim.course.id), score);
    this.best = Math.max(this.best, result.best);
    return result;
  }
}
