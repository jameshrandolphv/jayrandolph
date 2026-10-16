/**
 * The canvas's logical size: landscape, swapped on a portrait screen so it is always as large as it can be. Each
 * park is then generated to fill the whole screen (see `ParkFrame`), in a landscape frame the view turns on its
 * side on a portrait screen. Distances are logical px; speeds are per 60 Hz tick.
 */
export const FRAME_W = 860;
export const FRAME_H = 600;

/** A park's frame is never longer than this times its width, however wide the screen; the city fills the rest. */
export const MAX_ASPECT = 2;
/** Nor squarer than this. */
export const MIN_ASPECT = 1.2;

/** How far past the frame the city is drawn, for screens of other shapes. */
export const SCENERY_EXTENT = 900;

/** Width of one lane, and how many lanes the loop has. Lane 0 is the innermost. */
export const LANE_W = 30;
export const LANES = 4;
/** Half the width of the road, from the centre line to either edge. */
export const ROAD_HALF = (LANE_W * LANES) / 2;

/**
 * Sprites are drawn for 22 px lanes; this scales them, and the lengths and speeds that go with them, to the lane
 * width in use.
 */
export const DESIGN_LANE = 22;
export const ART = LANE_W / DESIGN_LANE;

/**
 * How close the road's outer edge comes to the edges of the screen: further on the side with the score along it.
 */
export const EDGE_MARGIN = 22;
export const HUD_MARGIN = 58;
/** The park wall, inset from the frame, so it runs just inside the edge of the screen. */
export const WALL_INSET = 6;
export const WALL_RADIUS = 44;
/** The street just outside the wall. */
export const STREET_WIDTH = 34;

/** Points the loop's centre line is resampled to, evenly spaced. */
export const TRACK_SAMPLES = 640;

export type Kind = 'walker' | 'dog' | 'runner' | 'biker' | 'car' | 'carriage' | 'group';
export const KINDS: readonly Kind[] = [
  'walker',
  'dog',
  'runner',
  'biker',
  'car',
  'carriage',
  'group',
];

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

/**
 * The overall pace of the game: every mover's speed (and the rats') is scaled by this, so the challenge comes from
 * how many are about rather than how fast they go.
 */
export const PACE = 0.8;

const spec = (
  speed: number,
  len: number,
  width: 1 | 2,
  laps: readonly [number, number],
  weight: number,
): KindSpec => ({ speed: speed * ART * PACE, len: len * ART, width, laps, weight });

/**
 * Walkers (and dog walkers), runners, bikers and cars are each faster; carriages go at a walk and never leave.
 * Speeds and lengths are given at the design lane width and scaled to the one in use (and speeds by `PACE`).
 */
export const KIND_SPECS: Readonly<Record<Kind, KindSpec>> = {
  walker: spec(0.72, 14, 1, [1, 2], 0.3),
  dog: spec(0.72, 24, 2, [1, 1], 0.12),
  runner: spec(1.15, 14, 1, [1, 3], 0.3),
  biker: spec(1.8, 30, 1, [1, 4], 0.22),
  /** Only a little faster than a bike. */
  car: spec(2.0, 46, 2, [1, 2], 0.07),
  carriage: spec(0.72, 62, 2, [Infinity, Infinity], 0),
  /** A run group; its length depends on how many are in it (see `groupLength`). */
  group: spec(1.15, 40, 2, [1, 1], 0),
};

/** Each mover's speed is its kind's times a factor in this range, so even two of a kind close in on each other. */
export const SPEED_SPREAD = 0.08;

/**
 * Run groups: 6 to 12 runners two abreast, doing one lap. They are rare: the first can come once the score reaches
 * `GROUP_FROM_SCORE`, then one every `GROUP_INTERVAL` ticks or so, never two at once. Each runner's lap scores.
 */
export const GROUP_SIZE: readonly [number, number] = [6, 12];
export const GROUP_FROM_SCORE = 8;
export const GROUP_INTERVAL: readonly [number, number] = [2400, 4200];
/** Spacing between the rows of a run group, front to back, as drawn. */
export const GROUP_ROW = 12;
export const groupLength = (size: number): number => (Math.ceil(size / 2) * GROUP_ROW + 4) * ART;

/**
 * Rats: now and then one waits at the kerb ahead of a walker, runner or dog walker, then darts out and bites them.
 * The bitten person stands dazed for `DAZE_TICKS`.
 */
export const RAT_FROM_SCORE = 4;
export const RAT_INTERVAL: readonly [number, number] = [1800, 3300];
/** Ticks the rat waits at the kerb, in sight, before it darts out. */
export const RAT_LURK = 55;
export const RAT_SPEED = 2.4 * ART * PACE;
/** It gives up and runs off if it hasn't reached its target in this many ticks. */
export const RAT_GIVE_UP = 150;
export const DAZE_TICKS = 180;

/**
 * A biker closing in on someone on foot shouts "Out of my way!" in a speech bubble for `SHOUT_TICKS`, at most once
 * every `SHOUT_COOLDOWN` ticks.
 */
export const SHOUT_TICKS = 100;
export const SHOUT_COOLDOWN = 300;

/** Cars only arrive from this score; their chance then grows a little. */
export const CARS_FROM_SCORE = 6;
/** The second (and last) carriage arrives at this score. */
export const SECOND_CARRIAGE_SCORE = 10;
/** Walkers and runners going the wrong way (clockwise) appear from this score, more often as it rises. */
export const WRONG_WAY_FROM_SCORE = 3;
export const WRONG_WAY_CHANCE = 0.1;
export const WRONG_WAY_MAX_CHANCE = 0.2;

/** How much faster a mover goes after a forward swipe, until swiped back. */
export const BOOST = 1.6;

/** Lanes per tick a mover slides sideways when changing lane. */
export const LANE_RATE = 0.09;

/**
 * Collisions a run can take: the last one ends it. Before that, whoever was run into is stunned for `STUN_TICKS`
 * and whoever hit them carries on through.
 */
export const MAX_HITS = 3;
export const STUN_TICKS = 90;
/** Ticks the burst shows where a collision happened. */
export const IMPACT_TICKS = 40;

/** Slippery patches appear on the road as the score reaches each of these, up to three. */
export const PATCH_SCORES: readonly number[] = [25, 50, 100];

/** Two movers collide when their lanes overlap by more than this, and their lengths by `COLLIDE_FACTOR`. */
export const LATERAL_OVERLAP = 0.3;
export const COLLIDE_FACTOR = 0.82;
/** Warn when movers sharing a lane would touch within this many ticks. */
export const WARN_TICKS = 75;
export const WARN_MAX_GAP = 120 * ART;

/** A mover joining the road (from an entrance or a short cut) waits until nothing will reach it in this many ticks. */
export const JOIN_TICKS = 100;
/** How far before the end of its route a joining mover stops to wait. */
export const JOIN_HOLD = 16 * ART;

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
export const GRAB_RADIUS = 30 * ART;

/** Ticks a mover wobbles after sliding on a patch. */
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
