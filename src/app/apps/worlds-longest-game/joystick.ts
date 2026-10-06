import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal } from '@angular/core';

export interface StickVector {
  x: number;
  y: number;
}

/** Fraction of the base's radius the knob centre can travel. */
export const KNOB_TRAVEL = 0.6;
const DEAD_ZONE = 0.25;
/** Fraction of the keyboard's speed; a thumb is less precise than a key. */
export const STICK_SPEED = 0.85;

const D = Math.SQRT1_2;
/** Unit directions in 45 degree steps, starting right and turning clockwise on screen. */
const DIRECTIONS: readonly StickVector[] = [
  { x: 1, y: 0 },
  { x: D, y: D },
  { x: 0, y: 1 },
  { x: -D, y: D },
  { x: -1, y: 0 },
  { x: -D, y: -D },
  { x: 0, y: -1 },
  { x: D, y: -D },
];

/** The nearest of the eight directions. */
const snap = (dx: number, dy: number): StickVector => {
  const step = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRECTIONS[((step % 8) + 8) % 8]!;
};

/**
 * Turns a drag from the base centre into one of eight movement directions, like a d-pad. Past the
 * dead zone the result has a fixed length of STICK_SPEED, however far the drag goes.
 */
export const stickVector = (dx: number, dy: number, reach: number): StickVector => {
  const length = Math.hypot(dx, dy);
  if (reach <= 0 || length / reach < DEAD_ZONE) return { x: 0, y: 0 };
  const dir = snap(dx, dy);
  return { x: dir.x * STICK_SPEED, y: dir.y * STICK_SPEED };
};

/** Where the knob is drawn: the drag, snapped to the chosen direction and held inside the travel circle. */
export const knobOffset = (dx: number, dy: number, reach: number): StickVector => {
  const length = Math.min(Math.hypot(dx, dy), reach);
  if (reach <= 0 || length / reach < DEAD_ZONE) return { x: 0, y: 0 };
  const dir = snap(dx, dy);
  return { x: dir.x * length, y: dir.y * length };
};

@Component({
  selector: 'app-joystick',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <div
      class="base"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="release()"
      (pointercancel)="release()"
      (lostpointercapture)="release()"
    >
      <div class="knob" [style.transform]="transform()"></div>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      container-type: size;
    }
    .base {
      position: relative;
      width: min(100cqw, 100cqh, 220px);
      aspect-ratio: 1;
      border-radius: 50%;
      background: radial-gradient(circle, rgb(255 255 255 / 0.2) 0%, rgb(0 0 0 / 0.35) 100%);
      border: 3px solid rgb(255 255 255 / 0.7);
      box-shadow: 0 2px 10px rgb(0 0 0 / 0.4), inset 0 0 14px rgb(0 0 0 / 0.35);
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .knob {
      position: absolute;
      inset: 30%;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #ffffff 0%, #c9d4e6 55%, #8d9ab0 100%);
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.5);
      pointer-events: none;
    }
  `,
})
export class Joystick {
  /** Direction in the range -1..1 per axis; 0, 0 when released. */
  readonly moved = output<StickVector>();

  protected readonly transform = signal('translate(0px, 0px)');
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private pointer: number | null = null;

  protected onDown(event: PointerEvent): void {
    if (this.pointer !== null) return;
    this.pointer = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag(event);
  }

  protected onMove(event: PointerEvent): void {
    if (event.pointerId === this.pointer) this.drag(event);
  }

  protected release(): void {
    if (this.pointer === null) return;
    this.pointer = null;
    this.transform.set('translate(0px, 0px)');
    this.moved.emit({ x: 0, y: 0 });
  }

  private drag(event: PointerEvent): void {
    const base = this.el.nativeElement.querySelector('.base')!.getBoundingClientRect();
    const reach = (base.width / 2) * KNOB_TRAVEL;
    const dx = event.clientX - (base.left + base.width / 2);
    const dy = event.clientY - (base.top + base.height / 2);
    const knob = knobOffset(dx, dy, reach);
    this.transform.set(`translate(${knob.x}px, ${knob.y}px)`);
    this.moved.emit(stickVector(dx, dy, reach));
  }
}
