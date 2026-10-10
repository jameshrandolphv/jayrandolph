import { describe, expect, it } from 'vitest';
import {
  captureZone,
  generateAirfield,
  runwayEnd,
  type Airfield,
  type Helipad,
  type Runway,
} from './airfield';
import { HEIGHT, WIDTH } from './constants';
import { distToSegment, seededRng } from './geometry';

const runway = (field: Airfield, kind: 'jet' | 'light'): Runway =>
  field.zones.find((z): z is Runway => z.type === 'runway' && z.kind === kind)!;
const helipad = (field: Airfield): Helipad =>
  field.zones.find((z): z is Helipad => z.type === 'helipad')!;

describe('generateAirfield', () => {
  it('always lays out a jet runway, a light-aircraft runway and a helipad', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const field = generateAirfield(seededRng(seed));
      expect(field.zones.map((z) => z.kind).sort()).toEqual(['heli', 'jet', 'light']);
    }
  });

  it('keeps every zone on the field, apart from the others, with a clear approach', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const field = generateAirfield(seededRng(seed));
      for (const r of field.zones.filter((z): z is Runway => z.type === 'runway')) {
        for (const p of [r, runwayEnd(r)]) {
          expect(p.x).toBeGreaterThan(60);
          expect(p.x).toBeLessThan(WIDTH - 60);
          expect(p.y).toBeGreaterThan(60);
          expect(p.y).toBeLessThan(HEIGHT - 60);
        }
        const approach = { x: r.x - Math.cos(r.angle) * 150, y: r.y - Math.sin(r.angle) * 150 };
        expect(approach.x).toBeGreaterThanOrEqual(30);
        expect(approach.x).toBeLessThanOrEqual(WIDTH - 30);
        expect(approach.y).toBeGreaterThanOrEqual(30);
        expect(approach.y).toBeLessThanOrEqual(HEIGHT - 30);
      }
      const pad = helipad(field);
      for (const kind of ['jet', 'light'] as const) {
        const r = runway(field, kind);
        expect(distToSegment(pad, r, runwayEnd(r))).toBeGreaterThan(pad.radius + r.width / 2 + 40);
      }
    }
  });

  it('builds the same airfield from the same seed and different ones from others', () => {
    expect(generateAirfield(seededRng(42))).toEqual(generateAirfield(seededRng(42)));
    const layouts = new Set(
      Array.from({ length: 20 }, (_, i) =>
        JSON.stringify(generateAirfield(seededRng(i + 1)).zones),
      ),
    );
    expect(layouts.size).toBe(20);
  });

  it('uses every theme', () => {
    const themes = new Set(
      Array.from({ length: 60 }, (_, i) => generateAirfield(seededRng(i + 1)).theme),
    );
    expect([...themes].sort()).toEqual(['coast', 'meadow', 'river']);
  });
});

describe('captureZone', () => {
  const field = generateAirfield(seededRng(7));
  const jet = runway(field, 'jet');
  const ux = Math.cos(jet.angle);
  const uy = Math.sin(jet.angle);

  it('takes a path that reaches a runway threshold heading along it', () => {
    const p = { x: jet.x + ux * 10, y: jet.y + uy * 10 };
    const hit = captureZone(field, 'jet', p, ux, uy);
    expect(hit?.zone).toBe(jet);
    expect(hit!.at.x).toBeCloseTo(jet.x + ux * 10);
    expect(hit!.at.y).toBeCloseTo(jet.y + uy * 10);
  });

  it('ignores the wrong kind of aircraft, the wrong direction and the far end', () => {
    const p = { x: jet.x + ux * 10, y: jet.y + uy * 10 };
    expect(captureZone(field, 'light', p, ux, uy)).toBeNull();
    expect(captureZone(field, 'jet', p, -ux, -uy)).toBeNull();
    const far = { x: jet.x + ux * jet.length * 0.9, y: jet.y + uy * jet.length * 0.9 };
    expect(captureZone(field, 'jet', far, ux, uy)).toBeNull();
  });

  it('lands helicopters on the pad from any direction', () => {
    const pad = helipad(field);
    const hit = captureZone(field, 'heli', { x: pad.x + 12, y: pad.y - 5 }, -1, 0);
    expect(hit?.zone).toBe(pad);
    expect(hit!.at).toEqual({ x: pad.x, y: pad.y });
    expect(captureZone(field, 'heli', { x: pad.x + pad.radius + 30, y: pad.y }, 1, 0)).toBeNull();
  });
});
