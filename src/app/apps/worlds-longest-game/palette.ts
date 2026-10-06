import { COLORS } from './constants';

export interface Palette {
  enemy: number;
  /** The background around the playable tiles. */
  void: number;
  /** The two squares of the checkerboard floor. */
  floorA: number;
  floorB: number;
}

/** Colour scheme reached at a level; between two of these the colours blend smoothly. */
const STAGES: readonly { level: number; palette: Palette }[] = [
  { level: 1, palette: { enemy: COLORS.enemy, void: COLORS.void, floorA: COLORS.floorA, floorB: COLORS.floorB } },
  { level: 50, palette: { enemy: 0x7a00cc, void: 0xd5b3ff, floorA: 0xfaf6ff, floorB: 0xefe4fa } },
  { level: 100, palette: { enemy: 0xe60000, void: 0xffb3b3, floorA: 0xfff6f6, floorB: 0xfae4e4 } },
  { level: 150, palette: { enemy: 0x7a4a1c, void: 0xd9bf9f, floorA: 0xfaf4ec, floorB: 0xf0e4d4 } },
  { level: 200, palette: { enemy: 0x555555, void: 0xbfbfbf, floorA: 0xf6f6f6, floorB: 0xe4e4e4 } },
];

const mix = (a: number, b: number, t: number): number => {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    out |= Math.round(from + (to - from) * t) << shift;
  }
  return out;
};

/** Blue at the start, drifting to purple by level 50, red by 100, brown by 150 and gray from 200 on. */
export const paletteFor = (level: number): Palette => {
  const last = STAGES[STAGES.length - 1]!;
  if (level >= last.level) return last.palette;
  const next = STAGES.findIndex((stage) => stage.level > level);
  if (next <= 0) return STAGES[0]!.palette;
  const from = STAGES[next - 1]!;
  const to = STAGES[next]!;
  const t = (level - from.level) / (to.level - from.level);
  return {
    enemy: mix(from.palette.enemy, to.palette.enemy, t),
    void: mix(from.palette.void, to.palette.void, t),
    floorA: mix(from.palette.floorA, to.palette.floorA, t),
    floorB: mix(from.palette.floorB, to.palette.floorB, t),
  };
};
