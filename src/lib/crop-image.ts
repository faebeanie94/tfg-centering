import type { Rect } from './centering';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function cropImage(imageSrc: string, rect: Rect): Promise<string> {
  const img = await loadImage(imageSrc);
  const x = Math.round(Math.max(0, rect.x));
  const y = Math.round(Math.max(0, rect.y));
  const w = Math.round(Math.min(rect.width, img.naturalWidth - x));
  const h = Math.round(Math.min(rect.height, img.naturalHeight - y));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export function defaultCropRect(imgWidth: number, imgHeight: number): Rect {
  const margin = Math.min(imgWidth, imgHeight) * 0.03;
  return {
    x: margin,
    y: margin,
    width: imgWidth - margin * 2,
    height: imgHeight - margin * 2,
  };
}

/** Move boxes from full-image coordinates into a crop of it, trimming them to fit. */
export function rectsInCrop(outer: Rect, inner: Rect, cropRect: Rect): { outer: Rect; inner: Rect } {
  // cropImage cuts on whole pixels.
  const crop = {
    x: Math.round(Math.max(0, cropRect.x)),
    y: Math.round(Math.max(0, cropRect.y)),
    width: Math.round(cropRect.width),
    height: Math.round(cropRect.height),
  };
  const trim = (r: Rect, bounds: Rect): Rect => {
    const x = Math.max(bounds.x, Math.min(r.x, bounds.x + bounds.width - 1));
    const y = Math.max(bounds.y, Math.min(r.y, bounds.y + bounds.height - 1));
    return {
      x,
      y,
      width: Math.min(r.x + r.width, bounds.x + bounds.width) - x,
      height: Math.min(r.y + r.height, bounds.y + bounds.height) - y,
    };
  };
  const shift = (r: Rect): Rect => ({ ...r, x: r.x - crop.x, y: r.y - crop.y });
  const croppedOuter = shift(trim(outer, crop));
  return { outer: croppedOuter, inner: trim(shift(inner), croppedOuter) };
}
