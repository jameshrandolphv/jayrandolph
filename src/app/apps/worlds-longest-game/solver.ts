import { COLS, ENEMY_R, PLAYER_SIZE, ROWS, TILE, TILE_FLOOR, TILE_SAFE, TILE_VOID } from './constants';
import { enemyPositionAt, insideZone, zoneCentre, type LevelDef, type Point, type TileRect } from './level';

/*
 * Conservative reachability check over (cell, time). The level repeats every `period` ticks, so time is
 * a cycle of layers. A player may wait or step one cell per layer, and every cell involved in a step
 * must be clear of enemies (grown by SLACK) both before and after it. Cells are only valid when the
 * player's whole square sits on floor, so anything found here is playable with room to spare.
 */
const CELL = 12;
/** Ticks per layer; a cell per layer is 3 px/tick, under the player's speed. */
const STEP = 4;
const SLACK = 4;
const HALF = PLAYER_SIZE / 2;
const GW = Math.floor((COLS * TILE) / CELL);
const GH = Math.floor((ROWS * TILE) / CELL);
const N = GW * GH;
/** A coin counts as collected when the player's centre is this close, which always overlaps it. */
export const COIN_REACH = HALF - 4;

const MOVES = [0, 1, -1, GW, -GW];

const floorAt = (level: LevelDef, x: number, y: number): boolean => {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  return c >= 0 && r >= 0 && c < COLS && r < ROWS && level.tiles[r * COLS + c] !== TILE_VOID;
};

const centre = (i: number): number => i * CELL + CELL / 2;

const walkableCells = (level: LevelDef): Uint8Array => {
  const walk = new Uint8Array(N);
  const e = HALF - 0.01;
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const x = centre(i);
      const y = centre(j);
      walk[j * GW + i] = +(
        floorAt(level, x - e, y - e) &&
        floorAt(level, x + e, y - e) &&
        floorAt(level, x - e, y + e) &&
        floorAt(level, x + e, y + e)
      );
    }
  }
  return walk;
};

const hazardLayers = (level: LevelDef, layers: number): Uint8Array => {
  const haz = new Uint8Array(layers * N);
  const radius = ENEMY_R + SLACK;
  const reach = HALF + radius;
  for (let t = 0; t < layers; t++) {
    const base = t * N;
    for (const enemy of level.enemies) {
      const p = enemyPositionAt(enemy, t * STEP);
      const i0 = Math.max(0, Math.floor((p.x - reach) / CELL));
      const i1 = Math.min(GW - 1, Math.floor((p.x + reach) / CELL));
      const j0 = Math.max(0, Math.floor((p.y - reach) / CELL));
      const j1 = Math.min(GH - 1, Math.floor((p.y + reach) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const nx = Math.max(centre(i) - HALF, Math.min(p.x, centre(i) + HALF));
          const ny = Math.max(centre(j) - HALF, Math.min(p.y, centre(j) + HALF));
          if ((p.x - nx) ** 2 + (p.y - ny) ** 2 <= radius * radius) haz[base + j * GW + i] = 1;
        }
      }
    }
  }
  return haz;
};

/** Cells the player may use for one segment: its two zones and the chamber that joins them. */
const segmentCells = (level: LevelDef, walk: Uint8Array, segment: number): Uint8Array => {
  const { zones } = level;
  const zoneOf = (c: number, r: number): number =>
    zones.findIndex((z) => c >= z.c && c < z.c + z.w && r >= z.r && r < z.r + z.h);

  // Label chamber components, and note which zones each touches.
  const label = new Int32Array(COLS * ROWS).fill(-1);
  const touches: Set<number>[] = [];
  for (let start = 0; start < COLS * ROWS; start++) {
    if (level.tiles[start] !== TILE_FLOOR || label[start] !== -1) continue;
    const id = touches.length;
    const adjacent = new Set<number>();
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const at = stack.pop()!;
      const c = at % COLS;
      const r = Math.floor(at / COLS);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const next = nr * COLS + nc;
        if (level.tiles[next] === TILE_SAFE) adjacent.add(zoneOf(nc, nr));
        else if (level.tiles[next] === TILE_FLOOR && label[next] === -1) {
          label[next] = id;
          stack.push(next);
        }
      }
    }
    touches.push(adjacent);
  }
  const chamber = touches.findIndex((z) => z.has(segment) && z.has(segment + 1));

  const allowed = new Uint8Array(N);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const cell = j * GW + i;
      if (!walk[cell]) continue;
      const c = Math.floor(centre(i) / TILE);
      const r = Math.floor(centre(j) / TILE);
      const zone = level.tiles[r * COLS + c] === TILE_SAFE ? zoneOf(c, r) : -1;
      allowed[cell] = +(zone === segment || zone === segment + 1 || (zone === -1 && label[r * COLS + c] === chamber));
    }
  }
  return allowed;
};

interface Workspace {
  level: LevelDef;
  layers: number;
  walk: Uint8Array;
  haz: Uint8Array;
  visited: Uint8Array;
  queue: Int32Array;
  /** How many states the last flood visited; they are the first entries of `queue`. */
  reached: number;
}

const workspaceFor = (level: LevelDef): Workspace => {
  const layers = level.period / STEP;
  return {
    level,
    layers,
    walk: walkableCells(level),
    haz: hazardLayers(level, layers),
    visited: new Uint8Array(layers * N),
    queue: new Int32Array(layers * N),
    reached: 0,
  };
};

/** The (cell, time) states the player may be in while on the stretch after zone `segment`. */
const openStates = (ws: Workspace, segment: number): { allowed: Uint8Array; open: Uint8Array } => {
  const { level, layers, walk, haz } = ws;
  const allowed = segmentCells(level, walk, segment);
  const open = new Uint8Array(layers * N);
  for (let t = 0; t < layers; t++) {
    for (let cell = 0; cell < N; cell++) open[t * N + cell] = +(allowed[cell] === 1 && haz[t * N + cell] === 0);
  }
  return { allowed, open };
};

/**
 * Marks every state reachable from `sources` and leaves them in `ws.queue`. A step between two times
 * needs the same four states open whichever way it is taken, so running time backwards (`step` of -1)
 * finds the states that can reach the sources instead.
 */
const flood = (ws: Workspace, open: Uint8Array, sources: readonly number[], step: 1 | -1 = 1): void => {
  const { layers, visited, queue } = ws;
  for (let i = 0; i < ws.reached; i++) visited[queue[i]!] = 0;
  let head = 0;
  let tail = 0;
  for (const s of sources) {
    visited[s] = 1;
    queue[tail++] = s;
  }
  while (head < tail) {
    const s = queue[head++]!;
    const t = Math.floor(s / N);
    const cell = s - t * N;
    const nt = (t + step + layers) % layers;
    if (!open[nt * N + cell]) continue;
    for (const move of MOVES) {
      const next = cell + move;
      if (next < 0 || next >= N) continue;
      const ns = nt * N + next;
      if (visited[ns] || !open[ns] || !open[t * N + next]) continue;
      visited[ns] = 1;
      queue[tail++] = ns;
    }
  }
  ws.reached = tail;
};

const zoneCells = (allowed: Uint8Array, zone: TileRect): number[] => {
  const cells: number[] = [];
  for (let cell = 0; cell < N; cell++) {
    if (allowed[cell] && insideZone(zone, centre(cell % GW), centre(Math.floor(cell / GW)))) cells.push(cell);
  }
  return cells;
};

/** Whether the player can get from zone `segment` to the next one, collecting every coin of the stretch on the way. */
const solveSegment = (ws: Workspace, segment: number): boolean => {
  const { level, queue } = ws;
  const { allowed, open } = openStates(ws, segment);

  const start = level.zones[segment]!;
  const goal = level.zones[segment + 1]!;
  const pending = level.coins.filter((c) => c.segment === segment);
  const sources = zoneCells(allowed, start);

  let from = zoneCentre(start);
  while (pending.length) {
    let nearest = 0;
    for (let k = 1; k < pending.length; k++) {
      if (
        Math.hypot(pending[k]!.x - from.x, pending[k]!.y - from.y) <
        Math.hypot(pending[nearest]!.x - from.x, pending[nearest]!.y - from.y)
      )
        nearest = k;
    }
    const [coin] = pending.splice(nearest, 1);
    flood(ws, open, sources);
    sources.length = 0;
    for (let i = 0; i < ws.reached; i++) {
      const s = queue[i]!;
      const cell = s % N;
      if (
        Math.abs(centre(cell % GW) - coin!.x) <= COIN_REACH &&
        Math.abs(centre(Math.floor(cell / GW)) - coin!.y) <= COIN_REACH
      )
        sources.push(s);
    }
    if (!sources.length) return false;
    from = coin!;
  }

  flood(ws, open, sources);
  for (let i = 0; i < ws.reached; i++) {
    const cell = queue[i]! % N;
    if (insideZone(goal, centre(cell % GW), centre(Math.floor(cell / GW)))) return true;
  }
  return false;
};

/** Whether the player can visit every coin, in nearest-first order, and reach the goal from each zone. */
export const isSolvable = (level: LevelDef): boolean => {
  const workspace = workspaceFor(level);
  for (let segment = 0; segment < level.zones.length - 1; segment++)
    if (!solveSegment(workspace, segment)) return false;
  return true;
};

/** Like isSolvable, for the one stretch after zone `segment`; enemies elsewhere don't matter to it. */
export const isSegmentSolvable = (level: LevelDef, segment: number): boolean =>
  solveSegment(workspaceFor(level), segment);

/**
 * Centres of the cells where, on some way from zone `segment` to the next, the player can be: reached
 * from the start safely and with a safe way on to the goal. Coins that sit on these can be collected.
 */
export const viableSpots = (level: LevelDef, segment: number): Point[] => {
  const ws = workspaceFor(level);
  const { allowed, open } = openStates(ws, segment);
  flood(ws, open, zoneCells(allowed, level.zones[segment]!));
  const forward = Array.from(ws.queue.subarray(0, ws.reached));

  const goal = zoneCells(allowed, level.zones[segment + 1]!);
  const sources: number[] = [];
  for (let t = 0; t < ws.layers; t++) for (const cell of goal) if (open[t * N + cell]) sources.push(t * N + cell);
  flood(ws, open, sources, -1);

  const seen = new Uint8Array(N);
  const spots: Point[] = [];
  for (const s of forward) {
    const cell = s % N;
    if (!ws.visited[s] || seen[cell]) continue;
    seen[cell] = 1;
    spots.push({ x: centre(cell % GW), y: centre(Math.floor(cell / GW)) });
  }
  return spots;
};

export interface OpenArea {
  /** Cells in the patch. */
  size: number;
  /** Bounds of the patch's cell centres, in pixels. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Connected patches of chamber floor, over `minCells` big, that no enemy ever comes near; biggest first. */
export const openAreas = (level: LevelDef, minCells: number): OpenArea[] => {
  const layers = level.period / STEP;
  const walk = walkableCells(level);
  const haz = hazardLayers(level, layers);
  const open = new Uint8Array(N);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const cell = j * GW + i;
      if (!walk[cell] || level.tiles[Math.floor(centre(j) / TILE) * COLS + Math.floor(centre(i) / TILE)] !== TILE_FLOOR)
        continue;
      let hit = false;
      for (let t = 0; t < layers && !hit; t++) hit = haz[t * N + cell] === 1;
      open[cell] = +!hit;
    }
  }

  const out: OpenArea[] = [];
  const seen = new Uint8Array(N);
  for (let start = 0; start < N; start++) {
    if (!open[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0;
    let i0 = GW;
    let i1 = 0;
    let j0 = GH;
    let j1 = 0;
    while (stack.length) {
      const at = stack.pop()!;
      const i = at % GW;
      const j = Math.floor(at / GW);
      size++;
      i0 = Math.min(i0, i);
      i1 = Math.max(i1, i);
      j0 = Math.min(j0, j);
      j1 = Math.max(j1, j);
      for (const next of [at + 1, at - 1, at + GW, at - GW]) {
        if (next < 0 || next >= N || Math.abs((next % GW) - i) > 1 || !open[next] || seen[next]) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (size > minCells) out.push({ size, x0: centre(i0), y0: centre(j0), x1: centre(i1), y1: centre(j1) });
  }
  return out.sort((a, b) => b.size - a.size);
};
