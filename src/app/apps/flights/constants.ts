/** Logical resolution (3:2, like the original phone screen) and tuning. Distances are logical px; speeds are per 60 Hz tick. */
export const WIDTH = 960;
export const HEIGHT = 640;

export type Kind = 'jet' | 'light' | 'heli';
export const KINDS: readonly Kind[] = ['jet', 'light', 'heli'];

export interface KindSpec {
  /** Cruising speed of the normal variant. */
  speed: number;
  /** Half the drawn size; collisions and warnings are measured from it. */
  radius: number;
  /** How often this kind is picked, relative to the others. */
  weight: number;
}

export const KIND_SPECS: Readonly<Record<Kind, KindSpec>> = {
  jet: { speed: 0.78, radius: 26, weight: 0.4 },
  light: { speed: 0.58, radius: 19, weight: 0.35 },
  heli: { speed: 0.5, radius: 20, weight: 0.25 },
};

/** Fast variants are smaller and this much quicker. */
export const FAST_SPEED = 1.6;
export const FAST_RADIUS = 0.82;
/** Fast variants start appearing at this score and become more common up to `FAST_MAX_CHANCE`. */
export const FAST_FROM_SCORE = 10;
export const FAST_MAX_CHANCE = 0.35;

/** Aircraft collide when closer than this share of their combined radii; under 1 so a glancing pass is forgiven. */
export const COLLIDE_FACTOR = 0.72;
/** Extra distance beyond the combined radii at which the warning rings appear. */
export const WARN_GAP = 46;

/** Aircraft further than this from an edge, heading out, start turning back in. */
export const EDGE_MARGIN = 26;
/** Radians per tick an aircraft turns when it bounces off an edge. */
export const EDGE_TURN = 0.055;
/** How far outside the field new aircraft appear. */
export const SPAWN_OUTSIDE = 50;
/** Ticks the edge marker shows before its aircraft arrives. */
export const SPAWN_WARNING = 150;
export const FIRST_SPAWN = 60;
/** Ticks between arrivals at score 0, the fewest it falls to, and how much each landing takes off it. */
export const SPAWN_INTERVAL = 300;
export const SPAWN_INTERVAL_MIN = 110;
export const SPAWN_INTERVAL_STEP = 3;
/** Aircraft allowed in the air at once at score 0, the most ever, and how many landings add one more. */
export const MAX_AIRCRAFT_START = 3;
export const MAX_AIRCRAFT = 14;
export const LANDINGS_PER_EXTRA = 4;

/** Spacing of the points of a drawn path. */
export const PATH_STEP = 7;
/** Longest path kept, in points, so a scribble can't grow without bound. */
export const PATH_MAX = 900;
/** How close a press has to be to an aircraft to grab it. */
export const GRAB_RADIUS = 38;

export const LAND_TICKS = 96;
export const HELI_LAND_TICKS = 72;
/** Landings within this many ticks of each other build a streak for the praise text. */
export const STREAK_TICKS = 210;
export const PRAISE_TICKS = 100;

/** Ticks the collision is shown before the game-over card. */
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

/** Corner buttons during play, kept clear of the field edge decoration. */
export const FAST_BUTTON: Rect = { x: 10, y: HEIGHT - 58, w: 48, h: 48 };
export const PAUSE_BUTTON: Rect = { x: WIDTH - 58, y: HEIGHT - 58, w: 48, h: 48 };

/** Oval buttons on the cards. `x`/`y` is the centre; hit testing uses the bounding ellipse. */
export interface Oval {
  x: number;
  y: number;
  rx: number;
  ry: number;
  label: string;
}

export const inOval = (o: Oval, x: number, y: number): boolean =>
  ((x - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2 <= 1;

export const PLAY_BUTTON: Oval = { x: 455, y: 500, rx: 108, ry: 56, label: 'PLAY!' };
export const HELP_BUTTON: Oval = { x: 230, y: 470, rx: 78, ry: 34, label: 'HOW TO PLAY' };
export const BACK_BUTTON: Oval = { x: 480, y: 548, rx: 82, ry: 38, label: 'GOT IT!' };
export const RETRY_BUTTON: Oval = { x: 400, y: 530, rx: 100, ry: 54, label: 'RETRY' };
export const MENU_BUTTON: Oval = { x: 240, y: 548, rx: 62, ry: 32, label: 'MENU' };
export const RESUME_BUTTON: Oval = { x: 560, y: 360, rx: 96, ry: 48, label: 'RESUME' };
export const QUIT_BUTTON: Oval = { x: 360, y: 368, rx: 64, ry: 34, label: 'MENU' };
