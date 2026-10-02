import type { Type } from '@angular/core';

export interface AppDef {
  /** Doubles as the URL path and the node id on the desktop. */
  id: string;
  name: string;
  icon: string;
  load: () => Promise<Type<unknown>>;
}

export const APPS: readonly AppDef[] = [
  {
    id: 'develop-film',
    name: 'Develop Film',
    icon: 'film',
    load: () => import('../apps/develop-film/develop-film').then((m) => m.DevelopFilm),
  },
];
