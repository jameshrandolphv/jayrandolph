import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-window-frame',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="window" [class.compact]="compact()" [class.portrait]="portrait()" [class.landscape]="landscape()">
      <header class="titlebar">
        <span class="lights">
          <a class="l-close" [routerLink]="closeLink()" aria-label="Close window"></a>
          <i class="l-min" aria-hidden="true"></i>
          <i class="l-max" aria-hidden="true"></i>
        </span>
        <h1>{{ title() }}</h1>
      </header>
      <ng-content select=".toolbar" />
      <ng-content />
      <ng-content select=".statusbar" />
    </div>
  `,
})
export class WindowFrame {
  readonly title = input.required<string>();
  /** Where the red traffic light navigates. */
  readonly closeLink = input<string>('/');
  /** Centred window with a maximum size instead of filling the workspace. */
  readonly compact = input(false, { transform: booleanAttribute });
  /** Window sized to a 9:16 content area in whole multiples of 256 px, for pixel-art games. */
  readonly portrait = input(false, { transform: booleanAttribute });
  /** Window sized to a 4:3 content area; fills the workspace on small screens. */
  readonly landscape = input(false, { transform: booleanAttribute });
}
