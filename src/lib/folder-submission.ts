/**
 * File System Access API utilities for folder-based submissions.
 * Allows users to pick a folder and auto-save numbered images to it.
 */

export interface SubmissionFolder {
  handle: FileSystemDirectoryHandle;
  name: string;
  imageCount: number;
  /** Track which file each side was saved to for updates */
  fileNumbers?: { front?: number; back?: number };
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
    imageCount: 0,
    fileNumbers: {},
  };
}

/**
 * Save a clean image to the submission folder.
 * If the side was already saved, updates that file.
 * Otherwise creates a new numbered file.
 */
export async function saveToSubmissionFolder(
  submission: SubmissionFolder,
  dataUrl: string,
  side: 'front' | 'back',
): Promise<number> {
  // Check if this side was already saved
  const existingFileNumber = submission.fileNumbers?.[side];
  const fileNumber = existingFileNumber ?? submission.imageCount + 1;
  const filename = `${fileNumber}.jpg`;

  // Convert data URL to blob
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  // Write to file
  const fileHandle = await submission.handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  // If this is a new file, increment the count
  if (!existingFileNumber) {
    submission.imageCount = fileNumber;
  }

  // Track which file this side was saved to
  if (!submission.fileNumbers) {
    submission.fileNumbers = {};
  }
  submission.fileNumbers[side] = fileNumber;

  return submission.imageCount;
}
