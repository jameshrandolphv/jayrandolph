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

const button = (y: number, label: string, w = 132, h = 21): Button => ({ x: 0, y, w, h, label });

export const MODE_BUTTONS: readonly (Button & { mode: Mode })[] = [
  { ...button(-38, 'AT BAT: HITTING'), mode: 'hitting' },
  { ...button(-12, 'AT BAT: PITCHING'), mode: 'pitching' },
  { ...button(14, '3 INNINGS'), mode: 'game3' },
  { ...button(40, '6 INNINGS'), mode: 'game6' },
  { ...button(66, '9 INNINGS'), mode: 'game9' },
];
export const HELP_BUTTON = button(104, 'HOW TO PLAY', 100, 17);
export const BACK_BUTTON = button(128, 'BACK', 80, 19);
export const CONTINUE_BUTTON = button(74, 'PLAY BALL!', 110, 21);
export const AGAIN_BUTTON = button(70, 'PLAY AGAIN', 110, 21);
export const MENU_BUTTON = button(98, 'MENU', 80, 19);
export const RESUME_BUTTON = button(-6, 'RESUME', 100, 21);
export const QUIT_BUTTON = button(22, 'QUIT', 80, 19);

export const inButton = (b: Button, x: number, y: number): boolean =>
  Math.abs(x - b.x) <= b.w / 2 + 3 && Math.abs(y - b.y) <= b.h / 2 + 3;

/** The pause button, in the top right corner of what is showing (screen coordinates about the middle). */
export const pauseButton = (b: Bounds, width: number, height: number): Button => ({
  x: b.right - width / 2 - 11,
  y: b.top - height / 2 + 11,
  w: 16,
  h: 16,
  label: '',
});
