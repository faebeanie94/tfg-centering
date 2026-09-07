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

  // Generate ID with fallback for older browsers
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const record: SavedCardRecord = {
    id,
    label: label?.trim() || defaultCardLabel(session),
    savedAt: Date.now(),
    session: structuredClone(session),
  };

  const db = await openDb();
  return new Promise<SavedCardRecord>((resolve, reject) => {
    let completed = false;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const putRequest = tx.objectStore(STORE_NAME).put(record);

    putRequest.onerror = () => {
      if (!completed) {
        completed = true;
        db.close();
        reject(putRequest.error ?? new Error('Failed to save card'));
      }
    };

    tx.oncomplete = () => {
      if (!completed) {
        completed = true;
        db.close();
        resolve(record);
      }
    };

    tx.onerror = () => {
      if (!completed) {
        completed = true;
        db.close();
        reject(tx.error ?? new Error('Save transaction failed'));
      }
    };
  });
}

export async function updateSavedCardLabel(id: string, label: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise<void>((resolve, reject) => {
    let completed = false;

    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      if (completed) return;
      const record = getRequest.result as SavedCardRecord | undefined;
      if (!record) {
        completed = true;
        db.close();
        reject(new Error('Card not found'));
        return;
      }
      record.label = label.trim() || defaultCardLabel(record.session);
      const putRequest = store.put(record);
      putRequest.onerror = () => {
        if (!completed) {
          completed = true;
          db.close();
          reject(putRequest.error ?? new Error('Failed to update card'));
        }
      };
      putRequest.onsuccess = () => {
        // putRequest success is handled by tx.oncomplete
      };
    };

    getRequest.onerror = () => {
      if (!completed) {
        completed = true;
        db.close();
        reject(getRequest.error ?? new Error('Failed to get card'));
      }
    };

    tx.oncomplete = () => {
      if (!completed) {
        completed = true;
        db.close();
        resolve();
      }
    };

    tx.onerror = () => {
      if (!completed) {
        completed = true;
        db.close();
        reject(tx.error ?? new Error('Transaction failed'));
      }
    };
  });
}

export async function deleteSavedCard(id: string): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    let completed = false;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const deleteRequest = tx.objectStore(STORE_NAME).delete(id);

    deleteRequest.onerror = () => {
      if (!completed) {
        completed = true;
        db.close();
        reject(deleteRequest.error ?? new Error('Failed to delete card'));
      }
    };

    tx.oncomplete = () => {
      if (!completed) {
        completed = true;
        db.close();
        resolve();
      }
    };

    tx.onerror = () => {
      if (!completed) {
        completed = true;
        db.close();
        reject(tx.error ?? new Error('Delete transaction failed'));
      }
    };
  });
}
