import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SoundSettings } from './core/sound-settings';
import { ContextMenu, ContextMenuService } from './os/context-menu';
import { Desktop } from './os/desktop';
import { FileSystemService } from './os/filesystem.service';
import { ImageActions } from './os/image-actions';
import type { ImageNode } from './os/node';
import { WallpaperService } from './os/wallpaper.service';
import { IconDefs, NodeIcon } from './ui/node-icon';

const FILE_MENU = 'file';
/** The app that opens text documents. */
const TEXT_APP_ID = 'write-stuff';

@Component({
  selector: 'app-root',
  imports: [ContextMenu, DatePipe, Desktop, IconDefs, NodeIcon, RouterLink, RouterOutlet],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly fs = inject(FileSystemService);
  private readonly router = inject(Router);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly imageActions = inject(ImageActions);
  protected readonly sound = inject(SoundSettings);
  protected readonly wallpaper = inject(WallpaperService);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  private readonly segments = computed(() =>
    this.url()
      .split(/[?#]/)[0]
      .split('/')
      .filter(Boolean)
      .map((s) => decodeURIComponent(s)),
  );

  protected readonly now = signal(new Date());
  protected readonly activeRoot = computed(() => this.segments()[0] ?? '');
  private readonly activeNode = computed(() => {
    const segments = this.segments();
    return segments.length ? this.fs.resolve(segments) : null;
  });

  /**
   * The frontmost application, as the menu bar names it: an app by its own name, a text document by the
   * editor it opens in, and folders and photos by the Finder (whose names can be too long to fit).
   */
  protected readonly activeName = computed(() => {
    const node = this.activeNode();
    if (node?.kind === 'app') return node.name;
    if (node?.kind === 'file') return this.fs.resolve([TEXT_APP_ID])?.name ?? 'Finder';
    return 'Finder';
  });

  /** The photo open in the viewer, which the File menu acts on. */
  protected readonly openImage = computed<ImageNode | null>(() => {
    const node = this.activeNode();
    return node?.kind === 'image' ? node : null;
  });

  protected readonly fileMenuOpen = computed(() => this.contextMenu.menu()?.owner === FILE_MENU);

  protected readonly dockItems = computed(() => [
    { id: 'desktop', name: 'Desktop', path: '', icon: 'desktop' },
    ...this.fs.root().children.filter((c) => c.kind === 'app' && c.dock !== false),
  ]);

  /** Opens on press like a Mac menu, and a second press closes it. */
  protected onFileMenuDown(event: PointerEvent, img: ImageNode): void {
    if (event.button !== 0) return;
    // Kept from the document, where the open menu would treat it as a click outside and close.
    event.stopPropagation();
    event.preventDefault();
    this.toggleFileMenu(event.currentTarget as HTMLElement, img);
  }

  /** Keyboard activation; pointer presses were handled on pointerdown. */
  protected onFileMenuClick(event: MouseEvent, img: ImageNode): void {
    if (event.detail === 0) this.toggleFileMenu(event.currentTarget as HTMLElement, img);
  }

  private toggleFileMenu(button: HTMLElement, img: ImageNode): void {
    if (this.fileMenuOpen()) {
      this.contextMenu.close();
      return;
    }
    const rect = button.getBoundingClientRect();
    this.contextMenu.open(rect.left, rect.bottom, this.imageActions.menuItems(img), FILE_MENU);
  }

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
