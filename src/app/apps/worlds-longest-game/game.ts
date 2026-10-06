import { FixedStep } from '../../games/fixed-step';
import type { Sfx, SfxName } from '../../games/sfx';
import type { ScoreStore } from '../../games/score.service';
import { BACK_BUTTON, PLAY_BUTTON, START_BUTTON, inRect } from './constants';
import { generateLevel } from './generator';
import type { LevelDef } from './level';
import { LongestSim, type SimEvent } from './sim';

export const GAME_ID = 'worlds-longest-game';

const SOUNDS: Readonly<Record<SimEvent, SfxName>> = {
  death: 'hit',
  coin: 'score',
  checkpoint: 'checkpoint',
  clear: 'clear',
  click: 'click',
};

type Direction = 'left' | 'right' | 'up' | 'down';

const DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};

const randomSeed = (): number =>
  typeof crypto === 'undefined' ? Math.floor(Math.random() * 2 ** 32) : crypto.getRandomValues(new Uint32Array(1))[0]!;

/** Connects input, the simulation, sound and the best-level store; knows nothing about rendering. */
export class LongestGame {
  readonly sim: LongestSim;
  /** Highest level ever reached on this device; 0 if none. */
  best = 0;

  private readonly step = new FixedStep();
  private readonly held = new Set<Direction>();
  private stickX = 0;
  private stickY = 0;
  private submitted = 0;

  constructor(
    private readonly scores: ScoreStore,
    private readonly sfx: Sfx,
    seed = randomSeed(),
    generate: (level: number) => LevelDef = (level) => generateLevel(level, seed),
  ) {
    this.sim = new LongestSim(generate);
    void scores.getBest(GAME_ID).then((best) => (this.best = Math.max(this.best, best)));
  }

  frame(deltaMs: number): number {
    this.sim.setMove(...this.direction());
    this.step.advance(deltaMs, () => this.sim.step());
    for (const event of this.sim.drainEvents()) this.sfx.play(SOUNDS[event]);
    this.saveBest();
    return this.step.alpha;
  }

  /** Whether the game reacts to this key, so auto-repeats can still be kept from scrolling the page. */
  usesKey(code: string): boolean {
    return code in DIRECTIONS || code === 'Enter' || code === 'Space';
  }

  /** Returns whether the key is one the game uses, so the caller can stop the page reacting to it. */
  keyDown(code: string): boolean {
    const direction = DIRECTIONS[code];
    if (direction) {
      this.sfx.unlock();
      this.held.add(direction);
      this.sim.skipIntro();
      return true;
    }
    if (code === 'Enter' || code === 'Space') {
      this.primary();
      return true;
    }
    return false;
  }

  keyUp(code: string): boolean {
    const direction = DIRECTIONS[code];
    if (!direction) return false;
    this.held.delete(direction);
    return true;
  }

  /** For when the page loses focus, so a key released elsewhere isn't stuck down. */
  releaseAll(): void {
    this.held.clear();
    this.setStick(0, 0);
  }

  setStick(x: number, y: number): void {
    if (this.stickX === 0 && this.stickY === 0 && (x !== 0 || y !== 0)) {
      this.sfx.unlock();
      this.sim.skipIntro();
    }
    this.stickX = x;
    this.stickY = y;
  }

  /** A pointer press in logical coordinates. */
  press(x: number, y: number): void {
    this.sfx.unlock();
    switch (this.sim.phase) {
      case 'title':
        if (inRect(PLAY_BUTTON, x, y)) this.sim.showInstructions();
        break;
      case 'instructions':
        if (inRect(BACK_BUTTON, x, y)) this.sim.back();
        else if (inRect(START_BUTTON, x, y)) this.sim.begin();
        break;
      case 'intro':
        this.sim.skipIntro();
        break;
      case 'playing':
      case 'dying':
        break;
    }
  }

  dispose(): void {
    this.sfx.dispose();
  }

  private primary(): void {
    this.sfx.unlock();
    switch (this.sim.phase) {
      case 'title':
        this.sim.showInstructions();
        break;
      case 'instructions':
        this.sim.begin();
        break;
      case 'intro':
        this.sim.skipIntro();
        break;
      case 'playing':
      case 'dying':
        break;
    }
  }

  /** Held keys win over the stick; both give a direction of at most length 1. */
  private direction(): [number, number] {
    const x = +this.held.has('right') - +this.held.has('left');
    const y = +this.held.has('down') - +this.held.has('up');
    return x || y ? [x, y] : [this.stickX, this.stickY];
  }

  private saveBest(): void {
    const { level } = this.sim;
    if (level <= this.submitted) return;
    this.submitted = level;
    this.best = Math.max(this.best, level);
    void this.scores.submit(GAME_ID, level).then((result) => (this.best = Math.max(this.best, result.best)));
  }
}
