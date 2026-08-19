import * as api from './api-client';

export interface SavedSubmissionHandle {
  id: string;
  name: string;
  timestamp: number;
}

/**
 * List submissions from the backend API.
 */
export async function listSubmissionHandles(): Promise<SavedSubmissionHandle[]> {
  try {
    const submissions = await api.listSubmissions();
    return submissions
      .map((s) => ({
        id: s.id,
        name: s.name,
        timestamp: new Date(s.created_at).getTime(),
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error('Failed to list submissions:', err);
    return [];
  }
}

/**
 * Get a submission from the backend.
 */
export async function restoreSubmissionHandle(id: string): Promise<SavedSubmissionHandle | null> {
  try {
    const submission = await api.getSubmission(id);
    return {
      id: submission.id,
      name: submission.name,
      timestamp: new Date(submission.created_at).getTime(),
    };
  } catch (err) {
    console.error('Failed to restore submission:', err);
    return null;
  }
}

/**
 * Save submission handle (not needed with backend, kept for compatibility).
 */
export async function saveSubmissionHandle(): Promise<void> {
  // No-op with backend API
}

/**
 * Delete a submission from the backend.
 */
export async function deleteSubmissionHandle(id: string): Promise<void> {
  try {
    await api.deleteSubmission(id);
  } catch (err) {
    console.error('Failed to delete submission:', err);
  }
}
