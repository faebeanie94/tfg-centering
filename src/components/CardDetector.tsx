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

type UpdateDetectionArgs = {
  corners: CardCorners;
  confidence: number;
};

type CardDetectorOptions = {
  onAutoCapture?: () => void | Promise<void>;
};

export class CardDetector {
  detectedCorners: CardCorners | null = null;
  confidence = 0;

  private readonly captureConfidence = 0.9;
  private readonly requiredStableFrames = 8;
  private readonly maxCornerMovement = 8;

  private hasCaptured = false;
  private stableFrames = 0;
  private previousCorners: CardCorners | null = null;

  private onAutoCapture?: () => void | Promise<void>;

  constructor(options: CardDetectorOptions = {}) {
    this.onAutoCapture = options.onAutoCapture;
  }

  updateDetection({ corners, confidence }: UpdateDetectionArgs): void {
    if (!corners || corners.length !== 4) {
      this.resetStability();
      return;
    }

    const cleanConfidence = Math.max(0, Math.min(1, confidence));

    this.detectedCorners = [
      { ...corners[0] },
      { ...corners[1] },
      { ...corners[2] },
      { ...corners[3] },
    ];

    this.confidence = cleanConfidence;

    if (this.hasCaptured) {
      return;
    }

    const stable = this.isStable(corners);

    if (cleanConfidence >= this.captureConfidence && stable) {
      this.stableFrames++;

      if (this.stableFrames >= this.requiredStableFrames) {
        this.hasCaptured = true;
        void this.onAutoCapture?.();
      }
    } else {
      this.stableFrames = Math.max(0, this.stableFrames - 2);
    }

    this.previousCorners = [
      { ...corners[0] },
      { ...corners[1] },
      { ...corners[2] },
      { ...corners[3] },
    ];
  }

  private isStable(corners: CardCorners): boolean {
    if (!this.previousCorners || this.previousCorners.length !== 4) {
      return true;
    }

    let totalMovement = 0;
    for (let i = 0; i < 4; i++) {
      const dx = corners[i].x - this.previousCorners[i].x;
      const dy = corners[i].y - this.previousCorners[i].y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }

    return totalMovement / 4 <= this.maxCornerMovement;
  }

  resetAutoCapture(): void {
    this.hasCaptured = false;
    this.stableFrames = 0;
    this.previousCorners = null;
  }

  private resetStability(): void {
    this.stableFrames = 0;
    this.previousCorners = null;
  }

  get captureProgress(): number {
    return Math.max(0, Math.min(1, this.stableFrames / this.requiredStableFrames));
  }

  get isReadyToCapture(): boolean {
    return this.confidence >= this.captureConfidence && this.stableFrames >= this.requiredStableFrames;
  }

  get stableFrameCount(): number {
    return this.stableFrames;
  }

  get requiredFrames(): number {
    return this.requiredStableFrames;
  }

  setAutoCaptureCallback(callback: () => void | Promise<void>): void {
    this.onAutoCapture = callback;
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

  const confidence = detector.confidence;
  const isReady = detector.isReadyToCapture;
  const color = isReady ? '#00ff66' : confidence >= 0.9 ? '#ffff00' : '#ff4444';
  const percentage = Math.round(confidence * 100);
  const progress = detector.captureProgress;

  const centerX = corners.reduce((sum, point) => sum + point.x, 0) / 4;
  const centerY = corners.reduce((sum, point) => sum + point.y, 0) / 4;
  const points = corners.map((point) => `${point.x},${point.y}`).join(' ');

  let message: string;
  if (isReady) {
    message = 'CAPTURING...';
  } else if (confidence >= 0.9) {
    const remaining = Math.ceil((1 - progress) * 8);
    message = `HOLD STEADY  ${remaining}`;
  } else {
    message = `${percentage}% confidence`;
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <svg
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
        {corners.map((corner, index) => (
          <g key={index}>
            <circle cx={corner.x} cy={corner.y} r="14" fill="rgba(0,0,0,0.8)" />
            <circle cx={corner.x} cy={corner.y} r="8" fill={color} />
          </g>
        ))}
      </svg>

      <div
        style={{
          position: 'absolute',
          left: `${centerX / 10}%`,
          top: `${centerY / 10}%`,
          transform: 'translate(-50%, 30px)',
          background: 'rgba(0,0,0,0.75)',
          color: 'white',
          padding: '10px 14px',
          borderRadius: '8px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '20px',
          fontWeight: 700,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {message}
        {confidence >= 0.9 && !isReady && (
          <div
            style={{
              width: '180px',
              height: '6px',
              marginTop: '12px',
              background: 'rgba(255,255,255,0.25)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: '100%',
                background: '#00ff66',
                borderRadius: '4px',
                transition: 'width 100ms linear',
              }}
            />
          </div>
        )}
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
