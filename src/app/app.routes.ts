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
  // The same for Crazy Crossing, which is only in the apps.
  {
    path: 'crazy-crossing/privacy',
    loadComponent: () => import('./apps/crazy-crossing/info-pages').then((m) => m.CrazyCrossingPrivacy),
  },
  {
    path: 'crazy-crossing/support',
    loadComponent: () => import('./apps/crazy-crossing/info-pages').then((m) => m.CrazyCrossingSupport),
  },
  // And who to contact about marketing.
  {
    path: 'marketing',
    loadComponent: () => import('./apps/chaos-park/info-pages').then((m) => m.Marketing),
  },
  ...APPS.map((app) => ({
    path: app.id,
    loadComponent: app.load,
    title: `${app.name} - Jay Randolph`,
  })),
  { path: '**', component: FsPage, canMatch: [fsNodeExists] },
  { path: '**', component: NotFound },
];
