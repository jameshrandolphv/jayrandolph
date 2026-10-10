import { Container, Graphics, GraphicsContext, Text, type TextStyleOptions } from 'pixi.js';
import { runwayEnd, type Airfield, type Box, type Helipad, type Runway } from './airfield';
import { HEIGHT, WIDTH, type Kind, type Oval } from './constants';
import { spline, type Point } from './geometry';

export const HEADLINE_FONT = 'Bangers, Impact, "Arial Black", sans-serif';
export const SCRIPT_FONT = 'Pacifico, "Brush Script MT", cursive';
const RESOLUTION = 2;

export const COLORS = {
  ink: 0x2e2a2c,
  grassA: 0x8cc85a,
  grassB: 0x84c052,
  swirl: 0xa6d97a,
  tree: 0x5b9c3a,
  treeLight: 0x7ab84f,
  tarmac: 0xeadbbd,
  tarmacEdge: 0xcdb98f,
  asphalt: 0x5a4945,
  asphaltEdge: 0x7d6a63,
  sea: 0x5ab6e4,
  seaLight: 0x8fd0f0,
  sand: 0xf1dc9e,
  foam: 0xeef9ff,
  pad: 0x3f7593,
  frame: 0x7c8183,
  warn: 0xdf4a48,
  warnRim: 0xf7a8a2,
  paper: 0xf7f0de,
  paperEdge: 0xcdbb93,
  red: 0xd8433a,
  redDark: 0xa82d27,
  blue: 0x3f6fb2,
  blueDark: 0x2c5089,
  gold: 0xf3c33f,
} as const;

/** The colour of each kind of aircraft, also used for its landing zone's markings. */
export const KIND_COLORS: Readonly<Record<Kind, { body: number; light: number; dark: number }>> = {
  jet: { body: 0xe4544c, light: 0xff8f83, dark: 0xa83430 },
  light: { body: 0xf4c430, light: 0xffe27a, dark: 0xbf8f12 },
  heli: { body: 0x48a8dd, light: 0x8fd3f5, dark: 0x2a76a8 },
};

const OUTLINE = { width: 2.2, color: COLORS.ink, join: 'round' as const };

// ---------------------------------------------------------------------------------------------------------------
// Aircraft. Each is drawn nose along +x, centred on its hit circle, so a rotation turns it about its middle.

/** Mirrors half an outline (from nose to tail along the top) to make a symmetric polygon. */
const mirrored = (half: readonly number[]): number[] => {
  const out = [...half];
  for (let i = half.length - 2; i >= 0; i -= 2)
    if (half[i + 1] !== 0) out.push(half[i]!, -half[i + 1]!);
  return out;
};

const jet = (
  g: GraphicsContext,
  r: number,
  c: (typeof KIND_COLORS)['jet'],
  shadow: boolean,
): void => {
  const s = r / 26;
  const p = (pts: number[]): number[] => pts.map((v) => v * s);
  const fill = (color: number) => (shadow ? { color: 0x000000 } : { color });
  // Wings and tailplane go under the fuselage.
  g.poly(p(mirrored([6, 4, -12, 27, -17, 27, -8, 4, -6, 0]))).fill(fill(c.body));
  if (!shadow) g.stroke(OUTLINE);
  g.poly(p(mirrored([-17, 3, -25, 11, -28, 11, -24, 3, -24, 0]))).fill(fill(c.body));
  if (!shadow) g.stroke(OUTLINE);
  // Engines under the wings.
  for (const y of [-12, 12]) {
    g.roundRect(-4 * s, (y - 2.6) * s, 11 * s, 5.2 * s, 2.6 * s).fill(fill(0xf3f0ec));
    if (!shadow) g.stroke({ ...OUTLINE, width: 1.6 });
  }
  g.roundRect(-27 * s, -5 * s, 54 * s, 10 * s, 5 * s).fill(fill(c.body));
  if (shadow) return;
  g.stroke(OUTLINE);
  g.roundRect(-22 * s, -2.6 * s, 40 * s, 2.4 * s, 1.2 * s).fill({ color: c.light, alpha: 0.9 });
  g.ellipse(20 * s, 0, 3.4 * s, 2.6 * s).fill(0x37506b);
  g.poly(p(mirrored([4, 5, -9, 22, -11, 22, -4, 5]))).fill({ color: c.light, alpha: 0.85 });
};

/** Fast jets: a slim delta-winged business jet. */
const fastJet = (
  g: GraphicsContext,
  r: number,
  c: (typeof KIND_COLORS)['jet'],
  shadow: boolean,
): void => {
  const s = r / 22;
  const p = (pts: number[]): number[] => pts.map((v) => v * s);
  const fill = (color: number) => (shadow ? { color: 0x000000 } : { color });
  g.poly(p(mirrored([10, 3, -10, 22, -15, 22, -12, 3, -10, 0]))).fill(fill(c.body));
  if (!shadow) g.stroke(OUTLINE);
  g.poly(p(mirrored([-15, 2, -22, 9, -24, 9, -21, 2, -21, 0]))).fill(fill(c.body));
  if (!shadow) g.stroke(OUTLINE);
  g.poly(p(mirrored([24, 0, 18, 3.5, -22, 3.5, -24, 0]))).fill(fill(c.light));
  if (shadow) return;
  g.stroke(OUTLINE);
  g.poly(p(mirrored([18, 0, 13, 2, 8, 2, 8, 0]))).fill(0x37506b);
  g.poly(p(mirrored([0, 0, -12, 3.5, -16, 3.5, -4, 0]))).fill(c.dark);
};

const light = (
  g: GraphicsContext,
  r: number,
  c: (typeof KIND_COLORS)['light'],
  fast: boolean,
  shadow: boolean,
): void => {
  const s = r / 19;
  const fill = (color: number) => (shadow ? { color: 0x000000 } : { color });
  // Tailplane, fuselage, then the straight high wing across it.
  g.roundRect(-17 * s, -8 * s, 6 * s, 16 * s, 2.5 * s).fill(fill(c.body));
  if (!shadow) g.stroke(OUTLINE);
  g.poly(mirrored([16 * s, 0, 15 * s, 4 * s, 4 * s, 4.6 * s, -16 * s, 2 * s, -17 * s, 0])).fill(
    fill(c.body),
  );
  if (!shadow) g.stroke(OUTLINE);
  g.roundRect(-2 * s, -20 * s, 10 * s, 40 * s, 4 * s).fill(fill(c.body));
  if (shadow) return;
  g.stroke(OUTLINE);
  g.roundRect(0, -18 * s, 3 * s, 36 * s, 1.5 * s).fill({ color: c.light, alpha: 0.9 });
  if (fast) g.rect(-1 * s, -20 * s, 3 * s, 40 * s).fill({ color: 0xffffff, alpha: 0.85 });
  g.ellipse(10.5 * s, 0, 2.6 * s, 2.8 * s).fill(0x37506b);
  g.circle(16.5 * s, 0, 2 * s).fill(COLORS.ink);
};

const heli = (
  g: GraphicsContext,
  r: number,
  c: (typeof KIND_COLORS)['heli'],
  fast: boolean,
  shadow: boolean,
): void => {
  const s = r / 20;
  const fill = (color: number) => (shadow ? { color: 0x000000 } : { color });
  g.roundRect(-26 * s, -1.8 * s, 22 * s, 3.6 * s, 1.8 * s).fill(fill(c.body));
  if (!shadow) g.stroke(OUTLINE);
  g.roundRect(-27 * s, -6 * s, 4 * s, 12 * s, 2 * s).fill(fill(c.body));
  if (!shadow) g.stroke(OUTLINE);
  g.ellipse(3 * s, 0, 13 * s, 9 * s).fill(fill(c.body));
  if (shadow) return;
  g.stroke(OUTLINE);
  g.ellipse(8 * s, 0, 6.5 * s, 6.5 * s).fill({ color: 0xd8f2ff, alpha: 0.95 });
  g.ellipse(9.5 * s, -2 * s, 2.5 * s, 2 * s).fill({ color: 0xffffff, alpha: 0.9 });
  if (fast) g.rect(-6 * s, -9 * s, 3 * s, 18 * s).fill({ color: 0xffffff, alpha: 0.85 });
};

const contexts = new Map<string, GraphicsContext>();

/** Shared drawing instructions for each kind of aircraft (and its shadow), built once. */
export const aircraftContext = (
  kind: Kind,
  fast: boolean,
  radius: number,
  shadow = false,
): GraphicsContext => {
  const key = `${kind}:${fast}:${radius}:${shadow}`;
  let g = contexts.get(key);
  if (!g) {
    g = new GraphicsContext();
    const c = KIND_COLORS[kind];
    if (kind === 'jet') (fast ? fastJet : jet)(g, radius, c, shadow);
    else if (kind === 'light') light(g, radius, c, fast, shadow);
    else heli(g, radius, c, fast, shadow);
    contexts.set(key, g);
  }
  return g;
};

/** Propeller blur for light aircraft; spun by scaling it on y. */
export const propContext = (radius: number): GraphicsContext => {
  const s = radius / 19;
  return new GraphicsContext()
    .ellipse(0, 0, 1.6 * s, 8 * s)
    .fill({ color: COLORS.ink, alpha: 0.55 })
    .ellipse(0, 0, 0.9 * s, 9 * s)
    .fill({ color: 0xffffff, alpha: 0.35 });
};

/** Helicopter rotor: two crossed blades over a faint disc. */
export const rotorContext = (radius: number): GraphicsContext => {
  const s = radius / 20;
  const g = new GraphicsContext().circle(0, 0, 24 * s).fill({ color: 0xffffff, alpha: 0.12 });
  g.roundRect(-24 * s, -1.6 * s, 48 * s, 3.2 * s, 1.6 * s).fill({ color: COLORS.ink, alpha: 0.8 });
  g.roundRect(-1.6 * s, -24 * s, 3.2 * s, 48 * s, 1.6 * s).fill({ color: COLORS.ink, alpha: 0.8 });
  g.circle(0, 0, 3 * s)
    .fill(0x9aa3a8)
    .stroke({ ...OUTLINE, width: 1.4 });
  return g;
};

/** Where the rotor or propeller sits on each aircraft, in its own coordinates. */
export const spinnerOffset = (kind: Kind, radius: number): Point =>
  kind === 'heli' ? { x: (3 * radius) / 20, y: 0 } : { x: (17.5 * radius) / 19, y: 0 };

export const warningContext = (radius: number): GraphicsContext =>
  new GraphicsContext()
    .circle(0, 0, radius + 12)
    .fill({ color: COLORS.warn, alpha: 0.72 })
    .stroke({ width: 3, color: COLORS.warnRim, alpha: 0.9 });

/** The "!" shown on the edge where an aircraft is about to arrive. */
export const arrivalMarker = (): Container => {
  const box = new Container();
  box.addChild(
    new Graphics().circle(0, 0, 15).fill(COLORS.warn).stroke({ width: 3, color: 0xffffff }),
  );
  const mark = label('!', 24, 0xffffff, {});
  mark.position.set(0, 1);
  box.addChild(mark);
  return box;
};

// ---------------------------------------------------------------------------------------------------------------
// The airfield.

/** A small spiral like the wind swirls painted on the original's grass. */
const swirl = (g: Graphics, x: number, y: number, scale: number, flip: boolean): void => {
  const pts: Point[] = [];
  for (let t = 0; t <= Math.PI * 3.2; t += 0.15) {
    const r = (6 + t * 9) * scale;
    pts.push({ x: x + Math.cos(t) * r * (flip ? -1 : 1), y: y + Math.sin(t) * r });
  }
  // A tail sweeping out of the spiral.
  const last = pts[pts.length - 1]!;
  pts.push(
    { x: last.x + (flip ? -1 : 1) * 60 * scale, y: last.y + 20 * scale },
    { x: last.x + (flip ? -1 : 1) * 120 * scale, y: last.y - 10 * scale },
  );
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of spline(pts, 3).slice(1)) g.lineTo(p.x, p.y);
  g.stroke({ width: 7 * scale, color: COLORS.swirl, alpha: 0.75, cap: 'round', join: 'round' });
};

const polyline = (g: Graphics, line: readonly Point[]): Graphics => {
  g.moveTo(line[0]!.x, line[0]!.y);
  for (const p of line.slice(1)) g.lineTo(p.x, p.y);
  return g;
};

/** The sea's polygon: the shoreline closed off through the field corners on the sea side. */
const seaPolygon = (field: Airfield): number[] => {
  const pts = field.water.flatMap((p) => [p.x, p.y]);
  const pad = 60;
  const corners: Record<Airfield['seaSide'], number[]> = {
    top: [WIDTH + pad, -pad, -pad, -pad],
    bottom: [WIDTH + pad, HEIGHT + pad, -pad, HEIGHT + pad],
    left: [-pad, HEIGHT + pad, -pad, -pad],
    right: [WIDTH + pad, HEIGHT + pad, WIDTH + pad, -pad],
  };
  return [...pts, ...corners[field.seaSide]];
};

const drawGround = (g: Graphics, field: Airfield): void => {
  const cell = 80;
  g.rect(-200, -200, WIDTH + 400, HEIGHT + 400).fill(COLORS.grassA);
  for (let y = -cell * 3; y < HEIGHT + cell * 3; y += cell) {
    for (let x = -cell * 3; x < WIDTH + cell * 3; x += cell)
      if ((x / cell + y / cell) % 2 === 0) g.rect(x, y, cell, cell);
  }
  g.fill(COLORS.grassB);
  for (const s of field.swirls) swirl(g, s.x, s.y, s.scale, s.flip);

  if (field.theme === 'coast') {
    polyline(g, field.water).stroke({ width: 40, color: COLORS.sand, cap: 'round', join: 'round' });
    g.poly(seaPolygon(field)).fill(COLORS.sea);
    polyline(g, field.water).stroke({ width: 4, color: COLORS.foam, alpha: 0.9, join: 'round' });
    waves(g, field);
  } else if (field.theme === 'river') {
    polyline(g, field.water).stroke({
      width: field.waterWidth + 18,
      color: COLORS.sand,
      cap: 'round',
      join: 'round',
    });
    polyline(g, field.water).stroke({
      width: field.waterWidth + 6,
      color: COLORS.foam,
      cap: 'round',
      join: 'round',
    });
    polyline(g, field.water).stroke({
      width: field.waterWidth,
      color: COLORS.sea,
      cap: 'round',
      join: 'round',
    });
    polyline(g, field.water).stroke({
      width: field.waterWidth * 0.3,
      color: COLORS.seaLight,
      alpha: 0.5,
      cap: 'round',
      join: 'round',
    });
  }

  for (const t of field.trees) {
    g.ellipse(t.x + 3, t.y + t.r * 0.55, t.r * 1.05, t.r * 0.6).fill({
      color: 0x000000,
      alpha: 0.12,
    });
  }
  for (const t of field.trees) {
    g.circle(t.x, t.y, t.r).fill(COLORS.tree);
    g.circle(t.x - t.r * 0.25, t.y - t.r * 0.3, t.r * 0.6).fill(COLORS.treeLight);
  }
};

/** A few curved wave marks on the open sea. */
const waves = (g: Graphics, field: Airfield): void => {
  const horizontal = field.seaSide === 'top' || field.seaSide === 'bottom';
  const into = field.seaSide === 'top' || field.seaSide === 'left' ? -1 : 1;
  field.water.forEach((p, i) => {
    if (i % 9 !== 4) return;
    const depth = 34 + (i % 2) * 18;
    const x = horizontal ? p.x : p.x + into * depth;
    const y = horizontal ? p.y + into * depth : p.y;
    g.moveTo(x - 12, y)
      .quadraticCurveTo(x - 6, y - 6, x, y)
      .quadraticCurveTo(x + 6, y - 6, x + 12, y);
  });
  g.stroke({ width: 3, color: COLORS.seaLight, cap: 'round' });
};

const box = (parent: Container, b: Box, radius: number): Graphics => {
  const c = new Graphics();
  c.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, radius);
  c.position.set(b.x, b.y);
  c.rotation = b.angle;
  parent.addChild(c);
  return c;
};

const runwayBody = (r: Runway): Graphics => {
  const g = new Graphics();
  g.position.set(r.x, r.y);
  g.rotation = r.angle;
  const L = r.length;
  const W = r.width;
  g.roundRect(-22, -W / 2 - 14, L + 44, W + 28, 16)
    .fill(COLORS.tarmac)
    .stroke({ width: 3, color: COLORS.tarmacEdge });
  g.rect(0, -W / 2, L, W).fill(COLORS.asphalt);
  g.rect(0, -W / 2 + 2, L, 2)
    .rect(0, W / 2 - 4, L, 2)
    .fill({ color: 0xffffff, alpha: 0.55 });
  // Threshold bars, centre-line dashes and the "no landing" cross at the far end.
  for (let y = -W / 2 + 5; y <= W / 2 - 8; y += 5) g.rect(4, y, 16, 2.6);
  for (let x = 34; x < L - 40; x += 26) g.rect(x, -1.2, 13, 2.4);
  g.fill({ color: 0xffffff, alpha: 0.85 });
  const cx = L - 18;
  g.moveTo(cx - 7, -7)
    .lineTo(cx + 7, 7)
    .moveTo(cx - 7, 7)
    .lineTo(cx + 7, -7)
    .stroke({ width: 3, color: 0xffffff, alpha: 0.85, cap: 'round' });
  // Arrows in the runway's colour, pointing the way in.
  const color = KIND_COLORS[r.kind].body;
  for (const x of [26, 44, 62]) {
    g.moveTo(x, -W / 2 + 6)
      .lineTo(x + 9, 0)
      .lineTo(x, W / 2 - 6)
      .stroke({ width: 4, color, cap: 'round', join: 'round' });
  }
  g.rect(-14, -W / 2 - 9, 10, W + 18).fill({ color, alpha: 0.9 });
  return g;
};

const helipadBody = (h: Helipad): Container => {
  const g = new Container();
  g.position.set(h.x, h.y);
  const side = h.radius * 2 + 26;
  const base = new Graphics()
    .roundRect(-side / 2, -side / 2, side, side, 16)
    .fill(COLORS.tarmac)
    .stroke({ width: 3, color: COLORS.tarmacEdge });
  base.rotation = h.angle;
  g.addChild(base);
  const disc = new Graphics()
    .circle(0, 0, h.radius)
    .fill(COLORS.pad)
    .stroke({ width: 3, color: KIND_COLORS.heli.dark })
    .circle(0, 0, h.radius - 6)
    .stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
  const bar = h.radius * 0.48;
  disc
    .rect(-bar * 0.62, -bar, bar * 0.32, bar * 2)
    .rect(bar * 0.3, -bar, bar * 0.32, bar * 2)
    .rect(-bar * 0.3, -bar * 0.15, bar * 0.6, bar * 0.3)
    .fill(0xffffff);
  g.addChild(disc);
  return g;
};

/** The static airfield: grass, water, trees, tarmac, runways and helipad. */
export const drawAirfield = (field: Airfield): Container => {
  const root = new Container();
  const ground = new Graphics();
  drawGround(ground, field);
  root.addChild(ground);

  const tarmac = new Container();
  if (field.apron) {
    box(tarmac, field.apron, 14).fill(COLORS.tarmac).stroke({ width: 3, color: COLORS.tarmacEdge });
    for (const b of field.buildings) {
      const shadow = box(tarmac, { ...b, x: b.x + 3, y: b.y + 4 }, 4);
      shadow.fill({ color: 0x000000, alpha: 0.12 });
      box(tarmac, b, 4).fill(0xfbf8f1).stroke({ width: 2, color: 0xb9a985 });
    }
  }
  root.addChild(tarmac);
  for (const zone of field.zones)
    root.addChild(zone.type === 'runway' ? runwayBody(zone) : helipadBody(zone));
  return root;
};

/** Glow over the zone a path has been drawn onto, in its aircraft's colour. */
export const zoneGlow = (field: Airfield): Graphics[] =>
  field.zones.map((zone) => {
    const g = new Graphics();
    const color = KIND_COLORS[zone.kind].light;
    if (zone.type === 'runway') {
      g.position.set(zone.x, zone.y);
      g.rotation = zone.angle;
      g.roundRect(-16, -zone.width / 2 - 8, zone.length + 32, zone.width + 16, 12).fill({
        color,
        alpha: 0.55,
      });
    } else {
      g.position.set(zone.x, zone.y);
      g.circle(0, 0, zone.radius + 8).fill({ color, alpha: 0.55 });
    }
    g.visible = false;
    return g;
  });

/** Midpoint of a zone, for placing text over it. */
export const zoneCentre = (zone: Runway | Helipad): Point => {
  if (zone.type === 'helipad') return zone;
  const end = runwayEnd(zone);
  return { x: (zone.x + end.x) / 2, y: (zone.y + end.y) / 2 };
};

/** The rounded grey bezel around the field, as in the original. */
export const drawFrame = (): Graphics =>
  new Graphics()
    .rect(-400, -400, WIDTH + 800, HEIGHT + 800)
    .fill(COLORS.frame)
    .roundRect(6, 6, WIDTH - 12, HEIGHT - 12, 22)
    .cut()
    .roundRect(6, 6, WIDTH - 12, HEIGHT - 12, 22)
    .stroke({ width: 2, color: 0x000000, alpha: 0.25 });

// ---------------------------------------------------------------------------------------------------------------
// Text and buttons.

export const label = (
  text: string,
  size: number,
  fill: number | string,
  style: Partial<TextStyleOptions>,
  font = HEADLINE_FONT,
): Text => {
  const t = new Text({
    text,
    style: { fontFamily: font, fontSize: size, fill, align: 'center', ...style },
    resolution: RESOLUTION,
  });
  t.anchor.set(0.5);
  return t;
};

export const ovalButton = (
  o: Oval,
  color: 'red' | 'blue',
  size: number,
  tilt = -0.06,
): Container => {
  const b = new Container();
  b.position.set(o.x, o.y);
  const [main, dark] =
    color === 'red' ? [COLORS.red, COLORS.redDark] : [COLORS.blue, COLORS.blueDark];
  b.addChild(
    new Graphics()
      .ellipse(3, 6, o.rx, o.ry)
      .fill({ color: 0x000000, alpha: 0.2 })
      .ellipse(0, 0, o.rx, o.ry)
      .fill(dark)
      .ellipse(0, -3, o.rx - 4, o.ry - 6)
      .fill(main)
      .ellipse(0, 0, o.rx, o.ry)
      .stroke({ width: 3, color: COLORS.ink })
      .ellipse(-o.rx * 0.25, -o.ry * 0.5, o.rx * 0.45, o.ry * 0.18)
      .fill({ color: 0xffffff, alpha: 0.25 }),
  );
  const text = label(o.label, size, 0xffffff, {
    stroke: { color: dark, width: 4, join: 'round' },
    letterSpacing: 1,
  });
  text.rotation = tilt;
  b.addChild(text);
  return b;
};

/** Square corner button, with the icon drawn by `icon`. */
export const cornerButton = (icon: (g: Graphics) => void): Container => {
  const b = new Container();
  const g = new Graphics()
    .roundRect(0, 0, 48, 48, 10)
    .fill({ color: 0x5f6466, alpha: 0.85 })
    .stroke({ width: 2.5, color: 0xffffff, alpha: 0.8 });
  icon(g);
  b.addChild(g);
  return b;
};

export const pauseIcon = (g: Graphics): void => {
  g.roundRect(15, 13, 7, 22, 2).roundRect(26, 13, 7, 22, 2).fill(0xffffff);
};

export const fastIcon = (g: Graphics): void => {
  g.poly([10, 14, 24, 24, 10, 34]).poly([24, 14, 38, 24, 24, 34]).fill(0xffffff);
};

// ---------------------------------------------------------------------------------------------------------------
// Cards and their illustrations.

/** A sheet of notepaper with a shadow, as the title and game-over screens are drawn on. */
export const paperCard = (x: number, y: number, w: number, h: number): Graphics => {
  const g = new Graphics()
    .roundRect(x + 6, y + 10, w, h, 24)
    .fill({ color: 0x000000, alpha: 0.25 })
    .roundRect(x, y, w, h, 24)
    .fill(COLORS.paper);
  for (let ly = y + 70; ly < y + h - 20; ly += 34) g.moveTo(x + 24, ly).lineTo(x + w - 24, ly);
  g.stroke({ width: 1.5, color: 0x8fb4d8, alpha: 0.35 });
  g.moveTo(x + 64, y + 12)
    .lineTo(x + 64, y + h - 12)
    .stroke({ width: 2, color: 0xe08a8a, alpha: 0.45 });
  g.roundRect(x, y, w, h, 24).stroke({ width: 4, color: COLORS.paperEdge });
  return g;
};

/** The game's logo: the name in script over a pair of blue wings and an arc of stars. */
export const logo = (): Container => {
  const c = new Container();
  const wings = new Graphics();
  for (const side of [-1, 1]) {
    wings
      .moveTo(side * 30, -14)
      .bezierCurveTo(side * 90, -46, side * 170, -40, side * 210, -22)
      .bezierCurveTo(side * 170, -8, side * 120, 8, side * 30, 18)
      .closePath()
      .fill(COLORS.blue)
      .stroke({ width: 3, color: COLORS.ink, join: 'round' });
    for (let i = 0; i < 4; i++) {
      const fx = side * (60 + i * 34);
      wings.moveTo(fx, -26 + i * 2).lineTo(fx + side * 20, 6 - i * 4);
    }
    wings.stroke({ width: 2.5, color: COLORS.blueDark, cap: 'round' });
  }
  wings.ellipse(0, 0, 40, 26).fill(COLORS.red).stroke({ width: 3, color: COLORS.ink });
  // Raised so the wings show above the lettering rather than behind it.
  wings.y = -46;
  c.addChild(wings);
  const stars = new Graphics();
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (1.25 + i * 0.125);
    star(stars, Math.cos(a) * 120, 30 + Math.sin(a) * 120, i === 2 ? 15 : 12);
  }
  stars.fill(COLORS.gold).stroke({ width: 2.5, color: COLORS.ink, join: 'round' });
  stars.y = -64;
  c.addChild(stars);
  const name = label(
    'Flights!',
    92,
    COLORS.red,
    { stroke: { color: 0xffffff, width: 12, join: 'round' } },
    SCRIPT_FONT,
  );
  const back = label(
    'Flights!',
    92,
    COLORS.ink,
    { stroke: { color: COLORS.ink, width: 20, join: 'round' } },
    SCRIPT_FONT,
  );
  for (const t of [back, name]) {
    t.rotation = -0.06;
    t.y = 20;
  }
  c.addChild(back, name);
  return c;
};

const star = (g: Graphics, x: number, y: number, r: number): void => {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts);
};

/** A speech bubble with a tail pointing at (tx, ty), relative to its centre. */
export const bubble = (rx: number, ry: number, tx: number, ty: number): Graphics => {
  const g = new Graphics();
  const a = Math.atan2(ty, tx);
  const spread = 0.22;
  g.moveTo(Math.cos(a - spread) * rx * 0.9, Math.sin(a - spread) * ry * 0.9)
    .lineTo(tx, ty)
    .lineTo(Math.cos(a + spread) * rx * 0.9, Math.sin(a + spread) * ry * 0.9)
    .closePath()
    .fill(0xffffff)
    .stroke({ width: 3, color: COLORS.ink, join: 'round' });
  g.ellipse(0, 0, rx, ry).fill(0xffffff).stroke({ width: 3, color: COLORS.ink });
  // Paint over the tail's base so it joins the ellipse without a seam.
  g.ellipse(0, 0, rx - 1.5, ry - 1.5).fill(0xffffff);
  return g;
};

/** A tall glass of milkshake with cream, a cherry and a striped straw. */
export const milkshake = (): Graphics => {
  const g = new Graphics();
  // Straw behind the cream.
  g.poly([10, -150, 18, -150, 4, -40, -4, -40])
    .fill(0xffffff)
    .stroke({ width: 2.5, color: COLORS.ink, join: 'round' });
  for (let i = 0; i < 6; i++) {
    const t = i / 6 + 0.04;
    const y = -150 + t * 110;
    const x = 14 - t * 14;
    g.poly([x - 4, y, x + 4, y, x + 3, y + 8, x - 5, y + 8]).fill(COLORS.red);
  }
  // Glass, with the shake showing through.
  g.poly([-44, -70, 44, -70, 30, 40, -30, 40])
    .fill(0xfff2d6)
    .stroke({ width: 3, color: COLORS.ink, join: 'round' });
  for (const x of [-26, -10, 6, 22]) g.moveTo(x, -62).lineTo(x * 0.72, 34);
  g.stroke({ width: 2, color: 0xe7cfa2 });
  g.poly([-36, -64, -26, -64, -20, 32, -26, 32]).fill({ color: 0xffffff, alpha: 0.6 });
  // Foot of the glass.
  g.poly([-10, 40, 10, 40, 8, 60, -8, 60])
    .fill(0xe9f4f8)
    .stroke({ width: 3, color: COLORS.ink, join: 'round' });
  g.ellipse(0, 64, 34, 9).fill(0xe9f4f8).stroke({ width: 3, color: COLORS.ink });
  // Whipped cream and the cherry.
  for (const [x, y, r] of [
    [-30, -72, 18],
    [30, -72, 18],
    [0, -76, 24],
    [-14, -94, 17],
    [14, -94, 17],
    [0, -108, 14],
  ] as const) {
    g.circle(x, y, r).fill(0xffffff).stroke({ width: 2.5, color: COLORS.ink });
  }
  for (const [x, y, r] of [
    [-30, -72, 15.5],
    [30, -72, 15.5],
    [0, -76, 21.5],
    [-14, -94, 14.5],
    [14, -94, 14.5],
    [0, -108, 11.5],
  ] as const) {
    g.circle(x, y, r).fill(0xffffff);
  }
  g.moveTo(-2, -124)
    .quadraticCurveTo(4, -140, 16, -146)
    .stroke({ width: 2.5, color: 0x5d7a2e, cap: 'round' });
  g.circle(-2, -122, 11).fill(COLORS.red).stroke({ width: 2.5, color: COLORS.ink });
  g.circle(-6, -126, 3.5).fill({ color: 0xffffff, alpha: 0.7 });
  return g;
};

const SKIN = 0xf8d4b8;
const SKIN_SHADE = 0xe9b796;
const HAIR = 0xf1c44c;
const HAIR_SHADE = 0xd9a530;
const UNIFORM = 0x3a6fb0;
const UNIFORM_SHADE = 0x2b568f;

/**
 * The stewardess from the original's menus, saluting: drawn from the waist up, about 330 wide and 520 tall,
 * with her head's top near (170, 0).
 */
export const stewardess = (): Container => {
  const c = new Container();
  const ink = { width: 3, color: COLORS.ink, join: 'round' as const, cap: 'round' as const };

  // Hair behind the head, falling to the shoulders in a flip.
  const back = new Graphics()
    .moveTo(98, 90)
    .bezierCurveTo(78, 160, 84, 220, 104, 246)
    .bezierCurveTo(124, 262, 150, 250, 160, 236)
    .lineTo(200, 236)
    .bezierCurveTo(214, 252, 244, 262, 260, 244)
    .bezierCurveTo(276, 218, 278, 160, 252, 90)
    .closePath()
    .fill(HAIR)
    .stroke(ink);
  c.addChild(back);

  // Body: jacket with lapels over a white blouse and a red neckerchief.
  const body = new Graphics();
  body
    .moveTo(88, 300)
    .bezierCurveTo(112, 272, 140, 264, 158, 262)
    .lineTo(202, 262)
    .bezierCurveTo(226, 266, 254, 276, 274, 300)
    .bezierCurveTo(300, 330, 310, 420, 312, 540)
    .lineTo(64, 540)
    .bezierCurveTo(62, 430, 66, 336, 88, 300)
    .closePath()
    .fill(UNIFORM)
    .stroke(ink);
  body.poly([158, 262, 202, 262, 180, 340]).fill(0xffffff).stroke(ink);
  body
    .moveTo(158, 262)
    .lineTo(130, 290)
    .lineTo(150, 300)
    .lineTo(138, 316)
    .lineTo(180, 400)
    .lineTo(222, 316)
    .lineTo(210, 300)
    .lineTo(230, 290)
    .lineTo(202, 262)
    .lineTo(180, 340)
    .closePath()
    .fill(UNIFORM_SHADE)
    .stroke(ink);
  body.poly([166, 270, 194, 270, 186, 290, 174, 290]).fill(COLORS.red).stroke(ink);
  body.poly([174, 288, 186, 288, 196, 326, 180, 316, 164, 326]).fill(COLORS.red).stroke(ink);
  for (const y of [420, 470])
    body
      .circle(180, y, 6)
      .fill(COLORS.gold)
      .stroke({ ...ink, width: 2 });
  // Wings badge on the breast.
  body
    .moveTo(232, 352)
    .quadraticCurveTo(248, 344, 266, 350)
    .quadraticCurveTo(250, 356, 232, 356)
    .fill(COLORS.gold)
    .stroke({ ...ink, width: 2 });
  c.addChild(body);

  // Neck.
  const neck = new Graphics()
    .moveTo(158, 200)
    .lineTo(158, 266)
    .bezierCurveTo(170, 278, 190, 278, 202, 266)
    .lineTo(202, 200)
    .closePath()
    .fill(SKIN)
    .stroke(ink);
  neck
    .moveTo(160, 238)
    .quadraticCurveTo(180, 252, 200, 238)
    .stroke({ width: 3, color: SKIN_SHADE, cap: 'round' });
  c.addChild(neck);

  // Saluting arm: upper arm out to the elbow, forearm up to the brim of the cap.
  const arm = new Graphics()
    .moveTo(96, 296)
    .bezierCurveTo(60, 300, 26, 290, 14, 262)
    .bezierCurveTo(6, 238, 22, 222, 40, 210)
    .lineTo(82, 150)
    .lineTo(110, 168)
    .lineTo(66, 240)
    .bezierCurveTo(78, 252, 100, 254, 116, 252)
    .closePath()
    .fill(UNIFORM)
    .stroke(ink);
  arm
    .moveTo(30, 262)
    .quadraticCurveTo(48, 272, 70, 268)
    .stroke({ width: 3, color: UNIFORM_SHADE, cap: 'round' });
  c.addChild(arm);

  // Head.
  const head = new Graphics();
  head.ellipse(270, 150, 12, 20).fill(SKIN).stroke(ink);
  head.ellipse(180, 140, 82, 92).fill(SKIN).stroke(ink);
  head.ellipse(132, 170, 16, 10).ellipse(228, 170, 16, 10).fill({ color: 0xf29a9a, alpha: 0.45 });
  // Eyes looking out, with lashes; brows; nose; a red smile.
  for (const [x, flip] of [
    [148, 1],
    [214, -1],
  ] as const) {
    head
      .ellipse(x, 142, 10, 13)
      .fill(0xffffff)
      .stroke({ ...ink, width: 2.5 });
    head.circle(x + 2, 145, 7).fill(0x3b6fa8);
    head.circle(x + 2, 145, 3.5).fill(COLORS.ink);
    head.circle(x + 4, 141, 2).fill(0xffffff);
    head
      .moveTo(x - 13, 135)
      .quadraticCurveTo(x, 122, x + 13, 135)
      .stroke({ ...ink, width: 4 });
    head
      .moveTo(x - 12 * flip, 130)
      .lineTo(x - 18 * flip, 124)
      .stroke({ ...ink, width: 2.5 });
    head
      .moveTo(x - 14, 110)
      .quadraticCurveTo(x, 102, x + 14, 108)
      .stroke({ width: 3.5, color: HAIR_SHADE, cap: 'round' });
  }
  head
    .moveTo(182, 150)
    .quadraticCurveTo(176, 170, 186, 176)
    .stroke({ width: 3, color: SKIN_SHADE, cap: 'round' });
  head
    .moveTo(156, 196)
    .quadraticCurveTo(182, 216, 208, 194)
    .quadraticCurveTo(182, 204, 156, 196)
    .closePath()
    .fill(COLORS.red)
    .stroke({ ...ink, width: 2.5 });
  c.addChild(head);

  // Fringe swept across the forehead under the cap, and the curls by the ears.
  const fringe = new Graphics()
    .moveTo(96, 132)
    .bezierCurveTo(100, 80, 150, 58, 200, 62)
    .bezierCurveTo(240, 64, 266, 92, 264, 134)
    .bezierCurveTo(250, 110, 228, 96, 206, 96)
    .bezierCurveTo(196, 112, 172, 120, 148, 118)
    .bezierCurveTo(128, 116, 112, 120, 96, 132)
    .closePath()
    .fill(HAIR)
    .stroke(ink);
  fringe
    .moveTo(150, 82)
    .quadraticCurveTo(190, 92, 210, 80)
    .stroke({ width: 3, color: HAIR_SHADE, cap: 'round' });
  c.addChild(fringe);

  // The cap, tilted, with its gold badge.
  const cap = new Graphics()
    .moveTo(100, 84)
    .bezierCurveTo(104, 40, 150, 14, 200, 14)
    .bezierCurveTo(240, 16, 262, 40, 266, 70)
    .bezierCurveTo(220, 66, 150, 74, 100, 84)
    .closePath()
    .fill(UNIFORM)
    .stroke(ink);
  cap
    .moveTo(100, 84)
    .bezierCurveTo(150, 72, 220, 64, 266, 70)
    .lineTo(268, 82)
    .bezierCurveTo(220, 76, 150, 84, 98, 96)
    .closePath()
    .fill(UNIFORM_SHADE)
    .stroke(ink);
  cap
    .circle(180, 44, 10)
    .fill(COLORS.gold)
    .stroke({ ...ink, width: 2 });
  cap
    .moveTo(160, 46)
    .quadraticCurveTo(170, 38, 172, 46)
    .moveTo(200, 46)
    .quadraticCurveTo(190, 38, 188, 46)
    .stroke({ width: 3, color: COLORS.gold, cap: 'round' });
  c.addChild(cap);

  // White-gloved hand, fingers together along the brim.
  const hand = new Graphics()
    .moveTo(70, 160)
    .bezierCurveTo(70, 132, 92, 104, 118, 84)
    .bezierCurveTo(134, 72, 148, 76, 140, 90)
    .bezierCurveTo(132, 104, 120, 116, 112, 130)
    .bezierCurveTo(108, 146, 110, 166, 96, 176)
    .bezierCurveTo(84, 180, 72, 172, 70, 160)
    .closePath()
    .fill(0xffffff)
    .stroke(ink);
  hand
    .moveTo(100, 104)
    .lineTo(132, 82)
    .moveTo(94, 116)
    .lineTo(124, 96)
    .stroke({ width: 2, color: 0xc9cfd6, cap: 'round' });
  hand.moveTo(72, 170).lineTo(100, 182).lineTo(108, 164).stroke(ink);
  c.addChild(hand);
  return c;
};

/** A small diagram for the how-to-play card: an aircraft, a dashed path and the zone it lands on. */
export const howToRow = (kind: Kind, zoneW: number): Container => {
  const c = new Container();
  const shadow = new Graphics(aircraftContext(kind, false, kind === 'jet' ? 22 : 18, true));
  shadow.alpha = 0.18;
  shadow.position.set(6, 8);
  const plane = new Graphics(aircraftContext(kind, false, kind === 'jet' ? 22 : 18));
  const path = new Graphics();
  for (let x = 34; x < 150; x += 16) path.moveTo(x, 0).lineTo(x + 9, 0);
  path.stroke({ width: 3.5, color: COLORS.ink, alpha: 0.6, cap: 'round' });
  const zone = new Graphics();
  if (kind === 'heli') {
    zone.circle(190, 0, 26).fill(COLORS.pad).stroke({ width: 3, color: 0xffffff });
    zone.rect(181, -10, 4, 20).rect(195, -10, 4, 20).rect(183, -2, 14, 4).fill(0xffffff);
  } else {
    zone
      .roundRect(160, -20, zoneW + 20, 40, 12)
      .fill(COLORS.tarmac)
      .stroke({ width: 2, color: COLORS.tarmacEdge });
    zone.rect(170, -13, zoneW, 26).fill(COLORS.asphalt);
    for (const x of [178, 192])
      zone
        .moveTo(x, -8)
        .lineTo(x + 7, 0)
        .lineTo(x, 8);
    zone.stroke({ width: 3.5, color: KIND_COLORS[kind].body, cap: 'round', join: 'round' });
  }
  c.addChild(path, zone, shadow, plane);
  return c;
};
