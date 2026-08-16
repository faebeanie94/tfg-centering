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

/** Use the measured inner box when at least two sides locked; otherwise the 8% inset. */
export function seedInnerRect(image: PixelBuffer, outer: Rect): { inner: Rect; confidence: number } {
  const detected = detectInnerArtwork(image, outer);
  if (detected.confidence < 0.5) {
    return { inner: defaultInnerRect(outer), confidence: detected.confidence };
  }
  return { inner: detected.inner, confidence: detected.confidence };
}

/**
 * Snap a seed outer box to nearby rims. Search a small window around each
 * edge so padding vs card (or a loose AABB vs the true rim) can lock.
 */
export function refineOuterRect(image: PixelBuffer, seed: Rect): Rect {
  const ySamples = buildSamples(seed.y, seed.height, SAMPLE_COUNT);
  const xSamples = buildSamples(seed.x, seed.width, SAMPLE_COUNT);
  const left = snapEdge(image, ySamples, seed.x, seed.width, false, seed.x + seed.width / 2);
  const right = snapEdge(image, ySamples, seed.x + seed.width, seed.width, false, seed.x + seed.width / 2);
  const top = snapEdge(image, xSamples, seed.y, seed.height, true, seed.y + seed.height / 2);
  const bottom = snapEdge(image, xSamples, seed.y + seed.height, seed.height, true, seed.y + seed.height / 2);

  const x = left;
  const y = top;
  const width = Math.max(8, right - left);
  const height = Math.max(8, bottom - top);
  return clampInner(
    { x: 0, y: 0, width: image.width, height: image.height },
    { x, y, width, height },
    seed,
  );
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

function snapEdge(
  image: PixelBuffer,
  samples: number[],
  origin: number,
  sideLength: number,
  vertical: boolean,
  center: number,
): number {
  const window = Math.max(5, Math.round(sideLength * 0.04));
  let bestPos = origin;
  let bestScore = 8;
  let bestDist = 0;
  for (let delta = -window; delta <= window; delta++) {
    const pos = origin + delta;
    const score = edgeScore(image, pos, samples, vertical);
    const dist = Math.abs(pos - center);
    if (score > bestScore + 1.5 || (score >= bestScore * 0.9 && dist > bestDist && score >= 8)) {
      if (score >= 8) {
        bestScore = Math.max(bestScore, score);
        bestPos = pos;
        bestDist = dist;
      }
    }
  }
  return bestPos;
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
  const step = Math.max(1, Math.round(sideLength / 420));
  const scores: number[] = [];
  const positions: number[] = [];

  for (let inset = 2; inset <= maxInset; inset += step) {
    const pos = origin + direction * inset;
    scores.push(edgeScore(image, pos, samples, vertical));
    positions.push(pos);
  }

  const smooth = smoothScores(scores);
  const rimCount = Math.max(2, Math.floor(smooth.length * 0.22));
  const floor = percentileOf(smooth.slice(0, rimCount), 0.6);
  const threshold = Math.max(8, floor + 6, floor * 1.65);

  for (let i = 0; i < smooth.length - 1; i++) {
    const inset = Math.abs(positions[i] - origin);
    if (inset < minInset) continue;
    if (smooth[i] >= threshold && smooth[i + 1] >= threshold * 0.85) {
      return { found: true, position: positions[i] };
    }
  }

  let bestI = -1;
  let best = threshold * 0.92;
  for (let i = 0; i < smooth.length; i++) {
    const inset = Math.abs(positions[i] - origin);
    if (inset < minInset || inset > sideLength * 0.14) continue;
    if (smooth[i] > best) {
      best = smooth[i];
      bestI = i;
    }
  }
  if (bestI >= 0) {
    return { found: true, position: positions[bestI] };
  }

  return { found: false, position: origin + direction * Math.round(sideLength * 0.08) };
}

function edgeScore(image: PixelBuffer, pos: number, samples: number[], vertical: boolean): number {
  let total = 0;
  let count = 0;
  for (const sample of samples) {
    if (vertical) {
      total +=
        Math.abs(luminance(image, sample, pos + 1) - luminance(image, sample, pos - 1)) +
        0.5 * Math.abs(chromaAt(image, sample, pos + 1) - chromaAt(image, sample, pos - 1));
    } else {
      total +=
        Math.abs(luminance(image, pos + 1, sample) - luminance(image, pos - 1, sample)) +
        0.5 * Math.abs(chromaAt(image, pos + 1, sample) - chromaAt(image, pos - 1, sample));
    }
    count++;
  }
  return count === 0 ? 0 : total / count;
}

function smoothScores(values: number[]): number[] {
  if (values.length < 3) return values;
  const out = values.map((v) => v);
  for (let i = 1; i < values.length - 1; i++) {
    out[i] = (values[i - 1] + values[i] * 2 + values[i + 1]) / 4;
  }
  return out;
}

function percentileOf(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function buildSamples(origin: number, length: number, count: number): number[] {
  const result: number[] = [];
  const center = origin + length / 2;
  const spread = length * 0.55;
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

function chromaAt(image: PixelBuffer, x: number, y: number): number {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= image.width || yi >= image.height) return 0;
  const offset = (yi * image.width + xi) * 4;
  const r = image.data[offset];
  const g = image.data[offset + 1];
  const b = image.data[offset + 2];
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function clampInner(outer: Rect, inner: Rect, fallback: Rect): Rect {
  const x = Math.max(outer.x + 1, Math.min(inner.x, outer.x + outer.width - 3));
  const y = Math.max(outer.y + 1, Math.min(inner.y, outer.y + outer.height - 3));
  const right = Math.max(x + 2, Math.min(inner.x + inner.width, outer.x + outer.width - 1));
  const bottom = Math.max(y + 2, Math.min(inner.y + inner.height, outer.y + outer.height - 1));
  if (right - x < 4 || bottom - y < 4) return fallback;
  return { x, y, width: right - x, height: bottom - y };
}
