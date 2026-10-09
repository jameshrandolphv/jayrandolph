import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';
import { NodeIcon } from '../ui/node-icon';
import { ContextMenuService, type ContextMenuItem } from './context-menu';
import { hrefOf, type FsNode, type ImageNode } from './node';
import { WallpaperService } from './wallpaper.service';

/** Icon or photo thumbnail plus label for one filesystem node. */
@Component({
  selector: 'app-fs-item',
  imports: [NodeIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      class="fs-item"
      [class.selected]="selected()"
      [class.photo]="image() !== null"
      [attr.href]="href()"
      (click)="onClick($event)"
      (dblclick)="open($event)"
      (contextmenu)="onContextMenu($event)"
    >
      <span class="fs-glyph">
        @if (image(); as img) {
          <img [src]="img.thumb" [alt]="img.name" [attr.width]="img.width" [attr.height]="img.height" loading="lazy" decoding="async" />
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
  private readonly session = inject(SessionService);
  private readonly wallpaper = inject(WallpaperService);

  readonly node = input.required<FsNode>();
  readonly selected = input(false);
  /** When false, a mouse click only selects and a double click opens, like a desktop. */
  readonly openOnClick = input(true);
  readonly select = output<void>();

  protected readonly href = computed(() => hrefOf(this.node()));
  protected readonly image = computed<ImageNode | null>(() => {
    const node = this.node();
    return node.kind === 'image' ? node : null;
  });

  protected onClick(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // detail === 0 is a keyboard activation.
    const direct = this.openOnClick() || event.detail === 0 || matchMedia('(pointer: coarse)').matches;
    if (direct) void this.router.navigateByUrl(this.href());
    else this.select.emit();
  }

  protected open(event: MouseEvent): void {
    event.preventDefault();
    void this.router.navigateByUrl(this.href());
  }

  protected onContextMenu(event: MouseEvent): void {
    const img = this.image();
    if (!img) return;
    event.preventDefault();
    let { clientX: x, clientY: y } = event;
    if (x === 0 && y === 0) {
      // Keyboard invocation (menu key / Shift+F10) reports no pointer position.
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    const items: ContextMenuItem[] = [
      { label: 'Open in Film Sim', action: () => this.openInFilmSim(img) },
      { label: 'Use as Wallpaper', action: () => void this.wallpaper.setFromUrl(img.src, img.name) },
    ];
    if (this.wallpaper.custom()) items.push({ label: 'Reset Wallpaper', action: () => void this.wallpaper.reset() });
    this.contextMenu.open(x, y, items);
  }

  private openInFilmSim(img: ImageNode): void {
    void this.session.openUrl(img.src, img.name);
    void this.router.navigateByUrl('/film-sim');
  }
}
