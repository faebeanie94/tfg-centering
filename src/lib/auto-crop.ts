import {
  CARD_ASPECT,
  detectCardFrameFromImageData,
  guideTemplateForDistance,
  type DetectedCard,
  type DetectSearchRegion,
} from './card-edge-detect';
import type { Rect } from './centering';
import { defaultInnerRect } from './centering';
import { seedInnerFromImage } from './inner-artwork';
import {
  type Point,
  type QuadCorners,
  OUTPUT_PADDING_RATIO,
  perspectiveCorrect,
} from './perspective';

export interface CaptureDetectHint {
  /** Normalised axis-aligned box from the live scanner (0–1). */
  box?: DetectedCard | null;
  rotationDeg?: number;
  /**
   * True when the live scanner considered the card ready (in guide, level).
   * A live box alone is not enough — tilted desk shots still get an AABB.
   */
  liveReady?: boolean;
}

export interface CornerDetection {
  corners: QuadCorners;
  /** 0–1 quality estimate. Auto-apply only when high. */
  confidence: number;
}

export interface AutoCropResult {
  imageSrc: string;
  outer: Rect;
  inner: Rect;
  corners: QuadCorners;
  confidence: number;
}

export interface AutoCropOptions {
  /** Portrait width/height for the card format. */
  cardAspect?: number;
  /** Physical card height (mm) for distance-based search templates. */
  cardHeightMm?: number;
}

/**
 * Minimum confidence required to skip Perspective Fix and open the editor.
 * Kept high on purpose — a bad auto-crop is worse than one tap on Apply.
 */
export const AUTO_CROP_CONFIDENCE = 0.82;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lumAt(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  const i = (y * w + x) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** Convert a normalised box (+ optional rotation) into pixel quad corners. */
export function boxToCorners(
  box: DetectedCard,
  imgWidth: number,
  imgHeight: number,
  rotationDeg = 0,
): QuadCorners {
  const cx = (box.left + box.width / 2) * imgWidth;
  const cy = (box.top + box.height / 2) * imgHeight;
  const hw = (box.width * imgWidth) / 2;
  const hh = (box.height * imgHeight) / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const corner = (lx: number, ly: number): Point => ({
    x: clamp(cx + lx * cos - ly * sin, 0, imgWidth),
    y: clamp(cy + lx * sin + ly * cos, 0, imgHeight),
  });

  return {
    tl: corner(-hw, -hh),
    tr: corner(hw, -hh),
    br: corner(hw, hh),
    bl: corner(-hw, hh),
  };
}

/** Outer/inner border rects for a perspective-corrected card image. */
export function defaultRectsAfterCrop(imgWidth: number, imgHeight: number): {
  outer: Rect;
  inner: Rect;
} {
  const cardHeight = imgHeight / (1 + 2 * OUTPUT_PADDING_RATIO);
  const cardWidth = imgWidth / (1 + 2 * OUTPUT_PADDING_RATIO);
  const padX = (imgWidth - cardWidth) / 2;
  const padY = (imgHeight - cardHeight) / 2;
  const outer: Rect = {
    x: padX,
    y: padY,
    width: cardWidth,
    height: cardHeight,
  };
  return { outer, inner: defaultInnerRect(outer) };
}

/** Padded outer box plus yellow-handle seed from the inner-artwork detector. */
export function rectsAfterCropWithInnerSeed(image: HTMLImageElement): { outer: Rect; inner: Rect } {
  const rects = defaultRectsAfterCrop(image.naturalWidth, image.naturalHeight);
  try {
    const seeded = seedInnerFromImage(image, rects.outer);
    return { outer: rects.outer, inner: seeded.inner };
  } catch {
    return rects;
  }
}

function analysisSize(naturalWidth: number, naturalHeight: number): { w: number; h: number; scale: number } {
  const maxW = 560;
  const scale = Math.min(1, maxW / Math.max(1, naturalWidth));
  return {
    w: Math.max(32, Math.round(naturalWidth * scale)),
    h: Math.max(32, Math.round(naturalHeight * scale)),
    scale,
  };
}

function searchCandidates(
  hint: CaptureDetectHint | undefined,
  cardAspect: number,
  cardHeightMm: number,
): DetectSearchRegion[] {
  const searches: DetectSearchRegion[] = [];

  if (hint?.box) {
    searches.push({
      cx: hint.box.left + hint.box.width / 2,
      cy: hint.box.top + hint.box.height / 2,
      expectedWidth: hint.box.width,
      expectedHeight: hint.box.height,
      cardAspect,
    });
  }

  for (const distance of [20, 12, 30] as const) {
    const template = guideTemplateForDistance(distance, cardAspect, cardHeightMm);
    searches.push({
      cx: 0.5,
      cy: 0.36,
      expectedWidth: template.width,
      expectedHeight: template.height,
      cardAspect,
    });
    searches.push({
      cx: 0.5,
      cy: 0.5,
      expectedWidth: template.width,
      expectedHeight: template.height,
      cardAspect,
    });
  }

  for (const height of [0.55, 0.7, 0.4, 0.85]) {
    searches.push({
      cx: 0.5,
      cy: 0.5,
      expectedWidth: height * cardAspect,
      expectedHeight: height,
      cardAspect,
    });
  }

  return searches;
}

interface LineFit {
  /** Line form: ax + by = c (normalised so a^2+b^2 ~= 1). */
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

  // Principal axis via covariance eigenvector (smallest eigenvalue → normal).
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const tmp = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const l1 = trace / 2 + tmp;
  // Normal is eigenvector of smallest eigenvalue ≈ direction of least variance.
  let a: number;
  let b: number;
  if (Math.abs(sxy) > 1e-6 || Math.abs(sxx - l1) > 1e-6) {
    // For largest eigenvalue eigenvector (tangent), then rotate to normal.
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

  // After angle sort starting from most left-top-ish: find TL as min(x+y).
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < 4; i++) {
    const score = sorted[i].x + sorted[i].y;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }

  const tl = sorted[best];
  const tr = sorted[(best + 1) % 4];
  const br = sorted[(best + 2) % 4];
  const bl = sorted[(best + 3) % 4];
  return { tl, tr, br, bl };
}

function quadArea(q: QuadCorners): number {
  // Shoelace
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

/** Estimate portrait card aspect from a perspective quad using side mid lengths. */
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

function scoreQuad(
  q: QuadCorners,
  imgW: number,
  imgH: number,
  residualAvg: number,
  cardAspect: number = CARD_ASPECT,
): number {
  if (!isConvexQuad(q)) return 0;

  const area = quadArea(q);
  const frameArea = imgW * imgH;
  const areaFrac = area / frameArea;
  if (areaFrac < 0.05 || areaFrac > 0.92) return 0;

  // Keep corners inside (small margin).
  for (const p of [q.tl, q.tr, q.br, q.bl]) {
    if (p.x < -imgW * 0.02 || p.y < -imgH * 0.02) return 0;
    if (p.x > imgW * 1.02 || p.y > imgH * 1.02) return 0;
  }

  const aspect = estimateQuadAspect(q);
  // Allow perspective foreshortening: portrait cards often look wider when tilted.
  const aspectErr = Math.min(
    Math.abs(aspect - cardAspect),
    Math.abs(aspect - 1 / cardAspect),
  );
  if (aspectErr > 0.35) return 0;

  const top = dist(q.tl, q.tr);
  const bottom = dist(q.bl, q.br);
  const left = dist(q.tl, q.bl);
  const right = dist(q.tr, q.br);
  const widthSkew = Math.abs(top - bottom) / Math.max(top, bottom);
  const heightSkew = Math.abs(left - right) / Math.max(left, right);
  if (widthSkew > 0.55 || heightSkew > 0.55) return 0;

  const aspectScore = 1 - Math.min(1, aspectErr / 0.35);
  const areaScore = areaFrac >= 0.12 && areaFrac <= 0.75 ? 1 : 0.55;
  const residualScore = 1 - Math.min(1, residualAvg / 6);
  const skewScore = 1 - (widthSkew + heightSkew) / 2;

  return aspectScore * 0.35 + areaScore * 0.2 + residualScore * 0.25 + skewScore * 0.2;
}

/**
 * Walk outward from the card centre; stop at the strongest luminance step
 * near the expected rim distance. Prefer the card rim over a farther paper/desk edge.
 */
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
): Point | null {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let bestS = -1;
  let bestScore = 10;

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
    // Peak at the expected card half-size so white paper edges lose to the card rim.
    const distWeight = Math.exp(-((s - expectedDist) ** 2) / (2 * sigma * sigma)) * 28;
    const score = grad + flatBonus + distWeight;

    if (s >= minDist && score > bestScore) {
      bestScore = score;
      bestS = s;
    }
    prev = curr;
  }

  if (bestS < 0) return null;
  return { x: cx + dx * bestS, y: cy + dy * bestS };
}

/** Mean chroma in a normalised box — pale paper scores low, printed cards score higher. */
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
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      sum += max - min;
      n++;
    }
  }
  return n ? sum / n : 0;
}

function refineQuadFromSeed(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seed: DetectedCard,
  cardAspect: number = CARD_ASPECT,
): CornerDetection | null {
  const cx = (seed.left + seed.width / 2) * w;
  const cy = (seed.top + seed.height / 2) * h;
  const halfW = (seed.width * w) / 2;
  const halfH = (seed.height * h) / 2;
  const minDist = Math.min(halfW, halfH) * 0.5;
  const maxDist = Math.max(halfW, halfH) * 1.35;

  const buckets: Point[][] = [[], [], [], []]; // L R T B by dominant axis angle

  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    // Expected rim distance for a rectangle varies with angle.
    const expectedDist =
      1 / Math.sqrt((Math.cos(angle) / halfW) ** 2 + (Math.sin(angle) / halfH) ** 2);
    const p = findRimPoint(data, w, h, cx, cy, angle, minDist, maxDist, expectedDist);
    if (!p) continue;

    // Classify by angle relative to card centre into 4 sides.
    const deg = ((angle * 180) / Math.PI + 360) % 360;
    if (deg >= 315 || deg < 45) buckets[1].push(p); // right
    else if (deg >= 45 && deg < 135) buckets[3].push(p); // bottom
    else if (deg >= 135 && deg < 225) buckets[0].push(p); // left
    else buckets[2].push(p); // top
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

  // Clamp lightly into the frame.
  for (const key of ['tl', 'tr', 'br', 'bl'] as const) {
    ordered[key] = {
      x: clamp(ordered[key].x, 0, w - 1),
      y: clamp(ordered[key].y, 0, h - 1),
    };
  }

  const residualAvg =
    (left.residual + right.residual + top.residual + bottom.residual) / 4;
  let confidence = scoreQuad(ordered, w, h, residualAvg, cardAspect);
  if (confidence < 0.2) return null;

  // Prefer colourful card bodies over pale mats / paper pads.
  const chroma = boxChroma(data, w, h, seed);
  if (chroma < 18) confidence *= 0.55;
  else if (chroma > 40) confidence = Math.min(1, confidence + 0.08);

  return { corners: ordered, confidence };
}

function scaleCorners(corners: QuadCorners, scale: number, imgW: number, imgH: number): QuadCorners {
  const map = (p: Point): Point => ({
    x: clamp(p.x / scale, 0, imgW),
    y: clamp(p.y / scale, 0, imgH),
  });
  return {
    tl: map(corners.tl),
    tr: map(corners.tr),
    br: map(corners.br),
    bl: map(corners.bl),
  };
}

function findBestSeedBox(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  hint: CaptureDetectHint | undefined,
  cardAspect: number,
  cardHeightMm: number,
): { box: DetectedCard; rotationDeg: number; score: number } | null {
  let bestBox: DetectedCard | null = null;
  let bestRot = 0;
  let bestScore = -1;

  // Extra search centres from colourful pixels (card body vs pale paper).
  const chromaSeeds: DetectSearchRegion[] = [];
  {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    const step = 4;
    for (let y = Math.floor(h * 0.1); y < h * 0.9; y += step) {
      for (let x = Math.floor(w * 0.1); x < w * 0.9; x += step) {
        const i = (y * w + x) * 4;
        const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
        if (chroma < 40) continue;
        sx += x * chroma;
        sy += y * chroma;
        sw += chroma;
      }
    }
    if (sw > 0) {
      chromaSeeds.push({
        cx: sx / sw / w,
        cy: sy / sw / h,
        expectedWidth: cardAspect * 0.45,
        expectedHeight: 0.45,
        cardAspect,
      });
      chromaSeeds.push({
        cx: sx / sw / w,
        cy: sy / sw / h,
        expectedWidth: cardAspect * 0.6,
        expectedHeight: 0.6,
        cardAspect,
      });
    }
  }

  for (const search of [...chromaSeeds, ...searchCandidates(hint, cardAspect, cardHeightMm)]) {
    const found = detectCardFrameFromImageData(data, w, h, search);
    if (!found) continue;

    const expected =
      search.expectedWidth != null && search.expectedHeight != null
        ? { width: search.expectedWidth, height: search.expectedHeight }
        : undefined;

    const aspectErr = Math.abs(found.box.width / found.box.height - cardAspect);
    let score = 1 - aspectErr / 0.06;
    if (expected) {
      const sizeRatio =
        (found.box.width / expected.width + found.box.height / expected.height) / 2;
      if (sizeRatio >= 0.35 && sizeRatio <= 1.7) {
        score = score * 0.35 + (1 - Math.min(1, Math.abs(1 - sizeRatio))) * 0.65;
      } else {
        score *= 0.35;
      }
    }

    // Down-rank pale paper pads that happen to look rectangular.
    const chroma = boxChroma(data, w, h, found.box);
    if (chroma < 18) score *= 0.45;
    else if (chroma > 35) score += 0.08;

    // Prefer mid-frame card-sized regions over near-full-frame mats.
    const area = found.box.width * found.box.height;
    if (area > 0.55) score *= 0.5;
    if (area < 0.08) score *= 0.6;

    if (score > bestScore) {
      bestScore = score;
      bestBox = found.box;
      bestRot = found.rotationDeg;
    }
  }

  if (!bestBox || bestScore < 0.2) return null;
  return { box: bestBox, rotationDeg: bestRot, score: bestScore };
}

/**
 * Detect card corners in a still image.
 * Always re-detects on the still (live scanner hint is only a search seed).
 */
export async function detectCardCornersFromImage(
  imageSrc: string,
  hint?: CaptureDetectHint,
  options: AutoCropOptions = {},
): Promise<CornerDetection | null> {
  const cardAspect = options.cardAspect ?? CARD_ASPECT;
  const cardHeightMm = options.cardHeightMm ?? 88.9;
  const img = await loadImage(imageSrc);
  const { naturalWidth: imgW, naturalHeight: imgH } = img;

  const { w, h, scale } = analysisSize(imgW, imgH);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const seed = findBestSeedBox(data, w, h, hint, cardAspect, cardHeightMm);
  // Also try the live hint box directly as a seed region.
  const seeds: DetectedCard[] = [];
  if (seed) seeds.push(seed.box);
  if (hint?.box) seeds.push(hint.box);

  let best: CornerDetection | null = null;

  for (const s of seeds) {
    const refined = refineQuadFromSeed(data, w, h, s, cardAspect);
    if (refined && (!best || refined.confidence > best.confidence)) {
      best = refined;
    }
  }

  // Fallback: rotated AABB from the detector (lower confidence — rarely auto-applied).
  if (!best && seed) {
    const corners = boxToCorners(seed.box, w, h, seed.rotationDeg);
    const confidence = Math.min(0.55, seed.score * 0.6);
    best = { corners, confidence };
  }

  if (!best) return null;

  return {
    corners: scaleCorners(best.corners, scale, imgW, imgH),
    confidence: best.confidence,
  };
}

/** True when the quad is close enough to a rectangle that auto-warp is safe. */
export function isNearlyFrontal(q: QuadCorners): boolean {
  const top = dist(q.tl, q.tr);
  const bottom = dist(q.bl, q.br);
  const left = dist(q.tl, q.bl);
  const right = dist(q.tr, q.br);
  const widthSkew = Math.abs(top - bottom) / Math.max(top, bottom, 1);
  const heightSkew = Math.abs(left - right) / Math.max(left, right, 1);
  if (widthSkew > 0.12 || heightSkew > 0.12) return false;

  // Side directions should be roughly axis-aligned (small in-plane rotation OK).
  const topAngle = Math.abs(Math.atan2(q.tr.y - q.tl.y, q.tr.x - q.tl.x));
  const botAngle = Math.abs(Math.atan2(q.br.y - q.bl.y, q.br.x - q.bl.x));
  const maxTilt = (12 * Math.PI) / 180;
  if (topAngle > maxTilt && Math.abs(topAngle - Math.PI) > maxTilt) return false;
  if (botAngle > maxTilt && Math.abs(botAngle - Math.PI) > maxTilt) return false;
  return true;
}

/**
 * Detect corners and auto-crop when confidence is high enough.
 * Always returns best-effort corners so Perspective Fix can be pre-seeded.
 *
 * Auto-apply is intentionally conservative: a bad crop is worse than one tap
 * on Apply. Live scanner locks still produce axis-aligned boxes, so a tilted
 * card with a "detection" must NOT auto-apply — require a near-frontal quad.
 */
export async function tryAutoCrop(
  imageSrc: string,
  hint?: CaptureDetectHint,
  options: AutoCropOptions = {},
): Promise<{ result: AutoCropResult | null; corners: QuadCorners | null; confidence: number }> {
  const cardAspect = options.cardAspect ?? CARD_ASPECT;
  const detected = await detectCardCornersFromImage(imageSrc, hint, options);
  if (!detected) {
    return { result: null, corners: null, confidence: 0 };
  }

  const liveRotationOk = Math.abs(hint?.rotationDeg ?? 0) <= 8;
  const canAutoApply =
    detected.confidence >= AUTO_CROP_CONFIDENCE &&
    isNearlyFrontal(detected.corners) &&
    liveRotationOk;

  if (!canAutoApply) {
    return { result: null, corners: detected.corners, confidence: detected.confidence };
  }

  try {
    const corrected = await perspectiveCorrect(imageSrc, detected.corners, cardAspect);
    const img = await loadImage(corrected);
    const rects = rectsAfterCropWithInnerSeed(img);
    return {
      result: {
        imageSrc: corrected,
        outer: rects.outer,
        inner: rects.inner,
        corners: detected.corners,
        confidence: detected.confidence,
      },
      corners: detected.corners,
      confidence: detected.confidence,
    };
  } catch {
    return { result: null, corners: detected.corners, confidence: detected.confidence };
  }
}

/** @deprecated Prefer tryAutoCrop — kept for scripts/tests. */
export async function autoCropCard(
  imageSrc: string,
  hint?: CaptureDetectHint,
  options: AutoCropOptions = {},
): Promise<AutoCropResult | null> {
  const { result } = await tryAutoCrop(imageSrc, hint, options);
  return result;
}
