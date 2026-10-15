import { LOOP_PERIODS } from './constants';

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
  /** Largest clear patch, in solver cells, left without a fill-in enemy; early levels keep a little breathing room. */
  openCells: number;
  /**
   * Whether a clear strip no wider than a square is left alone, whatever its length, as somewhere to stand,
   * such as the free square between pairs of lanes. One that lets the player walk straight through is always filled.
   */
  restStrips: boolean;
  /** Whether a fill-in may be a dot that never moves; early levels only get moving ones. */
  stationary: boolean;
  /**
   * Most loops of a chamber's quickest enemy before all of them are back where they started together,
   * so the chamber always falls into a short rhythm.
   */
  rhythm: number;
  /** Loop periods enemies may use; the generator narrows this to one beat per chamber. */
  periods: readonly number[];
  /** How much faster than `speed` an enemy may go to keep to its chamber's beat; early levels would rather go slower. */
  overspeed: number;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Loops of the quickest of these periods before they all line up again. */
export const cyclesOf = (periods: readonly number[]): number => {
  if (!periods.length) return 1;
  const lcm = periods.reduce((a, b) => (a * b) / gcd(a, b));
  return lcm / Math.min(...periods);
};

/**
 * Beats a chamber can be built on: sets of periods that fall back into step within a few loops of the
 * quickest. Every set reaches at least 240 ticks, so a sweep across a whole room still fits.
 */
export const BEATS: readonly (readonly number[])[] = [
  [120, 240],
  [180, 360],
  [360, 720],
  [80, 240],
  [120, 360],
  [240, 720],
  [60, 240],
  [90, 180, 360],
  [60, 120, 240],
  [180, 360, 720],
];

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
  ['orbit', 5],
  ['swing', 7],
  ['spinner', 8],
  ['loop', 9],
  ['diagonal', 10],
  ['wall', 15],
  ['pinwheel', 11],
  ['streams', 12],
  ['trace', 13],
];

/** Layouts open up the same way. */
const LAYOUT_UNLOCKS: readonly [LayoutKind, number][] = [
  ['chain', 1],
  ['hall', 6],
  ['comb', 8],
  ['stairs', 10],
  ['winding', 12],
];

/** Levels before this are eased in: sparser patterns, roomier lanes and no stationary fill-ins. */
const EASY_UNTIL = 10;

/** Speed and lane width saturate at what is humanly playable; later levels get longer, denser and more mixed. */
export const difficultyFor = (number: number): Difficulty => {
  const level = number + HEAD_START;
  const t = level - 1;
  // How far into the eased-in stretch this level is, from 1 at level 1 down to 0 at EASY_UNTIL.
  const ease = Math.max(0, (EASY_UNTIL - number) / (EASY_UNTIL - 1));
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
    // Enemies start out a little slower, catching up with the full curve by EASY_UNTIL.
    speed: Math.min(4, 2.2 + 0.06 * t) * (1 - 0.15 * ease),
    lane: Math.max(12, 40 - t) + Math.round(16 * ease),
    columns: Math.min(8, 2 + Math.floor(Math.max(0, number - 4) / 4)),
    perColumn: number < 6 ? 1 : number < 14 ? 2 : number < 24 ? 3 : 4,
    orbitDots: number < 6 ? 2 : Math.min(8, 3 + Math.floor(number / 8)),
    rings: level < 20 ? 1 : 2,
    loopDots: Math.min(6, 2 + Math.floor(number / 10)),
    routeDots: Math.min(6, 2 + Math.floor(number / 6)),
    // The checkpoint at level 10 already doubles the floor to cover, so the fill-ins tighten up over a few levels after it.
    openCells: number < 6 ? 16 : number < EASY_UNTIL ? 9 : number < 14 ? 6 : 4,
    restStrips: number < EASY_UNTIL,
    stationary: number >= EASY_UNTIL,
    // Early chambers stick to one speed and its double; later ones may mix in a third that still keeps time.
    rhythm: number < 4 ? 2 : number < EASY_UNTIL ? 3 : 4,
    periods: LOOP_PERIODS,
    overspeed: number < EASY_UNTIL ? 1.15 : number < 15 ? 1.3 : 1.45,
  };
};
