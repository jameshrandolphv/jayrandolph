import type { Routes } from '@angular/router';
import { APPS } from './os/apps';
import { Desktop } from './os/desktop';
import { FsPage, NotFound, fsNodeExists } from './os/fs-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: Desktop, title: 'Jay Randolph' },
  ...APPS.map((app) => ({
    path: app.id,
    loadComponent: app.load,
    title: `${app.name} - Jay Randolph`,
  })),
  { path: '**', component: FsPage, canMatch: [fsNodeExists] },
  { path: '**', component: NotFound },
];
