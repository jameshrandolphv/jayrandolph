import {
  COIN_R,
  DEATH_TICKS,
  ENEMY_R,
  INTRO_TICKS,
  PLAYER_HURT_HALF,
  PLAYER_SIZE,
  PLAYER_SPEED,
  TILE_VOID,
  circleHitsSquare,
} from './constants';
import { enemyPositionAt, tileAt, touchesZone, zoneCentre, type LevelDef } from './level';

export type Phase = 'title' | 'instructions' | 'intro' | 'playing' | 'dying';
export type SimEvent = 'death' | 'coin' | 'checkpoint' | 'clear' | 'click';

const HALF = PLAYER_SIZE / 2;
/** Keeps the player's square just inside a tile edge instead of on the boundary. */
const EDGE = 0.001;
/** How far off an opening the square can be and still be slid into line with it. */
const CORNER_SNAP = 12;

/** Deterministic game state advanced at a fixed tick rate; has no rendering or input knowledge. */
export class LongestSim {
  phase: Phase = 'title';
  /** 0 until a run begins. */
  level = 0;
  /** Across the whole run, as in the original. */
  deaths = 0;
  def: LevelDef | null = null;
  /** Enemy clock; keeps running through deaths, as the original's enemies do. */
  tick = 0;
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  /** Index of the zone the player respawns in. */
  checkpoint = 0;
  collected: boolean[] = [];

  private saved: boolean[] = [];
  /** The phase to return to when the menu was opened mid-run; null otherwise. */
  private menuFrom: Phase | null = null;
  private timer = 0;
  private moveX = 0;
  private moveY = 0;
  private events: SimEvent[] = [];

  constructor(private readonly generate: (level: number) => LevelDef) {}

  /** 0 to 1 over the pause after a death, for the view's fade. */
  get deathProgress(): number {
    return this.phase === 'dying' ? 1 - this.timer / DEATH_TICKS : 0;
  }

  /** Direction held this tick; a vector longer than 1 is scaled down to 1. */
  setMove(x: number, y: number): void {
    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;
    this.moveX = x * scale;
    this.moveY = y * scale;
  }

  showInstructions(): void {
    if (this.phase !== 'title') return;
    this.phase = 'instructions';
    this.events.push('click');
  }

  back(): void {
    if (this.phase !== 'instructions') return;
    this.phase = 'title';
    this.events.push('click');
  }

  /** Starts a run, from level 1 with no deaths unless resuming a saved one. */
  begin(level = 1, deaths = 0): void {
    if (this.phase !== 'instructions' && this.phase !== 'title') return;
    this.deaths = deaths;
    this.menuFrom = null;
    this.events.push('click');
    this.startLevel(level);
  }

  /** Whether the title screen was opened from a run that can be picked up again. */
  get canReturn(): boolean {
    return this.menuFrom !== null;
  }

  /** Opens the title screen from a run, pausing it where it is. */
  openMenu(): void {
    if (this.phase !== 'intro' && this.phase !== 'playing' && this.phase !== 'dying') return;
    this.menuFrom = this.phase;
    this.phase = 'title';
    this.events.push('click');
  }

  /** Returns to the run paused by openMenu. */
  returnToRun(): void {
    if (this.phase !== 'title' || this.menuFrom === null) return;
    this.phase = this.menuFrom;
    this.menuFrom = null;
    this.events.push('click');
  }

  skipIntro(): void {
    if (this.phase === 'intro') this.phase = 'playing';
  }

  step(): void {
    this.prevX = this.x;
    this.prevY = this.y;
    switch (this.phase) {
      case 'intro':
        if (--this.timer <= 0) this.phase = 'playing';
        break;
      case 'playing':
        this.tick++;
        this.move();
        this.collide();
        break;
      case 'dying':
        this.tick++;
        if (--this.timer <= 0) this.respawn();
        break;
      case 'title':
      case 'instructions':
        break;
    }
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private startLevel(level: number): void {
    const def = this.generate(level);
    this.def = def;
    this.level = level;
    this.tick = 0;
    this.checkpoint = 0;
    this.collected = def.coins.map(() => false);
    this.saved = [...this.collected];
    this.placeAtCheckpoint();
    this.phase = 'intro';
    this.timer = INTRO_TICKS;
  }

  private placeAtCheckpoint(): void {
    const spawn = zoneCentre(this.def!.zones[this.checkpoint]!);
    this.x = this.prevX = spawn.x;
    this.y = this.prevY = spawn.y;
  }

  private respawn(): void {
    this.collected = [...this.saved];
    this.placeAtCheckpoint();
    this.phase = 'playing';
  }

  private blockedAt(x: number, y: number): boolean {
    const def = this.def!;
    const lo = HALF - EDGE;
    return (
      tileAt(def, x - lo, y - lo) === TILE_VOID ||
      tileAt(def, x + lo, y - lo) === TILE_VOID ||
      tileAt(def, x - lo, y + lo) === TILE_VOID ||
      tileAt(def, x + lo, y + lo) === TILE_VOID
    );
  }

  /** Each axis is resolved on its own so the square slides along walls. */
  private move(): void {
    this.advance(true, this.moveX * PLAYER_SPEED, this.moveY);
    this.advance(false, this.moveY * PLAYER_SPEED, this.moveX);
  }

  /** `steer` is the held input on the other axis. */
  private advance(horizontal: boolean, amount: number, steer: number): void {
    for (let left = Math.abs(amount); left > 0;) {
      const part = Math.min(left, 1) * Math.sign(amount);
      const nx = horizontal ? this.x + part : this.x;
      const ny = horizontal ? this.y : this.y + part;
      if (!this.blockedAt(nx, ny)) {
        this.x = nx;
        this.y = ny;
      } else {
        const nudge = this.cornerNudge(horizontal, part);
        // Never fight the player: a nudge against the held direction is skipped.
        if (nudge === 0 || nudge * steer < 0) return;
        if (horizontal) this.y += nudge * Math.min(left, 1);
        else this.x += nudge * Math.min(left, 1);
      }
      left -= Math.abs(part);
    }
  }

  /**
   * When a step is blocked only because the square clips a corner, the side (-1 or 1) it should slide
   * towards to line up with the opening; 0 if there is no opening close enough, or two equally near.
   */
  private cornerNudge(horizontal: boolean, part: number): -1 | 0 | 1 {
    const free = (side: number, offset: number): boolean => {
      const lateral = side * offset;
      return horizontal
        ? !this.blockedAt(this.x + part, this.y + lateral)
        : !this.blockedAt(this.x + lateral, this.y + part);
    };
    for (let offset = 1; offset <= CORNER_SNAP; offset++) {
      const minus = free(-1, offset);
      const plus = free(1, offset);
      if (minus === plus && !minus) continue;
      if (minus && plus) return 0;
      const side = minus ? -1 : 1;
      const [dx, dy] = horizontal ? [0, side] : [side, 0];
      return this.blockedAt(this.x + dx, this.y + dy) ? 0 : side;
    }
    return 0;
  }

  private collide(): void {
    const def = this.def!;
    for (const enemy of def.enemies) {
      const p = enemyPositionAt(enemy, this.tick);
      if (circleHitsSquare(p.x, p.y, ENEMY_R, this.x, this.y, PLAYER_HURT_HALF)) {
        this.deaths++;
        this.phase = 'dying';
        this.timer = DEATH_TICKS;
        this.events.push('death');
        return;
      }
    }

    def.coins.forEach((coin, i) => {
      if (!this.collected[i] && circleHitsSquare(coin.x, coin.y, COIN_R, this.x, this.y, HALF)) {
        this.collected[i] = true;
        this.events.push('coin');
      }
    });

    const next = this.checkpoint + 1;
    const zone = def.zones[next];
    if (!zone || !touchesZone(zone, this.x, this.y, HALF)) return;
    // A beacon only counts once every coin in the stretch before it has been collected.
    if (def.coins.some((coin, i) => coin.segment < next && !this.collected[i])) return;
    if (next === def.zones.length - 1) {
      this.events.push('clear');
      this.startLevel(this.level + 1);
    } else {
      this.checkpoint = next;
      this.saved = [...this.collected];
      this.events.push('checkpoint');
    }
  }
}
