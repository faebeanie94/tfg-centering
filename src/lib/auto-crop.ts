import { CARD_ASPECT, type DetectedCard } from './card-edge-detect';
import {
  detectCardFromImageData,
  type CardDetectionQuality,
  type CornerDetection,
} from './card-detector';
import type { Rect } from './centering';
import { defaultInnerRect } from './centering';
import { CenteringGrader } from '../card/centering/CenteringGrader';
import {
  type Point,
  type QuadCorners,
  OUTPUT_PADDING_RATIO,
  perspectiveCorrect,
} from './perspective';

export type { CardDetectionQuality, CornerDetection };

export interface CaptureDetectHint {
  /** Normalised axis-aligned box from the live scanner (0–1). */
  box?: DetectedCard | null;
  rotationDeg?: number;
  /**
   * True when the live scanner considered the card ready (in guide, level).
   * A live box alone is not enough — tilted desk shots still get an AABB.
   */
  liveReady?: boolean;
  /** True when the capture was already perspective-flattened by CardImageProcessor. */
  preCorrected?: boolean;
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
export const AUTO_CROP_CONFIDENCE = 0.85;

/** Below this, do not seed Perspective Fix with a guessed card. */
export const DETECT_CONFIRM_CONFIDENCE = 0.6;

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

function analysisSize(naturalWidth: number, naturalHeight: number): { w: number; h: number; scale: number } {
  const maxW = 640;
  const scale = Math.min(1, maxW / Math.max(1, naturalWidth));
  return {
    w: Math.max(32, Math.round(naturalWidth * scale)),
    h: Math.max(32, Math.round(naturalHeight * scale)),
    scale,
  };
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

  const detected = detectCardFromImageData(data, w, h, {
    cardAspect,
    hintBox: hint?.box,
  });
  if (!detected) return null;

  return {
    corners: scaleCorners(detected.corners, scale, imgW, imgH),
    confidence: detected.confidence,
    quality: detected.quality,
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

  const topAngle = Math.abs(Math.atan2(q.tr.y - q.tl.y, q.tr.x - q.tl.x));
  const botAngle = Math.abs(Math.atan2(q.br.y - q.bl.y, q.br.x - q.bl.x));
  const maxTilt = (12 * Math.PI) / 180;
  if (topAngle > maxTilt && Math.abs(topAngle - Math.PI) > maxTilt) return false;
  if (botAngle > maxTilt && Math.abs(botAngle - Math.PI) > maxTilt) return false;
  return true;
}

/**
 * Detect corners and auto-crop when confidence is high enough.
 *
 * Mode A (≥ AUTO_CROP_CONFIDENCE): auto-apply when the quad is nearly frontal.
 * Mode B (DETECT_CONFIRM_CONFIDENCE–AUTO_CROP): seed Perspective Fix.
 * Mode C (< DETECT_CONFIRM_CONFIDENCE): do not pretend a card was found.
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

  if (detected.confidence < DETECT_CONFIRM_CONFIDENCE) {
    return { result: null, corners: null, confidence: detected.confidence };
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
    const rects = defaultRectsAfterCrop(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let inner = rects.inner;
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      const estimated = CenteringGrader.estimateRects(ctx.getImageData(0, 0, canvas.width, canvas.height), {
        cardRect: rects.outer,
      });
      inner = estimated.inner;
    }
    return {
      result: {
        imageSrc: corrected,
        outer: rects.outer,
        inner,
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
