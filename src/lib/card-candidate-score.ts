import type { Point, QuadCorners } from './perspective';
import type { DetectedCard } from './card-edge-detect';

export type QuadPoint = Point | [number, number] | Float32Array | number[];

export interface ImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ScoreCandidate {
  points?: QuadPoint[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export type ScoredCandidate = ScoreCandidate & {
  points: Point[];
  score: number;
};

function asPoint(value: QuadPoint): Point {
  if (Array.isArray(value) || value instanceof Float32Array) {
    return { x: Number(value[0]), y: Number(value[1]) };
  }
  return { x: value.x, y: value.y };
}

export function orderPoints(points: QuadPoint[]): Point[] {
  const pts = points.map(asPoint);
  const sums = pts.map((p) => p.x + p.y);
  const diffs = pts.map((p) => p.y - p.x);

  let minSum = 0;
  let maxSum = 0;
  let minDiff = 0;
  let maxDiff = 0;
  for (let i = 1; i < 4; i++) {
    if (sums[i] < sums[minSum]) minSum = i;
    if (sums[i] > sums[maxSum]) maxSum = i;
    if (diffs[i] < diffs[minDiff]) minDiff = i;
    if (diffs[i] > diffs[maxDiff]) maxDiff = i;
  }

  return [pts[minSum], pts[minDiff], pts[maxSum], pts[maxDiff]];
}

export function quadArea(points: QuadPoint[]): number {
  const ordered = orderPoints(points);
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = ordered[i];
    const b = ordered[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function quadAngles(points: QuadPoint[]): number[] {
  const ordered = orderPoints(points);
  const angles: number[] = [];

  for (let i = 0; i < 4; i++) {
    const current = ordered[i];
    const previous = ordered[(i + 3) % 4];
    const nextPoint = ordered[(i + 1) % 4];

    const ax = previous.x - current.x;
    const ay = previous.y - current.y;
    const bx = nextPoint.x - current.x;
    const by = nextPoint.y - current.y;

    const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (denominator < 1e-6) return [];

    const cosine = Math.min(1, Math.max(-1, (ax * bx + ay * by) / denominator));
    angles.push((Math.acos(cosine) * 180) / Math.PI);
  }

  return angles;
}

export function perspectiveScore(points: QuadPoint[], imageShape: { width: number; height: number }): number {
  const ordered = orderPoints(points);
  const { width: w, height: h } = imageShape;
  const area = quadArea(ordered);
  const imageArea = w * h;

  if (imageArea <= 0) return 0;

  const areaRatio = area / imageArea;
  if (areaRatio < 0.03 || areaRatio > 0.95) return 0;

  const areaScore = Math.min(1, Math.max(0, (areaRatio - 0.03) / 0.2));
  const angles = quadAngles(ordered);
  if (angles.length !== 4) return 0;

  const angleDeviation = angles.reduce((sum, angle) => sum + Math.abs(angle - 90), 0) / 4;
  // Perspective cards can have substantially non-90-degree corners, so
  // penalize distortion gradually rather than requiring a rectangle.
  const angleScore = Math.exp(-angleDeviation / 30);

  const edgeLengths = [0, 1, 2, 3].map((i) => {
    const p1 = ordered[i];
    const p2 = ordered[(i + 1) % 4];
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  });

  if (Math.min(...edgeLengths) < 1) return 0;

  const oppositeWidthRatio =
    Math.min(edgeLengths[0], edgeLengths[2]) / Math.max(edgeLengths[0], edgeLengths[2]);
  const oppositeHeightRatio =
    Math.min(edgeLengths[1], edgeLengths[3]) / Math.max(edgeLengths[1], edgeLengths[3]);
  const oppositeEdgeScore = 0.5 * oppositeWidthRatio + 0.5 * oppositeHeightRatio;

  return 0.4 * areaScore + 0.35 * angleScore + 0.25 * oppositeEdgeScore;
}

function grayAt(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  const i = (y * w + x) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** 5×5 Gaussian blur + Canny (50/150), matching the OpenCV defaults in detector.py. */
export function buildCannyEdgeMap(image: ImageLike): Uint8Array {
  const { data, width: w, height: h } = image;
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      gray[y * w + x] = grayAt(data, w, x, y);
    }
  }

  const kernel = [1, 4, 6, 4, 1];
  const tmp = new Float32Array(w * h);
  const blurred = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let weight = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        acc += gray[y * w + xx] * kernel[k + 2];
        weight += kernel[k + 2];
      }
      tmp[y * w + x] = acc / weight;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let weight = 0;
      for (let k = -2; k <= 2; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        acc += tmp[yy * w + x] * kernel[k + 2];
        weight += kernel[k + 2];
      }
      blurred[y * w + x] = acc / weight;
    }
  }

  const mag = new Float32Array(w * h);
  const dir = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -blurred[(y - 1) * w + (x - 1)] +
        blurred[(y - 1) * w + (x + 1)] +
        -2 * blurred[y * w + (x - 1)] +
        2 * blurred[y * w + (x + 1)] +
        -blurred[(y + 1) * w + (x - 1)] +
        blurred[(y + 1) * w + (x + 1)];
      const gy =
        -blurred[(y - 1) * w + (x - 1)] -
        2 * blurred[(y - 1) * w + x] -
        blurred[(y - 1) * w + (x + 1)] +
        blurred[(y + 1) * w + (x - 1)] +
        2 * blurred[(y + 1) * w + x] +
        blurred[(y + 1) * w + (x + 1)];
      const m = Math.hypot(gx, gy);
      mag[y * w + x] = m;
      const angle = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
      dir[y * w + x] = angle < 22.5 || angle >= 157.5 ? 0 : angle < 67.5 ? 1 : angle < 112.5 ? 2 : 3;
    }
  }

  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      let a = 0;
      let b = 0;
      if (dir[i] === 0) {
        a = mag[i - 1];
        b = mag[i + 1];
      } else if (dir[i] === 1) {
        a = mag[(y - 1) * w + (x + 1)];
        b = mag[(y + 1) * w + (x - 1)];
      } else if (dir[i] === 2) {
        a = mag[(y - 1) * w + x];
        b = mag[(y + 1) * w + x];
      } else {
        a = mag[(y - 1) * w + (x - 1)];
        b = mag[(y + 1) * w + (x + 1)];
      }
      nms[i] = m >= a && m >= b ? m : 0;
    }
  }

  const low = 50;
  const high = 150;
  const edges = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) {
      edges[i] = 255;
      stack.push(i);
    }
  }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (edges[ni] || nms[ni] < low) continue;
        edges[ni] = 255;
        stack.push(ni);
      }
    }
  }

  return edges;
}

export function edgeAlignmentScore(points: QuadPoint[], edgeMap: Uint8Array, width: number, height: number): number {
  const ordered = orderPoints(points);
  const scores: number[] = [];

  for (let i = 0; i < 4; i++) {
    const p1 = ordered[i];
    const p2 = ordered[(i + 1) % 4];
    const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (length < 10) return 0;

    const samples = Math.max(20, Math.floor(length / 5));
    const values: number[] = [];

    for (let s = 0; s < samples; s++) {
      const t = samples === 1 ? 0 : s / (samples - 1);
      const xi = Math.round(p1.x + (p2.x - p1.x) * t);
      const yi = Math.round(p1.y + (p2.y - p1.y) * t);
      if (xi < 0 || xi >= width || yi < 0 || yi >= height) continue;

      const x0 = Math.max(0, xi - 2);
      const x1 = Math.min(width, xi + 3);
      const y0 = Math.max(0, yi - 2);
      const y1 = Math.min(height, yi + 3);
      let maxVal = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const v = edgeMap[y * width + x];
          if (v > maxVal) maxVal = v;
        }
      }
      values.push(maxVal / 255);
    }

    if (!values.length) return 0;

    const strongRatio = values.filter((v) => v >= 0.2).length / values.length;
    const meanStrength = values.reduce((sum, v) => sum + v, 0) / values.length;
    scores.push(0.65 * strongRatio + 0.35 * meanStrength);
  }

  return scores.reduce((sum, v) => sum + v, 0) / scores.length;
}

export function perspectiveAwareCandidateScore(
  image: ImageLike,
  points: QuadPoint[],
  edgeMap?: Uint8Array,
): number {
  const map = edgeMap ?? buildCannyEdgeMap(image);
  const ordered = orderPoints(points);
  const { width: w, height: h } = image;

  if (ordered.some((p) => p.x < -5 || p.x > w + 5 || p.y < -5 || p.y > h + 5)) {
    return 0;
  }

  const perspective = perspectiveScore(ordered, { width: w, height: h });
  const alignment = edgeAlignmentScore(ordered, map, w, h);

  // Do not assume the card is centered at 0.5 / 0.36.
  const centerX = (ordered[0].x + ordered[1].x + ordered[2].x + ordered[3].x) / 4 / Math.max(w, 1);
  const centerY = (ordered[0].y + ordered[1].y + ordered[2].y + ordered[3].y) / 4 / Math.max(h, 1);
  const centerPrior = Math.min(
    1,
    Math.max(0, 1 - (0.15 * Math.abs(centerX - 0.5) + 0.1 * Math.abs(centerY - 0.5))),
  );

  return 0.55 * perspective + 0.4 * alignment + 0.05 * centerPrior;
}

export function candidateToQuad(candidate: ScoreCandidate): Point[] {
  if (candidate.points) return orderPoints(candidate.points);

  const x = candidate.x ?? 0;
  const y = candidate.y ?? 0;
  const width = candidate.width ?? 0;
  const height = candidate.height ?? 0;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function cornersToPoints(corners: QuadCorners): Point[] {
  return [corners.tl, corners.tr, corners.br, corners.bl];
}

export function detectedBoxToQuad(box: DetectedCard, width: number, height: number): Point[] {
  return [
    { x: box.left * width, y: box.top * height },
    { x: (box.left + box.width) * width, y: box.top * height },
    { x: (box.left + box.width) * width, y: (box.top + box.height) * height },
    { x: box.left * width, y: (box.top + box.height) * height },
  ];
}

export function scoreCandidates<T extends ScoreCandidate>(
  image: ImageLike,
  candidates: T[],
): Array<T & ScoredCandidate> {
  if (!candidates.length) return [];

  const edgeMap = buildCannyEdgeMap(image);
  const scored = candidates.map((candidate) => {
    const quad = candidateToQuad(candidate);
    return {
      ...candidate,
      points: quad,
      score: perspectiveAwareCandidateScore(image, quad, edgeMap),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function findBestCardCandidate<T extends ScoreCandidate>(
  image: ImageLike,
  candidates: T[],
): (T & ScoredCandidate) | null {
  const scored = scoreCandidates(image, candidates);
  return scored[0] ?? null;
}
