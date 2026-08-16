import type { DetectedCard } from './card-edge-detect';
import { CARD_ASPECT, guideBoxForDistance, type ScanDistanceCm } from './card-edge-detect';

export interface CardAlignmentState {
  guide: DetectedCard;
  detected: DetectedCard | null;
  /** Card edges are parallel to the frame (not rotated on the surface). */
  isCardLevel: boolean;
  /** Detected card sits inside the guide with acceptable size and position. */
  fitsGuide: boolean;
  rotationDeg: number;
  offsetX: number;
  offsetY: number;
  sizeRatio: number;
}

  const CENTER_TOLERANCE = 0.05;
const SIZE_MIN = 0.82;
const SIZE_MAX = 1.18;
const ROTATION_TOLERANCE_DEG = 5;
const GUIDE_INSET = 0.04;
const FIT_IOU = 0.7;

function rectIou(
  a: DetectedCard,
  b: DetectedCard,
): number {
  const x0 = Math.max(a.left, b.left);
  const y0 = Math.max(a.top, b.top);
  const x1 = Math.min(a.left + a.width, b.left + b.width);
  const y1 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

export function getGuideBox(distanceCm: ScanDistanceCm = 20): DetectedCard {
  return guideBoxForDistance(distanceCm);
}

export function evaluateCardAlignment(
  detected: DetectedCard | null,
  rotationDeg: number,
  guide: DetectedCard = getGuideBox(),
  cardAspectRatio: number = CARD_ASPECT,
  frameAspect = 1,
  maxBottom = 1,
): CardAlignmentState {
  if (!detected) {
    return {
      guide,
      detected: null,
      isCardLevel: false,
      fitsGuide: false,
      rotationDeg,
      offsetX: 0,
      offsetY: 0,
      sizeRatio: 0,
    };
  }

  const detCx = detected.left + detected.width / 2;
  const detCy = detected.top + detected.height / 2;
  const guideCx = guide.left + guide.width / 2;
  const guideCy = guide.top + guide.height / 2;

  const offsetX = detCx - guideCx;
  const offsetY = detCy - guideCy;
  const sizeRatio = (detected.width / guide.width + detected.height / guide.height) / 2;

  const isCardLevel = Math.abs(rotationDeg) <= ROTATION_TOLERANCE_DEG;

  const insideGuide =
    detected.left >= guide.left - GUIDE_INSET &&
    detected.top >= guide.top - GUIDE_INSET &&
    detected.left + detected.width <= guide.left + guide.width + GUIDE_INSET &&
    detected.top + detected.height <= guide.top + guide.height + GUIDE_INSET;

  const centered =
    Math.abs(offsetX) <= CENTER_TOLERANCE && Math.abs(offsetY) <= CENTER_TOLERANCE;

  const sized = sizeRatio >= SIZE_MIN && sizeRatio <= SIZE_MAX;

  const expectedNormAspect = cardAspectRatio / (frameAspect > 0.15 ? frameAspect : 1);
  const aspectOk = Math.abs(detected.width / detected.height - expectedNormAspect) <= 0.08;

  const aboveStand = detected.top + detected.height <= maxBottom + 0.02;
  const overlapped = rectIou(detected, guide) >= FIT_IOU;

  const fitsGuide =
    insideGuide && centered && sized && aspectOk && isCardLevel && aboveStand && overlapped;

  return {
    guide,
    detected,
    isCardLevel,
    fitsGuide,
    rotationDeg,
    offsetX,
    offsetY,
    sizeRatio,
  };
}

export { SIZE_MIN, SIZE_MAX };
