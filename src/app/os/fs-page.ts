import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink, type CanMatchFn } from '@angular/router';
import { TextEdit } from '../apps/text-edit/text-edit';
import { WindowFrame } from '../ui/window-frame';
import { FileSystemService } from './filesystem.service';
import { Finder } from './finder';
import { ImageViewer } from './image-viewer';
import type { FileNode, FolderNode, ImageNode } from './node';

export const fsNodeExists: CanMatchFn = (_route, segments) => {
  const fs = inject(FileSystemService);
  const path = segments.map((s) => s.path);
  // Photo paths are unknown until the listing arrives; FsPage shows a loader meanwhile.
  return fs.resolve(path) !== null || (fs.loading() && path[0] === 'pictures');
};

@Component({
  selector: 'app-not-found',
  imports: [WindowFrame, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-window-frame title="Not Found" closeLink="/" compact>
      <div class="finder-body">
        <p class="empty">That item could not be found.</p>
        <p class="empty"><a class="btn default" routerLink="/">Back to Desktop</a></p>
      </div>
    </app-window-frame>
  `,
})
export class NotFound {
  constructor() {
    inject(Title).setTitle('Not Found - Jay Randolph');
  }
}

/** Renders whatever filesystem node the URL points at: a folder window, an image over its album, or a text document. */
@Component({
  selector: 'app-fs-page',
  imports: [Finder, ImageViewer, NotFound, TextEdit, WindowFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (folder(); as f) {
      <app-finder [folder]="f" />
    } @else if (!node()) {
      @if (fs.loading()) {
        <app-window-frame title="Pictures" closeLink="/" compact>
          <div class="finder-body">
            <div class="loading" role="status">
              <progress aria-label="Loading photos"></progress>
              <span>Loading photos&hellip;</span>
            </div>
          </div>
        </app-window-frame>
      } @else {
        <app-not-found />
      }
    }
    @if (image(); as img) {
      <app-image-viewer [image]="img" [siblings]="photos()" />
    }
    <!-- Tracked by path so switching documents recreates the editor with the new text. -->
    @for (doc of documents(); track doc.path) {
      <app-text-edit [name]="doc.name" [content]="doc.content" [closeLink]="closeLink()" />
    }
  `,
})
export class FsPage {
  protected readonly fs = inject(FileSystemService);
  private readonly segments = toSignal(inject(ActivatedRoute).url, { requireSync: true });

  protected readonly node = computed(() => this.fs.resolve(this.segments().map((s) => s.path)));

  protected readonly image = computed<ImageNode | null>(() => {
    const node = this.node();
    return node?.kind === 'image' ? node : null;
  });

  protected readonly documents = computed<FileNode[]>(() => {
    const node = this.node();
    return node?.kind === 'file' ? [node] : [];
  });

  protected readonly closeLink = computed(() => {
    const node = this.node();
    const parent = node ? this.fs.parentOf(node) : null;
    return '/' + (parent?.path ?? '');
  });

  protected readonly folder = computed<FolderNode | null>(() => {
    const node = this.node();
    if (node?.kind === 'folder') return node;
    return node?.kind === 'image' ? this.fs.parentOf(node) : null;
  });

  protected readonly photos = computed(() =>
    (this.folder()?.children ?? []).filter((c): c is ImageNode => c.kind === 'image'),
  );

  constructor() {
    const title = inject(Title);
    effect(() => {
      const node = this.node();
      if (node) title.setTitle(`${node.name} - Jay Randolph`);
      else if (this.fs.loading()) title.setTitle('Pictures - Jay Randolph');
    });
  }
}
