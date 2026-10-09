import { COLS, ROWS, TILE, TILE_FLOOR, TILE_SAFE, TILE_VOID } from './constants';
import type { Difficulty, LayoutKind } from './difficulty';
import type { Point, TileRect } from './level';
import type { Random } from './rng';

/** One stretch of floor between two safe zones; it may be a single room or a more complicated shape. */
export interface Chamber {
  /** Rectangles that together make up the floor, never overlapping a safe zone. */
  parts: TileRect[];
  /** A line through the middle of a winding chamber, from one safe zone to the next. */
  route?: Point[];
  /** Dead ends worth tucking a coin into. */
  nooks?: Point[];
  /** The side branches those dead ends are the ends of, in the same order; they lead nowhere, so only a coin gives them a purpose. */
  branches?: TileRect[];
}

export interface Plan {
  /** Start, then checkpoints, then the goal. Chamber `i` joins zone `i` to zone `i + 1`. */
  zones: TileRect[];
  chambers: Chamber[];
  /** Whether coins are laid out in a grid rather than scattered. */
  grid: boolean;
}

const ZONE_SIZES = [
  [2, 2],
  [2, 2],
  [2, 3],
  [3, 2],
] as const;
const ZONE_LENGTH = 2;

const overlaps = (a: TileRect, b: TileRect, gap: number): boolean =>
  a.c - gap < b.c + b.w && b.c - gap < a.c + a.w && a.r - gap < b.r + b.h && b.r - gap < a.r + a.h;

const swapAxes = (rect: TileRect): TileRect => ({ c: rect.r, r: rect.c, w: rect.h, h: rect.w });
const swapPoint = (p: Point): Point => ({ x: p.y, y: p.x });

const transposed = (plan: Plan): Plan => ({
  grid: plan.grid,
  zones: plan.zones.map(swapAxes),
  chambers: plan.chambers.map((chamber) => ({
    parts: chamber.parts.map(swapAxes),
    ...(chamber.route && { route: chamber.route.map(swapPoint) }),
    ...(chamber.nooks && { nooks: chamber.nooks.map(swapPoint) }),
    ...(chamber.branches && { branches: chamber.branches.map(swapAxes) }),
  })),
});

/** Row-major tiles of a plan: chamber floor, with the safe zones laid over it. */
export const tilesOf = (plan: Plan): number[] => {
  const tiles = new Array<number>(COLS * ROWS).fill(TILE_VOID);
  const paint = (rect: TileRect, tile: number): void => {
    for (let r = rect.r; r < rect.r + rect.h; r++) {
      for (let c = rect.c; c < rect.c + rect.w; c++) {
        if (c >= 0 && r >= 0 && c < COLS && r < ROWS) tiles[r * COLS + c] = tile;
      }
    }
  };
  for (const chamber of plan.chambers) for (const part of chamber.parts) paint(part, TILE_FLOOR);
  for (const zone of plan.zones) paint(zone, TILE_SAFE);
  return tiles;
};

const inField = (rect: TileRect): boolean =>
  rect.w > 0 && rect.h > 0 && rect.c >= 1 && rect.r >= 1 && rect.c + rect.w <= COLS - 1 && rect.r + rect.h <= ROWS - 1;

/**
 * Whether every chamber is a single connected piece of floor that touches its own two safe zones and
 * nothing else, which is what the solver and the checkpoint rules rely on.
 */
export const isValidPlan = (plan: Plan): boolean => {
  if (plan.zones.length !== plan.chambers.length + 1) return false;
  if (!plan.zones.every(inField) || !plan.chambers.every((c) => c.parts.length > 0 && c.parts.every(inField)))
    return false;
  for (let i = 0; i < plan.zones.length; i++) {
    for (let j = i + 1; j < plan.zones.length; j++) if (overlaps(plan.zones[i]!, plan.zones[j]!, 0)) return false;
  }

  const tiles = tilesOf(plan);
  const zoneOf = (c: number, r: number): number =>
    plan.zones.findIndex((z) => c >= z.c && c < z.c + z.w && r >= z.r && r < z.r + z.h);
  const label = new Int32Array(COLS * ROWS).fill(-1);
  const touched: Set<number>[] = [];
  for (let start = 0; start < tiles.length; start++) {
    if (tiles[start] !== TILE_FLOOR || label[start] !== -1) continue;
    const id = touched.length;
    const zones = new Set<number>();
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const at = stack.pop()!;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const c = (at % COLS) + dc;
        const r = Math.floor(at / COLS) + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const next = r * COLS + c;
        if (tiles[next] === TILE_SAFE) zones.add(zoneOf(c, r));
        else if (tiles[next] === TILE_FLOOR && label[next] === -1) {
          label[next] = id;
          stack.push(next);
        }
      }
    }
    touched.push(zones);
  }
  if (touched.length !== plan.chambers.length) return false;

  const used = new Set<number>();
  return plan.chambers.every((chamber, i) => {
    const ids = new Set<number>();
    for (const part of chamber.parts) {
      for (let r = part.r; r < part.r + part.h; r++) {
        for (let c = part.c; c < part.c + part.w; c++)
          if (tiles[r * COLS + c] === TILE_FLOOR) ids.add(label[r * COLS + c]!);
      }
    }
    if (ids.size !== 1) return false;
    const [id] = ids;
    const zones = touched[id!]!;
    if (used.has(id!) || zones.size !== 2 || !zones.has(i) || !zones.has(i + 1)) return false;
    used.add(id!);
    return true;
  });
};

type Kind = 'safe' | 'chamber';
interface Room extends TileRect {
  kind: Kind;
}

/** A new room butted against the previous one, sharing at least `connector` tiles of edge where it can. */
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

const HALL = { minW: 11, maxW: 16, minH: 6, maxH: 9 };

const layoutRooms = (rand: Random, d: Difficulty, hall: boolean, shrink: number): Room[] | null => {
  const rooms: Room[] = [];
  const chamber = hall ? HALL : d.chamber;
  const count = (hall ? 1 : d.segments) * 2 + 1;
  for (let i = 0; i < count; i++) {
    const kind: Kind = i % 2 === 0 ? 'safe' : 'chamber';
    let placed: Room | null = null;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      const [zw, zh] = rand.pick(ZONE_SIZES);
      const w = kind === 'safe' ? zw : rand.int(Math.max(3, chamber.minW - shrink), Math.max(4, chamber.maxW - shrink));
      const h = kind === 'safe' ? zh : rand.int(Math.max(3, chamber.minH - shrink), Math.max(4, chamber.maxH - shrink));
      const base =
        i === 0
          ? { c: rand.int(1, 4), r: rand.int(1, ROWS - 1 - h), w, h }
          : attach(rand, rooms[i - 1]!, w, h, d.connector);
      const inBounds = base.c >= 1 && base.r >= 1 && base.c + base.w <= COLS - 1 && base.r + base.h <= ROWS - 1;
      if (inBounds && rooms.every((other, idx) => idx === i - 1 || !overlaps(base, other, 1)))
        placed = { ...base, kind };
    }
    if (!placed) return null;
    rooms.push(placed);
  }
  return rooms;
};

const planOfRooms = (rooms: readonly Room[], grid: boolean): Plan => ({
  grid,
  zones: rooms.filter((r) => r.kind === 'safe').map(({ c, r, w, h }) => ({ c, r, w, h })),
  chambers: rooms.filter((r) => r.kind === 'chamber').map(({ c, r, w, h }) => ({ parts: [{ c, r, w, h }] })),
});

/** What a level is made of when no layout could be drawn. */
export const FALLBACK: Plan = {
  grid: false,
  zones: [
    { c: 1, r: 5, w: 2, h: 3 },
    { c: 17, r: 5, w: 2, h: 3 },
  ],
  chambers: [{ parts: [{ c: 3, r: 3, w: 14, h: 7 }] }],
};

/** Rooms in a chain, each attached to the last at a random side. */
const chain = (rand: Random, d: Difficulty, hall: boolean): Plan | null => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const rooms = layoutRooms(rand, d, hall, Math.floor(attempt / 10));
    if (rooms) return planOfRooms(rooms, hall);
  }
  return null;
};

/** The tile columns [from, to) of a stretch of a straight corridor. */
interface Run {
  from: number;
  to: number;
  /** Index into the plan's zones if this stretch is a safe zone. */
  zone?: number;
}

/**
 * A corridor that doubles back on itself: parallel legs joined at alternating ends, with safe zones at
 * both ends and a checkpoint in the middle of a leg for each extra segment. Drawn lying down and
 * turned onto its side some of the time.
 */
const winding = (rand: Random, d: Difficulty): Plan | null => {
  const vertical = rand.chance(0.3);
  const across = vertical ? COLS : ROWS;
  const along = vertical ? ROWS : COLS;
  const segments = d.segments;
  const legs = rand.int(Math.max(2, segments), Math.max(2, d.legs));
  if (legs < segments) return null;
  const thick = 4 * legs - 1 <= across - 2 ? rand.pick([2, 3, 3, 3]) : 2;
  const span = legs * thick + legs - 1;
  // Several checkpoints in corridors only two tiles wide leave nowhere to dodge.
  if (span > across - 2 || (thick < 3 && segments > 2)) return null;
  const join = Math.min(thick, rand.pick([2, 3]));
  const shortest = segments > 1 ? 12 : 9;
  if (along - 2 < shortest) return null;
  const len = rand.int(shortest, along - 2);
  const x0 = rand.int(1, along - 1 - len);
  const y0 = rand.int(1, across - 1 - span);
  const rowOf = (i: number): number => y0 + i * (thick + 1);
  const heading = (i: number): 1 | -1 => (i % 2 === 0 ? 1 : -1);

  // Safe zones: the start, a checkpoint mid-leg for each extra segment, and the goal.
  const zones: TileRect[] = [];
  const runs: Run[][] = Array.from({ length: legs }, () => [{ from: x0, to: x0 + len }]);
  const carve = (leg: number, from: number): number => {
    const zone = zones.length;
    zones.push({ c: from, r: rowOf(leg), w: ZONE_LENGTH, h: thick });
    runs[leg] = runs[leg]!.flatMap((run): Run[] =>
      run.zone === undefined && from >= run.from && from + ZONE_LENGTH <= run.to
        ? [
            { from: run.from, to: from },
            { from, to: from + ZONE_LENGTH, zone },
            { from: from + ZONE_LENGTH, to: run.to },
          ].filter((r) => r.to > r.from)
        : [run],
    );
    return zone;
  };
  carve(0, x0);
  const margin = Math.max(join, ZONE_LENGTH);
  for (let k = 1; k < segments; k++) {
    const leg = Math.floor((k * legs) / segments);
    const lo = x0 + margin + 2;
    const hi = x0 + len - margin - 2 - ZONE_LENGTH;
    carve(leg, rand.int(lo, Math.max(lo, hi)));
  }
  carve(legs - 1, heading(legs - 1) === 1 ? x0 + len - ZONE_LENGTH : x0);

  // Walk the path from the start, handing floor to successive chambers and tracing the middle of it.
  const chambers: Chamber[] = [{ parts: [] }];
  // The route turns down the middle of the connector's square nearest the leg, never along a square's edge.
  const joinX = (i: number): number => (heading(i) === 1 ? x0 + len - 1.5 : x0 + 1.5) * TILE;
  const midY = (i: number): number => (rowOf(i) + thick / 2) * TILE;
  let route: Point[] = [];
  const finish = (): void => {
    chambers[chambers.length - 1]!.route = route;
    route = [];
  };
  for (let i = 0; i < legs; i++) {
    const ordered = heading(i) === 1 ? runs[i]! : [...runs[i]!].reverse();
    ordered.forEach((run, index) => {
      if (run.zone !== undefined) {
        // A zone other than the start or goal begins a new chamber.
        if (run.zone > 0 && run.zone < zones.length - 1) {
          finish();
          chambers.push({ parts: [] });
        }
        return;
      }
      chambers[chambers.length - 1]!.parts.push({
        c: run.from,
        r: rowOf(i),
        w: run.to - run.from,
        h: thick,
      });
      const [entry, exit] = heading(i) === 1 ? [run.from, run.to] : [run.to, run.from];
      route.push({ x: i > 0 && index === 0 ? joinX(i - 1) : entry * TILE, y: midY(i) });
      route.push({
        x: i < legs - 1 && index === ordered.length - 1 ? joinX(i) : exit * TILE,
        y: midY(i),
      });
    });
    if (i < legs - 1) {
      chambers[chambers.length - 1]!.parts.push({
        c: heading(i) === 1 ? x0 + len - join : x0,
        r: rowOf(i) + thick,
        w: join,
        h: 1,
      });
    }
  }
  finish();
  // A dot on the middle line of a two-tile corridor leaves no room to squeeze past.
  if (thick < 3) for (const chamber of chambers) delete chamber.route;

  const plan: Plan = { grid: false, zones, chambers };
  const placed = vertical ? transposed(plan) : plan;
  return isValidPlan(placed) ? placed : null;
};

/** A spine with side branches above and below, a plus, T or comb, with safe zones carved from the ends of the spine. */
const comb = (rand: Random, d: Difficulty): Plan | null => {
  const vertical = rand.chance(0.25);
  const across = vertical ? COLS : ROWS;
  const along = vertical ? ROWS : COLS;
  const segments = d.segments;
  const thick = rand.pick([2, 3, 3]);
  const shortest = segments > 1 ? 12 : 10;
  if (along - 2 < shortest) return null;
  const len = rand.int(shortest, along - 2);
  const x0 = rand.int(1, along - 1 - len);
  const lowest = across - 1 - thick - 3;
  if (lowest < 4) return null;
  const y0 = rand.int(4, lowest);

  const zones: TileRect[] = [{ c: x0, r: y0, w: ZONE_LENGTH, h: thick }];
  for (let k = 1; k < segments; k++)
    zones.push({ c: x0 + Math.round((k * len) / segments) - 1, r: y0, w: ZONE_LENGTH, h: thick });
  zones.push({ c: x0 + len - ZONE_LENGTH, r: y0, w: ZONE_LENGTH, h: thick });

  const chambers: Chamber[] = zones.slice(1).map((zone, i) => ({
    parts: [{ c: zones[i]!.c + ZONE_LENGTH, r: y0, w: zone.c - zones[i]!.c - ZONE_LENGTH, h: thick }],
    nooks: [],
    branches: [],
  }));

  const branches = rand.int(1, segments > 1 ? 2 * segments : 3);
  const taken: TileRect[] = [];
  for (let n = 0; n < branches; n++) {
    const i = rand.int(0, chambers.length - 1);
    const spine = chambers[i]!.parts[0]!;
    const width = Math.min(spine.w - 2, rand.pick([2, 3, 3]));
    if (width < 2) continue;
    const c = rand.int(spine.c + 1, spine.c + spine.w - width - 1);
    const up = rand.chance(0.5);
    const room = up ? y0 - 1 : across - 1 - (y0 + thick);
    if (room < 3) continue;
    const h = rand.int(3, room);
    const branch: TileRect = { c, r: up ? y0 - h : y0 + thick, w: width, h };
    if (taken.some((other) => up === other.r < y0 && overlaps(branch, other, 1))) continue;
    taken.push(branch);
    chambers[i]!.parts.push(branch);
    chambers[i]!.branches!.push(branch);
    chambers[i]!.nooks!.push({
      x: (c + width / 2) * TILE,
      y: (up ? y0 - h + 0.6 : y0 + thick + h - 0.6) * TILE,
    });
  }
  if (!taken.length) return null;

  const plan: Plan = { grid: false, zones, chambers };
  const placed = vertical ? transposed(plan) : plan;
  return isValidPlan(placed) ? placed : null;
};

/**
 * A staircase of blocks, each stepping down and sideways from the last, drawn as the safe zones at its
 * ends allow: one chamber only, as there is no good place to cut a checkpoint into a diagonal.
 */
const stairs = (rand: Random, d: Difficulty): Plan | null => {
  if (d.segments > 1) return null;
  const vertical = rand.chance(0.3);
  const across = vertical ? COLS : ROWS;
  const along = vertical ? ROWS : COLS;
  const h = rand.pick([2, 3]);
  const w = h === 2 ? rand.pick([5, 6]) : 6;
  const steps = Math.min(Math.floor((across - 2) / h), Math.floor((along - 2 - w) / h) + 1);
  if (steps < 3) return null;
  const n = rand.int(3, steps);
  const c0 = rand.int(1, along - 1 - (w + h * (n - 1)));
  const r0 = rand.int(1, across - 1 - n * h);
  const rightwards = rand.chance(0.5);
  const colOf = (i: number): number => (rightwards ? c0 + i * h : c0 + (n - 1 - i) * h);
  const rowOf = (i: number): number => r0 + i * h;

  const zones: TileRect[] = [
    { c: rightwards ? colOf(0) : colOf(0) + w - ZONE_LENGTH, r: rowOf(0), w: ZONE_LENGTH, h },
    { c: rightwards ? colOf(n - 1) + w - ZONE_LENGTH : colOf(n - 1), r: rowOf(n - 1), w: ZONE_LENGTH, h },
  ];
  const parts: TileRect[] = Array.from({ length: n }, (_, i) => ({ c: colOf(i), r: rowOf(i), w, h }));
  // Each end block gives up its outer columns to a safe zone.
  parts[0] = { ...parts[0]!, c: rightwards ? colOf(0) + ZONE_LENGTH : colOf(0), w: w - ZONE_LENGTH };
  parts[n - 1] = { ...parts[n - 1]!, c: rightwards ? colOf(n - 1) : colOf(n - 1) + ZONE_LENGTH, w: w - ZONE_LENGTH };

  const chamber: Chamber = { parts };
  if (h === 3) {
    // Down the middle of each block, then down the middle of the squares where it meets the next.
    const mid = (i: number): number => (rowOf(i) + 1.5) * TILE;
    const route: Point[] = [
      { x: (rightwards ? colOf(0) + ZONE_LENGTH : colOf(0) + w - ZONE_LENGTH) * TILE, y: mid(0) },
    ];
    for (let i = 0; i < n - 1; i++) {
      const x = (Math.max(colOf(i), colOf(i + 1)) + 1.5) * TILE;
      route.push({ x, y: mid(i) }, { x, y: mid(i + 1) });
    }
    route.push({ x: (rightwards ? colOf(n - 1) + w - ZONE_LENGTH : colOf(n - 1) + ZONE_LENGTH) * TILE, y: mid(n - 1) });
    chamber.route = route;
  }

  const plan: Plan = { grid: false, zones, chambers: [chamber] };
  const placed = vertical ? transposed(plan) : plan;
  return isValidPlan(placed) ? placed : null;
};

const build = (kind: LayoutKind, rand: Random, d: Difficulty): Plan | null => {
  switch (kind) {
    case 'chain':
      return chain(rand, d, false);
    case 'hall':
      return chain(rand, { ...d, segments: 1 }, true);
    case 'winding':
      return winding(rand, d);
    case 'comb':
      return comb(rand, d);
    case 'stairs':
      return stairs(rand, d);
  }
};

/** Draws layouts until one holds together, falling back to a plain hall. */
export const planLevel = (rand: Random, d: Difficulty): Plan => {
  for (let attempt = 0; attempt < 24; attempt++) {
    const plan = build(rand.pick(d.layouts), rand, d);
    if (plan && isValidPlan(plan)) return plan;
  }
  return FALLBACK;
};
