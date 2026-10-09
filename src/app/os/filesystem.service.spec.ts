import { TestBed } from '@angular/core/testing';
import type { Route, UrlSegment } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import type { AppDef } from './apps';
import { fsNodeExists } from './fs-page';
import { buildTree, FileSystemService, resolvePath, type PhotoManifest } from './filesystem.service';

const apps: AppDef[] = [{ id: 'film-sim', name: 'Film Sim', icon: 'film', load: () => Promise.reject() }];

const manifest: PhotoManifest = {
  albums: [
    {
      id: 'iceland',
      title: 'Iceland',
      images: [
        { id: 'a', name: 'A', thumb: 'https://s3.example/iceland/thumbs/a.webp', src: 'https://s3.example/iceland/originals/a.jpg', width: 3, height: 2 },
        { id: 'b', name: 'B', thumb: 'https://s3.example/iceland/thumbs/b.webp', src: 'https://s3.example/iceland/originals/b.jpg', width: 2, height: 3 },
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
      src: 'https://s3.example/iceland/originals/b.jpg',
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

  describe('nested albums', () => {
    const img = (id: string) => ({ id, name: id.toUpperCase(), thumb: `t/${id}`, src: `s/${id}`, width: 3, height: 2 });
    const album = (id: string, title: string, path: string[] | undefined, ...images: string[]) => ({
      id,
      title,
      ...(path ? { path } : {}),
      images: images.map(img),
    });
    const pictures = (albums: PhotoManifest['albums']) => {
      const node = resolvePath(buildTree({ albums }, apps), ['pictures']);
      if (node?.kind !== 'folder') throw new Error('no pictures folder');
      return node;
    };

    it('nests albums by folder path, creating image-less intermediate folders', () => {
      const tree = buildTree({ albums: [album('trip-day-1-deep', 'Deep', ['trip', 'Day 1', 'deep'], 'c')] }, apps);
      expect(resolvePath(tree, ['pictures', 'trip'])).toMatchObject({ kind: 'folder', name: 'Trip' });
      expect(resolvePath(tree, ['pictures', 'trip', 'day-1'])).toMatchObject({ kind: 'folder', name: 'Day 1' });
      expect(resolvePath(tree, ['pictures', 'trip', 'day-1', 'deep'])).toMatchObject({ kind: 'folder', name: 'Deep' });
      expect(resolvePath(tree, ['pictures', 'trip', 'day-1', 'deep', 'c'])).toMatchObject({
        kind: 'image',
        path: 'pictures/trip/day-1/deep/c',
      });
    });

    it('lets a folder be both an album and a parent, listing subfolders before photos', () => {
      const trip = resolvePath(
        buildTree({ albums: [album('trip', 'Italy 2026', ['trip'], 'a'), album('trip-day-1', 'Day 1', ['trip', 'Day 1'], 'b')] }, apps),
        ['pictures', 'trip'],
      );
      expect(trip).toMatchObject({ name: 'Italy 2026' });
      expect(trip?.kind === 'folder' && trip.children.map((c) => [c.kind, c.name])).toEqual([
        ['folder', 'Day 1'],
        ['image', 'A'],
      ]);
    });

    it('puts images from the upload root (empty path) directly in Pictures', () => {
      const tree = pictures([album('pics', 'Pics', [], 'r'), album('trip', 'Trip', ['trip'], 'a')]);
      expect(tree.children.map((c) => [c.kind, c.name])).toEqual([
        ['folder', 'Trip'],
        ['image', 'R'],
      ]);
    });

    it('keeps similarly named sibling folders separate with unique URL ids', () => {
      const tree = pictures([album('trip-day-1', 'Day 1', ['trip', 'Day 1'], 'a'), album('trip-day-1-2', 'Day One', ['trip', 'day-1'], 'b')]);
      const trip = tree.children[0];
      expect(trip.kind === 'folder' && trip.children.map((c) => [c.id, c.name])).toEqual([
        ['day-1', 'Day 1'],
        ['day-1-2', 'Day One'],
      ]);
    });

    it('avoids folder ids that collide with a photo in the same folder', () => {
      const trip = pictures([album('trip', 'Trip', ['trip'], 'sub'), album('trip-sub', 'Sub', ['trip', 'sub'], 'x')]).children[0];
      expect(trip.kind === 'folder' && trip.children.map((c) => [c.kind, c.id])).toEqual([
        ['folder', 'sub-2'],
        ['image', 'sub'],
      ]);
    });

    it('shows albums without a stored path as top-level folders under their id', () => {
      const tree = buildTree({ albums: [album('iceland', 'Iceland Trip', undefined, 'a')] }, apps);
      expect(resolvePath(tree, ['pictures', 'iceland'])).toMatchObject({ kind: 'folder', name: 'Iceland Trip' });
    });
  });

  it('returns null for unknown paths and for descending into leaves', () => {
    expect(resolvePath(root, ['nope'])).toBeNull();
    expect(resolvePath(root, ['pictures', 'iceland', 'a', 'x'])).toBeNull();
    expect(resolvePath(root, ['film-sim', 'x'])).toBeNull();
  });
});

describe('FileSystemService.load', () => {
  const albumsOf = (fs: FileSystemService) => {
    const pictures = fs.resolve(['pictures']);
    return pictures?.kind === 'folder' ? pictures.children.map((c) => c.name) : [];
  };
  const respond = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });

  beforeEach(() => {
    vi.useFakeTimers();
    environment.photosApiUrl = 'https://api.example/';
  });

  afterEach(() => {
    environment.photosApiUrl = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('builds the tree from the API and refreshes at half the URL lifetime', async () => {
    const fetchMock = respond({ ...manifest, expiresIn: 600 });
    vi.stubGlobal('fetch', fetchMock);
    const fs = new FileSystemService();

    await fs.load();
    expect(fetchMock).toHaveBeenCalledWith('https://api.example/albums', expect.anything());
    expect(albumsOf(fs)).toEqual(['Iceland']);

    await vi.advanceTimersByTimeAsync(299_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the current library and retries when the API fails', async () => {
    const fs = new FileSystemService();
    vi.stubGlobal('fetch', respond(manifest));
    await fs.load();

    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', failing);
    await vi.advanceTimersByTimeAsync(1_800_000);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(albumsOf(fs)).toEqual(['Iceland']);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('reports loading until the first request settles, and not again on refresh', async () => {
    let resolve!: (v: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((r) => (resolve = r))));
    const fs = new FileSystemService();
    expect(fs.loading()).toBe(true);

    const pending = fs.load();
    expect(fs.loading()).toBe(true);
    resolve({ ok: true, json: () => Promise.resolve({ ...manifest, expiresIn: 600 }) });
    await pending;
    expect(fs.loading()).toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));
    await vi.advanceTimersByTimeAsync(301_000);
    expect(fs.loading()).toBe(false);
  });

  it('stops loading when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const fs = new FileSystemService();
    await fs.load();
    expect(fs.loading()).toBe(false);
  });

  it('is not loading when no URL is configured', () => {
    environment.photosApiUrl = '';
    expect(new FileSystemService().loading()).toBe(false);
  });

  it('matches photo deep links while loading, but unknown paths only once loaded', async () => {
    vi.stubGlobal('fetch', respond(manifest));
    const fs = TestBed.inject(FileSystemService);
    const matches = (...path: string[]) =>
      TestBed.runInInjectionContext(() =>
        fsNodeExists({} as Route, path.map((p) => ({ path: p }) as UrlSegment), undefined as never),
      );

    expect(matches('pictures', 'iceland', 'a')).toBe(true);
    expect(matches('nope')).toBe(false);

    await fs.load();
    expect(matches('pictures', 'iceland', 'a')).toBe(true);
    expect(matches('pictures', 'iceland', 'zzz')).toBe(false);
  });

  it('shows an empty library without calling the API when no URL is configured', async () => {
    environment.photosApiUrl = '';
    const fetchMock = respond(manifest);
    vi.stubGlobal('fetch', fetchMock);
    const fs = new FileSystemService();

    await fs.load();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(albumsOf(fs)).toEqual([]);
  });

  it('ignores a malformed response', async () => {
    vi.stubGlobal('fetch', respond({ nope: true }));
    const fs = new FileSystemService();
    await fs.load();
    expect(albumsOf(fs)).toEqual([]);
  });
});
