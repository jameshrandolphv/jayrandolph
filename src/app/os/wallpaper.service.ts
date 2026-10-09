import { Injectable, computed, signal } from '@angular/core';
import { WALLPAPER_STORE, idbDelete, idbGet, idbPut, openAppDb } from '../games/app-db';

const RECORD_ID = 'current';
/** Longest edge kept when a photo becomes the wallpaper; plenty for a full-screen display, and far smaller than a scan. */
export const WALLPAPER_MAX_EDGE = 2560;

interface WallpaperRecord {
  id: typeof RECORD_ID;
  name: string;
  type: string;
  /** Stored as bytes rather than a Blob, which not every browser can keep in IndexedDB. */
  data: ArrayBuffer;
}

export interface StoredWallpaper {
  name: string;
  blob: Blob;
}

export interface WallpaperStoreOptions {
  idb?: IDBFactory;
  dbName?: string;
}

/** The chosen wallpaper, kept in IndexedDB so it survives between sessions. */
export class WallpaperStore {
  private readonly idb: IDBFactory | undefined;
  private dbPromise?: Promise<IDBDatabase>;

  constructor(private readonly options: WallpaperStoreOptions = {}) {
    this.idb = options.idb ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
  }

  async load(): Promise<StoredWallpaper | null> {
    try {
      const record = await idbGet<WallpaperRecord>(await this.open(), WALLPAPER_STORE, RECORD_ID);
      if (!record || Object.prototype.toString.call(record.data) !== '[object ArrayBuffer]' || !record.data.byteLength) return null;
      return { name: String(record.name ?? ''), blob: new Blob([record.data], { type: record.type }) };
    } catch {
      return null;
    }
  }

  /** False when the browser would not keep it, for instance because storage is full or unavailable. */
  async save(name: string, blob: Blob): Promise<boolean> {
    try {
      const data = await blob.arrayBuffer();
      await idbPut(await this.open(), WALLPAPER_STORE, { id: RECORD_ID, name, type: blob.type, data } satisfies WallpaperRecord);
      return true;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await idbDelete(await this.open(), WALLPAPER_STORE, RECORD_ID);
    } catch {
      // Nothing stored, or storage unavailable.
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.idb) return Promise.reject(new Error('Storage is unavailable'));
    this.dbPromise ??= openAppDb(this.idb, this.options.dbName).catch((error) => {
      this.dbPromise = undefined;
      throw error;
    });
    return this.dbPromise;
  }
}

/** Shrinks an image so its longest edge is at most `maxEdge`; one that is already small, or can't be decoded here, is kept as it is. */
export async function fitWithin(blob: Blob, maxEdge: number): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) {
      bitmap.close();
      return blob;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const scaled = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return scaled ?? blob;
  } catch {
    return blob;
  }
}

const STATUS_MS = 4000;

@Injectable({ providedIn: 'root' })
export class WallpaperService {
  private readonly store = new WallpaperStore();
  private readonly objectUrl = signal<string | null>(null);
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private request = 0;

  /** True when the wallpaper is one the player chose rather than the built-in. */
  readonly custom = computed(() => this.objectUrl() !== null);
  /** The CSS value for the wallpaper's background image, or null to keep the built-in one. */
  readonly cssImage = computed(() => {
    const url = this.objectUrl();
    return url ? `url("${url}")` : null;
  });
  /** A short message about setting the wallpaper, shown briefly. */
  readonly status = signal<string | null>(null);

  constructor() {
    void this.restore();
  }

  /** Makes the image at `src` the wallpaper and remembers it. */
  async setFromUrl(src: string, name: string): Promise<void> {
    const request = ++this.request;
    this.say('Setting wallpaper…', 0);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Image request failed: ${res.status}`);
      const blob = await fitWithin(await res.blob(), WALLPAPER_MAX_EDGE);
      if (request !== this.request) return;
      this.show(blob);
      this.say(null);
      await this.store.save(name, blob);
    } catch {
      if (request === this.request) this.say("Couldn't set the wallpaper", STATUS_MS);
    }
  }

  async reset(): Promise<void> {
    this.request++;
    this.show(null);
    await this.store.clear();
  }

  private async restore(): Promise<void> {
    const request = ++this.request;
    const stored = await this.store.load();
    // A wallpaper chosen while this was loading wins.
    if (stored && request === this.request) this.show(stored.blob);
  }

  private show(blob: Blob | null): void {
    const previous = this.objectUrl();
    this.objectUrl.set(blob ? URL.createObjectURL(blob) : null);
    if (previous) URL.revokeObjectURL(previous);
  }

  private say(message: string | null, forMs = 0): void {
    clearTimeout(this.statusTimer);
    this.status.set(message);
    if (message && forMs) this.statusTimer = setTimeout(() => this.status.set(null), forMs);
  }
}
