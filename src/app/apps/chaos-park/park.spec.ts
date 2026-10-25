import { describe, expect, it } from 'vitest';
import { ART, EDGE_MARGIN, HUD_MARGIN, LANES, LANE_W, ROAD_HALF } from './constants';
import {
  PATCH_COUNT,
  SEASONS,
  edge,
  frameMargins,
  generatePark,
  insidePolygon,
  laneOffset,
  loopDelta,
  maxCurvature,
  polylineDistance,
  openPose,
  pose,
  seededRng,
  wrap,
  type ParkFrame,
} from './park';
import { COURSES, COURSE_IDS } from './courses';

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

/** The default frame, a phone in portrait, a tablet, a wide window, a phone on its side and a square window. */
const FRAMES: readonly ParkFrame[] = [
  { w: 860, h: 600, hud: 'top' },
  { w: 1077, h: 600, hud: 'left' },
  { w: 860, h: 645, hud: 'left' },
  { w: 1200, h: 600, hud: 'top' },
  { w: 1300, h: 600, hud: 'top' },
  { w: 600, h: 600, hud: 'top' },
];

describe('generatePark', () => {
  // One test per frame, so each gets its own time limit.
  for (const frame of FRAMES) {
    it(`fits the loop inside a ${frame.w}x${frame.h} frame, leaving room for the score along one edge`, () => {
      const m = frameMargins(frame);
      expect(frame.hud === 'top' ? m.top : m.left).toBe(HUD_MARGIN);
      for (const seed of SEEDS) {
        const { track } = generatePark(seededRng(seed), undefined, frame);
        // Checked in one go: an expect per point of 60 roads took longer than the parks themselves.
        const outside = edge(track, ROAD_HALF).filter(
          (p) =>
            !(p.x > m.left && p.x < frame.w - m.right && p.y > m.top && p.y < frame.h - m.bottom),
        );
        expect(outside, `${frame.w}x${frame.h}, seed ${seed}`).toEqual([]);
      }
    });
  }

  it('reaches close to the edges of the screen', () => {
    for (const frame of FRAMES) {
      let along = 0;
      let across = 0;
      for (const seed of SEEDS) {
        const out = edge(generatePark(seededRng(seed), undefined, frame).track, ROAD_HALF);
        along += Math.max(...out.map((p) => p.x)) - Math.min(...out.map((p) => p.x));
        across += Math.max(...out.map((p) => p.y)) - Math.min(...out.map((p) => p.y));
      }
      // On average the road spans most of the screen both ways.
      expect(along / SEEDS.length / frame.w).toBeGreaterThan(0.82);
      expect(across / SEEDS.length / frame.h).toBeGreaterThan(0.78);
    }
    expect(EDGE_MARGIN).toBeLessThan(30);
  });

  it('still reaches the ends of a very long screen', () => {
    for (const frame of [
      { w: 1800, h: 600, hud: 'top' },
      { w: 2600, h: 600, hud: 'top' },
    ] as const) {
      for (const seed of SEEDS.slice(0, 10)) {
        const out = edge(generatePark(seededRng(seed), undefined, frame).track, ROAD_HALF);
        const along = Math.max(...out.map((p) => p.x)) - Math.min(...out.map((p) => p.x));
        expect(along / frame.w, `${frame.w}x${frame.h}, seed ${seed}`).toBeGreaterThan(0.82);
      }
    }
  });

  it('never bends so tightly that the inner or outer lane folds over', () => {
    for (const frame of FRAMES) {
      for (const seed of SEEDS) {
        const { track } = generatePark(seededRng(seed), undefined, frame);
        expect(maxCurvature(track) * ROAD_HALF).toBeLessThan(0.9);
      }
    }
  });

  // One test per course, so each gets its own time limit.
  for (const id of COURSE_IDS) {
    it(`fits ${id}'s layout on phones and tablets without folding a lane`, () => {
      const phones: ParkFrame[] = [
        { w: 759, h: 393, hud: 'left' },
        { w: 734, h: 372, hud: 'top' },
        { w: 667, h: 355, hud: 'left' },
        { w: 1342, h: 1004, hud: 'top' },
      ];
      const course = COURSES[id];
      for (const frame of [...FRAMES, ...phones]) {
        const m = frameMargins(frame);
        for (const seed of SEEDS.slice(0, 6)) {
          const park = generatePark(seededRng(seed), undefined, frame, course);
          const out = [...edge(park.track, park.half), ...edge(park.track, -park.half)].filter(
            (p) =>
              !(p.x > m.left && p.x < frame.w - m.right && p.y > m.top && p.y < frame.h - m.bottom),
          );
          expect(out, `${id} ${frame.w}x${frame.h}, seed ${seed}`).toEqual([]);
          expect(maxCurvature(park.track) * park.half).toBeLessThan(0.9);
          if (course.layout === 'eight') expect(park.bridge).not.toBeNull();
          // A hall through the house: a road where it fits, otherwise a path.
          if (course.layout === 'manor' && frame.h > 500)
            expect(
              park.sideRoads.filter((r) => r.kind === 'hall').length + park.shortcuts.length,
            ).toBe(1);
        }
      }
    });
  }

  it('gives a manor a two-lane hall and a graveyard road on screens with room for them', () => {
    for (const frame of [
      FRAMES[0]!,
      { w: 1040, h: 560, hud: 'top' as const },
      { w: 1342, h: 1004, hud: 'top' as const },
    ])
      for (const seed of SEEDS.slice(0, 6)) {
        const park = generatePark(seededRng(seed), undefined, frame, COURSES.mansion);
        expect(
          park.sideRoads.map((r) => r.kind),
          `${frame.w}x${frame.h}, seed ${seed}`,
        ).toEqual(['hall', 'graveyard']);
        const grave = park.sideRoads[1]!;
        // It comes back on behind where it left.
        expect(loopDelta(grave.a, grave.b, park.track.length)).toBeLessThan(0);
        // Each end runs along the loop's inner two lanes.
        for (const [s, end] of [
          [grave.a, 0],
          [grave.b, grave.track.length],
        ] as const) {
          const on = pose(park.track, s, -park.half + park.laneW);
          const at = openPose(grave.track, end);
          expect(Math.hypot(on.x - at.x, on.y - at.y)).toBeLessThan(1);
        }
      }
  });

  it('runs counterclockwise on screen with the normals pointing out', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { track } = generatePark(seededRng(seed));
      const cx = track.points.reduce((sum, p) => sum + p.x, 0) / track.points.length;
      const cy = track.points.reduce((sum, p) => sum + p.y, 0) / track.points.length;
      // At the rightmost point, counterclockwise on a y-down screen means heading up.
      let right = 0;
      track.points.forEach((p, i) => p.x > track.points[right]!.x && (right = i));
      expect(track.tangents[right]!.y).toBeLessThan(0);
      for (const [i, p] of track.points.entries()) {
        if (i % 40) continue;
        const n = track.normals[i]!;
        expect(n.x * (p.x - cx) + n.y * (p.y - cy)).toBeGreaterThan(0);
      }
    }
  });

  it('has three or four entrances, spread round the loop, each opening through the wall', () => {
    for (const seed of SEEDS) {
      const park = generatePark(seededRng(seed), undefined, FRAMES[seed % FRAMES.length]);
      const { entrances, track, wall: WALL } = park;
      expect(entrances.length).toBeGreaterThanOrEqual(3);
      expect(entrances.length).toBeLessThanOrEqual(4);
      for (const [i, e] of entrances.entries()) {
        const onWall =
          e.gate.x === WALL.x ||
          e.gate.x === WALL.x + WALL.w ||
          e.gate.y === WALL.y ||
          e.gate.y === WALL.y + WALL.h;
        expect(onWall).toBe(true);
        const next = entrances[(i + 1) % entrances.length]!;
        expect(Math.abs(loopDelta(e.s, next.s, track.length))).toBeGreaterThan(track.length / 8);
        // The street end is outside the wall.
        const outside =
          e.street.x < WALL.x ||
          e.street.x > WALL.x + WALL.w ||
          e.street.y < WALL.y ||
          e.street.y > WALL.y + WALL.h;
        expect(outside).toBe(true);
      }
    }
  });

  it('keeps trees off the road, out of the water and inside the wall', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const park = generatePark(seededRng(seed), undefined, FRAMES[seed % FRAMES.length]);
      const WALL = park.wall;
      expect(park.trees.length).toBeGreaterThan(40);
      for (const t of park.trees) {
        expect(polylineDistance(park.track.points, t, true)).toBeGreaterThan(ROAD_HALF + t.r);
        for (const w of park.water) expect(insidePolygon(w.outline, t.x, t.y)).toBe(false);
        expect(t.x).toBeGreaterThan(WALL.x);
        expect(t.x).toBeLessThan(WALL.x + WALL.w);
      }
    }
  });

  it('runs short cuts across the middle between two points on the inner edge', () => {
    let total = 0;
    for (const seed of SEEDS) {
      const park = generatePark(seededRng(seed));
      const inner = edge(park.track, -ROAD_HALF + 1);
      for (const c of park.shortcuts) {
        total++;
        // Most of the path is inside the loop.
        const inside = c.path.filter((p) => insidePolygon(inner, p.x, p.y)).length;
        expect(inside / c.path.length).toBeGreaterThan(0.8);
        expect(Math.abs(loopDelta(c.a, c.b, park.track.length))).toBeGreaterThan(
          park.track.length / 4,
        );
      }
    }
    expect(total).toBeGreaterThan(SEEDS.length * 0.8);
  });

  it('lays one small one-lane patch in every season', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const park = generatePark(seededRng(seed));
      seen.add(park.season);
      expect(park.patches).toHaveLength(PATCH_COUNT);
      for (const p of park.patches) {
        expect(p.width).toBe(1);
        expect(p.lane + p.width).toBeLessThanOrEqual(LANES);
        expect(p.len).toBeLessThan(30 * ART);
      }
    }
    expect(seen.size).toBe(SEASONS.length);
  });

  it('can be asked for a season', () => {
    expect(generatePark(seededRng(1), 'winter').season).toBe('winter');
  });

  it('is the same park for the same seed', () => {
    const a = generatePark(seededRng(9));
    const b = generatePark(seededRng(9));
    expect(a.track.length).toBe(b.track.length);
    expect(a.trees.length).toBe(b.trees.length);
    expect(a.entrances.map((e) => e.s)).toEqual(b.entrances.map((e) => e.s));
  });
});

describe('lanes', () => {
  it('puts lane 0 innermost and spaces lanes a lane apart', () => {
    expect(laneOffset(0, 1)).toBeCloseTo(-1.5 * LANE_W);
    expect(laneOffset(3, 1)).toBeCloseTo(1.5 * LANE_W);
    expect(laneOffset(0, 2)).toBeCloseTo(-LANE_W);
    expect(laneOffset(2, 2)).toBeCloseTo(LANE_W);
  });

  it('measures around the loop both ways', () => {
    expect(wrap(-5, 100)).toBe(95);
    expect(loopDelta(90, 10, 100)).toBe(20);
    expect(loopDelta(10, 90, 100)).toBe(-20);
  });

  it('interpolates poses smoothly between samples', () => {
    const { track } = generatePark(seededRng(4));
    const a = pose(track, 100);
    const b = pose(track, 100.5);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(0.5, 1);
    const wrapped = pose(track, track.length + 100);
    expect(wrapped.x).toBeCloseTo(a.x);
  });
});
