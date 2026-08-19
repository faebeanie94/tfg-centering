/**
 * File System Access API utilities for folder-based submissions.
 * Allows users to pick a folder and auto-save numbered images to it.
 */

export interface SubmissionFolder {
  handle: FileSystemDirectoryHandle;
  name: string;
  nextCardNumber: number;
  /** Track which card/side is currently being edited (null = new card) */
  currentEdit?: { cardNumber: number; side: 'front' | 'back' } | null;
}

/**
 * Request user to pick or create a folder for a new submission.
 */
export async function startSubmission(): Promise<SubmissionFolder> {
  const dirHandle = await (window as any).showDirectoryPicker({
    mode: 'readwrite',
    startIn: 'downloads',
  });

  return {
    handle: dirHandle,
    name: dirHandle.name,
    nextCardNumber: 1,
    currentEdit: null,
  };
}

/**
 * Save a clean image to the submission folder with naming scheme: {cardNumber}-{side}.jpg
 * If editing an existing image, updates that file.
 * Otherwise creates a new numbered file.
 */
export async function saveToSubmissionFolder(
  submission: SubmissionFolder,
  dataUrl: string,
  side: 'front' | 'back',
): Promise<void> {
  // Determine the card number: use current edit if set, otherwise new card
  let cardNumber: number;
  if (submission.currentEdit && submission.currentEdit.side === side) {
    // Updating an existing image
    cardNumber = submission.currentEdit.cardNumber;
  } else {
    // New image for this side
    cardNumber = submission.nextCardNumber;
    // Advance counter after saving
    submission.nextCardNumber = Math.max(submission.nextCardNumber, cardNumber) + 1;
  }

  const filename = `${cardNumber}-${side}.jpg`;

  // Convert data URL to blob
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  // Write to file
  const fileHandle = await submission.handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  // Clear current edit after save (was a one-time thing)
  submission.currentEdit = null;
}

/**
 * List all saved card pairs in the submission folder.
 * Returns array of card numbers that have at least one side saved.
 */
export async function listSubmissionCards(submission: SubmissionFolder): Promise<number[]> {
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
 * Load a saved image from the submission folder.
 */
export async function loadSubmissionImage(
  submission: SubmissionFolder,
  cardNumber: number,
  side: 'front' | 'back',
): Promise<string | null> {
  const filename = `${cardNumber}-${side}.jpg`;

  try {
    const fileHandle = await submission.handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return dataUrl;
  } catch (err) {
    return null;
  }
}
