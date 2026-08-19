import JSZip from 'jszip';
import * as api from './api-client';

/**
 * Submission folder with support for backend API and local ZIP fallback.
 */
export type SubmissionFolder = ApiSubmission | ZipSubmission;

export interface ApiSubmission {
  type: 'api';
  submissionId: string;
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
 * Find the lowest available card number, reusing gaps from deleted cards.
 */
async function findLowestAvailableCardNumber(submission: SubmissionFolder): Promise<number> {
  const existingCards = await listSubmissionCards(submission);

  if (existingCards.length === 0) {
    return 1;
  }

  // Find the first gap in the sequence
  for (let i = 1; i <= Math.max(...existingCards); i++) {
    if (!existingCards.includes(i)) {
      return i;
    }
  }

  // No gaps, return next number after highest
  return Math.max(...existingCards) + 1;
}

/**
 * Create a new submission via API or fallback to ZIP.
 */
export async function startSubmission(submissionName?: string): Promise<SubmissionFolder> {
  const name = submissionName || 'TFG000';

  try {
    const submission = await api.createSubmission(name);
    return {
      type: 'api',
      submissionId: submission.id,
      name: submission.name,
      nextCardNumber: 1,
      currentEdit: null,
      lastSideSaved: null,
    };
  } catch (err) {
    console.warn('Backend API failed, falling back to ZIP:', err);

    // Fallback to ZIP submission
    return {
      type: 'zip',
      name,
      nextCardNumber: 1,
      currentEdit: null,
      lastSideSaved: null,
      images: new Map(),
    };
  }
}

/**
 * Save a clean image to the submission.
 * Front and back of the same card pair use the same card number.
 */
export async function saveToSubmissionFolder(
  submission: SubmissionFolder,
  dataUrl: string,
  side: 'front' | 'back',
): Promise<void> {
  let cardNumber: number;

  if (submission.currentEdit && submission.currentEdit.side === side) {
    // Re-editing the same side of the same card
    cardNumber = submission.currentEdit.cardNumber;
  } else if (submission.lastSideSaved === null) {
    // First side of a new pair - find lowest available number (handles deleted cards)
    cardNumber = await findLowestAvailableCardNumber(submission);
  } else if (submission.lastSideSaved !== side) {
    // Opposite side of current pair
    cardNumber = submission.currentEdit?.cardNumber || submission.nextCardNumber;
  } else {
    // Same side again - this shouldn't happen in normal flow, but handle it
    submission.nextCardNumber += 1;
    cardNumber = submission.nextCardNumber;
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  if (submission.type === 'api') {
    const frontBlob = side === 'front' ? blob : undefined;
    const backBlob = side === 'back' ? blob : undefined;
    await api.uploadCard(submission.submissionId, cardNumber, frontBlob, backBlob);
  } else {
    const filename = `${cardNumber}-${side}.jpg`;
    submission.images.set(filename, blob);
  }

  // Only increment when we save back after front (completes the pair)
  if (side === 'back' && submission.lastSideSaved === 'front') {
    submission.nextCardNumber = Math.max(submission.nextCardNumber, cardNumber + 1);
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
 * List all saved card numbers.
 */
export async function listSubmissionCards(submission: SubmissionFolder): Promise<number[]> {
  if (submission.type === 'api') {
    try {
      const cards = await api.listCards(submission.submissionId);
      return cards.map((c) => c.card_number).sort((a, b) => a - b);
    } catch (err) {
      console.error('Failed to list submission cards:', err);
      return [];
    }
  }

  return Array.from({ length: submission.nextCardNumber - 1 }, (_, i) => i + 1);
}

/**
 * Load a saved image from the submission.
 */
export async function loadSubmissionImage(
  submission: SubmissionFolder,
  cardNumber: number,
  side: 'front' | 'back',
): Promise<string | null> {
  if (submission.type === 'api') {
    return api.downloadCardImage(submission.submissionId, cardNumber, side);
  }

  // ZIP fallback
  const filename = `${cardNumber}-${side}.jpg`;
  const blob = submission.images.get(filename);
  if (!blob) return null;

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
