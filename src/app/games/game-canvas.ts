import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { Application, Container, Graphics } from 'pixi.js';
import { attachPerfOverlay } from './perf-overlay';

/** The logical x range currently on screen; wider than 0 to the logical width when the canvas is extended. */
export interface VisibleBounds {
  left: number;
  right: number;
}

export interface GameSurface {
  readonly app: Application;
  /** Updated in place whenever the canvas is resized. */
  readonly bounds: VisibleBounds;
  /** Draw here in logical pixels; it is scaled to the canvas and clipped to the logical bounds. */
  readonly root: Container;
}

export interface LogicalPoint {
  x: number;
  y: number;
}

const preventDefault = (event: Event): void => {
  if (event.cancelable) event.preventDefault();
};

/** Fixed-resolution pixel-art canvas that scales by whole device pixels and centres itself. */
@Component({
  selector: 'app-game-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'application', '[attr.aria-label]': 'label()' },
  template: `<div #host class="game-host"></div>`,
  styles: `
    :host {
      display: flex;
      flex: 1 1 0;
      min-height: 0;
    }
    .game-host {
      position: relative;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
      cursor: pointer;
    }
    .game-host canvas {
      position: absolute;
      inset: 0;
      display: block;
    }
  `,
})
export class GameCanvas {
  readonly logicalWidth = input.required<number>();
  readonly logicalHeight = input.required<number>();
  readonly background = input('#000000');
  readonly label = input('Game');
  /** When false the art scales fractionally to fill the host instead of snapping to whole device pixels. */
  readonly integerScale = input(true);
  /**
   * When the host is wider than the logical area, reveal the extra width on both sides instead of leaving bars,
   * for games that draw their world across it (see `GameSurface.bounds`).
   */
  readonly extendWidth = input(false);
  /** Read once when the canvas is created. */
  readonly antialias = input(false);
  readonly ready = output<GameSurface>();
  readonly press = output<LogicalPoint>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private app?: Application;
  private root?: Container;
  private clip?: Graphics;
  private readonly bounds: VisibleBounds = { left: 0, right: 0 };
  private observer?: ResizeObserver;
  private destroyed = false;
  private touchTarget?: HTMLElement;
  private detachPerf?: () => void;
  private scale = 1;
  private offset: LogicalPoint = { x: 0, y: 0 };

  constructor() {
    afterNextRender(() => void this.init());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.observer?.disconnect();
      this.detachPerf?.();
      this.touchTarget?.removeEventListener('touchend', preventDefault);
      this.touchTarget?.removeEventListener('pointerdown', this.onPointerDown);
      this.app?.destroy(true, { children: true, texture: true });
      this.app = undefined;
    });
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.press.emit({
      x: (event.clientX - rect.left - this.offset.x) / this.scale,
      y: (event.clientY - rect.top - this.offset.y) / this.scale,
    });
  };

  private async init(): Promise<void> {
    const { Application, Container, Graphics } = await import('pixi.js');
    if (this.destroyed) return;

    const el = this.host().nativeElement;
    const app = new Application();
    await app.init({
      width: Math.max(el.clientWidth, 1),
      height: Math.max(el.clientHeight, 1),
      background: this.background(),
      antialias: this.antialias(),
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, Number(new URLSearchParams(location.search).get('res')) || Infinity),
      roundPixels: !this.antialias(),
    });
    if (this.destroyed) {
      app.destroy(true, { children: true, texture: true });
      return;
    }

    const root = new Container();
    const clip = new Graphics();
    this.clip = clip;
    this.bounds.right = this.logicalWidth();
    root.addChild(clip);
    root.mask = clip;
    app.stage.addChild(root);
    el.appendChild(app.canvas);
    // iOS Safari can still zoom on a double tap despite touch-action; cancelling touchend stops that. It runs after the
    // press has been handled, so unlike a touchstart handler it can't hold up input.
    el.addEventListener('touchend', preventDefault, { passive: false });
    // Added by hand rather than in the template: a template listener makes Angular run change detection after every tap.
    el.addEventListener('pointerdown', this.onPointerDown);
    this.touchTarget = el;
    this.app = app;
    this.root = root;

    if (new URLSearchParams(location.search).has('perf')) this.detachPerf = attachPerfOverlay(app, el);

    this.layout();
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(el);
    this.ready.emit({ app, root, bounds: this.bounds });
  }

  private layout(): void {
    const { app, root } = this;
    if (!app || !root) return;
    const el = this.host().nativeElement;
    const w = Math.max(el.clientWidth, 1);
    const h = Math.max(el.clientHeight, 1);
    const dpr = app.renderer.resolution;
    app.renderer.resize(w, h);

    const fit = Math.min(w / this.logicalWidth(), h / this.logicalHeight());
    // Whole device pixels per logical pixel keep the art crisp; tiny viewports fall back to a fraction.
    this.scale = !this.integerScale() || fit * dpr < 1 ? fit : Math.floor(fit * dpr) / dpr;
    this.offset = {
      x: Math.floor(((w - this.logicalWidth() * this.scale) / 2) * dpr) / dpr,
      y: Math.floor(((h - this.logicalHeight() * this.scale) / 2) * dpr) / dpr,
    };
    root.scale.set(this.scale);
    root.position.set(this.offset.x, this.offset.y);

    // Whole logical pixels, so the clip edge never lands mid-pixel.
    const extend = this.extendWidth();
    this.bounds.left = extend ? Math.floor(-this.offset.x / this.scale) : 0;
    this.bounds.right = extend ? Math.ceil((w - this.offset.x) / this.scale) : this.logicalWidth();
    this.clip
      ?.clear()
      .rect(this.bounds.left, 0, this.bounds.right - this.bounds.left, this.logicalHeight())
      .fill(0xffffff);
  }
}
