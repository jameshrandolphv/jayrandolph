import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal } from '@angular/core';

export interface StickVector {
  x: number;
  y: number;
}

/** Fraction of the keyboard's speed; a thumb is less precise than a key. */
export const PAD_SPEED = 0.85;

interface Cell {
  /** Column and row offsets from the centre, each -1, 0 or 1. */
  readonly dx: number;
  readonly dy: number;
  readonly label: string;
}

const CELLS: readonly Cell[] = [
  { dx: -1, dy: -1, label: 'up-left' },
  { dx: 0, dy: -1, label: 'up' },
  { dx: 1, dy: -1, label: 'up-right' },
  { dx: -1, dy: 0, label: 'left' },
  { dx: 1, dy: 0, label: 'right' },
  { dx: -1, dy: 1, label: 'down-left' },
  { dx: 0, dy: 1, label: 'down' },
  { dx: 1, dy: 1, label: 'down-right' },
];

const NEUTRAL: Cell = { dx: 0, dy: 0, label: '' };

/**
 * Which cell of the 3x3 pad a point falls in, as -1, 0 or 1 per axis. The zones are fixed squares rather
 * than angles, so a thumb resting on one arm stays on it; points outside the pad clamp to the nearest cell.
 */
export const padCell = (x: number, y: number, size: number): { dx: number; dy: number } => {
  if (size <= 0) return { dx: 0, dy: 0 };
  const third = (v: number) => Math.min(2, Math.max(0, Math.floor((v / size) * 3))) - 1;
  return { dx: third(x), dy: third(y) };
};

/** Movement for a cell; diagonals are normalised so they aren't faster than straight lines. */
export const padVector = (dx: number, dy: number): StickVector => {
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 0, y: 0 };
  return { x: (dx / length) * PAD_SPEED, y: (dy / length) * PAD_SPEED };
};

@Component({
  selector: 'app-dpad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <div
      class="pad"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="release()"
      (pointercancel)="release()"
      (lostpointercapture)="release()"
    >
      <div class="hub"></div>
      @for (cell of cells; track cell.label) {
        <div
          class="cell"
          [class.diagonal]="cell.dx !== 0 && cell.dy !== 0"
          [class.active]="cell.dx === active().dx && cell.dy === active().dy"
          [style.grid-column]="cell.dx + 2"
          [style.grid-row]="cell.dy + 2"
        ></div>
      }
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
    .pad {
      display: grid;
      grid-template: repeat(3, 1fr) / repeat(3, 1fr);
      gap: 4px;
      width: min(100cqw, 100cqh, 220px);
      aspect-ratio: 1;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .hub {
      grid-area: 2 / 2;
      border-radius: 50%;
      background: radial-gradient(circle, rgb(255 255 255 / 0.2) 0%, rgb(0 0 0 / 0.35) 100%);
      border: 3px solid rgb(255 255 255 / 0.7);
      box-shadow: 0 2px 10px rgb(0 0 0 / 0.4), inset 0 0 14px rgb(0 0 0 / 0.35);
      pointer-events: none;
    }
    .cell {
      border-radius: 14%;
      background: radial-gradient(circle, rgb(255 255 255 / 0.2) 0%, rgb(0 0 0 / 0.35) 100%);
      border: 3px solid rgb(255 255 255 / 0.7);
      box-shadow: 0 2px 10px rgb(0 0 0 / 0.4), inset 0 0 14px rgb(0 0 0 / 0.35);
      pointer-events: none;
    }
    .cell.diagonal {
      border-radius: 40%;
      border-color: rgb(255 255 255 / 0.4);
      opacity: 0.7;
    }
    .cell.active {
      background: radial-gradient(circle at 35% 30%, #ffffff 0%, #c9d4e6 55%, #8d9ab0 100%);
      border-color: #ffffff;
      opacity: 1;
    }
  `,
})
export class DPad {
  /** Direction with a length of at most PAD_SPEED; 0, 0 when released. */
  readonly moved = output<StickVector>();

  protected readonly cells = CELLS;
  protected readonly active = signal<{ dx: number; dy: number }>(NEUTRAL);
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
    this.set(NEUTRAL);
  }

  private drag(event: PointerEvent): void {
    const pad = this.el.nativeElement.querySelector('.pad')!.getBoundingClientRect();
    this.set(padCell(event.clientX - pad.left, event.clientY - pad.top, pad.width));
  }

  private set(next: { dx: number; dy: number }): void {
    const { dx, dy } = this.active();
    if (next.dx === dx && next.dy === dy) return;
    this.active.set(next);
    this.moved.emit(padVector(next.dx, next.dy));
  }
}
