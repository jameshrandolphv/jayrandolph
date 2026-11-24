import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { APPS, type AppDef } from './apps';
import { DESKTOP_APPS, fetchReleaseVersions, type DesktopAppDef } from './desktop-apps';
import { DOCUMENTS, type DocumentDef } from './documents';
import { GAMEBOY_GAMES, type GameboyGameDef } from './gameboy-games';
import { MOBILE_GAMES, type MobileGameDef } from './mobile-games';
import { segmentsOf, type AppNode, type FolderNode, type FsNode } from './node';

export interface PhotoAlbum {
  id: string;
  title: string;
  /** Folder path the album was uploaded from, as raw folder names; `[]` for images in the upload root. Absent on older albums. */
  path?: string[];
  images: { id: string; name: string; thumb: string; src: string; width: number; height: number }[];
}

export interface PhotoManifest {
  /** Seconds the presigned image URLs stay valid. */
  expiresIn?: number;
  albums: PhotoAlbum[];
}

const folder = (path: string, name: string, children: FsNode[]): FolderNode => ({
  kind: 'folder',
  id: path.split('/').pop() ?? '',
  name,
  path,
  icon: 'folder',
  children,
});

const NAME_ORDER = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en', { numeric: true });

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';

const titleCase = (s: string) =>
  s
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

interface DirEntry {
  /** Display name; the album title once an album claims this folder. */
  name: string;
  images: PhotoAlbum['images'];
  dirs: Map<string, DirEntry>;
}

const newDir = (name: string): DirEntry => ({ name, images: [], dirs: new Map() });

/**
 * Rebuilds the uploaded folder tree from the flat album list. Folders are keyed by their raw names so that
 * "Day 1" and "day-1" stay separate; URL ids are slugs, suffixed when they would collide with a sibling.
 */
function picturesTree(albums: readonly PhotoAlbum[]): FsNode[] {
  const top = newDir('Pictures');
  for (const album of albums) {
    // Albums without a stored path predate nesting: show them as top-level folders under their id.
    const segments = album.path ?? [album.id];
    let dir = top;
    for (const segment of segments) {
      let next = dir.dirs.get(segment);
      if (!next) dir.dirs.set(segment, (next = newDir(titleCase(segment))));
      dir = next;
    }
    if (segments.length) dir.name = album.title;
    dir.images.push(...album.images);
  }

  const toNodes = (dir: DirEntry, base: string): FsNode[] => {
    const taken = new Set(dir.images.map((img) => img.id));
    const entries = [...dir.dirs.entries()].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
    const folders = entries.map(([segment, child]) => {
      let id = slug(segment);
      for (let n = 2; taken.has(id); n++) id = `${slug(segment)}-${n}`;
      taken.add(id);
      const path = base ? `${base}/${id}` : id;
      return folder(path, child.name, toNodes(child, path));
    });
    const images = dir.images.map((img) => ({
      kind: 'image' as const,
      id: img.id,
      name: img.name,
      path: `${base}/${img.id}`,
      icon: 'image',
      thumb: img.thumb,
      src: img.src,
      width: img.width,
      height: img.height,
    }));
    return [...folders.sort(NAME_ORDER), ...images];
  };
  return toNodes(top, 'pictures');
}

/** Folder holding every web app; an app's own path is still its top-level URL. */
export const WEB_APPS_PATH = 'web-apps';

export const MOBILE_GAMES_PATH = 'mobile-games';

/** A folder per game, listing its iOS and Android store pages as rows. */
function mobileGamesFolder(games: readonly MobileGameDef[]): FolderNode {
  const gameFolders = games.map((game) => {
    const path = `${MOBILE_GAMES_PATH}/${game.id}`;
    const rows = (['ios', 'android'] as const).map((platform) => ({
      kind: 'link' as const,
      id: `${game.id}-${platform}`,
      name: `${game.name} (${platform === 'ios' ? 'iOS' : 'Android'})`,
      path: `${path}/${game.id}-${platform}`,
      icon: 'link',
      image: game.image,
      ...(game[platform].url ? { url: game[platform].url } : {}),
    }));
    return { ...folder(path, game.name, rows), view: 'list' as const };
  });
  return folder(MOBILE_GAMES_PATH, 'Mobile Games', gameFolders);
}

export const GAMEBOY_GAMES_PATH = 'gameboy-games';

/** One row per Game Boy Advance game, opening its web version in a new tab. */
function gameboyGamesFolder(games: readonly GameboyGameDef[]): FolderNode {
  const rows = games.map((game) => ({
    kind: 'link' as const,
    id: game.id,
    name: game.name,
    path: `${GAMEBOY_GAMES_PATH}/${game.id}`,
    icon: 'link',
    image: game.image,
    url: game.url,
  }));
  return { ...folder(GAMEBOY_GAMES_PATH, 'Gameboy Games', rows), view: 'list' as const };
}

/** Desktop app versions come from GitHub releases, fetched the first time the folder is opened. */
export const DESKTOP_APPS_PATH = 'desktop-apps';

/** A folder per app, a folder per version inside it, and in each version its Windows and Mac downloads as rows. */
function desktopAppsFolder(desktopApps: readonly DesktopAppDef[]): FolderNode {
  const appFolders = desktopApps.map((app) => {
    const appPath = `${DESKTOP_APPS_PATH}/${app.id}`;
    const versions = app.versions.map((version) => {
      const path = `${appPath}/${version.id}`;
      const rows = (['windows', 'mac'] as const).map((platform) => ({
        kind: 'link' as const,
        id: `${app.id}-${platform}`,
        name: `${app.name}.${platform === 'windows' ? 'exe' : 'app'}`,
        path: `${path}/${app.id}-${platform}`,
        icon: 'link',
        image: app.image,
        shapedImage: true,
        badge: platform,
        download: true,
        ...(version[platform].url ? { url: version[platform].url } : {}),
      }));
      return { ...folder(path, version.id, rows), view: 'list' as const };
    });
    return folder(appPath, app.name, versions);
  });
  return folder(DESKTOP_APPS_PATH, 'Desktop Apps', appFolders);
}

export function buildTree(
  manifest: PhotoManifest,
  apps: readonly AppDef[],
  documents: readonly DocumentDef[] = DOCUMENTS,
  games: readonly MobileGameDef[] = MOBILE_GAMES,
  desktopApps: readonly DesktopAppDef[] = DESKTOP_APPS,
  gameboyGames: readonly GameboyGameDef[] = GAMEBOY_GAMES,
): FolderNode {
  const documentsPath = 'documents';
  const documentNodes = documents.map((doc) => ({
    doc,
    node: {
      kind: 'file' as const,
      id: doc.id,
      name: doc.name,
      path: `${documentsPath}/${doc.id}`,
      icon: 'text',
      content: doc.content,
      ...(doc.href ? { href: doc.href } : {}),
    },
  }));

  // Apps live in the Web Apps folder but keep their own top-level URLs, which their routes and the store links use.
  const appNodes = apps.map((app) => ({
    kind: 'app' as const,
    id: app.id,
    name: app.name,
    path: app.id,
    icon: app.icon,
    dock: app.dock,
  }));

  const documentsFolder: FolderNode = {
    ...folder(documentsPath, 'Documents', documentNodes.filter(({ doc }) => !doc.hidden).map(({ node }) => node)),
    view: 'list',
    hidden: documentNodes.filter(({ doc }) => doc.hidden).map(({ node }) => node),
  };

  return folder('', 'Desktop', [
    folder('pictures', 'Pictures', picturesTree(manifest.albums)),
    documentsFolder,
    mobileGamesFolder(games),
    gameboyGamesFolder(gameboyGames),
    desktopAppsFolder(desktopApps),
    { ...folder(WEB_APPS_PATH, 'Web Apps', appNodes), icon: 'apps-folder' },
  ]);
}

export function resolvePath(root: FolderNode, segments: readonly string[]): FsNode | null {
  let node: FsNode = root;
  for (const segment of segments) {
    if (node.kind !== 'folder') return null;
    const next: FsNode | undefined = [...node.children, ...(node.hidden ?? [])].find((c) => c.id === segment);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** The app with this id, wherever it sits in the tree. */
export function findApp(root: FolderNode, id: string): AppNode | null {
  for (const child of root.children) {
    if (child.kind === 'app' && child.id === id) return child;
    if (child.kind === 'folder') {
      const found = findApp(child, id);
      if (found) return found;
    }
  }
  return null;
}

const MIN_REFRESH_MS = 60_000;
const RETRY_MS = 60_000;
const DEFAULT_LIFETIME_S = 3600;
const FETCH_TIMEOUT_MS = 10_000;

async function fetchManifest(): Promise<PhotoManifest | null> {
  if (!environment.photosApiUrl) return null;
  try {
    const res = await fetch(`${environment.photosApiUrl.replace(/\/$/, '')}/albums`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data: unknown = res.ok ? await res.json() : null;
    return data && Array.isArray((data as PhotoManifest).albums) ? (data as PhotoManifest) : null;
  } catch {
    // API unreachable: keep whatever is already showing (an empty library on first load).
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class FileSystemService {
  private manifest: PhotoManifest = { albums: [] };
  private desktopApps: readonly DesktopAppDef[] = DESKTOP_APPS;

  readonly root = signal<FolderNode>(buildTree(this.manifest, APPS, undefined, undefined, this.desktopApps));
  /** True until the first photo listing request settles (success or failure). */
  readonly loading = signal(!!environment.photosApiUrl);
  /** True while desktop app releases are being fetched from GitHub. */
  readonly releasesLoading = signal(false);
  private releasesRequest: Promise<void> | null = null;

  private rebuild(): void {
    this.root.set(buildTree(this.manifest, APPS, undefined, undefined, this.desktopApps));
  }

  /** Lists the desktop apps' GitHub releases. Runs once per visit; until then the written-in versions show. */
  loadReleases(): Promise<void> {
    return (this.releasesRequest ??= this.fetchReleases());
  }

  private async fetchReleases(): Promise<void> {
    const apps = this.desktopApps.filter((app) => app.releasesRepo);
    if (!apps.length) return;
    this.releasesLoading.set(true);
    const fetched = await Promise.all(apps.map((app) => fetchReleaseVersions(app.releasesRepo!)));
    const byId = new Map(apps.map((app, i) => [app.id, fetched[i]]));
    this.desktopApps = this.desktopApps.map((app) => {
      const versions = byId.get(app.id);
      return versions ? { ...app, versions } : app;
    });
    this.rebuild();
    this.releasesLoading.set(false);
  }

  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  async load(): Promise<void> {
    const manifest = await fetchManifest();
    if (manifest) {
      this.manifest = manifest;
      this.rebuild();
    }
    this.loading.set(false);
    this.scheduleRefresh(manifest);
  }

  /** Image URLs are presigned and expire, so reload the listing well before they do. */
  private scheduleRefresh(manifest: PhotoManifest | null): void {
    clearTimeout(this.refreshTimer);
    if (!environment.photosApiUrl) return;
    const lifetime = manifest ? (manifest.expiresIn ?? DEFAULT_LIFETIME_S) : 0;
    const delayMs = lifetime > 0 ? Math.max(lifetime * 500, MIN_REFRESH_MS) : RETRY_MS;
    this.refreshTimer = setTimeout(() => void this.load(), delayMs);
  }

  resolve(segments: readonly string[]): FsNode | null {
    return resolvePath(this.root(), segments);
  }

  app(id: string): AppNode | null {
    return findApp(this.root(), id);
  }

  parentOf(node: FsNode): FolderNode | null {
    if (node.path === '') return null;
    const parent = this.resolve(segmentsOf(node.path).slice(0, -1));
    return parent?.kind === 'folder' ? parent : null;
  }
}
