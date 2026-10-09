import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { APPS, type AppDef } from './apps';
import { DOCUMENTS, type DocumentDef } from './documents';
import { segmentsOf, type FolderNode, type FsNode } from './node';

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

export function buildTree(manifest: PhotoManifest, apps: readonly AppDef[], documents: readonly DocumentDef[] = DOCUMENTS): FolderNode {
  const documentsPath = 'documents';
  const documentNodes = documents.map((doc) => ({
    kind: 'file' as const,
    id: doc.id,
    name: doc.name,
    path: `${documentsPath}/${doc.id}`,
    icon: 'text',
    content: doc.content,
  }));

  return folder('', 'Desktop', [
    folder('pictures', 'Pictures', picturesTree(manifest.albums)),
    folder(documentsPath, 'Documents', documentNodes),
    ...apps.map((app) => ({
      kind: 'app' as const,
      id: app.id,
      name: app.name,
      path: app.id,
      icon: app.icon,
      dock: app.dock,
    })),
  ]);
}

export function resolvePath(root: FolderNode, segments: readonly string[]): FsNode | null {
  let node: FsNode = root;
  for (const segment of segments) {
    if (node.kind !== 'folder') return null;
    const next: FsNode | undefined = node.children.find((c) => c.id === segment);
    if (!next) return null;
    node = next;
  }
  return node;
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
  readonly root = signal<FolderNode>(buildTree({ albums: [] }, APPS));
  /** True until the first photo listing request settles (success or failure). */
  readonly loading = signal(!!environment.photosApiUrl);

  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  async load(): Promise<void> {
    const manifest = await fetchManifest();
    if (manifest) this.root.set(buildTree(manifest, APPS));
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

  parentOf(node: FsNode): FolderNode | null {
    if (node.path === '') return null;
    const parent = this.resolve(segmentsOf(node.path).slice(0, -1));
    return parent?.kind === 'folder' ? parent : null;
  }
}
