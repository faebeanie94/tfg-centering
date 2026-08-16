import type { Point } from './perspective';

export interface CardTrackerOptions {
  /** Minimum confidence required before tracking can become stable. */
  minimumConfidence?: number;
  /** Number of consecutive good frames required before auto capture. */
  requiredStableFrames?: number;
  /** Maximum movement (px in the analysis frame) allowed between frames. */
  maximumCornerMovement?: number;
  /** How strongly the new detection is blended with the previous one (0–1). */
  smoothingFactor?: number;
  /** Called once when a stable card is automatically captured. */
  onAutoCapture?: () => void;
}

export interface CardTrackerSnapshot {
  corners: Point[];
  confidence: number;
  stability: number;
  stableFrames: number;
  requiredStableFrames: number;
  isStable: boolean;
  readyToCapture: boolean;
  stabilityPercentage: number;
}

const EMPTY: Point[] = [];

/**
 * Temporal tracker for live card corners (Commit 5).
 * Feed every processed camera frame via {@link CardTracker.setDetection}.
 */
export class CardTracker {
  detectedCorners: Point[] = [];
  confidence = 0;

  readonly minimumConfidence: number;
  readonly requiredStableFrames: number;
  readonly maximumCornerMovement: number;
  readonly smoothingFactor: number;
  readonly onAutoCapture?: () => void;

  private _hasPreviousDetection = false;
  private _captureTriggered = false;
  private _stableFrames = 0;
  private _stability = 0;
  private _smoothedCorners: Point[] = [];

  constructor({
    minimumConfidence = 0.88,
    requiredStableFrames = 8,
    maximumCornerMovement = 18,
    smoothingFactor = 0.3,
    onAutoCapture,
  }: CardTrackerOptions = {}) {
    this.minimumConfidence = minimumConfidence;
    this.requiredStableFrames = requiredStableFrames;
    this.maximumCornerMovement = maximumCornerMovement;
    this.smoothingFactor = smoothingFactor;
    this.onAutoCapture = onAutoCapture;
  }

  get stability(): number {
    return this._stability;
  }

  get isStable(): boolean {
    return this._stableFrames >= this.requiredStableFrames && this.confidence >= this.minimumConfidence;
  }

  get readyToCapture(): boolean {
    return this.isStable && !this._captureTriggered;
  }

  get stableFrames(): number {
    return this._stableFrames;
  }

  get stabilityPercentage(): number {
    return Math.min(1, Math.max(0, this._stability)) * 100;
  }

  snapshot(): CardTrackerSnapshot {
    return {
      corners: this.detectedCorners.length === 4 ? this.detectedCorners.map((p) => ({ ...p })) : [],
      confidence: this.confidence,
      stability: this._stability,
      stableFrames: this._stableFrames,
      requiredStableFrames: this.requiredStableFrames,
      isStable: this.isStable,
      readyToCapture: this.readyToCapture,
      stabilityPercentage: this.stabilityPercentage,
    };
  }

  /**
   * Corners must be [topLeft, topRight, bottomRight, bottomLeft] in
   * analysis-frame pixels (same space as `frameWidth` / `frameHeight`).
   */
  setDetection({
    corners,
    confidence,
  }: {
    corners: Point[];
    confidence: number;
    frameWidth?: number;
    frameHeight?: number;
  }): void {
    const newConfidence = clamp01(confidence);

    if (corners.length !== 4 || !this._validCorners(corners)) {
      this._handleLostDetection();
      return;
    }

    const newCorners = corners.map((p) => ({ x: p.x, y: p.y }));

    if (!this._hasPreviousDetection) {
      this._smoothedCorners = newCorners;
      this._hasPreviousDetection = true;
      this.detectedCorners = newCorners.map((p) => ({ ...p }));
      this.confidence = newConfidence;
      this._stability = 0;
      this._stableFrames = 0;
      return;
    }

    const movement = this._averageMovement(this._smoothedCorners, newCorners);
    const smoothed: Point[] = [];
    for (let i = 0; i < 4; i++) {
      const oldPoint = this._smoothedCorners[i];
      const next = newCorners[i];
      smoothed.push({
        x: oldPoint.x + (next.x - oldPoint.x) * this.smoothingFactor,
        y: oldPoint.y + (next.y - oldPoint.y) * this.smoothingFactor,
      });
    }

    this._smoothedCorners = smoothed;
    this.detectedCorners = smoothed.map((p) => ({ ...p }));
    this.confidence = newConfidence;

    const movementStability = this._movementToStability(movement);
    const confidenceStability = clamp01(
      (newConfidence - this.minimumConfidence) / Math.max(1e-6, 1 - this.minimumConfidence),
    );
    const frameStability = movementStability * 0.65 + confidenceStability * 0.35;
    this._stability = this._stability * 0.65 + frameStability * 0.35;

    if (newConfidence >= this.minimumConfidence && movement <= this.maximumCornerMovement) {
      this._stableFrames = Math.min(this.requiredStableFrames, this._stableFrames + 1);
    } else {
      this._stableFrames = Math.max(0, this._stableFrames - 2);
    }

    if (this.readyToCapture) {
      this._captureTriggered = true;
      this.onAutoCapture?.();
    }
  }

  reset(): void {
    this.detectedCorners = [];
    this.confidence = 0;
    this._smoothedCorners = [];
    this._hasPreviousDetection = false;
    this._stableFrames = 0;
    this._stability = 0;
    this._captureTriggered = false;
  }

  /** Allows another automatic capture without clearing the current lock. */
  allowNextCapture(): void {
    this._captureTriggered = false;
  }

  private _handleLostDetection(): void {
    this._stableFrames = Math.max(0, this._stableFrames - 3);
    this._stability *= 0.75;
    this.confidence *= 0.9;

    if (this._stableFrames === 0) {
      this.detectedCorners = [];
      this._smoothedCorners = [];
      this._hasPreviousDetection = false;
    }
  }

  private _averageMovement(oldCorners: Point[], newCorners: Point[]): number {
    if (oldCorners.length !== 4 || newCorners.length !== 4) return Number.POSITIVE_INFINITY;
    let total = 0;
    for (let i = 0; i < 4; i++) total += distance(oldCorners[i], newCorners[i]);
    return total / 4;
  }

  private _movementToStability(movement: number): number {
    if (!Number.isFinite(movement)) return 0;
    if (movement <= 2) return 1;
    if (movement >= this.maximumCornerMovement) return 0;
    return 1 - (movement - 2) / (this.maximumCornerMovement - 2);
  }

  private _validCorners(corners: Point[]): boolean {
    if (corners.length !== 4) return false;
    for (const corner of corners) {
      if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) return false;
    }

    const [topLeft, topRight, bottomRight, bottomLeft] = corners;
    const topLength = distance(topLeft, topRight);
    const bottomLength = distance(bottomLeft, bottomRight);
    const leftLength = distance(topLeft, bottomLeft);
    const rightLength = distance(topRight, bottomRight);

    if (topLength < 20 || bottomLength < 20 || leftLength < 20 || rightLength < 20) {
      return false;
    }

    const horizontalRatio = Math.min(topLength, bottomLength) / Math.max(topLength, bottomLength);
    const verticalRatio = Math.min(leftLength, rightLength) / Math.max(leftLength, rightLength);
    return horizontalRatio >= 0.45 && verticalRatio >= 0.45;
  }
}

export function cornersToNormalizedBox(
  corners: Point[],
  frameWidth: number,
  frameHeight: number,
): { left: number; top: number; width: number; height: number } | null {
  if (corners.length !== 4 || frameWidth < 1 || frameHeight < 1) return null;
  const xs = corners.map((p) => p.x / frameWidth);
  const ys = corners.map((p) => p.y / frameHeight);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { left, top, width: right - left, height: bottom - top };
}

export function emptyTrackerSnapshot(requiredStableFrames = 8): CardTrackerSnapshot {
  return {
    corners: EMPTY,
    confidence: 0,
    stability: 0,
    stableFrames: 0,
    requiredStableFrames,
    isStable: false,
    readyToCapture: false,
    stabilityPercentage: 0,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
