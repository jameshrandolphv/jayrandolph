import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { LongPress, type LongPressEvent } from '../ui/long-press';
import { NodeIcon } from '../ui/node-icon';
import { ContextMenuService } from './context-menu';
import { ImageActions } from './image-actions';
import { hrefOf, type FsNode, type ImageNode, type LinkNode } from './node';

/** Icon or photo thumbnail plus label for one filesystem node. */
@Component({
  selector: 'app-fs-item',
  imports: [LongPress, NodeIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      class="fs-item"
      [class.selected]="selected()"
      [class.photo]="image() !== null"
      [class.disabled]="disabled()"
      [attr.href]="disabled() ? null : href()"
      [attr.target]="link() ? '_blank' : null"
      [attr.rel]="link() ? 'noopener' : null"
      [attr.aria-disabled]="disabled() || null"
      [attr.title]="disabled() ? 'Coming soon' : null"
      (click)="onClick($event)"
      (dblclick)="open($event)"
      (contextmenu)="onContextMenu($event)"
      appLongPress
      [longPressFilter]="hasMenu"
      (longPress)="onLongPress($event)"
    >
      <span class="fs-glyph">
        @if (image(); as img) {
          <img [src]="img.thumb" [alt]="img.name" [attr.width]="img.width" [attr.height]="img.height" loading="lazy" decoding="async" />
        } @else if (link(); as l) {
          <img class="app-icon" [src]="l.image" alt="" width="64" height="64" decoding="async" />
        } @else {
          <app-node-icon [icon]="node().icon" />
        }
      </span>
      <span class="fs-label">{{ node().name }}</span>
    </a>
  `,
})
export class FsItem {
  private readonly router = inject(Router);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly imageActions = inject(ImageActions);

  readonly node = input.required<FsNode>();
  readonly selected = input(false);
  /** When false, a mouse click only selects and a double click opens, like a desktop. */
  readonly openOnClick = input(true);
  readonly select = output<void>();

  protected readonly hasMenu = (): boolean => this.image() !== null;
  protected readonly href = computed(() => hrefOf(this.node()));
  protected readonly image = computed<ImageNode | null>(() => {
    const node = this.node();
    return node.kind === 'image' ? node : null;
  });

  protected readonly link = computed<LinkNode | null>(() => {
    const node = this.node();
    return node.kind === 'link' ? node : null;
  });
  /** A store row with no listing yet. */
  protected readonly disabled = computed(() => this.link() !== null && !this.link()?.url);

  protected onClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      return;
    }
    // Store rows are plain links to another site, opened in a new tab by the browser.
    if (this.link()) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // detail === 0 is a keyboard activation.
    const direct = this.openOnClick() || event.detail === 0 || matchMedia('(pointer: coarse)').matches;
    if (direct) void this.router.navigateByUrl(this.href());
    else this.select.emit();
  }

  protected open(event: MouseEvent): void {
    event.preventDefault();
    // The first click already opened a store row (or did nothing for a disabled one).
    if (this.link()) return;
    void this.router.navigateByUrl(this.href());
  }

  protected onContextMenu(event: MouseEvent): void {
    if (!this.image()) return;
    event.preventDefault();
    let { clientX: x, clientY: y } = event;
    if (x === 0 && y === 0) {
      // Keyboard invocation (menu key / Shift+F10) reports no pointer position.
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    this.openMenu(x, y);
  }

  /** Touch screens: holding a finger on a photo opens the same menu as a right click. */
  protected onLongPress({ x, y }: LongPressEvent): void {
    this.openMenu(x, y);
  }

  private openMenu(x: number, y: number): void {
    const img = this.image();
    if (!img) return;
    this.contextMenu.open(x, y, this.imageActions.menuItems(img));
  }
}
