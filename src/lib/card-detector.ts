/** Browser port of the OpenCV rim detector (detector.py). */

export interface RimPoint {
  x: number;
  y: number;
}

export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

const SOBEL_STRONG = 50;
const FOUR_EDGE_MEAN_MIN = 65;
const FOUR_EDGE_MIN_RATIO = 0.45;
const CONTOUR_MIN_POINTS = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lumaAt(image: RgbaImage, x: number, y: number): number {
  const i = (y * image.width + x) * 4;
  const r = image.data[i];
  const g = image.data[i + 1];
  const b = image.data[i + 2];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** OpenCV default σ for ksize=5, sigmaX=0: 0.3*((k-1)*0.5-1)+0.8 = 1.1 */
const GAUSS_5 = [0.0707355, 0.244588, 0.369353, 0.244588, 0.0707355];

function gaussianBlurGray(gray: Float32Array, width: number, height: number): Float32Array {
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = clamp(x + k, 0, width - 1);
        sum += gray[y * width + xx] * GAUSS_5[k + 2];
      }
      tmp[y * width + x] = sum;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const yy = clamp(y + k, 0, height - 1);
        sum += tmp[yy * width + x] * GAUSS_5[k + 2];
      }
      out[y * width + x] = sum;
    }
  }

  return out;
}

function maxWindow(
  edgeMap: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): number {
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(width, x + radius + 1);
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(height, y + radius + 1);
  let max = 0;
  for (let yy = y0; yy < y1; yy++) {
    const row = yy * width;
    for (let xx = x0; xx < x1; xx++) {
      const v = edgeMap[row + xx];
      if (v > max) max = v;
    }
  }
  return max;
}

function meanWindow(
  edgeMap: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): number {
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(width, x + radius + 1);
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(height, y + radius + 1);
  let sum = 0;
  let n = 0;
  for (let yy = y0; yy < y1; yy++) {
    const row = yy * width;
    for (let xx = x0; xx < x1; xx++) {
      sum += edgeMap[row + xx];
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Sobel magnitude of a blurred luma plane, min-max scaled to 0–255.
 * Optional mask zeroes pixels the same way as cv2.bitwise_and(..., mask=mask).
 */
export function generateEdgeMap(image: RgbaImage, mask?: Uint8Array | null): Uint8Array {
  const { width, height } = image;
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      gray[y * width + x] = lumaAt(image, x, y);
    }
  }

  const blurred = gaussianBlurGray(gray, width, height);
  const magnitude = new Float32Array(width * height);
  let min = Infinity;
  let max = -Infinity;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const gx =
        -blurred[p - width - 1] +
        blurred[p - width + 1] +
        -2 * blurred[p - 1] +
        2 * blurred[p + 1] +
        -blurred[p + width - 1] +
        blurred[p + width + 1];
      const gy =
        -blurred[p - width - 1] +
        -2 * blurred[p - width] +
        -blurred[p - width + 1] +
        blurred[p + width - 1] +
        2 * blurred[p + width] +
        blurred[p + width + 1];
      const mag = Math.hypot(gx, gy);
      magnitude[p] = mag;
      if (mag < min) min = mag;
      if (mag > max) max = mag;
    }
  }

  const out = new Uint8Array(width * height);
  const range = max - min;
  if (range > 1e-6) {
    for (let i = 0; i < magnitude.length; i++) {
      out[i] = Math.round(((magnitude[i] - min) / range) * 255);
    }
  }

  if (mask) {
    const n = Math.min(out.length, mask.length);
    for (let i = 0; i < n; i++) {
      if (mask[i] === 0) out[i] = 0;
    }
  }

  return out;
}

export function edgeContinuity(
  edgeMap: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius = 12,
  thickness = 2,
): number {
  const samples: number[] = [];

  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const px = Math.round(x + Math.cos(angle) * radius);
    const py = Math.round(y + Math.sin(angle) * radius);
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    samples.push(maxWindow(edgeMap, width, height, px, py, thickness));
  }

  if (samples.length === 0) return 0;
  let strong = 0;
  for (const s of samples) {
    if (s > SOBEL_STRONG) strong++;
  }
  return strong / samples.length;
}

function otsuThreshold(edgeMap: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < edgeMap.length; i++) hist[edgeMap[i]]++;

  const total = edgeMap.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }

  return best;
}

function isForeground(binary: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return binary[y * width + x] !== 0;
}

/** Clockwise 8-neighborhood starting at East. */
const N8: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function neighborIndex(dx: number, dy: number): number {
  for (let i = 0; i < 8; i++) {
    if (N8[i][0] === dx && N8[i][1] === dy) return i;
  }
  return 0;
}

/**
 * External contours, every boundary pixel (CHAIN_APPROX_NONE / RETR_EXTERNAL).
 * Moore-neighbor trace, started on background→foreground transitions.
 */
function findExternalContours(
  binary: Uint8Array,
  width: number,
  height: number,
): RimPoint[][] {
  const started = new Uint8Array(width * height);
  const contours: RimPoint[][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isForeground(binary, width, height, x, y)) continue;
      if (isForeground(binary, width, height, x - 1, y)) continue;
      if (started[y * width + x]) continue;

      const contour = traceMoore(binary, width, height, x, y);
      if (contour.length === 0) continue;
      for (const p of contour) started[p.y * width + p.x] = 1;
      contours.push(contour);
    }
  }

  return contours;
}

function traceMoore(
  binary: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
): RimPoint[] {
  const contour: RimPoint[] = [{ x: startX, y: startY }];
  let cx = startX;
  let cy = startY;
  let backDx = -1;
  let backDy = 0;
  const maxSteps = width * height;

  for (let step = 0; step < maxSteps; step++) {
    const startDir = neighborIndex(backDx, backDy);
    let found = false;
    let nextX = cx;
    let nextY = cy;

    for (let i = 0; i < 8; i++) {
      const dir = (startDir + 1 + i) % 8;
      const nx = cx + N8[dir][0];
      const ny = cy + N8[dir][1];
      if (!isForeground(binary, width, height, nx, ny)) continue;
      nextX = nx;
      nextY = ny;
      found = true;
      break;
    }

    if (!found) break;

    if (nextX === startX && nextY === startY && contour.length > 2) {
      break;
    }

    contour.push({ x: nextX, y: nextY });
    backDx = cx - nextX;
    backDy = cy - nextY;
    cx = nextX;
    cy = nextY;
  }

  return contour;
}

function contourPerimeter(contour: RimPoint[]): number {
  if (contour.length < 2) return 0;
  let peri = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    peri += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return peri;
}

function contourArea(contour: RimPoint[]): number {
  let sum = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function findRimPoint(image: RgbaImage, mask?: Uint8Array | null): RimPoint | null {
  const edgeMap = generateEdgeMap(image, mask);
  const { width: w, height: h } = image;
  const thresh = otsuThreshold(edgeMap);
  const binary = new Uint8Array(edgeMap.length);
  for (let i = 0; i < edgeMap.length; i++) {
    binary[i] = edgeMap[i] > thresh ? 255 : 0;
  }

  const contours = findExternalContours(binary, w, h);
  let bestPoint: RimPoint | null = null;
  let bestScore = -1;

  for (const contour of contours) {
    if (contour.length < CONTOUR_MIN_POINTS) continue;
    const perimeter = contourPerimeter(contour);
    if (perimeter <= 0) continue;
    const area = contourArea(contour);
    if (area <= 0) continue;
    const circularity = clamp((4 * Math.PI * area) / (perimeter * perimeter), 0, 1);

    for (const point of contour) {
      const x = point.x;
      const y = point.y;
      const continuity = edgeContinuity(edgeMap, w, h, x, y);
      const localEdge = meanWindow(edgeMap, w, h, x, y, 2) / 255;
      const score = 0.55 * continuity + 0.3 * localEdge + 0.15 * circularity;
      if (score > bestScore) {
        bestScore = score;
        bestPoint = { x, y };
      }
    }
  }

  return bestPoint;
}

export function fourEdgeValidation(
  edgeMap: Uint8Array,
  width: number,
  height: number,
  center: RimPoint | null,
  radius: number,
  tolerance = 0.2,
): boolean {
  if (center == null || radius <= 0) return false;

  const angles = [0, 90, 180, 270].map((d) => (d * Math.PI) / 180);
  const strengths: number[] = [];

  for (const angle of angles) {
    const values: number[] = [];
    for (let i = 0; i < 9; i++) {
      const delta = -tolerance + (i / 8) * (2 * tolerance);
      const r = radius * (1 + delta);
      const x = Math.round(center.x + Math.cos(angle) * r);
      const y = Math.round(center.y + Math.sin(angle) * r);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        values.push(maxWindow(edgeMap, width, height, x, y, 2));
      }
    }
    strengths.push(values.length ? Math.max(...values) : 0);
  }

  let strongCount = 0;
  let sum = 0;
  for (const s of strengths) {
    if (s >= SOBEL_STRONG) strongCount++;
    sum += s;
  }
  if (strongCount < 4) return false;

  const meanStrength = sum / strengths.length;
  if (meanStrength < FOUR_EDGE_MEAN_MIN) return false;
  return Math.min(...strengths) >= meanStrength * FOUR_EDGE_MIN_RATIO;
}

function rgbToSv(r: number, g: number, b: number): { s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  return { s, v };
}

/** Chroma is deliberately weak (0.20); brightness dominates (0.80). */
export function colorScore(image: RgbaImage, center: RimPoint, radius: number): number {
  const { width, height, data } = image;
  const r2 = radius * radius;
  let satSum = 0;
  let valSum = 0;
  let n = 0;

  const x0 = Math.max(0, Math.floor(center.x - radius));
  const x1 = Math.min(width - 1, Math.ceil(center.x + radius));
  const y0 = Math.max(0, Math.floor(center.y - radius));
  const y1 = Math.min(height - 1, Math.ceil(center.y + radius));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - center.x;
      const dy = y - center.y;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * width + x) * 4;
      const { s, v } = rgbToSv(data[i], data[i + 1], data[i + 2]);
      satSum += s;
      valSum += v;
      n++;
    }
  }

  if (n === 0) return 0;
  return 0.2 * (satSum / n) + 0.8 * (valSum / n);
}
