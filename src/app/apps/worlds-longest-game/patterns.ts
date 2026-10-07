import { ENEMY_R, LEVEL_PERIOD, MAX_ENEMY_SPEED, PLAYER_SIZE, PLAYER_SPEED, TILE } from './constants';
import type { Difficulty, PatternKind } from './difficulty';
import { routeLength, type Enemy, type Point, type TileRect } from './level';
import type { Random } from './rng';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Keeps enemy paths a few pixels clear of walls, so a neighbouring safe zone is never touched. */
export const INSET = ENEMY_R + 4;

/** Centres of the checkerboard squares lying between two coordinates, which straight-running enemies stay on. */
export const centresIn = (lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let k = Math.ceil(lo / TILE - 0.5); (k + 0.5) * TILE <= hi; k++) out.push((k + 0.5) * TILE);
  return out;
};
const PERIODS = [60, 72, 80, 90, 120, 144, 180, 240, 360, 720].filter((p) => LEVEL_PERIOD % p === 0);

export const boxOf = (room: TileRect, inset = 0): Box => ({
  x0: room.c * TILE + inset,
  y0: room.r * TILE + inset,
  x1: (room.c + room.w) * TILE - inset,
  y1: (room.r + room.h) * TILE - inset,
});

/** The loop period whose speed over `distance` is closest to `speed`, without exceeding the cap. */
export const pickPeriod = (distance: number, speed: number): number => {
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

/**
 * Lane positions across a sweep, on tile centres. Each lane holds a single dot, so dots in opposite
 * phase sit on neighbouring tiles instead of crossing within one. Lanes come in pairs on adjacent
 * tiles, with a free tile between pairs so the player has somewhere to stand.
 */
const laneCentres = (lo: number, hi: number, wanted: number): number[] => {
  const first = Math.ceil(lo / TILE - 0.5);
  const tiles = Math.floor(hi / TILE - 0.5) - first + 1;
  if (tiles < 2) return [(first + 0.5) * TILE];
  const pairs = Math.max(1, Math.min(Math.ceil(wanted / 2), Math.floor((tiles + 1) / 3)));
  const out: number[] = [];
  const slack = tiles - (3 * pairs - 1);
  for (let p = 0; p < pairs; p++) {
    const start = first + 3 * p + Math.round((slack * (p + 0.5)) / pairs);
    out.push((start + 0.5) * TILE, (start + 1.5) * TILE);
  }
  return out.slice(0, Math.max(wanted, 2));
};

/** Sweeps across a box in lanes; `sync` sends every lane off together, `wave` staggers them in a line. */
export const sweeps = (
  rand: Random,
  box: Box,
  d: Difficulty,
  vertical: boolean,
  mode: 'pairs' | 'sync' | 'wave' = 'pairs',
): Enemy[] => {
  const inner = { x0: box.x0 + INSET, y0: box.y0 + INSET, x1: box.x1 - INSET, y1: box.y1 - INSET };
  const [lo, hi, from, to] = vertical
    ? [inner.x0, inner.x1, inner.y0, inner.y1]
    : [inner.y0, inner.y1, inner.x0, inner.x1];
  const perColumn = Math.max(1, Math.min(d.perColumn, Math.floor((to - from) / (2 * (PLAYER_SIZE + 2 * ENEMY_R)))));
  const centres = laneCentres(lo, hi, d.columns * perColumn);
  const pairs = Math.ceil(centres.length / 2);
  const period = pickPeriod(2 * (to - from), d.speed * rand.range(0.85, 1.15));
  const base = rand.int(0, period - 1);
  return centres.map((across, i): Enemy => {
    // The two lanes of a pair run half a cycle apart; successive pairs are staggered between them.
    const phase =
      mode === 'sync'
        ? base
        : mode === 'wave'
          ? Math.round(base + (i * period) / (2 * centres.length))
          : Math.round(base + (i % 2 ? period / 2 : 0) + (Math.floor(i / 2) * period) / (2 * pairs));
    return vertical
      ? { kind: 'sweep', ax: across, ay: from, bx: across, by: to, period, phase }
      : { kind: 'sweep', ax: from, ay: across, bx: to, by: across, period, phase };
  });
};

/**
 * Free width needed between dots on a moving ring or belt: while the player crosses it, the gap
 * itself travels `tangential` px per tick, so faster belts need wider gaps.
 */
const crossingSpacing = (d: Difficulty, tangential: number): number =>
  (2 * ENEMY_R + PLAYER_SIZE) * (1 + tangential / PLAYER_SPEED) + d.lane;

export const orbits = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
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
      out.push({
        kind: 'orbit',
        cx,
        cy,
        radius,
        period,
        phase: Math.round(base + (j * period) / dots),
        dir,
      });
    }
    dir = dir === 1 ? -1 : 1;
  }
  return out;
};

export const loops = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
  const margin = INSET + rand.int(0, 1) * TILE;
  const xs = centresIn(box.x0 + margin, box.x1 - margin);
  const ys = centresIn(box.y0 + margin, box.y1 - margin);
  if (xs.length < 2 || ys.length < 2) return [];
  const x = xs[0]!;
  const y = ys[0]!;
  const w = xs[xs.length - 1]! - x;
  const h = ys[ys.length - 1]! - y;
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

/** Dots this far apart touch, so a line of them is a solid bar. */
export const BAR_STEP = 2 * ENEMY_R;

/** A bar pivoting about the middle of the box, with one or two arms. */
export const spinners = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const reach = Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2 - INSET;
  if (reach < 3 * BAR_STEP) return [];
  const period = pickPeriod(2 * Math.PI * reach, d.speed * 0.7);
  const base = rand.int(0, period - 1);
  const dir: 1 | -1 = rand.chance(0.5) ? 1 : -1;
  const arms = rand.int(1, 2);
  const out: Enemy[] = [{ kind: 'orbit', cx, cy, radius: 0, period, phase: base, dir }];
  for (let arm = 0; arm < arms; arm++) {
    const phase = Math.round(base + (arm * period) / arms);
    for (let radius = BAR_STEP; radius <= reach; radius += BAR_STEP)
      out.push({ kind: 'orbit', cx, cy, radius, period, phase, dir });
  }
  return out;
};

/** A bar hanging from one wall of the box and swinging back and forth like a pendulum. */
export const swings = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
  const side = rand.pick(['top', 'bottom', 'left', 'right'] as const);
  const vertical = side === 'top' || side === 'bottom';
  const cx = side === 'left' ? box.x0 + INSET : side === 'right' ? box.x1 - INSET : (box.x0 + box.x1) / 2;
  const cy = side === 'top' ? box.y0 + INSET : side === 'bottom' ? box.y1 - INSET : (box.y0 + box.y1) / 2;
  const heading = { top: Math.PI / 2, bottom: -Math.PI / 2, left: 0, right: Math.PI }[side];
  const depth = (vertical ? box.y1 - box.y0 : box.x1 - box.x0) - 2 * INSET;
  const across = (vertical ? box.x1 - box.x0 : box.y1 - box.y0) / 2 - INSET;
  const amp = rand.range(0.9, 1.3);
  const length = Math.min(depth, across / Math.sin(amp));
  if (length < 3 * BAR_STEP) return [];
  // The peak speed is at the bottom of the swing: 2π · amp · length per period.
  const period = pickPeriod(2 * Math.PI * amp * length, d.speed * 1.1);
  const phase = rand.int(0, period - 1);
  const out: Enemy[] = [];
  for (let radius = 0; radius <= length; radius += BAR_STEP)
    out.push({ kind: 'swing', cx, cy, radius, heading, amp, period, phase });
  return out;
};

/** Free strip left between patterns that share a chamber, wide enough for the player to wait in. */
const REST = 72;
const MIN_PART = 3 * TILE;

/** Splits a chamber along its long side so each pattern has its own stretch with a resting strip between. */
export const splitBox = (box: Box, wanted: number): Box[] => {
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

const inset = (box: Box, by: number): Box => ({
  x0: box.x0 + by,
  y0: box.y0 + by,
  x1: box.x1 - by,
  y1: box.y1 - by,
});

/** Evenly spaced start phases for `count` dots sharing one path. */
const spread = (base: number, period: number, count: number, index: number): number =>
  Math.round(base + (index * period) / count);

/** A bar of dots with `arms` arms turning about a point, starting with a dot on the pivot itself. */
const wheel = (
  cx: number,
  cy: number,
  reach: number,
  arms: number,
  dir: 1 | -1,
  period: number,
  phase: number,
): Enemy[] => {
  const out: Enemy[] = [{ kind: 'orbit', cx, cy, radius: 0, period, phase, dir }];
  for (let arm = 0; arm < arms; arm++) {
    for (let radius = BAR_STEP; radius <= reach; radius += BAR_STEP) {
      out.push({
        kind: 'orbit',
        cx,
        cy,
        radius,
        period,
        phase: Math.round(phase + (arm * period) / arms),
        dir,
      });
    }
  }
  return out;
};

/** A row of small turning crosses, alternately clockwise and not, with room to slip between them. */
export const pinwheels = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const horizontal = w >= h;
  const reach = Math.min(Math.min(w, h) / 2 - INSET, rand.pick([2, 3]) * BAR_STEP);
  if (reach < 2 * BAR_STEP) return [];
  const pitch = 2 * reach + PLAYER_SIZE + 2 * ENEMY_R + d.lane + 24;
  const length = horizontal ? w : h;
  const first = reach + INSET;
  const count = Math.min(3, Math.max(1, Math.floor((length - 2 * first) / pitch) + 1));
  if (length < 2 * first) return [];
  const period = pickPeriod(2 * Math.PI * reach, d.speed * 0.7);
  const base = rand.int(0, period - 1);
  const arms = rand.pick([1, 2, 2, 3]);
  const out: Enemy[] = [];
  for (let k = 0; k < count; k++) {
    const along = count === 1 ? length / 2 : first + ((length - 2 * first) * k) / (count - 1);
    const cx = horizontal ? box.x0 + along : (box.x0 + box.x1) / 2;
    const cy = horizontal ? (box.y0 + box.y1) / 2 : box.y0 + along;
    out.push(...wheel(cx, cy, reach, arms, k % 2 ? -1 : 1, period, spread(base, period, arms * 2, k)));
  }
  return out;
};

/** Thin conveyor loops, two lanes of dots going opposite ways; a squarish box gets a pair crossing each other. */
export const streams = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const out: Enemy[] = [];
  const lay = (horizontal: boolean): void => {
    const [a0, a1, c0, c1] = horizontal ? [box.x0, box.x1, box.y0, box.y1] : [box.y0, box.y1, box.x0, box.x1];
    // Both lanes of the belt run down the middles of neighbouring squares.
    const lanes = centresIn(c0 + INSET, c1 - INSET);
    const ends = centresIn(a0 + INSET, a1 - INSET);
    if (lanes.length < 2 || ends.length < 2) return;
    const start = ends[0]!;
    const run = ends[ends.length - 1]! - start;
    if (run < 160) return;
    const across = lanes[rand.int(0, lanes.length - 2)]!;
    const perimeter = 2 * (run + TILE);
    const period = pickPeriod(perimeter, d.speed * 0.8);
    const dots = Math.min(10, Math.floor(perimeter / (1.5 * crossingSpacing(d, perimeter / period))));
    if (dots < 3) return;
    const base = rand.int(0, period - 1);
    const dir: 1 | -1 = rand.chance(0.5) ? 1 : -1;
    for (let j = 0; j < dots; j++) {
      const rect = horizontal ? { x: start, y: across, w: run, h: TILE } : { x: across, y: start, w: TILE, h: run };
      out.push({ kind: 'loop', ...rect, period, phase: spread(base, period, dots, j), dir });
    }
  };
  const squarish = Math.max(w, h) < 1.5 * Math.min(w, h);
  if (squarish) {
    lay(true);
    lay(false);
  } else lay(w >= h);
  return out;
};

/** Lines of dots running corner to corner: one diagonal, or two crossing in an X. */
export const diagonals = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
  const { x0, y0, x1, y1 } = inset(box, INSET);
  if (Math.min(x1 - x0, y1 - y0) < 100) return [];
  const flip = rand.chance(0.5);
  const lines: [Point, Point][] = [
    [
      { x: x0, y: flip ? y1 : y0 },
      { x: x1, y: flip ? y0 : y1 },
    ],
  ];
  if (rand.chance(0.6))
    lines.push([
      { x: x0, y: flip ? y0 : y1 },
      { x: x1, y: flip ? y1 : y0 },
    ]);
  const out: Enemy[] = [];
  for (const [a, b] of lines) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const period = pickPeriod(2 * length, d.speed * rand.range(0.85, 1.1));
    const dots = Math.max(
      2,
      Math.min(d.routeDots + 1, Math.floor(length / (crossingSpacing(d, (2 * length) / period) * 0.8))),
    );
    const base = rand.int(0, period - 1);
    for (let j = 0; j < dots; j++)
      out.push({
        kind: 'sweep',
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        period,
        phase: spread(base, period, dots, j),
      });
  }
  return out;
};

/**
 * Walls of touching dots across a box, a few squares apart, each with a two-square doorway. Some walls
 * stay put; others shuffle one square to and fro, doorway and all.
 */
export const walls = (rand: Random, box: Box, d: Difficulty): Enemy[] => {
  const standing = box.x1 - box.x0 >= box.y1 - box.y0;
  const [a0, a1, c0, c1] = standing ? [box.x0, box.x1, box.y0, box.y1] : [box.y0, box.y1, box.x0, box.x1];
  const spanLo = c0 + INSET;
  const spanHi = c1 - INSET;
  const doorways: number[] = [];
  for (let at = Math.ceil((spanLo + TILE) / TILE) * TILE; at <= spanHi - TILE; at += TILE) doorways.push(at);
  const places = centresIn(a0 + INSET, a1 - INSET - TILE);
  if (spanHi - spanLo < 5 * TILE - 2 * INSET || !doorways.length || !places.length) return [];

  // A wall is a lot of dots, so early levels get fewer of them.
  const count = Math.min(3, Math.max(1, Math.floor(d.columns / 2)));
  const out: Enemy[] = [];
  const moves = rand.chance(0.4);
  const period = pickPeriod(2 * TILE, d.speed * 0.5);
  const base = rand.int(0, period - 1);
  let door = rand.pick(doorways);
  for (let k = rand.int(0, 1); k < places.length && k < 3 * count; k += 3) {
    // The next doorway is never straight across from the last, where there is a choice.
    const others = doorways.filter((at) => Math.abs(at - door) >= 2 * TILE);
    door = k === 0 || !others.length ? door : rand.pick(others);
    const along = places[k]!;
    const phase = spread(base, period, 3, k / 3);
    // Moving dots must run down the middles of squares, so a moving wall is a row of dots a square apart.
    const ats: number[] = [];
    if (moves) ats.push(...centresIn(spanLo, spanHi));
    else for (let s = spanLo; s <= spanHi + 0.01; s += BAR_STEP) ats.push(s);
    for (const at of ats) {
      if (Math.abs(at - door) < (moves ? TILE / 2 + 1 : TILE)) continue;
      const [x, y] = standing ? [along, at] : [at, along];
      const [bx, by] = moves ? (standing ? [x + TILE, y] : [x, y + TILE]) : [x, y];
      out.push({
        kind: 'sweep',
        ax: x,
        ay: y,
        bx,
        by,
        period: moves ? period : LEVEL_PERIOD,
        phase: moves ? phase : 0,
      });
    }
  }
  return out;
};

/** A snaking route up and down (or along and back) a box, rows two tiles apart. */
export const zigzag = (box: Box): Point[] => {
  const { x0, y0, x1, y1 } = inset(box, INSET);
  const lengthwise = x1 - x0 >= y1 - y0;
  const [a0, a1, c0, c1] = lengthwise ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  // Every straight stretch runs down the middles of squares, rows two squares apart.
  const ends = centresIn(a0, a1);
  const rows = centresIn(c0, c1).filter((_, k) => k % 2 === 0);
  if (rows.length < 2 || ends.length < 3) return [];
  const points: Point[] = [];
  rows.forEach((across, r) => {
    const [from, to] = r % 2 === 0 ? [ends[0]!, ends[ends.length - 1]!] : [ends[ends.length - 1]!, ends[0]!];
    points.push(
      lengthwise ? { x: from, y: across } : { x: across, y: from },
      lengthwise ? { x: to, y: across } : { x: across, y: to },
    );
  });
  return points;
};

/** The polyline with `by` px taken off its start; assumes it is longer than that. */
const clipStart = (points: readonly Point[], by: number): Point[] => {
  let left = by;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left < length)
      return [{ x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length }, ...points.slice(i)];
    left -= length;
  }
  return points.slice(-1);
};

/** Dots patrolling a long route end to end, spaced so there is always somewhere to be. The ends of a route sit against safe zones, so they are pulled in. */
export const trace = (rand: Random, fullRoute: readonly Point[], d: Difficulty): Enemy[] => {
  if (routeLength(fullRoute, false) < 2 * INSET + 240) return [];
  let route = clipStart(clipStart(fullRoute, INSET).reverse(), INSET).reverse();
  // There and back must fit in one level period at about the wanted speed, so a very long route is cut short.
  const longest = (d.speed * LEVEL_PERIOD * 1.15) / 2;
  if (routeLength(route, false) > longest)
    route = clipStart([...route].reverse(), routeLength(route, false) - longest).reverse();
  const total = routeLength(route, false);
  if (total < 240) return [];
  const dots = Math.min(d.routeDots, Math.floor(total / (crossingSpacing(d, d.speed) * 1.4)));
  if (dots < 2) return [];
  const period = pickPeriod(2 * total, d.speed * rand.range(0.85, 1.1));
  const base = rand.int(0, period - 1);
  return Array.from({ length: dots }, (_, j): Enemy => ({
    kind: 'route',
    points: route.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })),
    closed: false,
    period,
    phase: spread(base, period, dots, j),
    dir: 1,
  }));
};

export const populate = (rand: Random, kind: PatternKind, box: Box, d: Difficulty): Enemy[] => {
  switch (kind) {
    case 'sweepV':
      return sweeps(rand, box, d, true);
    case 'sweepH':
      return sweeps(rand, box, d, false);
    case 'unison':
      return sweeps(rand, box, d, rand.chance(0.5), rand.pick(['sync', 'wave'] as const));
    case 'orbit':
      return orbits(rand, box, d);
    case 'loop':
      return loops(rand, box, d);
    case 'spinner':
      return spinners(rand, box, d);
    case 'swing':
      return swings(rand, box, d);
    case 'pinwheel':
      return pinwheels(rand, box, d);
    case 'streams':
      return streams(rand, box, d);
    case 'diagonal':
      return diagonals(rand, box, d);
    case 'wall':
      return walls(rand, box, d);
    case 'trace':
      return trace(rand, zigzag(box), d);
  }
};
