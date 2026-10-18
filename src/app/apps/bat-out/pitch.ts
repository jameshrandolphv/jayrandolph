import { vec, type Vec3 } from './camera';
import { HIT_BY_PITCH_X, PITCH_SLOW, RELEASE, ZONE } from './constants';
import { gauss, type Rng } from './rng';

export type PitchType =
  | 'fastball'
  | 'sinker'
  | 'cutter'
  | 'slider'
  | 'curveball'
  | 'changeup'
  | 'splitter'
  | 'knuckleball';

export interface PitchSpec {
  name: string;
  /** Typical big-league speeds (mph). */
  mph: readonly [number, number];
  /**
   * Movement away from a straight line to where it ends up, in inches, as the catcher sees it: + x is towards first
   * base (away from a right-handed batter, the glove side of a right-handed pitcher), + z is up.
   */
  brk: { x: number; z: number };
  /** How late it breaks: the bend grows with the fraction of the flight raised to this. */
  late: number;
}

/** A big-league pitcher's arsenal, with the movement a little exaggerated so it reads on a phone. */
export const PITCHES: Readonly<Record<PitchType, PitchSpec>> = {
  fastball: { name: 'Fastball', mph: [92, 99], brk: { x: -4, z: -6 }, late: 2 },
  sinker: { name: 'Sinker', mph: [89, 96], brk: { x: -14, z: -20 }, late: 2 },
  cutter: { name: 'Cutter', mph: [86, 92], brk: { x: 7, z: -12 }, late: 2.4 },
  slider: { name: 'Slider', mph: [82, 89], brk: { x: 16, z: -22 }, late: 2.6 },
  curveball: { name: 'Curveball', mph: [74, 82], brk: { x: 9, z: -44 }, late: 2.2 },
  changeup: { name: 'Changeup', mph: [79, 87], brk: { x: -12, z: -28 }, late: 2.2 },
  splitter: { name: 'Splitter', mph: [83, 89], brk: { x: -6, z: -34 }, late: 3 },
  knuckleball: { name: 'Knuckleball', mph: [65, 76], brk: { x: 0, z: -18 }, late: 2 },
};

export interface Pitch {
  type: PitchType;
  mph: number;
  /** Where it crosses the front of the plate (ft): x across, z height. */
  end: { x: number; z: number };
  /** Its bend (ft) and how late it comes, as in `PitchSpec`. */
  brk: { x: number; z: number };
  late: number;
  /** A knuckleball's flutter: sideways and up-down wobbles (ft), their cycles over the flight, and phases. */
  flutter: { x: number; z: number; fx: number; fz: number; px: number; pz: number } | null;
  /** Seconds from release to the plate in the game (slowed by `PITCH_SLOW`). */
  seconds: number;
}

/** Real seconds from release to the plate: it slows by about 8% on the way. */
export const realSeconds = (mph: number): number => RELEASE.y / (mph * 1.4667 * 0.95);

const START = RELEASE;

/**
 * The ball's position a fraction `u` of the way from release to the plate. It heads first for where it would end
 * without its bend and curves on to where it really ends; past 1 it carries on to the catcher.
 */
export const pitchAt = (p: Pitch, u: number): Vec3 => {
  const bend = Math.pow(Math.max(0, Math.min(u, 1)), p.late);
  // Past the plate it carries on in a straight line along its last direction.
  const over = Math.max(0, u - 1);
  const slope = p.late;
  let x = START.x + (p.end.x - p.brk.x - START.x) * u + p.brk.x * bend + p.brk.x * slope * over;
  let z = START.z + (p.end.z - p.brk.z - START.z) * u + p.brk.z * bend + p.brk.z * slope * over;
  if (p.flutter) {
    const f = p.flutter;
    const env = Math.sin(Math.PI * Math.min(u, 1));
    x += f.x * env * Math.sin(2 * Math.PI * f.fx * u + f.px);
    z += f.z * env * Math.sin(2 * Math.PI * f.fz * u + f.pz);
  }
  return vec(x, START.y * (1 - u), z);
};

export const inZone = (end: { x: number; z: number }): boolean =>
  end.x >= ZONE.left && end.x <= ZONE.right && end.z >= ZONE.bottom && end.z <= ZONE.top;

/** A pitch far enough inside at body height hits the (right-handed) batter. */
export const hitsBatter = (end: { x: number; z: number }): boolean =>
  end.x <= HIT_BY_PITCH_X && end.z > 0.4 && end.z < 5.6;

/**
 * Builds a pitch of a type and speed aimed at a spot. `wild` (ft) scatters where it really goes; `bend` scales the
 * movement and `side` flips a breaking ball the other way.
 */
export const makePitch = (
  type: PitchType,
  mph: number,
  aim: { x: number; z: number },
  rng: Rng,
  wild: number,
  bend = 1,
  side: 1 | -1 = 1,
): Pitch => {
  const spec = PITCHES[type];
  const end = { x: aim.x + gauss(rng) * wild, z: aim.z + gauss(rng) * wild };
  const flutter =
    type === 'knuckleball'
      ? {
          x: 0.35 + rng() * 0.35,
          z: 0.25 + rng() * 0.3,
          fx: 1 + rng() * 1.4,
          fz: 0.8 + rng() * 1.2,
          px: rng() * Math.PI * 2,
          pz: rng() * Math.PI * 2,
        }
      : null;
  return {
    type,
    mph,
    end,
    brk: { x: (spec.brk.x * bend * side) / 12, z: (spec.brk.z * (0.6 + 0.4 * bend)) / 12 },
    late: spec.late,
    flutter,
    seconds: realSeconds(mph) * PITCH_SLOW,
  };
};

export interface Count {
  balls: number;
  strikes: number;
}

/** What a computer pitcher throws, by the count: more fastballs when behind, more chases when ahead. */
export const computerPitch = (count: Count, rng: Rng): Pitch => {
  const behind = count.balls - count.strikes >= 2 || count.balls === 3;
  const ahead = count.strikes === 2 && count.balls < 2;
  const menu: [PitchType, number][] = behind
    ? [
        ['fastball', 5],
        ['sinker', 3],
        ['cutter', 2],
        ['changeup', 1],
        ['slider', 1],
      ]
    : [
        ['fastball', 4],
        ['sinker', 2],
        ['cutter', 1.5],
        ['slider', ahead ? 3 : 2],
        ['curveball', ahead ? 2.5 : 1.5],
        ['changeup', 1.5],
        ['splitter', ahead ? 1.5 : 0.7],
        ['knuckleball', 0.25],
      ];
  let roll = rng() * menu.reduce((s, [, w]) => s + w, 0);
  let type: PitchType = 'fastball';
  for (const [t, w] of menu) {
    roll -= w;
    if (roll <= 0) {
      type = t;
      break;
    }
  }
  const spec = PITCHES[type];
  const mph = spec.mph[0] + rng() * (spec.mph[1] - spec.mph[0]);
  // Aim for the edges of the zone, inside it more often when behind and just off it when ahead.
  const zoneChance = behind ? 0.72 : ahead ? 0.3 : 0.5;
  const inside = rng() < zoneChance;
  const edge = inside ? 0.45 + rng() * 0.4 : 1.05 + rng() * 0.45;
  const angle = rng() * Math.PI * 2;
  const cx = 0;
  const cz = (ZONE.top + ZONE.bottom) / 2;
  const aim = {
    x: cx + Math.cos(angle) * edge * ZONE.right,
    // Breaking and off-speed pitches are aimed low.
    z: cz + Math.sin(angle) * edge * ((ZONE.top - ZONE.bottom) / 2) - (spec.brk.z < -20 ? 0.3 : 0),
  };
  return makePitch(type, mph, aim, rng, 0.28);
};
