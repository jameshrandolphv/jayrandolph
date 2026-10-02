import { Injectable, signal } from '@angular/core';
import { APPS, type AppDef } from './apps';
import { segmentsOf, type FolderNode, type FsNode } from './node';

export interface PhotoManifest {
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

export function buildTree(manifest: PhotoManifest, apps: readonly AppDef[]): FolderNode {
  const sorted = [...manifest.albums].sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }));
  const albums = sorted.map((album) => {
    const path = `photography/${album.id}`;
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

  return folder('', 'Desktop', [
    folder('photography', 'Photography', albums),
    ...apps.map((app) => ({ kind: 'app' as const, id: app.id, name: app.name, path: app.id, icon: app.icon })),
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

@Injectable({ providedIn: 'root' })
export class FileSystemService {
  readonly root = signal<FolderNode>(buildTree({ albums: [] }, APPS));

  async load(): Promise<void> {
    let manifest: PhotoManifest = { albums: [] };
    try {
      const res = await fetch('photos/manifest.json');
      const data: unknown = res.ok ? await res.json() : null;
      if (data && Array.isArray((data as PhotoManifest).albums)) manifest = data as PhotoManifest;
    } catch {
      // No manifest yet (or the dev server answered with the SPA fallback): show an empty library.
    }
    this.root.set(buildTree(manifest, APPS));
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
