import { Pixels } from './pixels';

const GLYPH_W = 5;
const GLYPH_H = 7;

/** 5x7 glyphs, one space-separated string per row group. */
const GLYPHS: Readonly<Record<string, string>> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.#### #.... #.... #.... #.... #.... .####',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.#### #.... #.... #..## #...# #...# .###.',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '##### ..#.. ..#.. ..#.. ..#.. ..#.. #####',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# ##..# #.#.# #..## #...# #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '####. ....# ....# .###. ....# ....# ####.',
  '4': '#...# #...# #...# ##### ....# ....# ....#',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '.###. #.... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ....# .###.',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '-': '..... ..... ..... ##### ..... ..... .....',
};

const DISPLAY_CAP = 11;
const DISPLAY_X_TOP = 3;

/** Chunky mixed-case title font: caps are 11 rows, lowercase start 3 rows down, `top` overrides that. */
const DISPLAY_GLYPHS: Readonly<Record<string, { top?: number; rows: string }>> = {
  F: { top: 0, rows: '######## ######## ###..... ###..... #######. #######. ###..... ###..... ###..... ###..... ###.....' },
  C: { top: 0, rows: '.#######. ######### ###...### ###...... ###...... ###...... ###...... ###...... ###...### ######### .#######.' },
  G: { top: 0, rows: '.#######. ######### ###...### ###...... ###...... ###..#### ###..#### ###...### ###...### ######### .#######.' },
  O: { top: 0, rows: '.#######. ######### ###...### ###...### ###...### ###...### ###...### ###...### ###...### ######### .#######.' },
  R: { top: 0, rows: '########. ######### ###...### ###...### ######### ########. ###.###.. ###..###. ###...### ###...### ###...###' },
  P: { top: 0, rows: '########. ######### ###...### ###...### ######### ########. ###...... ###...... ###...... ###...... ###......' },
  d: { top: 0, rows: '.....### .....### .....### .####### ######## ###..### ###..### ###..### ###..### ######## .#######' },
  u: { rows: '###..### ###..### ###..### ###..### ###..### ###..### ######## .#######' },
  s: { rows: '.####### ######## ###..... .######. ..###### .....### ######## #######.' },
  l: { top: 0, rows: '### ### ### ### ### ### ### ### ### ### ###' },
  t: { top: 1, rows: '.###.. .###.. ###### ###### .###.. .###.. .###.. .###.. .##### ..####' },
  a: { rows: '.######. ######## .....### .####### ######## ###..### ######## .#######' },
  e: { rows: '.######. ######## ###..### ######## ######## ###..... ######## .######.' },
  m: { rows: '.#########. ########### ###.###.### ###.###.### ###.###.### ###.###.### ###.###.### ###.###.###' },
  v: { rows: '###..### ###..### ###..### ###..### ###..### .######. ..####.. ...##...' },
  r: { rows: '###.#### ######## #####..# ####.... ###..... ###..... ###..... ###.....' },
  p: { rows: '#######. ######## ###..### ###..### ###..### ###..### ######## #######. ###..... ###..... ###.....' },
  y: { rows: '###..### ###..### ###..### ###..### ###..### ###..### ######## .####### .....### #######. .#####..' },
};

export interface TextStyle {
  /** Uses the chunky mixed-case title font instead of the 5x7 caps font; `scale` and `spacing` are ignored. */
  display?: boolean;
  /** Integer size multiplier. */
  scale?: number;
  /** A single color, or [top, bottom] to split the glyph height in two tones. */
  fill: string | readonly [string, string];
  /** Borders added outward, innermost first; each is one pixel wide. */
  outlines?: readonly string[];
  /** Blank pixels between glyphs, before scaling. */
  spacing?: number;
}

export const textWidth = (text: string, scale = 1, spacing = 1): number =>
  text.length === 0 ? 0 : (text.length * (GLYPH_W + spacing) - spacing) * scale;

export const TEXT_HEIGHT = GLYPH_H;

/** Rasterises text; the result includes room for every outline. */
export function renderText(text: string, style: TextStyle): Pixels {
  if (style.display) return renderDisplay(text, style);
  const scale = style.scale ?? 1;
  const spacing = style.spacing ?? 1;
  const outlines = style.outlines ?? [];
  const pad = outlines.length;
  const [top, bottom] = typeof style.fill === 'string' ? [style.fill, style.fill] : style.fill;

  const pixels = new Pixels(textWidth(text, scale, spacing) + pad * 2, GLYPH_H * scale + pad * 2);
  [...text.toUpperCase()].forEach((ch, index) => {
    const rows = (GLYPHS[ch] ?? '').split(' ');
    const ox = pad + index * (GLYPH_W + spacing) * scale;
    rows.forEach((row, gy) => {
      [...row].forEach((cell, gx) => {
        if (cell === '#') pixels.rect(ox + gx * scale, pad + gy * scale, scale, scale, gy * 2 < GLYPH_H ? top : bottom);
      });
    });
  });

  return outlines.reduce((acc, color) => acc.outlined(color), pixels);
}

function renderDisplay(text: string, style: TextStyle): Pixels {
  const spacing = style.spacing ?? 1;
  const outlines = style.outlines ?? [];
  const pad = outlines.length;
  const [top, bottom] = typeof style.fill === 'string' ? [style.fill, style.fill] : style.fill;
  const placed: { rows: string[]; top: number; x: number }[] = [];
  let x = 0;
  let height = DISPLAY_CAP;
  for (const ch of text) {
    const glyph = DISPLAY_GLYPHS[ch];
    if (!glyph) {
      x += 5 + spacing;
      continue;
    }
    const rows = glyph.rows.split(' ');
    const gTop = glyph.top ?? DISPLAY_X_TOP;
    placed.push({ rows, top: gTop, x });
    height = Math.max(height, gTop + rows.length);
    x += rows[0].length + spacing;
  }

  const pixels = new Pixels(Math.max(x - spacing, 0) + pad * 2, height + pad * 2);
  for (const g of placed) {
    g.rows.forEach((row, ry) => {
      const y = g.top + ry;
      [...row].forEach((cell, rx) => {
        if (cell === '#') pixels.set(pad + g.x + rx, pad + y, y * 2 < DISPLAY_CAP ? top : bottom);
      });
    });
  }
  return outlines.reduce((acc, color) => acc.outlined(color), pixels);
}
