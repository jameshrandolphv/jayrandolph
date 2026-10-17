import { Container, Graphics } from 'pixi.js';
import { COLORS, label } from '../flights/art';
import type { Plaque } from './constants';

/** Park furniture: wooden noticeboards, sign plaques. */
export const PARK_UI = {
  wood: 0xa8743f,
  woodDark: 0x7a4f2b,
  cream: 0xf6eed6,
  brass: 0xd8b25a,
  green: 0x4a9a3c,
  greenDark: 0x2f6e2a,
  plank: 0xb57a40,
  plankDark: 0x7f5229,
} as const;

/** A screw head with its slot, for the corners of a board. */
const screw = (g: Graphics, x: number, y: number, r: number): void => {
  g.circle(x, y, r).fill(PARK_UI.brass).stroke({ width: 1.5, color: PARK_UI.woodDark });
  g.moveTo(x - r * 0.6, y - r * 0.3)
    .lineTo(x + r * 0.6, y + r * 0.3)
    .stroke({ width: 1.4, color: PARK_UI.woodDark });
};

/** A park noticeboard: a wooden frame with a cream panel, as the title and game-over screens are drawn on. */
export const noticeBoard = (x: number, y: number, w: number, h: number): Graphics => {
  const rim = 18;
  const g = new Graphics()
    .roundRect(x + 6, y + 10, w, h, 18)
    .fill({ color: 0x000000, alpha: 0.25 })
    .roundRect(x, y, w, h, 18)
    .fill(PARK_UI.wood);
  // Grain across the planks; the panel covers the middle, so it shows on the frame.
  for (let ly = y + 7; ly < y + h - 4; ly += 8) g.moveTo(x + 6, ly).lineTo(x + w - 6, ly);
  g.stroke({ width: 1.2, color: PARK_UI.woodDark, alpha: 0.28 });
  g.roundRect(x, y, w, h, 18).stroke({ width: 3, color: COLORS.ink });
  g.roundRect(x + rim, y + rim, w - rim * 2, h - rim * 2, 10)
    .fill(PARK_UI.cream)
    .stroke({ width: 2.5, color: PARK_UI.woodDark });
  for (const [sx, sy] of [
    [x + rim / 2, y + rim / 2],
    [x + w - rim / 2, y + rim / 2],
    [x + rim / 2, y + h - rim / 2],
    [x + w - rim / 2, y + h - rim / 2],
  ] as const)
    screw(g, sx, sy, 4.5);
  return g;
};

/** A sign plaque button: green for the main action, plain wood for the other. */
export const plaqueButton = (p: Plaque, color: 'green' | 'wood', size: number): Container => {
  const b = new Container();
  b.position.set(p.x, p.y);
  const [main, dark] =
    color === 'green' ? [PARK_UI.green, PARK_UI.greenDark] : [PARK_UI.plank, PARK_UI.plankDark];
  const { rx, ry } = p;
  const r = Math.min(ry * 0.5, 16);
  const g = new Graphics()
    .roundRect(-rx + 3, -ry + 6, rx * 2, ry * 2, r)
    .fill({ color: 0x000000, alpha: 0.2 })
    .roundRect(-rx, -ry, rx * 2, ry * 2, r)
    .fill(dark)
    .roundRect(-rx + 3, -ry + 2, rx * 2 - 6, ry * 2 - 8, Math.max(2, r - 2))
    .fill(main)
    .roundRect(-rx + 10, -ry + 6, rx * 2 - 20, ry * 0.35, Math.max(2, r * 0.5))
    .fill({ color: 0xffffff, alpha: 0.18 })
    .roundRect(-rx, -ry, rx * 2, ry * 2, r)
    .stroke({ width: 3, color: COLORS.ink });
  // Nails holding the plaque up, one at each end.
  for (const nx of [-rx + 9, rx - 9]) g.circle(nx, 0, 2.6).fill(PARK_UI.brass);
  b.addChild(g);
  b.addChild(
    label(p.label, size, 0xffffff, {
      stroke: { color: dark, width: 4, join: 'round' },
      letterSpacing: 1,
    }),
  );
  return b;
};

/** The round green pause button, its top-left corner at the origin (48 by 48, as `pauseButton` lays out). */
export const roundPauseButton = (): Container => {
  const b = new Container();
  b.addChild(
    new Graphics()
      .circle(25, 26, 23)
      .fill({ color: 0x000000, alpha: 0.2 })
      .circle(24, 24, 23)
      .fill({ color: PARK_UI.green, alpha: 0.92 })
      .stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 })
      .roundRect(16, 14, 6, 20, 2)
      .roundRect(26, 14, 6, 20, 2)
      .fill(0xffffff),
  );
  return b;
};

/** A small gold cup, for the best score. */
export const trophy = (): Graphics =>
  new Graphics()
    .moveTo(-12, -14)
    .lineTo(12, -14)
    .lineTo(9, 0)
    .quadraticCurveTo(0, 8, -9, 0)
    .closePath()
    .fill(COLORS.gold)
    .stroke({ width: 2.5, color: COLORS.ink, join: 'round' })
    .moveTo(-11, -11)
    .quadraticCurveTo(-21, -10, -16, -1)
    .lineTo(-9, 0)
    .moveTo(11, -11)
    .quadraticCurveTo(21, -10, 16, -1)
    .lineTo(9, 0)
    .stroke({ width: 2.5, color: COLORS.ink, join: 'round' })
    .rect(-2.5, 4, 5, 6)
    .roundRect(-9, 10, 18, 5, 2)
    .fill(COLORS.gold)
    .stroke({ width: 2, color: COLORS.ink, join: 'round' });
