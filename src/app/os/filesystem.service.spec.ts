import { describe, expect, it } from 'vitest';
import type { AppDef } from './apps';
import { buildTree, resolvePath, type PhotoManifest } from './filesystem.service';

const apps: AppDef[] = [{ id: 'film-sim', name: 'Film Sim', icon: 'film', load: () => Promise.reject() }];

const manifest: PhotoManifest = {
  albums: [
    {
      id: 'iceland',
      title: 'Iceland',
      images: [
        { id: 'a', name: 'A', thumb: 'photos/iceland/thumbs/a.webp', src: 'photos/iceland/display/a.webp', width: 3, height: 2 },
        { id: 'b', name: 'B', thumb: 'photos/iceland/thumbs/b.webp', src: 'photos/iceland/display/b.webp', width: 2, height: 3 },
      ],
    },
  ],
};

describe('filesystem', () => {
  const root = buildTree(manifest, apps);

  it('puts Pictures and apps on the desktop', () => {
    expect(root.children.map((c) => [c.kind, c.name])).toEqual([
      ['folder', 'Pictures'],
      ['folder', 'Documents'],
      ['app', 'Film Sim'],
    ]);
  });

  it('always has a Pictures folder, even without albums', () => {
    const empty = buildTree({ albums: [] }, apps);
    expect(resolvePath(empty, ['pictures'])).toMatchObject({ kind: 'folder', children: [] });
  });

  it('keeps documents in a top-level Documents folder and opens them by path', () => {
    const docs = resolvePath(root, ['documents']);
    expect(docs?.kind === 'folder' && docs.children.map((c) => c.name)).toEqual([
      'DO NOT OPEN.txt',
      'about.txt',
      'CHANGELOG.md',
    ]);
    expect(resolvePath(root, ['documents', 'do-not-open.txt'])).toMatchObject({
      kind: 'file',
      content: 'Why would you do that...',
    });
    expect(resolvePath(root, ['documents', 'about.txt'])).toMatchObject({
      kind: 'file',
      content: 'I should definitely update this',
    });
    const changelog = resolvePath(root, ['documents', 'CHANGELOG.md']);
    expect(changelog?.kind === 'file' && changelog.content).toMatch(/1\.2\.0[\s\S]*1\.1\.0[\s\S]*1\.0\.0/);
  });

  it('resolves albums and images by path', () => {
    expect(resolvePath(root, ['pictures', 'iceland'])).toMatchObject({ kind: 'folder', name: 'Iceland' });
    expect(resolvePath(root, ['pictures', 'iceland', 'b'])).toMatchObject({
      kind: 'image',
      path: 'pictures/iceland/b',
      src: 'photos/iceland/display/b.webp',
    });
    expect(resolvePath(root, [])).toBe(root);
  });

  it('lists albums alphabetically regardless of manifest order', () => {
    const album = (title: string) => ({ id: title.toLowerCase(), title, images: [] });
    const tree = buildTree({ albums: [album('Zurich'), album('2026-09-09 Acros'), album('Iceland'), album('2026-09-01 Portra')] }, apps);
    const pictures = resolvePath(tree, ['pictures']);
    expect(pictures?.kind === 'folder' && pictures.children.map((c) => c.name)).toEqual([
      '2026-09-01 Portra',
      '2026-09-09 Acros',
      'Iceland',
      'Zurich',
    ]);
  });

  it('returns null for unknown paths and for descending into leaves', () => {
    expect(resolvePath(root, ['nope'])).toBeNull();
    expect(resolvePath(root, ['pictures', 'iceland', 'a', 'x'])).toBeNull();
    expect(resolvePath(root, ['film-sim', 'x'])).toBeNull();
  });
});
