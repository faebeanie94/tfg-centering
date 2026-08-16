export interface EdgeMap {
  width: number;
  height: number;
  magnitude: Float32Array;
}

export interface DetectedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  angle: number;
}

export interface CandidateBox {
  x: number;
  y: number;
  width: number;
  height: number;
  center: [number, number];
  aspectRatio: number;
  lineScore: number;
}

export interface DetectorImage {
  width: number;
  height: number;
  /** Row-major luma, typically 0–255. */
  luma: Float32Array;
}

export function lumaFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return luma;
}

/** 5×5 Gaussian blur, matching cv2.GaussianBlur(..., (5, 5), 0). */
export function blurLuma5x5(
  luma: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const k = [1, 4, 6, 4, 1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -2; i <= 2; i++) {
        const xx = Math.min(width - 1, Math.max(0, x + i));
        acc += luma[y * width + xx] * k[i + 2];
      }
      tmp[y * width + x] = acc;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let j = -2; j <= 2; j++) {
        const yy = Math.min(height - 1, Math.max(0, y + j));
        acc += tmp[yy * width + x] * k[j + 2];
      }
      out[y * width + x] = acc / 256;
    }
  }

  return out;
}

export function buildEdgeMap(
  luma: Float32Array,
  width: number,
  height: number,
): EdgeMap {
  const magnitude = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;

      const gx =
        -luma[p - width - 1] +
        luma[p - width + 1] +
        -2 * luma[p - 1] +
        2 * luma[p + 1] +
        -luma[p + width - 1] +
        luma[p + width + 1];

      const gy =
        -luma[p - width - 1] +
        -2 * luma[p - width] +
        -luma[p - width + 1] +
        luma[p + width - 1] +
        2 * luma[p + width] +
        luma[p + width + 1];

      magnitude[p] = Math.hypot(gx, gy);
    }
  }

  return { width, height, magnitude };
}

export function generateEdgeMap(image: DetectorImage): EdgeMap {
  const blurred = blurLuma5x5(image.luma, image.width, image.height);
  return buildEdgeMap(blurred, image.width, image.height);
}

function normalizeMagnitude(magnitude: Float32Array): Uint8Array {
  let max = 0;
  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] > max) max = magnitude[i];
  }
  const out = new Uint8Array(magnitude.length);
  if (max <= 1e-6) return out;
  const scale = 255 / max;
  for (let i = 0; i < magnitude.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(magnitude[i] * scale)));
  }
  return out;
}

/** Hysteresis threshold on a Sobel magnitude map (Canny-like). */
function cannyFromMagnitude(
  magnitude: Float32Array,
  width: number,
  height: number,
  low = 50,
  high = 150,
): Uint8Array {
  const norm = normalizeMagnitude(magnitude);
  const edges = new Uint8Array(width * height);
  const strong: number[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const v = norm[p];
      if (v >= high) {
        edges[p] = 2;
        strong.push(p);
      } else if (v >= low) {
        edges[p] = 1;
      }
    }
  }

  const neighbors = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  for (let i = 0; i < strong.length; i++) {
    const p = strong[i];
    for (const d of neighbors) {
      const n = p + d;
      if (n < 0 || n >= edges.length) continue;
      if (edges[n] === 1) {
        edges[n] = 2;
        strong.push(n);
      }
    }
  }

  const binary = new Uint8Array(width * height);
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] === 2) binary[i] = 255;
  }
  return binary;
}

interface HoughOptions {
  rho: number;
  theta: number;
  threshold: number;
  minLineLength: number;
  maxLineGap: number;
}

function houghLinesP(
  edges: Uint8Array,
  width: number,
  height: number,
  options: HoughOptions,
): DetectedLine[] {
  const { rho: rhoStep, theta: thetaStep, threshold, minLineLength, maxLineGap } = options;
  const diag = Math.hypot(width, height);
  const numRho = Math.floor((2 * diag) / rhoStep) + 1;
  const numTheta = Math.round(Math.PI / thetaStep);
  const acc = new Int32Array(numRho * numTheta);
  const cos = new Float32Array(numTheta);
  const sin = new Float32Array(numTheta);
  for (let t = 0; t < numTheta; t++) {
    const a = t * thetaStep;
    cos[t] = Math.cos(a);
    sin[t] = Math.sin(a);
  }

  const points: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (edges[p] === 0) continue;
      points.push(p);
      for (let t = 0; t < numTheta; t++) {
        const rho = x * cos[t] + y * sin[t];
        const r = Math.round(rho / rhoStep + diag / rhoStep);
        if (r < 0 || r >= numRho) continue;
        acc[r * numTheta + t]++;
      }
    }
  }

  if (points.length === 0) return [];

  type Peak = { rho: number; theta: number; votes: number };
  const peaks: Peak[] = [];

  for (let r = 1; r < numRho - 1; r++) {
    for (let t = 0; t < numTheta; t++) {
      const votes = acc[r * numTheta + t];
      if (votes < threshold) continue;
      const prevT = (t + numTheta - 1) % numTheta;
      const nextT = (t + 1) % numTheta;
      if (
        votes >= acc[(r - 1) * numTheta + t] &&
        votes >= acc[(r + 1) * numTheta + t] &&
        votes >= acc[r * numTheta + prevT] &&
        votes >= acc[r * numTheta + nextT]
      ) {
        peaks.push({
          rho: (r - diag / rhoStep) * rhoStep,
          theta: t * thetaStep,
          votes,
        });
      }
    }
  }

  peaks.sort((a, b) => b.votes - a.votes);
  const kept: Peak[] = [];
  for (const peak of peaks) {
    const dup = kept.some(
      (other) =>
        Math.abs(peak.rho - other.rho) < 6 &&
        angleDelta(peak.theta, other.theta) < (6 * Math.PI) / 180,
    );
    if (!dup) kept.push(peak);
    if (kept.length >= 80) break;
  }

  const lines: DetectedLine[] = [];
  for (const peak of kept) {
    const c = Math.cos(peak.theta);
    const s = Math.sin(peak.theta);
    const alongX = -s;
    const alongY = c;

    const onLine: Array<{ x: number; y: number; t: number }> = [];
    for (const p of points) {
      const x = p % width;
      const y = (p - x) / width;
      if (Math.abs(x * c + y * s - peak.rho) > 1.75) continue;
      onLine.push({ x, y, t: x * alongX + y * alongY });
    }
    if (onLine.length < 2) continue;

    onLine.sort((a, b) => a.t - b.t);

    let start = 0;
    for (let i = 1; i <= onLine.length; i++) {
      const gap = i < onLine.length ? onLine[i].t - onLine[i - 1].t : Infinity;
      if (gap > maxLineGap) {
        const a = onLine[start];
        const b = onLine[i - 1];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length >= minLineLength) {
          lines.push(makeLine(a.x, a.y, b.x, b.y));
        }
        start = i;
      }
    }
  }

  return lines;
}

function angleDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

function makeLine(x1: number, y1: number, x2: number, y2: number): DetectedLine {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.abs((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI) % 180;
  return {
    x1: Math.round(x1),
    y1: Math.round(y1),
    x2: Math.round(x2),
    y2: Math.round(y2),
    length,
    angle,
  };
}

export function findStrongLines(edgeMap: EdgeMap): DetectedLine[] {
  const { width, height, magnitude } = edgeMap;
  const edges = cannyFromMagnitude(magnitude, width, height, 50, 150);
  const minLineLength = Math.max(30, Math.floor(Math.min(width, height) * 0.15));

  const lines = houghLinesP(edges, width, height, {
    rho: 1,
    theta: Math.PI / 180,
    threshold: 50,
    minLineLength,
    maxLineGap: 20,
  });

  const strongLines = lines.filter((line) => line.length >= 30);
  strongLines.sort((a, b) => b.length - a.length);
  return strongLines;
}

export function lineIsHorizontal(line: DetectedLine): boolean {
  const angle = line.angle;
  return angle <= 15 || angle >= 165;
}

export function lineIsVertical(line: DetectedLine): boolean {
  const angle = line.angle;
  return angle >= 75 && angle <= 105;
}

export function lineIntersection(
  line1: DetectedLine,
  line2: DetectedLine,
): [number, number] | null {
  const { x1, y1, x2, y2 } = line1;
  const { x1: x3, y1: y3, x2: x4, y2: y4 } = line2;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < 1e-8) return null;

  const px =
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator;
  const py =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator;

  return [px, py];
}

export function generateCandidateBoxes(
  image: DetectorImage,
  maxCandidates = 100,
): CandidateBox[] {
  const { width: w, height: h } = image;
  const edgeMap = generateEdgeMap(image);
  const lines = findStrongLines(edgeMap);

  const horizontal = lines.filter(lineIsHorizontal).slice(0, 40);
  const vertical = lines.filter(lineIsVertical).slice(0, 40);

  const candidates: CandidateBox[] = [];

  for (const top of horizontal) {
    for (const bottom of horizontal) {
      if (bottom === top) continue;

      const topY = (top.y1 + top.y2) / 2;
      const bottomY = (bottom.y1 + bottom.y2) / 2;
      if (bottomY <= topY) continue;

      const height = bottomY - topY;
      if (height < h * 0.15 || height > h * 0.95) continue;

      for (const left of vertical) {
        for (const right of vertical) {
          if (right === left) continue;

          const leftX = (left.x1 + left.x2) / 2;
          const rightX = (right.x1 + right.x2) / 2;
          if (rightX <= leftX) continue;

          const width = rightX - leftX;
          if (width < w * 0.15 || width > w * 0.95) continue;

          const aspectRatio = width / height;
          if (aspectRatio < 0.9 || aspectRatio > 2.0) continue;

          const cx = (leftX + rightX) / 2;
          const cy = (topY + bottomY) / 2;
          if (!(cx >= 0 && cx < w && cy >= 0 && cy < h)) continue;

          candidates.push({
            x: Math.round(leftX),
            y: Math.round(topY),
            width: Math.round(width),
            height: Math.round(height),
            center: [Math.round(cx), Math.round(cy)],
            aspectRatio,
            lineScore: top.length + bottom.length + left.length + right.length,
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.lineScore - a.lineScore);

  const filtered: CandidateBox[] = [];
  for (const candidate of candidates) {
    const duplicate = filtered.some((existing) => {
      const dx = Math.abs(candidate.center[0] - existing.center[0]);
      const dy = Math.abs(candidate.center[1] - existing.center[1]);
      return dx < w * 0.05 && dy < h * 0.05;
    });
    if (!duplicate) filtered.push(candidate);
    if (filtered.length >= maxCandidates) break;
  }

  return filtered;
}

export function findCardCandidates(
  image: DetectorImage,
  maxCandidates = 100,
): CandidateBox[] {
  return generateCandidateBoxes(image, maxCandidates);
}
