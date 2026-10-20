import { Container, Graphics } from 'pixi.js';
import { COLORS, label } from '../flights/art';
import {
  ART,
  DESIGN_LANE,
  GROUP_ROW,
  LANES,
  LANE_W,
  ROAD_HALF,
  SCENERY_EXTENT,
  STREET_WIDTH,
  type Kind,
  type PickupKind,
} from './constants';
import {
  edge,
  laneOffset,
  pose,
  type Entrance,
  type Field,
  type Park,
  type Point,
  type Season,
  type Track,
  type Tree,
  type Water,
} from './park';

export { COLORS };

const INK = COLORS.ink;
const OUTLINE = { width: 1.6, color: INK, join: 'round' as const };

// ---------------------------------------------------------------------------------------------------------------
// Seasons.

interface Palette {
  grass: number;
  grassDark: number;
  grassLight: number;
  field: number;
  fieldStripe: number;
  water: number;
  waterLight: number;
  frozen: boolean;
  path: number;
  pathEdge: number;
  canopies: readonly number[];
  /** Blossom on some trees in spring. */
  blossom: readonly number[];
  bare: boolean;
  evergreen: number;
  road: number;
  curb: number;
  snow: boolean;
  /** Leaves scattered on the grass. */
  litter: readonly number[];
}

const PALETTES: Readonly<Record<Season, Palette>> = {
  spring: {
    grass: 0x93d465,
    grassDark: 0x86c859,
    grassLight: 0xa6df7a,
    field: 0xa3dc74,
    fieldStripe: 0x98d469,
    water: 0x5ab6e4,
    waterLight: 0x8fd0f0,
    frozen: false,
    path: 0xeadbb6,
    pathEdge: 0xcdb98f,
    canopies: [0x5fa83b, 0x6cb544, 0x4f9a34],
    blossom: [0xf6b3cb, 0xf9c9dc, 0xf3a0bf],
    bare: false,
    evergreen: 0x3f7f45,
    road: 0x5d5b60,
    curb: 0xc9c3b6,
    snow: false,
    litter: [],
  },
  summer: {
    grass: 0x74c049,
    grassDark: 0x69b540,
    grassLight: 0x86cc58,
    field: 0x84cc55,
    fieldStripe: 0x79c24c,
    water: 0x4fadde,
    waterLight: 0x86cbee,
    frozen: false,
    path: 0xe9d7ae,
    pathEdge: 0xcab48a,
    canopies: [0x3f8a2e, 0x4a9a35, 0x347f2a, 0x55a43a],
    blossom: [],
    bare: false,
    evergreen: 0x2f6e3c,
    road: 0x5a585d,
    curb: 0xc9c3b6,
    snow: false,
    litter: [],
  },
  autumn: {
    grass: 0xa3c160,
    grassDark: 0x98b757,
    grassLight: 0xb2cb72,
    field: 0xaecb6c,
    fieldStripe: 0xa3c262,
    water: 0x4f9fcf,
    waterLight: 0x82c2e6,
    frozen: false,
    path: 0xe6d3a8,
    pathEdge: 0xc7af83,
    canopies: [0xe07a2c, 0xd4552b, 0xf0b23a, 0xb84a2a, 0x9aa53c, 0xe89a30],
    blossom: [],
    bare: false,
    evergreen: 0x3a6f42,
    road: 0x5b585b,
    curb: 0xc9c3b6,
    snow: false,
    litter: [0xe07a2c, 0xf0b23a, 0xd4552b],
  },
  winter: {
    grass: 0xeef4f8,
    grassDark: 0xe1eaf1,
    grassLight: 0xfafcfe,
    field: 0xf4f8fb,
    fieldStripe: 0xe8eff5,
    water: 0xcfe7f4,
    waterLight: 0xeaf6fc,
    frozen: true,
    path: 0xc9c1b4,
    pathEdge: 0xa9a092,
    canopies: [0x7a634f],
    blossom: [],
    bare: true,
    evergreen: 0x2f5f40,
    road: 0x626066,
    curb: 0xf6f9fb,
    snow: true,
    litter: [],
  },
};

export const SEASON_NAMES: Readonly<Record<Season, string>> = {
  spring: 'SPRING',
  summer: 'SUMMER',
  autumn: 'AUTUMN',
  winter: 'WINTER',
};

/** Mixes `a` toward `b` by `t`. */
const mix = (a: number, b: number, t: number): number => {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
};

const polyline = (g: Graphics, line: readonly Point[], closed = false): Graphics => {
  g.moveTo(line[0]!.x, line[0]!.y);
  for (let i = 1; i < line.length; i++) g.lineTo(line[i]!.x, line[i]!.y);
  if (closed) g.closePath();
  return g;
};

const flat = (pts: readonly Point[]): number[] => pts.flatMap((p) => [p.x, p.y]);

// ---------------------------------------------------------------------------------------------------------------
// The city.

const ROOFS = [0x9c5b45, 0xb06b4f, 0xd8cdb5, 0xa9a7a3, 0xc9b59a, 0x7c736d];
const STREET = 0x4f4e53;
const PAVEMENT = 0xcfcac0;

const drawCity = (g: Graphics, park: Park, snow: boolean): void => {
  const out = SCENERY_EXTENT;
  g.rect(-out, -out, park.frame.w + out * 2, park.frame.h + out * 2).fill(STREET);
  for (const b of park.blocks) g.roundRect(b.x, b.y, b.w, b.h, 6);
  g.fill(snow ? 0xe6ebef : PAVEMENT);
  for (const b of park.buildings) {
    const roof = snow ? mix(ROOFS[b.tone]!, 0xf4f7fa, 0.6) : ROOFS[b.tone]!;
    g.rect(b.x + 3, b.y + 3, b.w - 6, b.h - 6)
      .fill(mix(roof, 0x000000, 0.25))
      .rect(b.x + 6, b.y + 6, b.w - 12, b.h - 12)
      .fill(roof);
    // A bit of rooftop clutter: a box for the stairs and, on bigger roofs, a water tower.
    if (b.w > 30 && b.h > 30) {
      g.rect(b.x + b.w * 0.6, b.y + b.h * 0.25, 9, 7).fill(mix(roof, 0x000000, 0.18));
    }
    if (b.tower) {
      const tx = b.x + b.w * 0.3;
      const ty = b.y + b.h * 0.6;
      g.circle(tx + 3, ty + 4, 6).fill({ color: 0x000000, alpha: 0.18 });
      g.circle(tx, ty, 6)
        .fill(snow ? 0xf2f4f6 : 0x8a6a4a)
        .stroke({ width: 1.2, color: INK, alpha: 0.6 });
      g.circle(tx, ty, 2.2).fill(snow ? 0xdde3e8 : 0x6e5238);
    }
  }
  // The street round the park: pavement on the park side, a centre line and zebra crossings at the gates.
  const w = park.wall;
  const ring = (inset: number) => ({
    x: w.x - inset,
    y: w.y - inset,
    w: w.w + inset * 2,
    h: w.h + inset * 2,
  });
  const side = ring(6);
  g.roundRect(side.x, side.y, side.w, side.h, 62).fill(snow ? 0xe6ebef : PAVEMENT);
  const mid = ring(6 + STREET_WIDTH / 2);
  for (const [x1, y1, x2, y2] of [
    [mid.x + 70, mid.y, mid.x + mid.w - 70, mid.y],
    [mid.x + 70, mid.y + mid.h, mid.x + mid.w - 70, mid.y + mid.h],
    [mid.x, mid.y + 70, mid.x, mid.y + mid.h - 70],
    [mid.x + mid.w, mid.y + 70, mid.x + mid.w, mid.y + mid.h - 70],
  ] as const) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 0; d < len; d += 26) {
      const t0 = d / len;
      const t1 = Math.min(1, (d + 13) / len);
      g.moveTo(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0).lineTo(
        x1 + (x2 - x1) * t1,
        y1 + (y2 - y1) * t1,
      );
    }
  }
  g.stroke({ width: 2, color: 0xf3c33f, alpha: 0.85 });
  for (const e of park.entrances) crossing(g, e);
};

/** Zebra stripes across the street from the far pavement to the gate. */
const crossing = (g: Graphics, e: Entrance): void => {
  const dx = e.gate.x - e.street.x;
  const dy = e.gate.y - e.street.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  for (let d = 6; d < len - 6; d += 7) {
    const cx = e.street.x + ux * d;
    const cy = e.street.y + uy * d;
    g.moveTo(cx - uy * 20, cy + ux * 20).lineTo(cx + uy * 20, cy - ux * 20);
  }
  g.stroke({ width: 3.5, color: 0xffffff, alpha: 0.8 });
};

// ---------------------------------------------------------------------------------------------------------------
// The park.

const drawGround = (g: Graphics, park: Park, pal: Palette, rng: () => number): void => {
  const w = park.wall;
  // The stone wall, then the grass inside it.
  g.roundRect(w.x - 3, w.y - 3, w.w + 6, w.h + 6, 58)
    .fill(0xa59d8f)
    .stroke({ width: 1.5, color: INK, alpha: 0.5 });
  g.roundRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6, 52).fill(pal.grass);
  // Soft patches so the grass isn't flat.
  for (let i = 0; i < 26; i++) {
    const r = 20 + rng() * 34;
    // Kept clear of the wall, rounded corners and all.
    const x = w.x + 60 + r * 1.4 + rng() * (w.w - 120 - r * 2.8);
    const y = w.y + 50 + r + rng() * (w.h - 100 - r * 2);
    g.ellipse(x, y, r * 1.4, r).fill({
      color: i % 2 ? pal.grassDark : pal.grassLight,
      alpha: 0.55,
    });
  }
  if (pal.litter.length) {
    for (let i = 0; i < 260; i++) {
      const x = w.x + 10 + rng() * (w.w - 20);
      const y = w.y + 10 + rng() * (w.h - 20);
      g.ellipse(x, y, 2, 1.2).fill({ color: pal.litter[i % pal.litter.length]!, alpha: 0.75 });
    }
  }
  if (pal.snow) {
    // Blue shading in the drifts.
    for (let i = 0; i < 40; i++) {
      const x = w.x + 60 + rng() * (w.w - 120);
      const y = w.y + 40 + rng() * (w.h - 80);
      g.ellipse(x, y, 14 + rng() * 22, 5 + rng() * 6).fill({ color: 0xc9d9e6, alpha: 0.35 });
    }
  }
};

const drawFields = (g: Graphics, park: Park, pal: Palette): void => {
  for (const f of park.fields) {
    g.ellipse(f.x, f.y, f.rx + 3, f.ry + 3).fill({ color: pal.grassDark, alpha: 0.8 });
    g.ellipse(f.x, f.y, f.rx, f.ry).fill(pal.field);
    // Mowing stripes: bands across the ellipse.
    const band = 9;
    for (let y0 = f.y - f.ry; y0 < f.y + f.ry; y0 += band * 2) {
      const y1 = Math.min(f.y + f.ry, y0 + band);
      const half = (y: number) => f.rx * Math.sqrt(Math.max(0, 1 - ((y - f.y) / f.ry) ** 2));
      const left: number[] = [];
      const right: number[] = [];
      for (let k = 0; k <= 4; k++) {
        const y = y0 + ((y1 - y0) * k) / 4;
        left.push(f.x - half(y), y);
        right.unshift(f.x + half(y), y);
      }
      g.poly([...left, ...right]).fill(pal.fieldStripe);
    }
    if (f.diamond && !pal.snow) drawDiamond(g, f, pal);
  }
};

/** Clay on a ball field, scaled from a real one: 90 ft between bases. */
const CLAY = 0xcf8f5c;

/**
 * A ball field in one end of a field: home plate toward the edge and the outfield toward the middle. As on a real
 * one, the infield clay is an arc about the pitcher's mound out past the bases, with grass inside the base paths,
 * clay circles round home and the mound, and chalk foul lines from home out to the edge of the grass.
 */
const drawDiamond = (g: Graphics, f: Field, pal: Palette): void => {
  const hx = f.x - f.rx * 0.55;
  const hy = f.y + f.ry * 0.45;
  const a = Math.atan2(f.y - hy, f.x - hx);
  // Home to first base; the rest follows a real field's measurements in feet.
  const d = Math.min(f.rx, f.ry) * 0.85 * 0.6;
  const ft = d / 90;
  const at = (dist: number, turn: number) => ({
    x: hx + Math.cos(a + turn) * dist,
    y: hy + Math.sin(a + turn) * dist,
  });
  const mound = at(60.5 * ft, 0);
  // The clay: between the foul lines, out to 95 ft from the mound.
  const skin = 95 * ft;
  const reach = (turn: number) => {
    const along = Math.cos(turn) * 60.5 * ft;
    return along + Math.sqrt(skin * skin - (60.5 * ft) ** 2 + along * along);
  };
  const clay: number[] = [hx, hy];
  const corner = Math.atan2(
    Math.sin(-Math.PI / 4) * reach(-Math.PI / 4),
    Math.cos(-Math.PI / 4) * reach(-Math.PI / 4) - 60.5 * ft,
  );
  for (let k = 0; k <= 16; k++) {
    const t = corner + (-2 * corner * k) / 16;
    clay.push(mound.x + Math.cos(a + t) * skin, mound.y + Math.sin(a + t) * skin);
  }
  g.poly(clay).fill(CLAY);
  // Infield grass, inside the base paths.
  const inset = (p: { x: number; y: number }) => ({
    x: hx + (p.x - hx) * 0.88 + Math.cos(a) * 6 * ft,
    y: hy + (p.y - hy) * 0.88 + Math.sin(a) * 6 * ft,
  });
  const grass = [
    at(0, 0),
    at(90 * ft, -Math.PI / 4),
    at(90 * Math.SQRT2 * ft, 0),
    at(90 * ft, Math.PI / 4),
  ].map(inset);
  g.poly(flat(grass)).fill(pal.field);
  // Cut-outs round the bases, home and the mound.
  const bases = [at(90 * ft, -Math.PI / 4), at(90 * Math.SQRT2 * ft, 0), at(90 * ft, Math.PI / 4)];
  for (const b of bases) g.circle(b.x, b.y, 13 * ft);
  g.circle(hx, hy, 13 * ft)
    .circle(mound.x, mound.y, 9 * ft)
    .fill(CLAY);
  // Foul lines out to the edge of the grass.
  for (const turn of [-Math.PI / 4, Math.PI / 4]) {
    const dx = Math.cos(a + turn);
    const dy = Math.sin(a + turn);
    // Where the line leaves the field's ellipse.
    const px = (hx - f.x) / f.rx;
    const py = (hy - f.y) / f.ry;
    const qx = dx / f.rx;
    const qy = dy / f.ry;
    const qq = qx * qx + qy * qy;
    const pq = px * qx + py * qy;
    const out = (-pq + Math.sqrt(pq * pq - qq * (px * px + py * py - 1))) / qq;
    g.moveTo(hx, hy).lineTo(hx + dx * (out - 3), hy + dy * (out - 3));
  }
  g.stroke({ width: 1.2, color: 0xffffff, alpha: 0.5 });
  g.circle(mound.x, mound.y, 1.6).fill({ color: 0xffffff, alpha: 0.75 });
  for (const p of [...bases, { x: hx, y: hy }])
    g.rect(p.x - 1.8, p.y - 1.8, 3.6, 3.6).fill({ color: 0xffffff, alpha: 0.75 });
};

const drawWater = (g: Graphics, w: Water, pal: Palette, rng: () => number): void => {
  const rim = w.kind === 'reservoir' ? 0x9a978f : pal.snow ? 0xdfe8ee : 0x8fb36a;
  polyline(g, w.outline, true).stroke({
    width: w.kind === 'reservoir' ? 6 : 5,
    color: rim,
    join: 'round',
  });
  g.poly(flat(w.outline)).fill(pal.water);
  // A lighter middle, as if the light catches it.
  const inner = w.outline.map((p) => ({
    x: w.centre.x + (p.x - w.centre.x) * 0.72 - 3,
    y: w.centre.y + (p.y - w.centre.y) * 0.72 - 3,
  }));
  g.poly(flat(inner)).fill({ color: pal.waterLight, alpha: 0.45 });
  polyline(g, w.outline, true).stroke({ width: 1.4, color: INK, alpha: 0.35, join: 'round' });
  if (pal.frozen) {
    // Cracks in the ice.
    for (let i = 0; i < 5; i++) {
      let x = w.centre.x + (rng() - 0.5) * w.radius;
      let y = w.centre.y + (rng() - 0.5) * w.radius * 0.6;
      g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += (rng() - 0.5) * 22;
        y += (rng() - 0.5) * 14;
        g.lineTo(x, y);
      }
    }
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
    return;
  }
  // Ripples, and a couple of ducks on the lake.
  for (let i = 0; i < 4; i++) {
    const x = w.centre.x + (rng() - 0.5) * w.radius * 0.9;
    const y = w.centre.y + (rng() - 0.5) * w.radius * 0.5;
    g.moveTo(x - 7, y)
      .quadraticCurveTo(x - 3.5, y - 3, x, y)
      .quadraticCurveTo(x + 3.5, y - 3, x + 7, y);
  }
  g.stroke({ width: 1.6, color: pal.waterLight, cap: 'round' });
  if (w.kind === 'lake') {
    for (let i = 0; i < 2; i++) {
      const x = w.centre.x + (rng() - 0.5) * w.radius * 0.6;
      const y = w.centre.y + (rng() - 0.5) * w.radius * 0.4;
      g.ellipse(x, y, 4.5, 3).fill(0xffffff).stroke({ width: 1, color: INK, alpha: 0.6 });
      g.circle(x + 4, y - 1.5, 2)
        .fill(0xffffff)
        .stroke({ width: 1, color: INK, alpha: 0.6 });
      g.circle(x + 6, y - 1.5, 0.9).fill(0xf3a53a);
    }
  }
};

const drawPath = (g: Graphics, line: readonly Point[], pal: Palette, width: number): void => {
  polyline(g, line).stroke({ width: width + 3, color: pal.pathEdge, cap: 'round', join: 'round' });
  polyline(g, line).stroke({ width, color: pal.path, cap: 'round', join: 'round' });
};

/** Dashes along the loop `d` px out from the centre line. */
const dashes = (g: Graphics, track: Track, d: number, on: number, off: number): void => {
  for (let s = 0; s < track.length - on; s += on + off) {
    const a = pose(track, s, d);
    g.moveTo(a.x, a.y);
    for (let k = 1; k <= 3; k++) {
      const p = pose(track, s + (on * k) / 3, d);
      g.lineTo(p.x, p.y);
    }
  }
};

const drawRoad = (g: Graphics, park: Park, pal: Palette): void => {
  const { track, entrances } = park;
  const outer = edge(track, ROAD_HALF);
  const inner = edge(track, -ROAD_HALF);
  const mouth = (e: Entrance) => {
    const into = pose(track, e.s, ROAD_HALF - 6);
    return [e.street, e.gate, e.throat, { x: into.x, y: into.y }];
  };
  // Entrance roads: kerb, then tarmac, joined to the loop's tarmac below.
  for (const e of entrances) {
    polyline(g, mouth(e).slice(0, 3)).stroke({
      width: LANE_W * 2 + 12,
      color: pal.curb,
      join: 'round',
    });
  }
  g.poly(flat(edge(track, ROAD_HALF + 4)))
    .fill(pal.curb)
    .poly(flat(edge(track, -ROAD_HALF - 4)))
    .cut();
  g.poly(flat(outer)).fill(pal.road).poly(flat(inner)).cut();
  for (const e of entrances) {
    polyline(g, mouth(e)).stroke({ width: LANE_W * 2 + 4, color: pal.road, join: 'round' });
  }
  // Lane lines between the lanes, solid lines along the edges.
  for (let lane = 1; lane < LANES; lane++) dashes(g, track, (lane - LANES / 2) * LANE_W, 12, 12);
  g.stroke({ width: 1.6, color: 0xffffff, alpha: 0.75 });
  polyline(g, edge(track, ROAD_HALF - 3), true).stroke({
    width: 1.4,
    color: 0xffffff,
    alpha: 0.55,
  });
  polyline(g, edge(track, -ROAD_HALF + 3), true).stroke({
    width: 1.4,
    color: 0xffffff,
    alpha: 0.55,
  });
  // Arrows painted on the road showing the way round.
  for (let i = 0; i < 6; i++) {
    const s = ((i + 0.5) * track.length) / 6;
    for (const lane of [1, 2]) {
      const c = pose(track, s, laneOffset(lane, 1));
      const ux = Math.cos(c.angle);
      const uy = Math.sin(c.angle);
      g.moveTo(c.x - ux * 5 - uy * 5, c.y - uy * 5 + ux * 5)
        .lineTo(c.x + ux * 4, c.y + uy * 4)
        .lineTo(c.x - ux * 5 + uy * 5, c.y - uy * 5 - ux * 5);
    }
  }
  g.stroke({ width: 2.2, color: 0xffffff, alpha: 0.4, cap: 'round', join: 'round' });
  if (pal.snow) {
    // Ploughed snow heaped along the kerbs.
    for (const d of [ROAD_HALF + 5, -ROAD_HALF - 5]) {
      polyline(g, edge(track, d), true).stroke({ width: 7, color: 0xffffff, join: 'round' });
      for (let s = 0; s < track.length; s += 7) {
        const p = pose(track, s, d + Math.sign(d) * 1.5);
        g.circle(p.x, p.y, 3.5 + ((s * 7) % 2.5));
      }
      g.fill(0xffffff);
      polyline(g, edge(track, d + Math.sign(d) * 6), true).stroke({
        width: 1.2,
        color: 0xb9cbd8,
        alpha: 0.8,
      });
    }
  }
};

/** A lumpy oval `rx` by `ry` round the origin; `seed` keeps each patch's shape steady. */
const blob = (rx: number, ry: number, seed: number, wobble = 0.16): number[] => {
  const pts: number[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const f = 1 + wobble * Math.sin(a * 3 + seed * 5.1) * Math.cos(a * 2 + seed * 2.3);
    pts.push(Math.cos(a) * rx * f, Math.sin(a) * ry * f);
  }
  return pts;
};

/**
 * A slippery patch for the season, drawn facing +x (along the road) round the origin: ice in winter, a puddle in
 * spring, mud in summer and a pile of leaves in autumn.
 */
export const patchGraphic = (season: Season, len: number, seed = 0.37): Graphics => {
  const g = new Graphics();
  const rx = len / 2;
  const ry = DESIGN_LANE / 2 - 2.5;
  switch (season) {
    case 'winter':
      g.poly(blob(rx, ry, seed))
        .fill({ color: 0xd6efff, alpha: 0.95 })
        .stroke({ width: 1.4, color: 0xffffff, join: 'round' });
      g.moveTo(-rx * 0.55, -1.5)
        .lineTo(rx * 0.1, -3.5)
        .moveTo(rx * 0.25, 2.5)
        .lineTo(rx * 0.6, 1.5)
        .stroke({ width: 1.6, color: 0xffffff, cap: 'round' });
      break;
    case 'spring':
      g.poly(blob(rx + 1.5, ry + 1.5, seed)).fill({ color: 0x3e4a55, alpha: 0.45 });
      g.poly(blob(rx, ry, seed)).fill({ color: 0x6f9ec2, alpha: 0.95 });
      g.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.45, ry * 0.28).fill({ color: 0xbfe0f5, alpha: 0.7 });
      g.ellipse(rx * 0.3, ry * 0.2, 3.2, 2).stroke({ width: 1, color: 0xe6f4fc, alpha: 0.9 });
      g.ellipse(rx * 0.3, ry * 0.2, 5.6, 3.6).stroke({ width: 0.8, color: 0xe6f4fc, alpha: 0.5 });
      break;
    case 'summer':
      g.poly(blob(rx + 1.5, ry + 1, seed, 0.2)).fill({ color: 0x4a3018, alpha: 0.55 });
      g.poly(blob(rx, ry - 0.5, seed, 0.2)).fill(0x6e4a2a);
      // Darker wet ruts, and the shine of water standing on top.
      for (const [x, y, w] of [
        [rx * 0.25, ry * 0.2, rx * 0.5],
        [-rx * 0.4, ry * 0.3, rx * 0.3],
      ] as const)
        g.ellipse(x, y, w, ry * 0.22).fill({ color: 0x553820, alpha: 0.85 });
      g.ellipse(-rx * 0.2, -ry * 0.38, rx * 0.42, 1.3).fill({ color: 0xd9b48a, alpha: 0.7 });
      // Splatter round the edge.
      for (const [x, y] of [
        [-rx - 2.5, -ry * 0.4],
        [rx + 2, ry * 0.5],
        [rx * 0.4, -ry - 2],
      ] as const)
        g.circle(x, y, 1.3).fill(0x6a4629);
      break;
    case 'autumn': {
      g.poly(blob(rx, ry, seed)).fill({ color: 0x7a3f1c, alpha: 0.35 });
      const leaves = [0xe07a2c, 0xd4552b, 0xf0b23a, 0xb84a2a, 0xe89a30, 0x9aa53c];
      for (let i = 0; i < 16; i++) {
        const a = i * 2.39996 + seed * 7;
        const d = Math.sqrt((i + 0.5) / 16);
        const x = Math.cos(a) * rx * 0.85 * d;
        const y = Math.sin(a) * ry * 0.85 * d;
        const ang = a * 1.7;
        const ux = Math.cos(ang) * 3.2;
        const uy = Math.sin(ang) * 3.2;
        const color = leaves[i % leaves.length]!;
        // A pointed leaf: two curves meeting at the tips.
        g.moveTo(x - ux, y - uy)
          .quadraticCurveTo(x - uy * 0.7, y + ux * 0.7, x + ux, y + uy)
          .quadraticCurveTo(x + uy * 0.7, y - ux * 0.7, x - ux, y - uy)
          .fill(color)
          .stroke({ width: 0.7, color: 0x5a2a12, alpha: 0.7 });
      }
      break;
    }
  }
  return g;
};

/**
 * The season's patches, each placed on the road where it sits, in the order they appear. They are drawn at the
 * design size, so the view scales each by `ART` (times its pop-in).
 */
export const patchSprites = (park: Park): Graphics[] =>
  park.patches.map((p) => {
    const g = patchGraphic(park.season, p.len / ART, p.id + p.s * 0.01);
    const at = pose(park.track, p.s, laneOffset(p.lane, p.width));
    g.position.set(at.x, at.y);
    g.rotation = at.angle;
    return g;
  });

/** Stone pillars either side of each gate. */
const drawGates = (g: Graphics, park: Park): void => {
  for (const e of park.entrances) {
    const vertical = e.gate.y === park.wall.y || e.gate.y === park.wall.y + park.wall.h;
    for (const side of [-1, 1]) {
      const x = e.gate.x + (vertical ? side * (LANE_W + 7) : 0);
      const y = e.gate.y + (vertical ? 0 : side * (LANE_W + 7));
      g.roundRect(x - 5, y - 5, 10, 10, 2)
        .fill(0xb9b2a4)
        .stroke({ width: 1.4, color: INK, alpha: 0.7 });
      g.circle(x, y, 2.2).fill(0x8f887b);
    }
  }
};

const drawTrees = (g: Graphics, trees: readonly Tree[], pal: Palette): void => {
  for (const t of trees)
    g.ellipse(t.x + 4, t.y + 5, t.r * 1.05, t.r * 0.8).fill({ color: 0x000000, alpha: 0.16 });
  for (const t of trees) {
    if (t.evergreen) {
      evergreen(g, t, pal);
      continue;
    }
    if (pal.bare) {
      bareTree(g, t);
      continue;
    }
    const blossom = pal.blossom.length > 0 && t.tone < 0.3;
    const list = blossom ? pal.blossom : pal.canopies;
    const base = list[Math.floor(t.tone * 997) % list.length]!;
    g.circle(t.x, t.y, t.r)
      .fill(base)
      .stroke({ width: 1.2, color: mix(base, 0x000000, 0.35), alpha: 0.8 });
    g.circle(t.x - t.r * 0.25, t.y - t.r * 0.3, t.r * 0.62).fill(
      mix(base, 0xffffff, blossom ? 0.45 : 0.22),
    );
    g.circle(t.x - t.r * 0.42, t.y - t.r * 0.45, t.r * 0.22).fill({ color: 0xffffff, alpha: 0.25 });
  }
};

const evergreen = (g: Graphics, t: Tree, pal: Palette): void => {
  const star = (r: number): number[] => {
    const pts: number[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + t.tone;
      const rr = i % 2 ? r * 0.72 : r;
      pts.push(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr);
    }
    return pts;
  };
  g.poly(star(t.r))
    .fill(pal.evergreen)
    .stroke({ width: 1.2, color: mix(pal.evergreen, 0x000000, 0.4) });
  g.poly(star(t.r * 0.6)).fill(mix(pal.evergreen, 0xffffff, 0.18));
  if (pal.snow) {
    g.circle(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.35).fill({ color: 0xffffff, alpha: 0.9 });
    g.circle(t.x + t.r * 0.35, t.y + t.r * 0.1, t.r * 0.22).fill({ color: 0xffffff, alpha: 0.85 });
  }
  g.circle(t.x, t.y, t.r * 0.12).fill(0x5d4632);
};

/** A winter tree seen from above: branches spreading from the trunk, dusted with snow. */
const bareTree = (g: Graphics, t: Tree): void => {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t.tone * 3;
    const ex = t.x + Math.cos(a) * t.r;
    const ey = t.y + Math.sin(a) * t.r;
    g.moveTo(t.x, t.y).lineTo(ex, ey);
    const fork = a + 0.6;
    g.moveTo(t.x + Math.cos(a) * t.r * 0.55, t.y + Math.sin(a) * t.r * 0.55).lineTo(
      t.x + Math.cos(a) * t.r * 0.55 + Math.cos(fork) * t.r * 0.4,
      t.y + Math.sin(a) * t.r * 0.55 + Math.sin(fork) * t.r * 0.4,
    );
  }
  g.stroke({ width: 1.8, color: 0x6b5443, cap: 'round' });
  g.circle(t.x, t.y, 2.6).fill(0x5a4636);
  g.circle(t.x - 1, t.y - 1, 1.4).fill(0xffffff);
};

/** Everything that stays put, drawn once per park. */
export const drawPark = (park: Park): Container => {
  const pal = PALETTES[park.season];
  // A fixed sequence for decoration, so the same park always looks the same.
  let seed = Math.round(park.track.length * 1000) >>> 0;
  const rng = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const c = new Container();
  const city = new Graphics();
  drawCity(city, park, pal.snow);
  const ground = new Graphics();
  drawGround(ground, park, pal, rng);
  drawFields(ground, park, pal);
  for (const line of park.paths) drawPath(ground, line, pal, 7);
  for (const s of park.shortcuts) drawPath(ground, s.path, pal, 9);
  for (const w of park.water) drawWater(ground, w, pal, rng);
  const road = new Graphics();
  drawRoad(road, park, pal);
  drawGates(road, park);
  const trees = new Graphics();
  drawTrees(trees, park.trees, pal);
  c.addChild(city, ground, road, trees);
  return c;
};

// ---------------------------------------------------------------------------------------------------------------
// Movers. Each is drawn facing +x, centred on its spot on the road, so a rotation turns it about its middle.

const SHIRTS = [
  0xe4544c, 0x48a8dd, 0xf4c430, 0x7bc96f, 0xa77bd8, 0xf08aa4, 0xf7f3ea, 0x2f4f7f, 0xf28a3a,
];
const SPORT = [0xff5a5f, 0x22c1c3, 0xfdd23c, 0x8ee04a, 0xff8a00, 0xd94cf0, 0x3d7bfd];
const COATS = [0x8b2f2f, 0x2f4f7f, 0x3f6b3f, 0x5b4636, 0x6b3f7f, 0x2e2a2c];
const HAIR = [0x3b2a20, 0x6b4a2e, 0xe0b85a, 0x1e1e1e, 0xa0522d, 0xc9c9c9];
const SKIN = [0xf3d0b0, 0xe1b18a, 0xb67b52, 0x7a5236];
const DOGS = [0xc8935a, 0x3a3332, 0xf2efe8, 0x8a5a3a, 0xe0c080];
const CARS = [0xd84a3e, 0x3f6fb2, 0xe9ecef, 0x3a3d42, 0x6f8a4a];
const HORSES = [0x8a5a3a, 0xf0ebe2, 0x3a2e28, 0xa8774a];
const CARRIAGES = [0x2c2833, 0x6b1f2b, 0x203a5c];

const pick = <T>(list: readonly T[], t: number): T =>
  list[Math.floor(t * list.length) % list.length]!;

/** Badge ring colour for each kind. */
export const KIND_COLORS: Readonly<Record<Kind, number>> = {
  walker: 0x4f9e3f,
  dog: 0x2a9d96,
  runner: 0xe9791d,
  biker: 0x3f6fb2,
  car: 0xc98a12,
  carriage: 0x8a5cc2,
  group: 0xd6336c,
};
export const WRONG_WAY_COLOR = COLORS.red;

export interface Look {
  kind: Kind;
  look: readonly [number, number, number];
  season: Season;
  /** Runners in a run group. */
  crowd?: number;
}

interface Member {
  x: number;
  y: number;
  top: number;
  hair: number;
  /** Offsets each runner's stride so the pack doesn't move in lockstep. */
  phase: number;
}

const BLACK_KIT = 0x26262b;

/** A run group's runners, two abreast from the front back, all in black or each in a bright colour. */
const groupMembers = (crowd: number, look: Look['look']): Member[] => {
  const black = look[0] < 0.5;
  const rows = Math.ceil(crowd / 2);
  const front = ((rows - 1) * GROUP_ROW) / 2;
  const jitter = (i: number, k: number) =>
    Math.sin(i * 12.9898 + k * 78.233 + look[1] * 43.7) * 1.6;
  return Array.from({ length: crowd }, (_, i) => {
    const row = Math.floor(i / 2);
    const alone = i === crowd - 1 && crowd % 2 === 1;
    const t = (Math.sin(i * 3.1 + look[2] * 9) + 1) / 2;
    return {
      x: front - row * GROUP_ROW + jitter(i, 1),
      y: alone ? jitter(i, 2) : (i % 2 ? 1 : -1) * (DESIGN_LANE / 2) + jitter(i, 2),
      top: black ? BLACK_KIT : pick(SPORT, (t + i * 0.37) % 1),
      hair: pick(HAIR, (t * 7.3) % 1),
      phase: i * 1.9,
    };
  });
};

/** The body of a mover, which doesn't change as it moves. */
export const moverBody = ({ kind, look, season, crowd = 1 }: Look): Graphics => {
  const g = new Graphics();
  const winter = season === 'winter';
  const [a, b, c] = look;
  switch (kind) {
    case 'group':
      for (const m of groupMembers(crowd, look)) person(g, m.x, m.y, m.top, m.hair, false, 0, true);
      break;
    case 'walker':
      person(g, 0, 0, winter ? pick(COATS, a) : pick(SHIRTS, a), pick(HAIR, b), winter, c);
      break;
    case 'runner':
      person(g, 0, 0, pick(SPORT, a), pick(HAIR, b), false, c, true);
      break;
    case 'dog': {
      const side = c < 0.5 ? -1 : 1;
      const py = (side * DESIGN_LANE) / 2;
      const dy = -py;
      const dog = pick(DOGS, b);
      // The lead, from the walker's hand to the collar.
      g.moveTo(3, py - side * 7)
        .quadraticCurveTo(9, (py + dy) / 2, 11, dy)
        .stroke({ width: 1.4, color: COLORS.red });
      g.ellipse(1, dy, 8, 4.2).fill(dog).stroke(OUTLINE);
      g.ellipse(-1, dy - 1, 4.4, 1.6).fill({ color: 0xffffff, alpha: 0.25 });
      g.circle(9.5, dy, 3.7).fill(dog).stroke(OUTLINE);
      g.ellipse(8.4, dy - 3.4, 2, 1.3).fill(mix(dog, 0x000000, 0.4));
      g.ellipse(8.4, dy + 3.4, 2, 1.3).fill(mix(dog, 0x000000, 0.4));
      g.circle(12.8, dy, 1.1).fill(INK);
      person(
        g,
        0,
        py,
        winter ? pick(COATS, a) : pick(SHIRTS, a),
        pick(HAIR, (a * 7) % 1),
        winter,
        c,
      );
      break;
    }
    case 'biker': {
      const B = 1.2;
      const frame = pick(SPORT, b);
      g.ellipse(9 * B, 0, 5 * B, 1.8 * B).fill(0x2a2a2a);
      g.ellipse(-9 * B, 0, 5 * B, 1.8 * B).fill(0x2a2a2a);
      g.moveTo(-9 * B, 0)
        .lineTo(9 * B, 0)
        .stroke({ width: 2.6, color: frame, cap: 'round' });
      g.moveTo(7 * B, -5.5 * B)
        .lineTo(7 * B, 5.5 * B)
        .stroke({ width: 2, color: 0x3a3a3a, cap: 'round' });
      const jersey = pick(SPORT, a);
      // Arms out to the bars.
      g.moveTo(0, -4 * B)
        .lineTo(7 * B, -5 * B)
        .moveTo(0, 4 * B)
        .lineTo(7 * B, 5 * B)
        .stroke({ width: 2.4, color: pick(SKIN, c), cap: 'round' });
      g.ellipse(-1.5 * B, 0, 4.4 * B, 5 * B)
        .fill(jersey)
        .stroke(OUTLINE);
      g.ellipse(-2.5 * B, -1.5 * B, 2.2 * B, 2 * B).fill({ color: 0xffffff, alpha: 0.3 });
      const helmet = pick(SHIRTS, c);
      g.ellipse(2.2 * B, 0, 4 * B, 3.4 * B)
        .fill(helmet)
        .stroke(OUTLINE);
      g.moveTo(0, 0)
        .lineTo(5 * B, 0)
        .stroke({ width: 1.2, color: mix(helmet, 0x000000, 0.35) });
      break;
    }
    case 'car': {
      const taxi = a < 0.55;
      const body = taxi ? 0xf7c531 : pick(CARS, b);
      const dark = mix(body, 0x000000, 0.3);
      g.roundRect(-23, -16.5, 46, 33, 9)
        .fill(body)
        .stroke({ ...OUTLINE, width: 2 });
      g.roundRect(-21, -14.5, 42, 6, 3).fill({ color: 0xffffff, alpha: 0.28 });
      // Windscreen, roof and back window.
      g.poly([6, -12, 13, -10, 13, 10, 6, 12]).fill(0x37506b);
      g.roundRect(-12, -12, 18, 24, 4)
        .fill(mix(body, 0xffffff, 0.12))
        .stroke({ width: 1, color: dark });
      g.poly([-12, -11, -17, -9, -17, 9, -12, 11]).fill(0x37506b);
      g.rect(5.5, -11, 2, 3).fill({ color: 0xffffff, alpha: 0.5 });
      g.ellipse(21, -11.5, 1.8, 2.6).fill(0xfff4c2);
      g.ellipse(21, 11.5, 1.8, 2.6).fill(0xfff4c2);
      g.rect(-23, -13.5, 2, 5).fill(COLORS.redDark);
      g.rect(-23, 8.5, 2, 5).fill(COLORS.redDark);
      if (taxi) {
        g.roundRect(-5, -4, 7, 8, 1.5).fill(0xfff8de).stroke({ width: 1, color: INK });
        g.moveTo(-17, -16.5).lineTo(22, -16.5).moveTo(-17, 16.5).lineTo(22, 16.5);
        g.stroke({ width: 1.6, color: INK, alpha: 0.55 });
      }
      break;
    }
    case 'carriage': {
      const horse = pick(HORSES, a);
      const coach = pick(CARRIAGES, b);
      // Shafts and harness, the horse, then the carriage.
      g.moveTo(1, -7)
        .lineTo(17, -4.5)
        .moveTo(1, 7)
        .lineTo(17, 4.5)
        .stroke({ width: 1.6, color: 0x6b4a2e });
      g.ellipse(10, 0, 2, 1.5).fill(mix(horse, 0x000000, 0.4));
      g.ellipse(19.5, 0, 9.5, 5.4).fill(horse).stroke(OUTLINE);
      g.ellipse(18, -1.8, 5.5, 1.8).fill({ color: 0xffffff, alpha: 0.25 });
      g.moveTo(17, -5).lineTo(17, 5).stroke({ width: 1.8, color: COLORS.red });
      g.ellipse(30.5, 0, 5, 2.9).fill(horse).stroke(OUTLINE);
      g.moveTo(22, 0)
        .lineTo(30, 0)
        .stroke({ width: 1.8, color: mix(horse, 0x000000, 0.5), cap: 'round' });
      g.ellipse(28, -2.8, 1.4, 1).fill(mix(horse, 0x000000, 0.3));
      g.ellipse(28, 2.8, 1.4, 1).fill(mix(horse, 0x000000, 0.3));
      for (const x of [-27, -6])
        for (const y of [-16, 16]) g.roundRect(x - 4.5, y - 1.6, 9, 3.2, 1.5).fill(0x2a2a2a);
      g.roundRect(-31, -14, 33, 28, 6)
        .fill(coach)
        .stroke({ ...OUTLINE, width: 1.8 });
      g.roundRect(-18, -10.5, 15, 21, 3).fill(0xa8323d);
      const heads = 1 + Math.floor(c * 2);
      for (let i = 0; i < heads; i++)
        g.circle(-12, (i - (heads - 1) / 2) * 9, 3.2).fill(pick(HAIR, (c * 13 + i * 0.37) % 1));
      // The folded hood at the back, ribbed.
      g.roundRect(-31, -13, 13, 26, 6).fill(0x1f1c22);
      g.moveTo(-26, -12)
        .lineTo(-26, 12)
        .moveTo(-22, -12)
        .lineTo(-22, 12)
        .stroke({ width: 1, color: 0x55505a });
      g.rect(-31, -14, 33, 2).fill({ color: COLORS.gold, alpha: 0.8 });
      // The driver's top hat.
      g.circle(-1, 0, 4.6).fill(0x222025).stroke({ width: 1, color: INK });
      g.circle(-1, 0, 3).fill(0x2f2c33);
      g.circle(1.5, -13, 1.6).fill(COLORS.gold);
      g.circle(1.5, 13, 1.6).fill(COLORS.gold);
      break;
    }
  }
  return g;
};

/** People are drawn this much larger than their footprint so they read at phone size. */
const K = 1.6;

/** A person from above: shoulders, then a head (or a hat in winter). Arms and feet are drawn by `drawLimbs`. */
const person = (
  g: Graphics,
  x: number,
  y: number,
  top: number,
  hair: number,
  winter: boolean,
  tone: number,
  sporty = false,
): void => {
  g.ellipse(x - 0.5 * K, y, 3.8 * K, 6 * K)
    .fill(top)
    .stroke(OUTLINE);
  g.ellipse(x - 1.2 * K, y - 2 * K, 1.8 * K, 2.4 * K).fill({ color: 0xffffff, alpha: 0.25 });
  if (winter) {
    const hat = pick(SHIRTS, tone);
    g.circle(x + 0.6 * K, y, 3.4 * K)
      .fill(hat)
      .stroke(OUTLINE);
    g.circle(x + 0.2 * K, y, 1.3 * K).fill(0xffffff);
  } else {
    g.circle(x + 0.6 * K, y, 3.3 * K)
      .fill(hair)
      .stroke(OUTLINE);
    g.circle(x - 0.2 * K, y - K, 1.1 * K).fill({ color: 0xffffff, alpha: 0.25 });
    if (sporty)
      g.moveTo(x + 0.6 * K, y - 3.2 * K)
        .lineTo(x + 0.6 * K, y + 3.2 * K)
        .stroke({ width: 1.6, color: 0xffffff });
  }
};

/**
 * Arms and legs, redrawn each frame: a walking stride, a running one, or pedalling. `phase` advances with distance
 * covered, so faster movers' legs go faster.
 */
export const drawLimbs = (
  g: Graphics,
  { kind, look, season, crowd = 1 }: Look,
  phase: number,
): void => {
  g.clear();
  const skin = pick(SKIN, look[2]);
  const shoe = 0x2e2a2c;
  const sleeve = season === 'winter';
  const stride = (x: number, y: number, reach: number, arm: number, offset = 0, kit?: number) => {
    const s = Math.sin(phase + offset);
    g.ellipse(x + s * reach * K, y - 2.6 * K, 2.2 * K, 1.6 * K).fill(shoe);
    g.ellipse(x - s * reach * K, y + 2.6 * K, 2.2 * K, 1.6 * K).fill(shoe);
    const armColor = kit ?? (sleeve ? pick(COATS, look[0]) : skin);
    g.circle(x - s * arm * K, y - 5.6 * K, 1.6 * K)
      .fill(armColor)
      .stroke({ width: 0.9, color: INK, alpha: 0.6 });
    g.circle(x + s * arm * K, y + 5.6 * K, 1.6 * K)
      .fill(armColor)
      .stroke({ width: 0.9, color: INK, alpha: 0.6 });
  };
  switch (kind) {
    case 'group':
      for (const m of groupMembers(crowd, look))
        stride(m.x, m.y, 5, 3, m.phase, m.top === BLACK_KIT ? BLACK_KIT : undefined);
      break;
    case 'walker':
      stride(0, 0, 3, 1.8);
      break;
    case 'runner':
      stride(0, 0, 5, 3);
      break;
    case 'dog': {
      const side = look[2] < 0.5 ? -1 : 1;
      const py = (side * DESIGN_LANE) / 2;
      stride(0, py, 3, 1.8);
      // Four little paws and a wagging tail.
      const s = Math.sin(phase * 1.6);
      for (const [x, y] of [
        [5, -3.8],
        [5, 3.8],
        [-3, -3.8],
        [-3, 3.8],
      ] as const)
        g.circle(x + (x > 0 ? s : -s) * 1.8, -py + y, 1.5).fill(
          mix(pick(DOGS, look[1]), 0x000000, 0.3),
        );
      g.moveTo(-7, -py)
        .lineTo(-11, -py + Math.sin(phase * 3) * 3)
        .stroke({ width: 2, color: pick(DOGS, look[1]), cap: 'round' });
      break;
    }
    case 'biker': {
      const s = Math.sin(phase);
      const k = Math.cos(phase);
      g.ellipse(1.2 + s * 2.4, -3.4, 2.4, 1.8).fill(pick(SPORT, look[0]));
      g.ellipse(1.2 - s * 2.4, 3.4, 2.4, 1.8).fill(pick(SPORT, look[0]));
      g.circle(3.6 + k * 1.8, -2.4, 1.1).fill(shoe);
      g.circle(3.6 - k * 1.8, 2.4, 1.1).fill(shoe);
      break;
    }
    case 'carriage': {
      // The horse's legs show either side as it walks.
      const s = Math.sin(phase);
      for (const [x, y] of [
        [25, -5],
        [25, 5],
        [14, -5],
        [14, 5],
      ] as const)
        g.ellipse(x + (y > 0 === x > 20 ? s : -s) * 2, y, 1.6, 1).fill(0x2a2a2a);
      break;
    }
    case 'car':
      break;
  }
};

/** How far a mover's legs move per px covered, by kind. */
export const STRIDE: Readonly<Record<Kind, number>> = {
  walker: 0.32,
  dog: 0.32,
  runner: 0.24,
  biker: 0.12,
  car: 0,
  carriage: 0.2,
  group: 0.24,
};

// ---------------------------------------------------------------------------------------------------------------
// Rats and dazed people.

const RAT = 0x7d736b;
const RAT_DARK = 0x5a514b;
const RAT_PINK = 0xf2a3b3;

/** A rat from above, facing +x, redrawn each frame so its tail and feet move. `phase` advances as it runs. */
export const drawRat = (g: Graphics, phase: number, running: boolean): void => {
  g.clear();
  const wag = Math.sin(phase * (running ? 1.2 : 0.35));
  // Tail: a long pink curve behind it.
  g.moveTo(-6, 0)
    .bezierCurveTo(-11, wag * 3, -15, -wag * 4, -20, wag * 2.5)
    .stroke({ width: 1.6, color: RAT_PINK, cap: 'round' });
  g.ellipse(1, 2, 7.5, 3.2).fill({ color: 0x000000, alpha: 0.2 });
  // Feet, scurrying when it runs.
  const f = running ? Math.sin(phase * 2) * 2 : 0;
  for (const [x, y, d] of [
    [3.5, -3.6, f],
    [3.5, 3.6, -f],
    [-3.5, -3.8, -f],
    [-3.5, 3.8, f],
  ] as const)
    g.ellipse(x + d, y, 1.4, 1).fill(RAT_PINK);
  g.ellipse(-0.5, 0, 7, 3.9).fill(RAT).stroke({ width: 1.3, color: INK, join: 'round' });
  g.ellipse(-1.5, -1.2, 3.8, 1.3).fill({ color: 0xffffff, alpha: 0.2 });
  g.moveTo(4, -3)
    .quadraticCurveTo(11, -1.5, 11.5, 0)
    .quadraticCurveTo(11, 1.5, 4, 3)
    .closePath()
    .fill(RAT_DARK)
    .stroke({ width: 1.2, color: INK, join: 'round' });
  for (const y of [-3, 3])
    g.circle(4.6, y, 2).fill(RAT_PINK).stroke({ width: 1, color: INK, alpha: 0.8 });
  g.circle(11.6, 0, 1.1).fill(RAT_PINK);
  for (const y of [-1.4, 1.4]) g.circle(8, y, 0.8).fill(0x111111);
  // Whiskers.
  g.moveTo(10, -1)
    .lineTo(13.5, -3)
    .moveTo(10, 1)
    .lineTo(13.5, 3)
    .stroke({ width: 0.6, color: INK, alpha: 0.6 });
};

/**
 * A small speech bubble with its tail pointing down at (0, 0), so it can sit just above whoever is talking.
 */
export const speechBubble = (text: string): Container => {
  const c = new Container();
  const t = label(text, 13, INK, { letterSpacing: 0.5 });
  const w = t.width + 12;
  const h = 18;
  const top = -h - 6;
  const g = new Graphics()
    .roundRect(-w / 2 + 1, top + 1.5, w, h, 7)
    .fill({ color: 0x000000, alpha: 0.18 })
    .moveTo(-4, top + h - 1)
    .lineTo(0, 0)
    .lineTo(4, top + h - 1)
    .closePath()
    .fill(0xffffff)
    .stroke({ width: 1.2, color: INK, alpha: 0.7, join: 'round' })
    .roundRect(-w / 2, top, w, h, 7)
    .fill(0xffffff)
    .stroke({ width: 1.2, color: INK, alpha: 0.7 })
    // Paint over the tail's base so it joins the bubble without a seam.
    .rect(-3.2, top + h - 2.5, 6.4, 2)
    .fill(0xffffff);
  t.position.set(0, top + h / 2 - 0.5);
  c.addChild(g, t);
  return c;
};

/** A heart for the HUD, red while that collision is still to come and an empty outline once it's used. */
export const heart = (full: boolean): Graphics => {
  const g = new Graphics();
  const shape = (): void => {
    g.moveTo(0, 9)
      .bezierCurveTo(-13, 0, -10, -11, 0, -5)
      .bezierCurveTo(10, -11, 13, 0, 0, 9)
      .closePath();
  };
  if (full) {
    shape();
    g.fill(COLORS.red).stroke({ width: 3.5, color: 0xffffff, join: 'round' });
    shape();
    g.stroke({ width: 1.6, color: INK, join: 'round' });
    g.ellipse(-4.5, -3.5, 2.6, 1.6).fill({ color: 0xffffff, alpha: 0.6 });
  } else {
    // The same outline as a full heart, so one emptying keeps its size.
    shape();
    g.fill({ color: 0x000000, alpha: 0.25 }).stroke({ width: 3.5, color: 0xffffff, join: 'round' });
    shape();
    g.stroke({ width: 1.6, color: INK, join: 'round' });
  }
  return g;
};

/** The colour of each pick-up's disc, and of the words that float up when it is taken. */
export const PICKUP_COLORS: Readonly<Record<PickupKind, number>> = {
  heart: 0xd8433a,
  double: 0x8a55c4,
  ghost: 0x2f9c95,
  star: 0xe89a1c,
  fire: 0xe8541c,
  turtle: 0x3f8f3a,
  strength: 0x3b6fd9,
  coin: 0xe0a91b,
  skull: 0x3d3a40,
  spiral: 0xc4479a,
};

/** The colours a rainbow star cycles through, on its token and on whoever has taken one. */
export const RAINBOW: readonly number[] = [0xe8443a, 0xf29a2e, 0xf4d03f, 0x4cb050, 0x3b8fd9, 0x8a55c4];

/**
 * A glow under a mover that has taken a rainbow star, the shape of its footprint plus a margin, drawn white to be
 * tinted (`RAINBOW`) as it flashes. At the design size, like the body.
 */
export const starGlow = (kind: Kind, width: number, len: number): Graphics => {
  const w = (kind === 'walker' || kind === 'runner' ? 16 : kind === 'biker' ? 12 : width * DESIGN_LANE - 4) + 10;
  const l = len + 10;
  return new Graphics().roundRect(-l / 2, -w / 2, l, w, Math.min(w, l) / 2).fill(0xffffff);
};

/**
 * A pick-up lying on the road, at the design lane width: a heart like the ones in the HUD (a life), or a disc with a
 * white ring and on it two stacked cards (a duplicate), a little ghost (invisibility), a flame (super speed), a
 * turtle (turtle speed), a dumbbell (extra laps), a gold coin (a point), a skull (a wreck), a spiral (a time warp) or, on rainbow
 * stripes, a gold star.
 */
export const pickupToken = (kind: PickupKind): Container => {
  const c = new Container();
  if (kind === 'heart') {
    const shadow = heart(true);
    shadow.tint = 0x000000;
    shadow.alpha = 0.25;
    shadow.scale.set(0.95);
    shadow.position.set(1, 2);
    const h = heart(true);
    h.scale.set(0.95);
    c.addChild(shadow, h);
    return c;
  }
  const disc = new Graphics().circle(1, 1.5, 10.5).fill({ color: 0x000000, alpha: 0.25 });
  if (kind === 'star') {
    RAINBOW.forEach((color, i) => {
      const a0 = -Math.PI / 2 + (i / RAINBOW.length) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / RAINBOW.length;
      disc.moveTo(0, 0).arc(0, 0, 10.5, a0, a1).closePath().fill(color);
    });
    disc.circle(0, 0, 10.5).stroke({ width: 2.2, color: 0xffffff });
  } else {
    disc.circle(0, 0, 10.5).fill(PICKUP_COLORS[kind]).stroke({ width: 2.2, color: 0xffffff });
  }
  c.addChild(disc);
  if (kind === 'star') {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 7.5 : 3.4;
      pts.push(Math.cos(a) * r, Math.sin(a) * r + 0.5);
    }
    c.addChild(new Graphics().poly(pts).fill(0xffd84a).stroke({ width: 1.3, color: INK, join: 'round' }));
  } else if (kind === 'double') {
    c.addChild(
      new Graphics()
        .roundRect(-6, -6.5, 9, 10, 2)
        .fill({ color: 0xffffff, alpha: 0.55 })
        .roundRect(-3, -3.5, 9, 10, 2)
        .fill(0xffffff)
        .stroke({ width: 1.2, color: INK }),
    );
  } else if (kind === 'fire') {
    c.addChild(
      new Graphics()
        .moveTo(0, -7.5)
        .bezierCurveTo(4, -3, 6, 0, 5, 3)
        .bezierCurveTo(4, 6.5, -4, 6.5, -5, 3)
        .bezierCurveTo(-6, -0.5, -3, -1.5, -2, -4)
        .bezierCurveTo(-1, -1.5, 0, -2, 0, -7.5)
        .closePath()
        .fill(0xffffff)
        .moveTo(0, 0)
        .bezierCurveTo(2.5, 2, 2.8, 5, 0, 5.5)
        .bezierCurveTo(-2.8, 5, -2.5, 2, 0, 0)
        .closePath()
        .fill(0xffd84a),
    );
  } else if (kind === 'turtle') {
    c.addChild(
      new Graphics()
        .circle(0, -6.2, 1.9)
        .circle(-4.3, -3.2, 1.5)
        .circle(4.3, -3.2, 1.5)
        .circle(-4.3, 4.2, 1.5)
        .circle(4.3, 4.2, 1.5)
        .fill(0xffffff)
        .ellipse(0, 0.5, 4.6, 5.4)
        .fill(0x2a6326)
        .stroke({ width: 1.4, color: 0xffffff }),
    );
  } else if (kind === 'strength') {
    c.addChild(
      new Graphics()
        .roundRect(-5, -1, 10, 2, 1)
        .roundRect(-7.5, -4.5, 3, 9, 1)
        .roundRect(4.5, -4.5, 3, 9, 1)
        .fill(0xffffff),
    );
  } else if (kind === 'skull') {
    c.addChild(
      new Graphics()
        .circle(0, -1.5, 5.8)
        .roundRect(-3.4, 1.5, 6.8, 5, 1.5)
        .fill(0xffffff)
        .circle(-2.2, -1.6, 1.6)
        .circle(2.2, -1.6, 1.6)
        .fill(INK)
        .moveTo(0, 1)
        .lineTo(-0.9, 2.6)
        .lineTo(0.9, 2.6)
        .closePath()
        .fill(INK)
        .moveTo(-1.2, 4.2)
        .lineTo(-1.2, 6.5)
        .moveTo(1.2, 4.2)
        .lineTo(1.2, 6.5)
        .stroke({ width: 0.9, color: INK }),
    );
  } else if (kind === 'spiral') {
    const g = new Graphics().moveTo(0, 0);
    // An Archimedean spiral, two and a bit turns out to the disc's edge.
    for (let i = 1; i <= 50; i++) {
      const a = i * 0.25;
      g.lineTo(Math.cos(a) * a * 0.6, Math.sin(a) * a * 0.6);
    }
    c.addChild(g.stroke({ width: 1.8, color: 0xffffff, cap: 'round', join: 'round' }));
  } else if (kind === 'coin') {
    c.addChild(
      new Graphics()
        .circle(0, 0, 6.5)
        .fill(0xffd84a)
        .stroke({ width: 1.2, color: INK })
        .roundRect(-1.2, -4, 2.4, 8, 1)
        .fill(0xb07a10)
        .moveTo(-1.2, -4)
        .lineTo(-3.4, -2.2)
        .stroke({ width: 1.6, color: 0xb07a10, cap: 'round' }),
    );
  } else {
    c.addChild(
      new Graphics()
        .moveTo(-5.5, 6.5)
        .lineTo(-5.5, -1)
        .arc(0, -1, 5.5, Math.PI, 0)
        .lineTo(5.5, 6.5)
        .lineTo(3.7, 4.7)
        .lineTo(1.8, 6.5)
        .lineTo(0, 4.7)
        .lineTo(-1.8, 6.5)
        .lineTo(-3.7, 4.7)
        .closePath()
        .fill(0xffffff)
        .circle(-2, -1.5, 1.1)
        .circle(2, -1.5, 1.1)
        .fill(INK),
    );
  }
  return c;
};

/** A red "!" in a white disc, over a rat about to dart out. */
export const ratAlert = (): Graphics =>
  new Graphics()
    .circle(1, 1.5, 8)
    .fill({ color: 0x000000, alpha: 0.25 })
    .circle(0, 0, 8)
    .fill(0xffffff)
    .stroke({ width: 2.4, color: COLORS.red })
    .roundRect(-1.4, -5, 2.8, 6.4, 1.4)
    .fill(COLORS.red)
    .circle(0, 3.6, 1.5)
    .fill(COLORS.red);

/** Stars circling over someone a rat has bitten; `t` turns them. */
export const drawDaze = (g: Graphics, t: number): void => {
  g.clear();
  for (let i = 0; i < 3; i++) {
    const a = t * 0.12 + (i / 3) * Math.PI * 2;
    const x = Math.cos(a) * 13;
    const y = Math.sin(a) * 5;
    const pts: number[] = [];
    for (let k = 0; k < 10; k++) {
      const ang = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? 2 : 4.8;
      pts.push(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
    }
    g.poly(pts).fill(COLORS.gold).stroke({ width: 1, color: INK, join: 'round' });
  }
};

/**
 * A soft shadow under a mover, the shape of its footprint: `len` long, at `scale` times the drawn size (the lane
 * scale on the road, 1 on the cards).
 */
export const moverShadow = (kind: Kind, width: number, len: number, scale = ART): Graphics => {
  const g = new Graphics();
  const w =
    (kind === 'walker' || kind === 'runner'
      ? 16
      : kind === 'biker'
        ? 12
        : width * DESIGN_LANE - 4) * scale;
  g.roundRect(-len / 2, -w / 2, len, w, Math.min(w, len) / 2).fill(0x000000);
  return g;
};

/** White speed lines trailing behind a boosted mover, drawn facing +x like the mover. */
export const speedStreaks = (width: number, len: number): Graphics => {
  const g = new Graphics();
  const half = (width * DESIGN_LANE) / 2 - 4;
  const back = -len / 2 - 3;
  for (const [y, l] of [
    [-half * 0.7, 10],
    [0, 15],
    [half * 0.7, 10],
  ] as const)
    g.moveTo(back, y).lineTo(back - l, y);
  g.stroke({ width: 4, color: COLORS.ink, alpha: 0.35, cap: 'round' });
  for (const [y, l] of [
    [-half * 0.7, 10],
    [0, 15],
    [half * 0.7, 10],
  ] as const)
    g.moveTo(back, y).lineTo(back - l, y);
  g.stroke({ width: 2.2, color: 0xffffff, cap: 'round' });
  return g;
};

/**
 * A "!" in a speech bubble over someone about to collide. The tail's tip is at the origin, pointing down at them, with
 * the bubble above and to the right, so it sits beside their lap badge.
 */
export const warnBubble = (): Graphics =>
  new Graphics()
    .roundRect(-2, -27, 18, 20, 7)
    .fill({ color: 0x000000, alpha: 0.2 })
    .moveTo(-0.5, -9)
    .lineTo(-4, 0)
    .lineTo(5, -9)
    .closePath()
    .fill(COLORS.gold)
    .stroke({ width: 1.4, color: INK, join: 'round' })
    .roundRect(-3, -28, 18, 20, 7)
    .fill(COLORS.gold)
    .stroke({ width: 1.4, color: INK })
    // Paint over the tail's base so it joins the bubble without a seam.
    .rect(-0.2, -10, 4.6, 2)
    .fill(COLORS.gold)
    .roundRect(4.6, -24.5, 2.8, 8.4, 1.4)
    .fill(INK)
    .circle(6, -13, 1.6)
    .fill(INK);

// ---------------------------------------------------------------------------------------------------------------
// Lap badges.

export const BADGE_R = 9.5;

/** A white disc with a coloured rim; the number or icon goes on top. */
export const badgeDisc = (ring: number): Graphics =>
  new Graphics()
    .circle(1, 1.5, BADGE_R)
    .fill({ color: 0x000000, alpha: 0.25 })
    .circle(0, 0, BADGE_R)
    .fill(0xffffff)
    .stroke({ width: 2.6, color: ring });

/** An arrow out of a doorway, for a mover on its way out. */
export const exitIcon = (): Graphics =>
  new Graphics()
    .moveTo(-4, -4)
    .lineTo(-4, 4)
    .stroke({ width: 2, color: INK, cap: 'round' })
    .moveTo(-1.5, 0)
    .lineTo(4.5, 0)
    .moveTo(2, -2.8)
    .lineTo(4.8, 0)
    .lineTo(2, 2.8)
    .stroke({ width: 2, color: 0x3f8f3a, cap: 'round', join: 'round' });

/** A horseshoe, for carriages, which go round for ever. */
export const horseshoeIcon = (): Graphics =>
  new Graphics()
    .arc(0, 0.8, 4.2, Math.PI * 0.85, Math.PI * 2.15)
    .stroke({ width: 2.6, color: 0x7c5a3c, cap: 'round' })
    .circle(-2.9, -1.5, 0.6)
    .circle(2.9, -1.5, 0.6)
    .fill(0xffffff);

export const badgeNumber = (n: number): ReturnType<typeof label> => {
  const t = label(String(n), 15, INK, {});
  // Bangers' digits sit low and a little right of their box; this centres their ink on the disc.
  t.position.set(-0.8, -2.5);
  return t;
};

// ---------------------------------------------------------------------------------------------------------------
// Card illustrations.

/** A strip of road with a few movers on it, for the title card. */
export const roadStrip = (season: Season, w: number): Container => {
  const c = new Container();
  const pal = PALETTES[season];
  const g = new Graphics()
    .roundRect(-w / 2 - 4, -DESIGN_LANE * 2 - 4, w + 8, DESIGN_LANE * 4 + 8, 14)
    .fill(pal.curb)
    .stroke({ width: 2.5, color: INK })
    .roundRect(-w / 2, -DESIGN_LANE * 2, w, DESIGN_LANE * 4, 10)
    .fill(pal.road);
  for (let lane = 1; lane < LANES; lane++) {
    const y = (lane - 2) * DESIGN_LANE;
    for (let x = -w / 2 + 8; x < w / 2 - 12; x += 24) g.moveTo(x, y).lineTo(x + 12, y);
  }
  g.stroke({ width: 1.6, color: 0xffffff, alpha: 0.75 });
  c.addChild(g);
  const place = (
    kind: Kind,
    x: number,
    lane: number,
    width: number,
    look: [number, number, number],
    flip = false,
  ) => {
    const m = new Container();
    const shadow = moverShadow(kind, width, kind === 'car' ? 46 : kind === 'biker' ? 30 : 14, 1);
    shadow.alpha = 0.22;
    shadow.position.set(2, 3);
    const legs = new Graphics();
    drawLimbs(legs, { kind, look, season }, 1 + x * 0.1);
    m.addChild(shadow, legs, moverBody({ kind, look, season }));
    m.position.set(x, (lane + width / 2 - 2) * DESIGN_LANE);
    if (flip) m.rotation = Math.PI;
    c.addChild(m);
  };
  place('car', -w / 2 + 50, 2, 2, [0.1, 0.2, 0.3]);
  place('biker', -w / 2 + 130, 1, 1, [0.3, 0.6, 0.2]);
  place('runner', 30, 3, 1, [0.5, 0.1, 0.8]);
  place('dog', w / 2 - 120, 0, 2, [0.7, 0.2, 0.9]);
  place('walker', w / 2 - 40, 3, 1, [0.2, 0.7, 0.4], true);
  return c;
};

/** One mover drawn large for the how-to-play card. */
export const sample = (
  kind: Kind,
  season: Season,
  look: [number, number, number] = [0.15, 0.4, 0.3],
): Container => {
  const c = new Container();
  const width = kind === 'dog' || kind === 'car' || kind === 'carriage' ? 2 : 1;
  const len = kind === 'carriage' ? 62 : kind === 'car' ? 46 : kind === 'biker' ? 30 : 14;
  const shadow = moverShadow(kind, width, len, 1);
  shadow.alpha = 0.22;
  shadow.position.set(2, 3);
  const legs = new Graphics();
  drawLimbs(legs, { kind, look, season }, 1.2);
  c.addChild(shadow, legs, moverBody({ kind, look, season }));
  return c;
};
