import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, booleanAttribute, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-window-frame',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="window" [class.compact]="compact()" [class.portrait]="portrait()" [class.landscape]="landscape()" [class.wide]="wide()">
      <header class="titlebar">
        <span class="lights">
          <a class="l-close" [routerLink]="closeLink()" aria-label="Close window"></a>
          <i class="l-min" aria-hidden="true"></i>
          <button
            type="button"
            class="l-max"
            [attr.aria-label]="maximized() ? 'Restore window' : 'Maximize window'"
            [attr.aria-pressed]="maximized()"
            (click)="maximized.set(!maximized())"
          ></button>
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
  /** Fills the whole screen, covering the menu bar and dock, until restored. */
  protected readonly maximized = signal(false);

  readonly title = input.required<string>();
  /** Where the red traffic light navigates. */
  readonly closeLink = input<string>('/');
  /** Centred window with a maximum size instead of filling the workspace. */
  readonly compact = input(false, { transform: booleanAttribute });
  /** Window sized to a 9:16 content area in whole multiples of 256 px, for pixel-art games. */
  readonly portrait = input(false, { transform: booleanAttribute });
  /** Window sized to a 4:3 content area; fills the workspace on small screens. */
  readonly landscape = input(false, { transform: booleanAttribute });
  /** Window sized to a 3:2 content area; fills the workspace on small screens. */
  readonly wide = input(false, { transform: booleanAttribute });

  constructor() {
    // The menu bar and dock sit outside the window, so the maximised state is a class on the page root.
    const root = inject(DOCUMENT).documentElement;
    effect(() => root.classList.toggle('window-maximized', this.maximized()));
    inject(DestroyRef).onDestroy(() => root.classList.remove('window-maximized'));
  }
}
