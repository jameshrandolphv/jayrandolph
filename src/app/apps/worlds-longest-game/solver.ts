import { COLS, ENEMY_R, PLAYER_SIZE, ROWS, TILE, TILE_FLOOR, TILE_SAFE, TILE_VOID } from './constants';
import { enemyPositionAt, insideZone, zoneCentre, type LevelDef } from './level';

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
const COIN_REACH = HALF - 4;

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
      walk[j * GW + i] = +(floorAt(level, x - e, y - e) && floorAt(level, x + e, y - e) && floorAt(level, x - e, y + e) && floorAt(level, x + e, y + e));
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
  const zoneOf = (c: number, r: number): number => zones.findIndex((z) => c >= z.c && c < z.c + z.w && r >= z.r && r < z.r + z.h);

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
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
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

/** Whether the player can visit every coin, in nearest-first order, and reach the goal from each zone. */
export const isSolvable = (level: LevelDef): boolean => {
  const layers = level.period / STEP;
  const walk = walkableCells(level);
  const haz = hazardLayers(level, layers);
  const visited = new Uint8Array(layers * N);
  const queue = new Int32Array(layers * N);

  for (let segment = 0; segment < level.zones.length - 1; segment++) {
    const allowed = segmentCells(level, walk, segment);
    const free = (t: number, cell: number): boolean => allowed[cell] === 1 && haz[t * N + cell] === 0;

    const flood = (sources: number[]): void => {
      visited.fill(0);
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
        const nt = t + 1 === layers ? 0 : t + 1;
        if (!free(nt, cell)) continue;
        for (const move of MOVES) {
          const next = cell + move;
          if (next < 0 || next >= N) continue;
          const ns = nt * N + next;
          if (visited[ns] || !free(nt, next) || !free(t, next)) continue;
          visited[ns] = 1;
          queue[tail++] = ns;
        }
      }
    };

    const start = level.zones[segment]!;
    const goal = level.zones[segment + 1]!;
    const centreOfStart = zoneCentre(start);
    const pending = level.coins.filter((c) => c.segment === segment);
    const sources: number[] = [];
    for (let cell = 0; cell < N; cell++) {
      if (allowed[cell] && insideZone(start, centre(cell % GW), centre(Math.floor(cell / GW)))) sources.push(cell);
    }

    let from = centreOfStart;
    while (pending.length) {
      let nearest = 0;
      for (let k = 1; k < pending.length; k++) {
        if (Math.hypot(pending[k]!.x - from.x, pending[k]!.y - from.y) < Math.hypot(pending[nearest]!.x - from.x, pending[nearest]!.y - from.y)) nearest = k;
      }
      const [coin] = pending.splice(nearest, 1);
      flood(sources);
      sources.length = 0;
      for (let t = 0; t < layers; t++) {
        for (let cell = 0; cell < N; cell++) {
          const s = t * N + cell;
          if (!visited[s]) continue;
          if (Math.abs(centre(cell % GW) - coin!.x) <= COIN_REACH && Math.abs(centre(Math.floor(cell / GW)) - coin!.y) <= COIN_REACH) sources.push(s);
        }
      }
      if (!sources.length) return false;
      from = coin!;
    }

    flood(sources);
    let reached = false;
    for (let s = 0; s < layers * N && !reached; s++) {
      if (!visited[s]) continue;
      const cell = s % N;
      reached = insideZone(goal, centre(cell % GW), centre(Math.floor(cell / GW)));
    }
    if (!reached) return false;
  }
  return true;
};
