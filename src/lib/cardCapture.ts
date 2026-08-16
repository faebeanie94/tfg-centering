import { CARD_ASPECT } from './card-edge-detect';

export type Point = {
  x: number;
  y: number;
};

export type CardDetection = {
  corners: Point[];
  confidence: number;
};

export type CardCaptureOptions = {
  minimumConfidence?: number;
  minimumCardWidthRatio?: number;
  minimumCardHeightRatio?: number;
  /** Mean absolute Laplacian on a ~250px sample. Higher = sharper. */
  minimumSharpness?: number;
  requiredStableFrames?: number;
  maximumCornerMovement?: number;
  captureCooldown?: number;
};

const DEFAULT_OPTIONS: Required<CardCaptureOptions> = {
  minimumConfidence: 0.9,
  minimumCardWidthRatio: 0.25,
  minimumCardHeightRatio: 0.15,
  minimumSharpness: 18,
  requiredStableFrames: 8,
  maximumCornerMovement: 8,
  captureCooldown: 1500,
};

/** Overlay / analysis-normalized space used by the live tracker. */
export const OVERLAY_SPACE = 1000;

export class CardAutoCapture {
  private options: Required<CardCaptureOptions>;
  private previousCorners: Point[] | null = null;
  private _stableFrames = 0;
  private _capturing = false;
  private locked = false;
  private lastCapture = Number.NEGATIVE_INFINITY;

  public blurScore = 0;
  public onCapture: (() => Promise<void> | void) | null = null;

  constructor(options: CardCaptureOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  get stableFrames(): number {
    return this._stableFrames;
  }

  get isCapturing(): boolean {
    return this._capturing;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get captureProgress(): number {
    return Math.min(this._stableFrames / this.options.requiredStableFrames, 1);
  }

  get requiredStableFrames(): number {
    return this.options.requiredStableFrames;
  }

  processDetection({
    corners,
    confidence,
    imageSize,
    blur,
  }: {
    corners: Point[];
    confidence: number;
    imageSize: { width: number; height: number };
    blur?: number;
  }): boolean {
    if (blur !== undefined) {
      this.blurScore = blur;
    }

    if (this._capturing || this.locked) {
      return false;
    }

    if (corners.length !== 4) {
      this.resetStability();
      return false;
    }

    if (confidence < this.options.minimumConfidence) {
      this.resetStability();
      return false;
    }

    if (!this.validCardSize(corners, imageSize)) {
      this.resetStability();
      return false;
    }

    if (!this.validPerspective(corners, imageSize)) {
      this.resetStability();
      return false;
    }

    // Laplacian magnitude is a sharpness score: reject soft frames, not sharp ones.
    if (blur !== undefined && blur < this.options.minimumSharpness) {
      this.resetStability();
      return false;
    }

    if (!this.previousCorners) {
      this.previousCorners = clonePoints(corners);
      this._stableFrames = 1;
      return false;
    }

    const movement = cornerMovement(this.previousCorners, corners);
    if (movement <= this.options.maximumCornerMovement) {
      this._stableFrames++;
    } else {
      this._stableFrames = 0;
    }

    this.previousCorners = clonePoints(corners);

    if (this._stableFrames >= this.options.requiredStableFrames) {
      const now = performance.now();
      if (now - this.lastCapture < this.options.captureCooldown) {
        this.resetStability();
        return false;
      }

      this._capturing = true;
      this.lastCapture = now;
      const pending = this.onCapture?.();
      void Promise.resolve(pending).finally(() => {
        globalThis.setTimeout(() => {
          this._capturing = false;
          this.locked = true;
          this.resetStability();
        }, 400);
      });
      return true;
    }

    return false;
  }

  resetStability(): void {
    this._stableFrames = 0;
    this.previousCorners = null;
  }

  reset(): void {
    this.resetStability();
    this.blurScore = 0;
    this.lastCapture = Number.NEGATIVE_INFINITY;
    this._capturing = false;
    this.locked = false;
  }

  private validCardSize(
    corners: Point[],
    imageSize: { width: number; height: number },
  ): boolean {
    const topWidth = distance(corners[0], corners[1]);
    const bottomWidth = distance(corners[3], corners[2]);
    const leftHeight = distance(corners[0], corners[3]);
    const rightHeight = distance(corners[1], corners[2]);
    const width = (topWidth + bottomWidth) / 2;
    const height = (leftHeight + rightHeight) / 2;

    if (width < imageSize.width * this.options.minimumCardWidthRatio) return false;
    if (height < imageSize.height * this.options.minimumCardHeightRatio) return false;
    return true;
  }

  private validPerspective(
    corners: Point[],
    imageSize: { width: number; height: number },
  ): boolean {
    for (const point of corners) {
      if (point.x < 0 || point.y < 0 || point.x > imageSize.width || point.y > imageSize.height) {
        return false;
      }
    }

    const top = distance(corners[0], corners[1]);
    const bottom = distance(corners[3], corners[2]);
    const left = distance(corners[0], corners[3]);
    const right = distance(corners[1], corners[2]);
    if (top <= 0 || bottom <= 0 || left <= 0 || right <= 0) return false;

    const horizontalRatio = Math.min(top, bottom) / Math.max(top, bottom);
    const verticalRatio = Math.min(left, right) / Math.max(left, right);
    return horizontalRatio >= 0.45 && verticalRatio >= 0.45;
  }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cornerMovement(a: Point[], b: Point[]): number {
  if (a.length !== 4 || b.length !== 4) return Infinity;
  let total = 0;
  for (let i = 0; i < 4; i++) total += distance(a[i], b[i]);
  return total / 4;
}

function clonePoints(points: Point[]): Point[] {
  return points.map((p) => ({ x: p.x, y: p.y }));
}

export function calculateBlurScore(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): number {
  const canvas = document.createElement('canvas');
  const width = 250;
  const sourceWidth = getSourceWidth(source);
  const sourceHeight = getSourceHeight(source);
  if (sourceWidth < 2 || sourceHeight < 2) return 0;

  const height = Math.max(3, Math.round(width * (sourceHeight / sourceWidth)));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;

  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const grayscale = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      grayscale[y * width + x] =
        0.299 * imageData.data[index] +
        0.587 * imageData.data[index + 1] +
        0.114 * imageData.data[index + 2];
    }
  }

  let total = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = grayscale[y * width + x];
      const left = grayscale[y * width + x - 1];
      const right = grayscale[y * width + x + 1];
      const top = grayscale[(y - 1) * width + x];
      const bottom = grayscale[(y + 1) * width + x];
      total += Math.abs(left + right + top + bottom - 4 * center);
      count++;
    }
  }

  return count === 0 ? 0 : total / count;
}

function getSourceWidth(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): number {
  if (source instanceof HTMLVideoElement) return source.videoWidth;
  if (source instanceof HTMLImageElement) return source.naturalWidth;
  return source.width;
}

function getSourceHeight(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): number {
  if (source instanceof HTMLVideoElement) return source.videoHeight;
  if (source instanceof HTMLImageElement) return source.naturalHeight;
  return source.height;
}

export async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob | null> {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/jpeg', 0.95);
}

/**
 * Warp a 4-corner card to a poker-size rectangle.
 * `corners` must be in the blob's intrinsic pixel space (videoWidth × videoHeight).
 */
export async function rectifyCard(
  image: Blob,
  corners: Point[],
  outputLongSide = 1200,
): Promise<Blob | null> {
  if (corners.length !== 4) return null;

  const bitmap = await createImageBitmap(image);
  try {
    const topLeft = corners[0];
    const topRight = corners[1];
    const bottomRight = corners[2];
    const bottomLeft = corners[3];

    const sourceWidth = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2;
    const sourceHeight = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2;
    if (sourceWidth <= 1 || sourceHeight <= 1) return null;

    let width: number;
    let height: number;
    if (sourceHeight >= sourceWidth) {
      height = outputLongSide;
      width = Math.round(height * CARD_ASPECT);
    } else {
      width = outputLongSide;
      height = Math.round(width * CARD_ASPECT);
    }

    width = clamp(width, 300, 2400);
    height = clamp(height, 180, 1600);

    const homography = calculateHomography(corners, width, height);
    const inverse = invert3x3(homography);
    if (!inverse) return null;

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = bitmap.width;
    sourceCanvas.height = bitmap.height;
    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceCtx) return null;
    sourceCtx.drawImage(bitmap, 0, 0);
    const sourceData = sourceCtx.getImageData(0, 0, bitmap.width, bitmap.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const outputData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const denominator = inverse[6] * x + inverse[7] * y + inverse[8];
        if (Math.abs(denominator) < 1e-6) continue;
        const sourceX = (inverse[0] * x + inverse[1] * y + inverse[2]) / denominator;
        const sourceY = (inverse[3] * x + inverse[4] * y + inverse[5]) / denominator;
        if (sourceX < 0 || sourceY < 0 || sourceX >= bitmap.width - 1 || sourceY >= bitmap.height - 1) {
          continue;
        }
        const pixel = bilinearSample(sourceData, bitmap.width, bitmap.height, sourceX, sourceY);
        const index = (y * width + x) * 4;
        outputData.data[index] = pixel.r;
        outputData.data[index + 1] = pixel.g;
        outputData.data[index + 2] = pixel.b;
        outputData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(outputData, 0, 0);
    return canvasToBlob(canvas, 'image/jpeg', 0.95);
  } finally {
    bitmap.close();
  }
}

function calculateHomography(source: Point[], width: number, height: number): number[] {
  const destination: Point[] = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];

  const matrix: number[][] = Array.from({ length: 8 }, () => Array(9).fill(0));
  for (let i = 0; i < 4; i++) {
    const x = source[i].x;
    const y = source[i].y;
    const u = destination[i].x;
    const v = destination[i].y;
    const row = i * 2;
    matrix[row][0] = x;
    matrix[row][1] = y;
    matrix[row][2] = 1;
    matrix[row][6] = -u * x;
    matrix[row][7] = -u * y;
    matrix[row][8] = u;
    matrix[row + 1][3] = x;
    matrix[row + 1][4] = y;
    matrix[row + 1][5] = 1;
    matrix[row + 1][6] = -v * x;
    matrix[row + 1][7] = -v * y;
    matrix[row + 1][8] = v;
  }
  return solveHomography(matrix);
}

function solveHomography(matrix: number[][]): number[] {
  const a = matrix.map((row) => [...row]);
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    if (Math.abs(divisor) < 1e-7) {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    for (let j = column; j < 9; j++) a[column][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = a[row][column];
      for (let j = column; j < 9; j++) a[row][j] -= factor * a[column][j];
    }
  }
  return [a[0][8], a[1][8], a[2][8], a[3][8], a[4][8], a[5][8], a[6][8], a[7][8], 1];
}

function invert3x3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const determinant = a * A + b * D + c * G;
  if (Math.abs(determinant) < 1e-7) return null;
  return [
    A / determinant,
    B / determinant,
    C / determinant,
    D / determinant,
    E / determinant,
    F / determinant,
    G / determinant,
    H / determinant,
    I / determinant,
  ];
}

function bilinearSample(data: ImageData, width: number, height: number, x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const dx = x - x0;
  const dy = y - y0;
  const p00 = getPixel(data, width, x0, y0);
  const p10 = getPixel(data, width, x1, y0);
  const p01 = getPixel(data, width, x0, y1);
  const p11 = getPixel(data, width, x1, y1);
  return {
    r: interpolate(p00.r, p10.r, p01.r, p11.r, dx, dy),
    g: interpolate(p00.g, p10.g, p01.g, p11.g, dx, dy),
    b: interpolate(p00.b, p10.b, p01.b, p11.b, dx, dy),
  };
}

function getPixel(data: ImageData, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return { r: data.data[index], g: data.data[index + 1], b: data.data[index + 2] };
}

function interpolate(p00: number, p10: number, p01: number, p11: number, dx: number, dy: number): number {
  const top = p00 + (p10 - p00) * dx;
  const bottom = p01 + (p11 - p01) * dx;
  return Math.round(top + (bottom - top) * dy);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
