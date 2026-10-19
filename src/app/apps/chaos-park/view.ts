import { Container, Graphics, type Text } from 'pixi.js';
import type { LogicalSize } from '../../games/game-canvas';
import { label, SCRIPT_FONT } from '../flights/art';
import { angleDiff, lerpAngle } from '../flights/geometry';
import {
  BADGE_R,
  COLORS,
  KIND_COLORS,
  SEASON_NAMES,
  STRIDE,
  WRONG_WAY_COLOR,
  badgeDisc,
  drawDaze,
  heart,
  patchSprites,
  drawRat,
  ratAlert,
  badgeNumber,
  drawLimbs,
  drawPark,
  exitIcon,
  horseshoeIcon,
  moverBody,
  moverShadow,
  roadStrip,
  patchGraphic,
  sample,
  speechBubble,
  speedStreaks,
  warnBubble,
  type Look,
} from './art';
import {
  BACK_BUTTON,
  BUTTON_TEXT,
  CARD,
  ART,
  HELP_BUTTON,
  LANE_W,
  MENU_BUTTON,
  PLAY_BUTTON,
  POP_TICKS,
  QUIT_BUTTON,
  RESUME_BUTTON,
  RETRY_BUTTON,
  IMPACT_TICKS,
  MAX_HITS,
  SHOUT_TICKS,
  SLIP_TICKS,
  pauseButton,
  type Bounds,
} from './constants';
import { placePark, type ChaosParkGame } from './game';
import { noticeBoard, plaqueButton, roundPauseButton, trophy } from './ui';
import type { Park } from './park';
import { lapsLeft, patchesShown, type Mover } from './sim';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** How far below and right of a mover its shadow falls, as if lit from the top left. */
const SHADOW = { x: 2, y: 3 };

interface RatView {
  body: Graphics;
  alert: Graphics;
  /** Scurrying phase, advanced by distance covered. */
  phase: number;
  lastX: number;
  lastY: number;
  angle: number;
}

interface MoverView {
  root: Container;
  shadow: Graphics;
  limbs: Graphics;
  /** Speed lines behind it while boosted. */
  streaks: Graphics;
  /** Stars over the head of someone a rat has bitten. */
  daze: Graphics;
  /** A biker's "Out of my way!", made when first needed. */
  shout: Container | null;
  warn: Container;
  badge: Container;
  /** What the badge shows now, so it is only rebuilt when that changes. */
  badgeKey: string;
  /** Frames left of the badge's pop when its count changes. */
  pop: number;
  look: Look;
  angle: number;
  /** Walking/pedalling phase, advanced by distance covered. */
  phase: number;
  lastX: number;
  lastY: number;
}

const pad = (n: number): string => String(Math.min(n, 99999)).padStart(5, '0');

/** A five-digit counter: white digits in a black box, each centred in its own cell like an odometer. */
interface Counter {
  box: Container;
  cells: Text[];
}

const COUNTER = { w: 108, h: 36, digits: 5 };
/** Bangers' line box sits its digits low; this centres the ink rather than the box. */
const DIGIT_DROP = -3;

/** Draws a ChaosParkSim; nothing here changes game state. */
export class ChaosParkView {
  /** The park, in park coordinates; turned on its side on portrait screens. */
  private readonly world = new Container();
  private readonly scenery = new Container();
  /** The park's patches, shown one by one as the score reaches each. */
  private readonly patchLayer = new Container();
  private patchSprites: Graphics[] = [];
  /** Frames since each patch appeared, for its pop-in. */
  private patchAge: number[] = [];
  private readonly impactLayer = new Graphics();
  /** One per collision a run can take, after the lap counter. */
  private readonly hearts: Container[] = [];
  private shownHits = -1;
  private readonly shadows = new Container();
  private readonly movers = new Container();
  private readonly crashRing = new Graphics();
  private readonly badges = new Container();
  private readonly popLayer = new Container();
  private readonly ratLayer = new Container();
  private readonly hud = new Container();
  private readonly hudLeft = new Container();
  private readonly hudRight = new Container();
  private readonly pauseButton: Container;
  private readonly dim = new Graphics()
    .rect(-3000, -3000, 6000, 6000)
    .fill({ color: 0x000000, alpha: 0.3 });
  /** Cards sit in the middle of the screen. */
  private readonly cards = new Container();
  private readonly title = new Container();
  private readonly help = new Container();
  private readonly gameOver = new Container();
  private readonly paused = new Container();

  private readonly views = new Map<number, MoverView>();
  private readonly ratViews = new Map<number, RatView>();
  private readonly popViews = new Map<number, Text>();
  private readonly lapsText: Counter;
  private readonly bestText: Counter;
  private readonly titleBest: Text;
  private readonly overCount: Text;
  private readonly overHeadline = new Container();
  private park: Park | null = null;
  private shownScreen = '';
  private shownLaps = -1;
  private shownBest = -1;
  private shownTitleBest = -1;
  private shownResult: unknown = undefined;

  constructor(
    root: Container,
    private readonly game: ChaosParkGame,
  ) {
    this.crashRing.visible = false;
    this.lapsText = this.counter();
    this.bestText = this.counter();
    const laps = label('LAPS:', 28, COLORS.ink, {
      stroke: { color: 0xffffff, width: 5, join: 'round' },
      letterSpacing: 1,
    });
    laps.anchor.set(0, 0.5);
    laps.position.set(24, 32);
    this.lapsText.box.position.set(laps.x + laps.width + 64, 32);
    this.hudLeft.addChild(laps, this.lapsText.box);
    for (let i = 0; i < MAX_HITS; i++) {
      const h = new Container();
      h.position.set(this.lapsText.box.x + COUNTER.w / 2 + 26 + i * 30, 32);
      this.hearts.push(h);
      this.hudLeft.addChild(h);
    }
    const best = label('BEST:', 28, COLORS.ink, {
      stroke: { color: 0xffffff, width: 5, join: 'round' },
      letterSpacing: 1,
    });
    best.anchor.set(1, 0.5);
    best.position.set(-136, 32);
    this.bestText.box.position.set(-78, 32);
    this.hudRight.addChild(best, this.bestText.box);
    this.pauseButton = roundPauseButton();
    this.hud.addChild(this.hudLeft, this.hudRight, this.pauseButton);

    this.titleBest = label('0', 54, COLORS.ink, {});
    // Padding keeps the slanted digits and their outline from being clipped at the edge of the text texture.
    this.overCount = label('0', 84, COLORS.red, {
      stroke: { color: COLORS.ink, width: 6, join: 'round' },
      padding: 16,
    });
    this.buildGameOver();
    this.buildPaused();

    this.world.addChild(
      this.scenery,
      this.patchLayer,
      this.shadows,
      this.movers,
      this.ratLayer,
      this.crashRing,
      this.impactLayer,
      this.badges,
      this.popLayer,
    );
    this.cards.addChild(this.title, this.help, this.gameOver, this.paused);
    root.addChild(this.world, this.hud, this.dim, this.cards);
  }

  update(alpha: number, deltaMs: number, bounds: Bounds, size: LogicalSize): void {
    const { sim } = this.game;
    if (sim.park !== this.park) this.loadPark(sim.park);
    this.fitScreen(bounds, size);
    const phase = sim.phase;
    const inPlay = phase === 'playing' || phase === 'crashed';

    this.syncMovers(sim.movers, alpha, deltaMs);
    this.syncRats(alpha);
    this.syncPops();
    this.syncCrash();
    this.syncPatches();
    this.syncImpacts();
    this.syncHearts();

    this.hud.visible = inPlay || phase === 'gameOver';
    this.pauseButton.visible = phase === 'playing';
    this.setCount(this.lapsText, sim.score, 'shownLaps');
    this.setCount(this.bestText, Math.max(this.game.best, sim.score), 'shownBest');

    this.title.visible = phase === 'title';
    this.help.visible = phase === 'help';
    this.gameOver.visible = phase === 'gameOver';
    this.paused.visible = phase === 'playing' && sim.paused;
    this.dim.visible = !inPlay || sim.paused;
    this.dim.alpha = phase === 'gameOver' ? Math.min(1, sim.phaseTicks / 20) : 1;

    // Cards rise in from below the bottom of the screen.
    const slide = (c: Container): void => {
      c.y =
        (1 - easeOut(sim.phaseTicks / 22)) * (bounds.bottom - size.height / 2 + CARD.h / 2 + 20);
    };
    if (this.title.visible) {
      slide(this.title);
      if (this.game.best !== this.shownTitleBest) {
        this.shownTitleBest = this.game.best;
        this.titleBest.text = String(this.game.best);
      }
    }
    if (this.help.visible) slide(this.help);
    if (this.gameOver.visible) {
      slide(this.gameOver);
      this.updateGameOver();
    }
  }

  /** Turns the park to suit the screen and pins the HUD and pause button to its edges. */
  private fitScreen(b: Bounds, size: LogicalSize): void {
    const { frame } = this.game.sim.park;
    const key = `${b.left},${b.top},${b.right},${b.bottom},${size.width},${frame.w},${frame.h}`;
    if (key === this.shownScreen) return;
    this.shownScreen = key;
    // Filling the screen, turned a quarter clockwise on a portrait one (see `placePark`).
    const place = placePark(frame, size, b);
    this.world.rotation = place.portrait ? Math.PI / 2 : 0;
    this.world.scale.set(place.scale);
    this.world.position.set(place.x0, place.y0);
    this.hudLeft.position.set(b.left, b.top);
    this.hudRight.position.set(b.right, b.top);
    const pause = pauseButton(b);
    this.pauseButton.position.set(pause.x, pause.y);
    this.cards.position.set(size.width / 2, size.height / 2);
    // Badges and pops stay upright on screen.
    for (const v of this.views.values()) v.badge.rotation = -this.world.rotation;
  }

  private loadPark(park: Park): void {
    this.park = park;
    this.scenery.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.scenery.addChild(drawPark(park));
    this.patchLayer.removeChildren().forEach((c) => c.destroy());
    this.patchSprites = patchSprites(park);
    this.patchAge = this.patchSprites.map(() => -1);
    for (const g of this.patchSprites) {
      g.visible = false;
      this.patchLayer.addChild(g);
    }
    for (const id of [...this.views.keys()]) this.dropMover(id);
    for (const id of [...this.ratViews.keys()]) this.dropRat(id);
    this.buildTitle(park);
    this.buildHelp(park);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Movers.

  private syncMovers(movers: readonly Mover[], alpha: number, deltaMs: number): void {
    const { sim } = this.game;
    const live = new Set<number>();
    const ease = 1 - 0.7 ** (deltaMs / (1000 / 60));
    const up = { x: -Math.sin(this.world.rotation), y: -Math.cos(this.world.rotation) };
    for (const m of movers) {
      live.add(m.id);
      let v = this.views.get(m.id);
      if (!v) {
        v = this.createMover(m);
        this.views.set(m.id, v);
      }
      const x = lerp(m.prevX, m.x, alpha);
      const y = lerp(m.prevY, m.y, alpha);
      const heading = lerpAngle(m.prevHeading, m.heading, alpha);
      v.angle += angleDiff(v.angle, heading) * ease;
      const moved = Math.hypot(x - v.lastX, y - v.lastY);
      v.lastX = x;
      v.lastY = y;
      if (moved > 0.01) {
        v.phase += moved * STRIDE[m.kind];
        drawLimbs(v.limbs, v.look, v.phase);
      }
      // A wobble after sliding on a patch.
      const wobble =
        m.slip > 0 ? Math.sin((sim.clock + alpha) * 0.9) * 0.5 * (m.slip / SLIP_TICKS) : 0;
      v.root.position.set(x, y);
      v.root.scale.set(ART);
      v.root.rotation = v.angle + wobble;
      v.root.alpha = m.alpha;
      v.streaks.visible = m.boosted;
      // The lines flicker and trail a little further as it goes.
      if (m.boosted) v.streaks.x = -2 - ((sim.clock + alpha) % 6);
      v.shadow.position.set(x + SHADOW.x, y + SHADOW.y);
      v.shadow.rotation = v.root.rotation;
      v.shadow.alpha = 0.22 * m.alpha;

      const crashed = sim.crash?.ids.includes(m.id) ?? false;
      const warned = m.warning || crashed;

      this.syncBadge(v, m);
      // Above the mover on screen, clear of however it is turned.
      const ux = Math.cos(v.angle);
      const uy = Math.sin(v.angle);
      const along = Math.abs(ux * up.x + uy * up.y) * (m.len / 2);
      const across = Math.abs(-uy * up.x + ux * up.y) * ((m.width * LANE_W) / 2 - 3);
      const lift = along + across + (BADGE_R + 3) * ART;
      v.badge.position.set(x + up.x * lift, y + up.y * lift);
      v.badge.alpha = m.alpha;
      // A "!" bubble beside the badge for anyone about to collide, upright like the badge.
      v.warn.visible = warned;
      if (warned) {
        const right = { x: -up.y, y: up.x };
        const side = (BADGE_R + 3) * ART;
        v.warn.position.set(v.badge.x + right.x * side, v.badge.y + right.y * side);
        v.warn.rotation = -this.world.rotation;
        v.warn.scale.set(
          ART *
            (crashed
              ? 1.1 + 0.1 * Math.sin(sim.clock * 0.25)
              : 1 + 0.06 * Math.sin(sim.clock * 0.4)),
        );
      }
      this.syncShout(v, m, up);
      v.daze.visible = m.daze > 0;
      if (m.daze > 0) {
        drawDaze(v.daze, sim.clock + alpha);
        v.daze.position.set(x + up.x * 4 * ART, y + up.y * 4 * ART);
        v.daze.scale.set(ART);
        v.daze.rotation = -this.world.rotation;
      }
    }
    for (const id of [...this.views.keys()]) if (!live.has(id)) this.dropMover(id);
  }

  private createMover(m: Mover): MoverView {
    const look: Look = {
      kind: m.kind,
      look: m.look,
      season: this.game.sim.park.season,
      crowd: m.crowd,
    };
    const root = new Container();
    const limbs = new Graphics();
    // Drawn at the design size and scaled up to the lane width.
    const streaks = speedStreaks(m.width, m.len / ART);
    streaks.visible = false;
    root.addChild(streaks, limbs, moverBody(look));
    const shadow = moverShadow(m.kind, m.width, m.len);
    const warn = warnBubble();
    warn.visible = false;
    const badge = new Container();
    badge.rotation = -this.world.rotation;
    const daze = new Graphics();
    daze.visible = false;
    this.shadows.addChild(shadow);
    this.movers.addChild(root);
    this.badges.addChild(badge, daze, warn);
    drawLimbs(limbs, look, 0);
    return {
      root,
      shadow,
      limbs,
      streaks,
      daze,
      shout: null,
      warn,
      badge,
      badgeKey: '',
      pop: 0,
      look,
      angle: m.heading,
      phase: 0,
      lastX: m.x,
      lastY: m.y,
    };
  }

  private dropMover(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    v.root.destroy({ children: true });
    v.shadow.destroy();
    v.warn.destroy();
    v.badge.destroy({ children: true });
    v.daze.destroy();
    v.shout?.destroy({ children: true });
    this.views.delete(id);
  }

  /** Pops a biker's shout up over its badge, then fades it away. */
  private syncShout(v: MoverView, m: Mover, up: { x: number; y: number }): void {
    if (m.shout <= 0) {
      if (v.shout) v.shout.visible = false;
      return;
    }
    if (!v.shout) {
      v.shout = speechBubble('Out of my way!');
      this.badges.addChild(v.shout);
    }
    const age = SHOUT_TICKS - m.shout;
    v.shout.visible = true;
    v.shout.alpha = 0.92 * Math.min(1, age / 6, m.shout / 16) * m.alpha;
    v.shout.scale.set((0.7 + 0.3 * easeOut(age / 8)) * ART);
    v.shout.rotation = -this.world.rotation;
    const lift = (BADGE_R + 2) * ART;
    v.shout.position.set(v.badge.x + up.x * lift, v.badge.y + up.y * lift);
  }

  /** Rats, with a "!" over one waiting at the kerb. */
  private syncRats(alpha: number): void {
    const { rats, clock } = this.game.sim;
    const live = new Set<number>();
    for (const r of rats) {
      live.add(r.id);
      let v = this.ratViews.get(r.id);
      if (!v) {
        const body = new Graphics();
        body.scale.set(1.3 * ART);
        const alert = ratAlert();
        this.ratLayer.addChild(body);
        this.badges.addChild(alert);
        v = { body, alert, phase: 0, lastX: r.x, lastY: r.y, angle: r.heading };
        this.ratViews.set(r.id, v);
      }
      const x = lerp(r.prevX, r.x, alpha);
      const y = lerp(r.prevY, r.y, alpha);
      v.phase += Math.hypot(x - v.lastX, y - v.lastY) * 0.5 + 0.08;
      v.lastX = x;
      v.lastY = y;
      v.angle += angleDiff(v.angle, lerpAngle(r.prevHeading, r.heading, alpha)) * 0.5;
      drawRat(v.body, v.phase, r.state !== 'lurk');
      v.body.position.set(x, y);
      v.body.rotation = v.angle;
      const lurking = r.state === 'lurk';
      v.alert.visible = lurking && Math.sin(clock * 0.4) > -0.5;
      const up = { x: -Math.sin(this.world.rotation), y: -Math.cos(this.world.rotation) };
      v.alert.position.set(x + up.x * 16 * ART, y + up.y * 16 * ART);
      v.alert.scale.set(ART);
      v.alert.rotation = -this.world.rotation;
    }
    for (const id of [...this.ratViews.keys()]) if (!live.has(id)) this.dropRat(id);
  }

  private dropRat(id: number): void {
    const v = this.ratViews.get(id);
    if (!v) return;
    v.body.destroy();
    v.alert.destroy();
    this.ratViews.delete(id);
  }

  /** Laps to go, an exit arrow once they're done, or a horseshoe for a carriage. Red-rimmed if going the wrong way. */
  private syncBadge(v: MoverView, m: Mover): void {
    const left = lapsLeft(m);
    const content = m.kind === 'carriage' ? 'shoe' : m.done || left <= 0 ? 'exit' : String(left);
    const ring = m.dir < 0 ? WRONG_WAY_COLOR : KIND_COLORS[m.kind];
    const key = `${content}:${ring}`;
    if (v.pop > 0) v.pop--;
    v.badge.scale.set((1 + 0.4 * Math.sin((v.pop / 12) * Math.PI)) * ART);
    if (key === v.badgeKey) return;
    // A lap ticking down pops the badge.
    if (v.badgeKey) v.pop = 12;
    v.badgeKey = key;
    v.badge.removeChildren().forEach((c) => c.destroy({ children: true }));
    v.badge.addChild(badgeDisc(ring));
    v.badge.addChild(
      content === 'shoe'
        ? horseshoeIcon()
        : content === 'exit'
          ? exitIcon()
          : badgeNumber(Number(content)),
    );
  }

  private syncPops(): void {
    const { pops } = this.game.sim;
    const live = new Set<number>();
    const up = { x: -Math.sin(this.world.rotation), y: -Math.cos(this.world.rotation) };
    for (const p of pops) {
      live.add(p.id);
      let t = this.popViews.get(p.id);
      if (!t) {
        t = label(`+${p.value}`, p.value > 1 ? 30 : 24, 0xffffff, {
          stroke: { color: 0x3f6b28, width: 6, join: 'round' },
          letterSpacing: 1,
        });
        this.popViews.set(p.id, t);
        this.popLayer.addChild(t);
      }
      const rise = (18 + easeOut(p.ticks / POP_TICKS) * 26) * ART;
      t.position.set(p.x + up.x * rise, p.y + up.y * rise);
      t.rotation = -this.world.rotation;
      t.scale.set((p.ticks < 8 ? easeOut(p.ticks / 8) * 1.2 : 1) * ART);
      t.alpha = p.ticks > POP_TICKS - 20 ? (POP_TICKS - p.ticks) / 20 : 1;
    }
    for (const [id, t] of this.popViews) {
      if (live.has(id)) continue;
      t.destroy();
      this.popViews.delete(id);
    }
  }

  /** Patches pop onto the road as the score unlocks them. */
  private syncPatches(): void {
    const shown = patchesShown(this.game.sim.score);
    this.patchSprites.forEach((g, i) => {
      if (i >= shown) {
        g.visible = false;
        this.patchAge[i] = -1;
        return;
      }
      const age = ++this.patchAge[i]!;
      g.visible = true;
      // Grows in with a little overshoot.
      const t = Math.min(1, age / 24);
      g.scale.set(ART * (t < 1 ? easeOut(t) * (1 + 0.25 * Math.sin(t * Math.PI)) : 1));
    });
  }

  /** A quick ring of stars where two movers bumped without ending the run. */
  private syncImpacts(): void {
    const g = this.impactLayer.clear();
    for (const i of this.game.sim.impacts) {
      const t = i.ticks / IMPACT_TICKS;
      const fade = 1 - t;
      const r = (14 + 22 * easeOut(t)) * ART;
      g.circle(i.x, i.y, r).stroke({ width: 3 * ART * fade + 1, color: COLORS.warn, alpha: fade });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + t * 2;
        star(g, i.x + Math.cos(a) * r, i.y + Math.sin(a) * r, 4.5 * ART);
      }
      g.fill({ color: COLORS.gold, alpha: fade }).stroke({
        width: 1.2,
        color: COLORS.ink,
        alpha: fade,
        join: 'round',
      });
    }
  }

  /** Full hearts for the collisions still to come; the one just lost pops as it empties. */
  private syncHearts(): void {
    const { hits } = this.game.sim;
    if (hits !== this.shownHits) {
      const lost = hits > this.shownHits && this.shownHits >= 0;
      this.shownHits = hits;
      this.hearts.forEach((h, i) => {
        h.removeChildren().forEach((c) => c.destroy());
        h.addChild(heart(i < MAX_HITS - hits));
        h.scale.set(lost && i === MAX_HITS - hits ? 1.8 : 1);
      });
    }
    for (const h of this.hearts) if (h.scale.x > 1) h.scale.set(Math.max(1, h.scale.x - 0.04));
  }

  private syncCrash(): void {
    const { crash, clock, phase } = this.game.sim;
    this.crashRing.visible = !!crash && phase !== 'title';
    if (!crash) return;
    const r = (40 + 8 * Math.sin(clock * 0.2)) * ART;
    const g = this.crashRing
      .clear()
      .circle(crash.x, crash.y, r)
      .stroke({ width: 5, color: COLORS.warn, alpha: 0.9 })
      .circle(crash.x, crash.y, r + 11 * ART)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    // Little stars circling the collision.
    for (let i = 0; i < 5; i++) {
      const a = clock * 0.06 + (i / 5) * Math.PI * 2;
      star(g, crash.x + Math.cos(a) * 24 * ART, crash.y + Math.sin(a) * 14 * ART, 5 * ART);
    }
    g.fill(COLORS.gold).stroke({ width: 1.5, color: COLORS.ink, join: 'round' });
  }

  // -------------------------------------------------------------------------------------------------------------
  // HUD and cards.

  /** Its centre is at the box's origin. */
  private counter(): Counter {
    const box = new Container();
    const { w, h, digits } = COUNTER;
    const g = new Graphics().roundRect(-w / 2, -h / 2, w, h, 6).fill(0x1e1e1e);
    const cell = (w - 8) / digits;
    for (let i = 1; i < digits; i++) g.rect(-w / 2 + 4 + cell * i - 0.5, -h / 2 + 5, 1, h - 10);
    g.fill({ color: 0xffffff, alpha: 0.18 });
    g.roundRect(-w / 2, -h / 2, w, h, 6).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    box.addChild(g);
    const cells = Array.from({ length: digits }, (_, i) => {
      const t = label('0', 30, 0xffffff, {});
      t.position.set(-w / 2 + 4 + cell * (i + 0.5), DIGIT_DROP);
      box.addChild(t);
      return t;
    });
    return { box, cells };
  }

  private setCount(counter: Counter, n: number, key: 'shownLaps' | 'shownBest'): void {
    if (this[key] === n) return;
    this[key] = n;
    [...pad(n)].forEach((digit, i) => (counter.cells[i]!.text = digit));
  }

  private card(layer: Container): void {
    layer.addChild(noticeBoard(-CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h));
  }

  /** Empties a card for rebuilding, keeping the text objects the view holds on to and updates. */
  private clear(layer: Container): void {
    const kept = new Set<Container>([this.titleBest, this.overCount, this.overHeadline]);
    layer.removeChildren().forEach((c) => {
      if (!kept.has(c)) c.destroy({ children: true });
    });
  }

  /** Rebuilt for each park, since it shows the season. */
  private buildTitle(park: Park): void {
    const layer = this.title;
    this.clear(layer);
    this.card(layer);
    layer.addChild(logo());
    const season = label(`~ ${SEASON_NAMES[park.season]} IN THE PARK ~`, 24, COLORS.blue, {
      letterSpacing: 2,
    });
    season.position.set(0, -112);
    const strip = roadStrip(park.season, 400);
    strip.scale.set(1.12);
    strip.y = -22;
    // The cup and the heading are centred together.
    const heading = label('YOUR BEST', 30, COLORS.ink, { letterSpacing: 2 });
    const cup = trophy();
    const gap = 8;
    const left = -(cup.width + gap + heading.width) / 2;
    cup.position.set(left + cup.width / 2, 62);
    heading.position.set(left + cup.width + gap + heading.width / 2, 64);
    this.titleBest.position.set(0, 106);
    layer.addChild(season, strip, heading, cup, this.titleBest);
    layer.addChild(
      plaqueButton(HELP_BUTTON, 'wood', BUTTON_TEXT),
      plaqueButton(PLAY_BUTTON, 'green', BUTTON_TEXT),
    );
  }

  private buildHelp(park: Park): void {
    const layer = this.help;
    this.clear(layer);
    this.card(layer);
    const heading = label('HOW TO PLAY', 46, COLORS.red, {
      stroke: { color: COLORS.ink, width: 6, join: 'round' },
      letterSpacing: 2,
    });
    heading.position.set(0, -212);
    layer.addChild(heading);
    const { season } = park;
    const group = (...parts: [Container, number, number, number?][]): Container => {
      const c = new Container();
      for (const [part, x, y, scale = 1] of parts) {
        part.position.set(x, y);
        part.scale.set(part.scale.x * scale);
        c.addChild(part);
      }
      return c;
    };
    const badge = (ring: number, n: number): Container => {
      const b = new Container();
      b.addChild(badgeDisc(ring), badgeNumber(n));
      return b;
    };
    const reversed = (): Container => {
      const w = sample('walker', season, [0.6, 0.3, 0.5]);
      w.rotation = Math.PI;
      return w;
    };
    const boosted = (): Container => {
      const r = sample('runner', season, [0.5, 0.1, 0.8]);
      const lines = speedStreaks(1, 14);
      lines.x = -3;
      r.addChildAt(lines, 0);
      return r;
    };
    const plusOne = label('+1', 24, 0xffffff, {
      stroke: { color: 0x3f6b28, width: 6, join: 'round' },
      letterSpacing: 1,
    });

    // The rows in order: an illustration and a line (or two) of text.
    const rows: [Container, string][] = [
      [
        group(
          [sample('walker', season), -40, 0, 0.75],
          [sample('runner', season, [0.3, 0.6, 0.1]), -18, 0, 0.75],
          [sample('biker', season), 8, 0, 0.75],
          [sample('car', season), 44, 0, 0.6],
        ),
        'PARK VISITORS VARY IN SPEED',
      ],
      [
        group([sample('runner', season), 0, 5, 0.8], [badge(KIND_COLORS.runner, 2), 0, -9, 0.8]),
        'NUMBERS INDICATE REMAINING LAPS',
      ],
      [
        group(
          [sample('dog', season, [0.4, 0.1, 0.7]), -22, 0, 0.7],
          [sample('carriage', season), 26, 0, 0.6],
        ),
        'SOME VISITORS OCCUPY TWO LANES',
      ],
      [
        group([reversed(), 0, 5, 0.8], [badge(WRONG_WAY_COLOR, 1), 0, -9, 0.8]),
        'SOME PEOPLE GO THE WRONG WAY',
      ],
      [
        group(
          ...(['winter', 'spring', 'summer', 'autumn'] as const).map(
            (sea, i): [Container, number, number] => [patchGraphic(sea, 20, i), -36 + i * 24, 0],
          ),
        ),
        'PATCHES OF ICE, WATER, MUD, AND LEAVES\nWILL CAUSE UNEXPECTED LANE CHANGES',
      ],
      [
        group([sample('runner', season), -6, 0, 0.85], [arrows(true), 16, 0]),
        'SWIPE IN/OUT TO CHANGE LANES',
      ],
      [
        group([boosted(), -12, 0, 0.85], [arrows(false), 18, 0]),
        'SWIPE FORWARD TO SPEED UP AND BACK\nTO SLOW DOWN AGAIN',
      ],
      [group([plusOne, 0, 0]), 'EACH LAP IS A POINT'],
      [
        group(
          ...Array.from({ length: MAX_HITS }, (_, i): [Container, number, number, number] => [
            heart(i < MAX_HITS - 1),
            (i - (MAX_HITS - 1) / 2) * 22,
            0,
            0.8,
          ]),
        ),
        'THREE COLLISIONS AND THE GAME IS OVER!',
      ],
    ];

    let y = -184;
    for (const [icon, text] of rows) {
      const lines = text.split('\n').length;
      const h = lines > 1 ? 48 : 31;
      const mid = y + h / 2;
      icon.position.set(-178, mid);
      const caption = label(text, 18, COLORS.ink, {
        letterSpacing: 1,
        lineHeight: 21,
        align: 'left',
      });
      caption.anchor.set(0, 0.5);
      caption.position.set(-98, mid);
      layer.addChild(icon, caption);
      y += h;
    }
    layer.addChild(plaqueButton(BACK_BUTTON, 'green', BUTTON_TEXT));
  }

  private buildGameOver(): void {
    const layer = this.gameOver;
    this.card(layer);
    layer.addChild(this.overHeadline);
    const done = label('LAPS COMPLETED', 32, COLORS.ink, { letterSpacing: 2 });
    done.position.set(0, -78);
    this.overCount.position.set(0, -6);
    // A dazed biker and walker either side of the score.
    const biker = sample('biker', 'summer', [0.2, 0.5, 0.6]);
    biker.scale.set(2);
    biker.rotation = 2.3;
    biker.position.set(-170, 0);
    const walker = sample('walker', 'summer', [0.8, 0.2, 0.3]);
    walker.scale.set(2.4);
    walker.rotation = -0.9;
    walker.position.set(170, -4);
    const stars = new Graphics();
    for (const [x, y] of [
      [-190, -40],
      [-150, -46],
      [150, -44],
      [190, -38],
    ] as const)
      star(stars, x, y, 8);
    stars.fill(COLORS.gold).stroke({ width: 2, color: COLORS.ink, join: 'round' });
    layer.addChild(
      done,
      this.overCount,
      biker,
      walker,
      stars,
      plaqueButton(MENU_BUTTON, 'wood', BUTTON_TEXT),
      plaqueButton(RETRY_BUTTON, 'green', BUTTON_TEXT),
    );
  }

  private updateGameOver(): void {
    const { result, sim } = this.game;
    const shown = sim.phaseTicks < 30 ? Math.floor((sim.phaseTicks / 30) * sim.score) : sim.score;
    this.overCount.text = String(shown);
    if (result === this.shownResult) return;
    this.shownResult = result;
    this.overHeadline.removeChildren().forEach((c) => c.destroy());
    if (!result) return;
    if (result.isNewBest) {
      // The headline and its trophy are centred together.
      const main = label('New park record!', 50, COLORS.ink, { padding: 20 }, SCRIPT_FONT);
      const cup = trophy();
      cup.scale.set(1.4);
      const gap = 14;
      const left = -(main.width + gap + cup.width) / 2;
      main.position.set(left + main.width / 2, -172);
      main.rotation = -0.04;
      cup.position.set(left + main.width + gap + cup.width / 2, -180);
      this.overHeadline.addChild(main, cup);
    } else {
      const main = label('Pile-up!', 68, COLORS.ink, { padding: 20 }, SCRIPT_FONT);
      main.position.set(0, -172);
      main.rotation = -0.04;
      this.overHeadline.addChild(main);
    }
  }

  private buildPaused(): void {
    const text = label(
      'Taking a breather',
      64,
      0xffffff,
      { stroke: { color: COLORS.ink, width: 10, join: 'round' }, padding: 24 },
      SCRIPT_FONT,
    );
    text.position.set(0, -90);
    text.rotation = -0.04;
    this.paused.addChild(
      text,
      plaqueButton(QUIT_BUTTON, 'wood', BUTTON_TEXT),
      plaqueButton(RESUME_BUTTON, 'green', BUTTON_TEXT),
    );
  }
}

/**
 * A double-headed arrow, white with an ink outline: up and down (across the road) or left and right (along it).
 */
const arrows = (across: boolean): Graphics => {
  const g = new Graphics();
  const draw = (): void => {
    g.moveTo(0, -11)
      .lineTo(0, 11)
      .moveTo(-4.5, -6.5)
      .lineTo(0, -11)
      .lineTo(4.5, -6.5)
      .moveTo(-4.5, 6.5)
      .lineTo(0, 11)
      .lineTo(4.5, 6.5);
  };
  draw();
  g.stroke({ width: 5.5, color: COLORS.ink, cap: 'round', join: 'round' });
  draw();
  g.stroke({ width: 2.6, color: 0xffffff, cap: 'round', join: 'round' });
  if (!across) g.rotation = Math.PI / 2;
  return g;
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

/** The game's name in script, over a little tree on either side. */
const logo = (): Container => {
  const c = new Container();
  c.y = -186;
  const trees = new Graphics();
  for (const [x, y, r, color] of [
    [-226, 8, 22, 0x4f9a34],
    [-238, 34, 13, 0x6cb544],
    [226, -6, 22, 0x4f9a34],
    [214, 26, 14, 0xf3a0bf],
  ] as const) {
    trees.ellipse(x + 3, y + 6 + r * 0.6, r, r * 0.5).fill({ color: 0x000000, alpha: 0.15 });
    trees.circle(x, y, r).fill(color).stroke({ width: 2.5, color: COLORS.ink });
    trees.circle(x - r * 0.3, y - r * 0.3, r * 0.55).fill({ color: 0xffffff, alpha: 0.22 });
  }
  c.addChild(trees);
  const back = label(
    'Chaos Park',
    76,
    COLORS.ink,
    { stroke: { color: COLORS.ink, width: 18, join: 'round' }, padding: 24 },
    SCRIPT_FONT,
  );
  const name = label(
    'Chaos Park',
    76,
    0x3f8f3a,
    { stroke: { color: 0xffffff, width: 10, join: 'round' }, padding: 24 },
    SCRIPT_FONT,
  );
  for (const t of [back, name]) t.rotation = -0.05;
  c.addChild(back, name);
  return c;
};
