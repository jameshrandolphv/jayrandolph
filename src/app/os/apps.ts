import type { Type } from '@angular/core';

export interface AppDef {
  /** Doubles as the URL path and the node id on the desktop. */
  id: string;
  name: string;
  icon: string;
  /** Set to false to keep the item on the desktop but out of the dock. */
  dock?: boolean;
  load: () => Promise<Type<unknown>>;
}

export const APPS: readonly AppDef[] = [
  {
    id: 'film-sim',
    name: 'Film Sim',
    icon: 'film',
    load: () => import('../apps/film-sim/film-sim').then((m) => m.FilmSim),
  },
  {
    id: 'flappy-cat',
    name: 'Flappy Cat',
    icon: 'cat',
    load: () => import('../apps/flappy-cat/flappy-cat').then((m) => m.FlappyCat),
  },
  {
    id: 'worlds-longest-game',
    name: "World's Longest Game",
    icon: 'square',
    load: () => import('../apps/worlds-longest-game/worlds-longest-game').then((m) => m.WorldsLongestGame),
  },
  {
    id: 'flights',
    name: 'Flights!',
    icon: 'plane',
    load: () => import('../apps/flights/flights').then((m) => m.Flights),
  },
  {
    id: 'write-stuff',
    name: 'Write Stuff',
    icon: 'write',
    load: () => import('../apps/text-edit/text-edit').then((m) => m.TextEdit),
  },
];
