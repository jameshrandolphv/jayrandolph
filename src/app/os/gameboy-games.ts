export interface GameboyGameDef {
  /** Row URL segment. */
  id: string;
  /** Shown like a ROM file name, e.g. 'LOST SCREENS.gba'. */
  name: string;
  /** Icon shown on the row. */
  image: string;
  /** The game's own site, where it plays in the browser. */
  url: string;
}

/** The Gameboy Games folder: one row per Game Boy Advance game, opening its web version. */
export const GAMEBOY_GAMES: readonly GameboyGameDef[] = [
  {
    id: 'lost-screens',
    name: 'LOST SCREENS.gba',
    image: '/icons/gameboy-games/lost-screens.png',
    url: 'https://lostscreens.com/',
  },
];
