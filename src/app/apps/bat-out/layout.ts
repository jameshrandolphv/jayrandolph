import type { Mode } from './rules';

/** A button, centred at (x, y) about the middle of the screen, in logical px. */
export interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const button = (y: number, label: string, w = 128, h = 21): Button => ({ x: 0, y, w, h, label });

export const MODE_BUTTONS: readonly (Button & { mode: Mode })[] = [
  { ...button(-52, 'AT BAT: HITTING'), mode: 'hitting' },
  { ...button(-26, 'AT BAT: PITCHING'), mode: 'pitching' },
  { ...button(0, '3 INNINGS'), mode: 'game3' },
  { ...button(26, '6 INNINGS'), mode: 'game6' },
  { ...button(52, '9 INNINGS'), mode: 'game9' },
];
export const HELP_BUTTON = button(88, 'HOW TO PLAY', 104);
export const BACK_BUTTON = button(124, 'GOT IT!', 84);
export const CONTINUE_BUTTON = button(40, 'PLAY BALL!', 104);
export const AGAIN_BUTTON = button(62, 'PLAY AGAIN', 104);
export const MENU_BUTTON = button(90, 'MENU', 84);
export const RESUME_BUTTON = button(-4, 'RESUME', 96);
export const QUIT_BUTTON = button(24, 'QUIT', 84);

export const inButton = (b: Button, x: number, y: number): boolean =>
  Math.abs(x - b.x) <= b.w / 2 + 3 && Math.abs(y - b.y) <= b.h / 2 + 3;

/** The pause button, in the top right corner of what is showing (screen coordinates about the middle). */
export const pauseButton = (b: Bounds, width: number, height: number): Button => ({
  x: b.right - width / 2 - 14,
  y: b.top - height / 2 + 14,
  w: 22,
  h: 22,
  label: '',
});
