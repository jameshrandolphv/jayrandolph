import { ENEMY_R } from './constants';
import type { Enemy } from './level';
import { BAR_STEP } from './patterns';

/** Gap kept clear between the paths of two wheels, on top of the width of the dots themselves. */
export const WHEEL_CLEARANCE = 6;

export interface Wheel {
  cx: number;
  cy: number;
  /** Distance from the pivot to the outermost dot of an arm. */
  reach: number;
}

/**
 * The turning bars among the enemies: a dot on a pivot and arms of dots a step apart going out from it,
 * all turning together. A ring of dots around the same pivot isn't part of one.
 */
export const wheelsOf = (enemies: readonly Enemy[]): Wheel[] => {
  const byPivot = new Map<string, { cx: number; cy: number; radii: Set<number> }>();
  for (const e of enemies) {
    if (e.kind !== 'orbit') continue;
    const key = `${e.cx},${e.cy},${e.period},${e.dir}`;
    const group = byPivot.get(key) ?? { cx: e.cx, cy: e.cy, radii: new Set<number>() };
    group.radii.add(e.radius);
    byPivot.set(key, group);
  }
  const wheels: Wheel[] = [];
  for (const { cx, cy, radii } of byPivot.values()) {
    if (!radii.has(0)) continue;
    let reach = 0;
    while (radii.has(reach + BAR_STEP)) reach += BAR_STEP;
    if (reach > 0) wheels.push({ cx, cy, reach });
  }
  return wheels;
};

/** Whether the circles two wheels sweep out come within reach of each other, so their arms could cross. */
export const wheelsOverlap = (a: Wheel, b: Wheel): boolean =>
  Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.reach + b.reach + 2 * ENEMY_R + WHEEL_CLEARANCE;

/** Whether any wheel among `added` crosses another one, either among themselves or with one of `existing`. */
export const crossesWheels = (existing: readonly Enemy[], added: readonly Enemy[]): boolean => {
  const fresh = wheelsOf(added);
  if (!fresh.length) return false;
  const all = [...wheelsOf(existing), ...fresh];
  const start = all.length - fresh.length;
  return fresh.some((w, i) => all.some((other, j) => j !== start + i && wheelsOverlap(w, other)));
};
