const API_BASE = import.meta.env.REACT_APP_API_URL || '/api';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export class ApiError extends Error {
  constructor(message: string, public statusCode: number, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

// A 401 opens the login prompt and waits for it, so the request that hit it can
// carry on once the user has signed in. Concurrent 401s share one prompt.
let loginResult: Promise<boolean> | null = null;
let finishLogin: ((signedIn: boolean) => void) | null = null;
const loginListeners = new Set<() => void>();

function setLoginPrompt(result: Promise<boolean> | null) {
  loginResult = result;
  loginListeners.forEach((listener) => listener());
}

function requestLogin(): Promise<boolean> {
  if (!loginResult) {
    setLoginPrompt(new Promise((resolve) => { finishLogin = resolve; }));
  }
  return loginResult!;
}

export function subscribeToLoginPrompt(listener: () => void): () => void {
  loginListeners.add(listener);
  return () => loginListeners.delete(listener);
}

export function isLoginPromptOpen(): boolean {
  return loginResult !== null;
}

export function closeLoginPrompt(signedIn: boolean): void {
  finishLogin?.(signedIn);
  finishLogin = null;
  setLoginPrompt(null);
}

export async function login(password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return;

  const errorData = await res.json().catch(() => null);
  throw new ApiError(errorData?.error || `Sign-in failed with status ${res.status}`, res.status, errorData);
}

/** `fetch` for /api URLs: asks the user to sign in if the session is missing or expired. */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status !== 401 || !url.startsWith(API_BASE)) return res;

  const signedIn = await requestLogin();
  return signedIn ? fetch(url, options) : res;
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 0
): Promise<Response> {
  try {
    const res = await apiFetch(url, options);

    if (res.ok) return res;

    if (res.status >= 500 && retries < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * (retries + 1)));
      return fetchWithRetry(url, options, retries + 1);
    }

    let errorData = null;
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      errorData = await res.json().catch(() => null);
    }
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
  completed_at?: string | null;
}

export interface Card {
  id: string;
  submission_id: string;
  card_number: number;
  front_image_url: string | null;
  back_image_url: string | null;
  front_local_path: string | null;
  back_local_path: string | null;
  created_at: string;
  updated_at: string;
  front_grade?: string | null;
  back_grade?: string | null;
  condition?: string | null;
  notes?: string | null;
  front_left_mm?: number | null;
  front_right_mm?: number | null;
  front_top_mm?: number | null;
  front_bottom_mm?: number | null;
  back_left_mm?: number | null;
  back_right_mm?: number | null;
  back_top_mm?: number | null;
  back_bottom_mm?: number | null;
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

export async function setSubmissionCompleted(id: string, completed: boolean): Promise<Submission> {
  const res = await fetchWithRetry(`${API_BASE}/submissions/${id}/completed`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
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
    frontLeftMm?: number;
    frontRightMm?: number;
    frontTopMm?: number;
    frontBottomMm?: number;
    backLeftMm?: number;
    backRightMm?: number;
    backTopMm?: number;
    backBottomMm?: number;
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
  const fileName = res.headers.get('content-disposition')?.split('filename="')[1]?.split('"')[0];
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || `submission-${submissionId}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke after timeout to allow download to start
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Image download
export async function downloadCardImage(
  submissionId: string,
  cardNumber: number,
  side: 'front' | 'back',
): Promise<string | null> {
  try {
    const card = await getCard(submissionId, cardNumber);
    const url = side === 'front' ? card.front_image_url : card.back_image_url;

    if (!url) return null;

    // Use fetchWithRetry to handle network glitches
    const res = await fetchWithRetry(url);
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
