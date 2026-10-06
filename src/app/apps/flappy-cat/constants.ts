/** Logical resolution and tuning. Distances are logical px; speeds and accelerations are per 60 Hz tick. */
export const WIDTH = 144;
export const HEIGHT = 256;
export const GROUND_H = 56;
export const GROUND_Y = HEIGHT - GROUND_H;

export const CAT_X = 44;
export const CAT_START_Y = 100;
export const CAT_RADIUS = 5;

export const GRAVITY = 0.12;
export const FLAP_VY = -2.6;
export const MAX_FALL_VY = 4;
export const SCROLL = 1.2;

export const PIPE_W = 26;
export const PIPE_GAP = 50;
export const PIPE_SPACING = 78;
export const PIPE_MARGIN = 18;
/** Largest vertical shift between consecutive gaps, so every pair stays flyable. */
export const PIPE_MAX_SHIFT = 70;
export const FIRST_PIPE_X = WIDTH + 24;

export const FLASH_TICKS = 10;
/** Ticks before the game-over screen accepts input, so a panicked tap can't dismiss it. */
export const GAME_OVER_LOCKOUT = 40;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const BUTTON_W = 57;
export const BUTTON_H = 17;
export const START_BUTTON: Rect = { x: Math.floor((WIDTH - BUTTON_W) / 2), y: 168, w: BUTTON_W, h: BUTTON_H };
export const OK_BUTTON: Rect = { x: Math.floor((WIDTH - BUTTON_W) / 2), y: 176, w: BUTTON_W, h: BUTTON_H };
export const PAUSE_BUTTON: Rect = { x: 4, y: 4, w: 16, h: 16 };

export const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
