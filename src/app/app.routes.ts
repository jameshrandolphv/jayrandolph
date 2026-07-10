import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'photography' },
  {
    path: 'photography',
    loadComponent: () => import('../app/pages/photography/photography').then(p => p.Photography)
  }
];
