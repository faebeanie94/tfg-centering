import { cardAspect, resolveCardFormat, DEFAULT_CARD_FORMAT_ID } from './card-sizes';

/** Default trading-card width / height (portrait) — Pokémon / sports poker size. */
export const CARD_ASPECT = cardAspect(resolveCardFormat({ cardFormat: DEFAULT_CARD_FORMAT_ID }));
export const DEFAULT_CARD_HEIGHT_MM = resolveCardFormat({ cardFormat: DEFAULT_CARD_FORMAT_ID }).heightMm;

export interface DetectedCard {
  left: number;
  top: number;
  width: number;
  height: number;
}

function lum(data: Uint8ClampedArray, px: number): number {
  const i = px * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sampleRay(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  ref: number,
  thresh: number,
): number {
  const steps = Math.max(w, h);
  for (let s = 1; s < steps; s++) {
    const x = Math.round(x0 + dx * s);
    const y = Math.round(y0 + dy * s);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
    const l = lum(data, y * w + x);
    if (Math.abs(l - ref) > thresh) {
      return s - 1;
    }
  }
  // Hitting the frame without a contrast step is not a card edge.
  return 0;
}

/** Force axis-aligned rectangle with trading-card aspect ratio. */
export function enforceCardRect(box: DetectedCard, cardAspectRatio: number = CARD_ASPECT): DetectedCard {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  let width = box.width;
  let height = box.height;
  const ratio = width / height;

  if (ratio > cardAspectRatio) {
    width = height * cardAspectRatio;
  } else {
    height = width / cardAspectRatio;
  }

  let left = cx - width / 2;
  let top = cy - height / 2;

  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (left + width > 1) left = 1 - width;
  if (top + height > 1) top = 1 - height;

  return { left, top, width, height };
}

export interface CardFrameDetection {
  box: DetectedCard;
  rotationDeg: number;
}

function estimateRotationDeg(
  leftXs: number[],
  rightXs: number[],
  topYs: number[],
  bottomYs: number[],
  w: number,
  h: number,
): number {
  const tilts: number[] = [];

  if (leftXs.length >= 2) {
    const dy = h * 0.36;
    const dx = leftXs[leftXs.length - 1] - leftXs[0];
    if (dy > 0) tilts.push((Math.atan2(dx, dy) * 180) / Math.PI);
  }

  if (rightXs.length >= 2) {
    const dy = h * 0.36;
    const dx = rightXs[rightXs.length - 1] - rightXs[0];
    if (dy > 0) tilts.push((Math.atan2(dx, dy) * 180) / Math.PI);
  }

  if (topYs.length >= 2) {
    const dx = w * 0.36;
    const dy = topYs[topYs.length - 1] - topYs[0];
    if (dx > 0) tilts.push(-(Math.atan2(dy, dx) * 180) / Math.PI);
  }

  if (bottomYs.length >= 2) {
    const dx = w * 0.36;
    const dy = bottomYs[bottomYs.length - 1] - bottomYs[0];
    if (dx > 0) tilts.push(-(Math.atan2(dy, dx) * 180) / Math.PI);
  }

  if (tilts.length === 0) return 0;
  return tilts.reduce((a, b) => a + b, 0) / tilts.length;
}

function rayEdgeCoord(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  ref: number,
  thresh: number,
): number | null {
  const dist = sampleRay(data, w, h, x0, y0, dx, dy, ref, thresh);
  if (dist < 4) return null;
  if (dx !== 0) return x0 + dx * dist;
  return y0 + dy * dist;
}

/** Walk outward from a point on the card until pixels match the dark background. */
function rayEdgeToBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  bgCutoff: number,
  minDist = 8,
): number | null {
  const startL = lum(data, y0 * w + x0);
  if (startL < bgCutoff) return null;

  const steps = Math.max(w, h);
  for (let s = minDist; s < steps - 2; s++) {
    const x = Math.round(x0 + dx * s);
    const y = Math.round(y0 + dy * s);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;

    const l = lum(data, y * w + x);
    if (l >= bgCutoff) continue;

    const x2 = Math.round(x0 + dx * (s + 1));
    const y2 = Math.round(y0 + dy * (s + 1));
    if (x2 < 1 || y2 < 1 || x2 >= w - 1 || y2 >= h - 1) break;
    if (lum(data, y2 * w + x2) < bgCutoff) {
      const edgeStep = Math.max(minDist, s - 1);
      if (dx !== 0) return x0 + dx * edgeStep;
      return y0 + dy * edgeStep;
    }
  }
  return null;
}

function estimateBackgroundLum(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  span: number,
): number {
  const samples: number[] = [];
  const offsets: Array<[number, number]> = [
    [-span * 1.1, 0],
    [span * 1.1, 0],
    [0, span * 1.1],
    [-span * 0.9, span * 0.9],
    [span * 0.9, span * 0.9],
    // Frame corners — often true background when the card sits on paper.
    [-0.42, -0.42],
    [0.42, -0.42],
    [-0.42, 0.42],
    [0.42, 0.42],
  ];

  for (const [ox, oy] of offsets) {
    const x = clamp(Math.round(cx * w + ox * w), 1, w - 2);
    const y = clamp(Math.round(cy * h + oy * h), 1, h - 2);
    samples.push(lum(data, y * w + x));
  }

  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 24;
}

/** Build a blurred luminance plane so holographic glare spikes don't fake edges. */
function buildBlurredLuma(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const raw = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) raw[i] = lum(data, i);

  // Two-pass box blur (~5×5) damps thin holo streaks without erasing the card rim.
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const radius = 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        sum += raw[y * w + xx];
        n++;
      }
      tmp[y * w + x] = sum / n;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        sum += tmp[yy * w + x];
        n++;
      }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}

/**
 * Walk outward until pixels stay in the bright background (card on paper / desk).
 * Prefers the outermost transition so a white card border is not mistaken for the edge.
 */
function rayEdgeToLightBackground(
  luma: Float32Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  bgFloor: number,
  minDist = 8,
): number | null {
  const steps = Math.max(w, h);
  let lastTransition: number | null = null;
  let interior = false;

  for (let s = 1; s < steps - 3; s++) {
    const x = Math.round(x0 + dx * s);
    const y = Math.round(y0 + dy * s);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;

    const l = luma[y * w + x];
    if (l < bgFloor) {
      interior = true;
      continue;
    }

    if (!interior || s < minDist) continue;

    const l1 = luma[Math.round(y0 + dy * (s + 1)) * w + Math.round(x0 + dx * (s + 1))];
    const l2 = luma[Math.round(y0 + dy * (s + 2)) * w + Math.round(x0 + dx * (s + 2))];
    if (l1 >= bgFloor && l2 >= bgFloor) {
      lastTransition = Math.max(minDist, s - 1);
    }
  }

  if (lastTransition == null) return null;
  if (dx !== 0) return x0 + dx * lastTransition;
  return y0 + dy * lastTransition;
}

/**
 * Find the strongest luminance step near the expected card half-size.
 * Works for dark and light desks and is resilient to mid-card glare.
 */
function rayEdgeByGradientBand(
  luma: Float32Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  minDist: number,
  maxDist: number,
  minGrad = 10,
): number | null {
  const steps = Math.min(Math.max(w, h), Math.floor(maxDist));
  let bestS = -1;
  let bestScore = minGrad;

  let prev = luma[y0 * w + x0];
  for (let s = 1; s <= steps; s++) {
    const x = Math.round(x0 + dx * s);
    const y = Math.round(y0 + dy * s);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;

    const curr = luma[y * w + x];
    const grad = Math.abs(curr - prev);
    if (grad < minGrad) {
      prev = curr;
      continue;
    }

    // Look ahead: card rims usually open onto a flatter background patch.
    let aheadFlat = 0;
    let aheadN = 0;
    for (let k = 1; k <= 6; k++) {
      const ax = Math.round(x0 + dx * (s + k));
      const ay = Math.round(y0 + dy * (s + k));
      if (ax < 1 || ay < 1 || ax >= w - 1 || ay >= h - 1) break;
      const al = luma[ay * w + ax];
      aheadN++;
      if (k > 1) {
        aheadFlat += Math.abs(
          al - luma[Math.round(y0 + dy * (s + k - 1)) * w + Math.round(x0 + dx * (s + k - 1))],
        );
      }
    }
    const flatBonus = aheadN >= 4 && aheadFlat / Math.max(1, aheadN - 1) < 10 ? 8 : 0;
    // Prefer farther candidates so inner artwork / glare loses to the outer rim.
    const distBias = ((s - minDist) / Math.max(1, maxDist - minDist)) * 14;
    const score = grad + flatBonus + distBias;

    if (s >= minDist && score > bestScore) {
      bestScore = score;
      bestS = s;
    }
    prev = curr;
  }

  if (bestS < 0) return null;
  if (dx !== 0) return x0 + dx * bestS;
  return y0 + dy * bestS;
}

function sampleRef(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  const x0 = clamp(Math.round(x), 1, w - 2);
  const y0 = clamp(Math.round(y), 1, Math.floor(data.length / (4 * w)) - 2);
  let sum = 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      sum += lum(data, (y0 + dy) * w + (x0 + dx));
      n++;
    }
  }
  return sum / n;
}

export interface DetectSearchRegion {
  /** Normalised centre (0–1) where the card is expected. */
  cx: number;
  cy: number;
  /** Expected card size (normalised) for scoring stable detections. */
  expectedWidth?: number;
  expectedHeight?: number;
  /** Portrait width/height for the card format being scanned. */
  cardAspect?: number;
}

function collectBackgroundEdges(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  px: number,
  py: number,
  bgCutoff: number,
) {
  const yFracs = [0.3, 0.42, 0.5, 0.58, 0.7];
  const xFracs = [0.3, 0.42, 0.5, 0.58, 0.7];

  const leftXs: number[] = [];
  const rightXs: number[] = [];
  const topYs: number[] = [];
  const bottomYs: number[] = [];

  for (const yf of yFracs) {
    const y = clamp(Math.round(py + (yf - 0.5) * h * 0.38), 2, h - 3);
    const lx = rayEdgeToBackground(data, w, h, px, y, -1, 0, bgCutoff);
    const rx = rayEdgeToBackground(data, w, h, px, y, 1, 0, bgCutoff);
    if (lx != null) leftXs.push(lx);
    if (rx != null) rightXs.push(rx);
  }

  for (const xf of xFracs) {
    const x = clamp(Math.round(px + (xf - 0.5) * w * 0.38), 2, w - 3);
    const ty = rayEdgeToBackground(data, w, h, x, py, 0, -1, bgCutoff);
    const by = rayEdgeToBackground(data, w, h, x, py, 0, 1, bgCutoff);
    if (ty != null) topYs.push(ty);
    if (by != null) bottomYs.push(by);
  }

  return { leftXs, rightXs, topYs, bottomYs };
}

function boxFromOuterEdges(
  leftXs: number[],
  rightXs: number[],
  topYs: number[],
  bottomYs: number[],
  w: number,
  h: number,
  /** Prefer outer extent (dark desks) or median (noisy / light desks). */
  mode: 'outer' | 'median' = 'outer',
  cardAspectRatio: number = CARD_ASPECT,
): CardFrameDetection | null {
  if (leftXs.length < 2 || rightXs.length < 2 || topYs.length < 2 || bottomYs.length < 2) {
    return null;
  }

  const leftSorted = [...leftXs].sort((a, b) => a - b);
  const rightSorted = [...rightXs].sort((a, b) => a - b);
  const topSorted = [...topYs].sort((a, b) => a - b);
  const bottomSorted = [...bottomYs].sort((a, b) => a - b);

  const left =
    (mode === 'outer' ? percentile(leftSorted, 0.15) : percentile(leftSorted, 0.5)) / w;
  const right =
    (mode === 'outer' ? percentile(rightSorted, 0.85) : percentile(rightSorted, 0.5)) / w;
  const top =
    (mode === 'outer' ? percentile(topSorted, 0.15) : percentile(topSorted, 0.5)) / h;
  const bottom =
    (mode === 'outer' ? percentile(bottomSorted, 0.85) : percentile(bottomSorted, 0.5)) / h;

  const raw: DetectedCard = {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };

  if (raw.width < 0.08 || raw.height < 0.08) return null;

  if (!rawBoxLooksLikeCard(raw, w, h, cardAspectRatio)) return null;

  return {
    box: maybeEnforceCardRect(raw, w, h, cardAspectRatio),
    rotationDeg: estimateRotationDeg(leftXs, rightXs, topYs, bottomYs, w, h),
  };
}

/** Normalized aspect (camera overlay) or pixel aspect (card-shaped stills). */
function boxAspectError(
  box: DetectedCard,
  cardAspectRatio: number,
  frameW?: number,
  frameH?: number,
): number {
  const normErr = Math.abs(box.width / box.height - cardAspectRatio);
  if (!frameW || !frameH || frameH <= 0) return normErr;
  const pixErr = Math.abs((box.width * frameW) / (box.height * frameH) - cardAspectRatio);
  return Math.min(normErr, pixErr);
}

function rawBoxLooksLikeCard(
  raw: DetectedCard,
  w: number,
  h: number,
  cardAspectRatio: number,
): boolean {
  const minA = cardAspectRatio * 0.75;
  const maxA = cardAspectRatio * 1.35;
  const norm = raw.width / raw.height;
  const pix = (raw.width * w) / (raw.height * h);
  return (norm >= minA && norm <= maxA) || (pix >= minA && pix <= maxA);
}

function maybeEnforceCardRect(
  raw: DetectedCard,
  w: number,
  h: number,
  cardAspectRatio: number,
): DetectedCard {
  const normErr = Math.abs(raw.width / raw.height - cardAspectRatio);
  const pixErr = Math.abs((raw.width * w) / (raw.height * h) - cardAspectRatio);
  if (pixErr <= normErr) return raw;
  return enforceCardRect(raw, cardAspectRatio);
}

function scoreCardBox(
  box: DetectedCard,
  expected?: { width: number; height: number },
  cardAspectRatio: number = CARD_ASPECT,
  frameW?: number,
  frameH?: number,
): number {
  const aspectErr = boxAspectError(box, cardAspectRatio, frameW, frameH);
  if (aspectErr > 0.12) return -1;

  if (!expected) return 1 - aspectErr;

  const sizeRatio = (box.width / expected.width + box.height / expected.height) / 2;
  if (sizeRatio < 0.4 || sizeRatio > 1.6) return -1;

  const sizeScore = 1 - Math.min(1, Math.abs(1 - sizeRatio));
  const aspectScore = 1 - Math.min(1, aspectErr / 0.12);
  return sizeScore * 0.65 + aspectScore * 0.35;
}

function detectFromBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  px: number,
  py: number,
  bgCutoff: number,
  cardAspectRatio: number = CARD_ASPECT,
): CardFrameDetection | null {
  const edges = collectBackgroundEdges(data, w, h, px, py, bgCutoff);
  return boxFromOuterEdges(edges.leftXs, edges.rightXs, edges.topYs, edges.bottomYs, w, h, 'outer', cardAspectRatio);
}

function collectLightBackgroundEdges(
  luma: Float32Array,
  w: number,
  h: number,
  px: number,
  py: number,
  bgFloor: number,
) {
  const yFracs = [0.3, 0.42, 0.5, 0.58, 0.7];
  const xFracs = [0.3, 0.42, 0.5, 0.58, 0.7];

  const leftXs: number[] = [];
  const rightXs: number[] = [];
  const topYs: number[] = [];
  const bottomYs: number[] = [];

  for (const yf of yFracs) {
    const y = clamp(Math.round(py + (yf - 0.5) * h * 0.38), 2, h - 3);
    const lx = rayEdgeToLightBackground(luma, w, h, px, y, -1, 0, bgFloor);
    const rx = rayEdgeToLightBackground(luma, w, h, px, y, 1, 0, bgFloor);
    if (lx != null) leftXs.push(lx);
    if (rx != null) rightXs.push(rx);
  }

  for (const xf of xFracs) {
    const x = clamp(Math.round(px + (xf - 0.5) * w * 0.38), 2, w - 3);
    const ty = rayEdgeToLightBackground(luma, w, h, x, py, 0, -1, bgFloor);
    const by = rayEdgeToLightBackground(luma, w, h, x, py, 0, 1, bgFloor);
    if (ty != null) topYs.push(ty);
    if (by != null) bottomYs.push(by);
  }

  return { leftXs, rightXs, topYs, bottomYs };
}

function detectFromLightBackground(
  luma: Float32Array,
  w: number,
  h: number,
  px: number,
  py: number,
  bgFloor: number,
  cardAspectRatio: number = CARD_ASPECT,
): CardFrameDetection | null {
  const edges = collectLightBackgroundEdges(luma, w, h, px, py, bgFloor);
  return boxFromOuterEdges(
    edges.leftXs,
    edges.rightXs,
    edges.topYs,
    edges.bottomYs,
    w,
    h,
    'median',
    cardAspectRatio,
  );
}

function collectGradientBandEdges(
  luma: Float32Array,
  w: number,
  h: number,
  px: number,
  py: number,
  expectedHalfW: number,
  expectedHalfH: number,
) {
  const yFracs = [0.3, 0.42, 0.5, 0.58, 0.7];
  const xFracs = [0.3, 0.42, 0.5, 0.58, 0.7];

  const minW = Math.max(6, expectedHalfW * 0.55);
  const maxW = Math.max(minW + 4, expectedHalfW * 1.5);
  const minH = Math.max(6, expectedHalfH * 0.55);
  const maxH = Math.max(minH + 4, expectedHalfH * 1.5);

  const leftXs: number[] = [];
  const rightXs: number[] = [];
  const topYs: number[] = [];
  const bottomYs: number[] = [];

  for (const yf of yFracs) {
    const y = clamp(Math.round(py + (yf - 0.5) * h * 0.38), 2, h - 3);
    const lx = rayEdgeByGradientBand(luma, w, h, px, y, -1, 0, minW, maxW);
    const rx = rayEdgeByGradientBand(luma, w, h, px, y, 1, 0, minW, maxW);
    if (lx != null) leftXs.push(lx);
    if (rx != null) rightXs.push(rx);
  }

  for (const xf of xFracs) {
    const x = clamp(Math.round(px + (xf - 0.5) * w * 0.38), 2, w - 3);
    const ty = rayEdgeByGradientBand(luma, w, h, x, py, 0, -1, minH, maxH);
    const by = rayEdgeByGradientBand(luma, w, h, x, py, 0, 1, minH, maxH);
    if (ty != null) topYs.push(ty);
    if (by != null) bottomYs.push(by);
  }

  return { leftXs, rightXs, topYs, bottomYs };
}

function detectFromGradientBand(
  luma: Float32Array,
  w: number,
  h: number,
  px: number,
  py: number,
  expectedHalfW: number,
  expectedHalfH: number,
): CardFrameDetection | null {
  const edges = collectGradientBandEdges(luma, w, h, px, py, expectedHalfW, expectedHalfH);
  return boxFromOuterEdges(edges.leftXs, edges.rightXs, edges.topYs, edges.bottomYs, w, h, 'median');
}

function collectRefEdges(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  px: number,
  py: number,
  thresh: number,
) {
  const ref = sampleRef(data, w, px, py);
  const yFracs = [0.3, 0.42, 0.5, 0.58, 0.7];
  const xFracs = [0.3, 0.42, 0.5, 0.58, 0.7];

  const leftXs: number[] = [];
  const rightXs: number[] = [];
  const topYs: number[] = [];
  const bottomYs: number[] = [];

  for (const yf of yFracs) {
    const y = clamp(Math.round(py + (yf - 0.5) * h * 0.38), 2, h - 3);
    const lx = rayEdgeCoord(data, w, h, px, y, -1, 0, ref, thresh);
    const rx = rayEdgeCoord(data, w, h, px, y, 1, 0, ref, thresh);
    if (lx != null) leftXs.push(lx);
    if (rx != null) rightXs.push(rx);
  }

  for (const xf of xFracs) {
    const x = clamp(Math.round(px + (xf - 0.5) * w * 0.38), 2, w - 3);
    const ty = rayEdgeCoord(data, w, h, x, py, 0, -1, ref, thresh);
    const by = rayEdgeCoord(data, w, h, x, py, 0, 1, ref, thresh);
    if (ty != null) topYs.push(ty);
    if (by != null) bottomYs.push(by);
  }

  return { leftXs, rightXs, topYs, bottomYs };
}

function boxFromRefEdges(
  leftXs: number[],
  rightXs: number[],
  topYs: number[],
  bottomYs: number[],
  w: number,
  h: number,
  cardAspectRatio: number = CARD_ASPECT,
): CardFrameDetection | null {
  if (leftXs.length < 2 || rightXs.length < 2 || topYs.length < 2 || bottomYs.length < 2) {
    return null;
  }

  const left = Math.min(...leftXs) / w;
  const right = Math.max(...rightXs) / w;
  const top = Math.min(...topYs) / h;
  const bottom = Math.max(...bottomYs) / h;

  const raw: DetectedCard = {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };

  if (raw.width < 0.08 || raw.height < 0.08) return null;

  if (!rawBoxLooksLikeCard(raw, w, h, cardAspectRatio)) return null;

  return {
    box: maybeEnforceCardRect(raw, w, h, cardAspectRatio),
    rotationDeg: estimateRotationDeg(leftXs, rightXs, topYs, bottomYs, w, h),
  };
}

function detectFromPointRefOnly(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  px: number,
  py: number,
  thresh: number,
  cardAspectRatio: number = CARD_ASPECT,
): CardFrameDetection | null {
  const edges = collectRefEdges(data, w, h, px, py, thresh);
  return boxFromRefEdges(edges.leftXs, edges.rightXs, edges.topYs, edges.bottomYs, w, h, cardAspectRatio);
}

/** Core detector that works on raw RGBA frames (also used by unit tests). */
export function detectCardFrameFromImageData(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  search?: DetectSearchRegion,
): CardFrameDetection | null {
  const cardAspectRatio = search?.cardAspect ?? CARD_ASPECT;
  const cx = search?.cx ?? 0.5;
  const cy = search?.cy ?? 0.36;
  const expected =
    search?.expectedWidth != null && search?.expectedHeight != null
      ? { width: search.expectedWidth, height: search.expectedHeight }
      : { width: cardAspectRatio * 0.4, height: 0.4 };

  const span = expected.height / 2;
  const bgLum = estimateBackgroundLum(data, w, h, cx, cy, span);
  const lightBackground = bgLum >= 110;
  const luma = buildBlurredLuma(data, w, h);

  const expectedHalfW = (expected.width * w) / 2;
  const expectedHalfH = (expected.height * h) / 2;

  // Multiple seeds so a glare streak on the exact guide centre can't wipe detection.
  const seeds: Array<[number, number]> = [
    [Math.floor(cx * w), Math.floor(cy * h)],
    [Math.floor(cx * w), Math.floor((cy - 0.04) * h)],
    [Math.floor(cx * w), Math.floor((cy + 0.04) * h)],
    [Math.floor((cx - 0.04) * w), Math.floor(cy * h)],
    [Math.floor((cx + 0.04) * w), Math.floor(cy * h)],
  ];

  let best: CardFrameDetection | null = null;
  let bestScore = -1;

  const consider = (found: CardFrameDetection | null) => {
    if (!found) return;
    const score = scoreCardBox(found.box, expected, cardAspectRatio, w, h);
    if (score > bestScore) {
      bestScore = score;
      best = found;
    }
  };

  for (const [px, py] of seeds) {
    const sx = clamp(px, 2, w - 3);
    const sy = clamp(py, 2, h - 3);

    if (!lightBackground) {
      for (const margin of [28, 32, 38, 45]) {
        consider(detectFromBackground(data, w, h, sx, sy, bgLum + margin, cardAspectRatio));
      }
    }

    if (lightBackground || bestScore < 0.45) {
      for (const drop of [18, 28, 40, 55]) {
        consider(detectFromLightBackground(luma, w, h, sx, sy, bgLum - drop, cardAspectRatio));
      }
    }

    consider(detectFromGradientBand(luma, w, h, sx, sy, expectedHalfW, expectedHalfH));

    if (bestScore < 0.4) {
      for (const thresh of [22, 28, 36, 44]) {
        consider(detectFromPointRefOnly(data, w, h, sx, sy, thresh, cardAspectRatio));
      }
    }

    if (bestScore >= 0.75) break;
  }

  // Dark-background pass can still win on mixed scenes (white paper on a dark desk).
  if (lightBackground && bestScore < 0.5) {
    const sx = clamp(Math.floor(cx * w), 2, w - 3);
    const sy = clamp(Math.floor(cy * h), 2, h - 3);
    for (const margin of [28, 32, 38, 45]) {
      consider(
        detectFromBackground(data, w, h, sx, sy, Math.min(bgLum, 80) + margin, cardAspectRatio),
      );
    }
  }

  return bestScore >= 0.25 ? best : null;
}

export function detectCardFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  search?: DetectSearchRegion,
): CardFrameDetection | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const w = 240;
  const h = Math.round(w * (video.videoHeight / video.videoWidth));
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return detectCardFrameFromImageData(data, w, h, search);
}

export function detectCardBox(video: HTMLVideoElement, canvas: HTMLCanvasElement): DetectedCard | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const w = 240;
  const h = Math.round(w * (video.videoHeight / video.videoWidth));
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const ref = lum(data, cy * w + cx);
  const thresh = 22;

  const leftDist = sampleRay(data, w, h, cx, cy, -1, 0, ref, thresh);
  const rightDist = sampleRay(data, w, h, cx, cy, 1, 0, ref, thresh);
  const upDist = sampleRay(data, w, h, cx, cy, 0, -1, ref, thresh);
  const downDist = sampleRay(data, w, h, cx, cy, 0, 1, ref, thresh);

  if (leftDist < 8 || rightDist < 8 || upDist < 8 || downDist < 8) return null;

  const halfW = (leftDist + rightDist) / 2;
  const halfH = (upDist + downDist) / 2;

  const raw: DetectedCard = {
    left: (cx - halfW) / w,
    top: (cy - halfH) / h,
    width: (halfW * 2) / w,
    height: (halfH * 2) / h,
  };

  if (raw.width < 0.12 || raw.height < 0.12) return null;

  return enforceCardRect(raw);
}

/** Typical phone vertical FOV when scanning flat (~50°). Used to size the guide from distance. */
const SCAN_FOV_DEG = 50;

export const SCAN_DISTANCE_OPTIONS = [12, 20, 30] as const;
export type ScanDistanceCm = (typeof SCAN_DISTANCE_OPTIONS)[number];

/** Guide frame sized for a card at the given phone-to-card distance (cm). */
export function guideBoxForDistance(
  distanceCm: ScanDistanceCm = 20,
  cardAspectRatio: number = CARD_ASPECT,
  cardHeightMm: number = DEFAULT_CARD_HEIGHT_MM,
): DetectedCard {
  const template = guideTemplateForDistance(distanceCm, cardAspectRatio, cardHeightMm);
  return positionGuideBox(template, 0.5, defaultGuideAnchorY(template.height, 0.32));
}

export function guideTemplateForDistance(
  distanceCm: ScanDistanceCm = 20,
  cardAspectRatio: number = CARD_ASPECT,
  cardHeightMm: number = DEFAULT_CARD_HEIGHT_MM,
): { width: number; height: number } {
  const distanceMm = distanceCm * 10;
  const angularHeightRad = 2 * Math.atan(cardHeightMm / (2 * distanceMm));
  const fovRad = (SCAN_FOV_DEG * Math.PI) / 180;
  const height = Math.max(0.22, Math.min(0.65, angularHeightRad / fovRad));
  return { width: height * cardAspectRatio, height };
}

/** Vertical centre for the guide when no card is detected yet. */
export function defaultGuideAnchorY(templateHeight: number, obstructionBottom: number): number {
  const maxBottom = 1 - obstructionBottom;
  const centredUpper = 0.36;
  const maxCentre = maxBottom - templateHeight / 2 - 0.02;
  return clamp(centredUpper, templateHeight / 2 + 0.02, maxCentre);
}

export interface GuideLayoutOptions {
  /** Fraction of the viewport blocked at the bottom (phone stand / box). */
  obstructionBottom?: number;
}

/** Place a guide template at a centre point, keeping it above bottom obstructions. */
export function positionGuideBox(
  template: { width: number; height: number },
  centerX: number,
  centerY: number,
  options: GuideLayoutOptions = {},
): DetectedCard {
  const obstruction = options.obstructionBottom ?? 0;
  const maxBottom = 1 - obstruction;

  let left = centerX - template.width / 2;
  let top = centerY - template.height / 2;

  left = clamp(left, 0, 1 - template.width);
  top = clamp(top, 0, Math.max(0, maxBottom - template.height));

  return { left, top, width: template.width, height: template.height };
}

export function defaultGuideBox(): DetectedCard {
  return guideBoxForDistance(20);
}

export function shouldAcceptDetection(prev: DetectedCard | null, next: DetectedCard): boolean {
  if (!prev) return true;

  const prevCx = prev.left + prev.width / 2;
  const prevCy = prev.top + prev.height / 2;
  const nextCx = next.left + next.width / 2;
  const nextCy = next.top + next.height / 2;
  const centerJump = Math.hypot(nextCx - prevCx, nextCy - prevCy);
  const sizeJump = Math.abs(next.width - prev.width) / prev.width;

  return centerJump <= 0.06 && sizeJump <= 0.2;
}

export function smoothBox(
  prev: DetectedCard | null,
  next: DetectedCard,
  alpha = 0.2,
  cardAspectRatio: number = CARD_ASPECT,
): DetectedCard {
  const blended = !prev
    ? next
    : {
        left: prev.left + (next.left - prev.left) * alpha,
        top: prev.top + (next.top - prev.top) * alpha,
        width: prev.width + (next.width - prev.width) * alpha,
        height: prev.height + (next.height - prev.height) * alpha,
      };
  return enforceCardRect(blended, cardAspectRatio);
}
