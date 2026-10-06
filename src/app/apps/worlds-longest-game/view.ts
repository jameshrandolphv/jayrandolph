import { CanvasTextMetrics, Container, FillGradient, Graphics, Text, TextStyle, type TextStyleOptions } from 'pixi.js';
import {
  BACK_BUTTON,
  BAR,
  COIN_R,
  COLORS,
  COLS,
  CONTINUE_BUTTON,
  ENEMY_R,
  FIELD_H,
  FIELD_W,
  HEIGHT,
  NEW_BUTTON,
  PLAYER_SIZE,
  PLAY_BUTTON,
  ROWS,
  START_BUTTON,
  TILE,
  TILE_SAFE,
  TILE_VOID,
  WIDTH,
  type Button,
} from './constants';
import type { LongestGame } from './game';
import { enemyPositionAt, type LevelDef } from './level';

const FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const BODY_FONT = 'Arial, "Helvetica Neue", sans-serif';
const RESOLUTION = 2;
const WALL = 5;

interface Outline {
  color: string;
  width: number;
}

const solid = (color: string, width: number): Outline => ({ color, width });

/**
 * Text with stacked outlines (outermost first). Each layer is its own centred Text so
 * the layers stay aligned whatever the renderer does with stroke padding.
 */
const outlined = (
  text: string,
  size: number,
  fill: TextStyleOptions['fill'],
  outlines: readonly Outline[],
  maxWidth = Infinity,
): Container => {
  const box = new Container();
  const layer = (color: TextStyleOptions['fill'], stroke?: Outline): void => {
    const label = new Text({
      text,
      style: {
        fontFamily: FONT,
        fontWeight: '900',
        fontSize: size,
        fill: color,
        ...(stroke && { stroke: { color: stroke.color, width: stroke.width, join: 'round' as const } }),
      },
      resolution: RESOLUTION,
    });
    label.anchor.set(0.5);
    box.addChild(label);
  };
  for (const outline of outlines) layer(outline.color, outline);
  layer(fill);
  box.scale.set(Math.min(1, maxWidth / box.width));
  return box;
};

const plain = (text: string, size: number, color: string, anchorX: number, font = FONT): Text => {
  const label = new Text({
    text,
    style: { fontFamily: font, fontWeight: font === FONT ? '900' : 'bold', fontSize: size, fill: color },
    resolution: RESOLUTION,
  });
  label.anchor.set(anchorX, 0.5);
  return label;
};

const dot = (radius: number, color: number): Graphics =>
  new Graphics().circle(0, 0, radius).fill(0x000000).circle(0, 0, radius - 3).fill(color);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface Run {
  text: string;
  color?: string;
}

const INSTRUCTIONS: readonly Run[] = [
  { text: 'You are the ' },
  { text: 'red', color: '#d00000' },
  { text: 'square. Avoid the' },
  { text: 'blue', color: '#0000d0' },
  { text: 'circles and collect the' },
  { text: 'yellow', color: '#a89400' },
  { text: 'circles. Once you have collected all of the yellow circles, move to the' },
  { text: 'green', color: '#1a8a1a' },
  {
    text:
      'zone to complete the level. Some levels consist of more than one zone; the intermediary zones act as ' +
      'check points. The levels never end, and each one is harder than the last. Your deaths are counted; ' +
      'the fewer, the better.',
  },
];

/** Draws a LongestSim; nothing here changes game state. */
export class LongestView {
  private readonly backdrop = new Graphics();
  private readonly titleLayer = new Container();
  private readonly instructionsLayer = new Container();
  private readonly introLayer = new Container();
  private readonly playLayer = new Container();
  private readonly hud = new Container();
  private readonly levelText = plain('', 30, '#ffffff', 0, BODY_FONT);
  /** Drawn larger because the glyph is much shorter than the digits beside it. */
  private readonly infinityText = plain('∞', 56, '#ffffff', 0, BODY_FONT);
  private readonly deathText = plain('', 30, '#ffffff', 1, BODY_FONT);
  private readonly bestText = plain('', 30, '#000000', 0.5, BODY_FONT);
  private readonly field = new Container();
  private readonly player = new Graphics();
  private coinViews: Graphics[] = [];
  private enemyViews: Graphics[] = [];
  private titleButtons = new Container();
  private introLabel = new Container();
  private shown: LevelDef | null = null;
  private shownLevel = -1;
  private shownDeaths = -1;
  private shownBest = -1;
  private shownResumable = -1;

  constructor(
    root: Container,
    private readonly game: LongestGame,
  ) {
    this.backdrop
      .rect(0, 0, WIDTH, HEIGHT)
      .fill(
        new FillGradient({
          type: 'linear',
          start: { x: 0, y: 0 },
          end: { x: 0, y: 1 },
          colorStops: [
            { offset: 0, color: COLORS.skyTop },
            { offset: 1, color: COLORS.skyBottom },
          ],
          textureSpace: 'local',
        }),
      );

    this.buildTitle();
    this.buildInstructions();

    this.field.y = BAR;
    this.field.addChild(this.player);
    this.player.rect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE).fill(0x000000);
    this.player.rect(-PLAYER_SIZE / 2 + 4, -PLAYER_SIZE / 2 + 4, PLAYER_SIZE - 8, PLAYER_SIZE - 8).fill(COLORS.player);
    this.playLayer.addChild(this.field);

    const bars = new Graphics().rect(0, 0, WIDTH, BAR).rect(0, HEIGHT - BAR, WIDTH, BAR).fill(0x000000);
    const menu = plain('MENU', 30, '#ffffff', 0, BODY_FONT);
    menu.position.set(20, BAR / 2);
    this.levelText.y = this.infinityText.y = BAR / 2;
    this.deathText.position.set(WIDTH - 20, BAR / 2);
    this.hud.addChild(menu, this.levelText, this.infinityText, this.deathText);

    this.bestText.position.set(WIDTH / 2, 630);
    this.titleLayer.addChild(this.bestText);

    root.addChild(this.backdrop, this.titleLayer, this.instructionsLayer, this.introLayer, this.playLayer, bars, this.hud);
  }

  update(alpha: number): void {
    const { sim } = this.game;
    const phase = sim.phase;
    const playing = phase === 'playing' || phase === 'dying';

    this.backdrop.visible = !playing;
    this.titleLayer.visible = phase === 'title';
    this.instructionsLayer.visible = phase === 'instructions';
    this.introLayer.visible = phase === 'intro';
    this.playLayer.visible = playing;
    this.hud.visible = phase === 'intro' || playing;

    if (phase === 'title') {
      this.updateBest();
      this.updateTitleButtons();
    }
    if (sim.def && sim.def !== this.shown) this.loadLevel(sim.def);

    if (sim.level !== this.shownLevel) {
      this.shownLevel = sim.level;
      // A thin space keeps the number from crowding the slash.
      this.levelText.text = `${sim.level}\u2009/`;
      const left = (WIDTH - this.levelText.width - this.infinityText.width) / 2;
      this.levelText.x = left;
      this.infinityText.x = left + this.levelText.width;
      this.showIntro(sim.level);
    }
    if (sim.deaths !== this.shownDeaths) {
      this.shownDeaths = sim.deaths;
      this.deathText.text = `DEATHS: ${sim.deaths}`;
    }
    if (!playing || !sim.def) return;

    this.player.position.set(lerp(sim.prevX, sim.x, alpha), lerp(sim.prevY, sim.y, alpha));
    this.player.alpha = 1 - sim.deathProgress;
    this.player.scale.set(1 + sim.deathProgress * 0.6);

    const tick = sim.tick + alpha;
    sim.def.enemies.forEach((enemy, i) => {
      const p = enemyPositionAt(enemy, tick);
      this.enemyViews[i]!.position.set(p.x, p.y);
    });
    this.coinViews.forEach((view, i) => (view.visible = !sim.collected[i]));
  }

  private updateBest(): void {
    const { best } = this.game;
    if (best === this.shownBest) return;
    this.shownBest = best;
    this.bestText.text = best > 0 ? `BEST: LEVEL ${best}` : '';
  }

  private updateTitleButtons(): void {
    const { resumable } = this.game;
    if (resumable === this.shownResumable) return;
    this.shownResumable = resumable;
    this.titleButtons.destroy({ children: true });
    this.titleButtons = new Container();
    if (resumable) {
      const label = ['CONTINUE', `LEVEL ${resumable}`];
      this.titleButtons.addChild(
        this.button({ ...CONTINUE_BUTTON, label }, 64, '#e81818'),
        this.button(NEW_BUTTON, 64, '#c58af2'),
      );
    } else {
      this.titleButtons.addChild(this.button(PLAY_BUTTON, 76, '#e81818'));
    }
    this.titleLayer.addChild(this.titleButtons);
  }

  private buildTitle(): void {
    const layer = this.titleLayer;
    const sub = outlined("THE WORLD'S...", 48, '#000000', [solid('#ffffff', 10)]);
    sub.position.set(WIDTH / 2 - 170, 170);
    const blue = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: '#6a9cec' },
        { offset: 0.5, color: '#2d62bb' },
        { offset: 0.51, color: '#2252a6' },
        { offset: 1, color: '#4a84dc' },
      ],
      textureSpace: 'local',
    });
    const title = outlined('LONGEST GAME', 130, blue, [solid('#ffffff', 22), solid('#000000', 12)], 880);
    title.position.set(WIDTH / 2, 270);
    const version = outlined('VERSION 1.0', 34, '#000000', [solid('#ffffff', 8)]);
    version.position.set(WIDTH - 190, 350);
    layer.addChild(sub, title, version);
  }

  private buildInstructions(): void {
    const layer = this.instructionsLayer;
    const size = 34;
    const left = 48;
    const width = WIDTH - left * 2;
    const base: TextStyleOptions = { fontFamily: BODY_FONT, fontSize: size };
    const space = size * 0.28;

    const words: { text: string; color: string; bold: boolean; w: number }[] = [];
    for (const run of INSTRUCTIONS) {
      for (const word of run.text.split(/\s+/).filter(Boolean)) {
        const style = new TextStyle({ ...base, fontWeight: run.color ? 'bold' : 'normal' });
        words.push({
          text: word,
          color: run.color ?? '#000000',
          bold: !!run.color,
          w: CanvasTextMetrics.measureText(word, style).width,
        });
      }
    }

    const lines: (typeof words)[] = [[]];
    let used = 0;
    for (const word of words) {
      const line = lines[lines.length - 1]!;
      const next = used + (line.length ? space : 0) + word.w;
      if (line.length && next > width) {
        lines.push([word]);
        used = word.w;
      } else {
        line.push(word);
        used = next;
      }
    }

    const lineHeight = size * 1.3;
    lines.forEach((line, row) => {
      const last = row === lines.length - 1;
      const natural = line.reduce((sum, word) => sum + word.w, 0);
      const gap = last || line.length < 2 ? space : (width - natural) / (line.length - 1);
      let x = left;
      for (const word of line) {
        const label = new Text({
          text: word.text,
          style: { ...base, fontWeight: word.bold ? 'bold' : 'normal', fill: word.color },
          resolution: RESOLUTION,
        });
        label.anchor.set(0, 0.5);
        label.position.set(x, 90 + row * lineHeight);
        layer.addChild(label);
        x += word.w + gap;
      }
    });

    layer.addChild(this.button(BACK_BUTTON, 52, '#c58af2'), this.button(START_BUTTON, 52, '#e81818'));
  }

  private button(button: Button, size: number, fill: string): Container {
    const box = new Container();
    const lineHeight = size * 1.1;
    const cx = button.x + button.w / 2;
    const cy = button.y + button.h / 2;
    button.label.forEach((line, i) => {
      const label = outlined(line, size, fill, [solid('#ffffff', 16), solid('#000000', 9)], button.w);
      label.position.set(cx, cy + (i - (button.label.length - 1) / 2) * lineHeight);
      box.addChild(label);
    });
    return box;
  }

  private showIntro(level: number): void {
    this.introLabel.destroy({ children: true });
    this.introLabel = outlined(`LEVEL ${level}`, 120, '#000000', [], WIDTH - 80);
    this.introLabel.position.set(WIDTH / 2, HEIGHT / 2);
    this.introLayer.addChild(this.introLabel);
  }

  private loadLevel(def: LevelDef): void {
    this.shown = def;
    this.field.removeChild(this.player);
    this.field.removeChildren().forEach((child) => child.destroy({ children: true }));

    const level = new Graphics().rect(0, 0, FIELD_W, FIELD_H).fill(COLORS.void);
    const tile = (c: number, r: number): number =>
      c < 0 || r < 0 || c >= COLS || r >= ROWS ? TILE_VOID : def.tiles[r * COLS + c]!;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = tile(c, r);
        if (t === TILE_VOID) continue;
        const color = t === TILE_SAFE ? COLORS.safe : (c + r) % 2 === 0 ? COLORS.floorA : COLORS.floorB;
        level.rect(c * TILE, r * TILE, TILE, TILE).fill(color);
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (tile(c, r) === TILE_VOID) continue;
        const x = c * TILE;
        const y = r * TILE;
        if (tile(c, r - 1) === TILE_VOID) level.moveTo(x, y).lineTo(x + TILE, y);
        if (tile(c, r + 1) === TILE_VOID) level.moveTo(x, y + TILE).lineTo(x + TILE, y + TILE);
        if (tile(c - 1, r) === TILE_VOID) level.moveTo(x, y).lineTo(x, y + TILE);
        if (tile(c + 1, r) === TILE_VOID) level.moveTo(x + TILE, y).lineTo(x + TILE, y + TILE);
      }
    }
    level.stroke({ width: WALL, color: COLORS.line, cap: 'square' });
    this.field.addChild(level);

    this.coinViews = def.coins.map((coin) => {
      const view = dot(COIN_R, COLORS.coin);
      view.position.set(coin.x, coin.y);
      this.field.addChild(view);
      return view;
    });
    this.field.addChild(this.player);
    this.enemyViews = def.enemies.map(() => {
      const view = dot(ENEMY_R, COLORS.enemy);
      this.field.addChild(view);
      return view;
    });
  }
}
