/**
 * The park is laid out in a landscape frame of FRAME_W x FRAME_H logical px. On a portrait screen the canvas swaps
 * its logical size and the view turns the park on its side, so the frame is always as large as it can be.
 * Distances are logical px; speeds are per 60 Hz tick.
 */
export const FRAME_W = 860;
export const FRAME_H = 600;

/** How far past the frame the city is drawn, for screens of other shapes. */
export const SCENERY_EXTENT = 900;

/** Width of one lane, and how many lanes the loop has. Lane 0 is the innermost. */
export const LANE_W = 22;
export const LANES = 4;
/** Half the width of the road, from the centre line to either edge. */
export const ROAD_HALF = (LANE_W * LANES) / 2;

/** The outer edge of the road keeps at least this far inside the frame, leaving room for the HUD. */
export const FRAME_MARGIN = 62;
/** The park wall, inset from the frame. */
export const WALL_INSET = 34;
export const WALL_RADIUS = 56;
/** The street just outside the wall. */
export const STREET_WIDTH = 34;

/** Points the loop's centre line is resampled to, evenly spaced. */
export const TRACK_SAMPLES = 640;

export type Kind = 'walker' | 'dog' | 'runner' | 'biker' | 'car' | 'carriage';
export const KINDS: readonly Kind[] = ['walker', 'dog', 'runner', 'biker', 'car', 'carriage'];

export interface KindSpec {
  /** Centre-line px per tick. */
  speed: number;
  /** Length along the road, used for collisions. */
  len: number;
  /** Lanes it takes up. */
  width: 1 | 2;
  /** Fewest and most laps it does before leaving. */
  laps: readonly [number, number];
  /** Relative chance of arriving, once it is allowed to (see `kindWeight`). */
  weight: number;
}

/** Walkers (and dog walkers), runners, bikers and cars are each faster; carriages go at a walk and never leave. */
export const KIND_SPECS: Readonly<Record<Kind, KindSpec>> = {
  walker: { speed: 0.72, len: 14, width: 1, laps: [1, 2], weight: 0.3 },
  dog: { speed: 0.72, len: 24, width: 2, laps: [1, 1], weight: 0.12 },
  runner: { speed: 1.15, len: 14, width: 1, laps: [1, 3], weight: 0.3 },
  biker: { speed: 1.8, len: 30, width: 1, laps: [1, 4], weight: 0.22 },
  car: { speed: 2.75, len: 46, width: 2, laps: [1, 2], weight: 0.07 },
  carriage: { speed: 0.72, len: 62, width: 2, laps: [Infinity, Infinity], weight: 0 },
};

/** Each mover's speed is its kind's times a factor in this range, so even two of a kind close in on each other. */
export const SPEED_SPREAD = 0.08;

/** Cars only arrive from this score; their chance then grows a little. */
export const CARS_FROM_SCORE = 6;
/** The second (and last) carriage arrives at this score. */
export const SECOND_CARRIAGE_SCORE = 10;
/** Walkers and runners going the wrong way (clockwise) appear from this score, more often as it rises. */
export const WRONG_WAY_FROM_SCORE = 3;
export const WRONG_WAY_CHANCE = 0.1;
export const WRONG_WAY_MAX_CHANCE = 0.2;

/** Lanes per tick a mover slides sideways when changing lane. */
export const LANE_RATE = 0.09;

/** Two movers collide when their lanes overlap by more than this, and their lengths by `COLLIDE_FACTOR`. */
export const LATERAL_OVERLAP = 0.3;
export const COLLIDE_FACTOR = 0.82;
/** Warn when movers sharing a lane would touch within this many ticks. */
export const WARN_TICKS = 75;
export const WARN_MAX_GAP = 120;

/** A mover joining the road (from an entrance or a short cut) waits until nothing will reach it in this many ticks. */
export const JOIN_TICKS = 100;
/** How far before the end of its route a joining mover stops to wait. */
export const JOIN_HOLD = 16;

/** The chance a walker or runner in the inner lane cuts across the park when it passes a short cut. */
export const SHORTCUT_CHANCE = 0.3;

export const FIRST_SPAWN = 50;
/** Ticks between arrivals at score 0, the fewest it falls to, and how much each lap takes off it. */
export const SPAWN_INTERVAL = 250;
export const SPAWN_INTERVAL_MIN = 64;
export const SPAWN_INTERVAL_STEP = 4;
/** Movers allowed in the park at once at score 0 (not counting carriages), the most ever, and laps per extra one. */
export const MAX_MOVERS_START = 3;
export const MAX_MOVERS = 22;
export const LAPS_PER_EXTRA = 4;

/** A press grabs the nearest mover within this distance of its body. */
export const GRAB_RADIUS = 30;

/** Ticks a mover wobbles after sliding on ice. */
export const SLIP_TICKS = 34;
export const POP_TICKS = 60;
export const CRASH_TICKS = 130;
/** Ticks before the game-over card accepts input, so a panicked tap can't dismiss it. */
export const GAME_OVER_LOCKOUT = 50;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inRect = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** The part of the screen showing, in screen logical px; see `GameSurface.bounds`. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const pauseButton = (b: Bounds): Rect => ({
  x: b.right - 58,
  y: b.bottom - 58,
  w: 48,
  h: 48,
});

/** Oval buttons on the cards, centred relative to the middle of the screen. */
export interface Oval {
  x: number;
  y: number;
  rx: number;
  ry: number;
  label: string;
}

export const inOval = (o: Oval, x: number, y: number): boolean =>
  ((x - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2 <= 1;

/** Cards are this size, centred on screen; small enough to fit either way round. */
export const CARD = { w: 540, h: 520 };

export const PLAY_BUTTON: Oval = { x: 112, y: 182, rx: 100, ry: 52, label: 'PLAY!' };
export const HELP_BUTTON: Oval = { x: -130, y: 190, rx: 82, ry: 32, label: 'HOW TO PLAY' };
export const BACK_BUTTON: Oval = { x: 0, y: 206, rx: 82, ry: 36, label: 'GOT IT!' };
export const RETRY_BUTTON: Oval = { x: 100, y: 182, rx: 98, ry: 52, label: 'RETRY' };
export const MENU_BUTTON: Oval = { x: -140, y: 192, rx: 62, ry: 32, label: 'MENU' };
export const RESUME_BUTTON: Oval = { x: 90, y: 40, rx: 96, ry: 48, label: 'RESUME' };
export const QUIT_BUTTON: Oval = { x: -120, y: 48, rx: 64, ry: 34, label: 'MENU' };
