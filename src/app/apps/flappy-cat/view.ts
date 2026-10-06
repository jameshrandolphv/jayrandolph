import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { renderText, textWidth, type TextStyle } from '../../games/pixel-font';
import type { Pixels } from '../../games/pixels';
import type { ScoreResult } from '../../games/score.service';
import {
  FLASH_TICKS,
  GROUND_H,
  GROUND_Y,
  HEIGHT,
  OK_BUTTON,
  PAUSE_BUTTON,
  PIPE_GAP,
  PIPE_W,
  START_BUTTON,
  WIDTH,
} from './constants';
import type { FlappySim, Pipe } from './sim';
import {
  BUSH_H,
  CAT_ANCHOR,
  CITY_H,
  CLOUD_H,
  COLORS,
  PIPE_CAP_H,
  createArrow,
  createBushes,
  createButton,
  createCatFrames,
  createCity,
  createClouds,
  createGround,
  createMedal,
  createMedalSlot,
  createPanel,
  createPauseButton,
  createPipeBody,
  createPipeCap,
  createTapHand,
  createTapTag,
  gameOverStyle,
  logoStyle,
  panelLabelStyle,
  pausedStyle,
  readyStyle,
  scoreStyle,
  smallScoreStyle,
} from './sprites';

const PANEL = { x: 13, y: 94, w: 118, h: 64 };
const CAT_FLAP_FRAMES = [0, 1, 2, 1];

const texture = (pixels: Pixels, repeat = false): Texture => {
  const tex = Texture.from(pixels.toCanvas());
  tex.source.scaleMode = 'nearest';
  if (repeat) tex.source.addressMode = 'repeat';
  return tex;
};

const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** Draws the sim's state with Pixi; owns no game rules. */
export class FlappyView {
  private readonly clouds: TilingSprite;
  private readonly city: TilingSprite;
  private readonly bushes: TilingSprite;
  private readonly ground: TilingSprite;
  private readonly pipes = new Container();
  private readonly pipeViews = new Map<number, Container>();
  private readonly pipeBody = texture(createPipeBody());
  private readonly pipeCap = texture(createPipeCap());
  private readonly catFrames = createCatFrames().map((p) => texture(p));
  private readonly cat: Sprite;
  private readonly flash: Sprite;

  private readonly textCache = new Map<TextStyle, Map<string, Texture>>();

  private readonly title = new Container();
  private readonly ready = new Container();
  private readonly hud = new Container();
  private readonly gameOver = new Container();
  private readonly paused = new Container();

  private readonly scoreSprite = new Sprite();
  private readonly pauseButton: Sprite;
  private readonly pauseTextures = [texture(createPauseButton(false)), texture(createPauseButton(true))];
  private readonly ghost: Sprite;
  private readonly hand: Sprite;

  private readonly goTitle: Sprite;
  private readonly goPanel = new Container();
  private readonly goScore = new Sprite();
  private readonly goBest = new Sprite();
  private readonly goMedal: Sprite;
  private readonly goOk: Sprite;
  private shownScore = -1;
  private shownBest = -1;

  constructor(
    root: Container,
    private readonly sim: FlappySim,
  ) {
    const sky = new Sprite(Texture.WHITE);
    sky.tint = COLORS.sky;
    sky.width = WIDTH;
    sky.height = HEIGHT;

    this.clouds = this.tiled(createClouds(WIDTH), 0, GROUND_Y - CLOUD_H, WIDTH);
    this.city = this.tiled(createCity(WIDTH), 0, GROUND_Y - CITY_H, WIDTH);
    this.bushes = this.tiled(createBushes(WIDTH), 0, GROUND_Y - BUSH_H, WIDTH);
    this.ground = this.tiled(createGround(), 0, GROUND_Y, WIDTH, GROUND_H);

    this.cat = new Sprite(this.catFrames[1]);
    this.cat.anchor.set(CAT_ANCHOR.x, CAT_ANCHOR.y);

    this.flash = new Sprite(Texture.WHITE);
    this.flash.width = WIDTH;
    this.flash.height = HEIGHT;
    this.flash.alpha = 0;

    // Title screen
    this.addCentered(this.title, this.text('Flappy Cat', logoStyle), 52);
    this.addAt(this.title, this.button('START'), START_BUTTON.x, START_BUTTON.y);

    // Get Ready screen
    this.addCentered(this.ready, this.text('Get Ready', readyStyle), 62);
    this.ghost = new Sprite(this.catFrames[1]);
    this.ghost.anchor.set(CAT_ANCHOR.x, CAT_ANCHOR.y);
    this.ghost.alpha = 0.6;
    this.ghost.tint = 0xb4c6ce;
    this.ghost.position.set(WIDTH / 2, 124);
    this.ready.addChild(this.ghost);
    this.addCentered(this.ready, new Sprite(texture(createArrow())), 142);
    this.hand = new Sprite(texture(createTapHand()));
    this.hand.x = WIDTH / 2 - 5;
    this.ready.addChild(this.hand);
    this.addAt(this.ready, new Sprite(texture(createTapTag())), WIDTH / 2 + 10, 158);

    // HUD
    this.pauseButton = new Sprite(this.pauseTextures[0]);
    this.pauseButton.position.set(PAUSE_BUTTON.x, PAUSE_BUTTON.y);
    this.hud.addChild(this.scoreSprite, this.pauseButton);

    // Paused overlay
    const dim = new Sprite(Texture.WHITE);
    dim.tint = 0x000000;
    dim.alpha = 0.35;
    dim.width = WIDTH;
    dim.height = HEIGHT;
    this.paused.addChild(dim);
    this.addCentered(this.paused, this.text('Paused', pausedStyle), 100);

    // Game over screen
    this.goTitle = this.text('Game Over', gameOverStyle);
    this.goTitle.x = Math.round((WIDTH - this.goTitle.width) / 2);
    this.goPanel.addChild(new Sprite(texture(createPanel(PANEL.w, PANEL.h))));
    this.goPanel.addChild(new Sprite(texture(createMedalSlot())));
    this.goPanel.children[1].position.set(10, 24);
    this.goMedal = new Sprite(texture(createMedal()));
    this.goMedal.position.set(10, 24);
    this.addAt(this.goPanel, this.text('MEDAL', panelLabelStyle), 10, 9);
    this.addAt(this.goPanel, this.text('SCORE', panelLabelStyle), PANEL.w - 10 - textWidth('SCORE'), 9);
    this.addAt(this.goPanel, this.text('BEST', panelLabelStyle), PANEL.w - 10 - textWidth('BEST'), 36);
    this.goPanel.addChild(this.goMedal, this.goScore, this.goBest);
    this.goOk = this.button('OK');
    this.goOk.position.set(OK_BUTTON.x, OK_BUTTON.y);
    this.gameOver.addChild(this.goTitle, this.goPanel, this.goOk);

    root.addChild(
      sky,
      this.clouds,
      this.city,
      this.bushes,
      this.pipes,
      this.ground,
      this.cat,
      this.title,
      this.ready,
      this.hud,
      this.gameOver,
      this.paused,
      this.flash,
    );
  }

  update(result: ScoreResult | null): void {
    const { sim } = this;
    const phase = sim.phase;

    this.clouds.tilePosition.x = -sim.scrollX * 0.12;
    this.city.tilePosition.x = -sim.scrollX * 0.3;
    this.bushes.tilePosition.x = -sim.scrollX * 0.6;
    this.ground.tilePosition.x = -sim.scrollX;
    this.syncPipes(sim.pipes);

    const alive = phase !== 'dying' && phase !== 'gameOver';
    const frame = alive ? CAT_FLAP_FRAMES[Math.floor(sim.clock / 4) % CAT_FLAP_FRAMES.length] : 1;
    this.cat.texture = this.catFrames[frame];
    this.cat.position.set(phase === 'title' ? WIDTH / 2 : 44, Math.round(sim.catY));
    this.cat.rotation = phase === 'title' || phase === 'ready' ? 0 : Math.max(-0.45, Math.min(1.3, sim.catVy * 0.28));
    this.cat.x = Math.round(this.cat.x);

    this.title.visible = phase === 'title';
    this.ready.visible = phase === 'ready';
    this.hud.visible = phase === 'ready' || phase === 'playing' || phase === 'dying';
    this.pauseButton.visible = phase === 'playing';
    this.pauseButton.texture = this.pauseTextures[sim.paused ? 1 : 0];
    this.paused.visible = sim.paused;
    this.gameOver.visible = phase === 'gameOver';
    this.flash.alpha = (sim.flash / FLASH_TICKS) * 0.8;

    if (this.hud.visible) this.setScore(this.scoreSprite, String(sim.score), scoreStyle, 20);
    if (this.ready.visible) {
      this.ghost.texture = this.catFrames[CAT_FLAP_FRAMES[Math.floor(sim.clock / 8) % CAT_FLAP_FRAMES.length]];
      this.hand.y = 154 + (Math.floor(sim.clock / 14) % 2) * 2;
    }
    if (this.gameOver.visible) this.updateGameOver(result);
  }

  private updateGameOver(result: ScoreResult | null): void {
    const t = this.sim.phaseTicks;
    this.goTitle.y = Math.round(62 - (1 - easeOut(t / 12)) * 24);
    this.goTitle.alpha = Math.min(1, t / 6);
    this.goPanel.position.set(PANEL.x, Math.round(PANEL.y + (1 - easeOut((t - 12) / 14)) * 160));
    this.goOk.visible = t >= 26;

    const total = this.sim.score;
    const counted = Math.min(total, Math.ceil((Math.max(0, t - 26) * total) / Math.max(1, Math.min(total * 2, 50))));
    const done = counted >= total;
    if (counted !== this.shownScore) {
      this.shownScore = counted;
      this.goScore.texture = this.textTexture(String(counted), smallScoreStyle);
      this.goScore.position.set(PANEL.w - 10 - this.goScore.width, 18);
    }

    const best = result?.best ?? -1;
    this.goBest.visible = best >= 0 && done;
    if (best !== this.shownBest) {
      this.shownBest = best;
      if (best >= 0) {
        this.goBest.texture = this.textTexture(String(best), smallScoreStyle);
        this.goBest.position.set(PANEL.w - 10 - this.goBest.width, 45);
      }
    }
    this.goMedal.visible = done && !!result?.isNewBest;
  }

  private syncPipes(pipes: readonly Pipe[]): void {
    const live = new Set<number>();
    for (const pipe of pipes) {
      live.add(pipe.id);
      let view = this.pipeViews.get(pipe.id);
      if (!view) {
        view = this.createPipe(pipe);
        this.pipeViews.set(pipe.id, view);
        this.pipes.addChild(view);
      }
      view.x = Math.round(pipe.x);
    }
    for (const [id, view] of this.pipeViews) {
      if (live.has(id)) continue;
      view.destroy({ children: true });
      this.pipeViews.delete(id);
    }
  }

  private createPipe(pipe: Pipe): Container {
    const view = new Container();
    const gapTop = Math.round(pipe.gapY - PIPE_GAP / 2);
    const gapBottom = gapTop + PIPE_GAP;
    const capInset = (PIPE_W - this.pipeBody.width) / 2;

    const topBody = new Sprite(this.pipeBody);
    topBody.position.set(capInset, 0);
    topBody.height = Math.max(0, gapTop - PIPE_CAP_H);
    const topCap = new Sprite(this.pipeCap);
    topCap.y = gapTop - PIPE_CAP_H;

    const bottomCap = new Sprite(this.pipeCap);
    bottomCap.y = gapBottom;
    const bottomBody = new Sprite(this.pipeBody);
    bottomBody.position.set(capInset, gapBottom + PIPE_CAP_H);
    bottomBody.height = Math.max(0, GROUND_Y - gapBottom - PIPE_CAP_H);

    view.addChild(topBody, topCap, bottomBody, bottomCap);
    return view;
  }

  private tiled(pixels: Pixels, x: number, y: number, width: number, height = pixels.height): TilingSprite {
    const sprite = new TilingSprite({ texture: texture(pixels, true), width, height });
    sprite.position.set(x, y);
    return sprite;
  }

  private textTexture(text: string, style: TextStyle): Texture {
    let cache = this.textCache.get(style);
    if (!cache) this.textCache.set(style, (cache = new Map()));
    let tex = cache.get(text);
    if (!tex) cache.set(text, (tex = texture(renderText(text, style))));
    return tex;
  }

  private text(text: string, style: TextStyle): Sprite {
    return new Sprite(this.textTexture(text, style));
  }

  private button(label: string): Sprite {
    return new Sprite(texture(createButton(label)));
  }

  private setScore(sprite: Sprite, text: string, style: TextStyle, y: number): void {
    sprite.texture = this.textTexture(text, style);
    sprite.position.set(Math.round((WIDTH - sprite.width) / 2), y);
  }

  private addAt(parent: Container, sprite: Sprite, x: number, y: number): void {
    sprite.position.set(x, y);
    parent.addChild(sprite);
  }

  private addCentered(parent: Container, sprite: Sprite, y: number): void {
    this.addAt(parent, sprite, Math.round((WIDTH - sprite.width) / 2), y);
  }
}
