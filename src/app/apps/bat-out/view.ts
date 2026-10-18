import { Container, Graphics, Text, TextStyle, type Application } from 'pixi.js';
import type { LogicalSize } from '../../games/game-canvas';
import { HEADLINE_FONT, SCRIPT_FONT } from '../flights/art';
import {
  AWAY_KIT,
  HOME_KIT,
  PAL,
  POSES,
  drawBall,
  drawFigure,
  mirror,
  skinFor,
  type Kit,
  type Pose,
  type PoseName,
} from './art';
import {
  BATTING_CAMERA,
  PITCHING_CAMERA,
  fieldCamera,
  lerpCamera,
  project,
  vec,
  type Camera,
  type Vec3,
} from './camera';
import {
  BASES,
  BATTER,
  FENCE_HEIGHT,
  FIELDER_SPOTS,
  HEIGHT,
  MOUND,
  WIDTH,
  ZONE,
  fenceAt,
} from './constants';
import { BACKSTOP } from './flight';
import type { BatOutGame } from './game';
import {
  AGAIN_BUTTON,
  BACK_BUTTON,
  CONTINUE_BUTTON,
  HELP_BUTTON,
  MENU_BUTTON,
  MODE_BUTTONS,
  QUIT_BUTTON,
  RESUME_BUTTON,
  pauseButton,
  type Bounds,
  type Button,
} from './layout';
import { ballAt, trackAt, type Play } from './play';
import { MODES, isGame, outcome, userBats, type GameState } from './rules';
import { MITT_U, type BatOutSim } from './sim';
import { USER_WINDOW } from './swing';

const INK = PAL.ink;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const ease = (t: number): number => 1 - (1 - clamp01(t)) ** 3;
/** Overshoots a little before settling, for calls popping onto the screen. */
const pop = (t: number): number => {
  const u = clamp01(t);
  return 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
};

interface Label {
  text: string;
  size: number;
  fill: number;
  font?: string;
  /** An outline round the letters, `width` in font px. */
  stroke?: { color: number; width: number };
  /** 0 left, 0.5 centre, 1 right. */
  align?: number;
  alpha?: number;
  rotation?: number;
  scale?: number;
  letterSpacing?: number;
}

/**
 * Text objects handed out afresh each frame and hidden when not used, so drawing reads top to bottom. A slot keeps
 * its text until it is given something different, so steady text is not rasterised again every frame.
 */
class TextPool {
  private readonly slots: { t: Text; key: string }[] = [];
  private used = 0;
  constructor(private readonly layer: Container) {}

  begin(): void {
    this.used = 0;
  }

  take(l: Label, x: number, y: number, resolution: number): Text {
    let slot = this.slots[this.used];
    if (!slot) {
      slot = { t: new Text({ text: '' }), key: '' };
      this.slots.push(slot);
      this.layer.addChild(slot.t);
    }
    this.used++;
    const { t } = slot;
    const key = `${l.text}|${l.size}|${l.fill}|${l.font}|${l.stroke?.color}|${l.stroke?.width}|${l.letterSpacing}|${resolution}`;
    if (slot.key !== key) {
      slot.key = key;
      t.style = new TextStyle({
        fontFamily: l.font ?? HEADLINE_FONT,
        fontSize: l.size,
        fill: l.fill,
        align: 'center',
        letterSpacing: l.letterSpacing ?? 0,
        stroke: l.stroke ? { ...l.stroke, join: 'round' } : undefined,
        padding: 4,
      });
      t.resolution = resolution;
      t.text = l.text;
    }
    t.visible = true;
    t.anchor.set(l.align ?? 0.5, 0.5);
    t.position.set(x, y);
    t.alpha = l.alpha ?? 1;
    t.rotation = l.rotation ?? 0;
    t.scale.set(l.scale ?? 1);
    return t;
  }

  end(): void {
    for (let i = this.used; i < this.slots.length; i++) this.slots[i].t.visible = false;
  }
}

/** Players are drawn this tall (ft) when the camera is close enough; far off they never shrink below `MIN_PX`. */
const PLAYER_FT = 6.2;
const MIN_PX = 11;
const MAX_PX = 80;
/** The ball is drawn larger than life so it is easy to follow. */
const BALL_SCALE = 1.7;
const NEAR = 1;
/** The radius (ft) of the ring showing roughly where a pitch is heading. */
const TARGET_FT = 0.5;

/** Points on an arc about (cx, cy) at radius r between two angles (degrees from straight out, + to the right). */
const arc = (cx: number, cy: number, r: number, from: number, to: number, n = 16): Vec3[] => {
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    pts.push(vec(cx + r * Math.sin(a), cy + r * Math.cos(a)));
  }
  return pts;
};
const circle = (c: Vec3, r: number, n = 18): Vec3[] => arc(c.x, c.y, r, 0, 360, n).slice(0, n);

/** The outfield wall all the way round: the fence in fair territory, then in along the foul lines to behind home. */
const WALL: Vec3[] = (() => {
  const fair: Vec3[] = [];
  for (let a = -45; a <= 45; a += 5)
    fair.push(
      vec(fenceAt(a) * Math.sin((a * Math.PI) / 180), fenceAt(a) * Math.cos((a * Math.PI) / 180)),
    );
  const off = 45;
  const s = Math.SQRT1_2;
  const rightPole = fair[fair.length - 1];
  const leftPole = fair[0];
  return [
    ...fair,
    vec(rightPole.x + off * s, rightPole.y - off * s),
    vec(off * s * 2.2, BACKSTOP + 10),
    vec(18, BACKSTOP),
    vec(-18, BACKSTOP),
    vec(-off * s * 2.2, BACKSTOP + 10),
    vec(leftPole.x - off * s, leftPole.y - off * s),
  ];
})();

/** Moves a point on the wall straight out from the middle of the park. */
const beyond = (p: Vec3, out: number, z = 0): Vec3 => {
  const r = Math.hypot(p.x, p.y - 30) || 1;
  return vec(p.x + (p.x / r) * out, p.y + ((p.y - 30) / r) * out, z);
};

interface Tree {
  at: Vec3;
  /** Canopy radius (ft). */
  r: number;
  color: number;
}

/** The park's trees, in rows round the outside of the wall, as Chaos Park's park is ringed with them. */
const TREES: Tree[] = (() => {
  const trees: Tree[] = [];
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < WALL.length; i++) {
    const a = WALL[i];
    const b = WALL[(i + 1) % WALL.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 0; d < len; d += 22) {
      const f = d / len;
      const p = vec(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      for (let row = 0; row < 2; row++) {
        const r = 11 + rnd() * 6 + row * 4;
        const blossom = rnd() < 0.3;
        const palette = blossom ? PAL.blossom : PAL.canopies;
        trees.push({
          at: beyond(p, 16 + row * 26 + rnd() * 10, r + 8),
          r,
          color: palette[Math.floor(rnd() * palette.length)],
        });
      }
    }
  }
  return trees;
})();

export class BatOutView {
  private readonly scene = new Container();
  private readonly fieldG = new Graphics();
  private readonly belowG = new Graphics();
  private readonly actorsG = new Graphics();
  private readonly aboveG = new Graphics();
  private readonly hudG = new Graphics();
  private readonly hudLayer = new Container();
  private readonly cardG = new Graphics();
  private readonly cardLayer = new Container();
  private readonly hudText = new TextPool(this.hudLayer);
  private readonly cardText = new TextPool(this.cardLayer);
  private readonly actors: { depth: number; draw: () => void }[] = [];
  private cam: Camera = BATTING_CAMERA;
  private playTarget = vec(0, 60);
  private clock = 0;
  private lastPlay: Play | null = null;
  /** Text is rasterised at this many pixels per logical px, so it stays sharp however far the game is scaled up. */
  private res = 2;

  constructor(
    private readonly app: Application,
    private readonly root: Container,
    private readonly game: BatOutGame,
  ) {
    this.scene.addChild(
      this.fieldG,
      this.belowG,
      this.actorsG,
      this.aboveG,
      this.hudG,
      this.hudLayer,
      this.cardG,
      this.cardLayer,
    );
    root.addChild(this.scene);
  }

  update(alpha: number, deltaMs: number, bounds: Bounds, size: LogicalSize): void {
    void alpha;
    this.clock += deltaMs / 1000;
    this.res = Math.min(
      12,
      Math.max(2, Math.ceil(this.root.scale.x * this.app.renderer.resolution)),
    );
    // Drawn about the middle of the logical screen.
    this.scene.position.set(size.width / 2, size.height / 2);
    const view = {
      left: bounds.left - size.width / 2,
      right: bounds.right - size.width / 2,
      top: bounds.top - size.height / 2,
      bottom: bounds.bottom - size.height / 2,
    };

    const { sim } = this.game;
    this.cam = this.chooseCamera(sim, deltaMs / 1000);
    for (const g of [this.fieldG, this.belowG, this.actorsG, this.aboveG, this.hudG, this.cardG])
      g.clear();
    this.hudText.begin();
    this.cardText.begin();

    this.drawField(view);
    this.drawActors(sim);
    this.drawEffects(sim, view);
    if (sim.state && sim.phase !== 'title' && sim.phase !== 'help' && sim.phase !== 'over')
      this.drawHud(sim, sim.state, view);
    this.drawCards(sim, view);

    this.hudText.end();
    this.cardText.end();
  }

  // Cameras.

  private chooseCamera(sim: BatOutSim, dt: number): Camera {
    const pitchCam = sim.state && !userBats(sim.state) ? PITCHING_CAMERA : BATTING_CAMERA;
    const play = sim.phase === 'play' || (sim.phase === 'call' && sim.play) ? sim.play : null;
    if (!play) {
      this.lastPlay = null;
      return pitchCam;
    }
    if (play !== this.lastPlay) {
      this.lastPlay = play;
      this.playTarget = vec(0, 70);
    }
    const t = sim.phase === 'play' ? sim.playTime : play.duration;
    // Follow the ball across the field, a little behind it so the plate stays in view on short hits.
    const b = ballAt(play.ball, t);
    const want = vec(b.x * 0.75, Math.max(55, Math.min(300, b.y * 0.8)));
    const k = 1 - Math.exp(-dt * 3.5);
    this.playTarget = vec(
      this.playTarget.x + (want.x - this.playTarget.x) * k,
      this.playTarget.y + (want.y - this.playTarget.y) * k,
    );
    const field = fieldCamera(this.playTarget);
    // From the batter's view the camera pulls back and up; from the pitching view it cuts.
    if (pitchCam === BATTING_CAMERA && sim.phase === 'play')
      return lerpCamera(BATTING_CAMERA, field, ease(sim.playTime / 0.7));
    return field;
  }

  /** Projects a ground or 3D polygon, cut where it passes behind the camera. */
  private poly(pts: readonly Vec3[]): number[] {
    const cam = this.cam;
    const proj = pts.map((p) => ({ p, d: project(cam, p) }));
    const out: number[] = [];
    for (let i = 0; i < proj.length; i++) {
      const a = proj[i];
      const b = proj[(i + 1) % proj.length];
      if (a.d.depth >= NEAR) out.push(a.d.x, a.d.y);
      if (a.d.depth >= NEAR !== b.d.depth >= NEAR) {
        const f = (NEAR - a.d.depth) / (b.d.depth - a.d.depth);
        const q = vec(
          a.p.x + (b.p.x - a.p.x) * f,
          a.p.y + (b.p.y - a.p.y) * f,
          a.p.z + (b.p.z - a.p.z) * f,
        );
        const c = project(cam, q);
        out.push(c.x, c.y);
      }
    }
    return out;
  }

  /** Fills a projected polygon, outlined in ink `outline` px wide if given. */
  private fillPoly(g: Graphics, pts: readonly Vec3[], color: number, outline = 0, alpha = 1): void {
    const flat = this.poly(pts);
    if (flat.length < 6) return;
    g.poly(flat).fill({ color, alpha });
    if (outline) g.stroke({ width: outline, color: INK, join: 'round' });
  }

  /** A strip of ground between two points, `width` ft across. */
  private strip(g: Graphics, a: Vec3, b: Vec3, width: number, color: number): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    this.fillPoly(
      g,
      [
        vec(a.x + nx, a.y + ny, a.z),
        vec(b.x + nx, b.y + ny, b.z),
        vec(b.x - nx, b.y - ny, b.z),
        vec(a.x - nx, a.y - ny, a.z),
      ],
      color,
    );
  }

  // The field.

  private drawField(view: Bounds): void {
    const g = this.fieldG;
    const { cam } = this;
    // Sky, paler towards the horizon.
    g.rect(view.left, view.top, view.right - view.left, view.bottom - view.top).fill(PAL.sky);
    const horizon = project(
      cam,
      vec(cam.pos.x + (cam.at.x - cam.pos.x) * 50, cam.pos.y + (cam.at.y - cam.pos.y) * 50, 0),
    ).y;
    g.rect(view.left, horizon - 40, view.right - view.left, 40).fill(PAL.skyLow);
    // Soft clouds drift slowly.
    for (let i = 0; i < 4; i++) {
      const cx = view.left + ((i * 61 + this.clock * 3) % (view.right - view.left + 60)) - 30;
      const cy = horizon - 56 - ((i * 37) % 44);
      g.ellipse(cx, cy, 13, 4.5)
        .ellipse(cx + 7, cy - 3.5, 7, 4.5)
        .ellipse(cx - 6, cy - 2, 6, 3.5)
        .fill({ color: PAL.cloud, alpha: 0.9 });
    }

    // Park grass out past the wall, and the trees standing on it, the farthest first.
    this.fillPoly(
      g,
      WALL.map((p) => beyond(p, 160)),
      PAL.grassDark,
    );
    const trees = TREES.map((t) => ({ t, s: project(cam, t.at) }))
      // Those right by the camera, behind home when it pulls back for a play, would only block the view.
      .filter(({ t, s }) => s.depth > 60 && t.r * s.scale < 24)
      .sort((a, b) => b.s.depth - a.s.depth);
    for (const { t, s } of trees) {
      const r = t.r * s.scale;
      const trunk = project(cam, vec(t.at.x, t.at.y, 0));
      const o = Math.min(1.2, Math.max(0.35, r * 0.08));
      if (r > 3)
        g.rect(s.x - r * 0.12, s.y, r * 0.24, Math.max(0, trunk.y - s.y))
          .fill(PAL.woodDark)
          .stroke({ width: o, color: INK });
      g.circle(s.x, s.y, r).fill(t.color).stroke({ width: o, color: INK });
      if (r > 4)
        g.circle(s.x - r * 0.3, s.y - r * 0.32, r * 0.38).fill({ color: 0xffffff, alpha: 0.16 });
    }

    // The playing surface inside the wall.
    this.fillPoly(g, WALL, PAL.grass);
    // Mowing stripes across the outfield.
    for (let y = 150; y < 420; y += 40) {
      const band = [vec(-400, y), vec(400, y), vec(400, y + 20), vec(-400, y + 20)];
      this.fillPoly(g, clipToFair(band, 6), PAL.grassLight);
    }
    // Warning track.
    const outer: Vec3[] = [];
    const inner: Vec3[] = [];
    for (let a = -45; a <= 45; a += 5) {
      const r = fenceAt(a);
      const s = Math.sin((a * Math.PI) / 180);
      const c = Math.cos((a * Math.PI) / 180);
      outer.push(vec(r * s, r * c));
      inner.push(vec((r - 14) * s, (r - 14) * c));
    }
    this.fillPoly(g, [...outer, ...inner.reverse()], PAL.track);

    // The infield: the dirt arc round the mound, the grass diamond inside it, and the cut-outs.
    this.fillPoly(
      g,
      [vec(0, -2), vec(70, 68), ...arc(0, MOUND, 95, 50, -50, 20), vec(-70, 68)],
      PAL.dirt,
    );
    this.fillPoly(g, [vec(0, 14), vec(51, 64), vec(0, 114), vec(-51, 64)], PAL.grass);
    for (const b of BASES.slice(1)) this.fillPoly(g, circle(b, 9, 12), PAL.dirt);
    this.fillPoly(g, circle(vec(0, 0), 13, 16), PAL.dirt);
    this.fillPoly(g, circle(vec(0, MOUND), 9, 14), PAL.dirtDark);
    this.fillPoly(g, circle(vec(0, MOUND), 7, 14), PAL.dirt);

    // Chalk: foul lines to the poles and the batter's boxes.
    const pole = 330 * Math.SQRT1_2;
    this.strip(g, vec(0, 0), vec(pole, pole), 0.35, PAL.chalk);
    this.strip(g, vec(0, 0), vec(-pole, pole), 0.35, PAL.chalk);
    for (const side of [-1, 1]) {
      const x0 = side * 1.2;
      const x1 = side * 5.2;
      for (const [a, b] of [
        [vec(x0, -3), vec(x0, 3)],
        [vec(x1, -3), vec(x1, 3)],
        [vec(x0, -3), vec(x1, -3)],
        [vec(x0, 3), vec(x1, 3)],
      ] as const)
        this.strip(g, a, b, 0.22, PAL.chalk);
    }
    // Bases, the rubber and home plate, outlined like everything in the park.
    const thin = (p: Vec3): number => Math.min(1.2, Math.max(0.4, project(cam, p).scale * 0.06));
    for (const b of BASES.slice(1)) {
      const s = 0.9;
      this.fillPoly(
        g,
        [
          vec(b.x, b.y - s, 0.2),
          vec(b.x + s, b.y, 0.2),
          vec(b.x, b.y + s, 0.2),
          vec(b.x - s, b.y, 0.2),
        ],
        PAL.chalk,
        thin(b),
      );
    }
    this.fillPoly(
      g,
      [
        vec(-1, MOUND - 0.2, 0.9),
        vec(1, MOUND - 0.2, 0.9),
        vec(1, MOUND + 0.3, 0.9),
        vec(-1, MOUND + 0.3, 0.9),
      ],
      PAL.chalk,
      thin(vec(0, MOUND)),
    );
    this.fillPoly(
      g,
      [vec(-0.71, 0.71), vec(0.71, 0.71), vec(0.71, 0), vec(0, -0.71), vec(-0.71, 0)],
      PAL.chalk,
      thin(vec(0, 0)),
    );

    // The wall itself, with its yellow top and an ink line along it, and the foul poles.
    for (let i = 0; i < WALL.length; i++) {
      const a = WALL[i];
      const b = WALL[(i + 1) % WALL.length];
      this.fillPoly(
        g,
        [
          vec(a.x, a.y, 0),
          vec(b.x, b.y, 0),
          vec(b.x, b.y, FENCE_HEIGHT),
          vec(a.x, a.y, FENCE_HEIGHT),
        ],
        PAL.wall,
      );
      this.fillPoly(
        g,
        [
          vec(a.x, a.y, FENCE_HEIGHT - 0.9),
          vec(b.x, b.y, FENCE_HEIGHT - 0.9),
          vec(b.x, b.y, FENCE_HEIGHT),
          vec(a.x, a.y, FENCE_HEIGHT),
        ],
        PAL.wallTop,
      );
      const top = this.poly([vec(a.x, a.y, FENCE_HEIGHT), vec(b.x, b.y, FENCE_HEIGHT)]);
      if (top.length >= 4)
        g.moveTo(top[0], top[1])
          .lineTo(top[2], top[3])
          .stroke({ width: 0.8, color: INK, cap: 'round' });
    }
    for (const side of [-1, 1]) {
      const pa = project(cam, vec(side * pole, pole, 0));
      const pt = project(cam, vec(side * pole, pole, 45));
      if (pa.depth > NEAR) {
        const w = Math.max(1.2, pa.scale * 1.2);
        g.moveTo(pa.x, pa.y)
          .lineTo(pt.x, pt.y)
          .stroke({ width: w + 1.2, color: INK, cap: 'round' })
          .moveTo(pa.x, pa.y)
          .lineTo(pt.x, pt.y)
          .stroke({ width: w, color: PAL.wallTop, cap: 'round' });
      }
    }
  }

  // Players and the ball.

  /** Queues a player standing at a field position, sized for the camera, at least `MIN_PX` tall. */
  private player(
    at: Vec3,
    name: PoseName,
    kit: Kit,
    id: number,
    opts: { flip?: boolean; back?: boolean; gear?: boolean; minPx?: number } = {},
  ): void {
    const s = project(this.cam, at);
    // Anyone right by the camera, such as the batter setting off as it pulls back, would fill the screen.
    if (s.depth < NEAR + 8) return;
    const h = Math.min(MAX_PX, Math.max(opts.minPx ?? MIN_PX, s.scale * PLAYER_FT));
    let pose: Pose = POSES[name];
    if (opts.flip) pose = mirror(pose);
    if (opts.back) pose = { ...pose, front: false };
    // A soft shadow at his feet sits him on the grass.
    this.belowG.ellipse(s.x, s.y, h * 0.2, h * 0.06).fill({ color: PAL.shadow, alpha: 0.28 });
    this.actors.push({
      depth: s.depth,
      draw: () =>
        drawFigure(this.actorsG, pose, s.x, s.y, h, {
          kit,
          skin: skinFor(id),
          gear: opts.gear,
        }),
    });
  }

  private drawActors(sim: BatOutSim): void {
    const state = sim.state;
    const batting = state ? userBats(state) : true;
    const pitchView = this.cam === PITCHING_CAMERA;
    const fieldKit = batting ? AWAY_KIT : HOME_KIT;
    const batKit = batting ? HOME_KIT : AWAY_KIT;
    const play = this.lastPlay;
    const t = play ? (sim.phase === 'play' ? sim.playTime : play.duration) : 0;
    const batter = state ? state[batting ? 'home' : 'away'].next : 0;
    this.actors.length = 0;

    // Fielders: on their spots, or wherever the play has them. On the mound you are the pitcher, so he isn't drawn.
    for (let f = 0; f < 9; f++) {
      if (pitchView && f > 1) continue;
      const id = 20 + f + (batting ? 0 : 10);
      if (play) {
        const tr = play.fielders[f];
        const p = trackAt(tr, t);
        const q = trackAt(tr, t - 0.08);
        const moving = Math.hypot(p.x - q.x, p.y - q.y) > 0.4;
        const frame = moving ? (Math.floor(t * 8) % 2 ? 'run1' : 'run2') : 'stand';
        const flip =
          moving && project(this.cam, vec(p.x, p.y)).x < project(this.cam, vec(q.x, q.y)).x;
        this.player(vec(p.x, p.y), f === 1 ? (moving ? frame : 'crouch') : frame, fieldKit, id, {
          flip,
          gear: f === 1,
        });
        continue;
      }
      if (f === 0) {
        if (!pitchView) this.pitcher(sim, fieldKit);
      } else if (f === 1) {
        if (pitchView) this.player(vec(0, -3.2), 'crouch', fieldKit, id, { gear: true });
      } else
        this.player(
          FIELDER_SPOTS[f],
          sim.phase === 'pitch' || sim.phase === 'windup' ? 'ready' : 'stand',
          fieldKit,
          id,
        );
    }

    // Runners: on their bases, or running in the play.
    if (play) {
      for (const r of play.runners) {
        if (r.outAt !== null && t > r.outAt + 0.8) continue;
        if (r.scoredAt !== null && t > r.scoredAt + 0.6) continue;
        const p = trackAt(r.track, t);
        const q = trackAt(r.track, t - 0.08);
        const moving = Math.hypot(p.x - q.x, p.y - q.y) > 0.4;
        const flip = project(this.cam, vec(p.x, p.y)).x < project(this.cam, vec(q.x, q.y)).x;
        this.player(
          vec(p.x, p.y),
          moving ? (Math.floor(t * 9) % 2 ? 'run1' : 'run2') : 'stand',
          batKit,
          r.id,
          { flip },
        );
      }
    } else if (state && !pitchView) {
      state.bases.forEach((id, i) => {
        if (id === null) return;
        const b = BASES[i + 1];
        // Leading off towards the next base.
        const next = BASES[(i + 2) % 4];
        const lead = 0.1;
        this.player(
          vec(b.x + (next.x - b.x) * lead, b.y + (next.y - b.y) * lead),
          'ready',
          batKit,
          id,
        );
      });
    }

    // The computer's batter, seen from the mound. Your own batter isn't drawn: you are looking out of his eyes.
    if (!play && pitchView && sim.phase !== 'title' && sim.phase !== 'help')
      this.computerBatter(sim, batKit, batter);

    this.ball(sim);
    this.actors.sort((a, b) => b.depth - a.depth);
    for (const a of this.actors) a.draw();
  }

  private pitcher(sim: BatOutSim, kit: Kit): void {
    let pose: PoseName = 'pitchSet';
    if (sim.phase === 'windup') {
      const total = sim.userBatting ? 0.75 : 0.35;
      pose = sim.time < total * 0.6 ? 'pitchKick' : 'pitchRelease';
    } else if (sim.phase === 'pitch' && sim.time < 0.35) pose = 'pitchRelease';
    this.player(vec(0, MOUND, 0.8), pose, kit, 20, { minPx: 20 });
  }

  private computerBatter(sim: BatOutSim, kit: Kit, id: number): void {
    let pose: PoseName = 'batStance';
    const swing = sim.swing;
    if (swing) {
      const since = (sim.phase === 'pitch' ? sim.time : Infinity) - swing.at;
      pose = since < 0 ? 'batStance' : since < 0.07 ? 'batSwing1' : 'batSwing2';
    }
    if (sim.phase === 'call' && swing) pose = 'batSwing2';
    // From centre field: facing us, on the right of the plate.
    this.player(BATTER, pose, kit, id, { flip: true });
  }

  private ball(sim: BatOutSim): void {
    let p: Vec3 | null = null;
    const play = this.lastPlay;
    if (sim.phase === 'pitch') p = sim.pitchBall();
    else if (play) {
      const t = sim.phase === 'play' ? sim.playTime : play.duration;
      p = ballAt(play.ball, t);
      // Landing marker while it is up.
      if (play.landing && play.flight.land >= 0 && t < play.flight.land / 60) {
        const m = project(this.cam, play.landing);
        if (m.depth > NEAR) {
          const r = Math.max(2.5, m.scale * 3);
          const a = 0.6 + 0.4 * Math.sin(this.clock * 10);
          this.belowG
            .ellipse(m.x, m.y, r, r * 0.5)
            .stroke({ width: 1.2, color: PAL.marker, alpha: a })
            .ellipse(m.x, m.y, r * 0.45, r * 0.22)
            .fill({ color: PAL.marker, alpha: a * 0.8 });
        }
      }
      if (play.flight.homeRun && t > (play.flight.pts.length - 1) / 60) p = null;
    }
    if (!p) return;
    if (sim.phase === 'pitch' && sim.time > (sim.pitch?.seconds ?? 1) * MITT_U) return;
    const s = project(this.cam, p);
    if (s.depth < NEAR) return;
    // Its shadow on the ground shows how high it is.
    const g = project(this.cam, vec(p.x, p.y, 0));
    if (g.depth > NEAR) {
      const r = Math.max(1, g.scale * 0.25 * BALL_SCALE);
      this.belowG.ellipse(g.x, g.y, r, r * 0.5).fill({ color: PAL.shadow, alpha: 0.35 });
    }
    const r = Math.max(1.2, 0.121 * s.scale * BALL_SCALE);
    this.actors.push({ depth: s.depth - 0.5, draw: () => drawBall(this.actorsG, s.x, s.y, r) });
  }

  // Your bat and your pitching hand, the swipe trail, the strike zone and the marks.

  private drawEffects(sim: BatOutSim, view: Bounds): void {
    const g = this.aboveG;
    const live = sim.phase === 'ready' || sim.phase === 'windup' || sim.phase === 'pitch';
    if (live && sim.state) {
      // The strike zone, faint, on the front of the plate.
      const c = [
        vec(ZONE.left, 0, ZONE.bottom),
        vec(ZONE.right, 0, ZONE.bottom),
        vec(ZONE.right, 0, ZONE.top),
        vec(ZONE.left, 0, ZONE.top),
      ];
      const flat = this.poly(c);
      if (flat.length >= 8)
        g.poly(flat).stroke({
          width: 1,
          color: PAL.zone,
          alpha: sim.userBatting ? 0.5 : 0.85,
          join: 'round',
        });
    }
    if (sim.state && this.cam === BATTING_CAMERA && sim.userBatting) {
      this.pitchTarget(sim);
      this.bat(sim);
    }
    if (sim.state && this.cam === PITCHING_CAMERA && sim.phase === 'ready') this.hand(view);

    // The trail behind your finger. Batting, a soft band round it shows how wide the bat is.
    const trail = this.game.trail;
    const band =
      sim.userBatting && this.cam === BATTING_CAMERA
        ? USER_WINDOW.height * 2 * project(BATTING_CAMERA, vec(0, 0, 2.5)).scale
        : 0;
    if (band && trail.length > 1) {
      // One path, so the overlapping strokes don't build up into blobs.
      g.moveTo(trail[0].x, trail[0].y);
      for (const p of trail.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width: band, color: 0xffffff, alpha: 0.16, cap: 'round', join: 'round' });
    }
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1];
      const b = trail[i];
      g.moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width: 2.5, color: 0xffffff, alpha: (i / trail.length) * 0.75, cap: 'round' });
    }
    // OUT and SAFE over the bases as the play goes.
    const play = this.lastPlay;
    if (play && sim.phase === 'play') {
      for (const m of play.marks) {
        if (sim.playTime < m.t || sim.playTime > m.t + 1.4) continue;
        const s = project(this.cam, vec(m.at.x, m.at.y, 9));
        if (s.depth < NEAR) continue;
        const out = m.text === 'OUT';
        this.hudText.take(
          {
            text: m.text,
            size: 13,
            fill: out ? PAL.red : PAL.gold,
            stroke: { color: INK, width: 3 },
            scale: pop((sim.playTime - m.t) / 0.2),
            rotation: -0.06,
          },
          s.x,
          s.y - 4,
          this.res,
        );
      }
    }
  }

  /**
   * Roughly where the pitch is heading, shown on the plate as it is thrown: a ring a little bigger than the ball, a
   * little off from where it will really cross, which you can swipe through.
   */
  private pitchTarget(sim: BatOutSim): void {
    const pitch = sim.pitch;
    if (!pitch || sim.phase !== 'pitch' || sim.swing) return;
    // Off by a set amount for each pitch, so it is a guide rather than the answer.
    const seed = Math.sin(pitch.end.x * 91.7 + pitch.end.z * 47.3 + pitch.mph) * 43758.5;
    const a = (seed - Math.floor(seed)) * Math.PI * 2;
    const off = 0.18;
    const s = project(
      BATTING_CAMERA,
      vec(pitch.end.x + Math.cos(a) * off, 0, pitch.end.z + Math.sin(a) * off),
    );
    const r = TARGET_FT * s.scale;
    const alpha = clamp01(sim.time / 0.25) * (1 - clamp01((sim.time - pitch.seconds) / 0.15));
    if (alpha <= 0) return;
    const g = this.belowG;
    g.circle(s.x, s.y, r)
      .fill({ color: PAL.gold, alpha: 0.22 * alpha })
      .stroke({ width: 1.4, color: PAL.gold, alpha: 0.9 * alpha });
    // Ticks round the ring, like a sight.
    for (let i = 0; i < 4; i++) {
      const t = (i * Math.PI) / 2;
      g.moveTo(s.x + Math.cos(t) * r * 0.7, s.y + Math.sin(t) * r * 0.7)
        .lineTo(s.x + Math.cos(t) * r * 1.2, s.y + Math.sin(t) * r * 1.2)
        .stroke({ width: 1.2, color: PAL.gold, alpha: 0.9 * alpha, cap: 'round' });
    }
  }

  /**
   * Your bat, coming in from the bottom left as you swing: you see it, not yourself. It sweeps level through the
   * zone at the moment of the swing and follows through.
   */
  private bat(sim: BatOutSim): void {
    const swing = sim.swing;
    let angle: number;
    let alpha = 1;
    if (swing) {
      const since = sim.phase === 'pitch' ? sim.time - swing.at : 1;
      if (since < 0) angle = -2.1 + 2.1 * clamp01((since + 0.1) / 0.1);
      else {
        angle = 0.55 * clamp01(since / 0.08);
        alpha = 1 - clamp01((since - 0.25) / 0.2);
      }
    } else if (sim.committed && sim.phase === 'pitch') angle = -1.2;
    else return;
    if (alpha <= 0) return;
    const cam = BATTING_CAMERA;
    // The knob is just off the left of the screen, level with the zone, so the barrel comes through it.
    const hands = project(cam, vec(-3.1, 0.2, 2.5));
    const reach = project(cam, vec(1.3, 0.2, 2.5));
    const len = Math.hypot(reach.x - hands.x, reach.y - hands.y);
    const g = this.aboveG;
    // A swoosh behind the barrel shows the path it came along.
    if (swing && angle > -2) {
      const from = Math.max(-2.1, angle - 1.1);
      g.moveTo(hands.x, hands.y)
        .arc(hands.x, hands.y, len, from, angle)
        .closePath()
        .fill({ color: 0xffffff, alpha: 0.18 * alpha });
    }
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const nx = -dy;
    const ny = dx;
    const knob = len * 0.05;
    const handle = len * 0.03;
    const barrel = len * 0.07;
    const start = -len * 0.08;
    const shape: number[] = [];
    const at = (along: number, half: number): void => {
      shape.push(hands.x + dx * along + nx * half, hands.y + dy * along + ny * half);
    };
    at(start, knob);
    at(len * 0.35, handle);
    at(len * 0.75, barrel);
    at(len, barrel * 0.95);
    at(len, -barrel * 0.95);
    at(len * 0.75, -barrel);
    at(len * 0.35, -handle);
    at(start, -knob);
    g.poly(shape)
      .fill({ color: 0xc9893d, alpha })
      .stroke({ width: 1.4, color: INK, join: 'round', alpha });
    // The grain along the barrel and the tape on the handle.
    g.moveTo(
      hands.x + dx * len * 0.5 + nx * barrel * 0.3,
      hands.y + dy * len * 0.5 + ny * barrel * 0.3,
    )
      .lineTo(
        hands.x + dx * len * 0.95 + nx * barrel * 0.4,
        hands.y + dy * len * 0.95 + ny * barrel * 0.4,
      )
      .stroke({ width: 1, color: 0xe6b06a, alpha, cap: 'round' });
    g.moveTo(hands.x + dx * start, hands.y + dy * start)
      .lineTo(hands.x + dx * len * 0.22, hands.y + dy * len * 0.22)
      .stroke({ width: handle * 2.2, color: INK, alpha: 0.85 * alpha, cap: 'round' });
  }

  /** Your pitching hand: the ball in a glove at the bottom of the screen, or under your finger as you swipe. */
  private hand(view: Bounds): void {
    const g = this.aboveG;
    const trace = this.game.trace;
    const last = trace[trace.length - 1];
    const bottom = Math.min(view.bottom, HEIGHT / 2 + 40);
    if (last) {
      drawBall(g, last.x, last.y, 7);
      return;
    }
    const x = 0;
    const y = bottom - 46;
    g.ellipse(x + 2, y + 5, 15, 12)
      .fill(0x8a5228)
      .stroke({ width: 1.4, color: INK })
      .moveTo(x - 9, y + 2)
      .lineTo(x + 11, y + 2)
      .stroke({ width: 0.9, color: 0x5a3418 });
    drawBall(g, x, y - 2, 7);
  }

  // The scoreboard, the count, the bases and the call.

  private hudLabel(l: Label, x: number, y: number): Text {
    return this.hudText.take(l, x, y, this.res);
  }

  private drawHud(sim: BatOutSim, s: GameState, view: Bounds): void {
    const g = this.hudG;
    const top = Math.max(view.top, -HEIGHT / 2 - 40) + 4;
    const left = Math.max(view.left, -WIDTH / 2 - 30) + 4;
    const game = isGame(s);
    // A park scoreboard: green boards with white figures, the outs and the bases on the right.
    const w = 114;
    const h = 32;
    g.roundRect(left + 1.5, top + 2.5, w, h, 6)
      .fill({ color: 0x000000, alpha: 0.22 })
      .roundRect(left, top, w, h, 6)
      .fill(PAL.greenDark)
      .stroke({ width: 1.4, color: INK })
      .roundRect(left + 2.5, top + 2.5, w - 5, h - 5, 4)
      .stroke({ width: 0.8, color: PAL.green });
    const row1 = top + 10;
    const row2 = top + 22;
    const white = { size: 10, fill: 0xffffff, align: 0, letterSpacing: 0.5 } as const;
    if (game) {
      this.hudLabel({ ...white, text: `CPU ${s.away.runs}`, fill: 0xb9d6ff }, left + 6, row1);
      this.hudLabel({ ...white, text: `YOU ${s.home.runs}`, fill: 0xffb3a8 }, left + 6, row2);
      this.hudLabel(
        { ...white, text: `${s.top ? 'TOP' : 'BOT'} ${s.inning}`, fill: PAL.gold },
        left + 46,
        row1,
      );
    } else if (s.mode === 'hitting') {
      this.hudLabel({ ...white, text: `RUNS ${s.home.runs}`, fill: 0xffb3a8 }, left + 6, row1);
      this.hudLabel(
        { ...white, text: `BEST ${this.game.best.hitting}`, fill: 0xd8e8cf },
        left + 6,
        row2,
      );
    } else {
      this.hudLabel({ ...white, text: `K ${s.strikeouts}`, fill: 0xb9d6ff }, left + 6, row1);
      this.hudLabel({ ...white, text: `RUNS ${s.away.runs}`, fill: 0xd8e8cf }, left + 6, row2);
    }
    this.hudLabel(
      { ...white, text: `${s.balls}-${s.strikes}` },
      left + (game ? 46 : 52),
      game ? row2 : row1,
    );
    // Outs, as two lights.
    for (let i = 0; i < 2; i++)
      g.circle(left + 92 + i * 9, row2, 3)
        .fill(i < s.outs ? PAL.red : 0x24521f)
        .stroke({ width: 0.9, color: INK });
    // The bases diamond.
    const bx = left + 96.5;
    const by = top + 9;
    const sq = (x: number, y: number, on: boolean): void => {
      g.poly([x, y - 3.5, x + 3.5, y, x, y + 3.5, x - 3.5, y])
        .fill(on ? PAL.gold : 0x24521f)
        .stroke({ width: 0.9, color: INK, join: 'round' });
    };
    sq(bx + 6, by + 2, s.bases[0] !== null);
    sq(bx, by - 3, s.bases[1] !== null);
    sq(bx - 6, by + 2, s.bases[2] !== null);

    // The round green pause button, as in Chaos Park.
    const pb = pauseButton(view, 0, 0);
    const pr = pb.w / 2;
    g.circle(pb.x + 0.8, pb.y + 1.5, pr)
      .fill({ color: 0x000000, alpha: 0.2 })
      .circle(pb.x, pb.y, pr)
      .fill({ color: PAL.green, alpha: 0.95 })
      .stroke({ width: 1.3, color: 0xffffff, alpha: 0.9 })
      .roundRect(pb.x - 4, pb.y - 5, 3, 10, 1)
      .roundRect(pb.x + 1, pb.y - 5, 3, 10, 1)
      .fill(0xffffff);

    const bottom = Math.min(view.bottom, HEIGHT / 2 + 40);
    const caption = {
      size: 12,
      fill: 0xffffff,
      stroke: { color: INK, width: 3.5 },
      letterSpacing: 0.5,
    };
    // What was thrown.
    if (sim.pitchLabel && (sim.phase === 'pitch' || sim.phase === 'call') && !sim.play)
      this.hudLabel({ ...caption, text: sim.pitchLabel }, 0, bottom - 12);
    // A hint before each pitch.
    if (sim.phase === 'ready') {
      const blink = Math.floor(this.clock * 2) % 2 === 0;
      const hint = sim.userBatting ? 'SWIPE THROUGH THE BALL' : 'SWIPE UP TO PITCH';
      if (blink || !sim.userBatting)
        this.hudLabel({ ...caption, text: hint, fill: PAL.gold }, 0, bottom - 12);
      if (!sim.userBatting && !this.game.trace.length) {
        // An arrow from your hand up to the zone.
        const y0 = bottom - 66;
        const y1 = -20;
        const a = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(this.clock * 5));
        g.moveTo(0, y0)
          .lineTo(0, y1 + 4)
          .stroke({ width: 2.5, color: PAL.gold, alpha: a, cap: 'round' })
          .poly([-5, y1 + 7, 0, y1, 5, y1 + 7])
          .fill({ color: PAL.gold, alpha: a });
      }
    }
    // The call, popping onto the screen with a tilt, as Chaos Park's signs do.
    const an = sim.announcement;
    if (sim.phase === 'call' && an) {
      const k = pop(sim.time / 0.22);
      const y = -40;
      const t = this.hudLabel(
        {
          text: an.text,
          size: an.big ? 34 : 26,
          fill: an.big ? PAL.gold : 0xffffff,
          stroke: { color: INK, width: an.big ? 6 : 5 },
          rotation: -0.06,
          letterSpacing: 1,
        },
        0,
        y,
      );
      const fit = Math.min(1, (WIDTH - 10) / Math.max(1, t.width));
      t.scale.set(k * fit);
      if (an.sub)
        this.hudLabel(
          {
            text: an.sub,
            size: 13,
            fill: 0xffffff,
            stroke: { color: INK, width: 3.5 },
            rotation: -0.06,
            alpha: clamp01(sim.time / 0.2),
          },
          0,
          y + (an.big ? 26 : 22),
        );
    }
  }

  // Menus and cards: park noticeboards with sign plaques, as Chaos Park's are.

  private cardLabel(l: Label, x: number, y: number): Text {
    return this.cardText.take(l, x, y, this.res);
  }

  private dim(view: Bounds, alpha = 0.25): void {
    this.cardG
      .rect(view.left, view.top, view.right - view.left, view.bottom - view.top)
      .fill({ color: 0x1d2b14, alpha });
  }

  /** A wooden frame round a cream panel, with a brass screw in each corner. */
  private board(x: number, y: number, w: number, h: number): void {
    const g = this.cardG;
    const rim = 9;
    g.roundRect(x + 3, y + 5, w, h, 9)
      .fill({ color: 0x000000, alpha: 0.25 })
      .roundRect(x, y, w, h, 9)
      .fill(PAL.wood);
    for (let ly = y + 3.5; ly < y + h - 2; ly += 4) g.moveTo(x + 3, ly).lineTo(x + w - 3, ly);
    g.stroke({ width: 0.6, color: PAL.woodDark, alpha: 0.28 });
    g.roundRect(x, y, w, h, 9).stroke({ width: 1.5, color: INK });
    g.roundRect(x + rim, y + rim, w - rim * 2, h - rim * 2, 5)
      .fill(PAL.cream)
      .stroke({ width: 1.25, color: PAL.woodDark });
    for (const [sx, sy] of [
      [x + rim / 2, y + rim / 2],
      [x + w - rim / 2, y + rim / 2],
      [x + rim / 2, y + h - rim / 2],
      [x + w - rim / 2, y + h - rim / 2],
    ] as const) {
      g.circle(sx, sy, 2.2).fill(PAL.brass).stroke({ width: 0.75, color: PAL.woodDark });
      g.moveTo(sx - 1.3, sy - 0.7)
        .lineTo(sx + 1.3, sy + 0.7)
        .stroke({ width: 0.7, color: PAL.woodDark });
    }
  }

  /** A sign plaque: green for the main actions, plain wood for the others. */
  private plaque(b: Button, color: 'green' | 'wood'): void {
    const g = this.cardG;
    const [main, dark] =
      color === 'green' ? [PAL.green, PAL.greenDark] : [PAL.plank, PAL.plankDark];
    const rx = b.w / 2;
    const ry = b.h / 2;
    const r = Math.min(ry * 0.5, 8);
    const x = b.x;
    const y = b.y;
    g.roundRect(x - rx + 1.5, y - ry + 3, rx * 2, ry * 2, r)
      .fill({ color: 0x000000, alpha: 0.2 })
      .roundRect(x - rx, y - ry, rx * 2, ry * 2, r)
      .fill(dark)
      .roundRect(x - rx + 1.5, y - ry + 1, rx * 2 - 3, ry * 2 - 4, Math.max(1, r - 1))
      .fill(main)
      .roundRect(x - rx + 5, y - ry + 3, rx * 2 - 10, ry * 0.35, Math.max(1, r * 0.5))
      .fill({ color: 0xffffff, alpha: 0.18 })
      .roundRect(x - rx, y - ry, rx * 2, ry * 2, r)
      .stroke({ width: 1.5, color: INK });
    // Nails holding the plaque up, one at each end.
    for (const nx of [x - rx + 4.5, x + rx - 4.5]) g.circle(nx, y - 1, 1.3).fill(PAL.brass);
    this.cardLabel(
      {
        text: b.label,
        size: b.h * 0.62,
        fill: 0xffffff,
        stroke: { color: dark, width: 2.5 },
        letterSpacing: 0.5,
      },
      x,
      y - 1,
    );
  }

  private drawCards(sim: BatOutSim, view: Bounds): void {
    switch (sim.phase) {
      case 'title':
        this.dim(view, 0.15);
        this.title();
        return;
      case 'help':
        this.dim(view);
        this.help();
        return;
      case 'scorecard': {
        this.dim(view);
        const s = sim.state!;
        const w = tableWidth(s) + 26;
        this.board(-w / 2, -96, w, 160);
        const title = s.top
          ? `MIDDLE OF THE ${ordinal(s.inning)}`
          : `END OF THE ${ordinal(s.inning)}`;
        this.cardLabel({ text: title, size: 15, fill: INK, letterSpacing: 0.5 }, 0, -74);
        this.scorecard(s, -52);
        this.cardLabel(
          {
            text: s.top ? 'YOU BAT NEXT' : 'YOU PITCH NEXT',
            size: 12,
            fill: PAL.woodDark,
            letterSpacing: 0.5,
          },
          0,
          4,
        );
        this.plaque(CONTINUE_BUTTON, 'green');
        return;
      }
      case 'over':
        this.dim(view);
        this.gameOver(sim);
        this.plaque(AGAIN_BUTTON, 'green');
        this.plaque(MENU_BUTTON, 'wood');
        return;
      default:
        break;
    }
    if (sim.paused) {
      this.dim(view, 0.35);
      this.board(-64, -54, 128, 100);
      this.cardLabel({ text: 'TIME OUT', size: 22, fill: INK, letterSpacing: 1 }, 0, -32);
      this.plaque(RESUME_BUTTON, 'green');
      this.plaque(QUIT_BUTTON, 'wood');
    }
  }

  /** The script logo, green with a white edge and an ink one outside that, as Chaos Park's is. */
  private logo(text: string, y: number, size: number, fill: number): void {
    this.cardLabel(
      { text, size, fill: INK, font: SCRIPT_FONT, stroke: { color: INK, width: size * 0.36 } },
      0.6,
      y + 1.5,
    );
    this.cardLabel(
      { text, size, fill, font: SCRIPT_FONT, stroke: { color: 0xffffff, width: size * 0.2 } },
      0,
      y,
    );
  }

  private title(): void {
    this.board(-86, -150, 172, 268);
    this.logo('Bat Out!', -116, 27, PAL.green);
    drawBall(this.cardG, -64, -96, 5);
    drawBall(this.cardG, 66, -132, 6);
    this.cardLabel(
      { text: '~ ARCADE BASEBALL ~', size: 11, fill: PAL.blue, letterSpacing: 1 },
      0,
      -82,
    );
    MODE_BUTTONS.forEach((b) => this.plaque(b, 'green'));
    this.cardLabel(
      {
        text: `BEST: ${this.game.best.hitting} RUNS  ·  ${this.game.best.pitching} K`,
        size: 9.5,
        fill: PAL.woodDark,
        letterSpacing: 0.5,
      },
      0,
      70,
    );
    this.plaque(HELP_BUTTON, 'wood');
  }

  private help(): void {
    this.board(-88, -154, 176, 308);
    this.cardLabel(
      {
        text: 'HOW TO PLAY',
        size: 22,
        fill: PAL.red,
        stroke: { color: INK, width: 3.5 },
        letterSpacing: 0.5,
      },
      0,
      -132,
    );
    const lines: [string, number?][] = [
      ['HITTING', PAL.greenDark],
      ['THE GOLD RING SHOWS ABOUT WHERE THE'],
      ['PITCH IS COMING. SWIPE THROUGH THE'],
      ['BALL AS IT REACHES THE PLATE. UNDER'],
      ['IT LIFTS IT, OVER IT HITS A GROUNDER.'],
      ['EARLY PULLS IT TO LEFT, LATE GOES TO'],
      ['RIGHT. A HARD SWIPE HITS HARDER.'],
      ["DON'T SWIPE: THE UMP CALLS IT."],
      [''],
      ['PITCHING', PAL.greenDark],
      ['SWIPE UP AND LET GO WHERE YOU WANT'],
      ['IT. SWIPE FAST TO THROW HARD.'],
      ['STRAIGHT: FASTBALL'],
      ['SLOW AND STRAIGHT: CHANGEUP'],
      ['HOOK THE END: SLIDER'],
      ['HOOK IT MORE: CURVEBALL'],
      ['FLICK BACK DOWN: SINKER'],
      ['STOP, THEN LET GO: KNUCKLEBALL'],
      [''],
      ['THREE OUTS RETIRE THE SIDE.', PAL.woodDark],
    ];
    lines.forEach(([line, color], i) => {
      if (!line) return;
      this.cardLabel(
        {
          text: line,
          size: color ? 12 : 9.5,
          fill: color ?? INK,
          align: 0,
          letterSpacing: 0.3,
        },
        -74,
        -108 + i * 10.6,
      );
    });
    this.plaque(BACK_BUTTON, 'green');
  }

  /** The line score: runs by inning for both sides, with runs and hits, its header row at `y0`. */
  private scorecard(s: GameState, y0: number): void {
    const { first, cols } = tableColumns(s);
    const w = tableWidth(s);
    const x = -w / 2;
    const head = { size: 10, fill: PAL.woodDark } as const;
    for (let i = 0; i < cols; i++)
      this.cardLabel(
        { ...head, text: `${first + i + 1}` },
        x + NAME_W + i * CELL_W + CELL_W / 2,
        y0,
      );
    this.cardLabel({ ...head, text: 'R' }, x + NAME_W + cols * CELL_W + 7, y0);
    this.cardLabel({ ...head, text: 'H' }, x + NAME_W + cols * CELL_W + 21, y0);
    const rows: ['CPU' | 'YOU', GameState['away'], number][] = [
      ['CPU', s.away, PAL.blue],
      ['YOU', s.home, PAL.red],
    ];
    rows.forEach(([name, t, color], r) => {
      const y = y0 + 15 + r * 15;
      this.cardG.roundRect(x - 2, y - 6.5, w + 4, 13, 3).fill({ color: r ? 0xeadfbf : 0xf0e6c9 });
      this.cardLabel({ size: 11, fill: color, text: name, align: 0 }, x + 2, y);
      for (let i = 0; i < cols; i++) {
        const v = t.line[first + i];
        // An inning not reached is blank; the bottom of a last inning not needed is an X.
        const text =
          v === undefined
            ? name === 'YOU' && s.over && first + i + 1 >= s.innings && s.top
              ? 'X'
              : ''
            : `${v}`;
        if (text)
          this.cardLabel({ size: 11, fill: INK, text }, x + NAME_W + i * CELL_W + CELL_W / 2, y);
      }
      this.cardLabel(
        { size: 11, fill: color, text: `${t.runs}` },
        x + NAME_W + cols * CELL_W + 7,
        y,
      );
      this.cardLabel(
        { size: 11, fill: INK, text: `${t.hits}` },
        x + NAME_W + cols * CELL_W + 21,
        y,
      );
    });
  }

  private gameOver(sim: BatOutSim): void {
    const s = sim.state!;
    if (isGame(s)) {
      const w = Math.max(150, tableWidth(s) + 26);
      this.board(-w / 2, -110, w, 222);
      const win = outcome(s) === 'win';
      this.logo(win ? 'You win!' : 'You lose', -78, 28, win ? PAL.green : PAL.red);
      this.cardLabel({ text: 'FINAL', size: 13, fill: PAL.woodDark, letterSpacing: 1 }, 0, -40);
      this.scorecard(s, -16);
      return;
    }
    this.board(-84, -134, 168, 246);
    this.logo('Side retired!', -104, 22, PAL.green);
    const name = MODES.find((m) => m.id === s.mode)!.name;
    this.cardLabel({ text: name, size: 12, fill: PAL.woodDark, letterSpacing: 0.5 }, 0, -76);
    const hitting = s.mode === 'hitting';
    this.cardLabel(
      { text: hitting ? 'RUNS SCORED' : 'STRIKEOUTS', size: 15, fill: INK, letterSpacing: 0.5 },
      0,
      -54,
    );
    this.cardLabel(
      {
        text: `${hitting ? s.home.runs : s.strikeouts}`,
        size: 44,
        fill: PAL.red,
        stroke: { color: INK, width: 4 },
        rotation: -0.06,
      },
      0,
      -20,
    );
    const detail = hitting
      ? `HITS ${s.home.hits}`
      : `RUNS ALLOWED ${s.away.runs}  ·  HITS ${s.away.hits}`;
    this.cardLabel({ text: detail, size: 11, fill: INK, letterSpacing: 0.5 }, 0, 10);
    const best = hitting ? this.game.best.hitting : this.game.best.pitching;
    this.cardLabel(
      { text: `YOUR BEST  ${best}`, size: 11, fill: PAL.woodDark, letterSpacing: 0.5 },
      0,
      26,
    );
    if (this.game.result?.isNewBest)
      this.cardLabel(
        {
          text: 'NEW RECORD!',
          size: 13,
          fill: PAL.gold,
          stroke: { color: INK, width: 3 },
          rotation: -0.06,
        },
        0,
        42,
      );
  }
}

/** Line score columns: the name, then up to nine innings, then runs and hits. */
const NAME_W = 26;
const CELL_W = 10;
const tableColumns = (s: GameState): { first: number; cols: number } => {
  const innings = Math.max(s.innings, s.away.line.length, s.home.line.length);
  return { first: Math.max(0, innings - 9), cols: Math.min(9, innings) };
};
const tableWidth = (s: GameState): number => NAME_W + tableColumns(s).cols * CELL_W + 28;

const ordinal = (n: number): string =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH')}`;

/** Keeps the part of a ground polygon that lies in fair territory, short of the warning track (`inset` ft). */
const clipToFair = (pts: Vec3[], inset: number): Vec3[] => {
  const planes: ((p: Vec3) => number)[] = [(p) => p.y - p.x, (p) => p.y + p.x];
  let out = pts;
  for (const f of planes) {
    const next: Vec3[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      const b = out[(i + 1) % out.length];
      const fa = f(a);
      const fb = f(b);
      if (fa >= 0) next.push(a);
      if (fa >= 0 !== fb >= 0) {
        const t = fa / (fa - fb);
        next.push(vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
      }
    }
    out = next;
  }
  // Pull points beyond the track back to it.
  return out.map((p) => {
    const r = Math.hypot(p.x, p.y);
    const max = fenceAt((Math.atan2(p.x, p.y) * 180) / Math.PI) - 14 - inset;
    return r > max ? vec((p.x / r) * max, (p.y / r) * max) : p;
  });
};
