import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { SessionService } from '../core/session.service';
import type { PreviewImage } from '../core/preview';

const FIT_PADDING = 8;

function draw(el: HTMLCanvasElement, img: PreviewImage): void {
  el.width = img.width;
  el.height = img.height;
  el.getContext('2d')?.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
}

@Component({
  selector: 'app-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (frame(); as f) {
      <div
        class="frame"
        [style.left.px]="f.left"
        [style.top.px]="f.top"
        [style.width.px]="f.width"
        [style.height.px]="f.height"
      >
        <canvas #after class="layer"></canvas>
        <canvas
          #before
          class="layer"
          [class.hidden]="!session.split()"
          [style.clip-path]="beforeClip()"
        ></canvas>
      </div>
    }
    @if (session.split() && frame()) {
      <span class="tag tag-before">Before</span>
      <span class="tag tag-after">After</span>
      <div
        class="divider"
        role="slider"
        tabindex="0"
        aria-label="Before and after split"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-valuenow]="(splitFraction() * 100).toFixed(0)"
        [style.left.px]="splitPx()"
        (pointerdown)="onDividerDown($event)"
        (pointermove)="onDividerMove($event)"
        (pointerup)="onDividerUp($event)"
        (pointercancel)="onDividerUp($event)"
        (keydown)="onDividerKey($event)"
      >
        <span class="grip"></span>
      </div>
    }
    @if (!session.before()) {
      <p class="viewer-empty">Drop an image here</p>
    }
  `,
  host: {
    class: 'viewer',
    '[class.panning]': 'session.zoom() === "actual"',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerUp($event)',
  },
})
export class Viewer implements OnDestroy {
  protected readonly session = inject(SessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly beforeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('before');
  private readonly afterCanvas = viewChild<ElementRef<HTMLCanvasElement>>('after');
  private observer: ResizeObserver | null = null;
  private dragging = false;
  private draggingDivider = false;
  protected readonly splitFraction = signal(0.5);

  /** Viewer size in CSS pixels. */
  private readonly box = computed(() => {
    const vp = this.session.viewport();
    const dpr = devicePixelRatio || 1;
    return { w: vp.w / dpr, h: vp.h / dpr };
  });

  /** CSS rectangle the images occupy inside the viewer. */
  protected readonly frame = computed(() => {
    const img = this.session.before();
    if (!img) return null;
    const dpr = devicePixelRatio || 1;
    const vp = this.session.viewport();
    const c = this.session.center();
    if (img.origin && c && this.session.zoom() === 'actual') {
      return {
        left: (img.origin.x - (c.x - vp.w / 2)) / dpr,
        top: (img.origin.y - (c.y - vp.h / 2)) / dpr,
        width: img.width / dpr,
        height: img.height / dpr,
      };
    }
    const { w, h } = this.box();
    const scale = Math.min((w - 2 * FIT_PADDING) / img.width, (h - 2 * FIT_PADDING) / img.height);
    if (!(scale > 0)) return null;
    const width = img.width * scale;
    const height = img.height * scale;
    return { left: (w - width) / 2, top: (h - height) / 2, width, height };
  });

  protected readonly splitPx = computed(() => this.splitFraction() * this.box().w);
  protected readonly beforeClip = computed(() => {
    const f = this.frame();
    if (!f || !this.session.split()) return null;
    const right = Math.min(f.width, Math.max(0, f.width - (this.splitPx() - f.left)));
    return `inset(0 ${right}px 0 0)`;
  });

  constructor() {
    effect(() => {
      const before = this.session.before();
      const after = this.session.after();
      const b = this.beforeCanvas()?.nativeElement;
      const a = this.afterCanvas()?.nativeElement;
      if (before && b) draw(b, before);
      if (after && a) draw(a, after);
    });
    afterNextRender(() => {
      const el = this.host.nativeElement;
      const report = () => {
        const dpr = devicePixelRatio || 1;
        this.session.viewport.set({ w: el.clientWidth * dpr, h: el.clientHeight * dpr });
      };
      report();
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(report);
        this.observer.observe(el);
      }
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.session.zoom() !== 'actual' || this.draggingDivider) return;
    this.dragging = true;
    this.host.nativeElement.setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const dpr = devicePixelRatio || 1;
    this.session.pan(-event.movementX * dpr, -event.movementY * dpr);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.host.nativeElement.releasePointerCapture?.(event.pointerId);
  }

  protected onDividerDown(event: PointerEvent): void {
    event.stopPropagation();
    this.draggingDivider = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected onDividerMove(event: PointerEvent): void {
    if (!this.draggingDivider) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.splitFraction.set(Math.min(0.98, Math.max(0.02, (event.clientX - rect.left) / rect.width)));
  }

  protected onDividerUp(event: PointerEvent): void {
    this.draggingDivider = false;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  protected onDividerKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === 'ArrowLeft') this.splitFraction.update((v) => Math.max(0.02, v - step));
    else if (event.key === 'ArrowRight') this.splitFraction.update((v) => Math.min(0.98, v + step));
    else return;
    event.preventDefault();
  }
}
