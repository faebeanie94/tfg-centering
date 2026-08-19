/**
 * Persist and restore submission folder handles across app sessions.
 */

const DB_NAME = 'tfg-submissions';
const STORE_NAME = 'handles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error ?? new Error('Failed to open submissions DB'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export interface SavedSubmissionHandle {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  timestamp: number;
}

/**
 * Save a submission folder handle for later restoration.
 */
export async function saveSubmissionHandle(
  handle: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  // Delete any existing handle with the same name
  const allRequest = store.getAll();
  const allResult = await new Promise<SavedSubmissionHandle[]>((resolve, reject) => {
    allRequest.onsuccess = () => resolve(allRequest.result as SavedSubmissionHandle[]);
    allRequest.onerror = () => reject(allRequest.error);
  });

  for (const item of allResult) {
    if (item.name === name) {
      await new Promise<void>((resolve, reject) => {
        const deleteRequest = store.delete(item.id);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });
    }
  }

  // Save new handle
  const record: SavedSubmissionHandle = {
    id: crypto.randomUUID(),
    name,
    handle,
    timestamp: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const putRequest = store.put(record);
    putRequest.onsuccess = () => resolve();
    putRequest.onerror = () => reject(putRequest.error);
  });

  db.close();
}

/**
 * Get all saved submission handles.
 */
export async function listSubmissionHandles(): Promise<Array<{ id: string; name: string; timestamp: number }>> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const handles = await new Promise<SavedSubmissionHandle[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as SavedSubmissionHandle[]);
      request.onerror = () => reject(request.error);
    });

    db.close();

    return handles
      .map((h) => ({ id: h.id, name: h.name, timestamp: h.timestamp }))
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error('Failed to list submission handles:', err);
    return [];
  }
}

/**
 * Restore a submission folder handle by ID.
 */
export async function restoreSubmissionHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const record = await new Promise<SavedSubmissionHandle | undefined>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result as SavedSubmissionHandle | undefined);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (!record) return null;

    // Test if handle is still valid
    try {
      const permission = await (record.handle as any).getPermissionStatus?.({ mode: 'readwrite' });
      if (permission === 'granted' || permission === 'prompt') {
        return record.handle;
      } else {
        // Handle is invalid, remove it
        await deleteSubmissionHandle(id);
        return null;
      }
    } catch (err) {
      // Handle is invalid, remove it
      await deleteSubmissionHandle(id);
      return null;
    }
  } catch (err) {
    console.error('Failed to restore submission handle:', err);
    return null;
  }
}

/**
 * Delete a saved submission handle.
 */
export async function deleteSubmissionHandle(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (err) {
    console.error('Failed to delete submission handle:', err);
  }
}
