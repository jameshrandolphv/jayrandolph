import type { Routes } from '@angular/router';
import { APPS } from './os/apps';
import { FsPage, NotFound, fsNodeExists } from './os/fs-page';

export const routes: Routes = [
  // The desktop itself is always rendered by the shell, so this route has nothing to show.
  { path: '', pathMatch: 'full', children: [], title: 'Jay Randolph' },
  // The pages the Chaos Park store listings link to.
  {
    path: 'chaos-park/privacy',
    loadComponent: () => import('./apps/chaos-park/info-pages').then((m) => m.ChaosParkPrivacy),
  },
  {
    path: 'chaos-park/support',
    loadComponent: () => import('./apps/chaos-park/info-pages').then((m) => m.ChaosParkSupport),
  },
  ...APPS.map((app) => ({
    path: app.id,
    loadComponent: app.load,
    title: `${app.name} - Jay Randolph`,
  })),
  { path: '**', component: FsPage, canMatch: [fsNodeExists] },
  { path: '**', component: NotFound },
];
