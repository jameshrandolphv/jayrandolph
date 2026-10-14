import { Container, Graphics, type Text } from 'pixi.js';
import type { LogicalSize } from '../../games/game-canvas';
import {
  cornerButton,
  drawFrame,
  label,
  ovalButton,
  paperCard,
  pauseIcon,
  SCRIPT_FONT,
} from '../flights/art';
import { angleDiff, lerpAngle } from '../flights/geometry';
import {
  BADGE_R,
  COLORS,
  KIND_COLORS,
  SEASON_NAMES,
  STRIDE,
  WRONG_WAY_COLOR,
  badgeDisc,
  badgeNumber,
  drawLimbs,
  drawPark,
  exitIcon,
  horseshoeIcon,
  moverBody,
  moverShadow,
  roadStrip,
  sample,
  speedStreaks,
  warnRing,
  type Look,
} from './art';
import {
  BACK_BUTTON,
  CARD,
  FRAME_H,
  HELP_BUTTON,
  LANE_W,
  MENU_BUTTON,
  PLAY_BUTTON,
  POP_TICKS,
  QUIT_BUTTON,
  RESUME_BUTTON,
  RETRY_BUTTON,
  SLIP_TICKS,
  pauseButton,
  type Bounds,
} from './constants';
import { isPortrait, type ChaosParkGame } from './game';
import type { Park } from './park';
import { lapsLeft, type Mover } from './sim';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** How far below and right of a mover its shadow falls, as if lit from the top left. */
const SHADOW = { x: 2, y: 3 };

interface MoverView {
  root: Container;
  shadow: Graphics;
  limbs: Graphics;
  /** Speed lines behind it while boosted. */
  streaks: Graphics;
  warn: Graphics;
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
  private readonly shadows = new Container();
  private readonly warnings = new Container();
  private readonly movers = new Container();
  private readonly crashRing = new Graphics();
  private readonly badges = new Container();
  private readonly popLayer = new Container();
  private readonly frame = new Graphics();
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
    const best = label('HI SCORE:', 28, COLORS.ink, {
      stroke: { color: 0xffffff, width: 5, join: 'round' },
      letterSpacing: 1,
    });
    best.anchor.set(1, 0.5);
    best.position.set(-136, 32);
    this.bestText.box.position.set(-78, 32);
    this.hudRight.addChild(best, this.bestText.box);
    this.pauseButton = cornerButton(pauseIcon);
    this.hud.addChild(this.hudLeft, this.hudRight, this.pauseButton);

    this.titleBest = label('0', 54, COLORS.ink, {});
    this.overCount = label('0', 84, COLORS.red, {
      stroke: { color: COLORS.ink, width: 6, join: 'round' },
    });
    this.buildGameOver();
    this.buildPaused();

    this.world.addChild(
      this.scenery,
      this.shadows,
      this.warnings,
      this.movers,
      this.crashRing,
      this.badges,
      this.popLayer,
    );
    this.cards.addChild(this.title, this.help, this.gameOver, this.paused);
    root.addChild(this.world, this.frame, this.hud, this.dim, this.cards);
  }

  update(alpha: number, deltaMs: number, bounds: Bounds, size: LogicalSize): void {
    const { sim } = this.game;
    this.fitScreen(bounds, size);
    if (sim.park !== this.park) this.loadPark(sim.park);
    const phase = sim.phase;
    const inPlay = phase === 'playing' || phase === 'crashed';

    this.syncMovers(sim.movers, alpha, deltaMs);
    this.syncPops();
    this.syncCrash();

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

  /** Turns the park to suit the screen and pins the frame, HUD and pause button to its edges. */
  private fitScreen(b: Bounds, size: LogicalSize): void {
    const key = `${b.left},${b.top},${b.right},${b.bottom},${size.width}`;
    if (key === this.shownScreen) return;
    this.shownScreen = key;
    if (isPortrait(size)) {
      // A quarter turn clockwise: park (x, y) lands on screen at (FRAME_H - y, x).
      this.world.rotation = Math.PI / 2;
      this.world.position.set(FRAME_H, 0);
    } else {
      this.world.rotation = 0;
      this.world.position.set(0, 0);
    }
    drawFrame(this.frame, b);
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
    for (const id of [...this.views.keys()]) this.dropMover(id);
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
      // A wobble after slipping on ice.
      const wobble =
        m.slip > 0 ? Math.sin((sim.clock + alpha) * 0.9) * 0.5 * (m.slip / SLIP_TICKS) : 0;
      v.root.position.set(x, y);
      v.root.rotation = v.angle + wobble;
      v.root.alpha = m.alpha;
      v.streaks.visible = m.boosted;
      // The lines flicker and trail a little further as it goes.
      if (m.boosted) v.streaks.x = -2 - ((sim.clock + alpha) % 6);
      v.shadow.position.set(x + SHADOW.x, y + SHADOW.y);
      v.shadow.rotation = v.root.rotation;
      v.shadow.alpha = 0.22 * m.alpha;

      const crashed = sim.crash?.ids.includes(m.id) ?? false;
      v.warn.visible = m.warning || crashed;
      v.warn.position.set(x, y);
      v.warn.rotation = v.angle;
      v.warn.scale.set(
        crashed ? 1 + 0.1 * Math.sin(sim.clock * 0.25) : 1 + 0.05 * Math.sin(sim.clock * 0.4),
      );

      this.syncBadge(v, m);
      // Above the mover on screen, clear of however it is turned.
      const ux = Math.cos(v.angle);
      const uy = Math.sin(v.angle);
      const along = Math.abs(ux * up.x + uy * up.y) * (m.len / 2);
      const across = Math.abs(-uy * up.x + ux * up.y) * ((m.width * LANE_W) / 2 - 3);
      const lift = along + across + BADGE_R + 3;
      v.badge.position.set(x + up.x * lift, y + up.y * lift);
      v.badge.alpha = m.alpha;
    }
    for (const id of [...this.views.keys()]) if (!live.has(id)) this.dropMover(id);
  }

  private createMover(m: Mover): MoverView {
    const look: Look = { kind: m.kind, look: m.look, season: this.game.sim.park.season };
    const root = new Container();
    const limbs = new Graphics();
    const streaks = speedStreaks(m.width, m.len);
    streaks.visible = false;
    root.addChild(streaks, limbs, moverBody(look));
    const shadow = moverShadow(m.kind, m.width, m.len);
    const warn = warnRing(m.width, m.len);
    warn.visible = false;
    const badge = new Container();
    badge.rotation = -this.world.rotation;
    this.shadows.addChild(shadow);
    this.warnings.addChild(warn);
    this.movers.addChild(root);
    this.badges.addChild(badge);
    drawLimbs(limbs, look, 0);
    return {
      root,
      shadow,
      limbs,
      streaks,
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
    this.views.delete(id);
  }

  /** Laps to go, an exit arrow once they're done, or a horseshoe for a carriage. Red-rimmed if going the wrong way. */
  private syncBadge(v: MoverView, m: Mover): void {
    const left = lapsLeft(m);
    const content = m.kind === 'carriage' ? 'shoe' : m.done || left <= 0 ? 'exit' : String(left);
    const ring = m.dir < 0 ? WRONG_WAY_COLOR : KIND_COLORS[m.kind];
    const key = `${content}:${ring}`;
    if (v.pop > 0) v.pop--;
    v.badge.scale.set(1 + 0.4 * Math.sin((v.pop / 12) * Math.PI));
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
        t = label('+1', 24, 0xffffff, {
          stroke: { color: 0x3f6b28, width: 6, join: 'round' },
          letterSpacing: 1,
        });
        this.popViews.set(p.id, t);
        this.popLayer.addChild(t);
      }
      const rise = 18 + easeOut(p.ticks / POP_TICKS) * 26;
      t.position.set(p.x + up.x * rise, p.y + up.y * rise);
      t.rotation = -this.world.rotation;
      t.scale.set(p.ticks < 8 ? easeOut(p.ticks / 8) * 1.2 : 1);
      t.alpha = p.ticks > POP_TICKS - 20 ? (POP_TICKS - p.ticks) / 20 : 1;
    }
    for (const [id, t] of this.popViews) {
      if (live.has(id)) continue;
      t.destroy();
      this.popViews.delete(id);
    }
  }

  private syncCrash(): void {
    const { crash, clock, phase } = this.game.sim;
    this.crashRing.visible = !!crash && phase !== 'title';
    if (!crash) return;
    const r = 40 + 8 * Math.sin(clock * 0.2);
    const g = this.crashRing
      .clear()
      .circle(crash.x, crash.y, r)
      .stroke({ width: 5, color: COLORS.warn, alpha: 0.9 })
      .circle(crash.x, crash.y, r + 11)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    // Little stars circling the collision.
    for (let i = 0; i < 5; i++) {
      const a = clock * 0.06 + (i / 5) * Math.PI * 2;
      star(g, crash.x + Math.cos(a) * 24, crash.y + Math.sin(a) * 14, 5);
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
    layer.addChild(paperCard(-CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h));
  }

  private clear(layer: Container): void {
    layer.removeChildren().forEach((c) => c.destroy({ children: true }));
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
    const heading = label('HIGH SCORE:', 30, COLORS.ink, { letterSpacing: 2 });
    heading.position.set(0, 64);
    this.titleBest.position.set(0, 106);
    layer.addChild(season, strip, heading, this.titleBest);
    layer.addChild(ovalButton(HELP_BUTTON, 'blue', 24, -0.08), ovalButton(PLAY_BUTTON, 'red', 50));
  }

  private buildHelp(park: Park): void {
    const layer = this.help;
    this.clear(layer);
    this.card(layer);
    const heading = label('HOW TO PLAY', 50, COLORS.red, {
      stroke: { color: COLORS.ink, width: 6, join: 'round' },
      letterSpacing: 2,
    });
    heading.position.set(0, -212);
    layer.addChild(heading);
    const rows: [Container, string][] = [];

    const speed = new Container();
    (['walker', 'runner', 'biker', 'car'] as const).forEach((kind, i) => {
      const s = sample(kind, park.season);
      s.scale.set(0.85);
      s.position.set([-16, 8, 36, 74][i]!, 0);
      speed.addChild(s);
    });
    rows.push([speed, 'EACH ONE FASTER THAN THE LAST']);

    const laps = new Container();
    const runner = sample('runner', park.season);
    const badge = new Container();
    badge.addChild(badgeDisc(KIND_COLORS.runner), badgeNumber(2));
    badge.position.set(0, -16);
    runner.position.set(0, 4);
    laps.addChild(runner, badge);
    laps.x = 30;
    rows.push([laps, 'NUMBERS SHOW THE LAPS LEFT TO GO']);

    const wide = new Container();
    const dog = sample('dog', park.season, [0.4, 0.1, 0.7]);
    const carriage = sample('carriage', park.season);
    carriage.scale.set(0.8);
    dog.position.set(-6, 0);
    carriage.position.set(56, 0);
    wide.addChild(dog, carriage);
    rows.push([wide, 'DOGS, CARS & CARRIAGES TAKE TWO LANES']);

    const wrong = new Container();
    const back = sample('walker', park.season, [0.6, 0.3, 0.5]);
    back.rotation = Math.PI;
    const red = new Container();
    red.addChild(badgeDisc(WRONG_WAY_COLOR), badgeNumber(1));
    red.position.set(0, -16);
    back.position.set(0, 4);
    wrong.addChild(back, red);
    wrong.x = 30;
    rows.push([wrong, 'RED RIMS ARE GOING THE WRONG WAY!']);

    if (park.season === 'winter') {
      const ice = new Graphics()
        .ellipse(30, 0, 26, 9)
        .fill({ color: 0xd6efff, alpha: 0.95 })
        .stroke({ width: 1.6, color: COLORS.ink, alpha: 0.4 })
        .moveTo(18, -2)
        .lineTo(28, -2)
        .moveTo(34, 3)
        .lineTo(40, 3)
        .stroke({ width: 1.6, color: 0xffffff, cap: 'round' });
      rows.push([ice, 'ICE SENDS THEM SLIDING A LANE']);
    } else {
      const shortcut = new Graphics()
        .moveTo(0, 8)
        .bezierCurveTo(20, -14, 40, 14, 62, -6)
        .stroke({ width: 9, color: 0xcdb98f, cap: 'round' })
        .moveTo(0, 8)
        .bezierCurveTo(20, -14, 40, 14, 62, -6)
        .stroke({ width: 6, color: 0xeadbb6, cap: 'round' });
      rows.push([shortcut, 'SOME CUT ACROSS THE PARK']);
    }

    rows.forEach(([icon, text], i) => {
      const y = -146 + i * 50;
      icon.scale.set(icon.scale.x * 1.25);
      icon.position.set((icon.x - 30) * 1.25 - 170, y);
      const caption = label(text, 20, COLORS.ink, { letterSpacing: 1 });
      caption.anchor.set(0, 0.5);
      caption.position.set(-84, y);
      layer.addChild(icon, caption);
    });
    const body = label(
      'SWIPE IN OR OUT TO CHANGE LANE,\nFORWARD TO SPEED UP AND BACK TO SLOW DOWN.\nONE COLLISION AND IT’S GAME OVER!',
      21,
      COLORS.ink,
      {
        lineHeight: 27,
        letterSpacing: 1,
      },
    );
    body.position.set(0, 120);
    layer.addChild(body, ovalButton(BACK_BUTTON, 'red', 32));
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
      ovalButton(MENU_BUTTON, 'blue', 28),
      ovalButton(RETRY_BUTTON, 'red', 46),
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
      const top = label('NEW HIGH SCORE', 28, COLORS.red, { letterSpacing: 2 });
      top.position.set(0, -206);
      const main = label('Congratulations!', 54, COLORS.ink, { padding: 20 }, SCRIPT_FONT);
      main.position.set(0, -156);
      main.rotation = -0.04;
      this.overHeadline.addChild(top, main);
    } else {
      const main = label('Oh dear!', 68, COLORS.ink, { padding: 20 }, SCRIPT_FONT);
      main.position.set(0, -172);
      main.rotation = -0.04;
      this.overHeadline.addChild(main);
    }
  }

  private buildPaused(): void {
    const text = label('PAUSED', 96, 0xffffff, {
      stroke: { color: COLORS.ink, width: 10, join: 'round' },
      letterSpacing: 4,
    });
    text.position.set(0, -90);
    this.paused.addChild(
      text,
      ovalButton(QUIT_BUTTON, 'blue', 30),
      ovalButton(RESUME_BUTTON, 'red', 42),
    );
  }
}

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
