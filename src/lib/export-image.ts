import type { CardSide } from './tfg-standards';
import type { GradingSession } from './session';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[^a-z0-9-_/]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^\/+|\/+$/g, '');
}

/**
 * Build export path. Names with slashes use folder structure, e.g. "5101/3" →
 * "5101/3-front-clean-2026-08-02-19-24-00.jpg"
 */
export function buildFilename(side: CardSide, variant: 'clean' | 'analyzed' = 'clean', name?: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const safeName = name ? sanitizeName(name).slice(0, 80) : '';

  if (safeName.includes('/')) {
    const segments = safeName
      .split('/')
      .map(sanitizeSegment)
      .filter(Boolean);

    if (segments.length === 0) {
      return `tfg-${side}-${variant}-${stamp}.jpg`;
    }

    const leaf = segments.pop()!;
    const dir = segments.join('/');
    const file = `${leaf}-${side}-${variant}-${stamp}.jpg`;
    return dir ? `${dir}/${file}` : file;
  }

  if (safeName) return `tfg-${safeName}-${side}-${variant}-${stamp}.jpg`;
  return `tfg-${side}-${variant}-${stamp}.jpg`;
}

/** Basename for share/download APIs that don't support folder paths in filenames. */
export function leafFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** iPhone/iPad (incl. iPadOS desktop UA) — programmatic downloads are unreliable. */
export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** Home-screen / installed PWA (standalone or iOS “Add to Home Screen”). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

/**
 * True when a silent download click is likely to no-op (common on iOS Safari
 * and especially installed web apps). Prefer the share sheet instead.
 */
export function shouldPreferShareForSave(): boolean {
  return isAppleTouchDevice() || isStandaloneDisplay();
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await dataUrlToBlob(dataUrl);
  return new File([blob], leafFilename(filename), { type: blob.type || 'image/jpeg' });
}

function canShareFiles(files: File[]): boolean {
  return typeof navigator.share === 'function' && Boolean(navigator.canShare?.({ files }));
}

/** Trigger a file download via a Blob object URL (more reliable than data: URLs). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = leafFilename(filename);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke after the browser has a chance to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  // Keep sync API for callers; fire-and-forget blob conversion.
  void dataUrlToBlob(dataUrl)
    .then((blob) => downloadBlob(blob, filename))
    .catch(() => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = leafFilename(filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
}

export async function shareDataUrl(
  dataUrl: string,
  filename: string,
  title: string,
): Promise<'shared' | 'downloaded'> {
  try {
    const file = await dataUrlToFile(dataUrl, filename);
    if (canShareFiles([file])) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
  }

  const blob = await dataUrlToBlob(dataUrl);
  downloadBlob(blob, filename);
  return 'downloaded';
}

/** Export the card photo only — no border overlays, labels, or handles. */
export async function exportCleanImage(imageSrc: string): Promise<string> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Save a clean JPEG. On iPhone / installed web apps, opens the system share sheet
 * (Save Image / Save to Files) because browser downloads usually do nothing there.
 * On desktop, triggers a normal file download.
 */
export async function saveCleanImage(
  imageSrc: string,
  side: CardSide,
  name?: string,
): Promise<'shared' | 'downloaded'> {
  const dataUrl = await exportCleanImage(imageSrc);
  const filename = buildFilename(side, 'clean', name);
  const title = name?.trim() ? `${name} (${side})` : `TFG ${side} card`;

  if (shouldPreferShareForSave()) {
    try {
      const file = await dataUrlToFile(dataUrl, filename);
      if (canShareFiles([file])) {
        await navigator.share({ files: [file], title });
        return 'shared';
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      // Fall through to download attempt.
    }
  }

  const blob = await dataUrlToBlob(dataUrl);
  downloadBlob(blob, filename);
  return 'downloaded';
}

export async function shareCleanImage(imageSrc: string, side: CardSide, name?: string): Promise<'shared' | 'downloaded'> {
  const dataUrl = await exportCleanImage(imageSrc);
  const title = name?.trim() ? `${name} (${side})` : `TFG ${side} card`;
  return shareDataUrl(dataUrl, buildFilename(side, 'clean', name), title);
}

export async function saveAllCleanImages(
  images: Array<{ side: CardSide; imageSrc: string; name?: string }>,
): Promise<'shared' | 'downloaded'> {
  if (images.length === 0) return 'downloaded';

  // Prefer one share sheet with all files when the OS supports it (iOS / PWA).
  if (shouldPreferShareForSave()) {
    try {
      const files: File[] = [];
      for (const { side, imageSrc, name } of images) {
        const dataUrl = await exportCleanImage(imageSrc);
        files.push(await dataUrlToFile(dataUrl, buildFilename(side, 'clean', name)));
      }
      if (canShareFiles(files)) {
        await navigator.share({
          files,
          title: files.length === 1 ? 'TFG clean image' : 'TFG clean images',
        });
        return 'shared';
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
    }
  }

  let last: 'shared' | 'downloaded' = 'downloaded';
  for (const { side, imageSrc, name } of images) {
    last = await saveCleanImage(imageSrc, side, name);
    await new Promise((r) => setTimeout(r, 300));
  }
  return last;
}

export function sessionExportImages(session: GradingSession): Array<{ side: CardSide; imageSrc: string; name?: string }> {
  const items: Array<{ side: CardSide; imageSrc: string; name?: string }> = [];
  if (session.front) {
    items.push({ side: 'front', imageSrc: session.front.imageSrc, name: session.front.name });
  }
  if (session.back) {
    items.push({ side: 'back', imageSrc: session.back.imageSrc, name: session.back.name });
  }
  return items;
}

export async function exportSessionImages(session: GradingSession): Promise<'shared' | 'downloaded' | void> {
  const images = sessionExportImages(session);
  if (images.length === 0) return;
  return saveAllCleanImages(images);
}
