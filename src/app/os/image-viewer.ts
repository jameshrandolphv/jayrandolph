import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { ContextMenuService } from './context-menu';
import { segmentsOf, type ImageNode } from './node';

@Component({
  selector: 'app-image-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    <dialog #dialog class="viewer-overlay" [attr.aria-label]="image().name">
      <div class="vo-bar">
        <span class="vo-title">{{ image().name }}</span>
        <span class="vo-count">{{ index() + 1 }} of {{ siblings().length }}</span>
        <button type="button" class="btn" (click)="close()">Close</button>
      </div>
      @for (img of [image()]; track img.id) {
        <div class="vo-stage">
          <img class="vo-img vo-placeholder" [src]="img.thumb" alt="" />
          <img class="vo-img" [src]="img.src" [alt]="img.name" (load)="$any($event.target).classList.add('loaded')" />
        </div>
      }
      @if (prev(); as p) {
        <button type="button" class="vo-nav vo-prev" aria-label="Previous photo" (click)="go(p)"></button>
      }
      @if (next(); as n) {
        <button type="button" class="vo-nav vo-next" aria-label="Next photo" (click)="go(n)"></button>
      }
    </dialog>
  `,
})
export class ImageViewer {
  private readonly router = inject(Router);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly image = input.required<ImageNode>();
  readonly siblings = input.required<readonly ImageNode[]>();

  protected readonly index = computed(() => this.siblings().findIndex((i) => i.id === this.image().id));
  protected readonly prev = computed(() => this.siblings()[this.index() - 1] ?? null);
  protected readonly next = computed(() => this.siblings()[this.index() + 1] ?? null);

  constructor() {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Not modal, so the menu bar above it (and its File menu) stays usable.
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      dialog.show();
      dialog.focus();
    });
    inject(DestroyRef).onDestroy(() => previouslyFocused?.focus?.());

    effect(() => {
      for (const neighbour of [this.prev(), this.next()]) {
        if (neighbour) new Image().src = neighbour.src;
      }
    });
  }

  protected close(): void {
    const album = '/' + segmentsOf(this.image().path).slice(0, -1).join('/');
    void this.router.navigateByUrl(album);
  }

  protected go(node: ImageNode): void {
    void this.router.navigateByUrl('/' + node.path, { replaceUrl: true });
  }

  protected onKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        // An Escape that closed an open menu goes no further.
        if (!event.defaultPrevented && !this.contextMenu.menu()) this.close();
        break;
      case 'ArrowLeft': {
        const p = this.prev();
        if (p) this.go(p);
        break;
      }
      case 'ArrowRight': {
        const n = this.next();
        if (n) this.go(n);
        break;
      }
    }
  }
}
