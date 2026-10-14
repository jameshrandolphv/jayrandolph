import { describe, expect, it } from 'vitest';
import { FRAME_H, FRAME_MARGIN, FRAME_W, LANES, LANE_W, ROAD_HALF } from './constants';
import {
  SEASONS,
  WALL,
  edge,
  generatePark,
  insidePolygon,
  laneOffset,
  loopDelta,
  maxCurvature,
  polylineDistance,
  pose,
  seededRng,
  wrap,
} from './park';

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('generatePark', () => {
  it('fits the loop inside the frame, leaving room round the edge', () => {
    for (const seed of SEEDS) {
      const { track } = generatePark(seededRng(seed));
      for (const p of edge(track, ROAD_HALF)) {
        expect(p.x).toBeGreaterThan(FRAME_MARGIN);
        expect(p.x).toBeLessThan(FRAME_W - FRAME_MARGIN);
        expect(p.y).toBeGreaterThan(FRAME_MARGIN);
        expect(p.y).toBeLessThan(FRAME_H - FRAME_MARGIN);
      }
    }
  });

  it('never bends so tightly that the inner or outer lane folds over', () => {
    for (const seed of SEEDS) {
      const { track } = generatePark(seededRng(seed));
      expect(maxCurvature(track) * ROAD_HALF).toBeLessThan(0.9);
    }
  });

  it('runs counterclockwise on screen with the normals pointing out', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { track } = generatePark(seededRng(seed));
      const cx = FRAME_W / 2;
      const cy = FRAME_H / 2;
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
      const park = generatePark(seededRng(seed));
      const { entrances, track } = park;
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
      const park = generatePark(seededRng(seed));
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

  it('lays ice on the road only in winter', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const park = generatePark(seededRng(seed));
      seen.add(park.season);
      if (park.season === 'winter') expect(park.ice.length).toBeGreaterThanOrEqual(3);
      else expect(park.ice).toHaveLength(0);
      for (const ice of park.ice) expect(ice.lane + ice.width).toBeLessThanOrEqual(LANES);
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
