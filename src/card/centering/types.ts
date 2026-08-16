import type { BorderMeasurements, CenteringResult, Rect } from '../../lib/centering';
import type { CardSide, TfgCenteringGrade } from '../../lib/tfg-standards';

export type { BorderMeasurements, CenteringResult, Rect };

export interface ArtworkBoundaries {
  leftBoundary: number;
  rightBoundary: number;
  topBoundary: number;
  bottomBoundary: number;
}

export interface CenteringAxisResult {
  first: number;
  second: number;
  firstPercent: number;
  secondPercent: number;
  /** Human-readable pair such as `55/45`. */
  ratio: string;
}

export interface EstimatedCentering {
  side: CardSide;
  measurements: CenteringResult;
  grade: TfgCenteringGrade;
  horizontal: CenteringAxisResult;
  vertical: CenteringAxisResult;
  confidence: number;
  outer: Rect;
  inner: Rect;
  debug?: ArtworkBoundaries;
}

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
