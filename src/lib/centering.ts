export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Standard trading card dimensions in mm (2.5" × 3.5") */
export const CARD_WIDTH_MM = 63.5;
export const CARD_HEIGHT_MM = 88.9;

/**
 * Must match `OUTPUT_PADDING_RATIO` in perspective.ts.
 * Perspective-corrected images place the physical card inset by this fraction
 * of the card size on each side — default outer handles sit on that frame so
 * mm values map to manufactured card size without a caliper.
 */
export const CARD_IMAGE_PADDING_RATIO = 0.08;

export interface BorderMeasurements {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CenteringResult {
  bordersPx: BorderMeasurements;
  bordersMm: BorderMeasurements;
  leftRight: { left: number; right: number };
  topBottom: { top: number; bottom: number };
  /** Pixels per millimetre (isotropic), derived from standard card size. */
  pxPerMm: number;
}

export function formatMm(n: number): string {
  return `${n.toFixed(2)} mm`;
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Compact border pair for banners/summaries, e.g. "2.15 | 1.76 mm". */
export function formatMmPair(a: number, b: number): string {
  return `${a.toFixed(2)} | ${b.toFixed(2)} mm`;
}

/**
 * Absolute-ish mm scale without external tools: the green outer box is treated
 * as a standard 63.5×88.9 mm card. One isotropic px/mm keeps L/R/T/B consistent
 * even if the outer box is slightly off-aspect.
 */
export function pxPerMmFromCardOuter(
  outer: Rect,
  cardWidthMm: number = CARD_WIDTH_MM,
  cardHeightMm: number = CARD_HEIGHT_MM,
): number {
  const sx = outer.width / cardWidthMm;
  const sy = outer.height / cardHeightMm;
  return Math.sqrt(Math.max(sx, 1e-9) * Math.max(sy, 1e-9));
}

export function computeCentering(
  outer: Rect,
  inner: Rect,
  cardWidthMm: number = CARD_WIDTH_MM,
  cardHeightMm: number = CARD_HEIGHT_MM,
): CenteringResult {
  const bordersPx: BorderMeasurements = {
    left: inner.x - outer.x,
    right: outer.x + outer.width - (inner.x + inner.width),
    top: inner.y - outer.y,
    bottom: outer.y + outer.height - (inner.y + inner.height),
  };

  const pxPerMm = pxPerMmFromCardOuter(outer, cardWidthMm, cardHeightMm);

  const bordersMm: BorderMeasurements = {
    left: bordersPx.left / pxPerMm,
    right: bordersPx.right / pxPerMm,
    top: bordersPx.top / pxPerMm,
    bottom: bordersPx.bottom / pxPerMm,
  };

  const horizontalTotal = bordersPx.left + bordersPx.right;
  const verticalTotal = bordersPx.top + bordersPx.bottom;

  const leftRight = {
    left: horizontalTotal > 0 ? (bordersPx.left / horizontalTotal) * 100 : 50,
    right: horizontalTotal > 0 ? (bordersPx.right / horizontalTotal) * 100 : 50,
  };

  const topBottom = {
    top: verticalTotal > 0 ? (bordersPx.top / verticalTotal) * 100 : 50,
    bottom: verticalTotal > 0 ? (bordersPx.bottom / verticalTotal) * 100 : 50,
  };

  return { bordersPx, bordersMm, leftRight, topBottom, pxPerMm };
}

/**
 * Outer rectangle on the physical card edges for a perspective-corrected
 * (or similarly padded) image. Matches the warp output padding.
 */
export function cardOuterRectFromImage(
  imgWidth: number,
  imgHeight: number,
  paddingRatio: number = CARD_IMAGE_PADDING_RATIO,
): Rect {
  const cardHeight = imgHeight / (1 + 2 * paddingRatio);
  const cardWidth = imgWidth / (1 + 2 * paddingRatio);
  const padX = (imgWidth - cardWidth) / 2;
  const padY = (imgHeight - cardHeight) / 2;
  return {
    x: padX,
    y: padY,
    width: cardWidth,
    height: cardHeight,
  };
}

/** @deprecated Prefer cardOuterRectFromImage — kept name for existing call sites. */
export function defaultOuterRect(imgWidth: number, imgHeight: number): Rect {
  return cardOuterRectFromImage(imgWidth, imgHeight);
}

export function defaultInnerRect(outer: Rect): Rect {
  const inset = Math.min(outer.width, outer.height) * 0.08;
  return {
    x: outer.x + inset,
    y: outer.y + inset,
    width: outer.width - inset * 2,
    height: outer.height - inset * 2,
  };
}

export function defaultCardRects(imgWidth: number, imgHeight: number): {
  outer: Rect;
  inner: Rect;
} {
  const outer = cardOuterRectFromImage(imgWidth, imgHeight);
  return { outer, inner: defaultInnerRect(outer) };
}
