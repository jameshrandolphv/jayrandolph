import type { Type } from '@angular/core';

export interface AppDef {
  /** Doubles as the URL path and the node id on the desktop. */
  id: string;
  name: string;
  icon: string;
  /** Set to false to keep the item on the desktop but out of the dock. */
  dock?: boolean;
  /** When it was added (YYYY-MM-DD); the dock shows only the newest few. */
  added: string;
  load: () => Promise<Type<unknown>>;
}

export const APPS: readonly AppDef[] = [
  {
    id: 'film-sim',
    added: '2026-10-05',
    name: 'Film Sim',
    icon: 'film',
    load: () => import('../apps/film-sim/film-sim').then((m) => m.FilmSim),
  },
  {
    id: 'flappy-cat',
    added: '2026-10-05',
    name: 'Flappy Cat',
    icon: 'cat',
    load: () => import('../apps/flappy-cat/flappy-cat').then((m) => m.FlappyCat),
  },
  {
    id: 'worlds-longest-game',
    added: '2026-10-05',
    name: "World's Longest Game",
    icon: 'square',
    load: () => import('../apps/worlds-longest-game/worlds-longest-game').then((m) => m.WorldsLongestGame),
  },
  {
    id: 'flights',
    added: '2026-10-10',
    name: 'Flights!',
    icon: 'plane',
    load: () => import('../apps/flights/flights').then((m) => m.Flights),
  },
  {
    id: 'chaos-park',
    added: '2026-10-14',
    name: 'Chaos Park',
    icon: 'park',
    load: () => import('../apps/chaos-park/chaos-park').then((m) => m.ChaosPark),
  },
  {
    id: 'bat-out',
    added: '2026-10-18',
    name: 'Bat Out!',
    icon: 'bat',
    load: () => import('../apps/bat-out/bat-out').then((m) => m.BatOut),
  },
  {
    id: 'write-stuff',
    added: '2026-10-05',
    name: 'Write Stuff',
    icon: 'write',
    load: () => import('../apps/text-edit/text-edit').then((m) => m.TextEdit),
  },
];

/** The dock holds the desktop and this many apps, the newest first added; the rest stay on the desktop. */
export const DOCK_APP_COUNT = 3;

/** The apps the dock shows, in the order they are listed. */
export const DOCK_APP_IDS: ReadonlySet<string> = new Set(
  APPS.filter((app) => app.dock !== false)
    .map((app, i) => ({ app, i }))
    // Newest first; among apps added the same day, the later listed counts as newer.
    .sort((a, b) => b.app.added.localeCompare(a.app.added) || b.i - a.i)
    .slice(0, DOCK_APP_COUNT)
    .map(({ app }) => app.id),
);
