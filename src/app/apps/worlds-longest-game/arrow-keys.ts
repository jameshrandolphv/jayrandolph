import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal } from '@angular/core';

export interface StickVector {
  x: number;
  y: number;
}

export type ArrowKey = 'left' | 'right' | 'up' | 'down';

interface Key {
  readonly key: ArrowKey;
  readonly glyph: string;
  readonly label: string;
}

const KEYS: readonly Key[] = [
  { key: 'left', glyph: '◀', label: 'Left' },
  { key: 'up', glyph: '▲', label: 'Up' },
  { key: 'down', glyph: '▼', label: 'Down' },
  { key: 'right', glyph: '▶', label: 'Right' },
];

/** Movement for the held keys; opposite keys cancel and diagonals are normalised to the same speed. */
export const keysVector = (held: ReadonlySet<ArrowKey>): StickVector => {
  const x = +held.has('right') - +held.has('left');
  const y = +held.has('down') - +held.has('up');
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
};

/**
 * A MacBook-style arrow cluster: full-height left and right keys with half-height up and down stacked
 * between them. Each finger is tracked on its own, so two keys together make a diagonal and a finger can
 * slide from one key to another.
 */
@Component({
  selector: 'app-arrow-keys',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <div
      class="cluster"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="release($event)"
      (pointercancel)="release($event)"
      (lostpointercapture)="release($event)"
    >
      @for (k of keys; track k.key) {
        <div class="key" [class.pressed]="pressed().has(k.key)" [attr.data-key]="k.key" [style.grid-area]="k.key">
          <span>{{ k.glyph }}</span>
        </div>
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
    .cluster {
      display: grid;
      grid-template:
        'left up right' 1fr
        'left down right' 1fr / 1fr 1fr 1fr;
      gap: 6px;
      width: min(100cqw, 100cqh * 1.5, 420px);
      aspect-ratio: 3 / 2;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .key {
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: linear-gradient(180deg, #3a3a42 0%, #1f1f25 100%);
      border: 2px solid rgb(255 255 255 / 0.35);
      box-shadow: 0 3px 0 #0c0c10, 0 4px 10px rgb(0 0 0 / 0.5);
      color: rgb(255 255 255 / 0.85);
      font-size: clamp(14px, 9cqmin, 40px);
      line-height: 1;
      pointer-events: none;
      transition: transform 40ms, box-shadow 40ms;
    }
    .key.pressed {
      background: linear-gradient(180deg, #ffffff 0%, #b9c4d8 100%);
      border-color: #ffffff;
      box-shadow: 0 0 0 #0c0c10, 0 1px 4px rgb(0 0 0 / 0.5);
      color: #1f1f25;
      transform: translateY(3px);
    }
  `,
})
export class ArrowKeys {
  /** Direction with a length of at most 1; 0, 0 when nothing is held. */
  readonly moved = output<StickVector>();

  protected readonly keys = KEYS;
  protected readonly pressed = signal<ReadonlySet<ArrowKey>>(new Set());
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fingers = new Map<number, ArrowKey>();

  protected onDown(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.track(event);
  }

  protected onMove(event: PointerEvent): void {
    if (this.fingers.has(event.pointerId)) this.track(event);
  }

  protected release(event: PointerEvent): void {
    if (!this.fingers.delete(event.pointerId)) return;
    this.update();
  }

  private track(event: PointerEvent): void {
    const key = this.keyAt(event.clientX, event.clientY);
    if (key) this.fingers.set(event.pointerId, key);
    else this.fingers.delete(event.pointerId);
    this.update();
  }

  private keyAt(x: number, y: number): ArrowKey | null {
    for (const el of this.el.nativeElement.querySelectorAll<HTMLElement>('[data-key]')) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.dataset['key'] as ArrowKey;
    }
    return null;
  }

  private update(): void {
    const next = new Set(this.fingers.values());
    const current = this.pressed();
    if (next.size === current.size && [...next].every((k) => current.has(k))) return;
    this.pressed.set(next);
    this.moved.emit(keysVector(next));
  }
}
