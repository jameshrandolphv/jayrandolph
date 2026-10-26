import {
  ART,
  EDGE_MARGIN,
  FRAME_H,
  FRAME_W,
  HUD_MARGIN,
  LANE_W,
  LANES,
  PATCH_SCORES,
  STREET_WIDTH,
  TRACK_SAMPLES,
  WALL_INSET,
  WALL_RADIUS,
  type Rect,
} from './constants';
import {
  COURSES,
  RAPIDS_LEN,
  RAPIDS_LANES,
  RIVER_LANES,
  TRAIN_LANE,
  type CourseId,
  type CourseSpec,
} from './courses';

export interface Point {
  x: number;
  y: number;
}

/**
 * The landscape area a park is laid out to fill: the screen's long side by its short side, in logical px. The score
 * runs along one edge of the screen, which is the park's top in landscape and its left end in portrait.
 */
export interface ParkFrame {
  w: number;
  h: number;
  hud: 'top' | 'left';
}

export const DEFAULT_FRAME: ParkFrame = { w: FRAME_W, h: FRAME_H, hud: 'top' };

/** How far the road's outer edge keeps from each edge of the frame. */
export const frameMargins = (frame: ParkFrame) => ({
  top: frame.hud === 'top' ? HUD_MARGIN : EDGE_MARGIN,
  left: frame.hud === 'left' ? HUD_MARGIN : EDGE_MARGIN,
  right: EDGE_MARGIN,
  bottom: EDGE_MARGIN,
});

export const wallFor = (frame: ParkFrame): Rect => ({
  x: WALL_INSET,
  y: WALL_INSET,
  w: frame.w - WALL_INSET * 2,
  h: frame.h - WALL_INSET * 2,
});

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

/**
 * The loop's centre line, evenly sampled. Distance along it (`s`) grows counterclockwise on screen, the way traffic
 * goes round; lateral offsets are measured outward from it.
 */
export interface Track {
  points: Point[];
  /** Unit vectors in the direction of increasing `s`. */
  tangents: Point[];
  /** Unit vectors pointing out of the park's middle. */
  normals: Point[];
  /** Total length of the centre line. */
  length: number;
  /** Distance between samples. */
  step: number;
}

export interface Pose {
  x: number;
  y: number;
  /** Direction of increasing `s`, radians. */
  angle: number;
}

export interface Entrance {
  id: number;
  /** Where on the loop it joins. */
  s: number;
  /** Across the street, where movers appear; the gate in the wall; and the mouth of the road just off the loop. */
  street: Point;
  gate: Point;
  throat: Point;
  /**
   * Which side of the road it comes in on: 1 outward (the outer lane), as on every loop; -1 the other way (the inner
   * lane), where a figure of eight's normals point into its other half.
   */
  side: 1 | -1;
}

/** A path across the middle of the park between two points on the loop's inner edge. */
export interface Shortcut {
  id: number;
  /** Ends on the loop, and the path between them, from the `a` end to the `b` end. */
  a: number;
  b: number;
  path: Point[];
}

/**
 * A two-lane road off the loop's inner two lanes and back onto them, with its own traffic (see `SideRoadKind`): it
 * leaves along the loop at `a` and comes back on along it at `b`, so a lane on it lines up with the same lane of the
 * loop at both ends.
 */
export interface SideRoad {
  id: number;
  kind: SideRoadKind;
  a: number;
  b: number;
  /** Its centre line from the `a` end to the `b` end, its normals on the same side as the loop's. */
  track: Track;
  /** Comes back on behind where it left (`b` before `a`), so whoever takes it does that stretch again. */
  back: boolean;
}

/**
 * - hall: through the manor's house, straight across the middle; some on the inner two lanes take it.
 * - graveyard: a winding detour through a manor's graveyard that comes back on behind where it left; everyone on the
 *   inside lane takes it.
 */
export type SideRoadKind = 'hall' | 'graveyard';

/** Lanes on a side road: the loop's inner two. */
export const SIDE_LANES = 2;

export interface Water {
  kind: 'reservoir' | 'lake';
  outline: Point[];
  centre: Point;
  /** Rough size, for keeping other things clear of it. */
  radius: number;
}

export interface Field {
  x: number;
  y: number;
  rx: number;
  ry: number;
  diamond: boolean;
}

export interface Tree {
  x: number;
  y: number;
  r: number;
  /** 0 to 1, picks a shade (or blossom) for the season. */
  tone: number;
  evergreen: boolean;
}

/**
 * A slippery patch on the road, drawn for the season (ice, puddle, mud or a pile of leaves); anything crossing it
 * slides a lane.
 */
export interface Patch {
  id: number;
  s: number;
  lane: number;
  width: number;
  len: number;
}

export interface Building extends Rect {
  /** Index into the roof colours. */
  tone: number;
  tower: boolean;
}

/** A stretch of the loop drawn under cover (see `Cover`), from `s` for `len`. */
export interface Covered {
  s: number;
  len: number;
}

/** A stretch of rapids in one lane. */
export interface Rapid extends Covered {
  lane: number;
}

/**
 * Where a figure of eight crosses itself: the stretch of road that goes over on the bridge, the stretch that goes
 * under it, and the point where they cross.
 */
export interface Bridge {
  over: Covered;
  under: Covered;
  at: Point;
}

/**
 * A river across one half of a course (see `CourseSpec.riverCrossing`), `RIVER_LANES` lanes wide, with its own
 * traffic. Its centre line runs from beyond one edge of the frame, where its traffic comes in, to beyond the other,
 * where it goes out; the loop crosses it on a bridge each side of that half.
 */
export interface River {
  track: Track;
  /**
   * Where the loop crosses it, in order downstream: how far along the river, the stretch of loop on the bridge, and
   * where along the loop its centre line crosses the river's. The first is a bridge of long planks, one a lane, with
   * `gaps` missing (see `PLANK_GAP_LEVEL`).
   */
  bridges: RiverBridge[];
  /**
   * The lanes of the plank bridge with no plank: the first from the start, the second once the level reaches
   * `PLANK_GAP_LEVEL`. However many are gone, a two-lane visitor still has room to cross.
   */
  gaps: number[];
}

export interface RiverBridge {
  at: number;
  over: Covered;
  cross: number;
  planks: boolean;
}

export interface Park {
  season: Season;
  frame: ParkFrame;
  course: CourseId;
  /** Lanes on the loop, how wide each is, and half the road's width. */
  lanes: number;
  laneW: number;
  half: number;
  cover: Covered | null;
  /** The lanes' stretches of rapids, on a course that has them (see `CourseSpec.rapids`). */
  rapids: Rapid[];
  /** Where a figure of eight crosses itself. */
  bridge: Bridge | null;
  track: Track;
  entrances: Entrance[];
  shortcuts: Shortcut[];
  /** Roads off the loop and back, on a manor (see `SideRoad`). */
  sideRoads: SideRoad[];
  /** The river crossing the course, on a course with one. */
  river: River | null;
  water: Water[];
  fields: Field[];
  /** Footpaths drawn for show; nobody uses them but the short cuts. */
  paths: Point[][];
  trees: Tree[];
  patches: Patch[];
  wall: Rect;
  /** City blocks round the park, and the buildings on them. */
  blocks: Rect[];
  buildings: Building[];
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry.

/** A small deterministic generator (mulberry32), for tests and repeatable parks. */
export const seededRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const wrap = (s: number, length: number): number => ((s % length) + length) % length;

/** Signed shortest distance from `from` to `to` around the loop, in (-length/2, length/2]. */
export const loopDelta = (from: number, to: number, length: number): number => {
  const d = wrap(to - from, length);
  return d > length / 2 ? d - length : d;
};

/** The point `d` px outward of the centre line at `s`, and the direction of travel there. */
export const pose = (track: Track, s: number, d = 0): Pose => {
  const { points, normals, tangents, step } = track;
  const n = points.length;
  const f = wrap(s, track.length) / step;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const t = f - Math.floor(f);
  const nx = normals[i]!.x + (normals[j]!.x - normals[i]!.x) * t;
  const ny = normals[i]!.y + (normals[j]!.y - normals[i]!.y) * t;
  const nl = Math.hypot(nx, ny) || 1;
  const tx = tangents[i]!.x + (tangents[j]!.x - tangents[i]!.x) * t;
  const ty = tangents[i]!.y + (tangents[j]!.y - tangents[i]!.y) * t;
  return {
    x: points[i]!.x + (points[j]!.x - points[i]!.x) * t + (nx / nl) * d,
    y: points[i]!.y + (points[j]!.y - points[i]!.y) * t + (ny / nl) * d,
    angle: Math.atan2(ty, tx),
  };
};

/** Offset from the centre line to the middle of a span of lanes starting at lane `p` (0 innermost). */
/** A road's lanes: how many, and how wide each is. */
export interface Road {
  lanes: number;
  laneW: number;
}

export const DEFAULT_ROAD: Road = { lanes: LANES, laneW: LANE_W };

export const laneOffset = (p: number, width: number, road: Road = DEFAULT_ROAD): number =>
  (p + width / 2 - road.lanes / 2) * road.laneW;

/** Half the width of a road. */
export const roadHalf = (road: Road): number => (road.laneW * road.lanes) / 2;

/** The whole edge of the loop `d` px out from the centre line, as a closed outline. */
export const edge = (track: Track, d: number): Point[] =>
  track.points.map((p, i) => ({
    x: p.x + track.normals[i]!.x * d,
    y: p.y + track.normals[i]!.y * d,
  }));

/** Segments per chunk of a long outline's index. */
const CHUNK = 16;
const chunkIndex = new WeakMap<readonly Point[], Float64Array>();

/**
 * Bounds of each run of `CHUNK` segments of a long outline (closing segment included), so a query can skip whole
 * runs that are nowhere near. Worked out once per outline, which is never changed once built: the park's edges are
 * asked about thousands of times.
 */
const chunksOf = (line: readonly Point[]): Float64Array | undefined => {
  const n = line.length;
  if (n < CHUNK * 4) return undefined;
  let boxes = chunkIndex.get(line);
  if (boxes) return boxes;
  const count = Math.ceil(n / CHUNK);
  boxes = new Float64Array(count * 4);
  for (let c = 0; c < count; c++) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = c * CHUNK; k <= Math.min(n, (c + 1) * CHUNK); k++) {
      const q = line[k % n]!;
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
    boxes.set([x0, y0, x1, y1], c * 4);
  }
  chunkIndex.set(line, boxes);
  return boxes;
};

export const insidePolygon = (poly: readonly Point[], x: number, y: number): boolean => {
  let inside = false;
  const n = poly.length;
  const boxes = chunksOf(poly);
  // Segment k runs from point k to the next; only those crossing the horizontal through `y` count.
  for (let k0 = 0; k0 < n; k0 += CHUNK) {
    const c = (k0 / CHUNK) * 4;
    if (boxes && (boxes[c + 1]! > y || boxes[c + 3]! <= y)) continue;
    for (let k = k0; k < Math.min(n, k0 + CHUNK); k++) {
      const a = poly[(k + 1) % n]!;
      const b = poly[k]!;
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
        inside = !inside;
    }
  }
  return inside;
};

const segmentDistance = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
};

export const polylineDistance = (line: readonly Point[], p: Point, closed = false): number => {
  let best = Infinity;
  const n = line.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++)
    best = Math.min(best, segmentDistance(p, line[i]!, line[(i + 1) % n]!));
  return best;
};

/**
 * Whether `p` is closer than `d` to the line. The same as `polylineDistance(line, p, closed) < d`, but it skips
 * segments whose bounds are too far off and stops at the first close one, which the generator leans on heavily.
 */
export const nearPolyline = (
  line: readonly Point[],
  p: Point,
  d: number,
  closed = false,
): boolean => {
  const n = line.length;
  const d2 = d * d;
  const boxes = chunksOf(line);
  const end = n - (closed ? 0 : 1);
  for (let i = 0; i < end; i++) {
    if (boxes && i % CHUNK === 0) {
      const c = (i / CHUNK) * 4;
      if (
        p.x + d < boxes[c]! ||
        p.y + d < boxes[c + 1]! ||
        p.x - d > boxes[c + 2]! ||
        p.y - d > boxes[c + 3]!
      ) {
        i += CHUNK - 1;
        continue;
      }
    }
    const a = line[i]!;
    const b = line[(i + 1) % n]!;
    if (
      (p.x + d < a.x && p.x + d < b.x) ||
      (p.x - d > a.x && p.x - d > b.x) ||
      (p.y + d < a.y && p.y + d < b.y) ||
      (p.y - d > a.y && p.y - d > b.y)
    )
      continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    const ex = p.x - a.x - dx * t;
    const ey = p.y - a.y - dy * t;
    if (ex * ex + ey * ey < d2) return true;
  }
  return false;
};

export const polylineLength = (line: readonly Point[]): number => {
  let total = 0;
  for (let i = 1; i < line.length; i++)
    total += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  return total;
};

const cubic = (a: Point, b: Point, c: Point, d: Point, steps: number): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    };
  });

// ---------------------------------------------------------------------------------------------------------------
// The loop.

/** The middle of the space the loop has, and how far its centre line can reach each way from there. */
const loopSpace = (frame: ParkFrame, half: number) => {
  const m = frameMargins(frame);
  return {
    cx: (m.left + frame.w - m.right) / 2,
    cy: (m.top + frame.h - m.bottom) / 2,
    ax: (frame.w - m.left - m.right) / 2 - half,
    by: (frame.h - m.top - m.bottom) / 2 - half,
  };
};

/**
 * Raw samples of a rounded-rectangle loop with a few gentle bends, counterclockwise on screen, reaching most of the
 * way to the edges of the frame.
 */
const loopOutline = (rng: () => number, frame: ParkFrame, half: number, bend: number): Point[] => {
  const { cx, cy, ax, by } = loopSpace(frame, half);
  const a = ax * (0.86 + rng() * 0.11);
  const b = by * (0.84 + rng() * 0.12);
  // 2 is an ellipse; higher squares the ends off, like the park's drive.
  const n = 2.2 + rng() * 1.1;
  const waves = [2, 3, 4, 5].map((k) => ({
    k,
    amp: ((rng() * 2 - 1) * 0.05 * bend) / (k - 1.2),
    phase: rng() * Math.PI * 2,
  }));
  const raw: Point[] = [];
  const m = 2400;
  for (let j = 0; j < m; j++) {
    // Decreasing angle runs counterclockwise with y pointing down.
    const th = (-j / m) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const f = 1 + waves.reduce((sum, w) => sum + w.amp * Math.sin(w.k * th + w.phase), 0);
    raw.push({
      x: cx + Math.sign(c) * Math.abs(c) ** (2 / n) * a * f,
      y: cy + Math.sign(s) * Math.abs(s) ** (2 / n) * b * f,
    });
  }
  return raw;
};

/**
 * A closed polygon with every corner rounded off to a circle of `radius(i)` (less where its sides are too short),
 * sampled every 2 px.
 */
const roundedPolygon = (corners: readonly Point[], radius: (i: number) => number): Point[] => {
  const n = corners.length;
  // Each corner's turn, and how far back along its sides its curve would start at its full radius.
  const turns = corners.map((v, i) => {
    const prev = corners[(i - 1 + n) % n]!;
    const next = corners[(i + 1) % n]!;
    const l1 = Math.hypot(prev.x - v.x, prev.y - v.y);
    const l2 = Math.hypot(next.x - v.x, next.y - v.y);
    const d1 = { x: (prev.x - v.x) / l1, y: (prev.y - v.y) / l1 };
    const d2 = { x: (next.x - v.x) / l2, y: (next.y - v.y) / l2 };
    const bx = d1.x + d2.x;
    const by = d1.y + d2.y;
    const bl = Math.hypot(bx, by);
    // The tangent and sine of half the angle between the sides, from their dot and cross products (no inverse trig,
    // so every port gets the same numbers).
    const cos = Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y));
    const sin = Math.abs(d1.x * d2.y - d1.y * d2.x);
    const tanHalf = sin / (1 + cos);
    const sinHalf = Math.sqrt((1 - cos) / 2);
    // A straight run through this corner has nothing to round.
    const t = bl < 1e-6 ? 0 : radius(i) / tanHalf;
    return { v, d1, d2, bx, by, bl, tanHalf, sinHalf, t, l2 };
  });
  // Where two curves would overlap along a side, each gives way in proportion.
  const most = turns.map((c, i) => {
    const before = turns[(i - 1 + n) % n]!;
    const after = turns[(i + 1) % n]!;
    const share = (other: number, len: number) =>
      c.t + other > 0 ? (len * c.t) / (c.t + other) : 0;
    return Math.min(share(before.t, before.l2), share(after.t, c.l2));
  });
  const arcs = turns.map((c, i) => {
    if (c.t === 0) return { a: c.v, b: c.v, c: c.v, r: 0 };
    const t = Math.min(c.t, most[i]!);
    const r = t * c.tanHalf;
    const k = r / c.sinHalf / c.bl;
    return {
      a: { x: c.v.x + c.d1.x * t, y: c.v.y + c.d1.y * t },
      b: { x: c.v.x + c.d2.x * t, y: c.v.y + c.d2.y * t },
      c: { x: c.v.x + c.bx * k, y: c.v.y + c.by * k },
      r,
    };
  });
  const raw: Point[] = [];
  arcs.forEach((arc, i) => {
    if (arc.r > 0) {
      const a0 = Math.atan2(arc.a.y - arc.c.y, arc.a.x - arc.c.x);
      let sweep = Math.atan2(arc.b.y - arc.c.y, arc.b.x - arc.c.x) - a0;
      if (sweep > Math.PI) sweep -= Math.PI * 2;
      if (sweep < -Math.PI) sweep += Math.PI * 2;
      const steps = Math.max(1, Math.ceil((Math.abs(sweep) * arc.r) / 2));
      for (let j = 0; j < steps; j++) {
        const th = a0 + (sweep * j) / steps;
        raw.push({ x: arc.c.x + Math.cos(th) * arc.r, y: arc.c.y + Math.sin(th) * arc.r });
      }
    }
    const to = arcs[(i + 1) % n]!.a;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - arc.b.x, to.y - arc.b.y) / 2));
    for (let j = 0; j < steps; j++) {
      raw.push({
        x: arc.b.x + ((to.x - arc.b.x) * j) / steps,
        y: arc.b.y + ((to.y - arc.b.y) * j) / steps,
      });
    }
  });
  return raw;
};

/** Corners given in the loop's space (-1 to 1 each way from its middle), scaled to `ax` by `by` about the middle. */
const placeCorners = (
  unit: readonly (readonly [number, number])[],
  frame: ParkFrame,
  half: number,
  sx: number,
  sy: number,
): Point[] => {
  const { cx, cy, ax, by } = loopSpace(frame, half);
  return unit.map(([u, v]) => ({ x: cx + u * ax * sx, y: cy + v * by * sy }));
};

/**
 * A canyon road: straights joined by corners as tight as the lanes allow, pointed at the ends and kinked along the
 * sides like a road cut round the rock; counterclockwise on screen. Each corner is nudged at random and the whole
 * thing may be mirrored either way.
 */
const switchbackOutline = (
  rng: () => number,
  frame: ParkFrame,
  half: number,
  /** 1 for the full kinks and points; less blunts them, for a screen too short to turn so tightly. */
  amount: number,
): Point[] => {
  const base: [number, number][] = [
    [0.78, -1],
    [0.12, -0.72],
    [-0.5, -1],
    [-1, 0.08],
    [-0.62, 1],
    [0.18, 0.76],
    [0.84, 1],
    [1, -0.04],
  ];
  const fx = rng() < 0.5 ? 1 : -1;
  const fy = rng() < 0.5 ? 1 : -1;
  const unit = base.map(([u, v]) => {
    // Blunting moves the corners either side of a point out to the end, and the kinks out to the side.
    const bu = Math.abs(v) === 1 ? Math.sign(u) * (1 - (1 - Math.abs(u)) * amount) : u;
    const bv =
      Math.abs(v) === 1 || Math.abs(u) === 1 ? v : Math.sign(v) * (1 - (1 - Math.abs(v)) * amount);
    const ju = Math.abs(u) === 1 || Math.abs(v) === 1 ? bu + (rng() - 0.5) * 0.16 * amount : bu;
    const jv = Math.abs(v) === 1 ? bv : bv + (rng() - 0.5) * 0.2 * amount;
    return [Math.max(-1, Math.min(1, ju)) * fx, jv * fy] as [number, number];
  });
  // A mirror image runs the other way round; put it back counterclockwise.
  if (fx * fy < 0) unit.reverse();
  const corners = placeCorners(unit, frame, half, 0.9 + rng() * 0.08, 0.92 + rng() * 0.06);
  const radii = corners.map(() => cornerRadius(half) * CORNER_SOFTEN * (1.03 + rng() * 0.15));
  return roundedPolygon(corners, (i) => radii[i]!);
};

/**
 * A manor's drive: a rectangle with its corners cut off, and (where there is room) a shallow forecourt pushed in at
 * the middle of its top or bottom; counterclockwise on screen from the top right.
 */
const manorOutline = (
  rng: () => number,
  frame: ParkFrame,
  half: number,
  court: boolean,
): Point[] => {
  const { ax, by } = loopSpace(frame, half);
  // Across, as a share of the width, for a 45 degree slope.
  const k = by / ax;
  const sx = 0.9 + rng() * 0.07;
  const sy = 0.92 + rng() * 0.06;
  // The cut corners, as a share of the height, and the forecourt's half width and depth.
  // Short of height, the cuts keep long enough to round and leave a side long enough to round too.
  const cut = Math.min(Math.max(0.5, (0.4 + rng() * 0.25) * Math.min(1, 130 / by)), 0.9 - 40 / by);
  const cw = 0.2 + rng() * 0.1;
  const cd = 0.3 + rng() * 0.12;
  const top = rng() < 0.5;
  // A short screen has no room for one: its middle is kept for the house.
  const room = court && by > 200;
  const dent: [number, number][] = [
    [cw + cd * k, -1],
    [cw, -1 + cd],
    [-cw, -1 + cd],
    [-cw - cd * k, -1],
  ];
  const unit: [number, number][] = [
    [1, -1 + cut],
    [1 - cut * k, -1],
    ...(room && top ? dent : []),
    [-1 + cut * k, -1],
    [-1, -1 + cut],
    [-1, 1 - cut],
    [-1 + cut * k, 1],
    ...(room && !top ? dent.map(([u, v]) => [-u, -v] as [number, number]) : []),
    [1 - cut * k, 1],
    [1, 1 - cut],
  ];
  const r = cornerRadius(half) * CORNER_SOFTEN * (1.03 + rng() * 0.1);
  return roundedPolygon(placeCorners(unit, frame, half, sx, sy), () => r);
};

/**
 * A figure of eight: two rounded boxes, one either side of the middle, whose inner corners are joined by two
 * straights that cross in the middle; its right half runs counterclockwise on screen and its left half clockwise.
 * `slant` is how far from the middle (as a share of the height) the crossing straights meet the top and bottom.
 */
const eightOutline = (
  rng: () => number,
  frame: ParkFrame,
  half: number,
  slant: number,
): Point[] => {
  const { by } = loopSpace(frame, half);
  const sx = 0.9 + rng() * 0.08;
  const sy = 0.92 + rng() * 0.06;
  // In the loop's space, where 1 across is `ax` and 1 down is `by`: the straights' ends, `x1` out from the middle.
  const { ax } = loopSpace(frame, half);
  const x1 = (slant * by) / ax;
  const flip = rng() < 0.5 ? 1 : -1;
  // Counterclockwise round the right half: up its far side, left along its top, down across the middle to the left
  // half's bottom, clockwise round that, then up across the middle again.
  const unit: [number, number][] = [
    [1, 1],
    [1, -1],
    [x1, -1],
    [-x1, 1],
    [-1, 1],
    [-1, -1],
    [-x1, -1],
    [x1, 1],
  ].map(([u, v]) => [u!, v! * flip]);
  if (flip < 0) unit.reverse();
  const r = cornerRadius(half) * CORNER_SOFTEN * (1.03 + rng() * 0.1);
  return roundedPolygon(placeCorners(unit, frame, half, sx, sy), () => r);
};

/**
 * Softens a closed outline so its corners and kinks read as curves: evenly resampled, then each point moved to the
 * average of those within `reach` px either way along it, twice.
 */
const softened = (raw: readonly Point[], reach: number): Point[] => {
  const even = buildTrack(raw);
  let points = even.points;
  const n = points.length;
  const w = Math.max(1, Math.round(reach / even.step));
  for (let pass = 0; pass < 2; pass++) {
    const from = points;
    points = from.map((_, i) => {
      let x = 0;
      let y = 0;
      for (let j = -w; j <= w; j++) {
        const p = from[(i + j + n) % n]!;
        x += p.x;
        y += p.y;
      }
      return { x: x / (w * 2 + 1), y: y / (w * 2 + 1) };
    });
  }
  return points;
};

/**
 * How far along the road a switchback's, manor's or figure of eight's outline is averaged out (see `softened`), as
 * shares of its length: the most first, then less where that tightens a bend too far.
 */
const SOFTEN_REACH = [0.022, 0.014, 0.007];

/** Resamples a closed outline to evenly spaced points and works out its directions. */
export const buildTrack = (raw: readonly Point[], samples = TRACK_SAMPLES): Track => {
  const lengths = [0];
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1]!;
    const b = raw[i % raw.length]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const length = lengths[raw.length]!;
  const step = length / samples;
  const points: Point[] = [];
  let k = 0;
  for (let i = 0; i < samples; i++) {
    const at = i * step;
    while (lengths[k + 1]! < at) k++;
    const t = (at - lengths[k]!) / (lengths[k + 1]! - lengths[k]! || 1);
    const a = raw[k]!;
    const b = raw[(k + 1) % raw.length]!;
    points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  const tangents = points.map((_, i) => {
    const a = points[(i - 1 + samples) % samples]!;
    const b = points[(i + 1) % samples]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const centre = points.reduce((c, p) => ({ x: c.x + p.x / samples, y: c.y + p.y / samples }), {
    x: 0,
    y: 0,
  });
  // Whichever side of the tangent faces away from the middle at the rightmost point is outward everywhere.
  let right = 0;
  points.forEach((p, i) => p.x > points[right]!.x && (right = i));
  const flip = tangents[right]!.y * (points[right]!.x - centre.x) < 0 ? -1 : 1;
  const normals = tangents.map((t) => ({ x: t.y * flip, y: -t.x * flip }));
  return { points, tangents, normals, length, step };
};

/** Largest curvature anywhere on the loop, so the lanes can be checked for kinks. */
export const maxCurvature = (track: Track): number => {
  const { tangents, step } = track;
  let most = 0;
  for (let i = 0; i < tangents.length; i++) {
    const a = tangents[i]!;
    const b = tangents[(i + 1) % tangents.length]!;
    most = Math.max(most, Math.abs(a.x * b.y - a.y * b.x) / step);
  }
  return most;
};

/** The loop's centre line keeps at least this far from where it bends tightest, so the inner lane never folds. */
const minRadius = (half: number): number => (half + 16) / 0.85;

/**
 * The tightest a switchback's, manor's or figure of eight's corners go: tighter than a loop's bends, as they need room
 * to turn in a phone's height, but still clear of folding the inner lane.
 */
const cornerRadius = (half: number): number => half / 0.84;

/**
 * How much rounder than `cornerRadius` the corners are drawn, where their sides leave room, so the road reads as
 * curves rather than a polygon.
 */
const CORNER_SOFTEN = 1.25;

const fits = (track: Track, frame: ParkFrame, half: number, radius = minRadius(half)): boolean => {
  const m = frameMargins(frame);
  const within = (p: Point) =>
    p.x > m.left && p.x < frame.w - m.right && p.y > m.top && p.y < frame.h - m.bottom;
  // Both edges, as a figure of eight's normals point inward on its left half.
  return (
    maxCurvature(track) * radius < 1 &&
    edge(track, half).every(within) &&
    edge(track, -half).every(within)
  );
};

/**
 * Whether the road keeps clear of itself across the middle: every point of its inner edge at least `MIDDLE_GAP` further
 * than the road's half width from the centre line anywhere not just beside it.
 */
const clearOfItself = (track: Track, half: number): boolean => {
  const inner = edge(track, -half);
  const n = track.points.length;
  const near = Math.ceil((half * 4) / track.step);
  const least = (half + MIDDLE_GAP) * (half + MIDDLE_GAP);
  for (let i = 0; i < n; i++) {
    const p = inner[i]!;
    for (let j = 0; j < n; j++) {
      const apart = Math.abs(i - j);
      if (Math.min(apart, n - apart) <= near) continue;
      const q = track.points[j]!;
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      if (dx * dx + dy * dy < least) return false;
    }
  }
  return true;
};
const MIDDLE_GAP = 6;

const makeTrack = (
  rng: () => number,
  frame: ParkFrame,
  half: number,
  course: CourseSpec,
): Track => {
  const track = loopTrack(rng, frame, half, course);
  return course.river ? squiggled(track, rng, frame, half) : track;
};

/**
 * A river's S-bends: along its straighter stretches its centre line swings in and back out by up to twice `RIVER_SWING`,
 * once every `RIVER_WAVE` or so, fading out where it already bends.
 */
const RIVER_SWING = 12;
const RIVER_WAVE = 260;

/** `track` winding in S-bends (see `RIVER_SWING`), less where they would not fit, or as it was if even small ones won't. */
const squiggled = (track: Track, rng: () => number, frame: ParkFrame, half: number): Track => {
  const { points, normals, tangents, step } = track;
  const n = points.length;
  const waves = Math.max(3, Math.round(track.length / RIVER_WAVE));
  const phase = rng() * Math.PI * 2;
  const radius = minRadius(half);
  const bend = tangents.map((a, i) => {
    const b = tangents[(i + 1) % n]!;
    return Math.abs(a.x * b.y - a.y * b.x) / step;
  });
  // How much room each point has to swing: none within half a wave of a bend as tight as a loop's may go, all where
  // it is straight; then eased in and out.
  const reach = Math.max(1, Math.round(RIVER_WAVE / 2 / step));
  const room = bend.map((_, i) => {
    let most = 0;
    for (let j = -reach; j <= reach; j++) most = Math.max(most, bend[(i + j + n) % n]!);
    return Math.min(1, Math.max(0, 1 - most * radius * 1.5));
  });
  const eased = room.map((_, i) => {
    let sum = 0;
    for (let j = -reach; j <= reach; j++) sum += room[(i + j + n) % n]!;
    return sum / (reach * 2 + 1);
  });
  for (let swing = RIVER_SWING; swing >= 4; swing *= 0.6) {
    const raw = points.map((p, i) => {
      // Only ever inward, so the river never swings off the screen.
      const d = swing * eased[i]! * (Math.sin((i / n) * waves * Math.PI * 2 + phase) - 1);
      return { x: p.x + normals[i]!.x * d, y: p.y + normals[i]!.y * d };
    });
    const out = buildTrack(raw);
    if (fits(out, frame, half)) return out;
  }
  return track;
};

/** The loop for `course`'s layout, or a plain rounded rectangle where none fits. */
const loopTrack = (
  rng: () => number,
  frame: ParkFrame,
  half: number,
  course: CourseSpec,
): Track => {
  const { bend, river, layout } = course;
  for (let tries = 0; tries < 80; tries++) {
    // A river winds as much as it can: when its bends don't fit, they ease off a little each try rather than giving up.
    const amount = river ? bend * Math.max(0.3, 1 - tries / 50) : bend;
    const raw =
      layout === 'switchback'
        ? switchbackOutline(rng, frame, half, Math.max(0, 1 - tries / 50))
        : layout === 'manor'
          ? manorOutline(rng, frame, half, tries < 40)
          : layout === 'eight'
            ? eightOutline(rng, frame, half, Math.max(0.5, 1.1 - tries / 80))
            : loopOutline(rng, frame, half, amount);
    const radius = layout === 'loop' ? minRadius(half) : cornerRadius(half);
    // Softened where that still fits: averaging tightens a bend that is already as tight as it can go.
    const track = buildTrack(raw);
    if (layout !== 'loop')
      for (const share of SOFTEN_REACH) {
        const soft = buildTrack(softened(raw, track.length * share));
        if (fits(soft, frame, half, radius) && (layout === 'eight' || clearOfItself(soft, half)))
          return soft;
      }
    if (fits(track, frame, half, radius)) return track;
  }

  // A plain rounded rectangle always fits and, however long or square the screen, still reaches its edges.
  const { cx, cy, ax, by } = loopSpace(frame, half);
  const a = ax * 0.95;
  const b = by * 0.95;
  const r = Math.min(a, b, Math.max(minRadius(half) * 1.05, Math.min(a, b) * 0.8));
  const raw: Point[] = [];
  // Corners counterclockwise on screen from the top right, each turning a further quarter (angles decrease, y down).
  const corners = [
    { x: cx + a - r, y: cy - b + r },
    { x: cx - a + r, y: cy - b + r },
    { x: cx - a + r, y: cy + b - r },
    { x: cx + a - r, y: cy + b - r },
  ];
  corners.forEach((c, i) => {
    const next = corners[(i + 1) % 4]!;
    for (let j = 0; j < 90; j++) {
      const th = (-(i + j / 90) * Math.PI) / 2;
      raw.push({ x: c.x + Math.cos(th) * r, y: c.y + Math.sin(th) * r });
    }
    // The straight to the next corner.
    const th = (-(i + 1) * Math.PI) / 2;
    const from = { x: c.x + Math.cos(th) * r, y: c.y + Math.sin(th) * r };
    const to = { x: next.x + Math.cos(th) * r, y: next.y + Math.sin(th) * r };
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
    for (let j = 0; j < steps; j++) {
      raw.push({
        x: from.x + ((to.x - from.x) * j) / steps,
        y: from.y + ((to.y - from.y) * j) / steps,
      });
    }
  });
  return buildTrack(raw);
};

// ---------------------------------------------------------------------------------------------------------------
// Entrances and short cuts.

const makeEntrances = (
  track: Track,
  wall: Rect,
  half: number,
  rng: () => number,
  eight = false,
): Entrance[] => {
  const count = rng() < 0.5 ? 3 : 4;
  const { normals, step, length } = track;
  const corner = WALL_RADIUS + 34;
  // The side of the road facing the wall: always outward on a loop; on a figure of eight, away from the middle.
  const middle = { x: wall.x + wall.w / 2, y: wall.y + wall.h / 2 };
  const sideAt = (i: number): 1 | -1 => {
    if (!eight) return 1;
    const p = track.points[i]!;
    const n = normals[i]!;
    return n.x * (p.x - middle.x) + n.y * (p.y - middle.y) >= 0 ? 1 : -1;
  };
  // Only where the loop faces a side of the wall squarely, so each gate opens straight onto a street.
  const candidates: number[] = [];
  normals.forEach((nrm, i) => {
    if (Math.abs(nrm.x) < 0.94 && Math.abs(nrm.y) < 0.94) return;
    const t = pose(track, i * step, sideAt(i) * (half + 8));
    const vertical = Math.abs(nrm.y) > Math.abs(nrm.x);
    const along = vertical ? t.x : t.y;
    const [lo, hi] = vertical ? [wall.x, wall.x + wall.w] : [wall.y, wall.y + wall.h];
    if (along > lo + corner && along < hi - corner) candidates.push(i);
  });
  let best: number[] = [];
  let bestGap = -1;
  for (let tries = 0; tries < 300 && candidates.length >= count; tries++) {
    const pick = Array.from(
      { length: count },
      () => candidates[Math.floor(rng() * candidates.length)]!,
    ).sort((a, b) => a - b);
    let gap = Infinity;
    for (let i = 0; i < count; i++) {
      const a = pick[i]! * step;
      const b = (i + 1 < count ? pick[i + 1]! : pick[0]! + normals.length) * step;
      gap = Math.min(gap, b - a);
    }
    if (gap > bestGap) {
      bestGap = gap;
      best = pick;
    }
    if (gap > length / count - 60 * ART) break;
  }
  return best.map((i, id) => {
    const s = i * step;
    const side = sideAt(i);
    const nrm = { x: normals[i]!.x * side, y: normals[i]!.y * side };
    const throat = pose(track, s, side * (half + 8));
    let gate: Point;
    let street: Point;
    // Movers appear on the far pavement and cross the street to the gate.
    const out = CITY_SETBACK - 4;
    if (Math.abs(nrm.y) > Math.abs(nrm.x)) {
      const top = nrm.y < 0;
      gate = { x: throat.x, y: top ? wall.y : wall.y + wall.h };
      street = { x: throat.x, y: gate.y + (top ? -out : out) };
    } else {
      const left = nrm.x < 0;
      gate = { x: left ? wall.x : wall.x + wall.w, y: throat.y };
      street = { x: gate.x + (left ? -out : out), y: throat.y };
    }
    return { id, s, street, gate, throat, side };
  });
};

/** One or two paths across the short way, from the top of the loop to the bottom. */
const makeShortcuts = (
  track: Track,
  entrances: readonly Entrance[],
  half: number,
  rng: () => number,
): Shortcut[] => {
  const { normals, step, length } = track;
  const tops: number[] = [];
  const bottoms: number[] = [];
  // Through the middle stretch only, so a short cut skips a good part of the loop.
  const xs = track.points.map((p) => p.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const reach = ((Math.max(...xs) - Math.min(...xs)) / 2) * 0.6;
  normals.forEach((n, i) => {
    if (Math.abs(track.points[i]!.x - mid) > reach) return;
    if (n.y < -0.85) tops.push(i);
    else if (n.y > 0.85) bottoms.push(i);
  });
  const want = rng() < 0.55 ? 2 : 1;
  const out: Shortcut[] = [];
  const ends: number[] = entrances.map((e) => e.s);
  for (let tries = 0; tries < 200 && out.length < want && tops.length && bottoms.length; tries++) {
    const a = tops[Math.floor(rng() * tops.length)]! * step;
    const pa = pose(track, a, -half - 2);
    // The bottom end within a little of straight across.
    const near = bottoms.filter((i) => Math.abs(track.points[i]!.x - pa.x) < 110);
    if (!near.length) continue;
    const b = near[Math.floor(rng() * near.length)]! * step;
    const clear = (s: number): boolean =>
      ends.every((e) => Math.abs(loopDelta(e, s, length)) > 90) &&
      out.every(
        (c) =>
          Math.abs(loopDelta(c.a, s, length)) > 120 && Math.abs(loopDelta(c.b, s, length)) > 120,
      );
    if (!clear(a) || !clear(b)) continue;
    const pb = pose(track, b, -half - 2);
    const na = normals[Math.round(a / step) % normals.length]!;
    const nb = normals[Math.round(b / step) % normals.length]!;
    const bend = (rng() * 2 - 1) * 70;
    const path = cubic(
      pa,
      { x: pa.x - na.x * 70 + bend, y: pa.y - na.y * 70 },
      { x: pb.x - nb.x * 70 + bend, y: pb.y - nb.y * 70 },
      pb,
      28,
    );
    out.push({ id: out.length, a, b, path });
  }
  return out;
};

/**
 * A manor's hall: straight across the middle from the top of the loop to the bottom, through the house, clear of the
 * entrances.
 */
const makeHall = (track: Track, entrances: readonly Entrance[], half: number): Shortcut[] => {
  const ends = hallEnds(track, entrances);
  if (!ends) return [];
  const { a, b } = ends;
  const pa = pose(track, a, -half - 2);
  const pb = pose(track, b, -half - 2);
  const path = cubic(
    pa,
    { x: pa.x + (pb.x - pa.x) / 3, y: pa.y + (pb.y - pa.y) / 3 },
    { x: pa.x + ((pb.x - pa.x) * 2) / 3, y: pa.y + ((pb.y - pa.y) * 2) / 3 },
    pb,
    20,
  );
  return [{ id: 0, a, b, path }];
};

// ---------------------------------------------------------------------------------------------------------------
// Side roads.

/** Where a side road's samples are, about this far apart. */
const SIDE_STEP = 4;
/** The tightest a side road bends: its inside edge turning round this far from its middle. */
const SIDE_BEND_ROOM = 2;
/** How far either end of a side road may run over the loop's road before it must be clear of it. */
const SIDE_MERGE = 110;

/**
 * An open road through `raw` (a polyline), resampled every `SIDE_STEP` px or so, its normals on the side `flip` picks
 * as `buildTrack` does (so they match the loop's where it joins it).
 */
const openTrack = (raw: readonly Point[], flip: number): Track => {
  const lengths = [0];
  for (let i = 1; i < raw.length; i++)
    lengths.push(
      lengths[i - 1]! + Math.hypot(raw[i]!.x - raw[i - 1]!.x, raw[i]!.y - raw[i - 1]!.y),
    );
  const length = lengths[raw.length - 1]!;
  const n = Math.max(2, Math.round(length / SIDE_STEP) + 1);
  const step = length / (n - 1);
  const points: Point[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const at = Math.min(i * step, length);
    while (k < raw.length - 2 && lengths[k + 1]! < at) k++;
    const t = (at - lengths[k]!) / (lengths[k + 1]! - lengths[k]! || 1);
    const a = raw[k]!;
    const b = raw[k + 1]!;
    points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  const tangents = points.map((_, i) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const normals = tangents.map((t) => ({ x: t.y * flip, y: -t.x * flip }));
  return { points, tangents, normals, length, step };
};

/** The point `d` px out from an open road's centre line at `s` (held to its ends), and the direction there. */
export const openPose = (track: Track, s: number, d = 0): Pose => {
  const { points, normals, tangents, step } = track;
  const n = points.length;
  const f = Math.max(0, Math.min(n - 1, s / step));
  const i = Math.min(n - 2, Math.floor(f));
  const j = i + 1;
  const t = f - i;
  const nx = normals[i]!.x + (normals[j]!.x - normals[i]!.x) * t;
  const ny = normals[i]!.y + (normals[j]!.y - normals[i]!.y) * t;
  const nl = Math.hypot(nx, ny) || 1;
  const tx = tangents[i]!.x + (tangents[j]!.x - tangents[i]!.x) * t;
  const ty = tangents[i]!.y + (tangents[j]!.y - tangents[i]!.y) * t;
  return {
    x: points[i]!.x + (points[j]!.x - points[i]!.x) * t + (nx / nl) * d,
    y: points[i]!.y + (points[j]!.y - points[i]!.y) * t + (ny / nl) * d,
    angle: Math.atan2(ty, tx),
  };
};

/**
 * A smooth curve through `knots`, leaving the first along `start` and arriving at the last along `end` (unit
 * vectors): Catmull-Rom between the knots, as cubic pieces of `SPLINE_STEPS` points each.
 */
const SPLINE_STEPS = 16;
const spline = (knots: readonly Point[], start: Point, end: Point): Point[] => {
  const n = knots.length;
  const tangent = (i: number): Point => {
    if (i === 0) {
      const l = Math.hypot(knots[1]!.x - knots[0]!.x, knots[1]!.y - knots[0]!.y);
      return { x: start.x * l, y: start.y * l };
    }
    if (i === n - 1) {
      const l = Math.hypot(knots[n - 1]!.x - knots[n - 2]!.x, knots[n - 1]!.y - knots[n - 2]!.y);
      return { x: end.x * l, y: end.y * l };
    }
    return {
      x: (knots[i + 1]!.x - knots[i - 1]!.x) / 2,
      y: (knots[i + 1]!.y - knots[i - 1]!.y) / 2,
    };
  };
  const out: Point[] = [knots[0]!];
  for (let i = 0; i < n - 1; i++) {
    const a = knots[i]!;
    const b = knots[i + 1]!;
    const ta = tangent(i);
    const tb = tangent(i + 1);
    const piece = cubic(
      a,
      { x: a.x + ta.x / 3, y: a.y + ta.y / 3 },
      { x: b.x - tb.x / 3, y: b.y - tb.y / 3 },
      b,
      SPLINE_STEPS,
    );
    out.push(...piece.slice(1));
  }
  return out;
};

/** Which way the loop's normals turn from its tangents: 1 if they are the tangents turned as `buildTrack` turns them. */
const flipOf = (track: Track): number => {
  const t = track.tangents[0]!;
  const n = track.normals[0]!;
  return n.x * t.y - n.y * t.x > 0 ? 1 : -1;
};

/**
 * Whether a side road is clear of the loop (bar its ends, where it runs onto it), of itself where it doubles back,
 * and of the other side roads.
 */
const sideRoadFits = (
  road: Track,
  track: Track,
  half: number,
  laneW: number,
  others: readonly Track[],
): boolean => {
  const edgeOut = laneW + 6;
  const inner = edge(track, -half - 4);
  const { points, normals } = road;
  const skip = Math.ceil(SIDE_MERGE / road.step);
  for (let i = skip; i < points.length - skip; i++) {
    for (const k of [-1, 1]) {
      const p = points[i]!;
      const x = p.x + normals[i]!.x * k * edgeOut;
      const y = p.y + normals[i]!.y * k * edgeOut;
      if (!insidePolygon(inner, x, y)) return false;
      if (nearPolyline(inner, { x, y }, 8, true)) return false;
    }
  }
  // Never bending so tightly that its inside edge folds over.
  const { tangents } = road;
  const span = 2;
  const most = (2 * span * road.step) / (laneW + SIDE_BEND_ROOM);
  for (let i = span; i < points.length - span; i++) {
    const a = tangents[i - span]!;
    const b = tangents[i + span]!;
    if (Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)) > most) return false;
  }
  // Where it doubles back, its two stretches keep a road's width and a verge apart.
  const apart = 2 * edgeOut + 10;
  const gap = Math.ceil((3 * apart) / road.step);
  for (let i = skip; i < points.length - skip; i += 2)
    for (let j = i + gap; j < points.length - skip; j += 2)
      if (Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y) < apart)
        return false;
  for (const o of others)
    for (let i = 0; i < points.length; i += 2)
      if (nearPolyline(o.points, points[i]!, apart + 4)) return false;
  return true;
};

/**
 * A manor's side roads: the hall, through the house from the top of the drive to the bottom, and the graveyard
 * road, hanging off one end of the drive into the grounds and back, coming on again behind where it left. Either is
 * left out where the grounds are too small for it.
 */
const makeSideRoads = (
  track: Track,
  entrances: readonly Entrance[],
  half: number,
  laneW: number,
): SideRoad[] => {
  // The hall across the middle; where that leaves no room for the graveyard road, as on a phone, off to one side.
  const first = sideRoadsWith(track, entrances, half, laneW, 0.5);
  if (first.length > 1) return first;
  for (const at of HALL_ASIDE) {
    const roads = sideRoadsWith(track, entrances, half, laneW, at);
    if (roads.length > 1) return roads;
  }
  return first;
};

/** A manor's side roads with the hall `at` that share of the way along the drive. */
const sideRoadsWith = (
  track: Track,
  entrances: readonly Entrance[],
  half: number,
  laneW: number,
  at: number,
): SideRoad[] => {
  const { length } = track;
  const flip = flipOf(track);
  const centre = -half + laneW;
  const out: SideRoad[] = [];
  const clear = (s: number, by: number) =>
    entrances.every((e) => Math.abs(loopDelta(e.s, s, length)) > by);
  const ends = hallEnds(track, entrances, at);
  if (ends) {
    const { a, b } = ends;
    const pa = pose(track, a, centre);
    const pb = pose(track, b, centre);
    const ta = { x: Math.cos(pa.angle), y: Math.sin(pa.angle) };
    const tb = { x: Math.cos(pb.angle), y: Math.sin(pb.angle) };
    const span = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    // Pulled along the drive as far as it can be and still fit.
    for (const share of HALL_PULLS) {
      const pull = span * share;
      const raw = cubic(
        pa,
        { x: pa.x + ta.x * pull, y: pa.y + ta.y * pull },
        { x: pb.x - tb.x * pull, y: pb.y - tb.y * pull },
        pb,
        48,
      );
      const road = openTrack(raw, flip);
      if (!sideRoadFits(road, track, half, laneW, [])) continue;
      out.push({ id: 0, kind: 'hall', a, b, track: road, back: false });
      break;
    }
  }
  // The graveyard road: off a straight stretch of the drive, as deep into the grounds as it can go, as near the
  // middle of one end of the drive as it can be.
  const hall = out.map((r) => r.track);
  const xs = track.points.map((p) => p.x);
  const midX = out.length
    ? track.points[Math.round(out[0]!.a / track.step) % track.points.length]!.x
    : (Math.min(...xs) + Math.max(...xs)) / 2;
  // The middle of each end of the drive, up and down.
  const endMid = [-1, 1].map((side) => {
    const ys = track.points.flatMap((p, i) => (track.normals[i]!.x * side >= 0.9 ? [p.y] : []));
    return ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
  });
  const spots: { s: number; rank: number }[] = [];
  const every = Math.max(1, Math.round(GRAVE_EVERY / track.step));
  for (let i = 0; i < track.points.length; i += every) {
    const n = track.normals[i]!;
    const p = track.points[i]!;
    // Nearest the middle of an end first, then along the top and bottom, furthest from the hall first.
    if (Math.abs(n.x) >= 0.9)
      spots.push({ s: i * track.step, rank: Math.abs(p.y - endMid[n.x < 0 ? 0 : 1]!) });
    else if (Math.abs(n.y) >= 0.9)
      spots.push({ s: i * track.step, rank: 1000 - Math.abs(p.x - midX) });
  }
  spots.sort((a, b) => a.rank - b.rank);
  let found: SideRoad | null = null;
  for (const depth of GRAVE_DEPTHS) {
    for (const { s: sMid } of spots) {
      const road = graveyardRoad(track, sMid, depth, centre, flip);
      if (!road) continue;
      const { a, b } = road;
      if (!clear(a, 70) || !clear(b, 70)) continue;
      if (
        out.some(
          (r) =>
            Math.abs(loopDelta(r.a, a, length)) < 120 || Math.abs(loopDelta(r.b, b, length)) < 120,
        )
      )
        continue;
      if (!sideRoadFits(road.track, track, half, laneW, hall)) continue;
      found = { id: out.length, kind: 'graveyard', a, b, track: road.track, back: true };
      break;
    }
    if (found) break;
  }
  // Where the grounds are too shallow for that, as on a phone: a long, flat loop under one side of the drive,
  // turning down off it, back along under it and up onto it again behind where it left.
  for (const gap of found ? [] : FLAT_GAPS) {
    for (const depth of FLAT_DEPTHS) {
      for (const { s: sMid } of spots) {
        const road = flatGraveyardRoad(track, sMid, depth, gap, centre, flip);
        const { a, b } = road;
        // Its ends are on the inner lanes, so they can be nearer the gates, which come in on the outer one.
        if (!clear(a, 30) || !clear(b, 30)) continue;
        if (
          out.some(
            (r) =>
              Math.abs(loopDelta(r.a, a, length)) < 120 ||
              Math.abs(loopDelta(r.b, b, length)) < 120,
          )
        )
          continue;
        if (!sideRoadFits(road.track, track, half, laneW, hall)) continue;
        found = { id: out.length, kind: 'graveyard', a, b, track: road.track, back: true };
        break;
      }
      if (found) break;
    }
    if (found) break;
  }
  if (found) out.push(found);
  return out;
};

/**
 * A flat graveyard road under the drive round `sMid`: off the drive ahead of it, turning back under it `depth` in,
 * and up onto it again `gap` behind where it left.
 */
const flatGraveyardRoad = (
  track: Track,
  sMid: number,
  depth: number,
  gap: number,
  centre: number,
  flip: number,
): { a: number; b: number; track: Track } => {
  const { length } = track;
  const a = wrap(sMid + gap / 2, length);
  const b = wrap(sMid - gap / 2, length);
  const pa = pose(track, a, centre);
  const pb = pose(track, b, centre);
  const u = { x: Math.cos(pa.angle), y: Math.sin(pa.angle) };
  const na = pose(track, a, centre + 1);
  const v = { x: pa.x - na.x, y: pa.y - na.y };
  const vl = Math.hypot(v.x, v.y) || 1;
  v.x /= vl;
  v.y /= vl;
  const at = (du: number, dv: number): Point => ({
    x: pa.x + u.x * du + v.x * dv,
    y: pa.y + u.y * du + v.y * dv,
  });
  const back = (pb.x - pa.x) * u.x + (pb.y - pa.y) * u.y;
  // A half circle down off the drive, the straight back under it, and a half circle up onto it.
  const turn = depth / 2;
  const raw: Point[] = [];
  for (let k = 0; k <= FLAT_TURN_STEPS; k++) {
    const th = (k / FLAT_TURN_STEPS) * Math.PI;
    raw.push(at(turn * Math.sin(th), turn - turn * Math.cos(th)));
  }
  for (let k = 0; k <= FLAT_TURN_STEPS; k++) {
    const th = (k / FLAT_TURN_STEPS) * Math.PI;
    raw.push(at(back - turn * Math.sin(th), turn + turn * Math.cos(th)));
  }
  raw[raw.length - 1] = { x: pb.x, y: pb.y };
  return { a, b, track: openTrack(raw, flip) };
};

/** A graveyard road round the middle of the drive at `sMid`, `depth` into the grounds. */
const graveyardRoad = (
  track: Track,
  sMid: number,
  depth: number,
  centre: number,
  flip: number,
): { a: number; b: number; track: Track } => {
  const { length } = track;
  // Leaves ahead of the middle and comes back on behind it.
  const a = wrap(sMid + GRAVE_GAP / 2, length);
  const b = wrap(sMid - GRAVE_GAP / 2, length);
  const pa = pose(track, a, centre);
  const pb = pose(track, b, centre);
  const u = { x: Math.cos(pa.angle), y: Math.sin(pa.angle) };
  // Into the grounds: against the loop's outward normal there.
  const na = pose(track, a, centre + 1);
  const v = { x: pa.x - na.x, y: pa.y - na.y };
  const vl = Math.hypot(v.x, v.y) || 1;
  v.x /= vl;
  v.y /= vl;
  const at = (du: number, dv: number): Point => ({
    x: pa.x + u.x * du + v.x * dv,
    y: pa.y + u.y * du + v.y * dv,
  });
  // Where the far end is along the drive from the near one (behind it, so negative).
  const back = (pb.x - pa.x) * u.x + (pb.y - pa.y) * u.y;
  const r = GRAVE_TURN;
  const wig = GRAVE_WIGGLE;
  const knots = [
    { x: pa.x, y: pa.y },
    at(r, r),
    at(r + wig, depth * 0.55),
    at(r * 0.5, depth),
    at(back / 2, depth + wig),
    at(back - r * 0.5, depth),
    at(back - r - wig, depth * 0.55),
    at(back - r, r),
    { x: pb.x, y: pb.y },
  ];
  const tb = { x: Math.cos(pb.angle), y: Math.sin(pb.angle) };
  return { a, b, track: openTrack(spline(knots, u, tb), flip) };
};

/** A side road as short cuts for the scenery to keep clear of: its centre line and a lane's width either side. */
const sideClearance = (road: SideRoad, laneW: number): Shortcut[] =>
  [-laneW, 0, laneW].map((d) => ({
    id: -1,
    a: road.a,
    b: road.b,
    path: road.track.points.map((p, i) => ({
      x: p.x + road.track.normals[i]!.x * d,
      y: p.y + road.track.normals[i]!.y * d,
    })),
  }));

/** Where else along the drive the hall may go, as shares of the way along, to leave room for the graveyard road. */
const HALL_ASIDE = [0.68, 0.32, 0.75, 0.25];
/** How far the hall's ends pull it along the drive before it turns across, as a share of the way across: the first of these that fits. */
const HALL_PULLS = [0.32, 0.4, 0.5, 0.6, 0.67, 0.25];
/** The graveyard road: how far apart along the drive its ends are, how tight its turns, how much it winds, and how
 * deep into the grounds it goes (the deepest that fits). */
const GRAVE_GAP = 60;
const GRAVE_TURN = 34;
const GRAVE_WIGGLE = 14;
const GRAVE_DEPTHS = [190, 170, 150, 130, 115, 100, 90];
/** A flat graveyard road: how far apart along the drive its ends are, and how far under it it runs. */
const FLAT_GAPS = [160, 130, 100, 80, 60, 40];
const FLAT_DEPTHS = [74, 70, 66];
const FLAT_TURN_STEPS = 24;
/** How far apart along the drive the graveyard road's spots to try are. */
const GRAVE_EVERY = 24;

/**
 * Where a manor's hall leaves the loop and comes back on: straight across the middle from the top of the loop to the
 * bottom, clear of the entrances.
 */
const hallEnds = (
  track: Track,
  entrances: readonly Entrance[],
  at = 0.5,
): { a: number; b: number } | null => {
  const { normals, step, length, points } = track;
  const xs = points.map((p) => p.x);
  const mid = Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * at;
  const reach = (Math.max(...xs) - Math.min(...xs)) * (at === 0.5 ? 0.35 : 0.1);
  const clear = (s: number) => entrances.every((e) => Math.abs(loopDelta(e.s, s, length)) > 70);
  const bottoms = normals.flatMap((n, i) => (n.y > 0.85 ? [i] : []));
  let top = -1;
  let bottom = -1;
  for (const [i, n] of normals.entries()) {
    const x = points[i]!.x;
    if (n.y > -0.85 || Math.abs(x - mid) > reach || !clear(i * step)) continue;
    // Straight across, not slanting.
    const j = bottoms.find((k) => Math.abs(points[k]!.x - x) < 12 && clear(k * step));
    if (j === undefined) continue;
    if (top < 0 || Math.abs(x - mid) < Math.abs(points[top]!.x - mid)) {
      top = i;
      bottom = j;
    }
  }
  return top < 0 ? null : { a: top * step, b: bottom * step };
};

/**
 * Where a figure of eight crosses itself: the two passes through the middle, the one that goes over chosen at random,
 * each stretch as long as the other road is wide (and its rails).
 */
const makeBridge = (track: Track, half: number, rng: () => number): Bridge => {
  const { points, tangents, step, length } = track;
  const n = points.length;
  // The two samples nearest the crossing, one in each half of the loop.
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const at = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
  const nearest = (from: number, to: number): number => {
    let best = from;
    for (let i = from; i < to; i++) {
      const d = Math.hypot(points[i]!.x - at.x, points[i]!.y - at.y);
      if (d < Math.hypot(points[best]!.x - at.x, points[best]!.y - at.y)) best = i;
    }
    return best;
  };
  const i = nearest(0, Math.floor(n / 2));
  const j = nearest(Math.floor(n / 2), n);
  const ti = tangents[i]!;
  const tj = tangents[j]!;
  const sin = Math.abs(ti.x * tj.y - ti.y * tj.x) || 1;
  const len = (half * 2 + 16) / sin;
  const first = rng() < 0.5;
  const over = (first ? i : j) * step;
  const under = (first ? j : i) * step;
  return {
    over: { s: wrap(over - len / 2, length), len },
    under: { s: wrap(under - len / 2, length), len },
    at,
  };
};

/** Whether `s` is on either stretch of a bridge. */
export const onBridge = (bridge: Bridge | null, s: number, length: number, by = 0): boolean =>
  !!bridge &&
  [bridge.over, bridge.under].some((c) =>
    underCover({ s: c.s - by, len: c.len + 2 * by }, s, length),
  );

// ---------------------------------------------------------------------------------------------------------------
// A river across the course.

/** How far a river's centre line runs on past the frame at each end, so its traffic comes and goes out of sight. */
export const RIVER_PAD = 70;
/** A river's banks, either side of its lanes. */
export const RIVER_BANK = 8;
/** Half a river's width, banks and all. */
export const riverHalf = (laneW: number): number => (RIVER_LANES * laneW) / 2 + RIVER_BANK;
/** How far past the loop's edge a river runs straight on from under a bridge before it starts to wind. */
const RIVER_STRAIGHT = 26;
/** How far aside a river swings as it winds across the half it crosses: the first of these that fits. */
const RIVER_BOWS = [60, 44, 30, 18, 0];

/** A stretch of the loop over a river's water, as its first and last samples. */
interface RiverRun {
  from: number;
  to: number;
}

/**
 * How a river winds into the figure of eight: from the middle of the screen's top edge, level with where the figure
 * of eight crosses itself, out in a broad curve into its right half (the far end from the score on an upright phone)
 * and back to the middle of the bottom edge, `RIVER_DEPTHS` of the way to the right of that half and `RIVER_SPREADS`
 * of the screen's height across. The longest that fits.
 */
const RIVER_DEPTHS = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34, 0.26];
const RIVER_SPREADS = [0.3, 0.25, 0.2, 0.16];
/**
 * Where the figure of eight is too small for that, as on an upright phone, the river comes in that much of the way
 * to the right of its half instead: the first of these that fits.
 */
const RIVER_ASIDES = [0, 0.1, 0.2, 0.3, 0.4];
/** The most of the loop a river's bridge may cover, and the most of the river that may run under one. */
const RIVER_BRIDGE_MOST = 220;
/** A river bends no tighter than this many times its half width, so nothing on it ever swings round a sharp corner. */
const RIVER_BEND_MOST = 2;

/**
 * Whether the bell curve `deep` · bump(u) across, with u = y / `wide`, bends nowhere tighter than radius `radius`: its
 * curvature x'' / (1 + x'²)^1.5, squared, in products alone.
 */
const gentleBump = (deep: number, wide: number, radius: number): boolean => {
  for (let k = -150; k <= 150; k++) {
    const u = k / 50;
    const a = 1 - (u * u) / 8;
    if (a <= 0) continue;
    const a2 = a * a;
    const a6 = a2 * a2 * a2;
    const a7 = a6 * a;
    const slope = (deep * (-2 * u * a7)) / wide;
    const curve = (deep * (-2 * a7 + 3.5 * u * u * a6)) / (wide * wide);
    const q = 1 + slope * slope;
    if (curve * curve * radius * radius > q * q * q) return false;
  }
  return true;
};

/**
 * A bell curve, 1 at 0 and 0 from ±√8 on: (1 − u²/8)⁸, near enough exp(−u²), and made of products alone so the
 * apps work it out to the same bit.
 */
const bump = (u: number): number => {
  const a = 1 - (u * u) / 8;
  if (a <= 0) return 0;
  const a2 = a * a;
  const a4 = a2 * a2;
  return a4 * a4;
};

/**
 * A river winding into the figure of eight and back (see `RIVER_DEPTHS`), under it just twice, each on a bridge, and
 * clear of it everywhere else; or none, where it doesn't fit.
 */
const curvedRiver = (
  track: Track,
  half: number,
  water: number,
  frame: ParkFrame,
  bridge: Bridge | null,
): { raw: Point[]; runs: RiverRun[] } | null => {
  const { points, step, length } = track;
  const n = points.length;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = bridge ? bridge.at.x : (Math.min(...xs) + Math.max(...xs)) / 2;
  const y0 = bridge ? bridge.at.y : (Math.min(...ys) + Math.max(...ys)) / 2;
  const right = Math.max(...xs);
  let best: { raw: Point[]; runs: RiverRun[]; length: number } | null = null;
  for (const aside of RIVER_ASIDES) {
    if (best) break;
    const x1 = x0 + (right - x0) * aside;
    for (const depth of RIVER_DEPTHS)
      for (const spread of RIVER_SPREADS) {
        const deep = (right - x1) * depth;
        const wide = frame.h * spread;
        if (!gentleBump(deep, wide, RIVER_BEND_MOST * (water + RIVER_BANK))) continue;
        const raw: Point[] = [];
        for (let y = -RIVER_PAD; y <= frame.h + RIVER_PAD; y += SIDE_STEP)
          raw.push({ x: x1 + deep * bump((y - y0) / wide), y });
        const river = openTrack(raw, 1);
        if (best && river.length <= best.length) continue;
        const runs = riverRuns(track, half, water, river);
        if (runs.length !== 2) continue;
        if (runs.some((r) => (wrap(r.to - r.from, n) + 1) * step > RIVER_BRIDGE_MOST)) continue;
        // Not onto the figure of eight's bridge, or right up to it.
        if (
          bridge &&
          runs.some((r) => {
            for (let k = 0; k <= wrap(r.to - r.from, n); k++)
              if (onBridge(bridge, wrap((r.from + k) * step, length), length, 30)) return true;
            return false;
          })
        )
          continue;
        // Clear of the road everywhere but by those two bridges.
        const crossings = runs.map((r) => points[crossingOf(r, n, points, river)]!);
        const by = half + water + 12;
        const clear = river.points.every((p, j) => {
          if (crossings.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < by)) return true;
          return [-1, 1].every(
            (side) =>
              !nearPolyline(
                points,
                {
                  x: p.x + river.normals[j]!.x * water * side,
                  y: p.y + river.normals[j]!.y * water * side,
                },
                half + 2,
                true,
              ),
          );
        });
        if (!clear) continue;
        best = { raw, runs, length: river.length };
      }
  }
  return best && { raw: best.raw, runs: best.runs };
};

/** The sample of a run of the loop where its centre line comes nearest a river's. */
const crossingOf = (r: RiverRun, n: number, points: readonly Point[], river: Track): number => {
  let cross = r.from;
  let near = Infinity;
  for (let k = 0; k <= wrap(r.to - r.from, n); k++) {
    const i = (r.from + k) % n;
    const j = nearestSample(river, points[i]!);
    const d = Math.hypot(points[i]!.x - river.points[j]!.x, points[i]!.y - river.points[j]!.y);
    if (d < near) {
      near = d;
      cross = i;
    }
  }
  return cross;
};

/** The sample of an open road nearest `p`. */
const nearestSample = (road: Track, p: Point): number => {
  let best = 0;
  let near = Infinity;
  road.points.forEach((q, j) => {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < near) {
      near = d;
      best = j;
    }
  });
  return best;
};

/** Each stretch of the loop over a river's water, in order round the loop. */
const riverRuns = (track: Track, half: number, water: number, river: Track): RiverRun[] => {
  const { points, normals } = track;
  const n = points.length;
  const over = points.map((p, i) => {
    if (!nearPolyline(river.points, p, water + half)) return false;
    const j = nearestSample(river, p);
    const q = river.points[j]!;
    const rn = river.normals[j]!;
    const across = Math.abs((p.x - q.x) * rn.x + (p.y - q.y) * rn.y);
    return across < water + half * Math.abs(normals[i]!.x * rn.x + normals[i]!.y * rn.y);
  });
  const start = over.indexOf(false);
  if (start < 0) return [];
  const runs: RiverRun[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (!over[i]) continue;
    const last = runs[runs.length - 1];
    if (last && over[(i + n - 1) % n]) last.to = i;
    else runs.push({ from: i, to: i });
  }
  return runs;
};

/** The lowest level at which the plank bridge loses a second plank (see `River.gaps`). */
export const PLANK_GAP_LEVEL = 50;

/**
 * A river across the right half of a figure of eight: winding into it from the middle of the screen and back where
 * there's room (see `curvedRiver`), or straight down across it (see `straightRiver`), on out past the frame each way.
 * Its traffic goes down the screen or up it, at random. The first bridge it comes to is of planks, with a plank
 * missing.
 */
const makeRiver = (
  track: Track,
  half: number,
  laneW: number,
  frame: ParkFrame,
  bridge: Bridge | null,
  rng: () => number,
): River | null => {
  const { points, step, length } = track;
  const n = points.length;
  const sign = rng() < 0.5 ? -1 : 1;
  const down = rng() < 0.5;
  // Half the river's water, inside its banks.
  const water = riverHalf(laneW) - RIVER_BANK;
  const found =
    curvedRiver(track, half, water, frame, bridge) ??
    straightRiver(track, half, water, frame, bridge, sign);
  if (!found) return null;
  const raw = down ? found.raw : [...found.raw].reverse();
  const river = openTrack(raw, 1);
  // Each bridge over the whole stretch of loop that runs over the water, and a little more.
  const bridges = found.runs
    .map((r): RiverBridge => {
      const cross = crossingOf(r, n, points, river);
      return {
        at: nearestSample(river, points[cross]!) * river.step,
        over: {
          s: wrap(r.from * step - 8 - step / 2, length),
          len: (wrap(r.to - r.from, n) + 1) * step + 16,
        },
        cross: cross * step,
        planks: false,
      };
    })
    .sort((a, b) => a.at - b.at);
  bridges[0]!.planks = true;
  // A plank gone from one lane, and later one more, always leaving room for a two-lane visitor.
  const lanes = Math.round((2 * half) / laneW);
  const first = Math.floor(rng() * lanes);
  const room = (gaps: number[]) => {
    for (let l = 0; l + 1 < lanes; l++) if (!gaps.includes(l) && !gaps.includes(l + 1)) return true;
    return false;
  };
  const later = [...Array(lanes).keys()].filter((l) => l !== first && room([first, l]));
  const gaps = later.length ? [first, later[Math.floor(rng() * later.length)]!] : [first];
  return { track: river, bridges, gaps };
};

/**
 * Where a river can't wind into the figure of eight (see `curvedRiver`), as on a phone: straight down across the
 * right half of the loop, under its top and bottom, winding between them, where those bridges can be shortest. None
 * where it can't get across without running into the figure of eight's own bridge, as on the smallest phones. The
 * river's centre line from the top of the screen to the bottom, and the stretches of loop over its water.
 */
const straightRiver = (
  track: Track,
  half: number,
  water: number,
  frame: ParkFrame,
  bridge: Bridge | null,
  sign: number,
): { raw: Point[]; runs: RiverRun[] } | null => {
  const { points, normals, step, length } = track;
  const n = points.length;
  const xs = points.map((p) => p.x);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  // Where a river straight down through `x` runs under the loop: each stretch of loop over its water, as the first
  // and last samples, and how far up and down the screen the road there reaches.
  const under = (x: number): { from: number; to: number; top: number; bottom: number }[] => {
    const over = points.map(
      (p, i) => p.x > midX && Math.abs(p.x - x) < water + half * Math.abs(normals[i]!.x),
    );
    const start = over.indexOf(false);
    if (start < 0) return [];
    const runs: { from: number; to: number; top: number; bottom: number }[] = [];
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (!over[i]) continue;
      const reach = half * Math.abs(normals[i]!.y);
      const last = runs[runs.length - 1];
      if (last && over[(i + n - 1) % n]) {
        last.to = i;
        last.top = Math.min(last.top, points[i]!.y - reach);
        last.bottom = Math.max(last.bottom, points[i]!.y + reach);
      } else runs.push({ from: i, to: i, top: points[i]!.y - reach, bottom: points[i]!.y + reach });
    }
    return runs;
  };
  // Where it goes: clear of the figure of eight's own bridge, under the loop just twice, top and bottom, where its
  // bridges can be shortest.
  let best: {
    x: number;
    runs: { from: number; to: number; top: number; bottom: number }[];
  } | null = null;
  let shortest = Infinity;
  for (let x = midX + water; x < Math.max(...xs) - half; x += 4) {
    const runs = under(x);
    if (runs.length !== 2) continue;
    // Not onto the figure of eight's bridge, or right up to it.
    if (
      bridge &&
      runs.some((r) => {
        for (let k = 0; k <= wrap(r.to - r.from, n); k++)
          if (onBridge(bridge, wrap((r.from + k) * step, length), length, 30)) return true;
        return false;
      })
    )
      continue;
    const span = runs.reduce((sum, r) => sum + wrap(r.to - r.from, n) + 1, 0);
    if (span >= shortest) continue;
    best = { x, runs: [...runs].sort((a, b) => a.top - b.top) };
    shortest = span;
  }
  if (!best) return null;
  const { x, runs } = best;
  const [upper, lower] = runs as [(typeof runs)[0], (typeof runs)[0]];
  // Winding between its bridges as far as it fits, from a little past each.
  const y0 = upper.bottom + RIVER_STRAIGHT;
  const y1 = lower.top - RIVER_STRAIGHT;
  const bends = y1 - y0 > 220 ? 2 : y1 - y0 > 60 ? 1 : 0;
  const clear = (line: readonly Point[]): boolean =>
    line.every((p, i) => {
      const a = line[Math.max(0, i - 1)]!;
      const b = line[Math.min(line.length - 1, i + 1)]!;
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = (b.y - a.y) / l;
      const ny = -(b.x - a.x) / l;
      return [-1, 1].every(
        (side) =>
          !nearPolyline(
            points,
            { x: p.x + nx * water * side, y: p.y + ny * water * side },
            half + 2,
            true,
          ),
      );
    });
  let middle: Point[] = [];
  for (const most of bends ? RIVER_BOWS : []) {
    const bow = Math.min(most, (y1 - y0) * 0.35);
    const knots: Point[] = [{ x, y: y0 }];
    for (let j = 0; j < bends; j++)
      knots.push({
        x: x + bow * sign * (j % 2 === 0 ? 1 : -1),
        y: y0 + ((y1 - y0) * (j + 1)) / (bends + 1),
      });
    knots.push({ x, y: y1 });
    const curve = spline(knots, { x: 0, y: 1 }, { x: 0, y: 1 });
    if (clear(curve)) {
      middle = curve;
      break;
    }
  }
  return {
    raw: [{ x, y: -RIVER_PAD }, ...middle, { x, y: frame.h + RIVER_PAD }],
    runs: [upper, lower],
  };
};

/** A river as short cuts for the scenery to keep clear of: lines across its width, banks and all. */
const riverClearance = (river: River, laneW: number): Shortcut[] =>
  [-1, -0.5, 0, 0.5, 1].map((k) => ({
    id: -1,
    a: 0,
    b: 0,
    path: river.track.points.map((p, i) => ({
      x: p.x + river.track.normals[i]!.x * k * riverHalf(laneW),
      y: p.y + river.track.normals[i]!.y * k * riverHalf(laneW),
    })),
  }));

/** Whether `s` on the loop is on one of a river's bridges, or within `by` of either end of one. */
export const onRiverBridge = (river: River | null, s: number, length: number, by = 0): boolean =>
  !!river &&
  river.bridges.some((b) => underCover({ s: b.over.s - by, len: b.over.len + 2 * by }, s, length));

// ---------------------------------------------------------------------------------------------------------------
// The middle of the park.

interface Interior {
  inner: Point[];
  box: Rect;
}

const blob = (cx: number, cy: number, r: number, rng: () => number, stretch: number): Point[] => {
  const waves = [2, 3, 5].map((k) => ({ k, amp: rng() * 0.16, phase: rng() * Math.PI * 2 }));
  return Array.from({ length: 48 }, (_, i) => {
    const th = (i / 48) * Math.PI * 2;
    const f = 1 + waves.reduce((sum, w) => sum + w.amp * Math.sin(w.k * th + w.phase), 0);
    return { x: cx + Math.cos(th) * r * f * stretch, y: cy + Math.sin(th) * r * f };
  });
};

const ellipse = (cx: number, cy: number, rx: number, ry: number): Point[] =>
  Array.from({ length: 40 }, (_, i) => {
    const th = (i / 40) * Math.PI * 2;
    return { x: cx + Math.cos(th) * rx, y: cy + Math.sin(th) * ry };
  });

/** Every point of `outline` is inside the area and at least `margin` from its edge. */
const wellInside = (area: readonly Point[], outline: readonly Point[], margin: number): boolean =>
  outline.every((p) => insidePolygon(area, p.x, p.y) && !nearPolyline(area, p, margin, true));

const makeWater = (
  inside: Interior,
  shortcuts: readonly Shortcut[],
  rng: () => number,
): Water[] => {
  const out: Water[] = [];
  const kinds: Water['kind'][] = rng() < 0.7 ? ['reservoir', 'lake'] : ['lake'];
  for (const kind of kinds) {
    for (let tries = 0; tries < 80; tries++) {
      const r = kind === 'reservoir' ? 40 + rng() * 16 : 30 + rng() * 18;
      const stretch = kind === 'reservoir' ? 1.3 + rng() * 0.3 : 1 + rng() * 0.6;
      const cx = inside.box.x + rng() * inside.box.w;
      const cy = inside.box.y + rng() * inside.box.h;
      const outline =
        kind === 'reservoir' ? ellipse(cx, cy, r * stretch, r) : blob(cx, cy, r, rng, stretch);
      if (!wellInside(inside.inner, outline, 22)) continue;
      if (shortcuts.some((c) => outline.some((p) => nearPolyline(c.path, p, 18)))) continue;
      if (shortcuts.some((c) => c.path.some((p) => insidePolygon(outline, p.x, p.y)))) continue;
      const radius = r * Math.max(stretch, 1) * 1.15;
      if (out.some((w) => Math.hypot(w.centre.x - cx, w.centre.y - cy) < w.radius + radius + 34))
        continue;
      out.push({ kind, outline, centre: { x: cx, y: cy }, radius });
      break;
    }
  }
  return out;
};

const inField = (f: Field, x: number, y: number, grow = 1): boolean =>
  ((x - f.x) / (f.rx * grow)) ** 2 + ((y - f.y) / (f.ry * grow)) ** 2 <= 1;

const makeFields = (
  inside: Interior,
  water: readonly Water[],
  shortcuts: readonly Shortcut[],
  rng: () => number,
): Field[] => {
  const out: Field[] = [];
  const want = 1 + (rng() < 0.6 ? 1 : 0);
  for (let tries = 0; tries < 120 && out.length < want; tries++) {
    const f: Field = {
      x: inside.box.x + rng() * inside.box.w,
      y: inside.box.y + rng() * inside.box.h,
      rx: 42 + rng() * 34,
      ry: 28 + rng() * 18,
      diamond: rng() < 0.5,
    };
    if (!wellInside(inside.inner, ellipse(f.x, f.y, f.rx, f.ry), 14)) continue;
    if (
      water.some(
        (w) =>
          Math.hypot(w.centre.x - f.x, w.centre.y - f.y) < w.radius + Math.max(f.rx, f.ry) + 14,
      )
    )
      continue;
    if (shortcuts.some((c) => c.path.some((p) => inField(f, p.x, p.y, 1.2)))) continue;
    if (
      out.some(
        (o) => Math.hypot(o.x - f.x, o.y - f.y) < Math.max(o.rx, o.ry) + Math.max(f.rx, f.ry) + 16,
      )
    )
      continue;
    out.push(f);
  }
  return out;
};

/** A jogging track round the reservoir and a winding walk or two. */
const makePaths = (
  track: Track,
  half: number,
  inside: Interior,
  water: readonly Water[],
  fields: readonly Field[],
  rng: () => number,
): Point[][] => {
  const out: Point[][] = [];
  for (const w of water) {
    if (w.kind !== 'reservoir') continue;
    const ring = w.outline.map((p) => {
      const dx = p.x - w.centre.x;
      const dy = p.y - w.centre.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / l) * 9, y: p.y + (dy / l) * 9 };
    });
    out.push([...ring, ring[0]!]);
  }
  const want = 1 + Math.floor(rng() * 2);
  for (let tries = 0; tries < 60 && out.length < want + water.length; tries++) {
    const a = rng() * track.length;
    const b = a + track.length * (0.3 + rng() * 0.4);
    const pa = pose(track, a, -half - 2);
    const pb = pose(track, b, -half - 2);
    const c1 = { x: inside.box.x + rng() * inside.box.w, y: inside.box.y + rng() * inside.box.h };
    const c2 = { x: inside.box.x + rng() * inside.box.w, y: inside.box.y + rng() * inside.box.h };
    const line = cubic(pa, c1, c2, pb, 36);
    if (!line.slice(2, -2).every((p) => insidePolygon(inside.inner, p.x, p.y))) continue;
    if (
      line.some((p) =>
        water.some((w) => Math.hypot(p.x - w.centre.x, p.y - w.centre.y) < w.radius + 10),
      )
    )
      continue;
    if (line.some((p) => fields.some((f) => inField(f, p.x, p.y, 1.1)))) continue;
    out.push(line);
  }
  return out;
};

const makeTrees = (
  track: Track,
  half: number,
  inside: Interior,
  entrances: readonly Entrance[],
  shortcuts: readonly Shortcut[],
  water: readonly Water[],
  fields: readonly Field[],
  paths: readonly Point[][],
  season: Season,
  wall: Rect,
  rng: () => number,
  eight = false,
): Tree[] => {
  const out: Tree[] = [];
  const outer = edge(track, half + 6);
  const p1 = rng() * 10;
  const p2 = rng() * 10;
  const clump = (x: number, y: number): number =>
    Math.sin(x * 0.024 + p1) * Math.sin(y * 0.031 + p2);
  const lanes = entrances.map((e) => [e.street, e.gate, e.throat]);
  const step = 15;
  for (let y = wall.y + 8; y < wall.y + wall.h - 8; y += step) {
    for (let x = wall.x + 8; x < wall.x + wall.w - 8; x += step) {
      const tx = x + (rng() - 0.5) * 9;
      const ty = y + (rng() - 0.5) * 9;
      const r = 8 + rng() * 5.5;
      const p = { x: tx, y: ty };
      // A figure of eight's edges cross, so its road is kept clear by distance instead, and its middles are inside
      // the centre line.
      if (eight && nearPolyline(track.points, p, half + r + 3, true)) continue;
      if (eight && shortcuts.some((c) => nearPolyline(c.path, p, r + 6))) continue;
      const middle = eight
        ? insidePolygon(track.points, tx, ty)
        : insidePolygon(inside.inner, tx, ty);
      let chance: number;
      if (eight) {
        if (
          tx < wall.x + r + 5 ||
          tx > wall.x + wall.w - r - 5 ||
          ty < wall.y + r + 5 ||
          ty > wall.y + wall.h - r - 5
        )
          continue;
        chance = (middle ? 0.42 : 0.62) + 0.4 * clump(tx, ty);
      } else if (middle) {
        if (nearPolyline(inside.inner, p, r + 2, true)) continue;
        if (
          water.some(
            (w) => insidePolygon(w.outline, tx, ty) || nearPolyline(w.outline, p, r + 5, true),
          )
        )
          continue;
        if (fields.some((f) => inField(f, tx, ty, 1.08 + r / Math.min(f.rx, f.ry)))) continue;
        if (paths.some((l) => nearPolyline(l, p, r + 5))) continue;
        if (shortcuts.some((c) => nearPolyline(c.path, p, r + 6))) continue;
        chance = 0.42 + 0.42 * clump(tx, ty);
      } else {
        if (insidePolygon(outer, tx, ty) || nearPolyline(outer, p, r + 3, true)) continue;
        // Clear of the wall, which is rounded at the corners.
        const cx = Math.max(wall.x + WALL_RADIUS, Math.min(wall.x + wall.w - WALL_RADIUS, tx));
        const cy = Math.max(wall.y + WALL_RADIUS, Math.min(wall.y + wall.h - WALL_RADIUS, ty));
        if (cx !== tx && cy !== ty && Math.hypot(tx - cx, ty - cy) > WALL_RADIUS - r - 6) continue;
        if (
          tx < wall.x + r + 5 ||
          tx > wall.x + wall.w - r - 5 ||
          ty < wall.y + r + 5 ||
          ty > wall.y + wall.h - r - 5
        )
          continue;
        if (lanes.some((l) => nearPolyline(l, p, r + LANE_W + 6))) continue;
        chance = 0.62 + 0.3 * clump(tx, ty);
      }
      if (rng() > chance) continue;
      const evergreen = rng() < (season === 'winter' ? 0.3 : 0.12);
      out.push({ x: tx, y: ty, r, tone: rng(), evergreen });
    }
  }
  // Drawn top to bottom so lower trees overlap the ones behind them.
  return out.sort((a, b) => a.y - b.y);
};

/** How many slippery patches each park has room for; they appear one by one as the score rises (`PATCH_SCORES`). */
export const PATCH_COUNT = PATCH_SCORES.length;

/** Small one-lane patches (`PATCH_COUNT` of them), well apart and clear of the entrances and short cuts. */
const makePatches = (
  track: Track,
  lanes: number,
  /** A lane kept clear, for a course's train; -1 for none. */
  keepClear: number,
  entrances: readonly Entrance[],
  shortcuts: readonly Shortcut[],
  rng: () => number,
  bridge: Bridge | null = null,
  /** More spots to keep clear of, as a bridge is: a river's bridges. */
  bridges: readonly number[] = [],
): Patch[] => {
  const out: Patch[] = [];
  const avoid = [
    ...entrances.map((e) => e.s),
    ...shortcuts.flatMap((c) => [c.a, c.b]),
    ...(bridge ? [bridge.over.s + bridge.over.len / 2, bridge.under.s + bridge.under.len / 2] : []),
    ...bridges,
  ];
  for (let spread = track.length / 3; out.length < PATCH_COUNT && spread > 0; spread -= 40) {
    out.length = 0;
    for (let tries = 0; tries < 200 && out.length < PATCH_COUNT; tries++) {
      const s = rng() * track.length;
      if (avoid.some((a) => Math.abs(loopDelta(a, s, track.length)) < (bridge ? 90 : 60))) continue;
      if (out.some((o) => Math.abs(loopDelta(o.s, s, track.length)) < spread)) continue;
      const pick = Math.floor(rng() * (keepClear < 0 ? lanes : lanes - 1));
      const lane = keepClear >= 0 && pick >= keepClear ? pick + 1 : pick;
      out.push({ id: out.length, s, lane, width: 1, len: (18 + rng() * 6) * ART });
    }
  }
  return out;
};

/** How long a covered stretch is. */
export const COVER_LEN: readonly [number, number] = [90, 130];

/** A covered stretch, clear of the entrances, short cuts and patches so what happens there can be seen coming. */
const makeCover = (
  track: Track,
  entrances: readonly Entrance[],
  shortcuts: readonly Shortcut[],
  patches: readonly Patch[],
  rng: () => number,
  range: readonly [number, number] = COVER_LEN,
  bridge: Bridge | null = null,
  bridges: readonly number[] = [],
): Covered => {
  const len = range[0] + rng() * (range[1] - range[0]);
  const avoid = [
    ...entrances.map((e) => e.s),
    ...shortcuts.flatMap((c) => [c.a, c.b]),
    ...patches.map((p) => p.s),
    ...(bridge ? [bridge.over.s + bridge.over.len / 2, bridge.under.s + bridge.under.len / 2] : []),
    ...bridges,
  ];
  let s = 0;
  for (let tries = 0; tries < 100; tries++) {
    s = rng() * track.length;
    const mid = s + len / 2;
    if (
      avoid.every((a) => Math.abs(loopDelta(a, mid, track.length)) > len / 2 + (bridge ? 90 : 40))
    )
      break;
  }
  return { s, len };
};

/** Rapids across `RAPIDS_LANES` lanes side by side (a `Rapid` for each), where a covered stretch could go. */
const makeRapids = (
  track: Track,
  lanes: number,
  entrances: readonly Entrance[],
  shortcuts: readonly Shortcut[],
  patches: readonly Patch[],
  rng: () => number,
): Rapid[] => {
  const first = makeCover(track, entrances, shortcuts, patches, rng, RAPIDS_LEN);
  const lane = Math.floor(rng() * (lanes - RAPIDS_LANES + 1));
  return Array.from({ length: RAPIDS_LANES }, (_, i) => ({ ...first, lane: lane + i }));
};

/** Whether a mover spanning lanes `p` to `p + width - 1` is in rapids at `s`. */
export const inRapids = (
  rapids: readonly Rapid[],
  s: number,
  p: number,
  width: number,
  length: number,
): boolean =>
  rapids.some(
    (r) =>
      r.lane >= Math.round(p) && r.lane < Math.round(p) + width && wrap(s - r.s, length) < r.len,
  );

/** Whether `s` is within a covered stretch. */
export const underCover = (cover: Covered | null, s: number, length: number): boolean =>
  !!cover && wrap(s - cover.s, length) < cover.len;

// ---------------------------------------------------------------------------------------------------------------
// The city round about.

/** Buildings reach this far past the frame; further out is drawn as plain blocks. */
const CITY_EXTENT = 720;
const BLOCK = { w: 150, h: 96, street: 24 };
/** From the wall out to where the buildings start: pavement, street, pavement. */
export const CITY_SETBACK = 6 + STREET_WIDTH + 8;

const makeCity = (
  frame: ParkFrame,
  wall: Rect,
  rng: () => number,
): { blocks: Rect[]; buildings: Building[] } => {
  const out: Building[] = [];
  const blocks: Rect[] = [];
  const free: Rect = {
    x: wall.x - CITY_SETBACK,
    y: wall.y - CITY_SETBACK,
    w: wall.w + CITY_SETBACK * 2,
    h: wall.h + CITY_SETBACK * 2,
  };
  const x0 = free.x - Math.ceil((free.x + CITY_EXTENT) / BLOCK.w) * BLOCK.w;
  const y0 = free.y - Math.ceil((free.y + CITY_EXTENT) / BLOCK.h) * BLOCK.h;
  for (let gy = y0; gy < frame.h + CITY_EXTENT; gy += BLOCK.h) {
    for (let gx = x0; gx < frame.w + CITY_EXTENT; gx += BLOCK.w) {
      let b: Rect = {
        x: gx + BLOCK.street,
        y: gy + BLOCK.street,
        w: BLOCK.w - BLOCK.street,
        h: BLOCK.h - BLOCK.street,
      };
      const overX = b.x < free.x + free.w && b.x + b.w > free.x;
      const overY = b.y < free.y + free.h && b.y + b.h > free.y;
      if (overX && overY) {
        // Beside the park: trim the block back to the pavement on whichever side it pokes in from.
        const fromLeft = free.x - b.x;
        const fromRight = b.x + b.w - (free.x + free.w);
        const fromTop = free.y - b.y;
        const fromBottom = b.y + b.h - (free.y + free.h);
        const best = Math.max(fromLeft, fromRight, fromTop, fromBottom);
        if (best === fromLeft) b = { ...b, w: free.x - b.x };
        else if (best === fromRight)
          b = { ...b, x: free.x + free.w, w: b.x + b.w - (free.x + free.w) };
        else if (best === fromTop) b = { ...b, h: free.y - b.y };
        else b = { ...b, y: free.y + free.h, h: b.y + b.h - (free.y + free.h) };
        if (b.w < 26 || b.h < 26) continue;
      }
      blocks.push(b);
      // Split into lots along the block, some split again across.
      const lots = 2 + Math.floor(rng() * 3);
      let at = 0;
      for (let i = 0; i < lots; i++) {
        const share = i === lots - 1 ? b.w - at : Math.round((b.w / lots) * (0.7 + rng() * 0.6));
        const across = rng() < 0.4 && b.h > 50;
        const cut = across ? Math.round(b.h * (0.4 + rng() * 0.2)) : b.h;
        for (const [yy, hh] of across
          ? [
              [0, cut],
              [cut, b.h - cut],
            ]
          : [[0, b.h]]) {
          out.push({
            x: b.x + at,
            y: b.y + yy!,
            w: share,
            h: hh!,
            tone: Math.floor(rng() * 6),
            tower: share * hh! > 1500 && rng() < 0.35,
          });
        }
        at += share;
        if (at >= b.w) break;
      }
    }
  }
  return { blocks, buildings: out };
};

// ---------------------------------------------------------------------------------------------------------------

/** A new park filling `frame`, in `season` if given or a random one. */
export const generatePark = (
  rng: () => number = Math.random,
  season?: Season,
  frame: ParkFrame = DEFAULT_FRAME,
  course: CourseSpec = COURSES.park,
): Park => {
  const chosen = season ?? SEASONS[Math.floor(rng() * SEASONS.length)]!;
  const wall = wallFor(frame);
  const half = roadHalf(course);
  const track = makeTrack(rng, frame, half, course);
  const eight = course.layout === 'eight';
  const inner = edge(track, -half - 6);
  const xs = inner.map((p) => p.x);
  const ys = inner.map((p) => p.y);
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
  const inside: Interior = { inner, box };
  const entrances = makeEntrances(track, wall, half, rng, eight);
  const bridge = eight ? makeBridge(track, half, rng) : null;
  const river = course.riverCrossing
    ? makeRiver(track, half, course.laneW, frame, bridge, rng)
    : null;
  // A river's bridges, kept clear like a figure of eight's.
  const riverBridges = river ? river.bridges.map((b) => b.over.s + b.over.len / 2) : [];
  // Footpaths and the short cuts along them, on the courses that have them; or a manor's hall.
  // A manor's side roads; where the hall doesn't fit as a road, a path through the house as before.
  const sideRoads =
    course.layout === 'manor' ? makeSideRoads(track, entrances, half, course.laneW) : [];
  const shortcuts = course.paths
    ? makeShortcuts(track, entrances, half, rng)
    : course.layout === 'manor' && !sideRoads.some((r) => r.kind === 'hall')
      ? makeHall(track, entrances, half)
      : [];
  // What the scenery keeps clear of: the short cuts, and the side roads with a lane's width either side.
  const clearOf = [...shortcuts, ...sideRoads.flatMap((r) => sideClearance(r, course.laneW))];
  // A figure of eight's middles are too small for water or fields.
  const water = eight ? [] : makeWater(inside, clearOf, rng);
  const fields = eight ? [] : makeFields(inside, water, clearOf, rng);
  const paths = course.paths ? makePaths(track, half, inside, water, fields, rng) : [];
  const trees = makeTrees(
    track,
    half,
    inside,
    entrances,
    river ? [...clearOf, ...riverClearance(river, course.laneW)] : clearOf,
    water,
    fields,
    paths,
    chosen,
    wall,
    rng,
    eight,
  );
  const patches = makePatches(
    track,
    course.lanes,
    course.train ? TRAIN_LANE : -1,
    entrances,
    clearOf,
    rng,
    bridge,
    riverBridges,
  );
  const cover =
    course.cover === 'none'
      ? null
      : makeCover(track, entrances, clearOf, patches, rng, COVER_LEN, bridge, riverBridges);
  // Rapids, like a covered stretch, clear of the entrances, short cuts and patches.
  const rapids = course.rapids
    ? makeRapids(track, course.lanes, entrances, clearOf, patches, rng)
    : [];
  return {
    season: chosen,
    frame,
    course: course.id,
    lanes: course.lanes,
    laneW: course.laneW,
    half,
    cover,
    rapids,
    bridge,
    track,
    entrances,
    shortcuts,
    sideRoads,
    river,
    water,
    fields,
    paths,
    trees,
    patches,
    wall,
    ...makeCity(frame, wall, rng),
  };
};
