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

const MIN_WIDTH_RATIO = 0.25;
const MIN_HEIGHT_RATIO = 0.25;

/** Higher = sharper. Tune per camera; 18 is a starting point. */
export const MIN_SHARPNESS = 18;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Laplacian-style sharpness on a downscaled live frame. Higher = sharper. */
export function calculateBlurScore(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;

  const { width, height } = canvas;
  if (width < 3 || height < 3) return 0;

  const image = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    gray[i] = 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
  }

  let total = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = gray[y * width + x];
      const left = gray[y * width + x - 1];
      const right = gray[y * width + x + 1];
      const top = gray[(y - 1) * width + x];
      const bottom = gray[(y + 1) * width + x];
      total += Math.abs(left + right + top + bottom - 4 * center);
      count++;
    }
  }

  return count === 0 ? 0 : total / count;
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

  if (blurScore < MIN_SHARPNESS) {
    return {
      valid: false,
      blurScore,
      cardWidth,
      cardHeight,
      widthRatio,
      heightRatio,
      aspectRatio,
      message: 'Hold still',
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
