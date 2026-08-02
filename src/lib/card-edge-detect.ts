/** Trading card width / height in portrait orientation. */
export const CARD_ASPECT = 63.5 / 88.9;

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
  let lastInside = 0;
  for (let s = 1; s < steps; s++) {
    const x = Math.round(x0 + dx * s);
    const y = Math.round(y0 + dy * s);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
    const l = lum(data, y * w + x);
    if (Math.abs(l - ref) > thresh) {
      return s - 1;
    }
    lastInside = s;
  }
  return lastInside;
}

/** Force axis-aligned rectangle with trading-card aspect ratio. */
export function enforceCardRect(box: DetectedCard): DetectedCard {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  let width = box.width;
  let height = box.height;
  const ratio = width / height;

  if (ratio > CARD_ASPECT) {
    width = height * CARD_ASPECT;
  } else {
    height = width / CARD_ASPECT;
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
  if (dist < 6) return null;
  if (dx !== 0) return x0 + dx * dist;
  return y0 + dy * dist;
}

export function detectCardFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): CardFrameDetection | null {
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
  const thresh = 28;

  const yFracs = [0.32, 0.5, 0.68];
  const xFracs = [0.32, 0.5, 0.68];

  const leftXs: number[] = [];
  const rightXs: number[] = [];
  const topYs: number[] = [];
  const bottomYs: number[] = [];

  // Cast rays outward from near the centre — finds the card, not the table edge.
  for (const yf of yFracs) {
    const y = Math.round(h * yf);
    const lx = rayEdgeCoord(data, w, h, cx, y, -1, 0, ref, thresh);
    const rx = rayEdgeCoord(data, w, h, cx, y, 1, 0, ref, thresh);
    if (lx != null) leftXs.push(lx);
    if (rx != null) rightXs.push(rx);
  }

  for (const xf of xFracs) {
    const x = Math.round(w * xf);
    const ty = rayEdgeCoord(data, w, h, x, cy, 0, -1, ref, thresh);
    const by = rayEdgeCoord(data, w, h, x, cy, 0, 1, ref, thresh);
    if (ty != null) topYs.push(ty);
    if (by != null) bottomYs.push(by);
  }

  if (leftXs.length < 2 || rightXs.length < 2 || topYs.length < 2 || bottomYs.length < 2) {
    const fallback = detectCardBox(video, canvas);
    return fallback ? { box: fallback, rotationDeg: 0 } : null;
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

  if (raw.width < 0.12 || raw.height < 0.12) return null;

  const box = enforceCardRect(raw);
  const rotationDeg = estimateRotationDeg(leftXs, rightXs, topYs, bottomYs, w, h);

  return { box, rotationDeg };
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
const CARD_HEIGHT_MM = 88.9;

export const SCAN_DISTANCE_OPTIONS = [12, 20, 30] as const;
export type ScanDistanceCm = (typeof SCAN_DISTANCE_OPTIONS)[number];

/** Guide frame sized for a card at the given phone-to-card distance (cm). */
export function guideBoxForDistance(distanceCm: ScanDistanceCm = 20): DetectedCard {
  const template = guideTemplateForDistance(distanceCm);
  return positionGuideBox(template, 0.5, defaultGuideAnchorY(template.height, 0.32));
}

export function guideTemplateForDistance(distanceCm: ScanDistanceCm = 20): { width: number; height: number } {
  const distanceMm = distanceCm * 10;
  const angularHeightRad = 2 * Math.atan(CARD_HEIGHT_MM / (2 * distanceMm));
  const fovRad = (SCAN_FOV_DEG * Math.PI) / 180;
  const height = Math.max(0.22, Math.min(0.65, angularHeightRad / fovRad));
  return { width: height * CARD_ASPECT, height };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

export function smoothBox(prev: DetectedCard | null, next: DetectedCard, alpha = 0.35): DetectedCard {
  const blended = !prev
    ? next
    : {
        left: prev.left + (next.left - prev.left) * alpha,
        top: prev.top + (next.top - prev.top) * alpha,
        width: prev.width + (next.width - prev.width) * alpha,
        height: prev.height + (next.height - prev.height) * alpha,
      };
  return enforceCardRect(blended);
}
