import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';
import type { ContextMenuItem } from './context-menu';
import type { ImageNode } from './node';
import { WallpaperService } from './wallpaper.service';

/** What can be done with a photo; shared by its context menu and the menu bar's File menu. */
@Injectable({ providedIn: 'root' })
export class ImageActions {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly wallpaper = inject(WallpaperService);

  menuItems(img: ImageNode): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: 'Open in Film Sim', action: () => this.openInFilmSim(img) },
      {
        label: 'Use as Wallpaper',
        action: () => void this.wallpaper.setFromUrl(img.src, img.name, { width: img.width, height: img.height }),
      },
    ];
    if (this.wallpaper.custom()) items.push({ label: 'Reset Wallpaper', action: () => void this.wallpaper.reset() });
    return items;
  }

  private openInFilmSim(img: ImageNode): void {
    void this.session.openUrl(img.src, img.name);
    void this.router.navigateByUrl('/film-sim');
  }
}
