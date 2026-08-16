export interface Point {
  x: number;
  y: number;
}

export type CornerKey = 'tl' | 'tr' | 'br' | 'bl';

export interface QuadCorners {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

/** Margin around the card in the corrected image (each side). */
export const OUTPUT_PADDING_RATIO = 0.08;

/**
 * Margin used after manually adjusting corners in Perspective Fix. Deliberately
 * more generous than the tight default — the point is to keep some visible
 * background around the card rather than crop right up to the edge.
 */
export const MANUAL_CROP_PADDING_RATIO = 0.18;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function defaultCorners(imgWidth: number, imgHeight: number): QuadCorners {
  const mx = imgWidth * 0.12;
  const my = imgHeight * 0.12;
  return {
    tl: { x: mx, y: my },
    tr: { x: imgWidth - mx, y: my },
    br: { x: imgWidth - mx, y: imgHeight - my },
    bl: { x: mx, y: imgHeight - my },
  };
}

/**
 * Crop to the quad's axis-aligned bounding box — no perspective/rotation
 * correction, so a tilted photo stays tilted. Simpler and more predictable
 * than warping: no pixel stretching, and a slightly-off quad just shifts the
 * crop boundary instead of distorting the image. Confidence-scaled padding
 * (passed in by the caller) still applies, so an uncertain detection is less
 * likely to clip real card content.
 */
export async function cropToQuadBounds(
  imageSrc: string,
  corners: QuadCorners,
  paddingRatio: number = OUTPUT_PADDING_RATIO,
): Promise<string> {
  const img = await loadImage(imageSrc);
  const xs = [corners.tl.x, corners.tr.x, corners.br.x, corners.bl.x];
  const ys = [corners.tl.y, corners.tr.y, corners.br.y, corners.bl.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = (maxX - minX) * paddingRatio;
  const padY = (maxY - minY) * paddingRatio;

  const cropX = Math.max(0, minX - padX);
  const cropY = Math.max(0, minY - padY);
  const cropRight = Math.min(img.naturalWidth, maxX + padX);
  const cropBottom = Math.min(img.naturalHeight, maxY + padY);
  const cropWidth = Math.max(1, cropRight - cropX);
  const cropHeight = Math.max(1, cropBottom - cropY);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cropWidth);
  canvas.height = Math.round(cropHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.95);
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
