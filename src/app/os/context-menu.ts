import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injectable, effect, inject, signal, viewChild } from '@angular/core';

export interface ContextMenuItem {
  label: string;
  action: () => void;
}

interface OpenMenu {
  x: number;
  y: number;
  items: readonly ContextMenuItem[];
  /** Names what opened the menu, such as a menu bar title, so it can show itself as open. */
  owner?: string;
}

@Injectable({ providedIn: 'root' })
export class ContextMenuService {
  readonly menu = signal<OpenMenu | null>(null);

  open(x: number, y: number, items: readonly ContextMenuItem[], owner?: string): void {
    this.menu.set({ x, y, items, owner });
  }

  close(): void {
    this.menu.set(null);
  }
}

/** Single shared context menu, rendered once by the app shell. */
@Component({
  selector: 'app-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape($event)',
    '(document:contextmenu)': 'onOtherContextMenu($event)',
    '(window:resize)': 'service.close()',
    '(window:blur)': 'service.close()',
    '(window:scroll)': 'service.close()',
  },
  template: `
    @if (service.menu(); as m) {
      <ul
        #list
        class="context-menu"
        role="menu"
        [style.left.px]="m.x"
        [style.top.px]="m.y"
        (keydown)="onKey($event)"
      >
        @for (item of m.items; track item.label) {
          <li role="none">
            <button type="button" role="menuitem" (click)="run(item)">{{ item.label }}</button>
          </li>
        }
      </ul>
    }
  `,
})
export class ContextMenu {
  protected readonly service = inject(ContextMenuService);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  constructor() {
    // Listened for only while a menu is open: a host listener on the document would run change detection
    // for the whole page on every press anywhere, including each tap in a game.
    const doc = inject(DOCUMENT);
    effect((onCleanup) => {
      if (!this.service.menu()) return;
      const down = (event: PointerEvent): void => this.onPointerDown(event);
      doc.addEventListener('pointerdown', down);
      onCleanup(() => doc.removeEventListener('pointerdown', down));
    });
    effect(() => {
      const el = this.list()?.nativeElement;
      if (!el) return;
      // Keep the menu inside the viewport, then focus the first item for keyboard users.
      const rect = el.getBoundingClientRect();
      const margin = 4;
      const left = Math.max(margin, Math.min(rect.left, innerWidth - rect.width - margin));
      const top = Math.max(margin, Math.min(rect.top, innerHeight - rect.height - margin));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.querySelector<HTMLElement>('button')?.focus();
    });
  }

  protected run(item: ContextMenuItem): void {
    this.service.close();
    item.action();
  }

  /** Marks the key handled when it closed a menu, so whatever is beneath (such as the photo viewer) stays open. */
  protected onEscape(event: Event): void {
    if (!this.service.menu()) return;
    event.preventDefault();
    this.service.close();
  }

  private onPointerDown(event: PointerEvent): void {
    if (!(event.target as Element).closest('.context-menu')) this.service.close();
  }

  protected onOtherContextMenu(event: MouseEvent): void {
    // Items open their own menu (replacing this one); anywhere else just dismisses it.
    if (!event.defaultPrevented) this.service.close();
  }

  protected onKey(event: KeyboardEvent): void {
    const buttons = [...(this.list()?.nativeElement.querySelectorAll('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    buttons[(i + step + buttons.length) % buttons.length]?.focus();
  }
}
