export const WIDTH = 960;
export const HEIGHT = 720;
/** Height of each black bar above and below the playfield. */
export const BAR = 48;
export const TILE = 48;
export const COLS = 20;
export const ROWS = 13;
export const FIELD_W = COLS * TILE;
export const FIELD_H = ROWS * TILE;

export const PLAYER_SIZE = 32;
export const PLAYER_SPEED = 3.5;
/** Half-size of the part of the player that enemies can hurt; smaller than the drawn square so near misses are forgiven. */
export const PLAYER_HURT_HALF = 12;
export const ENEMY_R = 10;
export const COIN_R = 9;
export const MAX_ENEMY_SPEED = 4.8;

/** Every enemy loops with a period that divides this, so a level repeats exactly. */
export const LEVEL_PERIOD = 720;

export const INTRO_TICKS = 90;
export const DEATH_TICKS = 24;

export const TILE_VOID = 0;
export const TILE_FLOOR = 1;
export const TILE_SAFE = 2;

export const COLORS = {
  void: 0xb3b3ff,
  floorA: 0xf6f6ff,
  floorB: 0xe4e4fa,
  safe: 0xb5ffb0,
  line: 0x000000,
  enemy: 0x0000e6,
  coin: 0xffe600,
  player: 0xff0000,
  skyTop: '#d6d6ff',
  skyBottom: '#ffffff',
} as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Button extends Rect {
  label: readonly string[];
}

export const PLAY_BUTTON: Button = { x: 330, y: 385, w: 300, h: 190, label: ['PLAY', 'GAME'] };
export const BACK_BUTTON: Button = { x: 200, y: 490, w: 260, h: 150, label: ['BACK TO', 'MENU'] };
export const START_BUTTON: Button = { x: 500, y: 490, w: 260, h: 150, label: ['PLAY', 'GAME'] };

export const inRect = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Circle against an axis-aligned square given by its centre and half-size. */
export const circleHitsSquare = (cx: number, cy: number, r: number, sx: number, sy: number, half: number): boolean => {
  const nx = Math.max(sx - half, Math.min(cx, sx + half));
  const ny = Math.max(sy - half, Math.min(cy, sy + half));
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
};
