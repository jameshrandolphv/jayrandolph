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
import { COURSES, RAPIDS_LEN, TRAIN_LANE, type CourseId, type CourseSpec } from './courses';

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
}

/** A path across the middle of the park between two points on the loop's inner edge. */
export interface Shortcut {
  id: number;
  /** Ends on the loop, and the path between them, from the `a` end to the `b` end. */
  a: number;
  b: number;
  path: Point[];
}

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

export interface Park {
  season: Season;
  frame: ParkFrame;
  course: CourseId;
  /** Lanes on the loop, how wide each is, and half the road's width. */
  lanes: number;
  laneW: number;
  half: number;
  cover: Covered | null;
  /** The stretch of rapids, on a course that has them (see `CourseSpec.rapids`). */
  rapids: Covered | null;
  track: Track;
  entrances: Entrance[];
  shortcuts: Shortcut[];
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

const fits = (track: Track, frame: ParkFrame, half: number): boolean => {
  const m = frameMargins(frame);
  return (
    maxCurvature(track) * minRadius(half) < 1 &&
    edge(track, half).every(
      (p) => p.x > m.left && p.x < frame.w - m.right && p.y > m.top && p.y < frame.h - m.bottom,
    )
  );
};

const makeTrack = (rng: () => number, frame: ParkFrame, half: number, bend: number): Track => {
  for (let tries = 0; tries < 80; tries++) {
    const track = buildTrack(loopOutline(rng, frame, half, bend));
    if (fits(track, frame, half)) return track;
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

const makeEntrances = (track: Track, wall: Rect, half: number, rng: () => number): Entrance[] => {
  const count = rng() < 0.5 ? 3 : 4;
  const { normals, step, length } = track;
  const corner = WALL_RADIUS + 34;
  // Only where the loop faces a side of the wall squarely, so each gate opens straight onto a street.
  const candidates: number[] = [];
  normals.forEach((nrm, i) => {
    if (Math.abs(nrm.x) < 0.94 && Math.abs(nrm.y) < 0.94) return;
    const t = pose(track, i * step, half + 8);
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
    const nrm = normals[i]!;
    const throat = pose(track, s, half + 8);
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
    return { id, s, street, gate, throat };
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
      const middle = insidePolygon(inside.inner, tx, ty);
      let chance: number;
      if (middle) {
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
): Patch[] => {
  const out: Patch[] = [];
  const avoid = [...entrances.map((e) => e.s), ...shortcuts.flatMap((c) => [c.a, c.b])];
  for (let spread = track.length / 3; out.length < PATCH_COUNT && spread > 0; spread -= 40) {
    out.length = 0;
    for (let tries = 0; tries < 200 && out.length < PATCH_COUNT; tries++) {
      const s = rng() * track.length;
      if (avoid.some((a) => Math.abs(loopDelta(a, s, track.length)) < 60)) continue;
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
): Covered => {
  const len = range[0] + rng() * (range[1] - range[0]);
  const avoid = [
    ...entrances.map((e) => e.s),
    ...shortcuts.flatMap((c) => [c.a, c.b]),
    ...patches.map((p) => p.s),
  ];
  let s = 0;
  for (let tries = 0; tries < 100; tries++) {
    s = rng() * track.length;
    const mid = s + len / 2;
    if (avoid.every((a) => Math.abs(loopDelta(a, mid, track.length)) > len / 2 + 40)) break;
  }
  return { s, len };
};

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
  const track = makeTrack(rng, frame, half, course.bend);
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
  const entrances = makeEntrances(track, wall, half, rng);
  const shortcuts = makeShortcuts(track, entrances, half, rng);
  const water = makeWater(inside, shortcuts, rng);
  const fields = makeFields(inside, water, shortcuts, rng);
  const paths = makePaths(track, half, inside, water, fields, rng);
  const trees = makeTrees(
    track,
    half,
    inside,
    entrances,
    shortcuts,
    water,
    fields,
    paths,
    chosen,
    wall,
    rng,
  );
  const patches = makePatches(track, course.lanes, course.train ? TRAIN_LANE : -1, entrances, shortcuts, rng);
  const cover =
    course.cover === 'none' ? null : makeCover(track, entrances, shortcuts, patches, rng);
  // Rapids, like a covered stretch, clear of the entrances, short cuts and patches.
  const rapids = course.rapids ? makeCover(track, entrances, shortcuts, patches, rng, RAPIDS_LEN) : null;
  return {
    season: chosen,
    frame,
    course: course.id,
    lanes: course.lanes,
    laneW: course.laneW,
    half,
    cover,
    rapids,
    track,
    entrances,
    shortcuts,
    water,
    fields,
    paths,
    trees,
    patches,
    wall,
    ...makeCity(frame, wall, rng),
  };
};
