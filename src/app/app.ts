import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SoundSettings } from './core/sound-settings';
import { ContextMenu } from './os/context-menu';
import { Desktop } from './os/desktop';
import { FileSystemService } from './os/filesystem.service';
import { IconDefs, NodeIcon } from './ui/node-icon';

@Component({
  selector: 'app-root',
  imports: [ContextMenu, DatePipe, Desktop, IconDefs, NodeIcon, RouterLink, RouterOutlet],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly fs = inject(FileSystemService);
  private readonly router = inject(Router);
  protected readonly sound = inject(SoundSettings);

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
  protected readonly activeName = computed(() => {
    const segments = this.segments();
    return (segments.length && this.fs.resolve(segments)?.name) || 'Finder';
  });

  protected readonly dockItems = computed(() => [
    { id: 'desktop', name: 'Desktop', path: '', icon: 'desktop' },
    ...this.fs.root().children.filter((c) => c.kind === 'app' && c.dock !== false),
  ]);

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
