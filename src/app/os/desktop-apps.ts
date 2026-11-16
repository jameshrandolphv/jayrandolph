export interface DesktopDownload {
  /** Where the file downloads from; absent until it is uploaded, which shows the row disabled. */
  url?: string;
}

export interface DesktopAppVersion {
  /** Folder name and URL segment, e.g. 'alpha-1.0.0'. */
  id: string;
  windows: DesktopDownload;
  /** A .app is a folder, so this should point at a .zip or .dmg of it. */
  mac: DesktopDownload;
}

export interface DesktopAppDef {
  /** Folder URL segment. */
  id: string;
  name: string;
  /** App icon shown at the start of each download row. It keeps its own shape, like a macOS icon. */
  image: string;
  /** One folder each, shown in this order (put the newest first). */
  versions: readonly DesktopAppVersion[];
}

/**
 * Planet F's builds are assets on GitHub releases tagged with the version, e.g. alpha-1.0.0. GitHub turns
 * spaces in uploaded file names into dots, so "Planet F.exe" is served as "Planet.F.exe".
 */
const PLANET_F_RELEASES = 'https://github.com/jameshrandolphv/planet-f-release/releases/download';

/**
 * The Desktop Apps folder: one subfolder per app, a folder per version inside it, and in each version a
 * Windows row ("<name>.exe") and a Mac row ("<name>.app"). To release a version, add it to the top of
 * `versions` and fill in the two URLs.
 */
export const DESKTOP_APPS: readonly DesktopAppDef[] = [
  {
    id: 'planet-f',
    name: 'Planet F',
    image: '/icons/desktop-apps/planet-f.png',
    versions: [
      {
        id: 'alpha-1.0.0',
        windows: { url: `${PLANET_F_RELEASES}/alpha-1.0.0/Planet.F.exe` },
        mac: { url: `${PLANET_F_RELEASES}/alpha-1.0.0/Planet.F.zip` },
      },
    ],
  },
];
