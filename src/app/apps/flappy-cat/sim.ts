import {
  CAT_RADIUS,
  CAT_START_Y,
  CAT_X,
  FIRST_PIPE_X,
  FLAP_VY,
  FLASH_TICKS,
  GAME_OVER_LOCKOUT,
  GRAVITY,
  GROUND_Y,
  MAX_FALL_VY,
  PIPE_GAP,
  PIPE_MARGIN,
  PIPE_MAX_SHIFT,
  PIPE_SPACING,
  PIPE_W,
  SCROLL,
  WIDTH,
  type Rect,
} from './constants';

export type Phase = 'title' | 'ready' | 'playing' | 'dying' | 'gameOver';
export type SimEvent = 'flap' | 'score' | 'hit' | 'fall';

export interface Pipe {
  id: number;
  /** Left edge. */
  x: number;
  /** Vertical centre of the opening. */
  gapY: number;
  scored: boolean;
}

export const circleHitsRect = (cx: number, cy: number, r: number, rect: Rect): boolean => {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
};

export const pipeRects = (pipe: Pipe): [Rect, Rect] => [
  { x: pipe.x, y: -1000, w: PIPE_W, h: pipe.gapY - PIPE_GAP / 2 + 1000 },
  { x: pipe.x, y: pipe.gapY + PIPE_GAP / 2, w: PIPE_W, h: GROUND_Y - (pipe.gapY + PIPE_GAP / 2) },
];

const GAP_MIN = PIPE_MARGIN + PIPE_GAP / 2;
const GAP_MAX = GROUND_Y - PIPE_MARGIN - PIPE_GAP / 2;

/** Deterministic game state advanced at a fixed tick rate; has no rendering or input knowledge. */
export class FlappySim {
  phase: Phase = 'title';
  paused = false;
  score = 0;
  catY = CAT_START_Y;
  catVy = 0;
  pipes: Pipe[] = [];
  /** Distance the ground has scrolled. */
  scrollX = 0;
  /** Ticks since the phase began. */
  phaseTicks = 0;
  /** Ticks since creation; drives idle animation. */
  clock = 0;
  /** Remaining ticks of the impact flash. */
  flash = 0;

  private events: SimEvent[] = [];
  private nextPipeId = 0;
  private lastGapY = (GAP_MIN + GAP_MAX) / 2;

  constructor(private readonly rng: () => number = Math.random) {}

  drainEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  start(): void {
    if (this.phase === 'title') this.enter('ready');
  }

  flap(): void {
    if (this.paused) return;
    if (this.phase === 'ready') {
      this.pipes = [];
      this.lastGapY = (GAP_MIN + GAP_MAX) / 2;
      this.enter('playing');
    }
    if (this.phase === 'playing') {
      this.catVy = FLAP_VY;
      this.events.push('flap');
    }
  }

  setPaused(paused: boolean): void {
    if (this.phase === 'playing') this.paused = paused;
  }

  /** Returns to the title screen once the game-over lockout has passed. */
  dismiss(): boolean {
    if (this.phase !== 'gameOver' || this.phaseTicks < GAME_OVER_LOCKOUT) return false;
    this.score = 0;
    this.pipes = [];
    this.catVy = 0;
    this.catY = CAT_START_Y;
    this.enter('title');
    return true;
  }

  step(): void {
    if (this.paused) return;
    this.clock++;
    this.phaseTicks++;
    if (this.flash > 0) this.flash--;

    switch (this.phase) {
      case 'title':
      case 'ready':
        this.scrollX += SCROLL;
        this.catY = CAT_START_Y + Math.sin(this.clock * 0.15) * 3;
        break;
      case 'playing':
        this.stepPlaying();
        break;
      case 'dying':
        this.applyGravity();
        if (this.catY + CAT_RADIUS >= GROUND_Y) {
          this.catY = GROUND_Y - CAT_RADIUS;
          this.enter('gameOver');
        }
        break;
      case 'gameOver':
        break;
    }
  }

  private stepPlaying(): void {
    this.scrollX += SCROLL;
    for (const pipe of this.pipes) pipe.x -= SCROLL;
    this.pipes = this.pipes.filter((p) => p.x + PIPE_W >= 0);
    this.spawnPipes();
    this.applyGravity();

    if (this.catY < CAT_RADIUS) {
      this.catY = CAT_RADIUS;
      this.catVy = Math.max(this.catVy, 0);
    }

    for (const pipe of this.pipes) {
      if (!pipe.scored && pipe.x + PIPE_W / 2 < CAT_X) {
        pipe.scored = true;
        this.score++;
        this.events.push('score');
      }
    }

    if (this.catY + CAT_RADIUS >= GROUND_Y) {
      this.catY = GROUND_Y - CAT_RADIUS;
      this.crash();
      this.enter('gameOver');
    } else if (this.pipes.some((p) => pipeRects(p).some((r) => circleHitsRect(CAT_X, this.catY, CAT_RADIUS, r)))) {
      this.crash();
      this.events.push('fall');
      this.catVy = Math.max(this.catVy, 0);
      this.enter('dying');
    }
  }

  private crash(): void {
    this.events.push('hit');
    this.flash = FLASH_TICKS;
  }

  private applyGravity(): void {
    this.catVy = Math.min(this.catVy + GRAVITY, MAX_FALL_VY);
    this.catY += this.catVy;
  }

  private spawnPipes(): void {
    for (;;) {
      const last = this.pipes[this.pipes.length - 1];
      const x = last ? last.x + PIPE_SPACING : FIRST_PIPE_X;
      if (x >= WIDTH + PIPE_W) return;
      const shift = (this.rng() * 2 - 1) * PIPE_MAX_SHIFT;
      this.lastGapY = Math.min(GAP_MAX, Math.max(GAP_MIN, this.lastGapY + shift));
      this.pipes.push({ id: this.nextPipeId++, x, gapY: this.lastGapY, scored: false });
    }
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseTicks = 0;
  }
}
