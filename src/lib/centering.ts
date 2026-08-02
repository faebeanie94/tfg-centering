export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Standard trading card dimensions in mm (2.5" × 3.5") */
export const CARD_WIDTH_MM = 63.5;
export const CARD_HEIGHT_MM = 88.9;

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

  const pxPerMmX = outer.width / cardWidthMm;
  const pxPerMmY = outer.height / cardHeightMm;

  const bordersMm: BorderMeasurements = {
    left: bordersPx.left / pxPerMmX,
    right: bordersPx.right / pxPerMmX,
    top: bordersPx.top / pxPerMmY,
    bottom: bordersPx.bottom / pxPerMmY,
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

  return { bordersPx, bordersMm, leftRight, topBottom };
}

export function defaultOuterRect(imgWidth: number, imgHeight: number): Rect {
  const margin = Math.min(imgWidth, imgHeight) * 0.05;
  return {
    x: margin,
    y: margin,
    width: imgWidth - margin * 2,
    height: imgHeight - margin * 2,
  };
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
