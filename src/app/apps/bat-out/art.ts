import type { Graphics } from 'pixi.js';
import { COLORS } from '../flights/art';
import { PARK_UI } from '../chaos-park/ui';

/** Chaos Park's cartoon look: soft spring greens, warm infield dirt, everything outlined in ink. */
export const PAL = {
  ink: COLORS.ink,
  sky: 0x8fd0f0,
  skyLow: 0xd2eef9,
  cloud: 0xffffff,
  grass: 0x93d465,
  grassDark: 0x86c859,
  grassLight: 0xa6df7a,
  dirt: 0xe2b77c,
  dirtDark: 0xc99a5c,
  track: 0xd7a96d,
  chalk: 0xffffff,
  wall: PARK_UI.greenDark,
  wallTop: COLORS.gold,
  canopies: [0x5fa83b, 0x6cb544, 0x4f9a34],
  blossom: [0xf6b3cb, 0xf9c9dc, 0xf3a0bf],
  zone: 0xffffff,
  shadow: 0x2f5a1f,
  ball: 0xffffff,
  seam: 0xd8433a,
  marker: COLORS.gold,
  wood: PARK_UI.wood,
  woodDark: PARK_UI.woodDark,
  cream: PARK_UI.cream,
  brass: PARK_UI.brass,
  green: PARK_UI.green,
  greenDark: PARK_UI.greenDark,
  plank: PARK_UI.plank,
  plankDark: PARK_UI.plankDark,
  red: COLORS.red,
  redDark: COLORS.redDark,
  blue: COLORS.blue,
  blueDark: COLORS.blueDark,
  gold: COLORS.gold,
} as const;

/** Team colours: you (the home side) in red, the computer in blue. */
export interface Kit {
  cap: number;
  jersey: number;
  trim: number;
  pants: number;
  socks: number;
}

export const HOME_KIT: Kit = {
  cap: COLORS.red,
  jersey: 0xffffff,
  trim: COLORS.red,
  pants: 0xf1ede4,
  socks: COLORS.red,
};
export const AWAY_KIT: Kit = {
  cap: COLORS.blueDark,
  jersey: 0x9cc4ef,
  trim: COLORS.blueDark,
  pants: 0xdcdcdc,
  socks: COLORS.blueDark,
};

const SKINS = [0xf1c8a0, 0xd9a271, 0xa8714a, 0x7a4a2c, 0xf6d7b8];
export const skinFor = (id: number): number =>
  SKINS[((id % SKINS.length) + SKINS.length) % SKINS.length];

const BAT = 0xc9893d;
const GLOVE = 0x8a5228;
const SHOE = 0x2e2a2c;
const GEAR = 0x3a3a48;
const INK = PAL.ink;

/**
/**
 * A pose as joint positions in figure units: x right, y up from the feet, the figure 1 tall. `l` and `r` are the
 * figure's own left and right as drawn on screen.
 */
export interface Pose {
  head: [number, number];
  sl: [number, number];
  sr: [number, number];
  el: [number, number];
  er: [number, number];
  hl: [number, number];
  hr: [number, number];
  pl: [number, number];
  pr: [number, number];
  kl: [number, number];
  kr: [number, number];
  fl: [number, number];
  fr: [number, number];
  /** A bat held in both hands, from the hands to its end. */
  bat?: [number, number];
  /** Which hand wears the glove. */
  glove?: 'l' | 'r';
  /** Whether we see his face (and the cap's brim) or his back. */
  front: boolean;
}

const P = (
  head: [number, number],
  arms: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ],
  legs: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ],
  extra: Partial<Pose> & { front: boolean },
): Pose => ({
  head,
  sl: arms[0],
  sr: arms[1],
  el: arms[2],
  er: arms[3],
  hl: arms[4],
  hr: arms[5],
  pl: legs[0],
  pr: legs[1],
  kl: legs[2],
  kr: legs[3],
  fl: legs[4],
  fr: legs[5],
  ...extra,
});

/** Mirrors a pose left to right. */
export const mirror = (p: Pose): Pose => {
  const m = ([x, y]: [number, number]): [number, number] => [-x, y];
  return {
    ...p,
    head: m(p.head),
    sl: m(p.sr),
    sr: m(p.sl),
    el: m(p.er),
    er: m(p.el),
    hl: m(p.hr),
    hr: m(p.hl),
    pl: m(p.pr),
    pr: m(p.pl),
    kl: m(p.kr),
    kr: m(p.kl),
    fl: m(p.fr),
    fr: m(p.fl),
    bat: p.bat ? m(p.bat) : undefined,
    glove: p.glove === 'l' ? 'r' : p.glove === 'r' ? 'l' : undefined,
  };
};

const STAND_LEGS: Pose['pl'][] = [
  [-0.07, 0.48],
  [0.07, 0.48],
  [-0.09, 0.25],
  [0.09, 0.25],
  [-0.1, 0.02],
  [0.1, 0.02],
];

/** The poses every figure is drawn from. */
export const POSES = {
  stand: P(
    [0, 0.88],
    [
      [-0.12, 0.74],
      [0.12, 0.74],
      [-0.16, 0.6],
      [0.16, 0.6],
      [-0.15, 0.46],
      [0.15, 0.46],
    ],
    STAND_LEGS as never,
    { front: true, glove: 'l' },
  ),
  /** A fielder ready for the pitch: knees bent, glove out. */
  ready: P(
    [0, 0.8],
    [
      [-0.13, 0.67],
      [0.13, 0.67],
      [-0.19, 0.52],
      [0.19, 0.52],
      [-0.14, 0.38],
      [0.14, 0.38],
    ],
    [
      [-0.08, 0.42],
      [0.08, 0.42],
      [-0.17, 0.22],
      [0.17, 0.22],
      [-0.15, 0.02],
      [0.15, 0.02],
    ],
    { front: true, glove: 'l' },
  ),
  run1: P(
    [0.04, 0.86],
    [
      [-0.08, 0.72],
      [0.12, 0.72],
      [-0.2, 0.62],
      [0.2, 0.66],
      [-0.16, 0.5],
      [0.26, 0.76],
    ],
    [
      [-0.04, 0.47],
      [0.06, 0.47],
      [-0.2, 0.3],
      [0.2, 0.32],
      [-0.28, 0.1],
      [0.14, 0.02],
    ],
    { front: true, glove: 'l' },
  ),
  run2: P(
    [0.04, 0.86],
    [
      [-0.08, 0.72],
      [0.12, 0.72],
      [-0.16, 0.66],
      [0.22, 0.6],
      [-0.06, 0.76],
      [0.18, 0.48],
    ],
    [
      [-0.04, 0.47],
      [0.06, 0.47],
      [0.1, 0.3],
      [-0.12, 0.3],
      [0.24, 0.12],
      [-0.12, 0.02],
    ],
    { front: true, glove: 'l' },
  ),
  /** Arms up to catch or field. */
  reach: P(
    [0, 0.86],
    [
      [-0.12, 0.72],
      [0.12, 0.72],
      [-0.17, 0.86],
      [0.15, 0.6],
      [-0.16, 1.0],
      [0.15, 0.48],
    ],
    STAND_LEGS as never,
    { front: true, glove: 'l' },
  ),
  /** Seen from behind the plate: a right-handed batter on the left, bat cocked over his back shoulder. */
  batStance: P(
    [0.02, 0.86],
    [
      [-0.12, 0.72],
      [0.12, 0.73],
      [-0.2, 0.62],
      [0.02, 0.6],
      [-0.1, 0.7],
      [-0.08, 0.71],
    ],
    [
      [-0.08, 0.47],
      [0.08, 0.47],
      [-0.16, 0.26],
      [0.17, 0.25],
      [-0.19, 0.02],
      [0.2, 0.02],
    ],
    { front: false, bat: [-0.28, 1.05] },
  ),
  batSwing1: P(
    [0.04, 0.85],
    [
      [-0.1, 0.72],
      [0.14, 0.72],
      [0.0, 0.62],
      [0.22, 0.62],
      [0.16, 0.62],
      [0.18, 0.62],
    ],
    [
      [-0.07, 0.47],
      [0.09, 0.47],
      [-0.12, 0.27],
      [0.2, 0.25],
      [-0.17, 0.02],
      [0.24, 0.02],
    ],
    { front: false, bat: [0.68, 0.6] },
  ),
  batSwing2: P(
    [0.06, 0.85],
    [
      [-0.08, 0.72],
      [0.16, 0.72],
      [0.02, 0.76],
      [0.24, 0.8],
      [0.12, 0.86],
      [0.14, 0.88],
    ],
    [
      [-0.05, 0.47],
      [0.1, 0.47],
      [-0.06, 0.27],
      [0.2, 0.26],
      [-0.13, 0.02],
      [0.24, 0.02],
    ],
    { front: false, bat: [-0.32, 0.98] },
  ),
  /** The pitcher seen from home plate: set, leg kick, and the release with his throwing arm coming through. */
  pitchSet: P(
    [0, 0.88],
    [
      [-0.12, 0.74],
      [0.12, 0.74],
      [-0.12, 0.6],
      [0.12, 0.6],
      [-0.02, 0.64],
      [0.02, 0.64],
    ],
    STAND_LEGS as never,
    { front: true, glove: 'r' },
  ),
  pitchKick: P(
    [0.02, 0.9],
    [
      [-0.1, 0.76],
      [0.12, 0.76],
      [-0.06, 0.88],
      [0.08, 0.9],
      [0.0, 0.98],
      [0.04, 0.99],
    ],
    [
      [-0.06, 0.48],
      [0.08, 0.5],
      [-0.06, 0.25],
      [0.22, 0.52],
      [-0.06, 0.02],
      [0.16, 0.34],
    ],
    { front: true, glove: 'r' },
  ),
  pitchRelease: P(
    [0.02, 0.8],
    [
      [-0.12, 0.68],
      [0.14, 0.68],
      [-0.24, 0.72],
      [0.24, 0.56],
      [-0.22, 0.86],
      [0.2, 0.44],
    ],
    [
      [-0.07, 0.44],
      [0.09, 0.44],
      [-0.24, 0.24],
      [0.18, 0.24],
      [-0.3, 0.02],
      [0.12, 0.02],
    ],
    { front: true, glove: 'r' },
  ),
  /** A catcher in his crouch. */
  crouch: P(
    [0, 0.6],
    [
      [-0.13, 0.5],
      [0.13, 0.5],
      [-0.2, 0.4],
      [0.2, 0.4],
      [-0.12, 0.36],
      [0.16, 0.3],
    ],
    [
      [-0.1, 0.3],
      [0.1, 0.3],
      [-0.22, 0.28],
      [0.22, 0.28],
      [-0.16, 0.02],
      [0.16, 0.02],
    ],
    { front: true, glove: 'l' },
  ),
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;

export interface FigureStyle {
  kit: Kit;
  skin: number;
  /** Catcher's gear: a mask and chest protector. */
  gear?: boolean;
}

/**
 * Draws a ballplayer `h` tall in a pose, his feet at (x, y), as Chaos Park draws its people: flat colours with an ink
 * outline. Each part is stroked twice, wide in ink and then narrower in its colour, so the outline follows the shape.
 */
export const drawFigure = (
  g: Graphics,
  pose: Pose,
  x: number,
  y: number,
  h: number,
  style: FigureStyle,
): void => {
  const at = ([px, py]: [number, number]): [number, number] => [x + px * h, y - py * h];
  const t = h * 0.08;
  const o = Math.min(1.4, Math.max(0.5, h * 0.025));
  const { kit, skin } = style;
  const seg = (a: [number, number], b: [number, number], w: number, color: number): void => {
    const [ax, ay] = at(a);
    const [bx, by] = at(b);
    g.moveTo(ax, ay)
      .lineTo(bx, by)
      .stroke({ width: w + o * 2, color: INK, cap: 'round' })
      .moveTo(ax, ay)
      .lineTo(bx, by)
      .stroke({ width: w, color, cap: 'round' });
  };
  const dot = (p: [number, number], rx: number, ry: number, color: number): void => {
    const [px, py] = at(p);
    g.ellipse(px, py, rx, ry).fill(color).stroke({ width: o, color: INK });
  };

  const leg = (hip: Pose['pl'], knee: Pose['kl'], foot: Pose['fl']): void => {
    seg(knee, [foot[0], foot[1] + 0.03], t * 1.05, kit.socks);
    seg(hip, knee, t * 1.3, kit.pants);
    dot([foot[0], foot[1] + 0.015], t * 0.85, t * 0.5, SHOE);
  };
  const arm = (shoulder: Pose['sl'], elbow: Pose['el'], hand: Pose['hl'], glove: boolean): void => {
    seg(elbow, hand, t * 0.8, skin);
    seg(shoulder, elbow, t, kit.jersey);
    if (glove) dot(hand, t * 1.05, t * 1.05, GLOVE);
  };

  // Back to front: legs, then (seen from behind) the arms, the body and head, then (from the front) the arms and bat.
  leg(pose.pl, pose.kl, pose.fl);
  leg(pose.pr, pose.kr, pose.fr);
  if (!pose.front) {
    arm(pose.sl, pose.el, pose.hl, pose.glove === 'l');
    arm(pose.sr, pose.er, pose.hr, pose.glove === 'r');
  }
  const [slx, sly] = at(pose.sl);
  const [srx, sry] = at(pose.sr);
  const [plx, ply] = at(pose.pl);
  const [prx, pry] = at(pose.pr);
  const pad = t * 0.45;
  const body = [
    slx - pad,
    sly - pad * 0.6,
    srx + pad,
    sry - pad * 0.6,
    prx + pad * 0.7,
    pry + pad * 0.3,
    plx - pad * 0.7,
    ply + pad * 0.3,
  ];
  g.poly(body)
    .fill(style.gear ? GEAR : kit.jersey)
    .stroke({ width: o, color: INK, join: 'round' });
  // A belt and, on the front, a stripe of trim down the buttons; on the back, a number.
  g.moveTo(plx - pad * 0.6, ply + pad * 0.1)
    .lineTo(prx + pad * 0.6, pry + pad * 0.1)
    .stroke({ width: t * 0.45, color: kit.trim });
  if (!style.gear) {
    if (pose.front)
      g.moveTo((slx + srx) / 2, (sly + sry) / 2)
        .lineTo((plx + prx) / 2, (ply + pry) / 2)
        .stroke({ width: Math.max(0.4, t * 0.3), color: kit.trim });
    else
      g.roundRect((slx + srx) / 2 - t * 0.6, sly + t * 0.5, t * 1.2, t * 1.5, t * 0.2).fill(
        kit.trim,
      );
  }

  const [hx, hy] = at(pose.head);
  const hr = h * 0.09;
  g.ellipse(hx, hy, hr, hr * 1.05)
    .fill(skin)
    .stroke({ width: o, color: INK });
  // The cap: its crown over the top of the head and, from the front, the brim.
  g.moveTo(hx - hr * 1.02, hy - hr * 0.05)
    .arc(hx, hy - hr * 0.05, hr * 1.02, Math.PI, 0)
    .closePath()
    .fill(kit.cap)
    .stroke({ width: o, color: INK, join: 'round' });
  if (pose.front) {
    g.roundRect(hx - hr * 1.25, hy - hr * 0.2, hr * 2.5, hr * 0.38, hr * 0.15)
      .fill(kit.cap)
      .stroke({ width: o, color: INK });
    if (style.gear) {
      for (let k = 0; k < 3; k++)
        g.moveTo(hx - hr * 0.8, hy + hr * (0.35 + k * 0.22))
          .lineTo(hx + hr * 0.8, hy + hr * (0.35 + k * 0.22))
          .stroke({ width: Math.max(0.4, hr * 0.12), color: GEAR });
    } else if (h >= 14) {
      g.circle(hx - hr * 0.35, hy + hr * 0.4, hr * 0.13)
        .circle(hx + hr * 0.35, hy + hr * 0.4, hr * 0.13)
        .fill(INK);
    }
  }

  if (pose.front) {
    arm(pose.sl, pose.el, pose.hl, pose.glove === 'l');
    arm(pose.sr, pose.er, pose.hr, pose.glove === 'r');
  }
  if (pose.bat) {
    const hands: [number, number] = [(pose.hl[0] + pose.hr[0]) / 2, (pose.hl[1] + pose.hr[1]) / 2];
    const mid: [number, number] = [
      hands[0] + (pose.bat[0] - hands[0]) * 0.45,
      hands[1] + (pose.bat[1] - hands[1]) * 0.45,
    ];
    // Thin at the handle, thick at the barrel.
    seg(mid, pose.bat, t * 0.95, BAT);
    seg(hands, mid, t * 0.5, BAT);
  }
};

/** A baseball, white with red stitches when it is big enough to see them. */
export const drawBall = (g: Graphics, x: number, y: number, r: number): void => {
  g.circle(x, y, r)
    .fill(PAL.ball)
    .stroke({ width: Math.min(1, Math.max(0.35, r * 0.25)), color: INK });
  if (r >= 2.5) {
    g.moveTo(x - r * 0.55, y - r * 0.6)
      .quadraticCurveTo(x - r * 0.2, y, x - r * 0.55, y + r * 0.6)
      .moveTo(x + r * 0.55, y - r * 0.6)
      .quadraticCurveTo(x + r * 0.2, y, x + r * 0.55, y + r * 0.6)
      .stroke({ width: Math.max(0.4, r * 0.12), color: PAL.seam });
  }
};
