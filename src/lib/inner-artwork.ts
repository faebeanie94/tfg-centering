import { defaultInnerRect, type Rect } from './centering';

export type PixelBuffer = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type InnerArtworkResult = {
  inner: Rect;
  confidence: number;
  /** 0–1 per side; used for tests and debug. */
  sideConfidence: { left: number; right: number; top: number; bottom: number };
};

const MIN_INSET_RATIO = 0.02;
const MAX_INSET_RATIO = 0.22;
const SAMPLE_COUNT = 48;

/**
 * Find the artwork / print rectangle *inside* an already-known card outer box.
 * This is a separate detector from the outer card-vs-background search.
 *
 * Walks inward from each outer edge, skips the physical rim, and takes the first
 * strong luminance edge in the plausible TCG border band (~2–22% of that side).
 */
export function detectInnerArtwork(image: PixelBuffer, outer: Rect): InnerArtworkResult {
  const fallback = defaultInnerRect(outer);
  const ySamples = buildSamples(outer.y, outer.height, SAMPLE_COUNT);
  const xSamples = buildSamples(outer.x, outer.width, SAMPLE_COUNT);

  const left = findFirstEdge(image, ySamples, outer.x, 1, outer.width, MIN_INSET_RATIO, MAX_INSET_RATIO);
  const right = findFirstEdge(image, ySamples, outer.x + outer.width - 1, -1, outer.width, MIN_INSET_RATIO, MAX_INSET_RATIO);
  const top = findFirstEdge(image, xSamples, outer.y, 1, outer.height, MIN_INSET_RATIO, MAX_INSET_RATIO, true);
  const bottom = findFirstEdge(image, xSamples, outer.y + outer.height - 1, -1, outer.height, MIN_INSET_RATIO, MAX_INSET_RATIO, true);

  const leftX = left.found ? left.position : fallback.x;
  const rightX = right.found ? right.position : fallback.x + fallback.width;
  const topY = top.found ? top.position : fallback.y;
  const bottomY = bottom.found ? bottom.position : fallback.y + fallback.height;

  const inner: Rect = {
    x: leftX,
    y: topY,
    width: Math.max(2, rightX - leftX),
    height: Math.max(2, bottomY - topY),
  };

  const sides = [left, right, top, bottom];
  const foundCount = sides.filter((s) => s.found).length;
  const confidence = foundCount / 4;

  return {
    inner: clampInner(outer, inner, fallback),
    confidence,
    sideConfidence: {
      left: left.found ? 1 : 0,
      right: right.found ? 1 : 0,
      top: top.found ? 1 : 0,
      bottom: bottom.found ? 1 : 0,
    },
  };
}

/** Use the measured inner box when at least two opposite-ish sides locked; otherwise the 8% inset. */
export function seedInnerRect(image: PixelBuffer, outer: Rect): { inner: Rect; confidence: number } {
  const detected = detectInnerArtwork(image, outer);
  if (detected.confidence < 0.5) {
    return { inner: defaultInnerRect(outer), confidence: detected.confidence };
  }
  return { inner: detected.inner, confidence: detected.confidence };
}

export function pixelBufferFromImage(image: HTMLImageElement): PixelBuffer {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || width < 2 || height < 2) {
    return { width: 0, height: 0, data: new Uint8ClampedArray() };
  }
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
}

export function seedInnerFromImage(
  image: HTMLImageElement,
  outer: Rect,
): { inner: Rect; confidence: number } {
  const buffer = pixelBufferFromImage(image);
  if (buffer.width === 0) {
    return { inner: defaultInnerRect(outer), confidence: 0 };
  }
  return seedInnerRect(buffer, outer);
}

function findFirstEdge(
  image: PixelBuffer,
  samples: number[],
  origin: number,
  direction: 1 | -1,
  sideLength: number,
  minRatio: number,
  maxRatio: number,
  vertical = false,
): { found: boolean; position: number } {
  const minInset = Math.max(3, Math.round(sideLength * minRatio));
  const maxInset = Math.max(minInset + 2, Math.round(sideLength * maxRatio));
  const scores: number[] = [];
  const positions: number[] = [];

  for (let inset = 2; inset <= maxInset; inset++) {
    const pos = origin + direction * inset;
    scores.push(edgeScore(image, pos, samples, vertical));
    positions.push(pos);
  }

  const median = medianOf(scores);
  const threshold = Math.max(14, median * 1.7);

  for (let i = 0; i < scores.length; i++) {
    const inset = 2 + i;
    if (inset < minInset) continue;
    if (scores[i] >= threshold) {
      return { found: true, position: positions[i] };
    }
  }

  return { found: false, position: origin + direction * Math.round(sideLength * 0.08) };
}

function edgeScore(image: PixelBuffer, pos: number, samples: number[], vertical: boolean): number {
  let total = 0;
  let count = 0;
  for (const sample of samples) {
    if (vertical) {
      total += Math.abs(luminance(image, sample, pos + 1) - luminance(image, sample, pos - 1));
    } else {
      total += Math.abs(luminance(image, pos + 1, sample) - luminance(image, pos - 1, sample));
    }
    count++;
  }
  return count === 0 ? 0 : total / count;
}

function buildSamples(origin: number, length: number, count: number): number[] {
  const result: number[] = [];
  const center = origin + length / 2;
  const spread = length * 0.3;
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const value = Math.round(center + (t - 0.5) * spread);
    if (value >= origin && value < origin + length) result.push(value);
  }
  return result;
}

function luminance(image: PixelBuffer, x: number, y: number): number {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= image.width || yi >= image.height) return 0;
  const offset = (yi * image.width + xi) * 4;
  return 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function clampInner(outer: Rect, inner: Rect, fallback: Rect): Rect {
  const x = Math.max(outer.x + 1, Math.min(inner.x, outer.x + outer.width - 3));
  const y = Math.max(outer.y + 1, Math.min(inner.y, outer.y + outer.height - 3));
  const right = Math.max(x + 2, Math.min(inner.x + inner.width, outer.x + outer.width - 1));
  const bottom = Math.max(y + 2, Math.min(inner.y + inner.height, outer.y + outer.height - 1));
  if (right - x < 4 || bottom - y < 4) return fallback;
  return { x, y, width: right - x, height: bottom - y };
}
