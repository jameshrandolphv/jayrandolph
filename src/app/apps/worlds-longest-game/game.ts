import { FixedStep } from '../../games/fixed-step';
import type { Sfx, SfxName } from '../../games/sfx';
import type { ProgressStore } from '../../games/progress.service';
import type { ScoreStore } from '../../games/score.service';
import { BACK_BUTTON, CONTINUE_BUTTON, MENU_BUTTON, NEW_BUTTON, PLAY_BUTTON, START_BUTTON, inRect } from './constants';
import { generateLevel } from './generator';
import type { LevelDef } from './level';
import { LevelSource } from './level-source';
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
  /** Level of the saved game on offer from the title screen; 0 if none. */
  private resumeLevel = 0;
  /** The level and seed last written to storage, so they are only written when they change. */
  private savedLevel = 0;
  private savedSeed = 0;
  private savedDeaths = 0;
  /** The seed and level the next level was last requested for, so it is only requested once. */
  private prefetched = '';
  /** Levels are generated from this; a resumed game takes the seed it was saved with. */
  private seed: number;
  /** Seed of the saved game on offer from the title screen, if it was stored. */
  private resumeSeed?: number;
  /** Deaths of the saved game on offer from the title screen. */
  private resumeDeaths = 0;
  /** Set once a run starts, so a slow load can't offer a save that has already been used or cleared. */
  private started = false;

  constructor(
    private readonly scores: ScoreStore,
    private readonly sfx: Sfx,
    private readonly progress: ProgressStore,
    seed = randomSeed(),
    generate?: (level: number) => LevelDef,
    /** Where levels can be built ahead of time; without a worker behind it each is made when it is reached. */
    private readonly levels = new LevelSource(),
  ) {
    this.seed = seed;
    this.sim = new LongestSim(
      generate ?? ((level) => this.levels.take(level, this.seed) ?? generateLevel(level, this.seed)),
    );
    void scores.getBest(GAME_ID).then((best) => (this.best = Math.max(this.best, best)));
    void progress.loadProgress(GAME_ID).then(({ level, seed: savedSeed, deaths = 0 }) => {
      if (this.started) return;
      this.resumeLevel = level;
      this.savedLevel = level;
      this.resumeDeaths = this.savedDeaths = deaths;
      // Without a saved seed the level can't be rebuilt, so the resumed game keeps this session's seed.
      if (savedSeed !== undefined) {
        this.resumeSeed = savedSeed;
        this.levels.prefetch(level, savedSeed);
      }
      this.savedSeed = savedSeed ?? this.seed;
    });
  }

  /** The level the title screen offers to continue from; 0 when it should only offer a new game. */
  get resumable(): number {
    return this.sim.canReturn ? this.sim.level : this.resumeLevel;
  }

  frame(deltaMs: number): number {
    this.sim.setMove(...this.direction());
    this.step.advance(deltaMs, () => this.sim.step());
    for (const event of this.sim.drainEvents()) this.sfx.play(SOUNDS[event]);
    this.saveBest();
    this.saveProgress();
    this.prefetchNext();
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
        if (this.resumable) {
          if (inRect(CONTINUE_BUTTON, x, y)) this.resume();
          else if (inRect(NEW_BUTTON, x, y)) this.sim.showInstructions();
        } else if (inRect(PLAY_BUTTON, x, y)) this.sim.showInstructions();
        break;
      case 'instructions':
        if (inRect(BACK_BUTTON, x, y)) this.sim.back();
        else if (inRect(START_BUTTON, x, y)) this.startNew();
        break;
      case 'intro':
      case 'playing':
      case 'dying':
        if (inRect(MENU_BUTTON, x, y)) this.openMenu();
        else this.sim.skipIntro();
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
        if (this.resumable) this.resume();
        else this.sim.showInstructions();
        break;
      case 'instructions':
        this.startNew();
        break;
      case 'intro':
        this.sim.skipIntro();
        break;
      case 'playing':
      case 'dying':
        break;
    }
  }

  private openMenu(): void {
    this.releaseAll();
    this.sim.openMenu();
  }

  private resume(): void {
    this.started = true;
    if (this.sim.canReturn) {
      this.sim.returnToRun();
      return;
    }
    if (this.resumeSeed !== undefined) this.seed = this.resumeSeed;
    this.sim.begin(this.resumeLevel, this.resumeDeaths);
  }

  /** Drops any saved game and starts again from level 1. */
  private startNew(): void {
    this.started = true;
    this.resumeLevel = 0;
    this.resumeSeed = undefined;
    this.resumeDeaths = 0;
    this.levels.clear();
    // A seed that has already been played would repeat the same levels.
    if (this.sim.level > 0) this.seed = randomSeed();
    this.sim.begin();
  }

  /** As soon as a level starts, the one after it is requested. */
  private prefetchNext(): void {
    const { level } = this.sim;
    const key = `${this.seed}:${level}`;
    if (level === 0 || key === this.prefetched) return;
    this.prefetched = key;
    this.levels.prefetch(level + 1, this.seed);
  }

  private saveProgress(): void {
    const { level, deaths } = this.sim;
    if (level === 0 || (level === this.savedLevel && this.seed === this.savedSeed && deaths === this.savedDeaths))
      return;
    this.savedLevel = level;
    this.savedSeed = this.seed;
    this.savedDeaths = deaths;
    void this.progress.save(GAME_ID, level, this.seed, deaths);
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
