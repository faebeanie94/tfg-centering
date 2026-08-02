import type { CardSide } from './tfg-standards';

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

/** Basename for share APIs that don't support folder paths in filenames. */
export function leafFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function shareDataUrl(
  dataUrl: string,
  filename: string,
  title: string,
): Promise<'shared' | 'downloaded'> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], leafFilename(filename), { type: blob.type || 'image/jpeg' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
  }

  downloadDataUrl(dataUrl, filename);
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

export async function saveCleanImage(imageSrc: string, side: CardSide, name?: string): Promise<void> {
  const dataUrl = await exportCleanImage(imageSrc);
  downloadDataUrl(dataUrl, buildFilename(side, 'clean', name));
}

export async function shareCleanImage(imageSrc: string, side: CardSide, name?: string): Promise<'shared' | 'downloaded'> {
  const dataUrl = await exportCleanImage(imageSrc);
  const title = name?.trim() ? `${name} (${side})` : `TFG ${side} card`;
  return shareDataUrl(dataUrl, buildFilename(side, 'clean', name), title);
}

export async function saveAllCleanImages(
  images: Array<{ side: CardSide; imageSrc: string; name?: string }>,
): Promise<void> {
  for (const { side, imageSrc, name } of images) {
    await saveCleanImage(imageSrc, side, name);
    await new Promise((r) => setTimeout(r, 300));
  }
}
