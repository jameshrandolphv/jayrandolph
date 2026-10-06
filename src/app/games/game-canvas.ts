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
import type { Application, Container } from 'pixi.js';

export interface GameSurface {
  readonly app: Application;
  /** Draw here in logical pixels; it is scaled to the canvas and clipped to the logical bounds. */
  readonly root: Container;
}

export interface LogicalPoint {
  x: number;
  y: number;
}

/** Fixed-resolution pixel-art canvas that scales by whole device pixels and centres itself. */
@Component({
  selector: 'app-game-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'application', '[attr.aria-label]': 'label()' },
  template: `<div #host class="game-host" (pointerdown)="onPointerDown($event)" (touchstart)="$event.preventDefault()"></div>`,
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
  /** Read once when the canvas is created. */
  readonly antialias = input(false);
  readonly ready = output<GameSurface>();
  readonly press = output<LogicalPoint>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private app?: Application;
  private root?: Container;
  private observer?: ResizeObserver;
  private destroyed = false;
  private scale = 1;
  private offset: LogicalPoint = { x: 0, y: 0 };

  constructor() {
    afterNextRender(() => void this.init());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.observer?.disconnect();
      this.app?.destroy(true, { children: true, texture: true });
      this.app = undefined;
    });
  }

  protected onPointerDown(event: PointerEvent): void {
    const rect = this.host().nativeElement.getBoundingClientRect();
    this.press.emit({
      x: (event.clientX - rect.left - this.offset.x) / this.scale,
      y: (event.clientY - rect.top - this.offset.y) / this.scale,
    });
  }

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
      resolution: window.devicePixelRatio || 1,
      roundPixels: !this.antialias(),
    });
    if (this.destroyed) {
      app.destroy(true, { children: true, texture: true });
      return;
    }

    const root = new Container();
    const clip = new Graphics().rect(0, 0, this.logicalWidth(), this.logicalHeight()).fill(0xffffff);
    root.addChild(clip);
    root.mask = clip;
    app.stage.addChild(root);
    el.appendChild(app.canvas);
    this.app = app;
    this.root = root;

    this.layout();
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(el);
    this.ready.emit({ app, root });
  }

  private layout(): void {
    const { app, root } = this;
    if (!app || !root) return;
    const el = this.host().nativeElement;
    const w = Math.max(el.clientWidth, 1);
    const h = Math.max(el.clientHeight, 1);
    const dpr = window.devicePixelRatio || 1;
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
  }
}
