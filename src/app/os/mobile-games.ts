export interface StoreListing {
  /** Store page; absent until the game is listed there, which shows the row disabled. */
  url?: string;
}

export interface MobileGameDef {
  /** Folder URL segment. */
  id: string;
  name: string;
  /** App icon shown beside each store row. */
  image: string;
  ios: StoreListing;
  android: StoreListing;
}

/** The Mobile Games folder: one subfolder per native game, each with its iOS and Android store rows. */
export const MOBILE_GAMES: readonly MobileGameDef[] = [
  {
    id: 'chaos-park',
    name: 'Chaos Park',
    image: '/icons/games/chaos-park.png',
    ios: { url: 'https://apps.apple.com/us/app/chaos-park/id6825083630' },
    android: { url: 'https://play.google.com/store/apps/details?id=com.jayrandolph.chaospark' },
  },
  {
    id: 'crash-crossing',
    name: 'Crash Crossing',
    image: '/icons/games/crash-crossing.png',
    ios: { url: 'https://apps.apple.com/us/app/crash-crossing/id6827704923' },
    android: { url: 'https://play.google.com/store/apps/details?id=com.jayrandolph.crashcrossing' },
  },
  {
    id: 'many-mini-moon-buggies',
    name: 'Many Mini Moon Buggies',
    image: '/icons/games/many-mini-moon-buggies.png',
    ios: { url: 'https://apps.apple.com/us/app/many-mini-moon-buggies/id6829101751' },
    android: {},
  },
];
