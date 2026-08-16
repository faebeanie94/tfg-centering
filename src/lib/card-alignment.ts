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

const CENTER_TOLERANCE = 0.06;
const SIZE_MIN = 0.72;
const SIZE_MAX = 1.2;
const ROTATION_TOLERANCE_DEG = 5;
const GUIDE_INSET = 0.05;

export function getGuideBox(distanceCm: ScanDistanceCm = 20): DetectedCard {
  return guideBoxForDistance(distanceCm);
}

export function evaluateCardAlignment(
  detected: DetectedCard | null,
  rotationDeg: number,
  guide: DetectedCard = getGuideBox(),
  cardAspectRatio: number = CARD_ASPECT,
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

  const aspectOk = Math.abs(detected.width / detected.height - cardAspectRatio) <= 0.025;

  const fitsGuide = insideGuide && centered && sized && aspectOk && isCardLevel;

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
