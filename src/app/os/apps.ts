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
    id: 'film-sim',
    name: 'Film Sim',
    icon: 'film',
    load: () => import('../apps/film-sim/film-sim').then((m) => m.FilmSim),
  },
];
