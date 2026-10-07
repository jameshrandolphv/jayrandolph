import { COLS, ENEMY_R, LEVEL_PERIOD, ROWS, TILE, TILE_FLOOR } from './constants';
import { difficultyFor, type Difficulty } from './difficulty';
import { planLevel, tilesOf, type Chamber, type Plan } from './layouts';
import { enemyPositionAt, tileAt, type Coin, type Enemy, type LevelDef, type Point, type TileRect } from './level';
import {
  INSET,
  boxOf,
  centresIn,
  pickPeriod,
  populate,
  spinners,
  splitBox,
  trace,
  sweeps,
  walls,
  type Box,
} from './patterns';
import { createRandom, hashSeed, type Random } from './rng';
import { COIN_REACH, isSegmentSolvable, isSolvable, openAreas, viableSpots, type OpenArea } from './solver';

const area = (r: TileRect): number => r.w * r.h;

/** Fills the chamber with patterns: one apiece for each part of a complicated shape, several in a plain room. */
const populateChamber = (rand: Random, chamber: Chamber, d: Difficulty): Enemy[] => {
  const enemies: Enemy[] = [];
  if (chamber.route && rand.chance(0.8)) enemies.push(...trace(rand, chamber.route, d));
  const single = chamber.parts.length === 1;
  for (const part of chamber.parts) {
    if (part.w < 2 || part.h < 2) continue;
    // Walls need the whole stretch to stand across, so they are tried before the part is split up.
    const walled = d.patterns.includes('wall') && rand.chance(0.3) ? walls(rand, boxOf(part), d) : [];
    if (walled.length) {
      enemies.push(...walled);
      continue;
    }
    const kinds = [...d.patterns];
    for (const box of splitBox(boxOf(part), single ? d.patternsPerChamber : 1)) {
      while (kinds.length) {
        const [kind] = kinds.splice(rand.int(0, kinds.length - 1), 1);
        const made = populate(rand, kind!, box, d);
        if (made.length) {
          enemies.push(...made);
          break;
        }
      }
    }
  }
  if (!enemies.length) {
    const biggest = chamber.parts.reduce((a, b) => (area(b) > area(a) ? b : a));
    enemies.push(...sweeps(rand, boxOf(biggest), d, true));
  }
  return enemies;
};

const COIN_APART = 90;

/** A staggered grid of coins across the chamber, as dense as fits the wanted count. */
const gridCoins = (chamber: Chamber, wanted: number): Point[] => {
  const biggest = chamber.parts.reduce((a, b) => (area(b) > area(a) ? b : a));
  const { x0, y0, x1, y1 } = boxOf(biggest, 36);
  let points: Point[] = [];
  for (let step = 56; step < 400; step += 4) {
    points = [];
    const rowStep = step * 0.9;
    for (let row = 0; y0 + row * rowStep <= y1; row++) {
      for (let x = x0 + (row % 2 ? step / 2 : 0); x <= x1; x += step)
        points.push({ x: Math.round(x), y: Math.round(y0 + row * rowStep) });
    }
    if (points.length <= wanted) break;
  }
  return points;
};

/** Whether the player can be within reach of the point, on the way through the level. */
const collectable = (spots: readonly Point[], p: Point): boolean =>
  spots.some((s) => Math.abs(s.x - p.x) <= COIN_REACH && Math.abs(s.y - p.y) <= COIN_REACH);

/**
 * Places coins, each only where the player can safely be on the way through the level: some tucked into
 * dead ends first, the rest scattered, or a whole grid of them. Every chamber's enemies must be in place.
 */
const placeCoins = (rand: Random, plan: Plan, level: LevelDef, d: Difficulty): Coin[] => {
  const spots = plan.chambers.map((_, i) => viableSpots(level, i));
  if (plan.grid)
    return gridCoins(plan.chambers[0]!, d.hallCoins)
      .filter((p) => collectable(spots[0]!, p))
      .map((p) => ({ ...p, segment: 0 }));
  const coins: Coin[] = [];
  const nooks = plan.chambers.map(
    (c) => c.nooks?.filter((n) => collectable(spots[plan.chambers.indexOf(c)]!, n)) ?? [],
  );
  for (let i = 0; i < d.coins; i++) {
    const segment = i % plan.chambers.length;
    const nook = nooks[segment]!.splice(rand.int(0, Math.max(0, nooks[segment]!.length - 1)), 1)[0];
    if (nook) {
      coins.push({ ...nook, segment });
      continue;
    }
    const floor = spots[segment]!.filter(
      (p) => level.tiles[Math.floor(p.y / TILE) * COLS + Math.floor(p.x / TILE)] === TILE_FLOOR,
    );
    if (!floor.length) continue;
    let spot = rand.pick(floor);
    for (
      let attempt = 0;
      attempt < 20 && !coins.every((c) => Math.hypot(c.x - spot.x, c.y - spot.y) >= COIN_APART);
      attempt++
    )
      spot = rand.pick(floor);
    coins.push({ ...spot, segment });
  }
  return coins;
};

/** A clear patch bigger than this many solver cells (about one player square) counts as an open area. */
const MAX_OPEN_CELLS = 4;
const MAX_FILLS = 16;
/** Candidate fill-ins tried for a single open area before it is given up on. */
const FILL_TRIES = 6;
/** Fresh draws of a chamber's enemies before settling for the last. */
const CHAMBER_TRIES = 10;

const onFloor = (level: LevelDef, p: Point): boolean =>
  [
    [0, 0],
    [ENEMY_R, 0],
    [-ENEMY_R, 0],
    [0, ENEMY_R],
    [0, -ENEMY_R],
  ].every(([dx, dy]) => tileAt(level, p.x + dx!, p.y + dy!) === TILE_FLOOR);

const stays = (level: LevelDef, enemy: Enemy): boolean => {
  for (let tick = 0; tick < level.period; tick += 6) if (!onFloor(level, enemyPositionAt(enemy, tick))) return false;
  return true;
};

/** Something to patrol an open area: a spinner when it is roomy, a small orbit or a lone dot when it is tight, otherwise a sweep along its long side. */
const fillerFor = (
  rand: Random,
  level: LevelDef,
  open: OpenArea,
  d: Difficulty,
  accept: (made: Enemy[]) => boolean,
): Enemy[] => {
  const box: Box = { x0: open.x0, y0: open.y0, x1: open.x1, y1: open.y1 };
  const attempts: Enemy[][] = [];
  const width = open.x1 - open.x0;
  const height = open.y1 - open.y0;
  const cx = (open.x0 + open.x1) / 2;
  const cy = (open.y0 + open.y1) / 2;
  if (Math.min(width, height) >= 2 * (INSET + 3 * 2 * ENEMY_R)) attempts.push(spinners(rand, box, d));
  const small = Math.max(width, height) < 60;
  const orbit = (radius: number): Enemy[] => {
    const period = pickPeriod(2 * Math.PI * radius, d.speed * 0.8);
    return [
      {
        kind: 'orbit',
        cx,
        cy,
        radius,
        period,
        phase: rand.int(0, period - 1),
        dir: rand.chance(0.5) ? 1 : -1,
      },
    ];
  };
  const lone: Enemy[] = [{ kind: 'sweep', ax: cx, ay: cy, bx: cx, by: cy, period: LEVEL_PERIOD, phase: 0 }];
  if (small) attempts.push(orbit(Math.min(24, Math.max(width, height) / 2 + 6)), lone);
  const wide = width >= height;
  for (const horizontal of [wide, !wide]) {
    const [a0, a1, c0, c1] = horizontal ? [open.x0, open.x1, open.y0, open.y1] : [open.y0, open.y1, open.x0, open.x1];
    // Straight runs go down the middle of a square, the one nearest the patch's middle first.
    const lines = centresIn(c0 - 18, c1 + 18).sort((a, b) => Math.abs(a - (c0 + c1) / 2) - Math.abs(b - (c0 + c1) / 2));
    for (const line of lines.slice(0, 3)) {
      const period = pickPeriod(2 * Math.max(a1 - a0, 48), d.speed * rand.range(0.9, 1.2));
      const phase = rand.int(0, period - 1);
      const [from, to] = [(a0 + a1) / 2 - Math.max(a1 - a0, 48) / 2, (a0 + a1) / 2 + Math.max(a1 - a0, 48) / 2];
      attempts.push([
        horizontal
          ? { kind: 'sweep', ax: from, ay: line, bx: to, by: line, period, phase }
          : { kind: 'sweep', ax: line, ay: from, bx: line, by: to, period, phase },
      ]);
    }
  }
  if (!small) attempts.push(orbit(Math.min(24, Math.max(width, height) / 2 + 6)), lone);
  let tried = 0;
  return (
    attempts.find((made) => {
      if (!made.length || !made.every((e) => stays(level, e)) || tried++ >= FILL_TRIES) return false;
      return accept(made);
    }) ?? []
  );
};

/** The chamber a point on the floor belongs to, or -1. */
const chamberAt = (plan: Plan, x: number, y: number): number =>
  plan.chambers.findIndex((chamber) =>
    chamber.parts.some((p) => x >= p.c * TILE && x < (p.c + p.w) * TILE && y >= p.r * TILE && y < (p.r + p.h) * TILE),
  );

/** Adds enemies until nowhere in a chamber is out of their reach, so the player is never just resting. */
const fillOpenAreas = (rand: Random, plan: Plan, level: LevelDef, d: Difficulty): LevelDef => {
  let current = level;
  for (let i = 0; i < MAX_FILLS; i++) {
    const [open] = openAreas(current, MAX_OPEN_CELLS);
    if (!open) break;
    const chamber = chamberAt(plan, (open.x0 + open.x1) / 2, (open.y0 + open.y1) / 2);
    // Coins are left out of the quick check; generateLevel checks the whole level again at the end.
    const solvable = (extra: Enemy[]): boolean => {
      const grown = { ...current, coins: [], enemies: [...current.enemies, ...extra] };
      return chamber < 0 ? isSolvable(grown) : isSegmentSolvable(grown, chamber);
    };
    const made = fillerFor(rand, current, open, d, solvable);
    if (!made.length) break;
    current = { ...current, enemies: [...current.enemies, ...made] };
  }
  return current;
};

const COIN_TRIES = 3;

/** The difficulty with each of `steps` notches taken off the things that make a chamber hard to cross. */
const easedBy = (d: Difficulty, steps: number): Difficulty =>
  steps === 0
    ? d
    : {
        ...d,
        columns: Math.max(2, d.columns - steps),
        perColumn: Math.max(1, d.perColumn - steps),
        speed: d.speed * (1 - 0.08 * steps),
        lane: d.lane + 8 * steps,
        routeDots: Math.max(2, d.routeDots - steps),
        patternsPerChamber: Math.max(1, d.patternsPerChamber - steps),
      };

/** A level and whether it can be beaten; coins are the last thing placed and the last thing checked. */
const buildChecked = (seed: number, number: number, d: Difficulty): { level: LevelDef; solvable: boolean } => {
  const rand = createRandom(seed);
  const plan = planLevel(rand, d);
  const bare: LevelDef = {
    version: 1,
    number,
    seed,
    period: LEVEL_PERIOD,
    cols: COLS,
    rows: ROWS,
    tiles: tilesOf(plan),
    zones: plan.zones,
    coins: [],
    enemies: [],
  };
  // Each chamber is solved by itself, so a hard draw only costs a re-draw of that one chamber.
  const enemies: Enemy[] = [];
  plan.chambers.forEach((chamber, i) => {
    let made: Enemy[] = [];
    for (let attempt = 0; attempt < CHAMBER_TRIES; attempt++) {
      made = populateChamber(rand, chamber, easedBy(d, Math.max(0, attempt - CHAMBER_TRIES / 2)));
      if (isSegmentSolvable({ ...bare, enemies: made }, i)) break;
    }
    enemies.push(...made);
  });
  const filled = fillOpenAreas(rand, plan, { ...bare, enemies }, d);

  let level = filled;
  for (let attempt = 0; attempt < COIN_TRIES; attempt++) {
    level = { ...filled, coins: placeCoins(rand, plan, filled, d) };
    if (isSolvable(level)) return { level, solvable: true };
  }
  return { level, solvable: false };
};

export const buildLevel = (seed: number, number: number, d: Difficulty): LevelDef =>
  buildChecked(seed, number, d).level;

const EASED_AFTER = 24;
const MAX_ATTEMPTS = 40;

/** The same run seed and level number always give the same level; every level returned is solvable. */
export const generateLevel = (number: number, runSeed: number): LevelDef => {
  let last: LevelDef | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Rarely a hard draw has no solution; later attempts step the difficulty down a little.
    const eased =
      attempt < EASED_AFTER ? number : Math.max(1, Math.floor(number * (1 - (attempt - EASED_AFTER + 1) * 0.06)));
    const built = buildChecked(hashSeed(runSeed, number, attempt), number, difficultyFor(eased));
    last = built.level;
    // Fill-ins can occasionally leave a pocket; prefer a draw without one, but take a solvable one after a while.
    if (built.solvable && (attempt >= EASED_AFTER / 2 || openAreas(last, MAX_OPEN_CELLS).length === 0)) return last;
  }
  return last!;
};
