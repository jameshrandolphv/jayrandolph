import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WindowFrame } from '../ui/window-frame';
import { FileSystemService } from './filesystem.service';
import { FsItem } from './fs-item';
import { segmentsOf, type FolderNode } from './node';

/** Generic folder window: lists the children of any folder node. */
@Component({
  selector: 'app-finder',
  imports: [RouterLink, WindowFrame, FsItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-window-frame [title]="folder().name" [closeLink]="parentHref()" compact>
      <div class="toolbar" role="toolbar" aria-label="Navigation">
        <a class="btn" [routerLink]="parentHref()">&lsaquo; Back</a>
        <nav class="path" aria-label="Location">
          <ol>
            @for (crumb of crumbs(); track crumb.href; let last = $last) {
              <li>
                @if (last) {
                  <span aria-current="page">{{ crumb.name }}</span>
                } @else {
                  <a [routerLink]="crumb.href">{{ crumb.name }}</a>
                }
              </li>
            }
          </ol>
        </nav>
      </div>
      <div class="finder-body">
        @if (folder().children.length) {
          <ul class="icons" role="list" [attr.aria-label]="folder().name">
            @for (child of folder().children; track child.id) {
              <li>
                <app-fs-item [node]="child" />
              </li>
            }
          </ul>
        } @else {
          <p class="empty">This folder is empty.</p>
        }
      </div>
      <footer class="statusbar" role="status">
        {{ folder().children.length }} {{ folder().children.length === 1 ? 'item' : 'items' }}
      </footer>
    </app-window-frame>
  `,
})
export class Finder {
  private readonly fs = inject(FileSystemService);

  readonly folder = input.required<FolderNode>();

  protected readonly parentHref = computed(() => {
    const parent = this.fs.parentOf(this.folder());
    return '/' + (parent?.path ?? '');
  });

  protected readonly crumbs = computed(() => {
    const segments = segmentsOf(this.folder().path);
    const crumbs = [{ name: this.fs.root().name, href: '/' }];
    segments.forEach((_, i) => {
      const node = this.fs.resolve(segments.slice(0, i + 1));
      if (node) crumbs.push({ name: node.name, href: '/' + node.path });
    });
    return crumbs;
  });
}
