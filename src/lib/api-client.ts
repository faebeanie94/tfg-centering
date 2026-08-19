const API_BASE = import.meta.env.REACT_APP_API_URL || '/api';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export class ApiError extends Error {
  constructor(message: string, public statusCode: number, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 0
): Promise<Response> {
  try {
    const res = await fetch(url, options);

    if (res.ok) return res;

    if (res.status >= 500 && retries < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
      return fetchWithRetry(url, options, retries + 1);
    }

    const errorData = await res.json().catch(() => null);
    throw new ApiError(
      errorData?.error || `Request failed with status ${res.status}`,
      res.status,
      errorData
    );
  } catch (err) {
    if (err instanceof ApiError) throw err;

    if (retries < MAX_RETRIES && err instanceof TypeError) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
      return fetchWithRetry(url, options, retries + 1);
    }

    throw new ApiError(
      err instanceof Error ? err.message : 'Unknown error',
      0,
      err
    );
  }
}

export interface Submission {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  submission_id: string;
  card_number: number;
  front_s3_url: string | null;
  back_s3_url: string | null;
  front_local_path: string | null;
  back_local_path: string | null;
  created_at: string;
  updated_at: string;
  front_grade?: string | null;
  back_grade?: string | null;
  condition?: string | null;
  notes?: string | null;
}

// Submissions
export async function createSubmission(name: string): Promise<Submission> {
  const res = await fetchWithRetry(`${API_BASE}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function getSubmission(id: string): Promise<Submission> {
  const res = await fetchWithRetry(`${API_BASE}/submissions/${id}`);
  return res.json();
}

export async function listSubmissions(): Promise<Submission[]> {
  const res = await fetchWithRetry(`${API_BASE}/submissions`);
  return res.json();
}

export async function updateSubmission(id: string, name: string): Promise<Submission> {
  const res = await fetchWithRetry(`${API_BASE}/submissions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function deleteSubmission(id: string): Promise<void> {
  await fetchWithRetry(`${API_BASE}/submissions/${id}`, { method: 'DELETE' });
}

// Cards
export async function uploadCard(
  submissionId: string,
  cardNumber: number,
  frontImage?: Blob,
  backImage?: Blob,
): Promise<Card> {
  const formData = new FormData();
  formData.append('cardNumber', cardNumber.toString());

  if (frontImage) {
    formData.append('frontImage', frontImage, 'front.jpg');
  }
  if (backImage) {
    formData.append('backImage', backImage, 'back.jpg');
  }

  const res = await fetchWithRetry(`${API_BASE}/submissions/${submissionId}/cards`, {
    method: 'POST',
    body: formData,
  });

  return res.json();
}

export async function getCard(submissionId: string, cardNumber: number): Promise<Card> {
  const res = await fetchWithRetry(`${API_BASE}/submissions/${submissionId}/cards/${cardNumber}`);
  return res.json();
}

export async function listCards(submissionId: string): Promise<Card[]> {
  const res = await fetchWithRetry(`${API_BASE}/submissions/${submissionId}/cards`);
  return res.json();
}

export async function updateCard(
  submissionId: string,
  cardNumber: number,
  metadata?: {
    frontGrade?: string;
    backGrade?: string;
    condition?: string;
    notes?: string;
  },
): Promise<Card> {
  const res = await fetchWithRetry(`${API_BASE}/submissions/${submissionId}/cards/${cardNumber}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });

  return res.json();
}

export async function deleteCard(submissionId: string, cardNumber: number): Promise<void> {
  await fetchWithRetry(`${API_BASE}/submissions/${submissionId}/cards/${cardNumber}`, {
    method: 'DELETE',
  });
}

// Export
export async function exportSubmissionZip(submissionId: string): Promise<void> {
  const res = await fetchWithRetry(`${API_BASE}/submissions/${submissionId}/export`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `submission-${submissionId}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Image download
export async function downloadCardImage(
  submissionId: string,
  cardNumber: number,
  side: 'front' | 'back',
): Promise<string | null> {
  try {
    const card = await getCard(submissionId, cardNumber);
    const url = side === 'front' ? card.front_s3_url : card.back_s3_url;

    if (!url) return null;

    const res = await fetch(url);
    if (!res.ok) return null;

    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Error downloading card image:', err);
    return null;
  }
}
