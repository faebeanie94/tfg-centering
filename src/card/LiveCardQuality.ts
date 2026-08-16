export interface Point {
  x: number;
  y: number;
}

export interface CardQuality {
  valid: boolean;
  blurScore: number;
  cardWidth: number;
  cardHeight: number;
  widthRatio: number;
  heightRatio: number;
  aspectRatio: number;
  message: string;
}

export type BlurRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_WIDTH_RATIO = 0.25;
const MIN_HEIGHT_RATIO = 0.25;

/**
 * Laplacian *variance* on a ~320px live sample. Higher = sharper.
 * Whole-frame mean |Laplacian| of a card photo is often 2–8 even when sharp,
 * so do not use 18 as a mean-magnitude cutoff.
 */
export const MIN_SHARPNESS = 6;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Laplacian variance. Optional region is in canvas pixels (e.g. the detected card). */
export function calculateBlurScore(canvas: HTMLCanvasElement, region?: BlurRegion): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;

  const { width, height } = canvas;
  if (width < 3 || height < 3) return 0;

  let x0 = 0;
  let y0 = 0;
  let x1 = width;
  let y1 = height;
  if (region) {
    x0 = Math.max(1, Math.floor(region.x));
    y0 = Math.max(1, Math.floor(region.y));
    x1 = Math.min(width - 1, Math.ceil(region.x + region.width));
    y1 = Math.min(height - 1, Math.ceil(region.y + region.height));
  }
  if (x1 - x0 < 4 || y1 - y0 < 4) {
    x0 = 1;
    y0 = 1;
    x1 = width - 1;
    y1 = height - 1;
  }

  const image = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    gray[i] = 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const center = gray[y * width + x];
      const left = gray[y * width + x - 1];
      const right = gray[y * width + x + 1];
      const top = gray[(y - 1) * width + x];
      const bottom = gray[(y + 1) * width + x];
      const laplacian = left + right + top + bottom - 4 * center;
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return Math.max(0, sumSq / count - mean * mean);
}

/**
 * Size / in-frame / sharpness gates in the camera's intrinsic pixel space
 * (`video.videoWidth` × `video.videoHeight`), not CSS layout size.
 */
export function evaluateCardQuality(
  corners: Point[],
  videoWidth: number,
  videoHeight: number,
  blurScore: number,
): CardQuality {
  if (corners.length !== 4 || videoWidth <= 0 || videoHeight <= 0) {
    return {
      valid: false,
      blurScore,
      cardWidth: 0,
      cardHeight: 0,
      widthRatio: 0,
      heightRatio: 0,
      aspectRatio: 0,
      message: 'Position your card',
    };
  }

  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const cardWidth = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2;
  const cardHeight = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2;
  const widthRatio = cardWidth / videoWidth;
  const heightRatio = cardHeight / videoHeight;
  const aspectRatio = cardWidth / Math.max(cardHeight, 1);

  const inside = corners.every(
    (point) => point.x >= 0 && point.y >= 0 && point.x <= videoWidth && point.y <= videoHeight,
  );

  if (!inside) {
    return {
      valid: false,
      blurScore,
      cardWidth,
      cardHeight,
      widthRatio,
      heightRatio,
      aspectRatio,
      message: 'Keep the card inside the frame',
    };
  }

  if (widthRatio < MIN_WIDTH_RATIO || heightRatio < MIN_HEIGHT_RATIO) {
    return {
      valid: false,
      blurScore,
      cardWidth,
      cardHeight,
      widthRatio,
      heightRatio,
      aspectRatio,
      message: 'Move closer to the card',
    };
  }

  // 0 means the sample was not ready — do not treat that as blur (it was blocking every shot).
  if (blurScore > 0 && blurScore < MIN_SHARPNESS) {
    return {
      valid: false,
      blurScore,
      cardWidth,
      cardHeight,
      widthRatio,
      heightRatio,
      aspectRatio,
      message: 'Image looks soft',
    };
  }

  return {
    valid: true,
    blurScore,
    cardWidth,
    cardHeight,
    widthRatio,
    heightRatio,
    aspectRatio,
    message: 'Good — hold steady',
  };
}
