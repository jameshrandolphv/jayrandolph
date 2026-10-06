import {
  COLS,
  ENEMY_R,
  LEVEL_PERIOD,
  MAX_ENEMY_SPEED,
  PLAYER_SIZE,
  PLAYER_SPEED,
  ROWS,
  TILE,
  TILE_FLOOR,
  TILE_SAFE,
  TILE_VOID,
} from './constants';
import { difficultyFor, type Difficulty, type PatternKind } from './difficulty';
import type { Coin, Enemy, LevelDef, Point, TileRect } from './level';
import { createRandom, hashSeed, type Random } from './rng';
import { isSolvable } from './solver';

type Kind = 'safe' | 'chamber';
interface Room extends TileRect {
  kind: Kind;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Keeps enemy paths a few pixels clear of walls, so a neighbouring safe zone is never touched. */
const INSET = ENEMY_R + 4;
const PERIODS = [60, 72, 80, 90, 120, 144, 180, 240, 360, 720].filter((p) => LEVEL_PERIOD % p === 0);

const boxOf = (room: TileRect, inset = 0): Box => ({
  x0: room.c * TILE + inset,
  y0: room.r * TILE + inset,
  x1: (room.c + room.w) * TILE - inset,
  y1: (room.r + room.h) * TILE - inset,
});

/** The loop period whose speed over `distance` is closest to `speed`, without exceeding the cap. */
const pickPeriod = (distance: number, speed: number): number => {
  const target = distance / speed;
  let best = PERIODS[PERIODS.length - 1]!;
  let bestError = Infinity;
  for (const period of PERIODS) {
    if (distance / period > MAX_ENEMY_SPEED) continue;
    const error = Math.abs(period - target);
    if (error < bestError) {
      best = period;
      bestError = error;
    }
  }
  return best;
};

const near = (a: TileRect, b: TileRect, gap: number): boolean =>
  a.c - gap < b.c + b.w && b.c - gap < a.c + a.w && a.r - gap < b.r + b.h && b.r - gap < a.r + a.h;

const attach = (rand: Random, prev: TileRect, w: number, h: number, connector: number): TileRect => {
  const dir = rand.pick(['right', 'right', 'right', 'down', 'down', 'up', 'up', 'left'] as const);
  if (dir === 'right' || dir === 'left') {
    const share = Math.min(connector, h, prev.h);
    return {
      c: dir === 'right' ? prev.c + prev.w : prev.c - w,
      r: rand.int(prev.r - h + share, prev.r + prev.h - share),
      w,
      h,
    };
  }
  const share = Math.min(connector, w, prev.w);
  return {
    c: rand.int(prev.c - w + share, prev.c + prev.w - share),
    r: dir === 'down' ? prev.r + prev.h : prev.r - h,
    w,
    h,
  };
};

const layoutRooms = (rand: Random, d: Difficulty, shrink: number): Room[] | null => {
  const rooms: Room[] = [];
  const { chamber } = d;
  for (let i = 0; i < d.segments * 2 + 1; i++) {
    const kind: Kind = i % 2 === 0 ? 'safe' : 'chamber';
    let placed: Room | null = null;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      const w = kind === 'safe' ? rand.int(3, 4) : rand.int(Math.max(3, chamber.minW - shrink), Math.max(4, chamber.maxW - shrink));
      const h = kind === 'safe' ? rand.int(3, 5) : rand.int(Math.max(3, chamber.minH - shrink), Math.max(4, chamber.maxH - shrink));
      const base = i === 0 ? { c: rand.int(1, 4), r: rand.int(1, ROWS - 1 - h), w, h } : attach(rand, rooms[i - 1]!, w, h, d.connector);
      const inBounds = base.c >= 1 && base.r >= 1 && base.c + base.w <= COLS - 1 && base.r + base.h <= ROWS - 1;
      if (inBounds && rooms.every((other, idx) => idx === i - 1 || !near(base, other, 1))) placed = { ...base, kind };
    }
    if (!placed) return null;
    rooms.push(placed);
  }
  return rooms;
};

const FALLBACK: readonly Room[] = [
  { c: 1, r: 5, w: 3, h: 3, kind: 'safe' },
  { c: 4, r: 3, w: 12, h: 7, kind: 'chamber' },
  { c: 16, r: 5, w: 3, h: 3, kind: 'safe' },
];

const sweeps = (rand: Random, box: Box, d: Difficulty, vertical: boolean): Enemy[] => {
  const inner = { x0: box.x0 + INSET, y0: box.y0 + INSET, x1: box.x1 - INSET, y1: box.y1 - INSET };
  const [lo, hi, from, to] = vertical ? [inner.x0, inner.x1, inner.y0, inner.y1] : [inner.y0, inner.y1, inner.x0, inner.x1];
  const spacing = 2 * ENEMY_R + PLAYER_SIZE + d.lane;
  const lanes = Math.max(1, Math.min(d.columns, Math.floor((hi - lo) / spacing)));
  const perLane = Math.max(1, Math.min(d.perColumn, Math.floor((to - from) / (2 * (PLAYER_SIZE + 2 * ENEMY_R)))));
  const period = pickPeriod(2 * (to - from), d.speed * rand.range(0.85, 1.15));
  const base = rand.int(0, period - 1);
  const out: Enemy[] = [];
  for (let i = 0; i < lanes; i++) {
    const across = lo + ((i + 0.5) * (hi - lo)) / lanes;
    for (let j = 0; j < perLane; j++) {
      const phase = Math.round(base + (i % 2 ? period / 2 : 0) + (j * period) / perLane);
      out.push(
        vertical
          ? { kind: 'sweep', ax: across, ay: from, bx: across, by: to, period, phase }
          : { kind: 'sweep', ax: from, ay: across, bx: to, by: across, period, phase },
      );
    }
  }
  return out;
};

/**
 * Free width needed between dots on a moving ring or belt: while the player crosses it, the gap
 * itself travels `tangential` px per tick, so faster belts need wider gaps.
 */
const crossingSpacing = (d: Difficulty, tangential: number): number =>
  (2 * ENEMY_R + PLAYER_SIZE) * (1 + tangential / PLAYER_SPEED) + d.lane;

const orbits = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const reach = Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2 - INSET;
  const lanes = 2 * ENEMY_R + PLAYER_SIZE + d.lane;
  const out: Enemy[] = [];
  let dir: 1 | -1 = rand.chance(0.5) ? 1 : -1;
  for (let ring = 0; ring < d.rings; ring++) {
    const radius = reach - ring * lanes;
    if (radius < 40) break;
    const circumference = 2 * Math.PI * radius;
    const period = pickPeriod(circumference, d.speed * 0.8);
    const dots = Math.min(d.orbitDots + ring, Math.floor(circumference / crossingSpacing(d, circumference / period)));
    if (dots < 2) break;
    const base = rand.int(0, period - 1);
    for (let j = 0; j < dots; j++) {
      out.push({ kind: 'orbit', cx, cy, radius, period, phase: Math.round(base + (j * period) / dots), dir });
    }
    dir = dir === 1 ? -1 : 1;
  }
  return out;
};

const loops = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
  const margin = INSET + rand.int(0, 1) * TILE;
  const x = box.x0 + margin;
  const y = box.y0 + margin;
  const w = box.x1 - box.x0 - 2 * margin;
  const h = box.y1 - box.y0 - 2 * margin;
  if (w < 60 || h < 60) return [];
  const perimeter = 2 * (w + h);
  const period = pickPeriod(perimeter, d.speed * 0.8);
  const dots = Math.min(d.loopDots, Math.floor(perimeter / crossingSpacing(d, perimeter / period)));
  if (dots < 2) return [];
  const base = rand.int(0, period - 1);
  const dir: 1 | -1 = rand.chance(0.5) ? 1 : -1;
  return Array.from({ length: dots }, (_, j) => ({
    kind: 'loop' as const,
    x,
    y,
    w,
    h,
    period,
    phase: Math.round(base + (j * period) / dots),
    dir,
  }));
};

/** Free strip left between patterns that share a chamber, wide enough for the player to wait in. */
const REST = 72;
const MIN_PART = 3 * TILE;

/** Splits a chamber along its long side so each pattern has its own stretch with a resting strip between. */
const splitBox = (box: Box, wanted: number): Box[] => {
  const horizontal = box.x1 - box.x0 >= box.y1 - box.y0;
  const length = horizontal ? box.x1 - box.x0 : box.y1 - box.y0;
  const count = Math.max(1, Math.min(wanted, Math.floor((length + REST) / (MIN_PART + REST))));
  const size = (length - (count - 1) * REST) / count;
  return Array.from({ length: count }, (_, i) => {
    const start = i * (size + REST);
    return horizontal
      ? { x0: box.x0 + start, x1: box.x0 + start + size, y0: box.y0, y1: box.y1 }
      : { x0: box.x0, x1: box.x1, y0: box.y0 + start, y1: box.y0 + start + size };
  });
};

const populate = (rand: Random, kind: PatternKind, box: Box, d: Difficulty): Enemy[] => {
  switch (kind) {
    case 'sweepV':
      return sweeps(rand, box, d, true);
    case 'sweepH':
      return sweeps(rand, box, d, false);
    case 'orbit':
      return orbits(rand, box, d);
    case 'loop':
      return loops(rand, box, d);
  }
};

const placeCoins = (rand: Random, chambers: readonly Room[], count: number): Coin[] => {
  const coins: Coin[] = [];
  for (let i = 0; i < count; i++) {
    const segment = i % chambers.length;
    const box = boxOf(chambers[segment]!, 28);
    let spot: Point = { x: 0, y: 0 };
    for (let attempt = 0; attempt < 20; attempt++) {
      spot = { x: rand.range(box.x0, box.x1), y: rand.range(box.y0, box.y1) };
      if (coins.every((c) => Math.hypot(c.x - spot.x, c.y - spot.y) >= 90)) break;
    }
    coins.push({ ...spot, segment });
  }
  return coins;
};

export const buildLevel = (seed: number, number: number, d: Difficulty): LevelDef => {
  const rand = createRandom(seed);
  let rooms: Room[] | null = null;
  for (let attempt = 0; attempt < 30 && !rooms; attempt++) rooms = layoutRooms(rand, d, Math.floor(attempt / 10));
  rooms ??= FALLBACK.map((r) => ({ ...r }));
  const segments = (rooms.length - 1) / 2;

  const tiles = new Array<number>(COLS * ROWS).fill(TILE_VOID);
  for (const room of rooms) {
    for (let r = room.r; r < room.r + room.h; r++) {
      for (let c = room.c; c < room.c + room.w; c++) tiles[r * COLS + c] = room.kind === 'safe' ? TILE_SAFE : TILE_FLOOR;
    }
  }

  const chambers = rooms.filter((r) => r.kind === 'chamber');
  const enemies: Enemy[] = [];
  for (const chamber of chambers) {
    let placed = 0;
    const kinds = [...d.patterns];
    for (const part of splitBox(boxOf(chamber), d.patternsPerChamber)) {
      while (kinds.length) {
        const [kind] = kinds.splice(rand.int(0, kinds.length - 1), 1);
        const made = populate(rand, kind!, part, d);
        if (made.length) {
          enemies.push(...made);
          placed++;
          break;
        }
      }
    }
    if (!placed) enemies.push(...sweeps(rand, boxOf(chamber), d, true));
  }

  return {
    version: 1,
    number,
    seed,
    period: LEVEL_PERIOD,
    cols: COLS,
    rows: ROWS,
    tiles,
    zones: rooms.filter((r) => r.kind === 'safe').map(({ c, r, w, h }) => ({ c, r, w, h })),
    coins: segments > 0 ? placeCoins(rand, chambers, d.coins) : [],
    enemies,
  };
};

const EASED_AFTER = 24;
const MAX_ATTEMPTS = 40;

/** The same run seed and level number always give the same level; every level returned is solvable. */
export const generateLevel = (number: number, runSeed: number): LevelDef => {
  let last: LevelDef | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Rarely a hard draw has no solution; later attempts step the difficulty down a little.
    const eased = attempt < EASED_AFTER ? number : Math.max(1, Math.floor(number * (1 - (attempt - EASED_AFTER + 1) * 0.06)));
    last = buildLevel(hashSeed(runSeed, number, attempt), number, difficultyFor(eased));
    if (isSolvable(last)) return last;
  }
  return last!;
};
