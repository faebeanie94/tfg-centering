import { CARD_ASPECT, buildBlurredLuma, type DetectedCard } from './card-edge-detect';
import type { Point, QuadCorners } from './perspective';

export interface EdgeMap {
  width: number;
  height: number;
  magnitude: Float32Array;
}

export interface LineCandidate {
  position: number;
  strength: number;
  continuity: number;
}

export interface CardDetectionQuality {
  overall: number;
  edgeStrength: number;
  continuity: number;
  aspect: number;
  geometry: number;
  separation: number;
  warnings: string[];
}

export interface CornerDetection {
  corners: QuadCorners;
  /** 0–1 quality estimate. Auto-apply only when high. */
  confidence: number;
  quality?: CardDetectionQuality;
}

export interface CardCandidate {
  box: DetectedCard;
  edgeScore: number;
  continuityScore: number;
  aspectScore: number;
  separationScore: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lumAt(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  const xx = clamp(Math.round(x), 0, w - 1);
  const yy = clamp(Math.round(y), 0, Math.floor(data.length / (4 * w)) - 1);
  const i = (yy * w + xx) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

export function buildEdgeMap(luma: Float32Array, width: number, height: number): EdgeMap {
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

function lineRank(c: LineCandidate): number {
  return c.strength * 0.55 + c.continuity * 100 * 0.45;
}

export function scoreVerticalLine(
  edges: Float32Array,
  width: number,
  x: number,
  top: number,
  bottom: number,
): LineCandidate {
  let strength = 0;
  let samples = 0;
  let strong = 0;

  for (let y = top; y <= bottom; y += 3) {
    const p = y * width + x;
    const left = edges[p - 1] ?? 0;
    const right = edges[p + 1] ?? 0;
    const e = (left + right) / 2;
    strength += e;
    samples++;
    if (e > 20) strong++;
  }

  return {
    position: x,
    strength: strength / Math.max(1, samples),
    continuity: strong / Math.max(1, samples),
  };
}

export function scoreHorizontalLine(
  edges: Float32Array,
  width: number,
  y: number,
  left: number,
  right: number,
): LineCandidate {
  let strength = 0;
  let samples = 0;
  let strong = 0;

  for (let x = left; x <= right; x += 3) {
    const p = y * width + x;
    const above = edges[p - width] ?? 0;
    const below = edges[p + width] ?? 0;
    const e = (above + below) / 2;
    strength += e;
    samples++;
    if (e > 20) strong++;
  }

  return {
    position: y,
    strength: strength / Math.max(1, samples),
    continuity: strong / Math.max(1, samples),
  };
}

function pickLinePeaks(cands: LineCandidate[], minSep: number, maxKeep: number): LineCandidate[] {
  const ranked = [...cands].sort((a, b) => lineRank(b) - lineRank(a));
  const kept: LineCandidate[] = [];
  for (const c of ranked) {
    if (c.continuity < 0.18) continue;
    if (kept.some((k) => Math.abs(k.position - c.position) < minSep)) continue;
    kept.push(c);
    if (kept.length >= maxKeep) break;
  }
  return kept;
}

function scanVerticalLines(edges: EdgeMap): LineCandidate[] {
  const { width, height, magnitude } = edges;
  const top = Math.max(1, Math.floor(height * 0.08));
  const bottom = Math.min(height - 2, Math.ceil(height * 0.92));
  const cands: LineCandidate[] = [];
  for (let x = 2; x < width - 2; x += 2) {
    cands.push(scoreVerticalLine(magnitude, width, x, top, bottom));
  }
  return pickLinePeaks(cands, 10, 14);
}

function scanHorizontalLines(edges: EdgeMap): LineCandidate[] {
  const { width, height, magnitude } = edges;
  const left = Math.max(1, Math.floor(width * 0.08));
  const right = Math.min(width - 2, Math.ceil(width * 0.92));
  const cands: LineCandidate[] = [];
  for (let y = 2; y < height - 2; y += 2) {
    cands.push(scoreHorizontalLine(magnitude, width, y, left, right));
  }
  return pickLinePeaks(cands, 10, 14);
}

function plausibleAspect(width: number, height: number, cardAspect: number): number | null {
  if (height < 1e-6) return null;
  const ratio = width / height;
  const err = Math.min(Math.abs(ratio - cardAspect), Math.abs(ratio - 1 / cardAspect));
  if (err > 0.08) return null;
  return 1 - err / 0.08;
}

function meanLumaBand(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const xa = clamp(Math.min(x0, x1), 0, w - 1);
  const xb = clamp(Math.max(x0, x1), 0, w - 1);
  const ya = clamp(Math.min(y0, y1), 0, h - 1);
  const yb = clamp(Math.max(y0, y1), 0, h - 1);
  let sum = 0;
  let n = 0;
  const step = 2;
  for (let y = ya; y <= yb; y += step) {
    for (let x = xa; x <= xb; x += step) {
      sum += lumAt(data, w, x, y);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Inside vs outside luma difference along the four sides of a candidate box. */
export function edgeSeparationScore(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  box: DetectedCard,
): number {
  const left = box.left * w;
  const right = (box.left + box.width) * w;
  const top = box.top * h;
  const bottom = (box.top + box.height) * h;
  const inset = 7;
  const outset = 7;

  const sides: number[] = [];
  sides.push(
    Math.abs(
      meanLumaBand(data, w, h, left + inset, top + 8, left + inset + 4, bottom - 8) -
        meanLumaBand(data, w, h, left - outset - 4, top + 8, left - outset, bottom - 8),
    ),
  );
  sides.push(
    Math.abs(
      meanLumaBand(data, w, h, right - inset - 4, top + 8, right - inset, bottom - 8) -
        meanLumaBand(data, w, h, right + outset, top + 8, right + outset + 4, bottom - 8),
    ),
  );
  sides.push(
    Math.abs(
      meanLumaBand(data, w, h, left + 8, top + inset, right - 8, top + inset + 4) -
        meanLumaBand(data, w, h, left + 8, top - outset - 4, right - 8, top - outset),
    ),
  );
  sides.push(
    Math.abs(
      meanLumaBand(data, w, h, left + 8, bottom - inset - 4, right - 8, bottom - inset) -
        meanLumaBand(data, w, h, left + 8, bottom + outset, right - 8, bottom + outset + 4),
    ),
  );

  const mean = sides.reduce((s, v) => s + v, 0) / sides.length;
  return clamp(mean / 40, 0, 1);
}

export function findCardCandidates(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cardAspect: number = CARD_ASPECT,
): CardCandidate[] {
  const luma = buildBlurredLuma(data, w, h);
  const edges = buildEdgeMap(luma, w, h);
  const verticals = scanVerticalLines(edges);
  const horizontals = scanHorizontalLines(edges);
  const out: CardCandidate[] = [];

  for (let i = 0; i < verticals.length; i++) {
    for (let j = i + 1; j < verticals.length; j++) {
      const leftX = Math.min(verticals[i].position, verticals[j].position);
      const rightX = Math.max(verticals[i].position, verticals[j].position);
      const pixelW = rightX - leftX;
      if (pixelW < w * 0.12 || pixelW > w * 0.92) continue;

      for (let k = 0; k < horizontals.length; k++) {
        for (let m = k + 1; m < horizontals.length; m++) {
          const topY = Math.min(horizontals[k].position, horizontals[m].position);
          const botY = Math.max(horizontals[k].position, horizontals[m].position);
          const pixelH = botY - topY;
          if (pixelH < h * 0.12 || pixelH > h * 0.92) continue;

          const width = pixelW / w;
          const height = pixelH / h;
          const area = width * height;
          if (area < 0.08 || area > 0.72) continue;

          const aspectScore = plausibleAspect(width, height, cardAspect);
          if (aspectScore == null) continue;

          const box: DetectedCard = {
            left: leftX / w,
            top: topY / h,
            width,
            height,
          };

          const vPair = [verticals[i], verticals[j]];
          const hPair = [horizontals[k], horizontals[m]];
          const edgeScore =
            (vPair[0].strength + vPair[1].strength + hPair[0].strength + hPair[1].strength) / 4;
          const continuityScore =
            (vPair[0].continuity + vPair[1].continuity + hPair[0].continuity + hPair[1].continuity) / 4;
          const separationScore = edgeSeparationScore(data, w, h, box);
          if (!Number.isFinite(separationScore) || separationScore < 0.18) continue;

          out.push({
            box,
            edgeScore: clamp(edgeScore / 200, 0, 1),
            continuityScore,
            aspectScore,
            separationScore,
          });
        }
      }
    }
  }

  out.sort((a, b) => {
    const sa =
      a.edgeScore * 0.3 + a.continuityScore * 0.25 + a.aspectScore * 0.25 + a.separationScore * 0.2;
    const sb =
      b.edgeScore * 0.3 + b.continuityScore * 0.25 + b.aspectScore * 0.25 + b.separationScore * 0.2;
    return sb - sa;
  });

  const unique: CardCandidate[] = [];
  for (const c of out) {
    const cx = c.box.left + c.box.width / 2;
    const cy = c.box.top + c.box.height / 2;
    if (
      unique.some((u) => {
        const ux = u.box.left + u.box.width / 2;
        const uy = u.box.top + u.box.height / 2;
        return Math.hypot(cx - ux, cy - uy) < 0.06 && Math.abs(c.box.width - u.box.width) < 0.05;
      })
    ) {
      continue;
    }
    unique.push(c);
    if (unique.length >= 8) break;
  }
  return unique;
}

interface LineFit {
  a: number;
  b: number;
  c: number;
  count: number;
  residual: number;
}

function fitLine(points: Point[]): LineFit | null {
  if (points.length < 2) return null;

  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const tmp = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const l1 = trace / 2 + tmp;
  let a: number;
  let b: number;
  if (Math.abs(sxy) > 1e-6 || Math.abs(sxx - l1) > 1e-6) {
    const tx = sxy === 0 && Math.abs(sxx - l1) < 1e-6 ? 1 : sxy;
    const ty = l1 - sxx;
    const tlen = Math.hypot(tx, ty) || 1;
    a = -ty / tlen;
    b = tx / tlen;
  } else {
    a = 1;
    b = 0;
  }

  const n = Math.hypot(a, b) || 1;
  a /= n;
  b /= n;
  const c = a * mx + b * my;

  let residual = 0;
  for (const p of points) {
    residual += Math.abs(a * p.x + b * p.y - c);
  }
  residual /= points.length;

  return { a, b, c, count: points.length, residual };
}

function intersectLines(l1: LineFit, l2: LineFit): Point | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-6) return null;
  return {
    x: (l1.c * l2.b - l2.c * l1.b) / det,
    y: (l1.a * l2.c - l2.a * l1.c) / det,
  };
}

function orderCorners(points: Point[]): QuadCorners | null {
  if (points.length !== 4) return null;
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );

  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < 4; i++) {
    const score = sorted[i].x + sorted[i].y;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return {
    tl: sorted[best],
    tr: sorted[(best + 1) % 4],
    br: sorted[(best + 2) % 4],
    bl: sorted[(best + 3) % 4],
  };
}

function quadArea(q: QuadCorners): number {
  const pts = [q.tl, q.tr, q.br, q.bl];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function isConvexQuad(q: QuadCorners): boolean {
  const pts = [q.tl, q.tr, q.br, q.bl];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-3) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function estimateQuadAspect(q: QuadCorners): number {
  const top = dist(q.tl, q.tr);
  const bottom = dist(q.bl, q.br);
  const left = dist(q.tl, q.bl);
  const right = dist(q.tr, q.br);
  const width = (top + bottom) / 2;
  const height = (left + right) / 2;
  if (height < 1) return 0;
  return width / height;
}

function boxChroma(data: Uint8ClampedArray, w: number, h: number, box: DetectedCard): number {
  const x0 = clamp(Math.floor(box.left * w), 0, w - 1);
  const y0 = clamp(Math.floor(box.top * h), 0, h - 1);
  const x1 = clamp(Math.ceil((box.left + box.width) * w), 0, w);
  const y1 = clamp(Math.ceil((box.top + box.height) * h), 0, h);
  let sum = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 24));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      sum += Math.max(r, g, b) - Math.min(r, g, b);
      n++;
    }
  }
  return n ? sum / n : 0;
}

function applyChromaTieBreak(confidence: number, chroma: number): number {
  if (chroma < 10) return confidence * 0.92;
  if (chroma > 45) return Math.min(1, confidence + 0.02);
  return confidence;
}

function localEdgePersistence(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  s: number,
): number {
  let score = 0;
  let n = 0;
  for (let k = -4; k <= 4; k++) {
    const x = Math.round(cx + dx * s + -dy * k);
    const y = Math.round(cy + dy * s + dx * k);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    const before = lumAt(data, w, Math.round(x - dx * 2), Math.round(y - dy * 2));
    const after = lumAt(data, w, Math.round(x + dx * 2), Math.round(y + dy * 2));
    score += Math.abs(after - before);
    n++;
  }
  return score / Math.max(1, n);
}

function findRimPoint(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  angle: number,
  minDist: number,
  maxDist: number,
  expectedDist: number,
): { point: Point; grad: number; persistence: number } | null {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let bestS = -1;
  let bestScore = 10;
  let bestGrad = 0;
  let bestPersistence = 0;

  let prev = lumAt(data, w, Math.round(cx), Math.round(cy));
  const steps = Math.floor(maxDist);
  const sigma = Math.max(6, (maxDist - minDist) * 0.28);

  for (let s = 1; s <= steps; s++) {
    const x = Math.round(cx + dx * s);
    const y = Math.round(cy + dy * s);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
    const curr = lumAt(data, w, x, y);
    const grad = Math.abs(curr - prev);

    let flat = 0;
    let n = 0;
    for (let k = 1; k <= 5; k++) {
      const ax = Math.round(cx + dx * (s + k));
      const ay = Math.round(cy + dy * (s + k));
      if (ax < 1 || ay < 1 || ax >= w - 1 || ay >= h - 1) break;
      const al = lumAt(data, w, ax, ay);
      const pl = lumAt(
        data,
        w,
        Math.round(cx + dx * (s + k - 1)),
        Math.round(cy + dy * (s + k - 1)),
      );
      flat += Math.abs(al - pl);
      n++;
    }
    const flatBonus = n >= 3 && flat / n < 12 ? 8 : 0;
    const distWeight = Math.exp(-((s - expectedDist) ** 2) / (2 * sigma * sigma)) * 28;
    const persistence = localEdgePersistence(data, w, h, cx, cy, dx, dy, s);
    const score = grad * 0.55 + persistence * 0.3 + flatBonus * 0.15 + distWeight;

    if (s >= minDist && score > bestScore) {
      bestScore = score;
      bestS = s;
      bestGrad = grad;
      bestPersistence = persistence;
    }
    prev = curr;
  }

  if (bestS < 0) return null;
  return {
    point: { x: cx + dx * bestS, y: cy + dy * bestS },
    grad: bestGrad,
    persistence: bestPersistence,
  };
}

function scoreQuad(
  q: QuadCorners,
  imgW: number,
  imgH: number,
  residualAvg: number,
  cardAspect: number,
  edgeScore: number,
  continuityScore: number,
): { score: number; aspectScore: number; geometry: number } {
  if (!isConvexQuad(q)) return { score: 0, aspectScore: 0, geometry: 0 };

  const area = quadArea(q);
  const areaFrac = area / (imgW * imgH);
  if (areaFrac < 0.05 || areaFrac > 0.92) return { score: 0, aspectScore: 0, geometry: 0 };

  for (const p of [q.tl, q.tr, q.br, q.bl]) {
    if (p.x < -imgW * 0.02 || p.y < -imgH * 0.02) return { score: 0, aspectScore: 0, geometry: 0 };
    if (p.x > imgW * 1.02 || p.y > imgH * 1.02) return { score: 0, aspectScore: 0, geometry: 0 };
  }

  const aspect = estimateQuadAspect(q);
  const aspectErr = Math.min(Math.abs(aspect - cardAspect), Math.abs(aspect - 1 / cardAspect));
  if (aspectErr > 0.35) return { score: 0, aspectScore: 0, geometry: 0 };

  const top = dist(q.tl, q.tr);
  const bottom = dist(q.bl, q.br);
  const left = dist(q.tl, q.bl);
  const right = dist(q.tr, q.br);
  const widthSkew = Math.abs(top - bottom) / Math.max(top, bottom);
  const heightSkew = Math.abs(left - right) / Math.max(left, right);
  if (widthSkew > 0.55 || heightSkew > 0.55) return { score: 0, aspectScore: 0, geometry: 0 };

  const aspectScore = 1 - Math.min(1, aspectErr / 0.35);
  const residualScore = 1 - Math.min(1, residualAvg / 6);
  const skewScore = 1 - (widthSkew + heightSkew) / 2;
  const geometry = residualScore * 0.6 + skewScore * 0.4;

  return {
    score:
      edgeScore * 0.3 +
      continuityScore * 0.25 +
      aspectScore * 0.2 +
      residualScore * 0.15 +
      skewScore * 0.1,
    aspectScore,
    geometry,
  };
}

function qualityWarnings(q: CardDetectionQuality): string[] {
  const warnings: string[] = [];
  if (q.edgeStrength < 0.45) warnings.push('Edge strength unclear');
  if (q.continuity < 0.45) warnings.push('Edge continuity low');
  if (q.aspect < 0.6) warnings.push('Aspect ratio off');
  if (q.geometry < 0.5) warnings.push('Four-sided geometry weak');
  if (q.separation < 0.4) warnings.push('Background too similar');
  return warnings;
}

export function refineQuadFromSeed(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seed: DetectedCard,
  cardAspect: number = CARD_ASPECT,
  prior?: Pick<CardCandidate, 'edgeScore' | 'continuityScore' | 'separationScore'>,
): CornerDetection | null {
  const cx = (seed.left + seed.width / 2) * w;
  const cy = (seed.top + seed.height / 2) * h;
  const halfW = (seed.width * w) / 2;
  const halfH = (seed.height * h) / 2;

  const buckets: Point[][] = [[], [], [], []];
  let rimGrad = 0;
  let rimPersist = 0;
  let rimN = 0;

  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const ca = Math.abs(Math.cos(angle));
    const sa = Math.abs(Math.sin(angle));
    const expectedDist = Math.min(
      ca > 1e-6 ? halfW / ca : Number.POSITIVE_INFINITY,
      sa > 1e-6 ? halfH / sa : Number.POSITIVE_INFINITY,
    );
    const minDist = expectedDist * 0.55;
    const maxDist = expectedDist * 1.65;
    const hit = findRimPoint(data, w, h, cx, cy, angle, minDist, maxDist, expectedDist);
    if (!hit) continue;

    rimGrad += hit.grad;
    rimPersist += hit.persistence;
    rimN++;

    // Classify by which seed-box side the hit is nearest, not by ray angle.
    // Tall cards: many "upward" angles strike a vertical side first.
    const nx = (hit.point.x - cx) / Math.max(1, halfW);
    const ny = (hit.point.y - cy) / Math.max(1, halfH);
    if (Math.abs(nx) > Math.abs(ny)) buckets[nx < 0 ? 0 : 1].push(hit.point);
    else buckets[ny < 0 ? 2 : 3].push(hit.point);
  }

  if (buckets.some((b) => b.length < 4)) return null;

  const left = fitLine(buckets[0]);
  const right = fitLine(buckets[1]);
  const top = fitLine(buckets[2]);
  const bottom = fitLine(buckets[3]);
  if (!left || !right || !top || !bottom) return null;

  const tl = intersectLines(top, left);
  const tr = intersectLines(top, right);
  const br = intersectLines(bottom, right);
  const bl = intersectLines(bottom, left);
  if (!tl || !tr || !br || !bl) return null;

  const ordered = orderCorners([tl, tr, br, bl]);
  if (!ordered) return null;

  for (const key of ['tl', 'tr', 'br', 'bl'] as const) {
    ordered[key] = {
      x: clamp(ordered[key].x, 0, w - 1),
      y: clamp(ordered[key].y, 0, h - 1),
    };
  }

  const residualAvg = (left.residual + right.residual + top.residual + bottom.residual) / 4;
  const edgeScore = prior?.edgeScore ?? clamp(rimGrad / Math.max(1, rimN) / 40, 0, 1);
  const continuityScore =
    prior?.continuityScore ?? clamp(rimPersist / Math.max(1, rimN) / 40, 0, 1);
  const scored = scoreQuad(ordered, w, h, residualAvg, cardAspect, edgeScore, continuityScore);
  if (scored.score < 0.2) return null;

  const separation = prior?.separationScore ?? edgeSeparationScore(data, w, h, seed);
  let confidence = scored.score * 0.85 + separation * 0.15;
  confidence = applyChromaTieBreak(confidence, boxChroma(data, w, h, seed));
  if (confidence < 0.2) return null;

  const quality: CardDetectionQuality = {
    overall: confidence,
    edgeStrength: edgeScore,
    continuity: continuityScore,
    aspect: scored.aspectScore,
    geometry: scored.geometry,
    separation,
    warnings: [],
  };
  quality.warnings = qualityWarnings(quality);

  return { corners: ordered, confidence, quality };
}

function boxToCornersLocal(box: DetectedCard, imgWidth: number, imgHeight: number): QuadCorners {
  const l = box.left * imgWidth;
  const t = box.top * imgHeight;
  const r = (box.left + box.width) * imgWidth;
  const b = (box.top + box.height) * imgHeight;
  return {
    tl: { x: l, y: t },
    tr: { x: r, y: t },
    br: { x: r, y: b },
    bl: { x: l, y: b },
  };
}

/** Still-image detector: whole-image line candidates, then ray refinement. */
export function detectCardFromImageData(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  options: { cardAspect?: number; hintBox?: DetectedCard | null } = {},
): CornerDetection | null {
  const cardAspect = options.cardAspect ?? CARD_ASPECT;
  const candidates = findCardCandidates(data, w, h, cardAspect);

  const seeds: Array<{ box: DetectedCard; prior?: CardCandidate }> = candidates.map((c) => ({
    box: c.box,
    prior: c,
  }));

  if (options.hintBox) {
    seeds.push({
      box: options.hintBox,
      prior: {
        box: options.hintBox,
        edgeScore: 0.45,
        continuityScore: 0.45,
        aspectScore: 0.7,
        separationScore: edgeSeparationScore(data, w, h, options.hintBox),
      },
    });
  }

  let best: CornerDetection | null = null;
  for (const seed of seeds) {
    const refined = refineQuadFromSeed(data, w, h, seed.box, cardAspect, seed.prior);
    if (
      refined &&
      (refined.quality?.aspect ?? 0) >= 0.5 &&
      (!best || refined.confidence > best.confidence)
    ) {
      best = refined;
    }
  }

  if (!best && candidates[0]) {
    const seed = candidates[0];
    const confidence = clamp(
      seed.edgeScore * 0.3 +
        seed.continuityScore * 0.25 +
        seed.aspectScore * 0.2 +
        seed.separationScore * 0.25,
      0,
      1,
    );
    best = {
      corners: boxToCornersLocal(seed.box, w, h),
      confidence,
      quality: {
        overall: confidence,
        edgeStrength: seed.edgeScore,
        continuity: seed.continuityScore,
        aspect: seed.aspectScore,
        geometry: 0.85,
        separation: seed.separationScore,
        warnings: ['Used axis-aligned fallback'],
      },
    };
  }

  return best;
}
