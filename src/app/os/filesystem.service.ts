import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { APPS, type AppDef } from './apps';
import { DOCUMENTS, type DocumentDef } from './documents';
import { segmentsOf, type FolderNode, type FsNode } from './node';

export interface PhotoManifest {
  /** Seconds the presigned image URLs stay valid. */
  expiresIn?: number;
  albums: {
    id: string;
    title: string;
    images: { id: string; name: string; thumb: string; src: string; width: number; height: number }[];
  }[];
}

const folder = (path: string, name: string, children: FsNode[]): FolderNode => ({
  kind: 'folder',
  id: path.split('/').pop() ?? '',
  name,
  path,
  icon: 'folder',
  children,
});

export function buildTree(manifest: PhotoManifest, apps: readonly AppDef[], documents: readonly DocumentDef[] = DOCUMENTS): FolderNode {
  const sorted = [...manifest.albums].sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }));
  const albums = sorted.map((album) => {
    const path = `pictures/${album.id}`;
    return folder(
      path,
      album.title,
      album.images.map((img) => ({
        kind: 'image' as const,
        id: img.id,
        name: img.name,
        path: `${path}/${img.id}`,
        icon: 'image',
        thumb: img.thumb,
        src: img.src,
        width: img.width,
        height: img.height,
      })),
    );
  });

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
    folder('pictures', 'Pictures', albums),
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

  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  async load(): Promise<void> {
    const manifest = await fetchManifest();
    if (manifest) this.root.set(buildTree(manifest, APPS));
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
