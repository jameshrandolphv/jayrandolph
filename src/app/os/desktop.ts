import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FileSystemService } from './filesystem.service';
import { FsItem } from './fs-item';

@Component({
  selector: 'app-desktop',
  imports: [FsItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'desktop', '(click)': 'selected.set(null)' },
  template: `
    <ul class="icons desktop-icons" role="list" aria-label="Desktop">
      @for (node of fs.root().children; track node.id) {
        <li (click)="$event.stopPropagation()">
          <app-fs-item
            [node]="node"
            [selected]="selected() === node.id"
            [openOnClick]="false"
            (select)="selected.set(node.id)"
          />
        </li>
      }
    </ul>
  `,
})
export class Desktop {
  protected readonly fs = inject(FileSystemService);
  protected readonly selected = signal<string | null>(null);
}
