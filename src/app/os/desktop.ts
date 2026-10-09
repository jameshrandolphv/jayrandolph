import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { ContextMenuService } from './context-menu';
import { FileSystemService } from './filesystem.service';
import { FsItem } from './fs-item';
import { WallpaperService } from './wallpaper.service';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DRAG_THRESHOLD = 3;

@Component({
  selector: 'app-desktop',
  imports: [FsItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'desktop',
    '(pointerdown)': 'onPointerDown($event)',
    '(contextmenu)': 'onContextMenu($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerEnd($event)',
    '(pointercancel)': 'onPointerEnd($event)',
  },
  template: `
    <ul class="icons desktop-icons" role="list" aria-label="Desktop">
      @for (node of fs.root().children; track node.id) {
        <li [attr.data-id]="node.id">
          <app-fs-item
            [node]="node"
            [selected]="selected().has(node.id)"
            [openOnClick]="false"
            (select)="selectOnly(node.id)"
          />
        </li>
      }
    </ul>
    @if (band(); as b) {
      <div class="selection-band" [style.left.px]="b.x" [style.top.px]="b.y" [style.width.px]="b.w" [style.height.px]="b.h"></div>
    }
  `,
})
export class Desktop {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly fs = inject(FileSystemService);
  private readonly wallpaper = inject(WallpaperService);
  private readonly contextMenu = inject(ContextMenuService);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly band = signal<Box | null>(null);

  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };
  private dragging = false;
  private base: ReadonlySet<string> = new Set();

  protected selectOnly(id: string): void {
    this.selected.set(new Set([id]));
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if ((event.target as Element).closest('li')) return;
    if (event.pointerType === 'touch') {
      this.selected.set(new Set());
      return;
    }

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    this.base = additive ? this.selected() : new Set();
    if (!additive) this.selected.set(this.base);

    const rect = this.host.getBoundingClientRect();
    this.origin = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.pointerId = event.pointerId;
    this.dragging = false;
    this.host.setPointerCapture(event.pointerId);
  }

  /** Only the bare desktop has a menu, and only once there is a chosen wallpaper to take off. */
  protected onContextMenu(event: MouseEvent): void {
    if ((event.target as Element).closest('li') || !this.wallpaper.custom()) return;
    event.preventDefault();
    this.contextMenu.open(event.clientX, event.clientY, [
      { label: 'Reset Wallpaper', action: () => void this.wallpaper.reset() },
    ]);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;

    const rect = this.host.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);

    if (!this.dragging) {
      if (Math.hypot(x - this.origin.x, y - this.origin.y) < DRAG_THRESHOLD) return;
      this.dragging = true;
    }

    const box: Box = {
      x: Math.min(x, this.origin.x),
      y: Math.min(y, this.origin.y),
      w: Math.abs(x - this.origin.x),
      h: Math.abs(y - this.origin.y),
    };
    this.band.set(box);
    this.selectWithin(box, rect);
  }

  protected onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.dragging = false;
    this.band.set(null);
    if (this.host.hasPointerCapture(event.pointerId)) this.host.releasePointerCapture(event.pointerId);
  }

  private selectWithin(box: Box, hostRect: DOMRect): void {
    const next = new Set(this.base);
    for (const el of this.host.querySelectorAll<HTMLElement>('li[data-id]')) {
      const r = el.getBoundingClientRect();
      const left = r.left - hostRect.left;
      const top = r.top - hostRect.top;
      const hit = left < box.x + box.w && left + r.width > box.x && top < box.y + box.h && top + r.height > box.y;
      if (hit) next.add(el.dataset['id']!);
    }
    this.selected.set(next);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
