export type PatternKind = 'sweepV' | 'sweepH' | 'orbit' | 'loop';

export interface Difficulty {
  segments: number;
  chamber: { minW: number; maxW: number; minH: number; maxH: number };
  /** Fewest tiles two joined rooms may share along their common edge. */
  connector: number;
  coins: number;
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
}

const CHAMBERS = [
  { minW: 8, maxW: 14, minH: 5, maxH: 9 },
  { minW: 6, maxW: 10, minH: 4, maxH: 7 },
  { minW: 5, maxW: 8, minH: 4, maxH: 6 },
  { minW: 4, maxW: 6, minH: 4, maxH: 5 },
] as const;

/** Level 1 is already as hard as an easier game's level 3. */
const HEAD_START = 2;

/** Speed and lane width saturate at what is humanly playable; later levels get longer, denser and more mixed. */
export const difficultyFor = (number: number): Difficulty => {
  const level = number + HEAD_START;
  const t = level - 1;
  const segments = level < 5 ? 1 : level < 10 ? 2 : level < 18 ? 3 : 4;
  const patterns: PatternKind[] = ['sweepV', 'sweepH'];
  if (level >= 8) patterns.push('orbit');
  if (level >= 14) patterns.push('loop');
  return {
    segments,
    chamber: CHAMBERS[segments - 1]!,
    connector: level < 10 ? 3 : level < 25 ? 2 : 1,
    coins: level < 3 ? 0 : Math.min(10, 1 + Math.floor((level - 3) / 3)),
    patterns,
    patternsPerChamber: level < 12 ? 1 : level < 28 ? 2 : 3,
    speed: Math.min(4, 1.8 + 0.06 * t),
    lane: Math.max(12, 40 - t),
    columns: Math.min(8, 2 + Math.floor(t / 5)),
    perColumn: level < 13 ? 2 : level < 31 ? 3 : 4,
    orbitDots: Math.min(8, 3 + Math.floor(t / 8)),
    rings: level < 20 ? 1 : 2,
    loopDots: Math.min(6, 2 + Math.floor(t / 10)),
  };
};
