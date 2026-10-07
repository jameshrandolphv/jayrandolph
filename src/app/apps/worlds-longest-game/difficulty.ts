export type PatternKind =
  | 'sweepV'
  | 'sweepH'
  | 'orbit'
  | 'loop'
  | 'spinner'
  | 'swing'
  | 'unison'
  | 'pinwheel'
  | 'streams'
  | 'diagonal'
  | 'wall'
  | 'trace';

/** The shape of the playfield: a chain of rooms, a winding corridor, a spine with side branches, one big hall or a staircase. */
export type LayoutKind = 'chain' | 'winding' | 'comb' | 'hall' | 'stairs';

export interface Difficulty {
  /** Stretches between safe zones; a level has one more safe zone than this. */
  segments: number;
  chamber: { minW: number; maxW: number; minH: number; maxH: number };
  /** Fewest tiles two joined rooms may share along their common edge. */
  connector: number;
  /** Layouts to draw from; one listed twice is twice as likely. */
  layouts: readonly LayoutKind[];
  /** Most legs a winding corridor may have. */
  legs: number;
  coins: number;
  /** Coins in a hall, laid out in a grid. */
  hallCoins: number;
  patterns: readonly PatternKind[];
  patternsPerChamber: number;
  /** Sweep speed in px per tick. */
  speed: number;
  /** Extra room, beyond the player and an enemy, between neighbouring lanes. */
  lane: number;
  columns: number;
  perColumn: number;
  orbitDots: number;
  rings: number;
  loopDots: number;
  /** Dots following a winding route. */
  routeDots: number;
}

const CHAMBERS = [
  { minW: 8, maxW: 14, minH: 5, maxH: 9 },
  { minW: 6, maxW: 10, minH: 4, maxH: 7 },
  { minW: 5, maxW: 8, minH: 4, maxH: 6 },
  { minW: 4, maxW: 6, minH: 4, maxH: 5 },
] as const;

/** Rooms for the first few levels: smaller than the full game's, so there is less to fill. */
const EARLY_CHAMBER = { minW: 6, maxW: 10, minH: 4, maxH: 6 } as const;

/** Level 1 is already as hard as an easier game's level 1. */
const HEAD_START = 2;

/** The levels before this are plainer in layout than the full game, which has every pattern and shape by here. */
const FULL_COMPLEXITY = 15;

/** Patterns open up in this order, each from the level shown. */
const PATTERN_UNLOCKS: readonly [PatternKind, number][] = [
  ['sweepV', 1],
  ['sweepH', 1],
  ['unison', 3],
  ['orbit', 4],
  ['swing', 5],
  ['spinner', 6],
  ['loop', 8],
  ['diagonal', 9],
  ['wall', 15],
  ['pinwheel', 11],
  ['streams', 12],
  ['trace', 13],
];

/** Layouts open up the same way. */
const LAYOUT_UNLOCKS: readonly [LayoutKind, number][] = [
  ['chain', 1],
  ['hall', 4],
  ['comb', 6],
  ['stairs', 8],
  ['winding', 10],
];

/** Speed and lane width saturate at what is humanly playable; later levels get longer, denser and more mixed. */
export const difficultyFor = (number: number): Difficulty => {
  const level = number + HEAD_START;
  const t = level - 1;
  // Safe zones are scarce: a long run between them is the point.
  const segments = number < 10 ? 1 : number < 24 ? 2 : number < 45 ? 3 : 4;
  const layouts = LAYOUT_UNLOCKS.filter(([, from]) => number >= from).map(([kind]) => kind);
  // Once the full set is open, the twistier shapes come up more often.
  if (number >= FULL_COMPLEXITY) layouts.push('winding', 'comb');
  return {
    segments,
    chamber: number < 10 && segments === 1 ? EARLY_CHAMBER : CHAMBERS[segments - 1]!,
    connector: level < 10 ? 3 : level < 25 ? 2 : 1,
    layouts,
    legs: Math.min(4, 2 + Math.floor(number / 6)),
    coins: Math.min(10, 2 + Math.floor(number / 4)),
    hallCoins: Math.min(28, 6 + Math.floor(number * 1.5)),
    patterns: PATTERN_UNLOCKS.filter(([, from]) => number >= from).map(([kind]) => kind),
    // Busy levels build up slowly: the heaviest mixes are for level 20 and beyond.
    patternsPerChamber: number < 14 ? 1 : number < 26 ? 2 : 3,
    speed: Math.min(4, 2.2 + 0.06 * t),
    lane: Math.max(12, 40 - t),
    columns: Math.min(8, 2 + Math.floor(number / 4)),
    perColumn: number < 6 ? 1 : number < 14 ? 2 : number < 24 ? 3 : 4,
    orbitDots: Math.min(8, 3 + Math.floor(number / 8)),
    rings: level < 20 ? 1 : 2,
    loopDots: Math.min(6, 2 + Math.floor(number / 10)),
    routeDots: Math.min(6, 2 + Math.floor(number / 6)),
  };
};
