export const APP_DB_NAME = 'jay-randolph-os';
export const APP_DB_VERSION = 2;
/** Per-app records that aren't user data, such as signing keys. */
export const META_STORE = 'app-meta';
export const SCORES_STORE = 'scores';
/** Where each game left off, so a player can resume across sessions. */
export const PROGRESS_STORE = 'progress';

export function openAppDb(factory: IDBFactory, name = APP_DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, APP_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SCORES_STORE)) db.createObjectStore(SCORES_STORE, { keyPath: 'game' });
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) db.createObjectStore(PROGRESS_STORE, { keyPath: 'game' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export function idbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
