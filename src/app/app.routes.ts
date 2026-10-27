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
  // The same for Crash Crossing, which is only in the apps.
  {
    path: 'crash-crossing/privacy',
    loadComponent: () => import('./apps/crash-crossing/info-pages').then((m) => m.CrashCrossingPrivacy),
  },
  {
    path: 'crash-crossing/support',
    loadComponent: () => import('./apps/crash-crossing/info-pages').then((m) => m.CrashCrossingSupport),
  },
  // Its addresses from before it was renamed (it was Crazy Crossing).
  { path: 'crazy-crossing/privacy', redirectTo: 'crash-crossing/privacy' },
  { path: 'crazy-crossing/support', redirectTo: 'crash-crossing/support' },
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
