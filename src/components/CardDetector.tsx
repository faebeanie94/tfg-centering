export type Point = {
  x: number;
  y: number;
};

export type CardCorners = [
  Point, // top-left
  Point, // top-right
  Point, // bottom-right
  Point, // bottom-left
];

type DetectionResult = {
  corners: CardCorners;
  confidence: number;
};

type CardDetectorOptions = {
  minimumConfidence?: number;
  requiredStableFrames?: number;
  maximumCornerMovement?: number;
  smoothingFactor?: number;
  onAutoCapture?: () => void;
};

export class CardDetector {
  detectedCorners: CardCorners | null = null;
  confidence = 0;

  private minimumConfidence: number;
  private requiredStableFrames: number;
  private maximumCornerMovement: number;
  private smoothingFactor: number;
  private onAutoCapture?: () => void;

  private hasPreviousDetection = false;
  private captureTriggered = false;
  private stableFrames = 0;
  private stability = 0;
  private smoothedCorners: CardCorners | null = null;

  constructor(options: CardDetectorOptions = {}) {
    this.minimumConfidence = options.minimumConfidence ?? 0.88;
    this.requiredStableFrames = options.requiredStableFrames ?? 8;
    this.maximumCornerMovement = options.maximumCornerMovement ?? 18;
    this.smoothingFactor = options.smoothingFactor ?? 0.3;
    this.onAutoCapture = options.onAutoCapture;
  }

  get isStable(): boolean {
    return this.stableFrames >= this.requiredStableFrames && this.confidence >= this.minimumConfidence;
  }

  get readyToCapture(): boolean {
    return this.isStable && !this.captureTriggered;
  }

  get stabilityPercentage(): number {
    return Math.round(Math.max(0, Math.min(1, this.stability)) * 100);
  }

  get stableFrameCount(): number {
    return this.stableFrames;
  }

  setDetection(result: DetectionResult): void {
    const confidence = Math.max(0, Math.min(1, result.confidence));

    if (!result.corners || result.corners.length !== 4 || !this.validCorners(result.corners)) {
      this.handleLostDetection();
      return;
    }

    const newCorners: CardCorners = [
      { ...result.corners[0] },
      { ...result.corners[1] },
      { ...result.corners[2] },
      { ...result.corners[3] },
    ];

    if (!this.hasPreviousDetection) {
      this.smoothedCorners = newCorners;
      this.detectedCorners = newCorners;
      this.confidence = confidence;
      this.hasPreviousDetection = true;
      this.stability = 0;
      this.stableFrames = 0;
      return;
    }

    const movement = this.calculateAverageMovement(this.smoothedCorners!, newCorners);

    const smoothed: CardCorners = [
      this.smoothPoint(this.smoothedCorners![0], newCorners[0]),
      this.smoothPoint(this.smoothedCorners![1], newCorners[1]),
      this.smoothPoint(this.smoothedCorners![2], newCorners[2]),
      this.smoothPoint(this.smoothedCorners![3], newCorners[3]),
    ];

    this.smoothedCorners = smoothed;
    this.detectedCorners = smoothed;
    this.confidence = confidence;

    const movementStability = this.movementToStability(movement);
    const confidenceStability = Math.max(
      0,
      Math.min(1, (confidence - this.minimumConfidence) / (1 - this.minimumConfidence)),
    );
    const frameStability = movementStability * 0.65 + confidenceStability * 0.35;
    this.stability = this.stability * 0.65 + frameStability * 0.35;

    if (confidence >= this.minimumConfidence && movement <= this.maximumCornerMovement) {
      this.stableFrames = Math.min(this.requiredStableFrames, this.stableFrames + 1);
    } else {
      this.stableFrames = Math.max(0, this.stableFrames - 2);
    }

    if (this.readyToCapture) {
      this.captureTriggered = true;
      if (this.onAutoCapture) {
        this.onAutoCapture();
      }
    }
  }

  reset(): void {
    this.detectedCorners = null;
    this.confidence = 0;
    this.smoothedCorners = null;
    this.hasPreviousDetection = false;
    this.stableFrames = 0;
    this.stability = 0;
    this.captureTriggered = false;
  }

  allowNextCapture(): void {
    this.captureTriggered = false;
  }

  private smoothPoint(oldPoint: Point, newPoint: Point): Point {
    return {
      x: oldPoint.x + (newPoint.x - oldPoint.x) * this.smoothingFactor,
      y: oldPoint.y + (newPoint.y - oldPoint.y) * this.smoothingFactor,
    };
  }

  private calculateAverageMovement(oldCorners: CardCorners, newCorners: CardCorners): number {
    let total = 0;
    for (let i = 0; i < 4; i++) {
      total += this.distance(oldCorners[i], newCorners[i]);
    }
    return total / 4;
  }

  private movementToStability(movement: number): number {
    if (!Number.isFinite(movement)) {
      return 0;
    }
    if (movement <= 2) {
      return 1;
    }
    if (movement >= this.maximumCornerMovement) {
      return 0;
    }
    return 1 - (movement - 2) / (this.maximumCornerMovement - 2);
  }

  private distance(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private validCorners(corners: CardCorners): boolean {
    for (const corner of corners) {
      if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) {
        return false;
      }
    }

    const topLeft = corners[0];
    const topRight = corners[1];
    const bottomRight = corners[2];
    const bottomLeft = corners[3];

    const topLength = this.distance(topLeft, topRight);
    const bottomLength = this.distance(bottomLeft, bottomRight);
    const leftLength = this.distance(topLeft, bottomLeft);
    const rightLength = this.distance(topRight, bottomRight);

    if (topLength < 20 || bottomLength < 20 || leftLength < 20 || rightLength < 20) {
      return false;
    }

    const horizontalRatio = Math.min(topLength, bottomLength) / Math.max(topLength, bottomLength);
    const verticalRatio = Math.min(leftLength, rightLength) / Math.max(leftLength, rightLength);

    if (horizontalRatio < 0.45 || verticalRatio < 0.45) {
      return false;
    }

    return true;
  }

  private handleLostDetection(): void {
    this.stableFrames = Math.max(0, this.stableFrames - 3);
    this.stability *= 0.75;
    this.confidence *= 0.9;

    if (this.stableFrames === 0) {
      this.detectedCorners = null;
      this.smoothedCorners = null;
      this.hasPreviousDetection = false;
    }
  }
}

type CardDebugOverlayProps = {
  detector: CardDetector;
};

export function CardDebugOverlay({ detector }: CardDebugOverlayProps) {
  const corners = detector.detectedCorners;

  if (!corners) {
    return null;
  }

  const confidencePercent = Math.round(detector.confidence * 100);
  const stabilityPercent = detector.stabilityPercentage;
  const progress = Math.max(0, Math.min(1, detector.stableFrameCount / 8));
  const color = detector.isStable ? '#00ff88' : '#ffb020';

  const centerX = corners.reduce((sum, point) => sum + point.x, 0) / 4;
  const centerY = corners.reduce((sum, point) => sum + point.y, 0) / 4;
  const points = corners.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <polygon
          points={points}
          fill="none"
          stroke="rgba(0,0,0,0.75)"
          strokeWidth="14"
          strokeLinejoin="round"
        />
        <polygon points={points} fill="none" stroke={color} strokeWidth="6" strokeLinejoin="round" />
        {corners.map((point, index) => (
          <g key={index}>
            <circle cx={point.x} cy={point.y} r="14" fill="rgba(0,0,0,0.8)" />
            <circle cx={point.x} cy={point.y} r="8" fill={color} />
          </g>
        ))}
      </svg>

      <div
        style={{
          position: 'absolute',
          left: `${(centerX / 1000) * 100}%`,
          top: `${(centerY / 1000) * 100}%`,
          transform: 'translate(-50%, 30px)',
          background: 'rgba(0,0,0,0.78)',
          color: 'white',
          padding: '10px 16px',
          borderRadius: '10px',
          textAlign: 'center',
          fontFamily: 'Arial, sans-serif',
          fontWeight: 700,
          fontSize: '16px',
          whiteSpace: 'nowrap',
        }}
      >
        <div>{confidencePercent}% confidence</div>
        <div>{stabilityPercent}% stable</div>
        <div style={{ color, marginTop: '3px' }}>
          {detector.isStable ? 'READY — HOLD STEADY' : 'Hold steady...'}
        </div>
        <div
          style={{
            width: '220px',
            height: '7px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '10px',
            marginTop: '10px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              background: color,
              borderRadius: '10px',
              transition: 'width 100ms linear',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Map analysis-frame pixel corners into the overlay's 0–1000 space. */
export function cornersToOverlaySpace(
  corners: [Point, Point, Point, Point],
  frameWidth: number,
  frameHeight: number,
): CardCorners {
  const sx = 1000 / Math.max(1, frameWidth);
  const sy = 1000 / Math.max(1, frameHeight);
  return [
    { x: corners[0].x * sx, y: corners[0].y * sy },
    { x: corners[1].x * sx, y: corners[1].y * sy },
    { x: corners[2].x * sx, y: corners[2].y * sy },
    { x: corners[3].x * sx, y: corners[3].y * sy },
  ];
}

export function overlayCornersToBox(corners: CardCorners): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const xs = corners.map((p) => p.x / 1000);
  const ys = corners.map((p) => p.y / 1000);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
