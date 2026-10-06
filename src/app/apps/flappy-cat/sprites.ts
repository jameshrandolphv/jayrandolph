import { renderText, textWidth, type TextStyle } from '../../games/pixel-font';
import { Pixels } from '../../games/pixels';
import { BUTTON_H, BUTTON_W, GROUND_H, PIPE_W } from './constants';

export const COLORS = {
  sky: '#86c1dc',
  dark: '#543847',
  cream: '#fdf6d8',
  sand: '#ded895',
  orange: '#e8661a',
  orangeDark: '#b34508',
  gold: '#f7c23c',
  white: '#ffffff',
};

const FUR = '#7b8aa6';
const FUR_DARK = '#5a6a89';
const FUR_LIGHT = '#aab7cd';
const EYE = '#8be05a';
const NOSE = '#f08aa4';
const WING = '#f7f8fc';
const WING_SHADE = '#c3cbe0';

export const CAT_SIZE = { w: 24, h: 24 };
/** Fraction of the cat sprite that is its centre of rotation and hit circle. */
export const CAT_ANCHOR = { x: 0.5, y: 13 / 24 };

const catBody = (): Pixels => {
  const p = new Pixels(22, 17);
  p.line(3, 11, 2, 8, FUR_DARK).line(2, 8, 2, 5, FUR_DARK);
  p.line(4, 11, 3, 8, FUR_DARK).line(3, 8, 3, 5, FUR_DARK);
  p.ellipse(7.5, 10.6, 5.5, 3.8, FUR);
  p.ellipse(8.5, 13.2, 3.8, 1.7, FUR_LIGHT);
  p.ellipse(12.8, 7.6, 4.7, 3.8, FUR);
  p.tri(8.5, 5, 9.4, 1, 12, 4.3, FUR).tri(13.6, 4.3, 16, 1, 17, 6, FUR);
  p.set(9, 2, NOSE).set(9, 3, NOSE).set(15, 2, NOSE).set(15, 3, NOSE);
  p.ellipse(13.2, 9.4, 2.5, 1.5, FUR_LIGHT);
  p.rect(10, 6, 2, 2, EYE).rect(14, 6, 2, 2, EYE);
  p.set(11, 7, COLORS.dark).set(15, 7, COLORS.dark);
  p.set(10, 6, COLORS.white).set(14, 6, COLORS.white);
  p.set(12, 9, NOSE).set(13, 9, NOSE);
  return p.outlined(COLORS.dark);
};

/** Direction the wing points for each flap pose (degrees, 0 = right, 90 = down): up, level, down. */
const WING_ANGLES = [-112, 180, 112];
const FEATHERS = [
  { turn: 24, length: 7.7, color: WING_SHADE },
  { turn: -24, length: 7.7, color: WING_SHADE },
  { turn: 0, length: 10.2, color: WING },
];

const wing = (frame: number): Pixels => {
  const p = new Pixels(CAT_SIZE.w, CAT_SIZE.h);
  const [rx, ry] = [10, 12];
  for (const f of FEATHERS) {
    const a = ((WING_ANGLES[frame] + f.turn) * Math.PI) / 180;
    const [dx, dy] = [Math.cos(a), Math.sin(a)];
    p.tri(rx - dy * 2.2, ry + dx * 2.2, rx + dy * 2.2, ry - dx * 2.2, rx + dx * f.length, ry + dy * f.length, f.color);
  }
  return p.outlined(COLORS.dark);
};

export const createCatFrames = (): Pixels[] =>
  [0, 1, 2].map((frame) => {
    const p = new Pixels(CAT_SIZE.w, CAT_SIZE.h);
    p.stamp(catBody(), 3, 5);
    p.stamp(wing(frame));
    return p;
  });

const PIPE_BODY_W = PIPE_W - 4;
const PIPE_SHADES = [
  '#e1f58f', '#c6ec6a', '#a4d93f', '#a4d93f', '#8acb2f', '#8acb2f', '#8acb2f', '#7bbd27', '#7bbd27', '#7bbd27',
  '#7bbd27', '#7bbd27', '#6ba91f', '#6ba91f', '#6ba91f', '#5f9a1b', '#5f9a1b', '#548b18', '#548b18', '#4a7c15',
];

const pipeColumn = (x: number, width: number): string => PIPE_SHADES[Math.floor((x / width) * PIPE_SHADES.length)];

export const PIPE_CAP_H = 12;

export const createPipeBody = (): Pixels => {
  const p = new Pixels(PIPE_BODY_W, 1);
  for (let x = 0; x < PIPE_BODY_W; x++) p.set(x, 0, x === 0 || x === PIPE_BODY_W - 1 ? COLORS.dark : pipeColumn(x - 1, PIPE_BODY_W - 2));
  return p;
};

export const createPipeCap = (): Pixels => {
  const p = new Pixels(PIPE_W, PIPE_CAP_H);
  for (let y = 0; y < PIPE_CAP_H; y++) {
    for (let x = 0; x < PIPE_W; x++) {
      const edge = x === 0 || x === PIPE_W - 1 || y === 0 || y === PIPE_CAP_H - 1;
      p.set(x, y, edge ? COLORS.dark : pipeColumn(x - 1, PIPE_W - 2));
    }
  }
  return p;
};

/** One repeat of the striped ground; 16 px wide so the diagonal stripes tile. */
export const createGround = (): Pixels => {
  const p = new Pixels(16, GROUND_H);
  p.rect(0, 0, 16, GROUND_H, COLORS.sand);
  p.rect(0, 0, 16, 1, COLORS.dark);
  p.rect(0, 1, 16, 1, '#d5f58e');
  for (let y = 2; y < 9; y++) {
    for (let x = 0; x < 16; x++) p.set(x, y, (x - y + 64) % 8 < 4 ? '#9ee35a' : '#6ab62c');
  }
  p.rect(0, 9, 16, 1, '#5a9a24');
  p.rect(0, 10, 16, 1, COLORS.dark);
  p.rect(0, 11, 16, 1, '#f3edb0');
  p.rect(0, GROUND_H - 4, 16, 4, '#cdc47e');
  return p;
};

/** Scenery layers stack from the ground up; heights are the distance from each layer's top to the ground. */
export const CLOUD_H = 110;
export const CITY_H = 72;
export const BUSH_H = 32;

const CLOUD = '#ecf8dc';
const CLOUD_HAZE = '#dcecd0';
const CITY = '#e1f0d8';
const CITY_LIGHT = '#eef8e4';
const CITY_EDGE = '#a6c6ea';
const CITY_WINDOW = '#bad4ee';
const BUSH = '#9ed98a';
const BUSH_LIGHT = '#b6e8a0';
const BUSH_DARK = '#74b866';

/** Runs `draw` at each horizontal offset so shapes crossing the edge tile seamlessly. */
const wrapped = (width: number, draw: (dx: number) => void): void => {
  for (const dx of [-width, 0, width]) draw(dx);
};

export const createClouds = (width: number): Pixels => {
  const p = new Pixels(width, CLOUD_H);
  const bumps = [[14, 14, 20], [40, 8, 22], [70, 16, 17], [102, 2, 24], [130, 12, 17]];
  for (const [cx, top, rx] of bumps) wrapped(width, (dx) => p.ellipse(cx + dx, top + 16, rx, 16, CLOUD));
  p.rect(0, 30, width, CLOUD_H - 30, CLOUD);
  // Faint skyline silhouettes sitting in the cloud bank behind the city.
  for (const [x, w, top] of [[54, 14, 38], [136, 16, 44]]) wrapped(width, (dx) => p.rect(x + dx, top, w, CLOUD_H - top, CLOUD_HAZE));
  return p;
};

export const createCity = (width: number): Pixels => {
  const p = new Pixels(width, CITY_H);
  const blocks = [[4, 16, 24], [16, 20, 6], [34, 16, 20], [78, 14, 22], [90, 20, 10], [108, 16, 26], [122, 16, 18]];
  for (const [x, w, top] of blocks) {
    wrapped(width, (dx) => {
      const bx = x + dx;
      const bh = CITY_H - top;
      p.rect(bx, top, w, bh, CITY);
      p.rect(bx + 1, top + 1, 2, bh - 1, CITY_LIGHT);
      p.rect(bx, top, w, 1, CITY_EDGE).rect(bx, top, 1, bh, CITY_EDGE).rect(bx + w - 1, top, 1, bh, CITY_EDGE);
      for (let wy = top + 5; wy < CITY_H; wy += 6) {
        for (let wx = bx + 4; wx < bx + w - 3; wx += 4) p.rect(wx, wy, 2, 3, CITY_WINDOW);
      }
    });
  }
  return p;
};

export const createBushes = (width: number): Pixels => {
  const p = new Pixels(width, BUSH_H);
  const bumps = [[8, 4, 14], [32, 8, 15], [58, 2, 16], [84, 7, 14], [108, 3, 15], [132, 8, 14]];
  for (const [cx, top, rx] of bumps) wrapped(width, (dx) => p.ellipse(cx + dx, top + 12, rx, 12, BUSH));
  p.rect(0, 16, width, BUSH_H - 16, BUSH);
  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < BUSH_H && !p.has(x, y)) y++;
    p.set(x, y, BUSH_LIGHT).set(x, y + 1, BUSH_LIGHT);
  }
  for (const [x, y] of [[2, 18], [22, 24], [44, 17], [66, 23], [88, 18], [108, 25], [126, 19]]) {
    p.line(x, y, x + 5, y + 3, BUSH_DARK).line(x + 5, y + 3, x + 11, y + 1, BUSH_DARK).line(x + 5, y + 3, x + 6, y + 6, BUSH_DARK);
  }
  return p;
};

const BTN_TEXT_Y = 4;

export const createButton = (label: string): Pixels => {
  const p = new Pixels(BUTTON_W, BUTTON_H);
  p.rect(0, 0, BUTTON_W, BUTTON_H, COLORS.dark);
  p.rect(1, 1, BUTTON_W - 2, BUTTON_H - 3, COLORS.white);
  p.rect(2, 2, BUTTON_W - 4, BUTTON_H - 5, COLORS.orange);
  p.rect(2, BUTTON_H - 4, BUTTON_W - 4, 1, COLORS.orangeDark);
  p.rect(1, BUTTON_H - 2, BUTTON_W - 2, 1, COLORS.orangeDark);
  const text = renderText(label, { fill: COLORS.white, outlines: [] });
  p.stamp(text, Math.floor((BUTTON_W - textWidth(label)) / 2), BTN_TEXT_Y);
  return p;
};

export const createPanel = (w: number, h: number): Pixels => {
  const p = new Pixels(w, h);
  p.rect(0, 0, w, h, COLORS.dark);
  p.rect(1, 1, w - 2, h - 2, COLORS.sand);
  p.rect(2, 2, w - 4, 1, '#e9c26b').rect(2, h - 3, w - 4, 1, '#e9c26b');
  p.rect(2, 2, 1, h - 4, '#e9c26b').rect(w - 3, 2, 1, h - 4, '#e9c26b');
  return p;
};

export const createPauseButton = (paused: boolean): Pixels => {
  const p = new Pixels(16, 16);
  p.rect(0, 0, 16, 16, COLORS.dark).rect(1, 1, 14, 14, COLORS.white).rect(2, 2, 12, 12, COLORS.orange);
  p.rect(2, 12, 12, 2, COLORS.orangeDark);
  if (paused) p.tri(6, 4, 6, 12, 12, 8, COLORS.white);
  else p.rect(5, 4, 2, 8, COLORS.white).rect(9, 4, 2, 8, COLORS.white);
  return p;
};

const GOLD = { rim: '#c2761a', edge: '#e9a02a', body: '#f8c04a', light: '#fde9a6', shade: '#d98f22' };

/** Single-hue coin: the embossed cat head is lit from the top left using only tones of the same gold. */
export const createMedal = (): Pixels => {
  const p = new Pixels(24, 24);
  p.ellipse(12, 12, 11, 11, GOLD.rim);
  p.ellipse(12, 12, 10, 10, GOLD.edge);
  p.ellipse(12, 12, 8.5, 8.5, GOLD.body);
  p.rect(6, 5, 3, 1, GOLD.light).rect(5, 6, 1, 3, GOLD.light).set(6, 6, GOLD.light);
  const head = (ox: number, oy: number, color: string): void => {
    p.ellipse(12 + ox, 13 + oy, 5, 4, color);
    p.tri(7 + ox, 12 + oy, 7 + ox, 6 + oy, 11 + ox, 10 + oy, color).tri(17 + ox, 12 + oy, 17 + ox, 6 + oy, 13 + ox, 10 + oy, color);
  };
  head(1, 1, GOLD.shade);
  head(0, 0, GOLD.light);
  p.rect(9, 11, 1, 3, GOLD.shade).rect(14, 11, 1, 3, GOLD.shade).rect(11, 15, 2, 1, GOLD.shade);
  p.rect(5, 15, 3, 1, GOLD.shade).rect(16, 15, 3, 1, GOLD.shade);
  return p;
};

export const createMedalSlot = (): Pixels => {
  const p = new Pixels(24, 24);
  p.ellipse(12, 12, 11, 11, '#d2cc8c');
  return p;
};

export const createTapHand = (): Pixels =>
  Pixels.fromRows(
    [
      '....KK.....',
      '...KWWK....',
      '...KWWK....',
      '...KWWK.KK.',
      '...KWWKKWWK',
      '.KKKWWWWWWK',
      'KWWKWWWWWWK',
      'KWWWWWWWWWK',
      '.KWWWWWWWWK',
      '..KWWWWWWK.',
      '...KWWWWWK.',
      '...KKKKKKK.',
    ],
    { K: COLORS.dark, W: COLORS.white },
  );

export const createArrow = (): Pixels =>
  Pixels.fromRows(['...K...', '..KWK..', '.KWWWK.', 'KWWWWWK', '..KWK..', '..KWK..', '..KWK..', '..KKK..'], { K: COLORS.dark, W: '#9fb4bd' });

export const createTapTag = (): Pixels => {
  const text = renderText('TAP', { fill: COLORS.white, outlines: [] });
  const p = new Pixels(text.width + 8, 13);
  p.rect(0, 0, p.width, 13, COLORS.dark).rect(1, 1, p.width - 2, 11, '#d9544a');
  p.stamp(text, 4, 3);
  return p;
};

const titleOutlines = [COLORS.dark, COLORS.cream];
export const logoStyle: TextStyle = { display: true, fill: ['#fbf1b3', '#a8d45a'], outlines: titleOutlines };
export const readyStyle: TextStyle = { display: true, fill: '#f9b83c', outlines: titleOutlines };
export const gameOverStyle: TextStyle = { display: true, fill: '#f9b83c', outlines: titleOutlines };
export const scoreStyle: TextStyle = { scale: 2, fill: COLORS.white, outlines: [COLORS.dark] };
export const smallScoreStyle: TextStyle = { fill: COLORS.white, outlines: [COLORS.dark] };
export const panelLabelStyle: TextStyle = { fill: '#e0a24a', outlines: [] };
export const pausedStyle: TextStyle = { display: true, fill: COLORS.white, outlines: titleOutlines };
