import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WallpaperService, WallpaperStore, fitWithin } from './wallpaper.service';

const imageBlob = (bytes = [1, 2, 3, 4], type = 'image/jpeg') => new Blob([new Uint8Array(bytes)], { type });

const bytesOf = async (blob: Blob) => [...new Uint8Array(await blob.arrayBuffer())];

describe('WallpaperStore', () => {
  it('has nothing until a wallpaper is saved', async () => {
    expect(await new WallpaperStore({ idb: new IDBFactory() }).load()).toBeNull();
  });

  it('keeps the image and its name across store instances', async () => {
    const idb = new IDBFactory();
    expect(await new WallpaperStore({ idb }).save('Dunes', imageBlob([9, 8, 7], 'image/png'))).toBe(true);

    const stored = await new WallpaperStore({ idb }).load();
    expect(stored?.name).toBe('Dunes');
    expect(stored?.blob.type).toBe('image/png');
    expect(await bytesOf(stored!.blob)).toEqual([9, 8, 7]);
  });

  it('replaces the previous wallpaper', async () => {
    const store = new WallpaperStore({ idb: new IDBFactory() });
    await store.save('One', imageBlob([1]));
    await store.save('Two', imageBlob([2]));
    expect((await store.load())?.name).toBe('Two');
  });

  it('forgets the wallpaper when cleared', async () => {
    const store = new WallpaperStore({ idb: new IDBFactory() });
    await store.save('One', imageBlob());
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('copes without storage', async () => {
    const store = new WallpaperStore({ idb: {} as IDBFactory });
    expect(await store.load()).toBeNull();
    expect(await store.save('One', imageBlob())).toBe(false);
    await expect(store.clear()).resolves.toBeUndefined();
  });
});

describe('fitWithin', () => {
  afterEach(() => vi.unstubAllGlobals());

  const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() });

  it('asks the decoder for the small version directly when the size is known', async () => {
    const create = vi.fn().mockResolvedValue(bitmap(2560, 1699));
    vi.stubGlobal('createImageBitmap', create);
    const draw = vi.fn();
    const toBlob = vi.fn((cb: BlobCallback) => cb(imageBlob([7])));
    vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => ({ drawImage: draw }), toBlob } as unknown as HTMLCanvasElement);

    const result = await fitWithin(imageBlob(), 2560, { width: 10424, height: 6918 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toMatchObject({ resizeWidth: 2560, resizeHeight: 1699 });
    expect(await bytesOf(result)).toEqual([7]);
    vi.restoreAllMocks();
  });

  it('falls back to a plain decode when resizing while decoding is not supported', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('unsupported')).mockResolvedValueOnce(bitmap(100, 50));
    vi.stubGlobal('createImageBitmap', create);
    const blob = imageBlob();
    expect(await fitWithin(blob, 2560, { width: 10424, height: 6918 })).toBe(blob);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('keeps the image as it is when it cannot be decoded here', async () => {
    const blob = imageBlob();
    expect(await fitWithin(blob, 100)).toBe(blob);
  });
});

describe('WallpaperService', () => {
  let urls: string[];
  let revoked: string[];

  beforeEach(() => {
    urls = [];
    revoked = [];
    let n = 0;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => (urls.push(`blob:wall-${++n}`), `blob:wall-${n}`), revokeObjectURL: (u: string) => revoked.push(u) }));
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  const create = async () => {
    const service = TestBed.inject(WallpaperService);
    await new Promise((r) => setTimeout(r, 20));
    return service;
  };

  const serve = (ok = true) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 403, blob: () => Promise.resolve(imageBlob()) }));

  it('starts with the built-in wallpaper', async () => {
    const service = await create();
    expect(service.custom()).toBe(false);
    expect(service.cssImage()).toBeNull();
  });

  it('uses a photo as the wallpaper and brings it back in a later session', async () => {
    serve();
    const first = await create();
    await first.setFromUrl('https://s3.example/a.jpg', 'A');
    expect(first.custom()).toBe(true);
    expect(first.cssImage()).toBe('url("blob:wall-1")');
    expect(first.status()).toBeNull();

    TestBed.resetTestingModule();
    const second = await create();
    expect(second.custom()).toBe(true);
    expect(second.cssImage()).toMatch(/^url\("blob:wall-\d+"\)$/);
  });

  it('downloads the photo past the HTTP cache, where Safari keeps a copy without CORS headers', async () => {
    serve();
    const service = await create();
    await service.setFromUrl('https://s3.example/a.jpg', 'A');
    expect(fetch).toHaveBeenCalledWith('https://s3.example/a.jpg', { cache: 'no-store' });
  });

  it('releases the previous image when the wallpaper changes', async () => {
    serve();
    const service = await create();
    await service.setFromUrl('https://s3.example/a.jpg', 'A');
    await service.setFromUrl('https://s3.example/b.jpg', 'B');
    expect(revoked).toEqual(['blob:wall-1']);
    expect(service.cssImage()).toBe('url("blob:wall-2")');
  });

  it('goes back to the built-in wallpaper when reset, for good', async () => {
    serve();
    const service = await create();
    await service.setFromUrl('https://s3.example/a.jpg', 'A');
    await service.reset();
    expect(service.custom()).toBe(false);
    expect(revoked).toEqual(['blob:wall-1']);

    TestBed.resetTestingModule();
    expect((await create()).custom()).toBe(false);
  });

  it('keeps the current wallpaper and says so when the image cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const service = await create();
    await service.setFromUrl('https://s3.example/a.jpg', 'A');
    expect(service.custom()).toBe(false);
    expect(service.status()).toBe("Couldn't download the photo");
  });

  it('says when the photo link has expired', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const service = await create();
    await service.setFromUrl('https://s3.example/a.jpg', 'A');
    expect(service.status()).toBe('Photo link expired, reload');
  });

  it('says when the photo server refuses the download outright, as a cross-origin block does', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const service = await create();
    await service.setFromUrl('https://s3.example/a.jpg', 'A');
    expect(service.custom()).toBe(false);
    expect(service.status()).toBe("Couldn't download the photo");
  });
});
