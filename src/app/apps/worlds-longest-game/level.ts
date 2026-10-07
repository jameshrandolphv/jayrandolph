import { COLS, ROWS, TILE, TILE_VOID } from './constants';

export interface Point {
  x: number;
  y: number;
}

/** In whole tiles. */
export interface TileRect {
  c: number;
  r: number;
  w: number;
  h: number;
}

/** Enemies are pure functions of the tick; `phase` and `period` are whole ticks. */
export type Enemy =
  | { kind: 'sweep'; ax: number; ay: number; bx: number; by: number; period: number; phase: number }
  | {
      kind: 'orbit';
      cx: number;
      cy: number;
      radius: number;
      period: number;
      phase: number;
      dir: 1 | -1;
    }
  | {
      kind: 'swing';
      cx: number;
      cy: number;
      radius: number;
      heading: number;
      amp: number;
      period: number;
      phase: number;
    }
  | {
      kind: 'loop';
      x: number;
      y: number;
      w: number;
      h: number;
      period: number;
      phase: number;
      dir: 1 | -1;
    }
  /** Follows a polyline at constant speed: round it if `closed`, otherwise there and back again. */
  | { kind: 'route'; points: Point[]; closed: boolean; period: number; phase: number; dir: 1 | -1 };

export interface Coin extends Point {
  /** Index of the chamber it sits in; zone `segment + 1` needs it collected. */
  segment: number;
}

/** A plain, JSON-safe description of one level, so levels can be saved and loaded later. */
export interface LevelDef {
  version: 1;
  number: number;
  seed: number;
  /** Ticks after which every enemy is back where it started. */
  period: number;
  cols: number;
  rows: number;
  /** Row-major TILE_VOID / TILE_FLOOR / TILE_SAFE. */
  tiles: number[];
  /** Start, then checkpoints, then the goal. */
  zones: TileRect[];
  coins: Coin[];
  enemies: Enemy[];
}

export const zoneCentre = (zone: TileRect): Point => ({
  x: (zone.c + zone.w / 2) * TILE,
  y: (zone.r + zone.h / 2) * TILE,
});

export const insideZone = (zone: TileRect, x: number, y: number): boolean =>
  x >= zone.c * TILE && x < (zone.c + zone.w) * TILE && y >= zone.r * TILE && y < (zone.r + zone.h) * TILE;

/** Whether any part of a square, given by its centre and half-size, overlaps the zone. */
export const touchesZone = (zone: TileRect, x: number, y: number, half: number): boolean =>
  x + half > zone.c * TILE &&
  x - half < (zone.c + zone.w) * TILE &&
  y + half > zone.r * TILE &&
  y - half < (zone.r + zone.h) * TILE;

export const tileAt = (level: LevelDef, x: number, y: number): number => {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  return c < 0 || r < 0 || c >= COLS || r >= ROWS ? TILE_VOID : level.tiles[r * COLS + c]!;
};

/** Lengths are looked up for every enemy on every tick, so they are worked out once per route. */
const lengths = new WeakMap<readonly Point[], { open: number; closed: number }>();

/** Length of a polyline, closing it back to its first point if asked. */
export const routeLength = (points: readonly Point[], closed: boolean): number => {
  let known = lengths.get(points);
  if (!known) {
    let open = 0;
    for (let i = 1; i < points.length; i++)
      open += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    const first = points[0];
    const last = points[points.length - 1];
    known = { open, closed: first && last ? open + Math.hypot(first.x - last.x, first.y - last.y) : 0 };
    lengths.set(points, known);
  }
  return closed ? known.closed : known.open;
};

/** The point `distance` px along a polyline, which is closed back to its first point if asked. */
const pointAlong = (points: readonly Point[], closed: boolean, distance: number): Point => {
  let left = distance;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= length && length > 0)
      return { x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length };
    left -= length;
  }
  return closed ? points[0]! : points[points.length - 1]!;
};

export const enemyPositionAt = (e: Enemy, tick: number): Point => {
  const u = ((((tick + e.phase) % e.period) + e.period) % e.period) / e.period;
  switch (e.kind) {
    case 'sweep': {
      const k = u < 0.5 ? u * 2 : 2 - u * 2;
      return { x: e.ax + (e.bx - e.ax) * k, y: e.ay + (e.by - e.ay) * k };
    }
    case 'orbit': {
      const a = e.dir * u * Math.PI * 2;
      return { x: e.cx + Math.cos(a) * e.radius, y: e.cy + Math.sin(a) * e.radius };
    }
    case 'swing': {
      const a = e.heading + e.amp * Math.sin(u * Math.PI * 2);
      return { x: e.cx + Math.cos(a) * e.radius, y: e.cy + Math.sin(a) * e.radius };
    }
    case 'loop': {
      let s = (e.dir > 0 ? u : (1 - u) % 1) * 2 * (e.w + e.h);
      if (s < e.w) return { x: e.x + s, y: e.y };
      s -= e.w;
      if (s < e.h) return { x: e.x + e.w, y: e.y + s };
      s -= e.h;
      if (s < e.w) return { x: e.x + e.w - s, y: e.y + e.h };
      s -= e.w;
      return { x: e.x, y: e.y + e.h - s };
    }
    case 'route': {
      const k = e.closed ? (e.dir > 0 ? u : (1 - u) % 1) : u < 0.5 ? u * 2 : 2 - u * 2;
      return pointAlong(e.points, e.closed, k * routeLength(e.points, e.closed));
    }
  }
};
