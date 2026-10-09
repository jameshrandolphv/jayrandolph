import { Directive, ElementRef, Input, OnDestroy, inject, output } from '@angular/core';

export interface LongPressEvent {
  /** Viewport position of the finger. */
  x: number;
  y: number;
  target: Element;
}

const HOLD_MS = 500;
/** How far a finger may drift and still be a press rather than a scroll or drag. */
const SLOP = 10;
/** How long after a long press a tap on the same element is ignored, for browsers that still send a click. */
const CLICK_GUARD_MS = 400;

/**
 * Emits `longPress` when a finger or pen is held still on the element, for the context menu on touch
 * screens (iOS never sends `contextmenu` for a long press). The click that can follow is swallowed.
 */
@Directive({
  selector: '[appLongPress]',
  host: {
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'cancel()',
  },
})
export class LongPress implements OnDestroy {
  readonly longPress = output<LongPressEvent>();
  /** Decides, for the element pressed, whether there is anything to open; a press with nothing to open is left alone, so a tap-and-hold can still activate it. */
  @Input() longPressFilter: (target: Element) => boolean = () => true;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private guardTimer: ReturnType<typeof setTimeout> | undefined;
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private fired = false;

  constructor() {
    // Capturing, so it runs before the element's own click handler.
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.addEventListener(
      'click',
      (event) => {
        if (!this.fired) return;
        this.fired = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
  }

  ngOnDestroy(): void {
    this.cancel();
    clearTimeout(this.guardTimer);
  }

  protected onDown(event: PointerEvent): void {
    this.cancel();
    if (event.pointerType === 'mouse' || !event.isPrimary || !this.longPressFilter(event.target as Element)) return;
    clearTimeout(this.guardTimer);
    this.fired = false;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    const target = event.target as Element;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.fired = true;
      this.longPress.emit({ x: this.startX, y: this.startY, target });
    }, HOLD_MS);
  }

  protected onMove(event: PointerEvent): void {
    if (event.pointerId === this.pointerId && Math.hypot(event.clientX - this.startX, event.clientY - this.startY) > SLOP)
      this.cancel();
  }

  protected onUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.cancel();
    if (this.fired) this.guardTimer = setTimeout(() => (this.fired = false), CLICK_GUARD_MS);
  }

  protected cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pointerId = -1;
  }
}
