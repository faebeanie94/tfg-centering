import { computeCentering, defaultInnerRect, CARD_WIDTH_MM, CARD_HEIGHT_MM, type Rect } from '../../lib/centering';
import type { CardSide } from '../../lib/tfg-standards';
import { gradeCard } from './gradeCard';
import type {
  ArtworkBoundaries,
  CenteringAxisResult,
  EstimatedCentering,
  PixelBuffer,
} from './types';

export interface CenteringOptions {
  /** Skip this fraction of the outer image so the photo edge is not the “print” edge. */
  outerMarginPercent?: number;
  /** Minimum mean luminance delta to accept an edge. */
  edgeThreshold?: number;
  scanSamples?: number;
  debug?: boolean;
  side?: CardSide;
  cardWidthMm?: number;
  cardHeightMm?: number;
  /** Physical card rectangle in image pixels. Full frame when the JPEG is already cropped. */
  cardRect?: Rect;
}

const DEFAULT_OPTIONS = {
  outerMarginPercent: 0.04,
  edgeThreshold: 18,
  scanSamples: 60,
  debug: false,
  side: 'front' as CardSide,
  cardWidthMm: CARD_WIDTH_MM,
  cardHeightMm: CARD_HEIGHT_MM,
};

export class CenteringGrader {
  static analyze(canvas: HTMLCanvasElement, options: CenteringOptions = {}): EstimatedCentering {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Unable to access card image');
    return this.analyzeBuffer(ctx.getImageData(0, 0, canvas.width, canvas.height), options);
  }

  static analyzeBuffer(image: PixelBuffer, options: CenteringOptions = {}): EstimatedCentering {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const outer = options.cardRect ?? { x: 0, y: 0, width: image.width, height: image.height };
    const boundaries = this.findBoundaries(image, config, outer);
    const inner = this.innerFromBoundaries(outer, boundaries);
    const measurements = computeCentering(outer, inner, config.cardWidthMm, config.cardHeightMm);
    const grade = gradeCard(measurements.bordersPx, config.side);
    const confidence = this.calculateConfidence(outer, inner);

    return {
      side: config.side,
      measurements,
      grade,
      horizontal: this.axisFromPercents(measurements.leftRight.left, measurements.leftRight.right),
      vertical: this.axisFromPercents(measurements.topBottom.top, measurements.topBottom.bottom),
      confidence,
      outer,
      inner,
      ...(config.debug ? { debug: boundaries } : {}),
    };
  }

  /** Seed Border Editor handles from a rectified still. Falls back to a default inner inset. */
  static estimateRects(image: PixelBuffer, options: CenteringOptions = {}): { outer: Rect; inner: Rect; confidence: number } {
    const estimated = this.analyzeBuffer(image, options);
    if (estimated.confidence < 0.5) {
      return { outer: estimated.outer, inner: defaultInnerRect(estimated.outer), confidence: estimated.confidence };
    }
    return { outer: estimated.outer, inner: estimated.inner, confidence: estimated.confidence };
  }

  private static axisFromPercents(firstPercent: number, secondPercent: number): CenteringAxisResult {
    const first = firstPercent;
    const second = secondPercent;
    return {
      first,
      second,
      firstPercent,
      secondPercent,
      ratio: `${Math.round(firstPercent)}/${Math.round(secondPercent)}`,
    };
  }

  private static innerFromBoundaries(outer: Rect, boundaries: ArtworkBoundaries): Rect {
    const x = clamp(boundaries.leftBoundary, outer.x + 1, outer.x + outer.width - 3);
    const y = clamp(boundaries.topBoundary, outer.y + 1, outer.y + outer.height - 3);
    const right = clamp(boundaries.rightBoundary, x + 2, outer.x + outer.width - 1);
    const bottom = clamp(boundaries.bottomBoundary, y + 2, outer.y + outer.height - 1);
    return { x, y, width: right - x, height: bottom - y };
  }

  private static findBoundaries(
    image: PixelBuffer,
    options: typeof DEFAULT_OPTIONS,
    outer: Rect,
  ): ArtworkBoundaries {
    const marginX = Math.round(outer.width * options.outerMarginPercent);
    const marginY = Math.round(outer.height * options.outerMarginPercent);
    const centerY = Math.floor(outer.y + outer.height / 2);
    const centerX = Math.floor(outer.x + outer.width / 2);
    const horizontalSamples = this.buildSamples(outer.y, outer.height, centerY, options.scanSamples);
    const verticalSamples = this.buildSamples(outer.x, outer.width, centerX, options.scanSamples);

    return {
      leftBoundary: this.findLeftBoundary(image, horizontalSamples, outer, marginX, options.edgeThreshold),
      rightBoundary: this.findRightBoundary(image, horizontalSamples, outer, marginX, options.edgeThreshold),
      topBoundary: this.findTopBoundary(image, verticalSamples, outer, marginY, options.edgeThreshold),
      bottomBoundary: this.findBottomBoundary(image, verticalSamples, outer, marginY, options.edgeThreshold),
    };
  }

  private static buildSamples(origin: number, length: number, center: number, count: number): number[] {
    const result: number[] = [];
    const spread = Math.min(length * 0.28, 220);
    for (let i = 0; i < count; i++) {
      const normalized = count <= 1 ? 0 : i / (count - 1);
      const value = center + (normalized - 0.5) * spread;
      if (value >= origin && value < origin + length) result.push(Math.round(value));
    }
    return result;
  }

  private static findLeftBoundary(
    image: PixelBuffer,
    samples: number[],
    outer: Rect,
    margin: number,
    threshold: number,
  ): number {
    const start = Math.round(outer.x + margin);
    const end = Math.floor(outer.x + outer.width * 0.45);
    let bestPosition = start;
    let bestScore = 0;
    for (let x = start + 2; x < end; x++) {
      const score = this.horizontalEdgeScore(image, x, samples);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestPosition = x;
      }
    }
    return bestPosition;
  }

  private static findRightBoundary(
    image: PixelBuffer,
    samples: number[],
    outer: Rect,
    margin: number,
    threshold: number,
  ): number {
    const start = Math.floor(outer.x + outer.width * 0.55);
    const end = Math.round(outer.x + outer.width - margin - 2);
    let bestPosition = end;
    let bestScore = 0;
    for (let x = end; x > start; x--) {
      const score = this.horizontalEdgeScore(image, x, samples);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestPosition = x;
      }
    }
    return bestPosition;
  }

  private static findTopBoundary(
    image: PixelBuffer,
    samples: number[],
    outer: Rect,
    margin: number,
    threshold: number,
  ): number {
    const start = Math.round(outer.y + margin);
    const end = Math.floor(outer.y + outer.height * 0.45);
    let bestPosition = start;
    let bestScore = 0;
    for (let y = start + 2; y < end; y++) {
      const score = this.verticalEdgeScore(image, y, samples);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestPosition = y;
      }
    }
    return bestPosition;
  }

  private static findBottomBoundary(
    image: PixelBuffer,
    samples: number[],
    outer: Rect,
    margin: number,
    threshold: number,
  ): number {
    const start = Math.floor(outer.y + outer.height * 0.55);
    const end = Math.round(outer.y + outer.height - margin - 2);
    let bestPosition = end;
    let bestScore = 0;
    for (let y = end; y > start; y--) {
      const score = this.verticalEdgeScore(image, y, samples);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestPosition = y;
      }
    }
    return bestPosition;
  }

  private static horizontalEdgeScore(image: PixelBuffer, x: number, ys: number[]): number {
    let total = 0;
    let count = 0;
    for (const y of ys) {
      total += Math.abs(this.luminance(image, x + 1, y) - this.luminance(image, x - 1, y));
      count++;
    }
    return count === 0 ? 0 : total / count;
  }

  private static verticalEdgeScore(image: PixelBuffer, y: number, xs: number[]): number {
    let total = 0;
    let count = 0;
    for (const x of xs) {
      total += Math.abs(this.luminance(image, x, y + 1) - this.luminance(image, x, y - 1));
      count++;
    }
    return count === 0 ? 0 : total / count;
  }

  private static luminance(image: PixelBuffer, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0;
    const offset = (y * image.width + x) * 4;
    return 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
  }

  private static calculateConfidence(outer: Rect, inner: Rect): number {
    if (inner.width <= 0 || inner.height <= 0) return 0;
    const widthRatio = inner.width / outer.width;
    const heightRatio = inner.height / outer.height;
    let confidence = 0;
    if (widthRatio > 0.4 && widthRatio < 0.98) confidence += 0.5;
    if (heightRatio > 0.4 && heightRatio < 0.98) confidence += 0.5;
    return confidence;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
