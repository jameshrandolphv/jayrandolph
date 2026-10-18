import { Container, Graphics, RenderTexture, Sprite, Texture, type Application } from 'pixi.js';
import type { LogicalSize } from '../../games/game-canvas';
import { renderText, textWidth } from '../../games/pixel-font';
import type { Pixels } from '../../games/pixels';
import {
  AWAY_KIT,
  HOME_KIT,
  PAL,
  POSES,
  ballPixels,
  figure,
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

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const ease = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

const texture = (pixels: Pixels): Texture => {
  const tex = Texture.from(pixels.toCanvas());
  tex.source.scaleMode = 'nearest';
  return tex;
};

/** Sprites handed out afresh each frame and hidden when not used, so drawing reads top to bottom. */
class SpritePool {
  private readonly sprites: Sprite[] = [];
  private used = 0;
  constructor(private readonly layer: Container) {}

  begin(): void {
    this.used = 0;
  }

  take(tex: Texture): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite(tex);
      this.sprites.push(s);
      this.layer.addChild(s);
    }
    this.used++;
    s.texture = tex;
    s.visible = true;
    s.alpha = 1;
    s.scale.set(1);
    s.anchor.set(0);
    s.zIndex = 0;
    return s;
  }

  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }
}

interface TextOpts {
  scale?: number;
  fill?: string | readonly [string, string];
  outline?: string | null;
  /** 0 left, 0.5 centre, 1 right. */
  align?: number;
  alpha?: number;
}

/** Figure texture heights (px); a figure is drawn from the nearest one and scaled the rest of the way. */
const SIZES = [10, 14, 20, 28, 40, 60, 90, 130] as const;
/** Players are drawn this tall (ft) when the camera is close enough; far off they never shrink below `MIN_PX`. */
const PLAYER_FT = 6.2;
const MIN_PX = 11;
/** The ball is drawn larger than life so it is easy to follow. */
const BALL_SCALE = 1.7;
const NEAR = 1;

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

export class BatOutView {
  private readonly scene = new Container();
  private readonly fieldG = new Graphics();
  private readonly belowG = new Graphics();
  private readonly actors = new Container();
  private readonly aboveG = new Graphics();
  private readonly hud = new Container();
  private readonly hudG = new Graphics();
  private readonly cardG = new Graphics();
  private readonly cards = new Container();
  private readonly actorPool: SpritePool;
  private readonly hudText: SpritePool;
  private readonly cardText: SpritePool;
  private readonly display: Sprite;
  private rt: RenderTexture;
  private readonly textCache = new Map<string, Texture>();
  private readonly figCache = new Map<
    string,
    { tex: Texture; fx: number; fy: number; h: number }
  >();
  private readonly ballTex = [1, 1.5, 2, 3, 4, 5].map((r) => ({ r, tex: texture(ballPixels(r)) }));
  private cam: Camera = BATTING_CAMERA;
  private playTarget = vec(0, 60);
  private clock = 0;
  private lastPlay: Play | null = null;

  constructor(
    private readonly app: Application,
    root: Container,
    private readonly game: BatOutGame,
  ) {
    this.actors.sortableChildren = true;
    this.scene.addChild(
      this.fieldG,
      this.belowG,
      this.actors,
      this.aboveG,
      this.hudG,
      this.hud,
      this.cardG,
      this.cards,
    );
    this.actorPool = new SpritePool(this.actors);
    this.hudText = new SpritePool(this.hud);
    this.cardText = new SpritePool(this.cards);
    this.rt = RenderTexture.create({
      width: WIDTH,
      height: HEIGHT,
      resolution: 1,
      scaleMode: 'nearest',
    });
    this.display = new Sprite(this.rt);
    root.addChild(this.display);
  }

  update(alpha: number, deltaMs: number, bounds: Bounds, size: LogicalSize): void {
    void alpha;
    this.clock += deltaMs / 1000;
    const w = Math.max(1, Math.ceil(bounds.right - bounds.left));
    const h = Math.max(1, Math.ceil(bounds.bottom - bounds.top));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.resize(w, h);
    this.display.texture = this.rt;
    this.display.position.set(bounds.left, bounds.top);
    // Drawn about the middle of the logical screen.
    this.scene.position.set(size.width / 2 - bounds.left, size.height / 2 - bounds.top);
    const view = {
      left: bounds.left - size.width / 2,
      right: bounds.right - size.width / 2,
      top: bounds.top - size.height / 2,
      bottom: bounds.bottom - size.height / 2,
    };

    const { sim } = this.game;
    this.cam = this.chooseCamera(sim, deltaMs / 1000);
    for (const g of [this.fieldG, this.belowG, this.aboveG, this.hudG, this.cardG]) g.clear();
    this.actorPool.begin();
    this.hudText.begin();
    this.cardText.begin();

    this.drawField(view);
    this.drawActors(sim);
    this.drawEffects(sim);
    if (sim.state && sim.phase !== 'title' && sim.phase !== 'help')
      this.drawHud(sim, sim.state, view);
    this.drawCards(sim, view);

    this.actorPool.end();
    this.hudText.end();
    this.cardText.end();
    this.app.renderer.render({ container: this.scene, target: this.rt, clear: true });
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

  private fillPoly(g: Graphics, pts: readonly Vec3[], color: number, alpha = 1): void {
    const flat = this.poly(pts);
    if (flat.length >= 6) g.poly(flat).fill({ color, alpha });
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
    g.rect(view.left, horizon - 30, view.right - view.left, 30).fill(PAL.skyLow);
    // Clouds drift slowly.
    for (let i = 0; i < 4; i++) {
      const cx = view.left + ((i * 61 + this.clock * 3) % (view.right - view.left + 60)) - 30;
      const cy = horizon - 50 - ((i * 37) % 40);
      g.ellipse(cx, cy, 14, 4)
        .fill(PAL.cloud)
        .ellipse(cx + 8, cy - 3, 8, 4)
        .fill(PAL.cloud);
    }

    // Stands behind the wall, rising away from the field, with the crowd in them.
    const rise = (p: Vec3, out: number, z: number): Vec3 => {
      const r = Math.hypot(p.x, p.y - 30) || 1;
      return vec(p.x + (p.x / r) * out, p.y + ((p.y - 30) / r) * out, z);
    };
    for (let i = 0; i < WALL.length; i++) {
      const a = WALL[i];
      const b = WALL[(i + 1) % WALL.length];
      const quad = [
        rise(a, 2, FENCE_HEIGHT),
        rise(b, 2, FENCE_HEIGHT),
        rise(b, 90, 60),
        rise(a, 90, 60),
      ];
      this.fillPoly(g, quad, i % 2 ? PAL.stands : PAL.standsDark);
    }
    // Crowd: a speckle of heads.
    for (let i = 0; i < WALL.length; i++) {
      const a = WALL[i];
      const b = WALL[(i + 1) % WALL.length];
      for (let k = 0; k < 6; k++) {
        const f = (k + 0.5) / 6;
        const row = 1 + ((i * 7 + k * 3) % 5);
        const p = rise(
          vec(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f),
          6 + row * 14,
          FENCE_HEIGHT + row * 9,
        );
        const s = project(cam, p);
        if (s.depth < NEAR) continue;
        const r = Math.max(0.8, s.scale * 2.2);
        g.rect(s.x - r / 2, s.y - r, r, r).fill(PAL.crowd[(i + k) % PAL.crowd.length]);
      }
    }

    // The playing surface inside the wall.
    this.fillPoly(g, WALL, PAL.grass);
    // Mowing stripes across the outfield.
    for (let y = 150; y < 420; y += 40) {
      const band = [vec(-400, y), vec(400, y), vec(400, y + 20), vec(-400, y + 20)];
      this.fillPoly(g, clipToFair(band, 6), PAL.grassDark);
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
    // Bases, the rubber and home plate.
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
    );
    this.fillPoly(
      g,
      [vec(-0.71, 0.71), vec(0.71, 0.71), vec(0.71, 0), vec(0, -0.71), vec(-0.71, 0)],
      PAL.chalk,
    );

    // The wall itself, with its yellow top, and the foul poles.
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
          vec(a.x, a.y, FENCE_HEIGHT - 0.8),
          vec(b.x, b.y, FENCE_HEIGHT - 0.8),
          vec(b.x, b.y, FENCE_HEIGHT),
          vec(a.x, a.y, FENCE_HEIGHT),
        ],
        PAL.wallTop,
      );
    }
    for (const side of [-1, 1]) {
      const a = vec(side * pole, pole, 0);
      const top = vec(side * pole, pole, 45);
      const pa = project(cam, a);
      const pt = project(cam, top);
      if (pa.depth > NEAR)
        g.moveTo(pa.x, pa.y)
          .lineTo(pt.x, pt.y)
          .stroke({ width: Math.max(1, pa.scale * 1.2), color: PAL.wallTop });
    }
  }

  // Players and the ball.

  private figureTex(pose: Pose, poseKey: string, h: number, kit: Kit, skin: string, gear = false) {
    const key = `${poseKey}|${h}|${kit.jersey}|${skin}|${gear}`;
    let f = this.figCache.get(key);
    if (!f) {
      const fig = figure(pose, h, { kit, skin, gear });
      f = { tex: texture(fig.pixels), fx: fig.footX, fy: fig.footY, h };
      this.figCache.set(key, f);
    }
    return f;
  }

  /** Draws a player standing at a field position, sized for the camera, at least `MIN_PX` tall. */
  private player(
    at: Vec3,
    name: PoseName,
    kit: Kit,
    id: number,
    opts: {
      flip?: boolean;
      back?: boolean;
      gear?: boolean;
      px?: number;
      minPx?: number;
      alpha?: number;
    } = {},
  ): void {
    const s = project(this.cam, at);
    if (s.depth < NEAR + 2) return;
    const want = opts.px ?? Math.max(opts.minPx ?? MIN_PX, s.scale * PLAYER_FT);
    const h = SIZES.find((z) => z >= want * 0.85) ?? SIZES[SIZES.length - 1];
    let pose: Pose = POSES[name];
    if (opts.flip) pose = mirror(pose);
    if (opts.back) pose = { ...pose, front: false };
    const f = this.figureTex(
      pose,
      `${name}${opts.flip ? 'f' : ''}${opts.back ? 'b' : ''}`,
      h,
      kit,
      skinFor(id),
      opts.gear,
    );
    const sp = this.actorPool.take(f.tex);
    const k = want / h;
    sp.scale.set(k);
    sp.position.set(Math.round(s.x - f.fx * k), Math.round(s.y - f.fy * k));
    sp.zIndex = -s.depth;
    if (opts.alpha !== undefined) sp.alpha = opts.alpha;
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

    // Fielders: on their spots, or wherever the play has them.
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
      if (f === 0) this.pitcher(sim, fieldKit, pitchView);
      else if (f === 1) {
        if (pitchView) {
          this.player(vec(0, -3.2), 'crouch', fieldKit, id, { gear: true });
        }
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

    // The batter at the plate.
    if (!play && sim.phase !== 'title' && sim.phase !== 'help')
      this.batterAtPlate(sim, batKit, batter, pitchView);
    else if (!play) this.batterAtPlate(sim, HOME_KIT, 0, false);

    this.ball(sim);
  }

  private pitcher(sim: BatOutSim, kit: Kit, pitchView: boolean): void {
    let pose: PoseName = 'pitchSet';
    if (sim.phase === 'windup') {
      const total = sim.userBatting ? 0.75 : 0.35;
      pose = sim.time < total * 0.6 ? 'pitchKick' : 'pitchRelease';
    } else if (sim.phase === 'pitch' && sim.time < 0.35) pose = 'pitchRelease';
    if (pitchView) {
      // From centre field we see his back, big in the foreground.
      this.player(vec(0, MOUND + 0.5, 0.8), pose, kit, 30, { back: true, flip: true });
    } else this.player(vec(0, MOUND, 0.8), pose, kit, 20, { minPx: 20 });
  }

  private batterAtPlate(sim: BatOutSim, kit: Kit, id: number, pitchView: boolean): void {
    let pose: PoseName = 'batStance';
    const swing = sim.swing;
    if (swing) {
      const since = (sim.phase === 'pitch' ? sim.time : Infinity) - swing.at;
      pose = since < 0 ? 'batStance' : since < 0.07 ? 'batSwing1' : 'batSwing2';
    } else if (sim.committed) pose = 'batSwing1';
    if (sim.phase === 'call' && swing) pose = 'batSwing2';
    if (pitchView) {
      // From centre field: facing us, on the right of the plate.
      this.player(BATTER, pose, kit, id, { flip: true, back: false });
      return;
    }
    // Behind him: drawn a little smaller than life so the zone stays clear, his feet at the bottom left.
    const s = project(this.cam, BATTER);
    const h = 130;
    const pz: Pose = POSES[pose];
    const f = this.figureTex(pz, pose, h, kit, skinFor(id));
    const sp = this.actorPool.take(f.tex);
    sp.position.set(Math.round(s.x + 4 - f.fx), Math.round(s.y + 6 - f.fy));
    sp.zIndex = 1000;
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
          const r = Math.max(2, m.scale * 3);
          this.belowG.ellipse(m.x, m.y, r, r * 0.5).stroke({ width: 1, color: PAL.marker });
          this.belowG
            .moveTo(m.x - r * 0.6, m.y)
            .lineTo(m.x + r * 0.6, m.y)
            .stroke({ width: 1, color: PAL.marker });
        }
      }
      if (play.flight.homeRun && t > (play.flight.pts.length - 1) / 60) p = null;
    } else if (sim.phase === 'windup' || sim.phase === 'ready') p = null;
    if (!p) return;
    const s = project(this.cam, p);
    if (s.depth < NEAR) return;
    // Its shadow on the ground shows how high it is.
    const g = project(this.cam, vec(p.x, p.y, 0));
    if (g.depth > NEAR) {
      const r = Math.max(1, g.scale * 0.25 * BALL_SCALE);
      this.belowG.ellipse(g.x, g.y, r, r * 0.5).fill({ color: PAL.shadow, alpha: 0.45 });
    }
    const r = Math.max(1, 0.121 * s.scale * BALL_SCALE);
    const pick = this.ballTex.reduce((a, b) => (Math.abs(b.r - r) < Math.abs(a.r - r) ? b : a));
    const sp = this.actorPool.take(pick.tex);
    sp.anchor.set(0.5);
    sp.scale.set(Math.max(0.6, r / pick.r));
    sp.position.set(Math.round(s.x), Math.round(s.y));
    sp.zIndex = -s.depth + 0.5;
    if (sim.phase === 'pitch' && sim.time > (sim.pitch?.seconds ?? 1) * MITT_U) sp.visible = false;
  }

  // Swipe trail, the strike zone, marks and the hint.

  private drawEffects(sim: BatOutSim): void {
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
        g.poly(flat).stroke({ width: 1, color: PAL.zone, alpha: sim.userBatting ? 0.55 : 0.9 });
    }
    // The trail behind your finger.
    const trail = this.game.trail;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1];
      const b = trail[i];
      g.moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width: 2, color: 0xffffff, alpha: (i / trail.length) * 0.8 });
    }
    // OUT and SAFE over the bases as the play goes.
    const play = this.lastPlay;
    if (play && sim.phase === 'play') {
      for (const m of play.marks) {
        if (sim.playTime < m.t || sim.playTime > m.t + 1.4) continue;
        const s = project(this.cam, vec(m.at.x, m.at.y, 9));
        if (s.depth < NEAR) continue;
        this.text(this.hudText, m.text, s.x, s.y - 6, {
          fill: m.text === 'OUT' ? '#ff4a3d' : '#ffe94a',
          align: 0.5,
        });
      }
    }
  }

  // Text.

  private textTex(
    text: string,
    scale: number,
    fill: string | readonly [string, string],
    outline: string | null,
  ): Texture {
    const key = `${text}|${scale}|${fill}|${outline}`;
    let tex = this.textCache.get(key);
    if (!tex) {
      tex = texture(renderText(text, { fill, scale, outlines: outline ? [outline] : [] }));
      this.textCache.set(key, tex);
    }
    return tex;
  }

  private text(
    pool: SpritePool,
    text: string,
    x: number,
    y: number,
    o: TextOpts = {},
  ): Sprite | null {
    if (!text) return null;
    const scale = o.scale ?? 1;
    const tex = this.textTex(
      text,
      scale,
      o.fill ?? '#ffffff',
      o.outline === undefined ? hex(PAL.ink) : o.outline,
    );
    const sp = pool.take(tex);
    sp.position.set(Math.round(x - tex.width * (o.align ?? 0)), Math.round(y));
    if (o.alpha !== undefined) sp.alpha = o.alpha;
    return sp;
  }

  // The scoreboard bug, the count, the bases and the call.

  private drawHud(sim: BatOutSim, s: GameState, view: Bounds): void {
    const g = this.hudG;
    const top = Math.max(view.top, -HEIGHT / 2 - 40) + 3;
    const left = Math.max(view.left, -WIDTH / 2 - 30) + 3;
    const game = isGame(s);
    // Score panel: the score (or this mode's numbers), the inning and count, the bases and outs.
    g.roundRect(left, top, 108, 27, 3).fill(PAL.ink);
    const row1 = top + 4;
    const row2 = top + 16;
    if (game) {
      this.text(this.hudText, `CPU ${s.away.runs}`, left + 4, row1, {
        fill: '#9cc4ff',
        outline: null,
      });
      this.text(this.hudText, `YOU ${s.home.runs}`, left + 4, row2, {
        fill: '#ff8a80',
        outline: null,
      });
      this.text(this.hudText, `${s.top ? 'TOP' : 'BOT'} ${s.inning}`, left + 50, row1, {
        fill: '#ffe94a',
        outline: null,
      });
    } else if (s.mode === 'hitting') {
      this.text(this.hudText, `RUNS ${s.home.runs}`, left + 4, row1, {
        fill: '#ff8a80',
        outline: null,
      });
      this.text(this.hudText, `BEST ${this.game.best.hitting}`, left + 4, row2, {
        fill: '#c8c8d8',
        outline: null,
      });
    } else {
      this.text(this.hudText, `K ${s.strikeouts}`, left + 4, row1, {
        fill: '#9cc4ff',
        outline: null,
      });
      this.text(this.hudText, `RUNS ${s.away.runs}`, left + 4, row2, {
        fill: '#c8c8d8',
        outline: null,
      });
    }
    this.text(
      this.hudText,
      `${s.balls}-${s.strikes}`,
      left + (game ? 50 : 56),
      game ? row2 : row1,
      { fill: '#ffffff', outline: null },
    );
    // Outs, as two lights.
    for (let i = 0; i < 2; i++)
      g.circle(left + 91 + i * 8, row2 + 3.5, 2.5).fill(i < s.outs ? 0xff4a3d : 0x4a4a5a);
    // The bases diamond.
    const bx = left + 95;
    const by = top + 8;
    const sq = (x: number, y: number, on: boolean): void => {
      g.poly([x, y - 3, x + 3, y, x, y + 3, x - 3, y]).fill(on ? 0xffe94a : 0x4a4a5a);
    };
    sq(bx + 5, by + 1, s.bases[0] !== null);
    sq(bx, by - 3, s.bases[1] !== null);
    sq(bx - 5, by + 1, s.bases[2] !== null);

    // Pause button.
    const pb = pauseButton(view, 0, 0);
    g.roundRect(pb.x - 8, pb.y - 8, 16, 16, 3).fill(PAL.ink);
    g.rect(pb.x - 3.5, pb.y - 4, 2.5, 8)
      .fill(0xffffff)
      .rect(pb.x + 1, pb.y - 4, 2.5, 8)
      .fill(0xffffff);

    const bottom = Math.min(view.bottom, HEIGHT / 2 + 40);
    // What was thrown.
    if (sim.pitchLabel && (sim.phase === 'pitch' || sim.phase === 'call') && !sim.play) {
      this.text(this.hudText, sim.pitchLabel, 0, bottom - 13, { fill: '#ffffff', align: 0.5 });
    }
    // A hint before each pitch.
    if (sim.phase === 'ready') {
      const blink = Math.floor(this.clock * 2) % 2 === 0;
      const hint = sim.userBatting ? 'SWIPE THROUGH THE BALL' : 'SWIPE UP TO PITCH';
      if (blink || !sim.userBatting)
        this.text(this.hudText, hint, 0, bottom - 13, { fill: '#ffe94a', align: 0.5 });
      if (!sim.userBatting) {
        // An arrow from the pitcher up to the zone.
        const y0 = 70;
        const y1 = -20;
        const a = 0.5 + 0.5 * Math.sin(this.clock * 5);
        g.moveTo(0, y0)
          .lineTo(0, y1)
          .stroke({ width: 2, color: 0xffe94a, alpha: 0.4 + a * 0.4 });
        g.poly([-5, y1 + 6, 0, y1, 5, y1 + 6]).fill({ color: 0xffe94a, alpha: 0.4 + a * 0.4 });
      }
    }
    // The call.
    const a = sim.announcement;
    if (sim.phase === 'call' && a) {
      const pop = ease(sim.time / 0.15);
      const scale = a.big ? 3 : 2;
      const width = textWidth(a.text, scale);
      const fit = width > WIDTH - 8 ? Math.max(1, scale - 1) : scale;
      const y = -40;
      const sp = this.text(this.hudText, a.text, 0, y, {
        scale: fit,
        fill: a.big ? ['#fff36a', '#ff9a2e'] : ['#ffffff', '#e8e8f0'],
        align: 0.5,
      });
      if (sp) sp.alpha = pop;
      if (a.sub)
        this.text(this.hudText, a.sub, 0, y + 7 * fit + 8, {
          fill: '#ffe94a',
          align: 0.5,
          alpha: pop,
        });
    }
  }

  // Menus and cards.

  private panel(x: number, y: number, w: number, h: number): void {
    const g = this.cardG;
    g.rect(x + 2, y + 2, w, h).fill({ color: 0x000000, alpha: 0.35 });
    g.rect(x, y, w, h).fill(PAL.panelEdge);
    g.rect(x + 2, y + 2, w - 4, h - 4).fill(PAL.panel);
  }

  private button(b: Button, alt = false): void {
    const g = this.cardG;
    const x = b.x - b.w / 2;
    const y = b.y - b.h / 2;
    g.rect(x, y + 2, b.w, b.h).fill(alt ? PAL.buttonAltDark : PAL.buttonDark);
    g.rect(x, y, b.w, b.h).fill(alt ? PAL.buttonAlt : PAL.button);
    g.rect(x + 2, y + 2, b.w - 4, 2).fill({ color: 0xffffff, alpha: 0.35 });
    this.text(this.cardText, b.label, b.x, b.y - 3, { align: 0.5, fill: '#ffffff' });
  }

  private dim(view: Bounds, alpha = 0.45): void {
    this.cardG
      .rect(view.left, view.top, view.right - view.left, view.bottom - view.top)
      .fill({ color: 0x0b1a33, alpha });
  }

  private drawCards(sim: BatOutSim, view: Bounds): void {
    switch (sim.phase) {
      case 'title':
        this.dim(view, 0.25);
        this.logo(-104);
        MODE_BUTTONS.forEach((b, i) => this.button(b, i === 1));
        this.button(HELP_BUTTON, true);
        return;
      case 'help':
        this.dim(view);
        this.help();
        return;
      case 'scorecard':
        this.dim(view);
        this.scorecard(sim.state!, false);
        this.button(CONTINUE_BUTTON);
        return;
      case 'over':
        this.dim(view);
        this.gameOver(sim);
        this.button(AGAIN_BUTTON);
        this.button(MENU_BUTTON, true);
        return;
      default:
        break;
    }
    if (sim.paused) {
      this.dim(view);
      this.panel(-60, -46, 120, 84);
      this.text(this.cardText, 'TIME OUT', 0, -36, { scale: 2, align: 0.5, fill: '#ffffff' });
      this.button(RESUME_BUTTON);
      this.button(QUIT_BUTTON, true);
    }
  }

  private logo(y: number): void {
    this.text(this.cardText, 'BAT OUT!', 0, y, {
      scale: 3,
      fill: ['#fff36a', '#ff9a2e'],
      align: 0.5,
    });
    this.text(this.cardText, 'ARCADE BASEBALL', 0, y + 28, { fill: '#ffffff', align: 0.5 });
  }

  private help(): void {
    this.panel(-86, -150, 172, 290);
    const lines: [string, string?][] = [
      ['HITTING', '#c62a22'],
      ['SWIPE THROUGH THE BALL'],
      ['JUST AS IT REACHES THE'],
      ['PLATE. UNDER IT LIFTS IT,'],
      ['OVER IT HITS A GROUNDER.'],
      ['EARLY PULLS IT TO LEFT,'],
      ['LATE GOES TO RIGHT. A'],
      ['HARD SWIPE HITS HARDER.'],
      ["DON'T SWIPE: THE UMP CALLS"],
      ['A BALL OR A STRIKE.'],
      [''],
      ['PITCHING', '#1f4fb4'],
      ['SWIPE UP FROM THE PITCHER'],
      ['AND LET GO WHERE YOU WANT'],
      ['IT. SWIPE FAST, THROW HARD.'],
      ['STRAIGHT: FASTBALL'],
      ['SLOW + STRAIGHT: CHANGEUP'],
      ['HOOK THE END: SLIDER'],
      ['HOOK IT MORE: CURVEBALL'],
      ['FLICK BACK DOWN: SINKER'],
      ['STOP, THEN LET GO: KNUCKLER'],
      [''],
      ['3 OUTS RETIRE THE SIDE.'],
    ];
    lines.forEach(([line, color], i) =>
      this.text(this.cardText, line, -80, -142 + i * 11, {
        fill: color ?? '#2a2a3a',
        outline: null,
      }),
    );
    this.button(BACK_BUTTON);
  }

  /** The line score: runs by inning for both sides, with runs and hits. */
  private scorecard(s: GameState, final: boolean): void {
    const innings = Math.max(s.innings, s.away.line.length, s.home.line.length);
    const first = Math.max(0, innings - 9);
    const cols = Math.min(9, innings);
    const cw = 11;
    const w = 30 + cols * cw + 34;
    const x = -w / 2;
    this.panel(x - 4, -86, w + 8, final ? 84 : 100);
    const title = final
      ? 'FINAL'
      : s.top
        ? `MIDDLE OF THE ${ordinal(s.inning)}`
        : `END OF THE ${ordinal(s.inning)}`;
    this.text(this.cardText, title, 0, -78, { align: 0.5, fill: '#2a2a3a', outline: null });
    const y0 = -58;
    for (let i = 0; i < cols; i++) {
      this.text(this.cardText, `${first + i + 1}`, x + 30 + i * cw + cw / 2, y0, {
        align: 0.5,
        fill: '#8a5a2b',
        outline: null,
      });
    }
    this.text(this.cardText, 'R', x + 30 + cols * cw + 8, y0, {
      align: 0.5,
      fill: '#8a5a2b',
      outline: null,
    });
    this.text(this.cardText, 'H', x + 30 + cols * cw + 24, y0, {
      align: 0.5,
      fill: '#8a5a2b',
      outline: null,
    });
    const rows: ['CPU' | 'YOU', GameState['away'], string][] = [
      ['CPU', s.away, '#1f4fb4'],
      ['YOU', s.home, '#c62a22'],
    ];
    rows.forEach(([name, t, color], r) => {
      const y = y0 + 14 + r * 14;
      this.cardG.rect(x, y - 3, w, 13).fill({ color: r ? 0xffe7c2 : 0xffeed2 });
      this.text(this.cardText, name, x + 2, y, { fill: color, outline: null });
      for (let i = 0; i < cols; i++) {
        const v = t.line[first + i];
        // An inning not reached is blank; the bottom of a last inning not needed is an X.
        const text =
          v === undefined
            ? name === 'YOU' && s.over && first + i + 1 >= s.innings && s.top
              ? 'X'
              : ''
            : `${v}`;
        this.text(this.cardText, text, x + 30 + i * cw + cw / 2, y, {
          align: 0.5,
          fill: '#2a2a3a',
          outline: null,
        });
      }
      this.text(this.cardText, `${t.runs}`, x + 30 + cols * cw + 8, y, {
        align: 0.5,
        fill: color,
        outline: null,
      });
      this.text(this.cardText, `${t.hits}`, x + 30 + cols * cw + 24, y, {
        align: 0.5,
        fill: '#2a2a3a',
        outline: null,
      });
    });
    if (!final) {
      const next = s.top ? 'YOU BAT NEXT' : 'YOU PITCH NEXT';
      this.text(this.cardText, next, 0, y0 + 46, { align: 0.5, fill: '#2a2a3a', outline: null });
    }
  }

  private gameOver(sim: BatOutSim): void {
    const s = sim.state!;
    const result = outcome(s);
    if (isGame(s)) {
      this.text(this.cardText, result === 'win' ? 'YOU WIN!' : 'YOU LOSE', 0, -128, {
        scale: 3,
        fill: result === 'win' ? ['#fff36a', '#ff9a2e'] : ['#ffffff', '#c8c8d8'],
        align: 0.5,
      });
      this.scorecard(s, true);
      return;
    }
    const name = MODES.find((m) => m.id === s.mode)!.name;
    this.panel(-80, -96, 160, 140);
    this.text(this.cardText, 'SIDE RETIRED', 0, -86, {
      scale: 2,
      align: 0.5,
      fill: '#c62a22',
      outline: null,
    });
    this.text(this.cardText, name, 0, -64, { align: 0.5, fill: '#8a5a2b', outline: null });
    const isNew = this.game.result?.isNewBest ?? false;
    if (s.mode === 'hitting') {
      this.text(this.cardText, `RUNS ${s.home.runs}`, 0, -44, {
        scale: 2,
        align: 0.5,
        fill: '#2a2a3a',
        outline: null,
      });
      this.text(this.cardText, `HITS ${s.home.hits}`, 0, -22, {
        align: 0.5,
        fill: '#2a2a3a',
        outline: null,
      });
      this.text(this.cardText, `BEST ${this.game.best.hitting}`, 0, -8, {
        align: 0.5,
        fill: '#2a2a3a',
        outline: null,
      });
    } else {
      this.text(this.cardText, `STRIKEOUTS ${s.strikeouts}`, 0, -44, {
        scale: 2,
        align: 0.5,
        fill: '#2a2a3a',
        outline: null,
      });
      this.text(this.cardText, `RUNS ALLOWED ${s.away.runs}  HITS ${s.away.hits}`, 0, -22, {
        align: 0.5,
        fill: '#2a2a3a',
        outline: null,
      });
      this.text(this.cardText, `BEST ${this.game.best.pitching} K`, 0, -8, {
        align: 0.5,
        fill: '#2a2a3a',
        outline: null,
      });
    }
    if (isNew)
      this.text(this.cardText, 'NEW RECORD!', 0, 12, { align: 0.5, fill: ['#fff36a', '#ff9a2e'] });
  }
}

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
