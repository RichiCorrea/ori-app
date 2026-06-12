export const STORAGE_KEY = "worshipflow.prototype.v1";
export const SAMPLE_DB_NAME = "worshipflow-samples";
export const SAMPLE_DB_VERSION = 3;
export const SAMPLE_STORE_NAME = "drumSamples";
export const APP_STATE_STORE_NAME = "appState";
export const APP_STATE_ID = "current";

export function readStorage(key) {
  try {
    return window.localStorage?.getItem(key) || null;
  } catch (error) {
    return null;
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage?.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

export function removeStorage(key) {
  try {
    window.localStorage?.removeItem(key);
  } catch (error) {
    // Storage can be unavailable in some browser modes.
  }
}

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openAppDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = window.indexedDB.open(SAMPLE_DB_NAME, SAMPLE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAMPLE_STORE_NAME)) {
        db.createObjectStore(SAMPLE_STORE_NAME, { keyPath: "instrument" });
      }
      if (!db.objectStoreNames.contains(APP_STATE_STORE_NAME)) {
        db.createObjectStore(APP_STATE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function withDbStore(storeName, mode, callback) {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
