import type { GradingSession } from './session';
import { sessionHasAny } from './session';

export interface SavedCardRecord {
  id: string;
  label: string;
  savedAt: number;
  session: GradingSession;
}

const DB_NAME = 'tfg-centering';
const STORE_NAME = 'saved-cards';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open saved cards database'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Saved cards request failed'));
  });
}

export function defaultCardLabel(session: GradingSession): string {
  const named = session.front?.name?.trim() || session.back?.name?.trim();
  if (named) return named;
  return `Card ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export async function listSavedCards(): Promise<SavedCardRecord[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const records = await requestToPromise(tx.objectStore(STORE_NAME).getAll());
    return records.sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function saveCardToLibrary(
  session: GradingSession,
  label?: string,
): Promise<SavedCardRecord> {
  if (!sessionHasAny(session)) {
    throw new Error('Nothing to save');
  }

  const record: SavedCardRecord = {
    id: crypto.randomUUID(),
    label: label?.trim() || defaultCardLabel(session),
    savedAt: Date.now(),
    session: structuredClone(session),
  };

  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await requestToPromise(tx.objectStore(STORE_NAME).put(record));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save card'));
    });
    return record;
  } finally {
    db.close();
  }
}

export async function updateSavedCardLabel(id: string, label: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    return new Promise<void>((resolve, reject) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const record = getRequest.result as SavedCardRecord | undefined;
        if (!record) {
          reject(new Error('Card not found'));
          return;
        }
        record.label = label.trim() || defaultCardLabel(record.session);
        const putRequest = store.put(record);
        putRequest.onerror = () => reject(putRequest.error ?? new Error('Failed to update card'));
      };
      getRequest.onerror = () => reject(getRequest.error ?? new Error('Failed to get card'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    });
  } finally {
    db.close();
  }
}

export async function deleteSavedCard(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await requestToPromise(tx.objectStore(STORE_NAME).delete(id));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete card'));
    });
  } finally {
    db.close();
  }
}
