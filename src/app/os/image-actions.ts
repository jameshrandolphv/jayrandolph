import { Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { ContextMenuItem } from './context-menu';
import type { ImageNode } from './node';
import { WallpaperService } from './wallpaper.service';

/** What can be done with a photo; shared by its context menu and the menu bar's File menu. */
@Injectable({ providedIn: 'root' })
export class ImageActions {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly wallpaper = inject(WallpaperService);

  menuItems(img: ImageNode): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: 'Open in Film Sim', action: () => void this.openInFilmSim(img) },
      {
        label: 'Use as Wallpaper',
        action: () => void this.wallpaper.setFromUrl(img.src, img.name, { width: img.width, height: img.height }),
      },
    ];
    if (this.wallpaper.custom()) items.push({ label: 'Reset Wallpaper', action: () => void this.wallpaper.reset() });
    return items;
  }

  /**
   * The session (and with it the decoders, encoders and film engine) is loaded here rather than imported at the top:
   * this service is part of the desktop shell, and a static import put all of Film Sim's code in the first download.
   */
  private async openInFilmSim(img: ImageNode): Promise<void> {
    void this.router.navigateByUrl('/film-sim');
    const { SessionService } = await import('../core/session.service');
    void this.injector.get(SessionService).openUrl(img.src, img.name);
  }
}
