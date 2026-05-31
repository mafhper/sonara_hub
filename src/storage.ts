import type { ProjectSnapshot } from "./types";

const databaseName = "sonara-hub";
const storeName = "workspace";

export async function saveSnapshot(snapshot: ProjectSnapshot) {
  return put("snapshot", snapshot);
}

export async function loadSnapshot() {
  return get<ProjectSnapshot>("snapshot");
}

export async function saveDirectoryHandle(
  key: "music-directory" | "output-directory",
  handle: FileSystemDirectoryHandle,
) {
  return put(key, handle);
}

export async function loadDirectoryHandle(
  key: "music-directory" | "output-directory",
) {
  return get<FileSystemDirectoryHandle>(key);
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(key: string, value: unknown) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}

async function get<T>(key: string) {
  const database = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}
