import { Container, Graphics, type Text } from 'pixi.js';
import type { Airfield } from './airfield';
import {
  arrivalMarker,
  aircraftContext,
  bubble,
  COLORS,
  cornerButton,
  drawAirfield,
  drawFrame,
  fastIcon,
  howToRow,
  label,
  logo,
  milkshake,
  ovalButton,
  paperCard,
  pauseIcon,
  propContext,
  rotorContext,
  SCRIPT_FONT,
  spinnerOffset,
  stewardess,
  warningContext,
  zoneCentre,
  zoneGlow,
} from './art';
import {
  BACK_BUTTON,
  FAST_BUTTON,
  HEIGHT,
  HELP_BUTTON,
  MENU_BUTTON,
  PAUSE_BUTTON,
  PLAY_BUTTON,
  PRAISE_TICKS,
  QUIT_BUTTON,
  RESUME_BUTTON,
  RETRY_BUTTON,
  WIDTH,
} from './constants';
import type { FlightsGame } from './game';
import { angleDiff, lerpAngle, type Point } from './geometry';
import { landProgress, type Aircraft } from './sim';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** How far below and right of an aircraft its shadow falls, as if lit from the top left. */
const SHADOW = { x: 7, y: 11 };
const DASH = 13;
const GAP = 9;
const CARD = { x: 60, y: 40, w: 840, h: 560 };

interface AircraftView {
  shadow: Graphics;
  warn: Graphics;
  body: Container;
  spinner: Graphics;
  /** Rotation shown, eased toward the heading so path corners don't snap. */
  angle: number;
}

const pad = (n: number): string => String(Math.min(n, 99999)).padStart(5, '0');

/** Draws a FlightsSim; nothing here changes game state. */
export class FlightsView {
  private readonly world = new Container();
  private readonly glows = new Container();
  private readonly paths = new Graphics();
  private readonly shadows = new Container();
  private readonly warnings = new Container();
  private readonly planes = new Container();
  private readonly markers = new Container();
  private readonly praises = new Container();
  private readonly crashRing = new Graphics();
  private readonly hud = new Container();
  private readonly title = new Container();
  private readonly help = new Container();
  private readonly gameOver = new Container();
  private readonly paused = new Container();
  private readonly dim = new Graphics()
    .rect(-400, -400, WIDTH + 800, HEIGHT + 800)
    .fill({ color: 0x000000, alpha: 0.3 });

  private readonly views = new Map<number, AircraftView>();
  private readonly praiseViews = new Map<number, Text>();
  private readonly titleBest: Text;
  private readonly landedText: Text;
  private readonly bestText: Text;
  private readonly fastButton: Container;
  private readonly pauseButton: Container;
  private readonly overCard = new Container();
  private readonly overCount: Text;
  private readonly overHeadline = new Container();
  private glowViews: Graphics[] = [];
  private field: Airfield | null = null;
  private shownLanded = -1;
  private shownBest = -1;
  private shownTitleBest = -1;
  /** The result the game-over headline was drawn for. */
  private shownResult: unknown = undefined;

  constructor(
    root: Container,
    private readonly game: FlightsGame,
  ) {
    this.crashRing.visible = false;

    this.landedText = this.digits();
    this.bestText = this.digits();
    const landed = label('AIRCRAFT LANDED:', 28, COLORS.ink, {
      stroke: { color: 0xffffff, width: 5, join: 'round' },
      letterSpacing: 1,
    });
    landed.anchor.set(0, 0.5);
    landed.position.set(28, 34);
    this.landedText.parent!.position.set(landed.x + landed.width + 64, 34);
    const best = label('HI SCORE:', 28, COLORS.ink, {
      stroke: { color: 0xffffff, width: 5, join: 'round' },
      letterSpacing: 1,
    });
    best.anchor.set(1, 0.5);
    best.position.set(WIDTH - 140, 34);
    this.bestText.parent!.position.set(WIDTH - 82, 34);
    this.fastButton = cornerButton(fastIcon);
    this.fastButton.position.set(FAST_BUTTON.x, FAST_BUTTON.y);
    this.pauseButton = cornerButton(pauseIcon);
    this.pauseButton.position.set(PAUSE_BUTTON.x, PAUSE_BUTTON.y);
    this.hud.addChild(
      landed,
      this.landedText.parent!,
      best,
      this.bestText.parent!,
      this.fastButton,
      this.pauseButton,
    );

    this.titleBest = label('0', 64, COLORS.ink, {});
    this.buildTitle();
    this.buildHelp();
    this.overCount = label('0', 76, COLORS.red, {
      stroke: { color: COLORS.ink, width: 6, join: 'round' },
    });
    this.buildGameOver();
    this.buildPaused();

    root.addChild(
      this.world,
      this.glows,
      this.paths,
      this.shadows,
      this.warnings,
      this.planes,
      this.crashRing,
      this.markers,
      this.praises,
      drawFrame(),
      this.hud,
      this.dim,
      this.title,
      this.help,
      this.gameOver,
      this.paused,
    );
  }

  update(alpha: number, deltaMs: number): void {
    const { sim } = this.game;
    if (sim.field !== this.field) this.loadField(sim.field);
    const phase = sim.phase;
    const inPlay = phase === 'playing' || phase === 'crashed';

    this.syncAircraft(sim.aircraft, alpha, deltaMs);
    this.drawPaths(sim.aircraft, alpha);
    this.syncGlows();
    this.syncMarkers();
    this.syncPraise();
    this.syncCrash();

    this.hud.visible = inPlay || phase === 'gameOver';
    this.fastButton.visible = this.pauseButton.visible = phase === 'playing';
    (this.fastButton.children[0] as Graphics).tint = sim.fast ? 0xffd75a : 0xffffff;
    this.setCount(this.landedText, sim.score, 'shownLanded');
    this.setCount(this.bestText, Math.max(this.game.best, sim.score), 'shownBest');

    this.title.visible = phase === 'title';
    this.help.visible = phase === 'help';
    this.gameOver.visible = phase === 'gameOver';
    this.paused.visible = phase === 'playing' && sim.paused;
    this.dim.visible = !inPlay || sim.paused;
    this.dim.alpha = phase === 'gameOver' ? Math.min(1, sim.phaseTicks / 20) : 1;

    const slide = (c: Container): void => {
      c.y = (1 - easeOut(sim.phaseTicks / 22)) * (HEIGHT + 40);
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

  private loadField(field: Airfield): void {
    this.field = field;
    this.world.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.world.addChild(drawAirfield(field));
    this.glows.removeChildren().forEach((c) => c.destroy());
    this.glowViews = zoneGlow(field);
    this.glows.addChild(...this.glowViews);
  }

  private syncAircraft(aircraft: readonly Aircraft[], alpha: number, deltaMs: number): void {
    const live = new Set<number>();
    const ease = 1 - 0.72 ** (deltaMs / (1000 / 60));
    for (const a of aircraft) {
      live.add(a.id);
      let v = this.views.get(a.id);
      if (!v) {
        v = this.createAircraft(a);
        this.views.set(a.id, v);
      }
      const x = lerp(a.prevX, a.x, alpha);
      const y = lerp(a.prevY, a.y, alpha);
      const heading = lerpAngle(a.prevHeading, a.heading, alpha);
      v.angle += angleDiff(v.angle, heading) * ease;

      const p = landProgress(a);
      const scale = 1 - (a.kind === 'heli' ? 0.4 : 0.3) * easeOut(p);
      const fade = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
      const lift = (1 - easeOut(p)) * (a.kind === 'heli' ? 0.75 : 1);

      v.body.position.set(x, y);
      v.body.rotation = v.angle;
      v.body.scale.set(scale);
      v.body.alpha = fade;
      v.shadow.position.set(x + SHADOW.x * lift, y + SHADOW.y * lift);
      v.shadow.rotation = v.angle;
      v.shadow.scale.set(scale);
      v.shadow.alpha = 0.2 * fade;

      const spin = a.age + alpha;
      const slow = 1 - p;
      if (a.kind === 'heli') v.spinner.rotation = spin * 0.32 * (0.3 + slow * 0.7);
      else v.spinner.scale.y = 0.35 + 0.65 * Math.abs(Math.sin(spin * 0.8 * slow));

      const crashed = this.game.sim.crash?.ids.includes(a.id) ?? false;
      v.warn.visible = a.warning || crashed;
      v.warn.position.set(x, y);
      v.warn.scale.set(crashed ? 1 + 0.12 * Math.sin(this.game.sim.clock * 0.25) : 1);
    }
    for (const [id, v] of this.views) {
      if (live.has(id)) continue;
      v.body.destroy({ children: true });
      v.shadow.destroy();
      v.warn.destroy();
      this.views.delete(id);
    }
  }

  private createAircraft(a: Aircraft): AircraftView {
    const shadow = new Graphics(aircraftContext(a.kind, a.fast, a.radius, true));
    const warn = new Graphics(warningContext(a.radius));
    const body = new Container();
    body.addChild(new Graphics(aircraftContext(a.kind, a.fast, a.radius)));
    const spinner = new Graphics(
      a.kind === 'heli' ? rotorContext(a.radius) : propContext(a.radius),
    );
    const at = spinnerOffset(a.kind, a.radius);
    spinner.position.set(at.x, at.y);
    if (a.kind !== 'jet') body.addChild(spinner);
    this.shadows.addChild(shadow);
    this.warnings.addChild(warn);
    this.planes.addChild(body);
    return { shadow, warn, body, spinner, angle: a.heading };
  }

  /** Each path from where its aircraft is now: solid while free, dashed once it ends on a landing zone. */
  private drawPaths(aircraft: readonly Aircraft[], alpha: number): void {
    const g = this.paths.clear();
    for (const a of aircraft) {
      if (a.state !== 'flying' || a.path.length === 0) continue;
      const pts: Point[] = [
        { x: lerp(a.prevX, a.x, alpha), y: lerp(a.prevY, a.y, alpha) },
        ...a.path,
      ];
      if (a.target) this.dashed(g, pts);
      else {
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
        g.stroke({ width: 3, color: 0xffffff, alpha: 0.85, cap: 'round', join: 'round' });
      }
    }
  }

  /** Dashes are measured back from the path's end, so they stay put while the aircraft eats the path. */
  private dashed(g: Graphics, pts: readonly Point[]): void {
    let total = 0;
    for (let i = 1; i < pts.length; i++)
      total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    let along = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let s = 0;
      while (s < len) {
        const fromEnd = total - (along + s);
        const phase = ((fromEnd % (DASH + GAP)) + DASH + GAP) % (DASH + GAP);
        // Inside a dash while the phase is under DASH; step to whichever boundary comes first.
        const on = phase < DASH;
        const step = Math.min(len - s, on ? Math.max(phase, 0.01) : Math.max(phase - DASH, 0.01));
        if (on) {
          const t0 = s / len;
          const t1 = (s + step) / len;
          g.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0).lineTo(
            a.x + (b.x - a.x) * t1,
            a.y + (b.y - a.y) * t1,
          );
        }
        s += step;
      }
      along += len;
    }
    g.stroke({ width: 4.5, color: 0xffffff, alpha: 0.95, cap: 'round' });
  }

  /** Shows where the aircraft being steered can land. */
  private syncGlows(): void {
    const { sim } = this.game;
    const drawing =
      sim.drawing === null ? undefined : sim.aircraft.find((a) => a.id === sim.drawing);
    const pulse = 0.55 + 0.25 * Math.sin(sim.clock * 0.15);
    this.field?.zones.forEach((zone, i) => {
      const glow = this.glowViews[i]!;
      glow.visible = !!drawing && drawing.kind === zone.kind;
      glow.alpha = pulse;
    });
  }

  private syncMarkers(): void {
    const { arrivals, clock } = this.game.sim;
    while (this.markers.children.length < arrivals.length) this.markers.addChild(arrivalMarker());
    this.markers.children.forEach((m, i) => {
      const arrival = arrivals[i];
      m.visible = !!arrival;
      if (!arrival) return;
      m.position.set(arrival.x, arrival.y);
      // Blinks faster as the arrival nears.
      const rate = arrival.ticks < 60 ? 0.5 : 0.22;
      m.scale.set(1 + 0.12 * Math.sin(clock * rate));
      m.alpha = arrival.ticks < 60 && Math.sin(clock * rate) < -0.6 ? 0.4 : 1;
    });
  }

  private syncPraise(): void {
    const live = new Set<number>();
    for (const p of this.game.sim.praise) {
      live.add(p.id);
      let t = this.praiseViews.get(p.id);
      if (!t) {
        t = label(p.text, 64, 0xffffff, {
          stroke: { color: 0x3f6b28, width: 8, join: 'round' },
          letterSpacing: 2,
          dropShadow: { color: 0x000000, alpha: 0.25, distance: 5, angle: Math.PI / 3, blur: 0 },
        });
        t.rotation = -0.12;
        const half = t.width / 2;
        t.x = Math.max(half + 20, Math.min(WIDTH - half - 20, p.x));
        this.praiseViews.set(p.id, t);
        this.praises.addChild(t);
      }
      const pop =
        p.ticks < 8
          ? easeOut(p.ticks / 8) * 1.2
          : p.ticks < 14
            ? 1.2 - ((p.ticks - 8) / 6) * 0.2
            : 1;
      t.scale.set(pop);
      t.y = Math.max(80, Math.min(HEIGHT - 60, p.y - 30)) - p.ticks * 0.25;
      t.alpha = p.ticks > PRAISE_TICKS - 30 ? (PRAISE_TICKS - p.ticks) / 30 : 1;
    }
    for (const [id, t] of this.praiseViews) {
      if (live.has(id)) continue;
      t.destroy();
      this.praiseViews.delete(id);
    }
  }

  private syncCrash(): void {
    const { crash, clock, phase } = this.game.sim;
    this.crashRing.visible = !!crash && phase !== 'title';
    if (!crash) return;
    const r = 46 + 10 * Math.sin(clock * 0.2);
    this.crashRing
      .clear()
      .circle(crash.x, crash.y, r)
      .stroke({ width: 5, color: COLORS.warn, alpha: 0.9 })
      .circle(crash.x, crash.y, r + 12)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
  }

  /** A five-digit counter: white digits in a black box, its centre at the container's origin. */
  private digits(): Text {
    const box = new Container();
    box.addChild(
      new Graphics()
        .roundRect(-54, -18, 108, 36, 6)
        .fill(0x1e1e1e)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.9 }),
    );
    const t = label('00000', 30, 0xffffff, { letterSpacing: 5 });
    t.y = 1;
    box.addChild(t);
    return t;
  }

  private setCount(t: Text, n: number, key: 'shownLanded' | 'shownBest'): void {
    if (this[key] === n) return;
    this[key] = n;
    t.text = pad(n);
  }

  private card(layer: Container, withLady: boolean): void {
    layer.addChild(paperCard(CARD.x, CARD.y, CARD.w, CARD.h));
    if (!withLady) return;
    const lady = stewardess();
    lady.position.set(580, 92);
    const mask = new Graphics().roundRect(CARD.x, CARD.y, CARD.w, CARD.h, 24).fill(0xffffff);
    lady.mask = mask;
    layer.addChild(mask, lady);
  }

  private buildTitle(): void {
    const layer = this.title;
    this.card(layer, true);
    const mark = logo();
    mark.position.set(330, 180);
    layer.addChild(mark);
    const heading = label('HIGH SCORE:', 34, COLORS.ink, { letterSpacing: 2 });
    heading.position.set(330, 300);
    this.titleBest.position.set(330, 352);
    layer.addChild(heading, this.titleBest);
    layer.addChild(ovalButton(HELP_BUTTON, 'blue', 26, -0.08), ovalButton(PLAY_BUTTON, 'red', 54));
  }

  private buildHelp(): void {
    const layer = this.help;
    this.card(layer, false);
    const heading = label('HOW TO PLAY', 56, COLORS.red, {
      stroke: { color: COLORS.ink, width: 6, join: 'round' },
      letterSpacing: 2,
    });
    heading.position.set(WIDTH / 2, 100);
    layer.addChild(heading);
    const rows: [Parameters<typeof howToRow>[0], string][] = [
      ['jet', 'RED JETS LAND ON THE RED RUNWAY'],
      ['light', 'YELLOW PLANES LAND ON THE YELLOW RUNWAY'],
      ['heli', 'BLUE HELICOPTERS LAND ON THE HELIPAD'],
    ];
    rows.forEach(([kind, text], i) => {
      const row = howToRow(kind, kind === 'jet' ? 90 : 60);
      row.position.set(130, 178 + i * 76);
      const caption = label(text, 25, COLORS.ink, { letterSpacing: 1 });
      caption.anchor.set(0, 0.5);
      caption.position.set(425, 178 + i * 76);
      layer.addChild(row, caption);
    });
    const body = label(
      'DRAG FROM AN AIRCRAFT TO DRAW ITS FLIGHT PATH.\nJOIN A RUNWAY AT ITS ARROWS TO LAND.\nKEEP THEM APART: ONE COLLISION AND IT’S GAME OVER!',
      27,
      COLORS.ink,
      { lineHeight: 36, letterSpacing: 1 },
    );
    body.position.set(WIDTH / 2, 444);
    layer.addChild(body, ovalButton(BACK_BUTTON, 'red', 34));
  }

  private buildGameOver(): void {
    const layer = this.gameOver;
    this.card(layer, true);
    layer.addChild(this.overHeadline);
    const talk = bubble(150, 86, 210, 10);
    talk.position.set(330, 300);
    const landed = label('YOU LANDED', 30, COLORS.ink, { letterSpacing: 1 });
    landed.position.set(330, 248);
    this.overCount.position.set(330, 300);
    const word = label('AIRCRAFT', 30, COLORS.ink, { letterSpacing: 1 });
    word.position.set(330, 352);
    const shake = milkshake();
    shake.scale.set(0.72);
    shake.position.set(120, 492);
    const offer = bubble(96, 46, -86, 24);
    offer.position.set(250, 432);
    const offerText = label('“PLEASE ENJOY THIS\nREFRESHING BEVERAGE”', 18, COLORS.ink, {
      lineHeight: 21,
    });
    offerText.position.set(250, 432);
    this.overCard.addChild(talk, landed, this.overCount, word, shake, offer, offerText);
    layer.addChild(
      this.overCard,
      ovalButton(MENU_BUTTON, 'blue', 28),
      ovalButton(RETRY_BUTTON, 'red', 48),
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
      const top = label('NEW HIGH SCORE', 30, COLORS.red, { letterSpacing: 2 });
      top.position.set(330, 92);
      const main = label('Congratulations!', 58, COLORS.ink, { padding: 20 }, SCRIPT_FONT);
      main.position.set(330, 148);
      main.rotation = -0.04;
      this.overHeadline.addChild(top, main);
    } else {
      const main = label('Oh dear!', 70, COLORS.ink, { padding: 20 }, SCRIPT_FONT);
      main.position.set(330, 128);
      main.rotation = -0.04;
      this.overHeadline.addChild(main);
    }
  }

  private buildPaused(): void {
    const text = label('PAUSED', 96, 0xffffff, {
      stroke: { color: COLORS.ink, width: 10, join: 'round' },
      letterSpacing: 4,
    });
    text.position.set(WIDTH / 2, 240);
    this.paused.addChild(
      text,
      ovalButton(QUIT_BUTTON, 'blue', 30),
      ovalButton(RESUME_BUTTON, 'red', 42),
    );
  }
}
