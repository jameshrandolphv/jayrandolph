import { describe, expect, it } from 'vitest';
import type { AppDef } from './apps';
import { buildTree, resolvePath, type PhotoManifest } from './filesystem.service';

const apps: AppDef[] = [{ id: 'develop-film', name: 'Develop Film', icon: 'film', load: () => Promise.reject() }];

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

  it('puts Photography and apps on the desktop', () => {
    expect(root.children.map((c) => [c.kind, c.name])).toEqual([
      ['folder', 'Photography'],
      ['app', 'Develop Film'],
    ]);
  });

  it('always has a Photography folder, even without albums', () => {
    const empty = buildTree({ albums: [] }, apps);
    expect(resolvePath(empty, ['photography'])).toMatchObject({ kind: 'folder', children: [] });
  });

  it('resolves albums and images by path', () => {
    expect(resolvePath(root, ['photography', 'iceland'])).toMatchObject({ kind: 'folder', name: 'Iceland' });
    expect(resolvePath(root, ['photography', 'iceland', 'b'])).toMatchObject({
      kind: 'image',
      path: 'photography/iceland/b',
      src: 'photos/iceland/display/b.webp',
    });
    expect(resolvePath(root, [])).toBe(root);
  });

  it('returns null for unknown paths and for descending into leaves', () => {
    expect(resolvePath(root, ['nope'])).toBeNull();
    expect(resolvePath(root, ['photography', 'iceland', 'a', 'x'])).toBeNull();
    expect(resolvePath(root, ['develop-film', 'x'])).toBeNull();
  });
});
