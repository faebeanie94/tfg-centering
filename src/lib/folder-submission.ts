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
  lastCardNumberUsed?: number | null;
}

export interface ZipSubmission {
  type: 'zip';
  name: string;
  nextCardNumber: number;
  currentEdit?: { cardNumber: number; side: 'front' | 'back' } | null;
  lastSideSaved?: 'front' | 'back' | null;
  images: Map<string, Blob>;
  lastCardNumberUsed?: number | null;
}

/**
 * Find the lowest available card number, reusing gaps from deleted cards.
 */
async function findLowestAvailableCardNumber(submission: SubmissionFolder): Promise<number> {
  const existingCards = await listSubmissionCards(submission);
  console.log('findLowestAvailableCardNumber - existing cards:', existingCards);

  if (existingCards.length === 0) {
    console.log('No existing cards, returning 1');
    return 1;
  }

  // Find the first gap in the sequence
  const maxCard = Math.max(...existingCards);
  for (let i = 1; i <= maxCard; i++) {
    if (!existingCards.includes(i)) {
      console.log('Found gap at', i);
      return i;
    }
  }

  // No gaps, return next number after highest
  const nextNum = maxCard + 1;
  console.log('No gaps, returning next number:', nextNum);
  return nextNum;
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
      lastCardNumberUsed: null,
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
      lastCardNumberUsed: null,
    };
  }
}

/**
 * Save a clean image to the submission.
 * Front and back of the same card pair use the same card number.
 * Returns updated submission object.
 */
export async function saveToSubmissionFolder(
  submission: SubmissionFolder,
  dataUrl: string,
  side: 'front' | 'back',
): Promise<SubmissionFolder> {
  // lastCardNumberUsed is the card in progress, so re-saves and the other side
  // stay on it. It is only cleared by startNewCard().
  const cardNumber =
    submission.currentEdit?.cardNumber ??
    submission.lastCardNumberUsed ??
    (await findLowestAvailableCardNumber(submission));
  console.log(`Using card number: ${cardNumber}`);

  let blob: Blob;
  try {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(`Failed to fetch data URL: ${response.status}`);
    blob = await response.blob();
  } catch (err) {
    throw new Error(`Invalid data URL or fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  if (submission.type === 'api') {
    const frontBlob = side === 'front' ? blob : undefined;
    const backBlob = side === 'back' ? blob : undefined;
    await api.uploadCard(submission.submissionId, cardNumber, frontBlob, backBlob);
  } else {
    submission.images.set(`${cardNumber}-${side}.jpg`, blob);
  }

  // Saving the opposite side completes the pair, so the banner can move on.
  const pairComplete = submission.lastSideSaved != null && submission.lastSideSaved !== side;

  return {
    ...submission,
    nextCardNumber: pairComplete ? Math.max(submission.nextCardNumber, cardNumber + 1) : submission.nextCardNumber,
    lastCardNumberUsed: cardNumber,
    lastSideSaved: side,
    currentEdit: null,
  };
}

/** Finish the card in progress, so the next save takes a new card number. */
export function startNewCard<T extends SubmissionFolder>(submission: T): T {
  return {
    ...submission,
    nextCardNumber: Math.max(submission.nextCardNumber, (submission.lastCardNumberUsed ?? 0) + 1),
    currentEdit: null,
    lastSideSaved: null,
    lastCardNumberUsed: null,
  };
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
  // Revoke after timeout to allow download to start on slow connections
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * List all saved card numbers.
 */
export async function listSubmissionCards(submission: SubmissionFolder): Promise<number[]> {
  if (submission.type === 'api') {
    // Let failures through: treating them as "no cards" would reuse card 1 and
    // overwrite it.
    const cards = await api.listCards(submission.submissionId);
    return cards.map((c) => c.card_number).sort((a, b) => a - b);
  }

  // For ZIP submissions, extract card numbers from actual files
  const cardNumbers = new Set<number>();
  for (const filename of submission.images.keys()) {
    const match = /^(\d+)-(front|back)\.jpg$/.exec(filename);
    if (match) {
      cardNumbers.add(parseInt(match[1], 10));
    }
  }
  return Array.from(cardNumbers).sort((a, b) => a - b);
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
