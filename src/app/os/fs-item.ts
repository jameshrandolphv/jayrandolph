import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { NodeIcon } from '../ui/node-icon';
import { hrefOf, type FsNode, type ImageNode } from './node';

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
}
