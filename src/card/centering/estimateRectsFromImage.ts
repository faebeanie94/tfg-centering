import { defaultRectsAfterCrop } from '../../lib/auto-crop';
import type { Rect } from '../../lib/centering';
import { CenteringGrader } from './CenteringGrader';
import type { PixelBuffer } from './types';

function imageToBuffer(image: HTMLImageElement): PixelBuffer {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to read card image');
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Seed green/yellow editor handles from a flattened card photo.
 * `padded` is true for perspective.ts output (8% margin); false for Commit 18 full-bleed JPEGs.
 */
export async function estimateRectsFromImage(
  imageSrc: string,
  options: { padded?: boolean } = {},
): Promise<{ outer: Rect; inner: Rect; confidence: number }> {
  const image = await loadImage(imageSrc);
  const padded = options.padded ?? true;
  const outer = padded
    ? defaultRectsAfterCrop(image.naturalWidth, image.naturalHeight).outer
    : { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const buffer = imageToBuffer(image);
  return CenteringGrader.estimateRects(buffer, { cardRect: outer });
}
