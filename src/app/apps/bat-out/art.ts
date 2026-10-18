import { Pixels } from '../../games/pixels';

/** A chunky handheld palette: bright grass, sandy dirt and two teams in red and blue. */
export const PAL = {
  sky: 0x8fd3ff,
  skyLow: 0xc4ecff,
  cloud: 0xffffff,
  grass: 0x4cb03a,
  grassDark: 0x3f9a31,
  dirt: 0xd49a58,
  dirtDark: 0xb87d40,
  track: 0xc0864a,
  chalk: 0xffffff,
  wall: 0x2d6a3a,
  wallTop: 0xf2c83c,
  stands: 0x7c6ca4,
  standsDark: 0x5c4f80,
  crowd: [0xf2c6a0, 0xffe066, 0xff8a80, 0x80d8ff, 0xffffff],
  ink: 0x1b1b2a,
  panel: 0xfff4d6,
  panelEdge: 0x8a5a2b,
  button: 0xd8382e,
  buttonDark: 0x8e1f19,
  buttonAlt: 0x2f62c9,
  buttonAltDark: 0x1c3c80,
  zone: 0xffffff,
  shadow: 0x1b3a12,
  ball: 0xffffff,
  seam: 0xe0383e,
  marker: 0xffe94a,
} as const;

/** Team colours: you (the home side) in red, the computer in blue. */
export interface Kit {
  cap: string;
  jersey: string;
  trim: string;
  pants: string;
  socks: string;
}

export const HOME_KIT: Kit = {
  cap: '#c62a22',
  jersey: '#ffffff',
  trim: '#c62a22',
  pants: '#f2f2f2',
  socks: '#c62a22',
};
export const AWAY_KIT: Kit = {
  cap: '#1f4fb4',
  jersey: '#9cc4ff',
  trim: '#1f4fb4',
  pants: '#d6d6d6',
  socks: '#1f4fb4',
};

const SKINS = ['#f1c8a0', '#d9a271', '#a8714a', '#7a4a2c', '#f6d7b8'];
export const skinFor = (id: number): string =>
  SKINS[((id % SKINS.length) + SKINS.length) % SKINS.length];

const BAT = '#c9893d';
const GLOVE = '#7a4a22';
const SHOE = '#222222';
const OUTLINE = '#1b1b2a';

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

/** A thick line of round dots. */
const limb = (
  px: Pixels,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  color: string,
): void => {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const r = Math.max(0.5, w / 2);
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    px.ellipse(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, r, r, color);
  }
};

export interface FigureStyle {
  kit: Kit;
  skin: string;
  /** Catcher's gear: a mask and chest protector. */
  gear?: boolean;
}

/**
 * Paints a ballplayer `h` px tall in a pose, outlined in ink. The canvas leaves room for a bat or a raised glove;
 * `foot` is where his feet are on it, so sprites can be anchored there.
 */
export const figure = (
  pose: Pose,
  h: number,
  style: FigureStyle,
): { pixels: Pixels; footX: number; footY: number } => {
  const w = Math.ceil(h * 1.6) + 4;
  const tall = Math.ceil(h * 1.15) + 4;
  const px = new Pixels(w, tall);
  const ox = w / 2;
  const oy = tall - 2;
  const at = ([x, y]: [number, number]): [number, number] => [ox + x * h, oy - y * h];
  const t = Math.max(1, h * 0.075);
  const { kit, skin } = style;

  const leg = (hip: [number, number], knee: [number, number], foot: [number, number]): void => {
    const [hx, hy] = at(hip);
    const [kx, ky] = at(knee);
    const [fx, fy] = at(foot);
    limb(px, hx, hy, kx, ky, t * 1.25, kit.pants);
    limb(px, kx, ky, fx, fy - t * 0.6, t * 1.05, kit.socks);
    px.ellipse(fx, fy - t * 0.4, t * 0.9, t * 0.55, SHOE);
  };
  const arm = (
    shoulder: [number, number],
    elbow: [number, number],
    hand: [number, number],
    glove: boolean,
  ): void => {
    const [sx, sy] = at(shoulder);
    const [ex, ey] = at(elbow);
    const [hx, hy] = at(hand);
    limb(px, sx, sy, ex, ey, t, kit.jersey);
    limb(px, ex, ey, hx, hy, t * 0.85, skin);
    if (glove) px.ellipse(hx, hy, t * 1.1, t * 1.1, GLOVE);
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
  px.tri(
    slx - t * 0.4,
    sly - t * 0.3,
    srx + t * 0.4,
    sry - t * 0.3,
    prx + t * 0.3,
    pry,
    kit.jersey,
  );
  px.tri(slx - t * 0.4, sly - t * 0.3, prx + t * 0.3, pry, plx - t * 0.3, ply, kit.jersey);
  // A belt and, on the front, a placket of trim.
  px.rect(
    Math.min(plx, prx) - t * 0.3,
    Math.min(ply, pry) - t * 0.35,
    Math.abs(prx - plx) + t * 0.6,
    Math.max(1, t * 0.5),
    kit.trim,
  );
  if (style.gear) px.tri(slx, sly, srx, sry, (plx + prx) / 2, (ply + pry) / 2, '#3a3a48');
  else if (pose.front)
    px.rect(
      (slx + srx) / 2 - Math.max(0.5, t * 0.2),
      sly,
      Math.max(1, t * 0.4),
      ply - sly,
      kit.trim,
    );
  else px.rect((slx + srx) / 2 - t * 0.6, sly + t * 0.6, t * 1.2, t * 1.4, kit.trim);

  const [hx, hy] = at(pose.head);
  const hr = h * 0.085;
  px.ellipse(hx, hy, hr, hr * 1.08, skin);
  // The cap: its crown over the top of the head and, from the front, the brim.
  px.ellipse(hx, hy - hr * 0.35, hr * 1.02, hr * 0.75, kit.cap);
  px.rect(hx - hr * 1.02, hy - hr * 0.35, hr * 2.04, hr * 0.35, kit.cap);
  if (pose.front) px.rect(hx - hr * 1.2, hy - hr * 0.1, hr * 2.4, Math.max(1, hr * 0.32), kit.cap);
  else px.ellipse(hx, hy + hr * 0.1, hr, hr * 0.5, '#5a3a22');
  if (style.gear && pose.front) {
    for (let k = -1; k <= 1; k++)
      px.rect(hx - hr, hy + hr * 0.2 * k + hr * 0.25, hr * 2, Math.max(1, hr * 0.15), '#3a3a48');
  } else if (pose.front && h >= 20) {
    px.rect(
      hx - hr * 0.45,
      hy + hr * 0.15,
      Math.max(1, hr * 0.25),
      Math.max(1, hr * 0.25),
      OUTLINE,
    );
    px.rect(hx + hr * 0.2, hy + hr * 0.15, Math.max(1, hr * 0.25), Math.max(1, hr * 0.25), OUTLINE);
  }

  if (pose.front) {
    arm(pose.sl, pose.el, pose.hl, pose.glove === 'l');
    arm(pose.sr, pose.er, pose.hr, pose.glove === 'r');
  }
  if (pose.bat) {
    const [ax, ay] = at([(pose.hl[0] + pose.hr[0]) / 2, (pose.hl[1] + pose.hr[1]) / 2]);
    const [bx, by] = at(pose.bat);
    const dx = bx - ax;
    const dy = by - ay;
    // Thin at the handle, thick at the barrel.
    limb(px, ax, ay, ax + dx * 0.45, ay + dy * 0.45, t * 0.55, BAT);
    limb(px, ax + dx * 0.45, ay + dy * 0.45, bx, by, t * 0.95, BAT);
  }
  return { pixels: h >= 10 ? px.outlined(OUTLINE) : px, footX: ox, footY: oy };
};

/** A baseball: white with red stitches when it is big enough to see them. */
export const ballPixels = (r: number): Pixels => {
  const size = Math.ceil(r * 2) + 2;
  const p = new Pixels(size, size);
  const c = size / 2;
  p.ellipse(c, c, r, r, '#ffffff');
  if (r >= 3) {
    p.set(c - r * 0.5, c - r * 0.3, '#e0383e')
      .set(c - r * 0.55, c + r * 0.1, '#e0383e')
      .set(c - r * 0.45, c + r * 0.45, '#e0383e');
    p.set(c + r * 0.5, c - r * 0.4, '#e0383e')
      .set(c + r * 0.55, c, '#e0383e')
      .set(c + r * 0.45, c + r * 0.4, '#e0383e');
  }
  return r >= 2 ? p.outlined('#5a5a6a') : p;
};
