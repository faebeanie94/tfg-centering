import JSZip from 'jszip';

/**
 * Submission folder with support for both File System API and ZIP export fallback.
 */
export type SubmissionFolder = FileSystemSubmission | ZipSubmission;

export interface FileSystemSubmission {
  type: 'filesystem';
  handle: FileSystemDirectoryHandle;
  name: string;
  nextCardNumber: number;
  currentEdit?: { cardNumber: number; side: 'front' | 'back' } | null;
  lastSideSaved?: 'front' | 'back' | null;
}

export interface ZipSubmission {
  type: 'zip';
  name: string;
  nextCardNumber: number;
  currentEdit?: { cardNumber: number; side: 'front' | 'back' } | null;
  lastSideSaved?: 'front' | 'back' | null;
  images: Map<string, Blob>;
}

/**
 * Check if File System Access API is supported in this browser.
 */
function isFileSystemApiSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

/**
 * Request user to pick a folder or create a ZIP submission based on browser support.
 */
export async function startSubmission(): Promise<SubmissionFolder> {
  if (isFileSystemApiSupported()) {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads',
      });

      return {
        type: 'filesystem',
        handle: dirHandle,
        name: dirHandle.name,
        nextCardNumber: 1,
        currentEdit: null,
        lastSideSaved: null,
      };
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('File System API failed, falling back to ZIP:', err);
      } else {
        throw err;
      }
    }
  }

  // Fallback to ZIP submission
  return {
    type: 'zip',
    name: `submission-${new Date().toISOString().slice(0, 10)}`,
    nextCardNumber: 1,
    currentEdit: null,
    lastSideSaved: null,
    images: new Map(),
  };
}

/**
 * Save a clean image to the submission with naming scheme: {cardNumber}-{side}.jpg
 * Front and back of the same card pair use the same card number.
 */
export async function saveToSubmissionFolder(
  submission: SubmissionFolder,
  dataUrl: string,
  side: 'front' | 'back',
): Promise<void> {
  let cardNumber: number;

  if (submission.currentEdit && submission.currentEdit.side === side) {
    // Re-editing the same side
    cardNumber = submission.currentEdit.cardNumber;
  } else if (submission.lastSideSaved === null) {
    // First save in session
    cardNumber = submission.nextCardNumber;
  } else if (submission.lastSideSaved !== side) {
    // Saving the OTHER side of the current card (front after back, or vice versa)
    // Use the same card number as the last save
    cardNumber = submission.nextCardNumber - 1;
  } else {
    // Saving the SAME side again (new session after finishing a card pair)
    cardNumber = submission.nextCardNumber;
    submission.nextCardNumber += 1;
  }

  const filename = `${cardNumber}-${side}.jpg`;
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  if (submission.type === 'filesystem') {
    const fileHandle = await submission.handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    submission.images.set(filename, blob);
  }

  submission.lastSideSaved = side;
  submission.currentEdit = null;
}

/**
 * Download the ZIP submission. Only applicable for ZIP submissions.
 */
export async function downloadSubmissionZip(submission: ZipSubmission): Promise<void> {
  if (submission.type !== 'zip') return;

  const zip = new JSZip();
  for (const [filename, blob] of submission.images) {
    zip.file(filename, blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${submission.name}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * List all saved card numbers (filesystem only).
 */
export async function listSubmissionCards(submission: SubmissionFolder): Promise<number[]> {
  if (submission.type !== 'filesystem') {
    return Array.from({ length: submission.nextCardNumber - 1 }, (_, i) => i + 1);
  }

  const cards = new Set<number>();
  try {
    for await (const entry of (submission.handle as any)) {
      if (entry.kind === 'file') {
        const match = entry.name.match(/^(\d+)-(front|back)\.jpg$/);
        if (match) {
          cards.add(parseInt(match[1], 10));
        }
      }
    }
  } catch (err) {
    console.error('Failed to list submission cards:', err);
  }

  return Array.from(cards).sort((a, b) => a - b);
}

/**
 * Load a saved image from the submission.
 */
export async function loadSubmissionImage(
  submission: SubmissionFolder,
  cardNumber: number,
  side: 'front' | 'back',
): Promise<string | null> {
  const filename = `${cardNumber}-${side}.jpg`;

  if (submission.type === 'zip') {
    const blob = submission.images.get(filename);
    if (!blob) return null;
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Filesystem
  try {
    const fileHandle = await submission.handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } catch (err) {
    return null;
  }
}
