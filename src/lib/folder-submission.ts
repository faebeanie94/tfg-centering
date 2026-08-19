/**
 * File System Access API utilities for folder-based submissions.
 * Allows users to pick a folder and auto-save numbered images to it.
 */

export interface SubmissionFolder {
  handle: FileSystemDirectoryHandle;
  name: string;
  imageCount: number;
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
  };
}

/**
 * Save a clean image to the submission folder with sequential numbering.
 * Returns the next image count after saving.
 */
export async function saveToSubmissionFolder(
  submission: SubmissionFolder,
  dataUrl: string,
): Promise<number> {
  const nextCount = submission.imageCount + 1;
  const filename = `${nextCount}.jpg`;

  // Convert data URL to blob
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  // Write to file
  const fileHandle = await submission.handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  return nextCount;
}
