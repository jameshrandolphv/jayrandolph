import { HEIGHT, WIDTH, type Kind } from './constants';
import { distToPolyline, distToSegment, segmentDistance, spline, type Point } from './geometry';

export interface Runway {
  type: 'runway';
  kind: 'jet' | 'light';
  /** The threshold, where landings start. */
  x: number;
  y: number;
  /** Direction of landing, radians. */
  angle: number;
  length: number;
  width: number;
}

export interface Helipad {
  type: 'helipad';
  kind: 'heli';
  x: number;
  y: number;
  radius: number;
  /** Turn of the pad's square base, for looks only. */
  angle: number;
}

export type Zone = Runway | Helipad;

export type Theme = 'meadow' | 'coast' | 'river';

/** A rectangle turned by `angle` about its centre. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

export interface Tree {
  x: number;
  y: number;
  r: number;
}

export interface Airfield {
  theme: Theme;
  zones: Zone[];
  /** Terminal apron next to the big runway, with its buildings; absent when there was no room. */
  apron: Box | null;
  buildings: Box[];
  trees: Tree[];
  /** Coast: the shoreline from one end of the sea's edge to the other, with the sea on the side of `seaSide`. River: its centre line. */
  water: Point[];
  waterWidth: number;
  seaSide: 'top' | 'bottom' | 'left' | 'right';
  /** Positions of the decorative wind swirls drawn on the grass. */
  swirls: { x: number; y: number; scale: number; flip: boolean }[];
}

export const runwayEnd = (r: Runway): Point => ({
  x: r.x + Math.cos(r.angle) * r.length,
  y: r.y + Math.sin(r.angle) * r.length,
});

/** How far back from the threshold the approach is kept clear and on the field. */
const APPROACH = 150;
/** Keeps the airfield out from under the HUD and the corner buttons. */
const FIELD_MARGIN = { left: 70, right: 70, top: 80, bottom: 80 };

const approachStart = (r: Runway): Point => ({
  x: r.x - Math.cos(r.angle) * APPROACH,
  y: r.y - Math.sin(r.angle) * APPROACH,
});

/** Centre line of a zone's footprint and its half-width, so runways and pads can be spaced with one test. */
const footprint = (z: Zone): { a: Point; b: Point; half: number } =>
  z.type === 'runway'
    ? { a: z, b: runwayEnd(z), half: z.width / 2 + 14 }
    : { a: z, b: z, half: z.radius + 14 };

const zoneGap = (a: Zone, b: Zone): number => {
  const fa = footprint(a);
  const fb = footprint(b);
  return segmentDistance(fa.a, fa.b, fb.a, fb.b) - fa.half - fb.half;
};

const inField = (
  p: Point,
  margin: { left: number; right: number; top: number; bottom: number },
): boolean =>
  p.x >= margin.left &&
  p.x <= WIDTH - margin.right &&
  p.y >= margin.top &&
  p.y <= HEIGHT - margin.bottom;

const boxCorners = (b: Box): Point[] => {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => ({
    x: b.x + ((i! * b.w) / 2) * c - ((j! * b.h) / 2) * s,
    y: b.y + ((i! * b.w) / 2) * s + ((j! * b.h) / 2) * c,
  }));
};

/** Whether `p` lies on the sea side of a coastline, or within a river. */
const wet = (
  field: Pick<Airfield, 'theme' | 'water' | 'waterWidth' | 'seaSide'>,
  p: Point,
  margin: number,
): boolean => {
  if (field.theme === 'meadow') return false;
  if (field.theme === 'river')
    return distToPolyline(p, field.water) < field.waterWidth / 2 + margin;
  // The shoreline is sampled along one axis, so the coast at p's position is found by interpolation.
  const horizontal = field.seaSide === 'top' || field.seaSide === 'bottom';
  const along = horizontal ? p.x : p.y;
  const across = horizontal ? p.y : p.x;
  const line = field.water;
  let shore = horizontal ? line[0]!.y : line[0]!.x;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const [a0, b0] = horizontal ? [a.x, b.x] : [a.y, b.y];
    if (along >= Math.min(a0, b0) && along <= Math.max(a0, b0)) {
      const t = b0 === a0 ? 0 : (along - a0) / (b0 - a0);
      shore = horizontal ? a.y + (b.y - a.y) * t : a.x + (b.x - a.x) * t;
      break;
    }
  }
  return field.seaSide === 'top' || field.seaSide === 'left'
    ? across < shore + margin
    : across > shore - margin;
};

const pick = <T>(rng: () => number, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)]!;
const range = (rng: () => number, min: number, max: number): number => min + rng() * (max - min);

const makeWater = (
  rng: () => number,
  theme: Theme,
): Pick<Airfield, 'water' | 'waterWidth' | 'seaSide'> => {
  const seaSide = pick(rng, ['top', 'bottom', 'left', 'right'] as const);
  if (theme === 'coast') {
    const horizontal = seaSide === 'top' || seaSide === 'bottom';
    const span = horizontal ? WIDTH : HEIGHT;
    const depth = range(rng, 70, 130);
    const base =
      seaSide === 'top' || seaSide === 'left' ? depth : (horizontal ? HEIGHT : WIDTH) - depth;
    const controls: Point[] = [];
    for (let i = 0; i <= 5; i++) {
      const along = -40 + ((span + 80) * i) / 5;
      const across = base + range(rng, -40, 40);
      controls.push(horizontal ? { x: along, y: across } : { x: across, y: along });
    }
    return { water: spline(controls, 10), waterWidth: 0, seaSide };
  }
  if (theme === 'river') {
    // Enters on one side and leaves on the opposite one, bending through the middle.
    const horizontal = rng() < 0.6;
    const controls: Point[] = [];
    for (let i = 0; i <= 4; i++) {
      const along = -40 + ((horizontal ? WIDTH : HEIGHT) + 80) * (i / 4);
      const span = horizontal ? HEIGHT : WIDTH;
      const across =
        i === 0 || i === 4 ? range(rng, 0.1, 0.9) * span : range(rng, 0.15, 0.85) * span;
      controls.push(horizontal ? { x: along, y: across } : { x: across, y: along });
    }
    return { water: spline(controls, 12), waterWidth: range(rng, 38, 54), seaSide };
  }
  return { water: [], waterWidth: 0, seaSide };
};

/** Every point along a zone, plus a margin around it, has to be dry land. */
const zoneDry = (
  field: Pick<Airfield, 'theme' | 'water' | 'waterWidth' | 'seaSide'>,
  z: Zone,
): boolean => {
  if (z.type === 'helipad') return !wet(field, z, z.radius + 18);
  const end = runwayEnd(z);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    if (wet(field, { x: z.x + (end.x - z.x) * t, y: z.y + (end.y - z.y) * t }, z.width / 2 + 18))
      return false;
  }
  return true;
};

const zoneFits = (z: Zone, others: readonly Zone[]): boolean => {
  if (z.type === 'runway') {
    const end = runwayEnd(z);
    const pad = z.width / 2 + 16;
    const margin = {
      left: FIELD_MARGIN.left + pad,
      right: FIELD_MARGIN.right + pad,
      top: FIELD_MARGIN.top + pad,
      bottom: FIELD_MARGIN.bottom + pad,
    };
    if (!inField(z, margin) || !inField(end, margin)) return false;
    // Room to line up: the approach must stay on screen and clear of everything else.
    const from = approachStart(z);
    if (!inField(from, { left: 30, right: 30, top: 30, bottom: 30 })) return false;
    for (const o of others) {
      const f = footprint(o);
      if (segmentDistance(from, z, f.a, f.b) < f.half + 30) return false;
      if (o.type === 'runway' && segmentDistance(approachStart(o), o, z, end) < z.width / 2 + 44)
        return false;
    }
  } else {
    const pad = z.radius + 24;
    if (
      !inField(z, {
        left: FIELD_MARGIN.left + pad,
        right: FIELD_MARGIN.right + pad,
        top: FIELD_MARGIN.top + pad,
        bottom: FIELD_MARGIN.bottom + pad,
      })
    ) {
      return false;
    }
    for (const o of others)
      if (o.type === 'runway' && distToSegment(z, approachStart(o), o) < z.radius + 44)
        return false;
  }
  return others.every((o) => zoneGap(z, o) >= 56);
};

/** Runways point in a direction that is a multiple of this, which reads as designed rather than random. */
const ANGLE_STEP = Math.PI / 12;

const randomRunway = (rng: () => number, kind: 'jet' | 'light'): Runway => {
  const length = kind === 'jet' ? range(rng, 300, 370) : range(rng, 200, 250);
  const width = kind === 'jet' ? 34 : 28;
  const angle = Math.round(range(rng, 0, Math.PI * 2) / ANGLE_STEP) * ANGLE_STEP;
  const cx = range(rng, 0, WIDTH);
  const cy = range(rng, 0, HEIGHT);
  return {
    type: 'runway',
    kind,
    x: cx - (Math.cos(angle) * length) / 2,
    y: cy - (Math.sin(angle) * length) / 2,
    angle,
    length,
    width,
  };
};

const randomHelipad = (rng: () => number): Helipad => ({
  type: 'helipad',
  kind: 'heli',
  x: range(rng, 0, WIDTH),
  y: range(rng, 0, HEIGHT),
  radius: 32,
  angle: Math.round(range(rng, 0, Math.PI / 2) / ANGLE_STEP) * ANGLE_STEP,
});

/** The terminal: a strip of tarmac beside the big runway, on whichever side has room. */
const placeApron = (
  rng: () => number,
  field: Omit<Airfield, 'apron' | 'buildings' | 'trees' | 'swirls'>,
): Box | null => {
  const jet = field.zones.find((z): z is Runway => z.type === 'runway' && z.kind === 'jet');
  if (!jet) return null;
  const sides = rng() < 0.5 ? [1, -1] : [-1, 1];
  for (const side of sides) {
    const along = range(rng, 0.25, 0.6) * jet.length;
    const depth = 64;
    const offset = jet.width / 2 + 10 + depth / 2;
    const nx = -Math.sin(jet.angle) * side;
    const ny = Math.cos(jet.angle) * side;
    const box: Box = {
      x: jet.x + Math.cos(jet.angle) * along + nx * offset,
      y: jet.y + Math.sin(jet.angle) * along + ny * offset,
      w: jet.length * 0.42,
      h: depth,
      // Turned so the box's +y side always faces away from the runway, where the buildings go.
      angle: side === 1 ? jet.angle : jet.angle + Math.PI,
    };
    const corners = boxCorners(box);
    const ok =
      corners.every(
        (p) => inField(p, { left: 40, right: 40, top: 60, bottom: 60 }) && !wet(field, p, 10),
      ) &&
      field.zones.every((z) => z === jet || corners.every((p) => footprintDistance(p, z) > 30)) &&
      field.zones.every(
        (z) =>
          z.type !== 'runway' ||
          z === jet ||
          corners.every((p) => distToSegment(p, approachStart(z), z) > 40),
      ) &&
      field.zones.every((z) => z.type !== 'runway' || z === jet || polygonClear(corners, z));
    if (ok) return box;
  }
  return null;
};

const footprintDistance = (p: Point, z: Zone): number => {
  const f = footprint(z);
  return distToSegment(p, f.a, f.b) - f.half;
};

/** Whether a runway's centre line stays outside a convex polygon. */
const polygonClear = (corners: readonly Point[], r: Runway): boolean => {
  const end = runwayEnd(r);
  for (let i = 0; i < corners.length; i++) {
    if (segmentDistance(corners[i]!, corners[(i + 1) % corners.length]!, r, end) < r.width / 2 + 20)
      return false;
  }
  return true;
};

const placeBuildings = (rng: () => number, apron: Box): Box[] => {
  const out: Box[] = [];
  const c = Math.cos(apron.angle);
  const s = Math.sin(apron.angle);
  const count = 3 + Math.floor(rng() * 2);
  const slot = apron.w / count;
  for (let i = 0; i < count; i++) {
    const w = slot * range(rng, 0.45, 0.7);
    const h = range(rng, 18, 30);
    // Along the far side of the apron, away from the runway.
    const u = -apron.w / 2 + slot * (i + 0.5);
    const v = apron.h / 2 - h / 2 - 8;
    out.push({ x: apron.x + u * c - v * s, y: apron.y + u * s + v * c, w, h, angle: apron.angle });
  }
  return out;
};

const scatterTrees = (rng: () => number, field: Omit<Airfield, 'trees' | 'swirls'>): Tree[] => {
  const trees: Tree[] = [];
  const target = 14 + Math.floor(rng() * 14);
  for (let tries = 0; tries < 400 && trees.length < target; tries++) {
    // Trees grow in little clumps.
    const seed = trees.length > 0 && rng() < 0.55 ? trees[Math.floor(rng() * trees.length)]! : null;
    const t: Tree = seed
      ? { x: seed.x + range(rng, -30, 30), y: seed.y + range(rng, -30, 30), r: range(rng, 9, 15) }
      : { x: range(rng, 20, WIDTH - 20), y: range(rng, 50, HEIGHT - 20), r: range(rng, 9, 16) };
    if (wet(field, t, t.r + 4)) continue;
    if (field.zones.some((z) => footprintDistance(t, z) < t.r + 22)) continue;
    if (
      field.zones.some(
        (z) => z.type === 'runway' && distToSegment(t, approachStart(z), z) < t.r + 26,
      )
    )
      continue;
    if (
      field.apron &&
      Math.hypot(t.x - field.apron.x, t.y - field.apron.y) < field.apron.w / 2 + t.r + 10
    )
      continue;
    if (trees.some((o) => Math.hypot(o.x - t.x, o.y - t.y) < o.r + t.r)) continue;
    trees.push(t);
  }
  return trees;
};

/** A known-good layout, for the unlikely case that random placement keeps failing. */
const fallback = (): Airfield => ({
  theme: 'meadow',
  zones: [
    { type: 'runway', kind: 'jet', x: 250, y: 300, angle: 0, length: 360, width: 34 },
    { type: 'runway', kind: 'light', x: 690, y: 470, angle: -Math.PI / 4, length: 220, width: 28 },
    { type: 'helipad', kind: 'heli', x: 420, y: 190, radius: 32, angle: 0 },
  ],
  apron: null,
  buildings: [],
  trees: [],
  water: [],
  waterWidth: 0,
  seaSide: 'bottom',
  swirls: [],
});

/** Lays out a random airfield: a runway for jets, one for light aircraft and a helipad, on grass, a coast or by a river. */
export function generateAirfield(rng: () => number): Airfield {
  for (let attempt = 0; attempt < 40; attempt++) {
    const theme = pick(rng, ['meadow', 'coast', 'river'] as const);
    const water = makeWater(rng, theme);
    const base = { theme, ...water };
    const zones: Zone[] = [];
    for (const make of [
      () => randomRunway(rng, 'jet'),
      () => randomRunway(rng, 'light'),
      () => randomHelipad(rng),
    ]) {
      let placed: Zone | null = null;
      for (let tries = 0; tries < 300 && !placed; tries++) {
        const z = make();
        if (zoneFits(z, zones) && zoneDry(base, z)) placed = z;
      }
      if (!placed) break;
      zones.push(placed);
    }
    if (zones.length < 3) continue;
    const withZones = { ...base, zones };
    const apron = placeApron(rng, withZones);
    const buildings = apron ? placeBuildings(rng, apron) : [];
    const trees = scatterTrees(rng, { ...withZones, apron, buildings });
    const swirls = Array.from({ length: 3 + Math.floor(rng() * 3) }, () => ({
      x: range(rng, 0, WIDTH),
      y: range(rng, 0, HEIGHT),
      scale: range(rng, 0.7, 1.2),
      flip: rng() < 0.5,
    }));
    return { ...withZones, apron, buildings, trees, swirls };
  }
  return fallback();
}

/** How close a drawn path has to come to a runway's centre line to be taken onto it. */
const RUNWAY_CAPTURE = 18;
/** Share of a runway, from its threshold, on which a path can join it. */
const RUNWAY_CAPTURE_SPAN = 0.5;
/** Cosine of the widest angle between a path and a runway that still lands. */
const RUNWAY_ALIGN = 0.3;

/**
 * Where a path being drawn through `p`, heading along (dx, dy), touches down on a zone that takes `kind`, or null.
 * Runways have to be joined from their threshold end, roughly in their direction.
 */
export function captureZone(
  field: Airfield,
  kind: Kind,
  p: Point,
  dx: number,
  dy: number,
): { zone: Zone; at: Point } | null {
  for (const zone of field.zones) {
    if (zone.kind !== kind) continue;
    if (zone.type === 'helipad') {
      if (Math.hypot(p.x - zone.x, p.y - zone.y) <= zone.radius + 8)
        return { zone, at: { x: zone.x, y: zone.y } };
      continue;
    }
    const ux = Math.cos(zone.angle);
    const uy = Math.sin(zone.angle);
    const along = (p.x - zone.x) * ux + (p.y - zone.y) * uy;
    const across = Math.abs(-(p.x - zone.x) * uy + (p.y - zone.y) * ux);
    const len = Math.hypot(dx, dy);
    if (len === 0 || (dx * ux + dy * uy) / len < RUNWAY_ALIGN) continue;
    if (
      along < -20 ||
      along > zone.length * RUNWAY_CAPTURE_SPAN ||
      across > zone.width / 2 + RUNWAY_CAPTURE
    )
      continue;
    const t = Math.max(0, along);
    return { zone, at: { x: zone.x + ux * t, y: zone.y + uy * t } };
  }
  return null;
}
