import {
  detectCardFrameFromImageData,
  guideTemplateForDistance,
  type DetectedCard,
  type DetectSearchRegion,
} from './card-edge-detect';
import type { Rect } from './centering';
import { defaultInnerRect } from './centering';
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
}

export interface AutoCropResult {
  imageSrc: string;
  outer: Rect;
  inner: Rect;
  /** Corners used for the warp (in source image pixels). */
  corners: QuadCorners;
}

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

function analysisSize(naturalWidth: number, naturalHeight: number): { w: number; h: number } {
  const maxW = 480;
  const scale = Math.min(1, maxW / Math.max(1, naturalWidth));
  return {
    w: Math.max(32, Math.round(naturalWidth * scale)),
    h: Math.max(32, Math.round(naturalHeight * scale)),
  };
}

function searchCandidates(hint?: CaptureDetectHint): DetectSearchRegion[] {
  const searches: DetectSearchRegion[] = [];

  if (hint?.box) {
    searches.push({
      cx: hint.box.left + hint.box.width / 2,
      cy: hint.box.top + hint.box.height / 2,
      expectedWidth: hint.box.width,
      expectedHeight: hint.box.height,
    });
  }

  for (const distance of [20, 12, 30] as const) {
    const template = guideTemplateForDistance(distance);
    searches.push({
      cx: 0.5,
      cy: 0.36,
      expectedWidth: template.width,
      expectedHeight: template.height,
    });
    searches.push({
      cx: 0.5,
      cy: 0.5,
      expectedWidth: template.width,
      expectedHeight: template.height,
    });
  }

  // Loose full-frame guesses for library uploads / desk photos.
  for (const height of [0.55, 0.7, 0.4]) {
    searches.push({
      cx: 0.5,
      cy: 0.5,
      expectedWidth: height * (63.5 / 88.9),
      expectedHeight: height,
    });
  }

  return searches;
}

/**
 * Detect card corners in a still image. Uses the live-scanner hint when present,
 * otherwise runs multi-scale still-frame detection.
 */
export async function detectCardCornersFromImage(
  imageSrc: string,
  hint?: CaptureDetectHint,
): Promise<QuadCorners | null> {
  const img = await loadImage(imageSrc);
  const { naturalWidth: imgW, naturalHeight: imgH } = img;

  if (hint?.box && hint.box.width > 0.08 && hint.box.height > 0.08) {
    return boxToCorners(hint.box, imgW, imgH, hint.rotationDeg ?? 0);
  }

  const { w, h } = analysisSize(imgW, imgH);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let bestBox: DetectedCard | null = null;
  let bestRot = 0;
  let bestScore = -1;

  for (const search of searchCandidates(hint)) {
    const found = detectCardFrameFromImageData(data, w, h, search);
    if (!found) continue;

    const expected =
      search.expectedWidth != null && search.expectedHeight != null
        ? { width: search.expectedWidth, height: search.expectedHeight }
        : undefined;

    const aspectErr = Math.abs(found.box.width / found.box.height - 63.5 / 88.9);
    let score = 1 - aspectErr / 0.06;
    if (expected) {
      const sizeRatio =
        (found.box.width / expected.width + found.box.height / expected.height) / 2;
      if (sizeRatio >= 0.4 && sizeRatio <= 1.6) {
        score = score * 0.35 + (1 - Math.min(1, Math.abs(1 - sizeRatio))) * 0.65;
      } else {
        score *= 0.4;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestBox = found.box;
      bestRot = found.rotationDeg;
    }
  }

  if (!bestBox || bestScore < 0.25) return null;
  return boxToCorners(bestBox, imgW, imgH, bestRot);
}

/**
 * Detect the card, perspective-correct + crop, and seed border editor rects.
 * Returns null when detection fails (caller should fall back to manual Perspective Fix).
 */
export async function autoCropCard(
  imageSrc: string,
  hint?: CaptureDetectHint,
): Promise<AutoCropResult | null> {
  const corners = await detectCardCornersFromImage(imageSrc, hint);
  if (!corners) return null;

  try {
    const corrected = await perspectiveCorrect(imageSrc, corners);
    const img = await loadImage(corrected);
    const rects = defaultRectsAfterCrop(img.naturalWidth, img.naturalHeight);
    return {
      imageSrc: corrected,
      outer: rects.outer,
      inner: rects.inner,
      corners,
    };
  } catch {
    return null;
  }
}
