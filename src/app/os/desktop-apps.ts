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
  /**
   * Public GitHub repo ("owner/name") whose releases are the versions. When set, opening the app's folder
   * lists its releases from GitHub, and `versions` is only what shows if GitHub can't be reached.
   */
  releasesRepo?: string;
  /** One folder each, shown in this order (put the newest first). */
  versions: readonly DesktopAppVersion[];
}

/**
 * Planet F's builds are assets on GitHub releases tagged with the version, e.g. alpha-1.0.0. GitHub turns
 * spaces in uploaded file names into dots, so "Planet F.exe" is served as "Planet.F.exe". The release
 * list below is only the fallback: new releases show up on the site by themselves.
 */
const PLANET_F_RELEASES = 'https://github.com/jameshrandolphv/planet-f-release/releases/download';

/**
 * The Desktop Apps folder: one subfolder per app, a folder per version inside it, and in each version a
 * Windows row ("<name>.exe") and a Mac row ("<name>.app"). An app with a `releasesRepo` lists its GitHub
 * releases; otherwise add each version to the top of `versions` with its two URLs.
 */
export const DESKTOP_APPS: readonly DesktopAppDef[] = [
  {
    id: 'planet-f',
    name: 'Planet F',
    image: '/icons/desktop-apps/planet-f.png',
    releasesRepo: 'jameshrandolphv/planet-f-release',
    versions: [
      {
        id: 'alpha-1.0.0',
        windows: { url: `${PLANET_F_RELEASES}/alpha-1.0.0/Planet.F.exe` },
        mac: { url: `${PLANET_F_RELEASES}/alpha-1.0.0/Planet.F.zip` },
      },
    ],
  },
];

/** The parts of a GitHub release (REST API) that the folder uses. */
export interface GitHubRelease {
  tag_name: string;
  draft?: boolean;
  assets: { name: string; browser_download_url: string }[];
}

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

/**
 * One version per published release, in GitHub's order (newest first). The Windows row takes the
 * release's .exe and the Mac row its .zip or .dmg; a release with neither is left out.
 */
export function versionsFromReleases(releases: readonly GitHubRelease[]): DesktopAppVersion[] {
  const asset = (release: GitHubRelease, ...extensions: string[]) =>
    release.assets.find((a) => extensions.some((ext) => a.name.toLowerCase().endsWith(ext)))?.browser_download_url;
  return releases
    .filter((r) => !r.draft && SAFE_ID.test(r.tag_name ?? '') && Array.isArray(r.assets))
    .map((r) => ({ id: r.tag_name, windows: { url: asset(r, '.exe') }, mac: { url: asset(r, '.zip', '.dmg') } }))
    .filter((v) => v.windows.url || v.mac.url);
}

const RELEASES_TIMEOUT_MS = 10_000;

/** The repo's releases as versions, or null if GitHub can't be reached or answers with nothing usable. */
export async function fetchReleaseVersions(repo: string): Promise<DesktopAppVersion[] | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(RELEASES_TIMEOUT_MS),
    });
    const data: unknown = res.ok ? await res.json() : null;
    const versions = Array.isArray(data) ? versionsFromReleases(data as GitHubRelease[]) : [];
    return versions.length ? versions : null;
  } catch {
    // Offline, or over GitHub's 60 requests an hour per visitor: keep the versions written in the code.
    return null;
  }
}
